// Token Police promo frames — the real side panel (popup.html), driven in story order.
//   node promo/capture/scenes/panel.mjs
// Clicks real buttons, types into the real inputs, and answers the panel's
// chrome.runtime messages the way background.js would (handlers below).
// Writes promo/capture/out/<name>.png (1000×1720 = 500×860 CSS px @2x) and
// <name>.json bounding boxes (CSS px) for the stage camera.
//
//   dash-A        dashboard after a stretch — six cards, full hair          [hero]
//   dash-B        Refresh clicked — "Fetching…" + hint
//   dash-C        refresh done — "Updated 09:38 AM", "Last success: just now"
//   settings-A    ⚙ open — tracked agents + Auto-check / Low-quota alerts / Hair mascot / Move reminder
//   dispatch-T1…3 Dispatch composer, Code tab, prompt being typed
//   dispatch-A    prompt + repo + three Code agents picked → "Dispatch 3"
//   dispatch-B    tab list after opening — "Opened 3 tabs · prefill only, not sent"
//   cross-A       Cross-check on a ChatGPT conversation, privacy confirmed, System recommend → Claude
//   cross-B       after "Prefill Claude" — "Opened Claude · prefill only, not sent"
//   hair-A        72 min later — hair 40%, mascot talks
//   hair-B        another 45 min — hair 15%, frowning
//   veil-A        clock ran out — cards frost over, 3 activities offered
//   veil-B        activity picked — "Doing: …" + Done
//   veil-C        Done tapped — hair grows back (sparkle frame)
//   veil-D        back to normal — hair full, numbers readable
//   share-A       Share card — "Free, open source — nothing leaves your browser"
import { openPanel, unmocked, shot, boxes } from '../harness.mjs';
import { baseStore, NOW, MIN, H } from '../sample-data.mjs';

const BUDDY = { x: 316, y: 676 }; // bottom-right, clear of the six cards' numbers
const CENTER = { x: 162, y: 236 }; // mid-panel, for the mascot story
const TOP = { x: 316, y: 40 };     // out of the way of the Share button

// background.js stand-ins (the panel only ever talks to the background through these)
const handlers = `
  refreshAll: () => ({ ok: true }),
  dispatchOpen: (m) => m.jobs.map((j, i) => Object.assign({}, j, { tabId: 101 + i })),
  dispatchLiveTabs: (m) => m.tabIds,
  dispatchFocus: () => ({ ok: true }),
  dispatchCloseTabs: () => ({ ok: true }),
  reviewOpen: (m) => [Object.assign({}, m.job, { tabId: 140 })],
  captureConversation: () => ({
    ok: true, sourceAgent: 'chatgpt', sourceKind: 'chat',
    sessionUrl: 'https://chatgpt.com/c/promo-orders-migration',
    conversation: [
      { role: 'user', text: 'Is it safe to run this on a live Postgres table with ~40M rows?\\nALTER TABLE orders ADD COLUMN status text NOT NULL DEFAULT \\'new\\';' },
      { role: 'assistant', text: 'Yes. Since PostgreSQL 11, adding a column with a constant default is a metadata-only change: the table is not rewritten, and the ACCESS EXCLUSIVE lock is held only briefly. Make sure no long-running transaction is holding a lock on orders first, or the ALTER will queue behind it and block everything after it.' },
      { role: 'user', text: 'And then an index on status?' },
      { role: 'assistant', text: 'Use CREATE INDEX CONCURRENTLY idx_orders_status ON orders (status); so writes are not blocked. It cannot run inside a transaction block, and if it fails it leaves an INVALID index you need to drop and recreate.' },
    ],
  }),
  clearCaptureLogs: () => ({ ok: true }),
`;
const windowState = { id: 1, focused: true, tabs: [{ id: 77, windowId: 1, active: true, url: 'https://chatgpt.com/c/promo-orders-migration', title: 'Orders migration' }] };

