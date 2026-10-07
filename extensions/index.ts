/**
 * usage-report — 记录每次模型调用的 token / 花费，`/usage-report` 生成自包含 HTML 报表并在浏览器打开。
 *
 * 数据本来就是 API 每次响应自带的（usage + PI 按目录价算出的 cost），本插件只做记账与展示：
 * - 记账：hook `message_end`，把每笔 assistant 消息追加到 ~/.pi/agent/extensions-data/usage-report/usage-YYYY-MM.jsonl
 * - 报表：读全部 JSONL，聚合后内嵌进单个 HTML（无 CDN、vanilla JS + SVG），支持时间范围切换 / 子代理过滤
 * - 维度：按模型、按仓库（cwd）、每日总用量趋势
 */
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildReportHtml, type UsageRecord } from "./report";

export const DATA_DIR = path.join(os.homedir(), ".pi", "agent", "extensions-data", "usage-report");
const SESSIONS_DIR = path.join(os.homedir(), ".pi", "agent", "sessions");
const MTIME_CACHE = path.join(DATA_DIR, "backfill-mtime.json");

function openInBrowser(target: string): void {
	const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
	try {
		spawn(cmd, [target], { detached: true, stdio: "ignore", shell: process.platform === "win32" }).unref();
	} catch {
		// 打不开浏览器时路径已在 notify 里，不阻塞
	}
}

let ledgerWriteFailed = false;

function ledgerFile(ts: number): string {
	const d = new Date(ts);
	const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
	return path.join(DATA_DIR, `usage-${month}.jsonl`);
}

function sessionId(): string {
	const id = process.env.PI_SESSION_ID;
	if (id) return id.slice(0, 8);
	const file = process.env.PI_SESSION_FILE;
	if (file) return path.basename(file).replace(/\.jsonl$/, "").slice(0, 8);
	return "unknown";
}

interface LedgerStats {
	added: number;
	dup: number;
	files: number;
	filesSkipped: number;
}

function recordFingerprint(rec: Pick<UsageRecord, "ts" | "provider" | "model" | "totalTokens" | "input" | "output">): string {
	return `fp:${rec.ts}|${rec.provider}/${rec.model}|${rec.totalTokens}|${rec.input}|${rec.output}`;
}

function ledgerKeys(): Set<string> {
	const seen = new Set<string>();
	if (!fs.existsSync(DATA_DIR)) return seen;
	for (const f of fs.readdirSync(DATA_DIR)) {
		if (!/^usage-\d{4}-\d{2}\.jsonl$/.test(f)) continue;
		for (const line of fs.readFileSync(path.join(DATA_DIR, f), "utf8").split("\n")) {
			if (!line.trim()) continue;
			try {
				const rec = JSON.parse(line) as UsageRecord;
				seen.add(rec.src ?? recordFingerprint(rec));
			} catch {
				// 损坏行不参与去重
			}
		}
	}
	return seen;
}

function listSessionFiles(): { path: string; sub: boolean }[] {
	const out: { path: string; sub: boolean }[] = [];
	if (!fs.existsSync(SESSIONS_DIR)) return out;
	const walk = (dir: string, depth: number): void => {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const e of entries) {
			if (e.isDirectory()) walk(path.join(dir, e.name), depth + 1);
			else if (e.isFile() && e.name.endsWith(".jsonl")) out.push({ path: path.join(dir, e.name), sub: depth > 1 });
		}
	};
	walk(SESSIONS_DIR, 0);
	return out;
}

interface SessionHeader {
	id: string;
	cwd: string;
}

function parseSessionLine(line: string): SessionHeader | null {
	try {
		const e = JSON.parse(line) as { type?: string; id?: string; cwd?: string };
		if (e.type === "session" && e.id && e.cwd) return { id: e.id, cwd: e.cwd };
	} catch {
		// 头行损坏按无头处理
	}
	return null;
}

