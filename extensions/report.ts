// HTML 报表模板：接收 UsageRecord[] 与元信息，输出自包含 HTML。
// 纯内联 SVG/JS 渲染，不依赖任何外部 CDN，可离线打开。

import { BRAND_ICONS } from "./icons";

export interface UsageRecord {
  v: 1;
  src?: string;
  ts: number;
  provider: string;
  model: string;
  project: string;
  cwd: string;
  session: string;
  sub: boolean;
  stop: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  reasoning: number;
  totalTokens: number;
  cost: number;
}

export interface ReportMeta {
  days: number | null;
  generatedAt: number;
}

export function buildReportHtml(records: UsageRecord[], meta: ReportMeta): string {
  const dataJson = JSON.stringify(records).replace(/</g, "\\u003c");
  const rangeLabel = meta.days ? `近 ${meta.days} 天` : "全部";
  const genAt = new Date(meta.generatedAt).toLocaleString("zh-CN", { hour12: false });
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>PI 用量报表</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root {
    --bg: #0d1117; --panel: #161b22; --border: #30363d; --text: #e6edf3;
    --dim: #8b949e; --accent: #58a6ff; --green: #3fb950; --orange: #d29922;
    --red: #f85149; --purple: #bc8cff;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font: 14px/1.6 -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; padding: 24px; }
  h1 { font-size: 22px; margin-bottom: 4px; display: flex; align-items: center; gap: 10px; }
  h1 .mark { flex: none; }
  h2 { font-size: 15px; margin: 26px 0 12px; color: var(--text); font-weight: 600; border-bottom: 1px solid var(--border); padding-bottom: 7px; }
  .meta { color: var(--dim); font-size: 12px; margin-bottom: 20px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin: 16px 0; }
  .card { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; transition: border-color .15s ease-out; }
  .card:hover { border-color: #58a6ff66; }
  .card .k { color: var(--dim); font-size: 12px; }
  .card .v { font-size: 22px; font-weight: 600; margin-top: 4px; font-variant-numeric: tabular-nums; }
  svg .grid { stroke: var(--border); stroke-width: 1; }
  svg .axis { stroke: var(--border); stroke-width: 1; }
  svg .tick { font-size: 9px; }
  svg .area { opacity: .12; }
  .panel { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 16px; overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: right; padding: 6px 10px; border-bottom: 1px solid var(--border); white-space: nowrap; font-variant-numeric: tabular-nums; }
  th:first-child, td:first-child { text-align: left; }
  th { color: var(--dim); font-weight: 500; position: sticky; top: 0; background: var(--panel); }
  tr:hover td { background: #1c2129; }
  td .icon { vertical-align: -5px; margin-right: 7px; }
  td .icon.brand { display: inline-block; width: 18px; height: 18px; background: #fff; border-radius: 4px; padding: 2px; }
  td .icon.brand svg { display: block; width: 100%; height: 100%; }
  .bar-wrap { display: flex; align-items: center; gap: 8px; }
  .bar { height: 8px; border-radius: 4px; background: var(--accent); min-width: 1px; }
  .range-bar { display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; align-items: center; }
  .range-bar button { background: var(--panel); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 5px 14px; cursor: pointer; font-size: 13px; }
  .range-bar button.active { background: var(--accent); color: #0d1117; border-color: var(--accent); font-weight: 600; }
  .filters { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; color: var(--dim); font-size: 13px; }
  .filters select { background: var(--panel); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 5px 10px; font-size: 13px; max-width: 260px; }
  .filters select:focus { outline: 1px solid var(--accent); }
  .foot { color: var(--dim); font-size: 12px; margin-top: 24px; }
  svg text { fill: var(--dim); font-size: 10px; }
  .legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: var(--dim); margin-top: 8px; }
  .legend span::before { content: ""; display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 5px; background: var(--c); }
</style>
</head>
<body>
  <h1><svg class="mark" width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="2" y="9" width="4" height="9" rx="1" fill="#58a6ff"/><rect x="8" y="5" width="4" height="13" rx="1" fill="#3fb950"/><rect x="14" y="2" width="4" height="16" rx="1" fill="#d29922"/></svg>PI 用量报表</h1>
  <div class="meta">生成时间：${genAt} · 默认范围：${rangeLabel} · 每 10 分钟自动刷新 · 数据来源：~/.pi/agent/extensions-data/usage-report/</div>
  <div class="range-bar" id="rangeBar"></div>
  <div class="filters">
    <label>仓库 <select id="fProject"><option value="">全部仓库</option></select></label>
    <label>模型 <select id="fModel"><option value="">全部模型</option></select></label>
  </div>
  <div class="cards" id="kpis"></div>
  <h2 id="costH2">每日花费（按模型）</h2>
  <div class="panel"><div id="costChart"></div><div class="legend" id="costLegend"></div></div>
  <h2 id="tokenH2">每日 Token 用量</h2>
  <div class="panel"><div id="tokenChart"></div><div class="legend" id="tokenLegend"></div></div>
  <h2>按模型汇总</h2>
  <div class="panel"><table id="modelTable"><thead><tr>
    <th>模型</th><th>花费 (USD)</th><th>请求数</th><th>输入</th><th>输出</th><th>缓存读</th><th>推理</th><th>总 Token</th><th style="width:30%">占比</th>
  </tr></thead><tbody></tbody></table></div>
  <h2>按仓库汇总</h2>
  <div class="panel"><table id="projectTable"><thead><tr>
    <th>仓库 / 目录</th><th>花费 (USD)</th><th>请求数</th><th>总 Token</th><th>子代理占比</th><th style="width:30%">占比</th>
  </tr></thead><tbody></tbody></table></div>
  <div class="foot" id="footNote"></div>
  <script type="application/json" id="data">${dataJson}</script>
  <script>
  (() => {
    const RAW = JSON.parse(document.getElementById('data').textContent);
    const BRAND_ICONS = ${JSON.stringify(BRAND_ICONS)};
    const ONLY_SUB = new URLSearchParams(location.search).has('sub');
    const DAYS_OPTIONS = [1, 7, 30, 90, null];
    const DAY_LABELS = { 1: '今日', 7: '7 天', 30: '30 天', 90: '90 天' };
    let DAYS = ${meta.days === null ? "null" : meta.days};
    let F_PROJECT = '', F_MODEL = '';
    try {
      const saved = JSON.parse(sessionStorage.getItem('pi-usage-report') || 'null');
      if (saved && DAYS_OPTIONS.indexOf(saved.DAYS) >= 0) DAYS = saved.DAYS;
      if (saved && typeof saved.FP === 'string') F_PROJECT = saved.FP;
      if (saved && typeof saved.FM === 'string') F_MODEL = saved.FM;
    } catch {}
    function saveFilters() {
      try { sessionStorage.setItem('pi-usage-report', JSON.stringify({ DAYS: DAYS, FP: F_PROJECT, FM: F_MODEL })); } catch {}
    }

    const fmtInt = n => n.toLocaleString('en-US');
    const fmtTok = n => n >= 1e9 ? (n/1e9).toFixed(2)+'B' : n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : String(n);
    const fmtCost = n => '$' + (n >= 100 ? n.toFixed(0) : n.toFixed(2));

    // ---- 模型图标：品牌 SVG（icons.ts）+ 白色圆角底片，未知厂商用字母块兜底 ----
    const LETTER_COLORS = { cursor: '#000000', other: '#8b949e' };
    function iconKey(full) {
      const m = full.toLowerCase();
      const model = m.split('/').pop() || m;
      if (/composer/.test(model)) return 'cursor';
      if (/mimo/.test(model)) return 'mimo';
      if (/gpt|codex|^o[134]|openai/.test(model)) return 'openai';
      if (/claude|anthropic/.test(model)) return 'anthropic';
      if (/gemini|palm|bard/.test(model)) return 'google';
      if (/deepseek/.test(model)) return 'deepseek';
      if (/grok/.test(model) || /xai|x-ai/.test(m)) return 'xai';
      if (/kimi|moonshot/.test(model)) return 'moonshot';
      if (/qwen|tongyi/.test(model)) return 'qwen';
      if (/glm|chatglm|zhipu/.test(model) || /zai-org/.test(m)) return 'zhipu';
      if (/cursor/.test(m)) return 'cursor';
      return 'other';
    }
    function uniqSvg(svg) {
      const u = 'g' + Math.random().toString(36).slice(2, 8);
      return svg.split('id="').join('id="' + u + '-').split('url(#').join('url(#' + u + '-');
    }
    function iconSvg(model) {
      const k = iconKey(model);
      const brand = BRAND_ICONS[k];
      if (brand) return '<span class="icon brand" style="background:' + (brand[2] || '#fff') + '">' + uniqSvg(brand[0]) + '</span>';
      const c = LETTER_COLORS[k] || LETTER_COLORS.other;
      const t = (model.split('/').pop() || '?').charAt(0).toUpperCase();
      return '<svg class="icon" width="18" height="18" viewBox="0 0 16 16"><rect width="16" height="16" rx="4" fill="' + c + '"/><text x="8" y="12" font-size="9.5" font-weight="700" text-anchor="middle" fill="#fff">' + t + '</text></svg>';
    }

    // ---- 范围按钮 ----
    const bar = document.getElementById('rangeBar');
    DAYS_OPTIONS.forEach(d => {
      const b = document.createElement('button');
      b.textContent = d === null ? '全部' : DAY_LABELS[d];
      if (d === DAYS) b.className = 'active';
      b.onclick = () => { DAYS = d; bar.querySelectorAll('button').forEach(x => x.className = ''); b.className = 'active'; saveFilters(); renderAll(); };
      bar.appendChild(b);
    });

    // ---- 筛选下拉 ----
    const modelKeyOf = r => r.provider + '/' + r.model;
    const projects = [...new Set(RAW.map(r => r.project))].sort();
    const modelKeys = [...new Set(RAW.map(modelKeyOf))].sort();
    const selP = document.getElementById('fProject'), selM = document.getElementById('fModel');
    projects.forEach(p => selP.add(new Option(p, p)));
    modelKeys.forEach(k => selM.add(new Option(k, k)));
    selP.value = F_PROJECT; selM.value = F_MODEL;
    selP.onchange = () => { F_PROJECT = selP.value; saveFilters(); renderAll(); };
    selM.onchange = () => { F_MODEL = selM.value; saveFilters(); renderAll(); };

    function filtered() {
      let cut = null;
      if (DAYS === 1) { const d = new Date(); d.setHours(0, 0, 0, 0); cut = d.getTime(); }
      else if (DAYS) cut = Date.now() - DAYS * 864e5;
      return RAW.filter(r =>
        (!ONLY_SUB || r.sub) &&
        (!cut || r.ts >= cut) &&
        (!F_PROJECT || r.project === F_PROJECT) &&
        (!F_MODEL || modelKeyOf(r) === F_MODEL));
    }

    function aggregate(rows) {
      const byDay = new Map(), byModel = new Map(), byProject = new Map();
      let cost = 0, tokens = 0, cacheRead = 0, subReq = 0;
      for (const r of rows) {
        const day = localDayKey(r.ts);
        const mk = modelKeyOf(r);
        const bump = (m, k, f) => { const o = m.get(k) || { cost: 0, tokens: 0, cacheRead: 0, input: 0, output: 0, reasoning: 0, reqs: 0, sub: 0 }; f(o); m.set(k, o); };
        bump(byDay, day, o => { o.cost += r.cost; o.tokens += r.totalTokens; o.cacheRead += r.cacheRead; o.input += r.input; o.output += r.output; });
        bump(byModel, mk, o => { o.cost += r.cost; o.tokens += r.totalTokens; o.input += r.input; o.output += r.output; o.cacheRead += r.cacheRead; o.reasoning += r.reasoning; o.reqs++; });
        bump(byProject, r.project, o => { o.cost += r.cost; o.tokens += r.totalTokens; o.reqs++; if (r.sub) o.sub++; });
        cost += r.cost; tokens += r.totalTokens; cacheRead += r.cacheRead; if (r.sub) subReq++;
      }
      return { byDay, byModel, byProject, cost, tokens, cacheRead, reqs: rows.length, subReq, sessions: new Set(rows.map(r => r.session)).size };
    }

    const PALETTE = ['#58a6ff', '#3fb950', '#d29922', '#f85149', '#bc8cff', '#39c5cf', '#ff7b72', '#7ee787', '#ffa657', '#a5d6ff'];
    const colorOf = i => PALETTE[i % PALETTE.length];

    function renderCards(agg) {
      const cards = [
        ['总花费（目录价）', fmtCost(agg.cost)],
        ['请求数', fmtInt(agg.reqs)],
        ['新增 Token（输入+输出+写缓存）', fmtTok(agg.tokens)],
        ['缓存命中 Token', fmtTok(agg.cacheRead)],
        ['会话数', fmtInt(agg.sessions)],
        ['仓库 / 模型数', agg.byProject.size + ' / ' + agg.byModel.size],
        ['子代理请求占比', agg.reqs ? (agg.subReq / agg.reqs * 100).toFixed(1) + '%' : '—'],
      ];
      document.getElementById('kpis').innerHTML = cards.map(c => '<div class="card"><div class="k">' + c[0] + '</div><div class="v">' + c[1] + '</div></div>').join('');
    }

    function chartFrame(days, maxV, H, left, fmt) {
      let parts = [];
      for (let g = 1; g <= 4; g++) { const y = (H - 24) - (H - 50) * g / 4; parts.push('<line class="grid" x1="' + left + '" y1="' + y + '" x2="100%" y2="' + y + '"/>'); }
      for (let g = 0; g <= 4; g++) { const y = (H - 24) - (H - 50) * g / 4; parts.push('<text class="tick" x="' + (left - 6) + '" y="' + (y + 3) + '" text-anchor="end">' + fmt(maxV * g / 4) + '</text>'); }
      parts.push('<line class="axis" x1="' + left + '" y1="' + (H - 24) + '" x2="100%" y2="' + (H - 24) + '"/>');
      return parts;
    }

    function renderStack(elId, legendId, byDay, topKeys, pick) {
      const days = [...byDay.keys()].sort();
      const perDay = new Map();
      for (const [day, o] of byDay) {
        const rows = o.rows || o;
        const mm = new Map();
        for (const r of rows) { const k = pick(r); mm.set(k, (mm.get(k) || 0) + r[pick.metric]); }
        perDay.set(day, mm);
      }
      const maxV = Math.max(1, ...days.map(d => topKeys.reduce((s, k) => s + (perDay.get(d).get(k) || 0), 0)));
      const W = Math.max(560, days.length * 28 + 70), H = 230, L = 56;
      const bw = Math.min(16, (W - L - 14) / Math.max(1, days.length) - 7);
      let x = L, parts = ['<svg width="' + W + '" height="' + H + '">'];
      parts = parts.concat(chartFrame(days, maxV, H, L, fmtCost));
      for (const d of days) {
        let y = H - 24;
        const segs = [];
        for (let i = 0; i < topKeys.length; i++) {
          const v = (perDay.get(d).get(topKeys[i]) || 0);
          if (v > 0) { const h = v / maxV * (H - 50); y -= h; segs.push([y, h, i]); }
        }
        segs.forEach(([sy, sh, i], idx) => {
          const top = idx === segs.length - 1;
          parts.push('<rect x="' + x + '" y="' + sy + '" width="' + bw + '" height="' + sh + '" rx="' + (top ? 2.5 : 0) + '" fill="' + colorOf(i) + '"><title>' + d + ' ' + topKeys[i] + '</title></rect>');
        });
        if (days.length <= 45 || Math.round(x) % Math.ceil(days.length / 40) < 1) parts.push('<text class="tick" x="' + (x + bw / 2) + '" y="' + (H - 7) + '" text-anchor="middle" transform="rotate(-35 ' + (x + bw / 2) + ' ' + (H - 7) + ')">' + (d.length > 6 ? d.slice(5) : d) + '</text>');
        x += bw + 7;
      }
      parts.push('</svg>');
      document.getElementById(elId).innerHTML = parts.join('');
      document.getElementById(legendId).innerHTML = topKeys.map((k, i) => '<span style="--c:' + colorOf(i) + '">' + k + '</span>').join('');
    }

    function renderLine(elId, legendId, byDay, series) {
      const days = [...byDay.keys()].sort();
      const perDay = new Map();
      for (const [day, o] of byDay) { const rows = o.rows || o; const mm = new Map(); for (const r of rows) for (const s of series) mm.set(s.key, (mm.get(s.key) || 0) + r[s.field]); perDay.set(day, mm); }
      const maxV = Math.max(1, ...days.flatMap(d => series.map(s => perDay.get(d).get(s.key) || 0)));
      const W = Math.max(560, days.length * 28 + 70), H = 230, L = 56;
      const step = (W - L - 14) / Math.max(1, days.length - 1);
      let parts = ['<svg width="' + W + '" height="' + H + '">'];
      parts = parts.concat(chartFrame(days, maxV, H, L, fmtTok));
      series.forEach((s, si) => {
        const pts = days.map((d, i) => [L + i * step, H - 24 - (perDay.get(d).get(s.key) || 0) / maxV * (H - 50)]);
        if (si === 0 && days.length > 1) {
          const a = pts.map(p => p[0] + ',' + p[1]).join(' L');
          parts.push('<path class="area" d="M' + a + ' L' + pts[pts.length - 1][0] + ',' + (H - 24) + ' L' + L + ',' + (H - 24) + ' Z" fill="' + colorOf(si) + '"/>');
        }
        parts.push('<polyline points="' + pts.map(p => p[0] + ',' + p[1]).join(' ') + '" fill="none" stroke="' + colorOf(si) + '" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>');
        pts.forEach((p, i) => parts.push('<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2" fill="' + colorOf(si) + '"><title>' + days[i] + ' ' + s.key + '</title></circle>'));
      });
      days.forEach((d, i) => { if (days.length <= 45 || i % Math.ceil(days.length / 40) < 1) parts.push('<text class="tick" x="' + (L + i * step) + '" y="' + (H - 7) + '" text-anchor="middle" transform="rotate(-35 ' + (L + i * step) + ' ' + (H - 7) + ')">' + (d.length > 6 ? d.slice(5) : d) + '</text>'); });
      parts.push('</svg>');
      document.getElementById(elId).innerHTML = parts.join('');
      document.getElementById(legendId).innerHTML = series.map((s, i) => '<span style="--c:' + colorOf(i) + '">' + s.key + '</span>').join('');
    }

    function barCell(frac, color) {
      return '<div class="bar-wrap"><div class="bar" style="width:' + Math.max(0.5, frac * 100) + '%;background:' + color + '"></div></div>';
    }

    function renderModelTable(byModel, totalCost) {
      const rows = [...byModel.entries()].sort((a, b) => b[1].cost - a[1].cost).slice(0, 30);
      const tb = document.querySelector('#modelTable tbody');
      tb.innerHTML = rows.map(([k, o], i) => '<tr><td>' + iconSvg(k) + k + '</td><td>' + fmtCost(o.cost) + '</td><td>' + fmtInt(o.reqs) + '</td><td>' + fmtTok(o.input) + '</td><td>' + fmtTok(o.output) + '</td><td>' + fmtTok(o.cacheRead) + '</td><td>' + fmtTok(o.reasoning) + '</td><td>' + fmtTok(o.tokens) + '</td><td>' + barCell(o.cost / Math.max(1e-9, totalCost), colorOf(i)) + '</td></tr>').join('');
    }

    function renderProjectTable(byProject, totalCost) {
      const rows = [...byProject.entries()].sort((a, b) => b[1].cost - a[1].cost).slice(0, 30);
      const tb = document.querySelector('#projectTable tbody');
      tb.innerHTML = rows.map(([k, o], i) => '<tr><td><svg class="icon" width="15" height="15" viewBox="0 0 16 16" fill="#8b949e" style="vertical-align:-2px;margin-right:8px"><path d="M1.5 3.5a1 1 0 0 1 1-1h4l2 2h5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-9z"/></svg>' + k + '</td><td>' + fmtCost(o.cost) + '</td><td>' + fmtInt(o.reqs) + '</td><td>' + fmtTok(o.tokens) + '</td><td>' + (o.reqs ? (o.sub / o.reqs * 100).toFixed(0) + '%' : '—') + '</td><td>' + barCell(o.cost / Math.max(1e-9, totalCost), colorOf(i)) + '</td></tr>').join('');
    }

    function localDayKey(t) { const d = new Date(t); const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }

    function renderAll() {
      const rows = filtered();
      const agg = aggregate(rows);
      renderCards(agg);
      const hourly = DAYS === 1;
      document.getElementById('costH2').textContent = hourly ? '逐小时花费（按模型）' : '每日花费（按模型）';
      document.getElementById('tokenH2').textContent = hourly ? '逐小时 Token 用量' : '每日 Token 用量';
      const byDayRows = new Map();
      if (hourly) for (let h = 0; h < 24; h++) byDayRows.set(String(h).padStart(2, '0') + ':00', []);
      for (const r of rows) {
        const key = hourly ? String(new Date(r.ts).getHours()).padStart(2, '0') + ':00' : localDayKey(r.ts);
        if (!byDayRows.has(key)) byDayRows.set(key, []);
        byDayRows.get(key).push(r);
      }
      const topModels = [...agg.byModel.entries()].sort((a, b) => b[1].cost - a[1].cost).slice(0, 8).map(e => e[0]);
      const pickM = r => modelKeyOf(r); pickM.metric = 'cost';
      renderStack('costChart', 'costLegend', byDayRows, topModels, pickM);
      renderLine('tokenChart', 'tokenLegend', byDayRows, [
        { key: '输入', field: 'input' }, { key: '输出', field: 'output' }, { key: '缓存读', field: 'cacheRead' },
      ]);
      renderModelTable(agg.byModel, agg.cost);
      renderProjectTable(agg.byProject, agg.cost);
      const rangeName = DAYS === null ? '全部' : (DAYS === 1 ? '今日' : '近 ' + DAYS + ' 天');
      const scope = rangeName + (F_PROJECT ? ' · ' + F_PROJECT : '') + (F_MODEL ? ' · ' + F_MODEL : '');
      document.getElementById('footNote').textContent = scope + '：' + fmtInt(agg.reqs) + ' 次请求，' + agg.sessions + ' 个会话。加 ?sub 只看子代理用量。模型花费按 PI 模型目录价计算，仅供参考；订阅用户以额度为准。';
    }

    renderAll();
    setTimeout(function(){ location.reload(); }, 600000);
  })();
  </script>
</body>
</html>
`;
}
