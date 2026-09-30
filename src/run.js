// FileMagics daily feature monitor.
// Opens every tool page in a real browser, uploads a sample file, runs the
// conversion, downloads the result and checks that it is a valid file.
//
//   node src/run.js                  # test everything
//   ONLY=merge-pdf,pdf-to-text node src/run.js
//   HEADED=1 node src/run.js         # watch it run

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { BASE_URL, TOOLS, PAGES } from './tools.js';
import { validateOutput } from './validate.js';
import { writeReports } from './report.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = path.join(ROOT, 'fixtures');
const OUT = path.resolve(process.env.OUT_DIR || path.join(ROOT, 'report'));
const RUN_DIR = path.join(OUT, 'artifacts');
const RETRIES = Number(process.env.RETRIES ?? 1);
const DEFAULT_TIMEOUT = Number(process.env.TOOL_TIMEOUT_MS || 120000);
const ONLY = (process.env.ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);

const ACTION_RE = /(convert|merge|compress|rotate|extract|remove|delete|organi[sz]e|repair|ocr|crop|number|enhance|apply|save|process|create|start|generate|download)/i;
const NOT_ACTION_RE = /(select all|deselect|apply range|single language|multi-language|take a photo|english|tools|clockwise|upside|all tools|blog|cancel|close|×)/i;
const ERROR_RE = /(error|failed|failure|invalid|not found|went wrong|try again|unable|too large|unsupported)/i;

fs.mkdirSync(RUN_DIR, { recursive: true });

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function visibleButtons(page) {
  // Buttons/links outside the site header, with their text.
  return page.$$eval('button, a[role=button], a.btn, input[type=submit]', (els) =>
    els
      .map((el, i) => {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const inHeader = !!el.closest('header, nav, .navbar, footer');
        return {
          i,
          text: (el.innerText || el.value || '').replace(/\s+/g, ' ').trim(),
          visible: r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none',
          disabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
          inHeader,
        };
      })
      .filter((b) => b.visible && !b.inHeader && b.text),
  );
}

async function clickByText(page, re) {
  const btns = await visibleButtons(page);
  const hit = btns.find((b) => re.test(b.text) && !b.disabled);
  if (!hit) return null;
  const handles = await page.$$('button, a[role=button], a.btn, input[type=submit]');
  await handles[hit.i].click();
  return hit.text;
}

async function findErrorText(page) {
  return page.evaluate((src) => {
    const re = new RegExp(src, 'i');
    const sel = '[role=alert], [class*="toast"], [class*="Toast"], .alert-danger, .text-danger, [class*="error"]';
    for (const el of document.querySelectorAll(sel)) {
      const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
      const r = el.getBoundingClientRect();
      if (t && r.width > 0 && r.height > 0 && re.test(t)) return t.slice(0, 200);
    }
    return null;
  }, ERROR_RE.source);
}

async function runPrep(page, steps = [], notes) {
  for (const step of steps) {
    if (step.click) {
      const clicked = await clickByText(page, step.click);
      if (!clicked && !step.optional) notes.push(`prep: button ${step.click} not found`);
    }
    if (step.range) {
      const input = await page.$('input[type=text][placeholder*="e.g" i], input[placeholder*="1,3" i], input[placeholder*="range" i]');
      if (input) {
        await input.fill(step.range);
        await clickByText(page, /^apply range$/i);
      }
    }
    await page.waitForTimeout(600);
  }
}

