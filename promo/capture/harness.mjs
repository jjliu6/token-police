// Playwright helpers: open the REAL side-panel page (popup.html + its scripts,
// straight from the repo) with the promo chrome.* mock injected first.
//   import { openPanel } from './harness.mjs';
//   const { browser, page } = await openPanel({ store: baseStore() });
// No server needed: page.route serves the repo files for http://token-police.promo/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NOW } from './sample-data.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PW = process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs';
const { chromium } = await import(PW);

export const REPO = path.resolve(here, '..', '..');
export const OUT = path.join(here, 'out');
export const ORIGIN = 'http://token-police.promo';
export const PANEL = { width: 500, height: 860 };
const FONT_DIR = path.join(here, '..', 'assets', 'fonts');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

export async function openPanel({ store, handlers = '', windowState = null, width = PANEL.width, height = PANEL.height, scale = 2 } = {}) {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, locale: 'en-US', timezoneId: 'UTC', colorScheme: 'dark' });
  // Pin the panel clock (Fri Oct 30, 09:38 UTC). Time still flows; timers run.
  await ctx.clock.install({ time: new Date(NOW) });
  await ctx.route(ORIGIN + '/**', (route) => {
    const u = new URL(route.request().url());
    let file;
    if (u.pathname.startsWith('/__promo/fonts/')) file = path.join(FONT_DIR, path.basename(u.pathname));
    else file = path.join(REPO, decodeURIComponent(u.pathname));
    if (!file.startsWith(REPO) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
    route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'manifest.json'), 'utf8'));
  await ctx.addInitScript({ content: `window.__PROMO_FONT_BASE='/__promo/fonts';
    window.__TP_STORE=${JSON.stringify(store || {})};
    window.__TP_MANIFEST=${JSON.stringify(manifest)};
    window.__TP_WINDOW=${JSON.stringify(windowState)};
    window.__buddyWander = 'off'; // promo: no random wandering, positions come from buddyPos
    window.__TP_HANDLERS = {${handlers}};` });
  // Seeded Math.random: the panel's random picks (activity offers, mascot lines)
  // come out the same on every run, so re-capturing gives identical frames.
  await ctx.addInitScript({ content: `(() => { let a = 0x2f6e2b1; Math.random = function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();` });
  await ctx.addInitScript({ path: path.join(here, 'mock-chrome.js') });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)); });
  await page.goto(ORIGIN + '/popup.html');
  await page.waitForSelector('#grid .card');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  return { browser, ctx, page };
}

export async function unmocked(page) {
  return page.evaluate(() => [...window.__TP_UNMOCKED]);
}

// Problems that must never reach a promo frame.
export async function assertClean(page, label) {
  const problems = await page.evaluate(() => {
    const out = [];
    const txt = document.body.innerText;
    if (txt.includes('[object Object]')) out.push('[object Object]');
    if (/\bundefined\b|\bNaN\b/.test(txt)) out.push('undefined/NaN text');
    if (/collecting/i.test(txt)) out.push('burn rate still collecting');
    document.querySelectorAll('.fail, .freshness').forEach((n) => { if (n.offsetParent) out.push('card warning: ' + n.innerText); });
    return out;
  });
  if (problems.length) console.log(`[${label}] WARN`, problems);
}

export async function shot(page, name) {
  await assertClean(page, name);
  await page.mouse.move(2, 2);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log('saved', `${name}.png`);
}

// Bounding boxes (CSS px in the panel viewport) for camera targets.
export async function boxes(page, name, entries) {
  const res = {};
  for (const [key, sel] of Object.entries(entries)) {
    res[key] = await page.evaluate((sel) => {
      const els = typeof sel === 'string' ? [...document.querySelectorAll(sel)] : null;
      const el = els && els.find((e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden');
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) };
    }, sel);
  }
  const vp = page.viewportSize();
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify({ viewport: vp, boxes: res }, null, 2) + '\n');
  console.log(`${name}.json`, JSON.stringify(res));
  return res;
}
