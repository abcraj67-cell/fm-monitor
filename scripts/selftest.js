// Self-test: runs the monitor against a local mock of filemagics.com so the
// runner and report can be checked without touching the real site.
// One tool (compress-pdf) is made to fail on purpose to prove failures are caught.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TOOLS, PAGES } from '../src/tools.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fx = (f) => fs.readFileSync(path.join(ROOT, 'fixtures', f));
const OUTPUT = { pdf: ['sample.pdf', 'application/pdf'], docx: ['sample.docx', 'application/octet-stream'], xlsx: ['sample.xlsx', 'application/octet-stream'],
  pptx: ['sample.pptx', 'application/octet-stream'], png: ['sample.png', 'image/png'], jpg: ['sample.jpg', 'image/jpeg'], svg: ['sample.svg', 'image/svg+xml'], txt: ['sample.md', 'text/plain'] };

const toolPage = (t) => `<!doctype html><html><head><title>${t.name}</title></head><body>
<header><nav><button>PDF Tools</button></nav></header><main>
<h1>${t.name}</h1><input type="file" ${t.files.length > 1 ? 'multiple' : ''}>
${t.slug === 'rotate-pdf' ? '<button>90° Clockwise</button><button id="go">Rotate PDF</button>' :
  t.slug === 'extract-pages' ? '<button>Select all</button><input type="text" placeholder="e.g. 1,3,5-7"><button>Apply range</button><button id="go">Extract Pages</button>' :
  '<button id="go">Convert Now</button>'}
<div id="out"></div></main>
<script>
document.getElementById('go').onclick = async () => {
  const r = await fetch('/proxyApi//${t.slug}', { method: 'POST' });
  if (!r.ok) { document.getElementById('out').innerHTML = '<div role="alert" class="toast">Internal Server Error: please try again.</div>'; return; }
  const b = document.createElement('button'); b.textContent = 'Download File';
  b.onclick = () => { const a = document.createElement('a'); a.href = '/file/${t.slug}'; a.download = 'result.${t.expect[0]}'; a.click(); };
  document.getElementById('out').appendChild(b);
};
</script></body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const slug = url.pathname.split('/').filter(Boolean).pop() || '';
  const tool = TOOLS.find((t) => t.slug === slug);
  if (url.pathname.startsWith('/proxyApi')) { res.writeHead(slug === 'compress-pdf' ? 500 : 200, { 'content-type': 'application/json' }); return res.end('{}'); }
  if (url.pathname.startsWith('/file/') && tool) {
    const [f, ct] = OUTPUT[tool.expect[0]]; res.writeHead(200, { 'content-type': ct }); return res.end(fx(f));
  }
  if (tool) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(toolPage(tool)); }
  if (PAGES.some((p) => p.path === url.pathname)) {
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end(`<!doctype html><title>Mock ${url.pathname}</title><body>${'Free online PDF tools. '.repeat(20)}</body>`);
  }
  res.writeHead(404); res.end('nope');
});

server.listen(0, () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const child = spawn('node', ['src/run.js'], { cwd: ROOT, stdio: 'inherit',
    env: { ...process.env, BASE_URL: base, OUT_DIR: path.join(ROOT, 'selftest-report'), RETRIES: '0', TOOL_TIMEOUT_MS: '15000', FAIL_ON_ERROR: '0' } });
  child.on('exit', () => {
  server.close();
  const { summary } = JSON.parse(fs.readFileSync(path.join(ROOT, 'selftest-report', 'results.json'), 'utf8'));
  const ok = summary.failed === 1 && summary.failures[0].slug === 'compress-pdf';
  console.log(ok ? '\nSELFTEST OK – all mock features passed and the injected failure was caught.' : '\nSELFTEST FAILED', summary.failures);
  process.exit(ok ? 0 : 1);
  });
});