const { browser, page } = await openPanel({
  store: baseStore({ buddyPos: BUDDY, lastMovedAt: NOW, activityDoneAt: NOW }),
  handlers, windowState, width: 500, height: 860,
});
const wait = (ms) => page.waitForTimeout(ms);
// Promo-only cosmetics: the mascot's idle bob and glide are paused so cross-fades
// between frames line up (positions come from buddyPos, like a user drag).
await page.addStyleTag({ content: `
  #buddy{transition:none!important}
  .buddy.wander .mascot:not(.regrow){animation:none!important}
` });
const setStore = (items) => page.evaluate((items) => new Promise((r) => chrome.storage.local.set(items, r)), items);
// Timestamps must come from the panel's (pinned) clock, not Node's.
const setAgo = (key, ms) => page.evaluate(([key, ms]) => new Promise((r) => chrome.storage.local.set({ [key]: Date.now() - ms }, r)), [key, ms]);
// Drag the mascot like a user would (pointer events → popup.js drag handler → buddyPos).
async function dragBuddy(to) {
  const b = await page.locator('#buddy').boundingBox();
  const grab = { x: b.x + b.width / 2, y: b.y + b.height - 30 }; // on the mascot, not the × button
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + (to.x - b.x) / 2, grab.y + (to.y - b.y) / 2, { steps: 4 });
  await page.mouse.move(grab.x + (to.x - b.x), grab.y + (to.y - b.y), { steps: 4 });
  await page.mouse.up();
  await wait(200);
}
// Make the mascot say one specific line from the real pool (popup.js SAYS / blurtSay).
const say = (stage, text) => page.evaluate(([stage, text]) => {
  const pool = SAYS[stage].en;
  lastSays.length = 0; // so the index below maps onto the full pool
  const i = pool.indexOf(text);
  if (i < 0) throw new Error('line not in pool: ' + text);
  blurtSay(0, false, () => (i + 0.5) / pool.length, stage);
}, [stage, text]);
const hush = () => page.evaluate(() => hideSay());
const settle = () => wait(1200);

const cardSel = (i) => `#grid .card:nth-child(${i})`;
const CARD_BOXES = {
  header: '.top', grid: '#grid', refresh: '#refresh', gear: '#gear',
  claude: cardSel(1), codex: cardSel(2), grok: cardSel(3), cursor: cardSel(4), grokbot: cardSel(5), gemini: cardSel(6),
  claudeBurn: `${cardSel(1)} .burn`, grokBurn: `${cardSel(3)} .burn`, geminiBurn: `${cardSel(6)} .burn`,
  claudeSpark: `${cardSel(1)} .spark`, grokSpark: `${cardSel(3)} .spark`, geminiSpark: `${cardSel(6)} .spark`,
  grokRing: `${cardSel(3)} .ring`, geminiRing: `${cardSel(6)} .ring`, geminiMid: `${cardSel(6)} .mid`,
  buddy: '#buddy', footer: '.footer-actions', credits: '#credits', ver: '#ver',
};

// ── dash-A: the hero — six cards, full hair ────────────────────────────────
await settle();
await hush();
await shot(page, 'dash-A');
await boxes(page, 'dash-A', CARD_BOXES);

// ── dash-B / dash-C: one click on Refresh ──────────────────────────────────
await page.click('#refresh');
await page.waitForFunction(() => document.getElementById('refresh').disabled);
await wait(300);
await hush();
await shot(page, 'dash-B');
await boxes(page, 'dash-B', { refresh: '#refresh', hint: '#hint', header: '.top' });
// What background.js writes when every page has been read: fresh scraped_at + results.
await page.evaluate(() => new Promise((r) => chrome.storage.local.get(['agents', 'history', 'refresh'], (res) => {
  const now = Date.now();
  Object.values(res.agents).forEach((a) => { a.scraped_at = now; });
  const hist = res.history.concat(Object.values(res.agents).map((a) => ({ id: a.id, t: now, pct: a.limits[0].percent_left })));
  const results = {};
  Object.keys(res.agents).forEach((id) => { results[id] = 'ok'; });
  chrome.storage.local.set({ agents: res.agents, history: hist, refresh: { running: false, started: res.refresh.started, results } }, r);
})));
await settle();
await hush();
await shot(page, 'dash-C');
await boxes(page, 'dash-C', CARD_BOXES);

// ── settings-A: ⚙ ───────────────────────────────────────────────────────────
await page.click('#gear');
await wait(500);
await hush();
await shot(page, 'settings-A');
await boxes(page, 'settings-A', {
  settings: '#settings',
  notifyLow: '#settings label:has(input[data-pref="notifyLow"])',
  showHair: '#settings label:has(input[data-pref="showHair"])',
  moveReminder: '#settings label:has(input[data-pref="moveReminder"])',
  autoCheck: '#settings .ival',
});
await page.click('#gear');
await wait(300);