function recordFromSessionEntry(
	header: SessionHeader,
	sub: boolean,
	entry: { type?: string; id?: string; timestamp?: string; message?: { role?: string; stopReason?: string; timestamp?: number; provider?: string; model?: string; usage?: { input: number; output: number; cacheRead: number; cacheWrite: number; totalTokens: number; reasoning?: number; cost?: { total?: number } } } },
): UsageRecord | null {
	const m = entry.message;
	if (!m || m.role !== "assistant") return null;
	if (!entry.id || !header.id) return null;
	if (m.stopReason === "error") return null;
	const u = m.usage;
	if (!u || !u.totalTokens) return null;
	return {
		v: 1,
		src: `${header.id}:${entry.id}`,
		ts: m.timestamp ?? (entry.timestamp ? Date.parse(entry.timestamp) : Date.now()),
		provider: m.provider ?? "unknown",
		model: m.model ?? "unknown",
		project: path.basename(header.cwd),
		cwd: header.cwd,
		session: header.id.slice(0, 8),
		sub,
		stop: m.stopReason ?? "unknown",
		input: u.input,
		output: u.output,
		cacheRead: u.cacheRead,
		cacheWrite: u.cacheWrite,
		reasoning: u.reasoning ?? 0,
		totalTokens: u.totalTokens,
		cost: u.cost?.total ?? 0,
	};
}

async function backfillLedger(): Promise<LedgerStats> {
	const stats: LedgerStats = { added: 0, dup: 0, files: 0, filesSkipped: 0 };
	const seen = ledgerKeys();
	let mtimeCache: Record<string, { m: number; s: number }> = {};
	try {
		mtimeCache = JSON.parse(fs.readFileSync(MTIME_CACHE, "utf8")) as Record<string, { m: number; s: number }>;
	} catch {
		mtimeCache = {};
	}
	const newCache: Record<string, { m: number; s: number }> = {};
	const pendingByMonth = new Map<string, UsageRecord[]>();
	const flushMonth = (file: string): void => {
		const recs = pendingByMonth.get(file);
		if (!recs || recs.length === 0) return;
		fs.appendFileSync(file, recs.map((r) => JSON.stringify(r)).join("\n") + "\n");
		pendingByMonth.delete(file);
	};

	for (const file of listSessionFiles()) {
		const st = await fs.promises.stat(file.path).catch(() => null);
		if (!st) continue;
		const prev = mtimeCache[file.path];
		if (prev && prev.m === st.mtimeMs && prev.s === st.size) {
			stats.filesSkipped++;
			newCache[file.path] = prev;
			continue;
		}
		const text = await fs.promises.readFile(file.path, "utf8").catch(() => null);
		if (text === null) continue;
		const nl = text.indexOf("\n");
		const header = parseSessionLine(nl < 0 ? text : text.slice(0, nl));
		if (!header) continue;
		stats.files++;
		for (const line of text.split("\n")) {
			if (!line.includes('"message"')) continue;
			let entry: Parameters<typeof recordFromSessionEntry>[2];
			try {
				entry = JSON.parse(line);
			} catch {
				continue;
			}
			if (!entry || entry.type !== "message") continue;
			const rec = recordFromSessionEntry(header, file.sub, entry);
			if (!rec || !rec.src) continue;
			if (seen.has(rec.src) || seen.has(recordFingerprint(rec))) {
				stats.dup++;
				continue;
			}
			seen.add(rec.src);
			seen.add(recordFingerprint(rec));
			const month = ledgerFile(rec.ts);
			const bucket = pendingByMonth.get(month);
			if (bucket) bucket.push(rec);
			else pendingByMonth.set(month, [rec]);
			stats.added++;
		}
		newCache[file.path] = { m: st.mtimeMs, s: st.size };
	}
	for (const file of pendingByMonth.keys()) flushMonth(file);
	const tmp = MTIME_CACHE + ".tmp";
	fs.writeFileSync(tmp, JSON.stringify(newCache));
	fs.renameSync(tmp, MTIME_CACHE);
	return stats;
}

