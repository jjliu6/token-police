// Capture every state the film uses from the real popup.html.
import { openPanel, out, NOW } from './harness.mjs';
import { store } from './demo-data.mjs';

const only = process.argv[2];
const shots = {
  // Empty first-run panel
  empty: { store: { checkUpdates: false, uiLang: 'en', history: [] } },
  dash: { store: store({ showHair: false }) },
  dispatch: { store: store({ showHair: false }), act: async (p) => {
    await p.click('#dispatch-toggle'); await p.waitForTimeout(200);
    await p.fill('#dispatch-prompt', 'Add dark mode to the settings page and write tests for it.');
    await p.dispatchEvent('#dispatch-prompt', 'input');
    for (const n of ['Claude', 'Grok', 'Gemini']) await p.locator('#dispatch-chips label, #dispatch-chips button').filter({ hasText: n }).first().click();
    await p.waitForTimeout(200);
  } },
  crosscheck: { store: store({ showHair: false }), act: async (p) => { await p.click('#crosscheck-toggle'); await p.waitForTimeout(300); } },
  bald: { store: store({ lastMovedAt: NOW - 5 * 3600000, buddyPos: { x: 90, y: 300 } }) },
};
for (const [n, s] of Object.entries(shots)) {
  if (only && only !== n) continue;
  const { browser, page } = await openPanel({ store: s.store });
  if (s.act) await s.act(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: out(n) });
  console.log(n);
  await browser.close();
}