// ── Dispatch: Code tab, prompt typed, repo, three agents ────────────────────
// The composer floats over the bottom of the panel (and over the mascot's corner).
await page.click('#dispatch-toggle');
await page.waitForSelector('#dispatch-float:not([hidden])');
await page.click('#dispatch-kind [data-kind="code"]');
const PROMPT = 'Fix the token expiry bug on the login page, add tests, then open a PR.';
const area = page.locator('#dispatch-prompt');
await area.click();
const cuts = [24, 47, PROMPT.length];
let typed = 0;
for (let k = 0; k < cuts.length; k++) {
  await area.pressSequentially(PROMPT.slice(typed, cuts[k]), { delay: 4 });
  typed = cuts[k];
  await wait(200);
  await hush();
  await shot(page, `dispatch-T${k + 1}`);
}
await page.locator('#dispatch-repo').click();
await page.locator('#dispatch-repo').pressSequentially('acme/webapp', { delay: 4 });
for (const id of ['claude-code', 'codex', 'cursor']) {
  await page.click(`#dispatch-chips [data-agent="${id}"]`);
  await wait(150);
}
await page.locator('#dispatch-prompt').click();
await page.keyboard.press('End');
await wait(300);
await hush();
await shot(page, 'dispatch-A');
await boxes(page, 'dispatch-A', {
  float: '#dispatch-float', kind: '#dispatch-kind', prompt: '#dispatch-prompt', repo: '#dispatch-repo-row',
  chips: '#dispatch-chips', go: '#dispatch-go', sendRow: '.dispatch-float .sendtog',
});
await page.click('#dispatch-go');
await page.waitForSelector('#dispatch-board:not([hidden]) .tile');
await wait(400);
await hush();
await shot(page, 'dispatch-B');
await boxes(page, 'dispatch-B', { board: '#dispatch-board', title: '#dispatch-board-title', tiles: '#dispatch-tiles', foot: '#dispatch-board-foot' });
await page.click('#dispatch-board-close');
await wait(300);

// ── Cross-check: the ChatGPT tab next to the panel ─────────────────────────
await page.click('#crosscheck-toggle');
await page.waitForFunction(() => /messages/.test(document.getElementById('crosscheck-status').textContent));
await page.click('#crosscheck-confirm');
await wait(300);
await hush();
await shot(page, 'cross-A');
await boxes(page, 'cross-A', {
  float: '#crosscheck-float', status: '#crosscheck-status', privacy: '#crosscheck-privacy',
  confirm: '#crosscheck-float .sendtog', pick: '#crosscheck-pick', picked: '#crosscheck-picked', go: '#crosscheck-go',
});
await page.click('#crosscheck-go');
await page.waitForFunction(() => /Opened/.test(document.getElementById('crosscheck-note').textContent));
await wait(300);
await hush();
await shot(page, 'cross-B');
await boxes(page, 'cross-B', { float: '#crosscheck-float', note: '#crosscheck-note', go: '#crosscheck-go', picked: '#crosscheck-picked' });
await page.click('#crosscheck-fold');
await wait(300);

// ── The hair mascot: sitting time passes ───────────────────────────────────
// lastMovedAt is the only input: the sit clock thins the hair over 2 hours.
await dragBuddy(CENTER);
await setAgo('lastMovedAt', 72 * MIN);
await settle();
await say('mid', 'one more prompt, one more follicle');
await wait(250);
await shot(page, 'hair-A');
await boxes(page, 'hair-A', { buddy: '#buddy', hair: '#hair', say: '#say' });
await setAgo('lastMovedAt', 102 * MIN);
await settle();
await say('low', 'you stay seated, i go bald');
await wait(250);
await shot(page, 'hair-B');
await boxes(page, 'hair-B', { buddy: '#buddy', hair: '#hair', say: '#say' });

// Clock runs out: veil + an offer of three "leave the desk" activities.
await setStore({ activityOffer: { stage: 'low', ids: ['actGrass', 'actTea', 'actWalk'] } });
await setAgo('lastMovedAt', 2 * H + 2 * MIN);
await page.waitForSelector('#veil:not([hidden])');
await page.waitForSelector('#acts button');
await settle();
await say('due', 'touch grass. the plant');
await wait(250);
await shot(page, 'veil-A');
await boxes(page, 'veil-A', { buddy: '#buddy', acts: '#acts', stage: '#stage' });
await page.click('#acts button[data-act="actGrass"]');
await page.waitForSelector('#acts button.done');
await wait(500);
await hush();
await shot(page, 'veil-B');
await boxes(page, 'veil-B', { buddy: '#buddy', acts: '#acts', done: '#acts button.done' });
await page.click('#acts button.done');
await page.waitForSelector('#hair.regrow');
await say('regrow', "hair's back!");
await wait(520);
await page.screenshot({ path: new URL('../out/veil-C.png', import.meta.url).pathname });
console.log('saved veil-C.png (regrow sparkle)');
await boxes(page, 'veil-C', { buddy: '#buddy', hair: '#hair' });
await wait(2600);
await dragBuddy(BUDDY); // dragged back to its corner
await hush();
await shot(page, 'veil-D');
await boxes(page, 'veil-D', CARD_BOXES);

// ── Share card: the product's own privacy line ──────────────────────────────
await dragBuddy(TOP);
await page.click('#share');
await page.waitForSelector('#share-overlay:not([hidden])');
await page.evaluate(() => document.getElementById('share-shot').decode().catch(() => null));
await wait(400);
await hush();
await shot(page, 'share-A');
await boxes(page, 'share-A', { card: '#share-card', pitch: '#share-pitch', privacy: '#share-privacy', url: '#share-url' });

console.log('sent:', JSON.stringify(await page.evaluate(() => window.__TP_SENT.map((m) => m.type))));
console.log('unmocked:', await unmocked(page));
await browser.close();