function recordFromAssistantMessage(m: {
	stopReason: string;
	timestamp?: number;
	provider: string;
	model: string;
	usage?: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		totalTokens: number;
		reasoning?: number;
		cost?: { total?: number };
	};
}): UsageRecord | null {
	if (m.stopReason === "error") return null;
	const u = m.usage;
	if (!u || !u.totalTokens) return null;
	const cwd = process.cwd();
	return {
		v: 1,
		ts: m.timestamp ?? Date.now(),
		provider: m.provider,
		model: m.model,
		project: path.basename(cwd),
		cwd,
		session: sessionId(),
		sub: Boolean(process.env.PI_SUBAGENT_PARENT_SESSION),
		stop: m.stopReason,
		input: u.input,
		output: u.output,
		cacheRead: u.cacheRead,
		cacheWrite: u.cacheWrite,
		reasoning: u.reasoning ?? 0,
		totalTokens: u.totalTokens,
		cost: u.cost?.total ?? 0,
	};
}

function loadRecords(days: number | null): UsageRecord[] {
	const out: UsageRecord[] = [];
	if (!fs.existsSync(DATA_DIR)) return out;
	for (const f of fs.readdirSync(DATA_DIR)) {
		if (!/^usage-\d{4}-\d{2}\.jsonl$/.test(f)) continue;
		const text = fs.readFileSync(path.join(DATA_DIR, f), "utf8");
		for (const line of text.split("\n")) {
			if (!line.trim()) continue;
			try {
				const rec = JSON.parse(line) as UsageRecord;
				if (days === null || rec.ts >= Date.now() - days * 86_400_000) out.push(rec);
			} catch {
				// 单行损坏跳过，不影响整体
			}
		}
	}
	return out;
}

export default function (pi: ExtensionAPI) {
	fs.mkdirSync(DATA_DIR, { recursive: true });

	const appendRecord = (m: {
		stopReason: string;
		timestamp?: number;
		provider: string;
		model: string;
		usage?: {
			input: number;
			output: number;
			cacheRead: number;
			cacheWrite: number;
			totalTokens: number;
			reasoning?: number;
			cost?: { total?: number };
		};
	}): void => {
		const rec = recordFromAssistantMessage(m);
		if (!rec) return;
		try {
			fs.appendFileSync(ledgerFile(rec.ts), JSON.stringify(rec) + "\n");
		} catch (e) {
			if (!ledgerWriteFailed) {
				ledgerWriteFailed = true;
				console.error("[usage-report] 记账写入失败（本次进程内不再重试提示）:", e);
			}
		}
	};

	pi.on("message_end", (event) => {
		if (event.message.role !== "assistant") return;
		appendRecord(event.message);
	});

	pi.registerCommand("usage-report", {
		description: "生成各模型 / 各仓库用量 HTML 报表（参数：天数 | all | backfill 回填历史）",
		handler: async (args, ctx) => {
			const arg = args.trim();
			if (arg === "backfill") {
				ctx.ui.notify("扫描历史会话文件回填用量（首次可能要一两分钟）…", "info");
				const stats = await backfillLedger();
				ctx.ui.notify(
					`回填完成：新增 ${stats.added} 条（去重跳过 ${stats.dup} 条），扫描 ${stats.files} 个会话文件，未变更跳过 ${stats.filesSkipped} 个`,
					"info",
				);
				return;
			}
			let days: number | null = null;
			if (/^\d+$/.test(arg)) days = Number(arg);
			else if (arg && arg !== "all") {
				ctx.ui.notify(`参数只认天数、all 或 backfill，收到：${arg}`, "warning");
				return;
			}

			const records = loadRecords(days);

			if (records.length === 0) {
				ctx.ui.notify(days === null ? "还没有任何用量记录" : `最近 ${days} 天没有用量记录`, "warning");
				return;
			}

			const outPath = path.join(DATA_DIR, "usage-report.html");
			fs.writeFileSync(outPath, buildReportHtml(records, { days, generatedAt: Date.now() }), "utf8");
			ctx.ui.notify(`用量报表已生成：${outPath}（${records.length} 条记录）`, "info");
			openInBrowser(outPath);
		},
	});
}