async function testTool(browser, tool, attempt) {
  const started = Date.now();
  const r = { kind: 'tool', slug: tool.slug, name: tool.name, group: tool.group, url: `${BASE_URL}/${tool.slug}`,
    status: 'FAIL', stage: 'page_load', message: '', attempt, api: [], consoleErrors: [], notes: [] };
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', (e) => r.consoleErrors.push(String(e.message).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error' && !/google|doubleclick|adsbygoogle|gtag|favicon/i.test(m.text())) r.consoleErrors.push(m.text().slice(0, 200)); });
  const apiStart = new Map();
  page.on('request', (req) => { if (/\/proxyApi\//.test(req.url())) apiStart.set(req, Date.now()); });
  page.on('response', (res) => {
    const req = res.request();
    if (apiStart.has(req)) r.api.push({ endpoint: new URL(res.url()).pathname.replace(/\/+/g, '/'), status: res.status(), ms: Date.now() - apiStart.get(req) });
  });
  const popups = [];
  context.on('page', (p) => popups.push(p));

  let download = null;
  page.on('download', (d) => { download = d; });

  try {
    // 1. Page loads
    const t0 = Date.now();
    const resp = await page.goto(r.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    r.loadMs = Date.now() - t0;
    r.httpStatus = resp?.status();
    if (!resp || resp.status() >= 400) throw new Error(`Page returned HTTP ${resp?.status()}`);

    // 2. Upload
    r.stage = 'upload';
    const input = page.locator('input[type=file]').first();
    await input.waitFor({ state: 'attached', timeout: 30000 });
    await input.setInputFiles(tool.files.map((f) => path.join(FIXTURES, f)));
    await page.waitForTimeout(2500);
    const uploadErr = await findErrorText(page);
    if (uploadErr) throw new Error(`Error after upload: ${uploadErr}`);

    if (tool.smoke) {
      r.status = 'PASS';
      r.stage = 'done';
      r.message = 'Smoke check: page loaded and accepted the upload (interactive tool, no conversion run)';
      return r;
    }

    // 3. Tool-specific options, then the main action
    r.stage = 'processing';
    await runPrep(page, tool.prep, r.notes);
    let clicked = null;
    if (!download) {
      if (tool.action) clicked = await clickByText(page, tool.action);
      if (!clicked) {
        const btns = await visibleButtons(page);
        const cand = btns.find((b) => ACTION_RE.test(b.text) && !NOT_ACTION_RE.test(b.text) && !b.disabled);
        if (cand) {
          const handles = await page.$$('button, a[role=button], a.btn, input[type=submit]');
          await handles[cand.i].click();
          clicked = cand.text;
        }
      }
      if (clicked) r.notes.push(`clicked "${clicked}"`);
    }

    // 4. Wait for a result: download, "Download" button, a new tab, or an error
    const timeout = tool.timeoutMs || DEFAULT_TIMEOUT;
    const deadline = Date.now() + timeout;
    let clickedDownload = false;
    while (!download && Date.now() < deadline) {
      await page.waitForTimeout(1000);
      const failedApi = r.api.find((a) => a.status >= 400);
      const errText = await findErrorText(page);
      if (errText) throw new Error(errText);
      if (failedApi) throw new Error(`API ${failedApi.endpoint} returned HTTP ${failedApi.status}`);
      if (!clickedDownload) {
        const dl = await clickByText(page, /download/i);
        if (dl) { clickedDownload = true; r.notes.push(`clicked "${dl}"`); r.stage = 'download'; }
      }
      if (popups.length && !download) {
        const p = popups[0];
        await p.waitForLoadState('domcontentloaded').catch(() => {});
        if (/^blob:|\.pdf|\.png|\.jpg/i.test(p.url())) {
          r.status = 'PASS'; r.stage = 'done'; r.message = 'Result opened in a new tab'; return r;
        }
      }
      if (!clicked && !clickedDownload && Date.now() - started > 20000) {
        const btns = (await visibleButtons(page)).map((b) => b.text).join(' | ');
        throw new Error(`No action button found. Visible buttons: ${btns || 'none'}`);
      }
    }
    if (!download) throw new Error(`No result after ${Math.round(timeout / 1000)}s${r.api.length ? '' : ' (no API call was made)'}`);

    // 5. Validate the downloaded file
    r.stage = 'validation';
    const fname = download.suggestedFilename();
    const dest = path.join(RUN_DIR, `${tool.slug}__${fname}`);
    await download.saveAs(dest);
    const v = validateOutput(dest, fname, tool.expect);
    r.output = { file: fname, type: v.type, bytes: v.bytes };
    if (!v.ok) throw new Error(v.message);
    r.status = 'PASS';
    r.stage = 'done';
    r.message = v.message;
  } catch (e) {
    r.status = 'FAIL';
    r.message = String(e.message || e).split('\n')[0].slice(0, 300);
    const shot = path.join(RUN_DIR, `${tool.slug}__fail.png`);
    await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
    if (fs.existsSync(shot)) r.screenshot = path.relative(OUT, shot);
  } finally {
    r.durationMs = Date.now() - started;
    await context.close().catch(() => {});
  }
  return r;
}

async function testPage(browser, pg) {
  const r = { kind: 'page', slug: pg.path, name: pg.name, group: 'Site pages', url: BASE_URL + pg.path, status: 'FAIL', consoleErrors: [] };
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', (e) => r.consoleErrors.push(String(e.message).slice(0, 200)));
  const t0 = Date.now();
  try {
    const resp = await page.goto(r.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    r.loadMs = Date.now() - t0;
    r.httpStatus = resp?.status();
    if (!resp || resp.status() >= 400) throw new Error(`HTTP ${resp?.status()}`);
    const title = await page.title();
    const text = await page.locator('body').innerText({ timeout: 15000 });
    if (!title) throw new Error('Page has no title');
    if (text.trim().length < 100) throw new Error('Page body is (nearly) empty');
    if (pg.mustContain && !pg.mustContain.test(text)) throw new Error(`Missing expected content ${pg.mustContain}`);
    r.status = 'PASS';
    r.message = `${title.slice(0, 80)} — ${r.loadMs} ms`;
  } catch (e) {
    r.message = String(e.message || e).split('\n')[0].slice(0, 300);
  } finally {
    r.durationMs = Date.now() - t0;
    await context.close().catch(() => {});
  }
  return r;
}

async function main() {
  const startedAt = new Date();
  log(`FileMagics monitor → ${BASE_URL}`);
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const results = [];

  const pages = ONLY.length ? [] : PAGES;
  for (const pg of pages) {
    const r = await testPage(browser, pg);
    log(`${r.status === 'PASS' ? '✔' : '✘'} page ${pg.path} ${r.message}`);
    results.push(r);
  }

  const tools = ONLY.length ? TOOLS.filter((t) => ONLY.includes(t.slug)) : TOOLS;
  for (const tool of tools) {
    let r;
    for (let attempt = 1; attempt <= RETRIES + 1; attempt++) {
      r = await testTool(browser, tool, attempt);
      if (r.status === 'PASS') break;
      if (attempt <= RETRIES) log(`  retrying ${tool.slug} (${r.message})`);
    }
    if (r.status === 'PASS' && r.attempt > 1) r.flaky = true;
    log(`${r.status === 'PASS' ? '✔' : '✘'} ${tool.slug.padEnd(20)} ${(r.durationMs / 1000).toFixed(1)}s  ${r.message}`);
    results.push(r);
  }

  await browser.close();
  const summary = writeReports({ results, startedAt, finishedAt: new Date(), baseUrl: BASE_URL, outDir: OUT });
  log(`Done: ${summary.passed}/${summary.total} passed. Report: ${path.join(OUT, 'index.html')}`);
  process.exitCode = summary.failed > 0 && process.env.FAIL_ON_ERROR !== '0' ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exit(2); });
