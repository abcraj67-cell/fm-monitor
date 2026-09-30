import fs from 'node:fs';
import path from 'node:path';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const IST = (d) => new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

export function writeReports({ results, startedAt, finishedAt, baseUrl, outDir }) {
  fs.mkdirSync(outDir, { recursive: true });
  const total = results.length;
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = total - passed;
  const summary = { date: startedAt.toISOString(), baseUrl, total, passed, failed,
    durationSec: Math.round((finishedAt - startedAt) / 1000),
    failures: results.filter((r) => r.status !== 'PASS').map((r) => ({ slug: r.slug, name: r.name, stage: r.stage, message: r.message })) };

  // History (kept across runs; CI restores the previous history.json before running)
  const histFile = path.join(outDir, 'history.json');
  let history = [];
  try { history = JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch {}
  history.push({ date: summary.date, total, passed, failed,
    status: Object.fromEntries(results.map((r) => [r.slug, r.status])) });
  history = history.slice(-60);

  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify({ summary, results }, null, 2));
  fs.writeFileSync(histFile, JSON.stringify(history, null, 2));
  fs.writeFileSync(path.join(outDir, 'summary.md'), markdown(summary, results));
  fs.writeFileSync(path.join(outDir, 'index.html'), html(summary, results, history));
  return summary;
}

function markdown(s, results) {
  const icon = s.failed ? '🔴' : '🟢';
  let md = `## ${icon} FileMagics daily check — ${IST(s.date)} IST\n\n`;
  md += `**${s.passed}/${s.total} checks passed** · ${s.failed} failed · run took ${s.durationSec}s\n\n`;
  if (s.failed) {
    md += `### Failing features\n\n| Feature | Stage | Error |\n|---|---|---|\n`;
    for (const f of s.failures) md += `| [${f.name}](${s.baseUrl}${f.slug.startsWith('/') ? f.slug : '/' + f.slug}) | ${f.stage || '-'} | ${String(f.message).replace(/\|/g, '/')} |\n`;
    md += '\n';
  }
  md += `<details><summary>All results</summary>\n\n| Feature | Status | Time | Details |\n|---|---|---|---|\n`;
  for (const r of results) md += `| ${r.name} | ${r.status === 'PASS' ? '✅' : '❌'}${r.flaky ? ' (retry)' : ''} | ${((r.durationMs || 0) / 1000).toFixed(1)}s | ${String(r.message).replace(/\|/g, '/')} |\n`;
  md += `\n</details>\n`;
  return md;
}

function html(s, results, history) {
  const groups = [...new Set(results.map((r) => r.group))];
  const last = history.slice(-14);
  const rows = (g) => results.filter((r) => r.group === g).map((r) => {
    const trend = last.map((h) => {
      const st = h.status?.[r.slug];
      return `<i class="dot ${st === 'PASS' ? 'ok' : st ? 'bad' : 'na'}" title="${esc(IST(h.date))}: ${st || 'n/a'}"></i>`;
    }).join('');
    const api = (r.api || []).map((a) => `${esc(a.endpoint)} → ${a.status} (${(a.ms / 1000).toFixed(1)}s)`).join('<br>');
    const extra = [api, r.consoleErrors?.length ? `${r.consoleErrors.length} JS error(s): ${esc(r.consoleErrors[0])}` : '', r.screenshot ? `<a href="${esc(r.screenshot)}">screenshot</a>` : '']
      .filter(Boolean).join('<br>');
    return `<tr class="${r.status === 'PASS' ? '' : 'failrow'}">
      <td><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a></td>
      <td><span class="pill ${r.status === 'PASS' ? 'ok' : 'bad'}">${r.status}${r.flaky ? ' · retry' : ''}</span></td>
      <td class="num">${((r.durationMs || 0) / 1000).toFixed(1)}s</td>
      <td>${esc(r.message)}${r.status !== 'PASS' && r.stage ? ` <span class="muted">(${esc(r.stage)})</span>` : ''}${extra ? `<div class="muted small">${extra}</div>` : ''}</td>
      <td class="trend">${trend}</td></tr>`;
  }).join('');

  const bars = history.slice(-30).map((h) => {
    const pct = h.total ? h.passed / h.total : 0;
    return `<div class="bar" title="${esc(IST(h.date))}: ${h.passed}/${h.total}"><div style="height:${Math.max(4, pct * 100)}%" class="${h.failed ? 'bad' : 'ok'}"></div></div>`;
  }).join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FileMagics Health Report</title>
<style>
:root{--bg:#f7f8fa;--card:#fff;--fg:#1c2330;--muted:#6b7280;--line:#e5e7eb;--ok:#1f9d55;--okbg:#e6f6ec;--bad:#d64545;--badbg:#fdecec;--na:#d1d5db}
@media (prefers-color-scheme:dark){:root{--bg:#0f141b;--card:#171e27;--fg:#e6e9ee;--muted:#9aa3af;--line:#27313d;--ok:#3ecf7a;--okbg:#12311f;--bad:#ff6b6b;--badbg:#3a1717;--na:#3a4553}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.wrap{max-width:1100px;margin:0 auto;padding:24px 16px}h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:28px 0 8px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.muted{color:var(--muted)}.small{font-size:12px;margin-top:4px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:18px 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px}.card b{display:block;font-size:26px}
.card.ok b{color:var(--ok)}.card.bad b{color:var(--bad)}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:12px;color:var(--muted);font-weight:600}
tr.failrow{background:var(--badbg)}.num{white-space:nowrap;font-variant-numeric:tabular-nums}a{color:inherit}
.pill{font-size:12px;font-weight:600;padding:2px 8px;border-radius:99px;white-space:nowrap}.pill.ok{background:var(--okbg);color:var(--ok)}.pill.bad{background:var(--bad);color:#fff}
.trend{white-space:nowrap}.dot{display:inline-block;width:8px;height:14px;border-radius:2px;margin-right:2px}.dot.ok{background:var(--ok)}.dot.bad{background:var(--bad)}.dot.na{background:var(--na)}
.bars{display:flex;gap:3px;align-items:flex-end;height:60px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px}
.bar{flex:1;height:100%;display:flex;align-items:flex-end}.bar div{width:100%;border-radius:2px}.bar .ok{background:var(--ok)}.bar .bad{background:var(--bad)}
.scroll{overflow-x:auto}
</style></head><body><div class="wrap">
<h1>${s.failed ? '🔴' : '🟢'} FileMagics Health Report</h1>
<div class="muted">${esc(s.baseUrl)} · run on ${esc(IST(s.date))} IST · took ${s.durationSec}s</div>
<div class="cards">
 <div class="card"><span class="muted">Checks</span><b>${s.total}</b></div>
 <div class="card ok"><span class="muted">Passed</span><b>${s.passed}</b></div>
 <div class="card ${s.failed ? 'bad' : ''}"><span class="muted">Failed</span><b>${s.failed}</b></div>
 <div class="card"><span class="muted">Pass rate</span><b>${s.total ? Math.round((s.passed / s.total) * 100) : 0}%</b></div>
</div>
${history.length > 1 ? `<h2>Last ${Math.min(30, history.length)} runs</h2><div class="bars">${bars}</div>` : ''}
${groups.map((g) => `<h2>${esc(g)}</h2><div class="scroll"><table><thead><tr><th>Feature</th><th>Status</th><th>Time</th><th>Details</th><th>Last 14 days</th></tr></thead><tbody>${rows(g)}</tbody></table></div>`).join('')}
<p class="muted small">Each tool is tested end-to-end: open page → upload sample file → run conversion → download result → verify the file type. Failures are retried once before being reported.</p>
</div></body></html>`;
}
