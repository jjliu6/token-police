// Render the Token Police promo stage.
//   node promo/render/render.mjs stills 1.8 6.2 ...   -> promo/build/stills/t-XX.XX.png
//   node promo/render/render.mjs frames [fps]          -> promo/build/frames/f-00000.jpg
//   PROMO_CUT=short node promo/render/render.mjs ...   -> the 30-second cut (build/*-short)
// The stage is a static page (promo/stage/index.html) whose window.render(t)
// is deterministic, so each frame is a pure function of t.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PW = process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs';
const { chromium } = await import(PW);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [mode = 'stills', ...rest] = process.argv.slice(2);
const CUT = process.env.PROMO_CUT || 'long';   // 'long' | 'short'
const SUFFIX = CUT === 'long' ? '' : `-${CUT}`;

const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(pathToFileURL(path.join(root, 'stage', 'index.html')).href + ``);
await page.evaluate(() => window.ready());

if (mode === 'stills') {
  const dir = path.join(root, 'build', `stills${SUFFIX}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const s of rest) {
    const t = Number(s);
    await page.evaluate((t) => window.render(t), t);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const file = path.join(dir, `t-${t.toFixed(2).padStart(5, '0')}.png`);
    await page.screenshot({ path: file });
    console.log(file);
  }
} else if (mode === 'frames') {
  const fps = Number(rest[0] || 30);
  const dir = path.join(root, 'build', `frames${SUFFIX}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const total = Math.round((await page.evaluate(() => window.DURATION)) * fps);
  for (let i = 0; i < total; i++) {
    await page.evaluate((t) => window.render(t), i / fps);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await page.screenshot({ path: path.join(dir, `f-${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 94 });
    if (i % 60 === 0) console.log(`frame ${i}/${total}`);
  }
}
await browser.close();
