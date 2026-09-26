// Open the REAL side-panel dashboard (popup.html) with chrome.* stubbed and demo data seeded.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..', '..');
const PW = process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs';
const { chromium } = await import(PW);
export const NOW = new Date('2026-09-25T09:41:00-07:00').getTime();

export async function openPanel({ store, width = 460, height = 900, scale = 2, browser, init = '' } = {}) {
  const b = browser || (await chromium.launch({ args: ['--allow-file-access-from-files'] }));
  const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: scale, locale: 'en-US', timezoneId: 'America/Los_Angeles' });
  await ctx.clock.install({ time: NOW });
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const font = pathToFileURL(path.join(ROOT, 'promo/assets/fonts/InterVariable-latin.woff2')).href;
  await ctx.addInitScript({ content: `window.__PROMO_STORE=${JSON.stringify(store)};window.__PROMO_MANIFEST=${JSON.stringify(manifest)};window.__PROMO_FONT=${JSON.stringify(font)};${init}` });
  await ctx.addInitScript({ path: path.join(here, 'chrome-stub.js') });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
  await page.goto(pathToFileURL(path.join(ROOT, 'popup.html')).href);
  await page.waitForTimeout(400);
  return { browser: b, ctx, page };
}
export const out = (n) => path.join(here, 'out', `${n}.png`);
