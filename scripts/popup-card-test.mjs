// Render the Grok card with the SuperGrok fixture and check the remaining %.
// Also checks default-English i18n and the 中文 / EN toggle.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const parseCtx = {};
vm.runInNewContext(readFileSync(resolve(root, 'parse.js'), 'utf8'), parseCtx, { filename: 'parse.js' });

const USER_SUPERGROK = `
Weekly SuperGrok Limit SuperGrok
Resets August 28, 2026 at 2:20 AM
Total Usage
33% used
Chat 16%
App Builder 10%
Automations 6%
Imagine 1%
Extra Usage Credits
`;
const noisy = `Your disk is 9% used\n${USER_SUPERGROK}`;
const parsed = parseCtx.parseGrokUsage(noisy);
if (!parsed || parsed.used !== 33) {
  console.error('expected parseGrokUsage to return 33% used, got', parsed);
  process.exit(1);
}

const grok = {
  id: 'grok-build',
  name: 'Grok',
  color: '#B78CF0',
  scraped_at: Date.now(),
  limits: [{ label: 'Weekly (SuperGrok)', percent_left: 100 - parsed.used, resets_text: parsed.reset }],
  breakdown: parsed.breakdown,
};

let sent = [];
let sideOpened = 0;
let windowsCreated = 0;
let uiLanguageCalls = 0;
let clipboardWrites = [];
let tabsCreated = [];
const docListeners = {};
const store = { agents: { 'grok-build': grok }, history: [] };
const noop = () => {};

function el(extra) {
  return {
    addEventListener: noop,
    textContent: '',
    innerHTML: '',
    disabled: false,
    title: '',
    hidden: false,
    style: {},
    dataset: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    querySelector: () => null,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 200, top: 56, width: 176, height: 200, right: 376, bottom: 256 }),
    offsetWidth: 176,
    offsetHeight: 200,
    setPointerCapture: noop,
    setAttribute: noop,
    ...extra,
  };
}

const els = {
  refresh: el(),
  lang: el(),
  gear: el(),
  settings: el({ hidden: true }),
  'brand-name': el(),
  legend: el(),
  grid: el(),
  stage: el(),
  veil: el({ hidden: true }),
  upd: el(),
  hint: el(),
  hair: el({ hidden: true }),
  buddy: el({ hidden: true }),
  say: el({ hidden: true }),
  acts: el({ hidden: true }),
  ver: el(),
  credits: el(),
  share: el(),
  'share-overlay': el({ hidden: true }),
  'share-card': el(),
  'share-close': el(),
  'share-title': el(),
  'share-pitch': el(),
  'share-url': el(),
  'share-copy': el(),
  'share-x': el(),
  'share-shot': el({ src: '', alt: '' }),
};

const popupCtx = {
  chrome: {
    i18n: {
      getUILanguage: () => {
        uiLanguageCalls++;
        return 'zh-CN';
      },
    },
    storage: {
      local: {
        get: (keys, cb) => {
          const out = {};
          const list = Array.isArray(keys) ? keys : Object.keys(store);
          for (const k of list) {
            if (store[k] !== undefined) out[k] = store[k];
          }
          cb && cb(out);
        },
        set: (obj, cb) => {
          Object.assign(store, obj);
          cb && cb();
        },
      },
      onChanged: { addListener: noop },
    },
    runtime: {
      sendMessage: (msg) => { sent.push(msg); },
      getContexts: () => Promise.resolve([]),
      getURL: (p) => p,
      getManifest: () => ({ version: '1.2.1' }),
      lastError: null,
    },
    sidePanel: { open: ({ windowId }) => { sideOpened++; popupCtx._openedWindowId = windowId; return Promise.resolve(); } },
    windows: {
      getLastFocused: (_opts, cb) => cb({ id: 42, type: 'normal' }),
      create: () => { windowsCreated++; },
    },
    tabs: { create: (opts) => { tabsCreated.push(opts); } },
  },
  document: {
    documentElement: { lang: 'en' },
    getElementById: (id) => els[id] || null,
    body: { classList: { add: noop }, style: {} },
    addEventListener: (type, fn) => {
      (docListeners[type] = docListeners[type] || []).push(fn);
    },
  },
  navigator: {
    clipboard: {
      writeText: (s) => { clipboardWrites.push(s); },
    },
  },
  location: { href: 'chrome-extension://id/popup.html' },
  setTimeout: noop,
  clearTimeout: noop,
  setInterval: noop,
  clearInterval: noop,
  window: { innerWidth: 380, innerHeight: 720 },
};

const ctx = vm.createContext(popupCtx);
vm.runInContext(readFileSync(resolve(root, 'agents.js'), 'utf8'), ctx, { filename: 'agents.js' });
vm.runInContext(readFileSync(resolve(root, 'activities.js'), 'utf8'), ctx, { filename: 'activities.js' });
vm.runInContext(readFileSync(resolve(root, 'update.js'), 'utf8'), ctx, { filename: 'update.js' });
vm.runInContext(readFileSync(resolve(root, 'i18n.js'), 'utf8'), ctx, { filename: 'i18n.js' });
vm.runInContext(readFileSync(resolve(root, 'popup.js'), 'utf8'), ctx, { filename: 'popup.js' });

const problems = [];

if (ctx.currentLang() !== 'en') problems.push(`default language should be en, got ${ctx.currentLang()}`);
if (uiLanguageCalls !== 0) problems.push('dashboard language must not follow chrome.i18n.getUILanguage');
if (els['brand-name'].textContent !== 'TOKEN POLICE') {
  problems.push(`default brand should be English, got ${JSON.stringify(els['brand-name'].textContent)}`);
}
if (els.legend.textContent !== 'number = remaining') {
  problems.push(`default legend should be English, got ${JSON.stringify(els.legend.textContent)}`);
}
if (els.lang.textContent !== '中文') problems.push(`English UI should show a 中文 button, got ${JSON.stringify(els.lang.textContent)}`);
if (els.refresh.textContent !== 'Refresh') problems.push(`default refresh label should be Refresh, got ${JSON.stringify(els.refresh.textContent)}`);
if (els.share.textContent !== 'Share') problems.push(`default share label should be Share, got ${JSON.stringify(els.share.textContent)}`);
if (popupCtx.document.documentElement.lang !== 'en') {
  problems.push(`<html lang> should be en by default, got ${popupCtx.document.documentElement.lang}`);
}

const htmlEn = ctx.card('grok-build', grok, []);
if (!htmlEn.includes('>67%</b>')) problems.push('card should show 67% remaining, not the old 91%');
if (htmlEn.includes('>91%</b>')) problems.push('card still shows the buggy 91% remaining');
if (!htmlEn.includes('Chat 16%')) problems.push('missing Chat 16% in the English breakdown legend');
if (!htmlEn.includes('Build 10%')) problems.push('missing Build 10% in the breakdown legend');
if (!htmlEn.includes('Auto 6%')) problems.push('missing Auto 6% in the breakdown legend');
if (!htmlEn.includes('Img 1%')) problems.push('missing Img 1% in the breakdown legend');
if (!htmlEn.includes('bar stacked')) problems.push('missing stacked usage bar');
if (!htmlEn.includes('>left<')) problems.push('English card should say "left"');
if (htmlEn.includes('剩余')) problems.push('English default must not show Chinese "剩余"');
if (htmlEn.includes('聊天')) problems.push('English default must not show Chinese "聊天"');

if (problems.length) {
  console.error(htmlEn);
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('ok  Default UI is English (ignores Chrome UI language zh-CN)');
console.log('ok  Grok card shows 67% remaining with Chat/Build/Auto/Img slices');

// --- Tracked-agents settings ---
const setProblems = [];
if (!els.settings.innerHTML.includes('Claude Code')) setProblems.push('settings should list Claude Code');
if (!els.settings.innerHTML.includes('data-agent="cursor"')) setProblems.push('settings should have a cursor checkbox');
if ((els.settings.innerHTML.match(/data-agent="[^"]+" checked/g) || []).length !== 6) {
  setProblems.push('all six agents should default to checked');
}
if (!els.settings.innerHTML.includes('data-agent="grok-bot"') || !els.settings.innerHTML.includes('data-agent="gemini"')) {
  setProblems.push('settings should list Grok Bot and Gemini');
}
if ((els.settings.innerHTML.match(/data-pref="[^"]+" checked/g) || []).length !== 5) {
  setProblems.push('autoRefresh, notifyLow, showHair, checkUpdates and moveReminder toggles should default to checked');
}
if (!els.settings.innerHTML.includes('data-pref="moveReminder" checked')) {
  setProblems.push('moveReminder toggle should exist and default to checked');
}
store.moveReminder = false;
ctx.render();
if (els.settings.innerHTML.includes('data-pref="moveReminder" checked')) {
  setProblems.push('moveReminder=false should render the toggle unchecked');
}
delete store.moveReminder;
ctx.render();
if (!els.settings.innerHTML.includes('data-pref="checkUpdates"')) setProblems.push('settings should have a checkUpdates toggle');
store.autoRefresh = false;
ctx.render();
if (els.settings.innerHTML.includes('data-pref="autoRefresh" checked')) {
  setProblems.push('autoRefresh=false should render unchecked');
}
if (!els.settings.innerHTML.includes('data-pref="notifyLow" checked')) {
  setProblems.push('notifyLow should stay checked when only autoRefresh is off');
}
delete store.autoRefresh;
ctx.render();
store.enabledAgents = { codex: false };
ctx.render();
if (els.grid.innerHTML.includes('Codex')) setProblems.push('disabled Codex should not render a card');
if (!els.grid.innerHTML.includes('Cursor')) setProblems.push('enabled Cursor should still render');
if (els.settings.innerHTML.includes('data-agent="codex" checked')) {
  setProblems.push('disabled Codex checkbox should be unchecked');
}
store.enabledAgents = {};
ctx.render();
if (setProblems.length) {
  console.error(els.settings.innerHTML);
  console.error(setProblems.join('\n'));
  process.exit(1);
}
console.log('ok  Tracked-agents settings: default all on, unchecked agent disappears');

// --- Version line at the bottom ---
const verProblems = [];
delete store.updateCheck;
delete store.checkUpdates;
ctx.render();
if (!els.ver.innerHTML.includes('>v1.2.1<')) verProblems.push(`version line should show the manifest version, got ${els.ver.innerHTML}`);
if (!els.ver.innerHTML.includes('https://token-police.philosophie.ai/')) verProblems.push('version should link to the landing page');
if (els.ver.innerHTML.includes('class="new"')) verProblems.push('no check yet → must not claim a new version');
if (els.ver.innerHTML.includes('up to date')) verProblems.push('no check yet → must not claim up to date');
store.updateCheck = { checkedAt: Date.now(), latest: '1.2.1', url: 'https://github.com/jjliu6/token-police/releases/tag/v1.2.1' };
ctx.render();
if (!els.ver.innerHTML.includes('up to date')) verProblems.push(`same version → "up to date", got ${els.ver.innerHTML}`);
if (els.ver.innerHTML.includes('class="new"')) verProblems.push('same version → no new-version link');
store.updateCheck = { checkedAt: Date.now(), latest: '1.3.0', url: 'https://github.com/jjliu6/token-police/releases/tag/v1.3.0' };
ctx.render();
if (!els.ver.innerHTML.includes('class="new"') || !els.ver.innerHTML.includes('New version v1.3.0 available')) {
  verProblems.push(`newer release → orange download link, got ${els.ver.innerHTML}`);
}
if (!els.ver.innerHTML.includes('href="https://token-police.philosophie.ai/"')) {
  verProblems.push('new-version link should point at the landing page');
}
if (!els.ver.innerHTML.includes('>v1.2.1<')) verProblems.push('installed version stays visible next to the update notice');
// 用户已经更新到 1.3.0 但存的还是上次的检查结果 → 不该再提示
store.updateCheck = { checkedAt: Date.now(), latest: '1.2.0', url: 'https://github.com/x' };
ctx.render();
if (els.ver.innerHTML.includes('class="new"')) verProblems.push('latest older than installed → no update notice');
// 关掉"检查更新"后，即使还有旧结果也不显示提示
store.updateCheck = { checkedAt: Date.now(), latest: '1.3.0', url: 'https://github.com/x' };
store.checkUpdates = false;
ctx.render();
if (els.ver.innerHTML.includes('class="new"')) verProblems.push('checkUpdates=false → no update notice');
if (!els.ver.innerHTML.includes('>v1.2.1<')) verProblems.push('checkUpdates=false → version itself still shown');
if (els.settings.innerHTML.includes('data-pref="checkUpdates" checked')) verProblems.push('checkUpdates=false should render unchecked');
// 存的 url 一律不信：即使用户机器上还留着旧的 GitHub / 注入字符串，点击也只去落地页
store.checkUpdates = true;
store.updateCheck = { checkedAt: Date.now(), latest: '1.3.0', url: '"><img src=x onerror=alert(1)>' };
ctx.render();
if (els.ver.innerHTML.includes('<img')) verProblems.push('update url must be escaped');
if (!els.ver.innerHTML.includes('href="https://token-police.philosophie.ai/"')) {
  verProblems.push('stale or hostile stored url must still open the landing page');
}
if (!els.credits.innerHTML.includes('Built by') || !els.credits.innerHTML.includes('Junjie Liu') || !els.credits.innerHTML.includes('Philosophie AI')) {
  verProblems.push(`footer credits should name the author, got ${els.credits.innerHTML}`);
}
if (els.credits.innerHTML.includes('credits {n}')) verProblems.push('footer must not use the card credits template');
delete store.updateCheck;
delete store.checkUpdates;
ctx.render();
if (verProblems.length) {
  console.error(els.ver.innerHTML);
  console.error(verProblems.join('\n'));
  process.exit(1);
}
console.log('ok  Version line shows the installed version and flags a newer release');

// --- Share card (footer button → overlay, copy + X, landing URL) ---
const shareProblems = [];
for (const key of ['share', 'shareTitle', 'sharePitch', 'shareCopy', 'shareCopied', 'shareX', 'shareClose', 'shareTweet', 'shareShotAlt']) {
  if (!ctx.t(key) || ctx.t(key) === key) shareProblems.push(`missing English i18n key ${key}`);
}
if (ctx.t('share') !== 'Share') shareProblems.push(`share should be Share, got ${ctx.t('share')}`);
if (ctx.sharePageUrl() !== 'https://token-police.philosophie.ai/') {
  shareProblems.push(`share URL must be the landing page, got ${ctx.sharePageUrl()}`);
}
if (/github\.com/i.test(ctx.sharePageUrl()) || /github\.com\/jjliu6/i.test(ctx.shareTweetText())) {
  shareProblems.push('share URL / tweet must not point at GitHub');
}
if (!ctx.shareTweetText().includes('https://token-police.philosophie.ai/')) {
  shareProblems.push('tweet copy should include the landing URL');
}
const intent = ctx.shareIntentUrl();
if (!intent.startsWith('https://x.com/intent/tweet?text=')) {
  shareProblems.push(`X intent should be x.com tweet intent, got ${intent}`);
}
if (!intent.includes(encodeURIComponent('https://token-police.philosophie.ai/'))) {
  shareProblems.push('X intent should encode the landing URL');
}
if (/github\.com/i.test(decodeURIComponent(intent.split('text=')[1] || ''))) {
  shareProblems.push('X intent text must not include GitHub');
}
if (!els['share-overlay'].hidden) shareProblems.push('share overlay should start hidden');
ctx.openShare();
if (els['share-overlay'].hidden) shareProblems.push('openShare should show the overlay');
if (els['share-title'].textContent !== 'Share Token Police') {
  shareProblems.push(`share title should be English, got ${JSON.stringify(els['share-title'].textContent)}`);
}
if (!els['share-pitch'].textContent.includes('side panel')) {
  shareProblems.push(`share pitch should be the English product blurb, got ${JSON.stringify(els['share-pitch'].textContent)}`);
}
if (els['share-url'].textContent !== 'https://token-police.philosophie.ai/') {
  shareProblems.push(`share card URL should be the landing page, got ${JSON.stringify(els['share-url'].textContent)}`);
}
if (els['share-shot'].src !== 'icons/share-preview-en.webp') {
  shareProblems.push(`English share card should show the panel screenshot, got ${JSON.stringify(els['share-shot'].src)}`);
}
if (els['share-shot'].alt !== 'Token Police dashboard preview') {
  shareProblems.push(`share screenshot alt, got ${JSON.stringify(els['share-shot'].alt)}`);
}
if (!existsSync(resolve(root, 'icons/share-preview-en.webp')) || !existsSync(resolve(root, 'icons/share-preview-zh.webp'))) {
  shareProblems.push('bundled EN/ZH dashboard screenshots must ship with the extension');
}
if (ctx.sharePreviewSrc() !== 'icons/share-preview-en.webp') {
  shareProblems.push(`sharePreviewSrc en, got ${ctx.sharePreviewSrc()}`);
}
if (els['share-copy'].textContent !== 'Copy link') shareProblems.push('copy button should say Copy link');
if (els['share-x'].textContent !== 'Share on X') shareProblems.push('X button should say Share on X');
clipboardWrites = [];
ctx.copyShareLink();
if (clipboardWrites.join() !== 'https://token-police.philosophie.ai/') {
  shareProblems.push(`copy should write the landing URL, got ${JSON.stringify(clipboardWrites)}`);
}
if (els['share-copy'].textContent !== 'Copied') {
  shareProblems.push(`copy should flash Copied, got ${JSON.stringify(els['share-copy'].textContent)}`);
}
tabsCreated = [];
ctx.openShareX();
if (tabsCreated.length !== 1 || tabsCreated[0].url !== intent) {
  shareProblems.push(`Share on X should open the tweet intent tab, got ${JSON.stringify(tabsCreated)}`);
}
ctx.closeShare();
if (!els['share-overlay'].hidden) shareProblems.push('closeShare should hide the overlay');
if (els['share-copy'].textContent !== 'Copy link') shareProblems.push('closing should restore Copy link');
ctx.openShare();
(docListeners.keydown || []).forEach((fn) => fn({ key: 'Escape' }));
if (!els['share-overlay'].hidden) shareProblems.push('Escape should dismiss the share card');
const overlayEl = els['share-overlay'];
overlayEl.hidden = false;
const onOverlayClick = (e) => { if (e.target === overlayEl) ctx.closeShare(); };
onOverlayClick({ target: els['share-card'] });
if (overlayEl.hidden) shareProblems.push('clicking the share card should not dismiss');
onOverlayClick({ target: overlayEl });
if (!overlayEl.hidden) shareProblems.push('clicking the dimmed backdrop should dismiss');
if (shareProblems.length) {
  console.error(shareProblems.join('\n'));
  process.exit(1);
}
console.log('ok  Share card opens on the landing URL with copy + X, dismisses on Esc/backdrop');

// --- Failure state on cards ---
const failProblems = [];
const failHtml = ctx.card('grok-build', grok, [], true);
if (!failHtml.includes("Last refresh couldn't read this page")) failProblems.push('failed card should warn about the failed refresh');
if (!failHtml.includes('data-open="grok-build"')) failProblems.push('failed card should link to the usage page');
if (ctx.card('grok-build', grok, [], false).includes('class="fail"')) failProblems.push('ok card must not show the failure line');
store.refresh = { running: false, started: Date.now(), finished: Date.now(), results: { cursor: 'fail' } };
ctx.render();
if (!els.grid.innerHTML.includes('class="fail"')) failProblems.push('render should show the failure line for a failed agent');
store.refresh = {};
ctx.render();
if (failProblems.length) {
  console.error(failHtml);
  console.error(failProblems.join('\n'));
  process.exit(1);
}
const missingHtml = ctx.card('grok-bot', undefined, [], 'missing');
if (!missingHtml.includes('no Grok Bot section')) failProblems.push('missing Grok Bot section should get its own hint');
if (missingHtml.includes("couldn't read this page")) failProblems.push('missing section must not be reported as a sign-in problem');
store.refresh = { running: false, started: Date.now(), finished: Date.now(), results: { 'grok-bot': 'missing' } };
ctx.render();
if (!els.grid.innerHTML.includes('no Grok Bot section')) failProblems.push('render should surface the missing-section hint');
store.refresh = {};
ctx.render();
if (failProblems.length) {
  console.error(failProblems.join('\n'));
  process.exit(1);
}
console.log('ok  Failed refresh is visible on the card with an "open page" link');
console.log('ok  Grok Bot section missing from the Cursor page shows a dedicated hint');

// --- Grok Bot and Gemini cards ---
const newCards = [];
const bot = {
  id: 'grok-bot', name: 'Grok Bot', scraped_at: Date.now(),
  limits: [{ label: 'Weekly', percent_left: 87, resets_text: '9月3日 (23 hours and 4 minutes left)' }],
};
const botHtml = ctx.card('grok-bot', bot, [], false);
if (!botHtml.includes('>87%</b>')) newCards.push('Grok Bot card should show 87% remaining');
if (!botHtml.includes('reset in 23h')) newCards.push(`Grok Bot card should say "reset in 23h", got: ${botHtml}`);
if (!botHtml.includes('>Weekly<')) newCards.push('Grok Bot card should label the ring Weekly');
const gem = {
  id: 'gemini', name: 'Gemini', scraped_at: Date.now(), plan: 'PRO',
  limits: [
    { label: 'Weekly', percent_left: 83, resets_text: 'Sep 6 at 8:29 AM' },
    { label: 'Current usage', percent_left: 58, resets_text: '2:29 PM' },
  ],
};
const gemHtml = ctx.card('gemini', gem, [], false);
if (!gemHtml.includes('>83%</b>')) newCards.push('Gemini card should show 83% remaining');
if (!gemHtml.includes('Current usage') || !gemHtml.includes('58% left')) newCards.push('Gemini card should show the Current usage bar with 58% left');
if (!gemHtml.includes('>PRO<')) newCards.push('Gemini card should show the PRO plan');
if (!/reset in \d+[dh]/.test(gemHtml)) newCards.push(`Gemini weekly reset "Sep 6 at 8:29 AM" should parse to a countdown, got: ${gemHtml}`);
// parseReset: the two new formats
const now0 = new Date('2026-09-02T12:00:00');
const r1 = ctx.parseReset('9月3日 (23 hours and 4 minutes left)', now0);
if (!r1 || Math.round((r1 - now0) / 60000) !== 23 * 60 + 4) newCards.push(`"23 hours and 4 minutes left" should be +23h04m, got ${r1}`);
const r2 = ctx.parseReset('2 days left', now0);
if (!r2 || Math.round((r2 - now0) / 3600000) !== 48) newCards.push(`"2 days left" should be +48h, got ${r2}`);
const r3 = ctx.parseReset('Sep 6 at 8:29 AM', now0);
if (!r3 || r3.getMonth() !== 8 || r3.getDate() !== 6 || r3.getHours() !== 8 || r3.getMinutes() !== 29 || r3.getFullYear() !== 2026) {
  newCards.push(`"Sep 6 at 8:29 AM" should be Sep 6 2026 08:29, got ${r3}`);
}
const r4 = ctx.parseReset('Jan 3 at 8:29 AM', new Date('2026-12-30T12:00:00'));
if (!r4 || r4.getFullYear() !== 2027) newCards.push(`"Jan 3" seen in late December should roll into next year, got ${r4}`);
const r5 = ctx.parseReset('9月26日 (24 days)', now0);
if (!r5 || Math.round((r5 - now0) / 86400000) !== 24) newCards.push(`Cursor "(24 days)" format must still work, got ${r5}`);
if (newCards.length) {
  console.error(newCards.join('\n'));
  process.exit(1);
}
console.log('ok  Grok Bot and Gemini cards render with parsed reset countdowns');

// --- 7-day sparkline ---
const sparkProblems = [];
const nowTs = Date.now();
const sparkHist = [
  { id: 'grok-build', t: nowTs - 3 * 86400000, pct: 90 },
  { id: 'grok-build', t: nowTs - 2 * 86400000, pct: 70 },
  { id: 'grok-build', t: nowTs - 1 * 86400000, pct: 55 },
];
if (!ctx.sparkline(sparkHist, '#B78CF0').includes('<polyline')) sparkProblems.push('sparkline should draw a polyline from history');
if (ctx.sparkline([sparkHist[0]], '#B78CF0') !== '') sparkProblems.push('sparkline needs at least 2 points');
if (ctx.sparkline([{ id: 'grok-build', t: nowTs - 9 * 86400000, pct: 90 }, sparkHist[0]], '#B78CF0') !== '') {
  sparkProblems.push('points older than 7 days should be ignored');
}
if (!ctx.card('grok-build', grok, sparkHist, false).includes('class="spark"')) {
  sparkProblems.push('card with history should include the sparkline');
}
if (ctx.card('grok-build', grok, [], false).includes('class="spark"')) {
  sparkProblems.push('card without history should not include a sparkline');
}
if (sparkProblems.length) {
  console.error(sparkProblems.join('\n'));
  process.exit(1);
}
console.log('ok  Card shows a 7-day sparkline once there is enough history');

// --- Hair mascot: strands follow the average remaining % ---
const hairProblems = [];
const strandsOn = (html) => (html.match(/class="h"/g) || []).length;
const strandsOff = (html) => (html.match(/class="h off"/g) || []).length;
if (strandsOn(ctx.hairHead(100)) !== 24 || strandsOff(ctx.hairHead(100)) !== 0) hairProblems.push('100% should show all 24 strands');
if (strandsOn(ctx.hairHead(0)) !== 0 || strandsOff(ctx.hairHead(0)) !== 24) hairProblems.push('0% should hide all 24 strands');
if (strandsOn(ctx.hairHead(50)) !== 12) hairProblems.push('50% should show 12 strands');
if (!ctx.hairHead(80).includes('data-mood="smile"') || !ctx.hairHead(10).includes('data-mood="frown"') || !ctx.hairHead(30).includes('data-mood="flat"')) {
  hairProblems.push('mouth should smile above 50%, stay flat in the middle, and frown below 20%');
}
if (ctx.hairHead(100).includes('<line class="h"')) {
  hairProblems.push('hair should be filled tufts, not radiating lines');
}
ctx.render(); // grok at 67% is the only agent with data → average 67
if (els.hair.hidden) hairProblems.push('mascot should be visible by default once there is data');
if (!els.hair.innerHTML.includes('<svg')) hairProblems.push('mascot should render an SVG head');
if (!els.hair.title.includes('67%')) hairProblems.push(`mascot tooltip should carry the average 67%, got ${JSON.stringify(els.hair.title)}`);
if (strandsOn(els.hair.innerHTML) !== 16) hairProblems.push(`67% should show 16 strands, got ${strandsOn(els.hair.innerHTML)}`);
store.showHair = false;
ctx.render();
if (!els.hair.hidden) hairProblems.push('showHair=false should hide the mascot');
delete store.showHair;
ctx.render();
if (hairProblems.length) {
  console.error(hairProblems.join('\n'));
  process.exit(1);
}
console.log('ok  Hair mascot thins with the average remaining % and can be switched off');

// --- Floating buddy + stage activities ---
const buddyProblems = [];
if (ctx.activityStage(80) !== 'high' || ctx.activityStage(20) !== 'mid' || ctx.activityStage(10) !== 'low') {
  buddyProblems.push('activityStage should be high >50, mid >=20, low <20');
}
if (ctx.ACT_LIST.length !== 100) {
  buddyProblems.push(`activity pool should have 100 items, got ${ctx.ACT_LIST.length}`);
}
if (new Set(ctx.ACT_LIST.map((a) => a.id)).size !== 100) {
  buddyProblems.push('activity ids should be unique');
}
const stageCounts = { high: ctx.activityIds('high').length, mid: ctx.activityIds('mid').length, low: ctx.activityIds('low').length };
if (stageCounts.high + stageCounts.mid + stageCounts.low !== 100) {
  buddyProblems.push(`stage pools should cover all 100, got ${JSON.stringify(stageCounts)}`);
}
if (stageCounts.high < 30 || stageCounts.mid < 30 || stageCounts.low < 30) {
  buddyProblems.push(`each stage should have a large pool, got ${JSON.stringify(stageCounts)}`);
}
['actStretch', 'actWater', 'actWindow'].forEach((id) => {
  if (!ctx.activityIds('high').includes(id)) buddyProblems.push(`high pool missing ${id}`);
});
['actStand', 'actSquats', 'actEyes'].forEach((id) => {
  if (!ctx.activityIds('mid').includes(id)) buddyProblems.push(`mid pool missing ${id}`);
});
['actWalk', 'actGrass', 'actTea'].forEach((id) => {
  if (!ctx.activityIds('low').includes(id)) buddyProblems.push(`low pool missing ${id}`);
});
const picked = ctx.shufflePick(['a', 'b', 'c', 'd', 'e'], 3, () => 0.2);
if (picked.length !== 3 || new Set(picked).size !== 3) {
  buddyProblems.push(`shufflePick should return 3 unique ids, got ${JSON.stringify(picked)}`);
}
store.showHair = true;
delete store.activityPick;
delete store.activityOffer;
store.lastMovedAt = Date.now();
ctx.render();
if (els.buddy.hidden) buddyProblems.push('floating buddy should show when the mascot is on and there is data');
if (!els.acts.hidden) buddyProblems.push('activity list should stay away until the sit clock is due');
if (!els.veil.hidden) buddyProblems.push('veil should stay off until the sit clock is due');
if (els.grid.style.display === 'none') buddyProblems.push('cards should stay in the DOM when unlocked');
if (!els.grid.innerHTML) buddyProblems.push('unlocked cards should still render');
store.lastMovedAt = Date.now() - ctx.SIT_INTERVAL_MS - 1000;
delete store.activityDoneAt;
ctx.render();
if (els.acts.hidden) buddyProblems.push('when due, the 2–3 activities should show');
if (els.veil.hidden) buddyProblems.push('when due, the frosted veil should cover the cards');
if (els.grid.style.display === 'none') buddyProblems.push('due state should frost cards, not remove them');
const nBtns = (els.acts.innerHTML.match(/<button /g) || []).length;
if (nBtns < 2 || nBtns > 3) {
  buddyProblems.push(`should list 2–3 random activities, got ${nBtns} from ${els.acts.innerHTML}`);
}
if (!store.activityOffer || store.activityOffer.stage !== 'low') {
  buddyProblems.push('due render should persist a low-stage offer (hair is 0, not quota)');
}
if (!(store.activityOffer.ids || []).every((id) => ctx.activityIds('low').includes(id))) {
  buddyProblems.push('due activities should come from the low pool, not seated high-stage stretches');
}
const html1 = els.acts.innerHTML;
ctx.render();
if (els.acts.innerHTML !== html1) {
  buddyProblems.push('re-render should keep the same random offer');
}
store.activityPick = store.activityOffer.ids[0];
ctx.render();
if (els.veil.hidden) buddyProblems.push('picking an activity should keep the veil on');
if (els.grid.style.display === 'none') buddyProblems.push('picking should not unmount the cards');
if (!els.acts.innerHTML.includes('Doing:')) {
  buddyProblems.push(`doing state should name the pick, got ${els.acts.innerHTML}`);
}
if (!els.acts.innerHTML.includes('data-act="done"')) {
  buddyProblems.push('doing state should offer a Done button');
}
store.activityPick = null;
store.activityDoneAt = Date.now();
store.lastMovedAt = Date.now();
ctx.render();
if (!els.veil.hidden) buddyProblems.push('completing an activity should lift the veil');
if (!els.acts.hidden) {
  buddyProblems.push('completing an activity should dismiss the reminder');
}
store.lastMovedAt = Date.now() - ctx.SIT_INTERVAL_MS - 1000;
store.activityDoneAt = store.lastMovedAt;
store.activityOffer = null;
ctx.render();
if (els.acts.hidden) {
  buddyProblems.push('after the sit interval the 2–3 activities should come back');
}
if (els.veil.hidden) buddyProblems.push('after the sit interval the veil should come back');
const nBtns2 = (els.acts.innerHTML.match(/<button /g) || []).length;
if (nBtns2 < 2 || nBtns2 > 3) {
  buddyProblems.push(`after interval should list 2–3 new activities, got ${nBtns2}`);
}
store.showHair = false;
store.activityPick = 'actWater';
store.activityDoneAt = 0;
ctx.render();
if (!els.buddy.hidden) buddyProblems.push('showHair=false should hide the floating buddy');
if (!els.veil.hidden) buddyProblems.push('hiding the mascot should lift the veil');
if (els.grid.style.display === 'none') {
  buddyProblems.push('hiding the mascot should not hide the cards');
}
delete store.showHair;
delete store.activityPick;
delete store.activityDoneAt;
delete store.activityOffer;
store.lastMovedAt = Date.now();
ctx.render();
if (buddyProblems.length) {
  console.error(buddyProblems.join('\n'));
  process.exit(1);
}
console.log('ok  Sit clock frosts cards when due; pick keeps the veil; Done lifts it');

// --- Completing a move grows the hair back ---
const growProblems = [];
if (ctx.restoreHairBoost(10) !== 90 || ctx.restoreHairBoost(100) !== 0) {
  growProblems.push('restoreHairBoost should fill the gap to 100%');
}
if (ctx.displayHairPct(10, 90) !== 100 || ctx.displayHairPct(67, 0) !== 67) {
  growProblems.push('displayHairPct should add the exercise boost and cap at 100');
}
if (ctx.clampHairBoost(100, 40) !== 0) {
  growProblems.push('quota reset should drop leftover exercise boost');
}
store.activityPick = 'actWalk';
ctx.completeActivity();
if (!ctx.hairRegrowFx) growProblems.push('complete should arm the grow-back flash');
if (store.hairBoostPct !== 33) {
  growProblems.push(`complete at 67% remaining should set boost 33, got ${store.hairBoostPct}`);
}
if (store.activityPick != null) growProblems.push('complete should clear the pick');
if (store.activityOffer != null) growProblems.push('complete should clear the offer so the next round shuffles again');
const hairClasses = new Set();
els.hair.classList = {
  add: (c) => hairClasses.add(c),
  remove: (c) => { hairClasses.delete(c); },
  contains: (c) => hairClasses.has(c),
  toggle: (c, on) => {
    if (on === false) hairClasses.delete(c);
    else if (on === true || !hairClasses.has(c)) hairClasses.add(c);
    else hairClasses.delete(c);
  },
};
ctx.render();
if (strandsOn(els.hair.innerHTML) !== 24) {
  growProblems.push(`after Done, hair should be full (24), got ${strandsOn(els.hair.innerHTML)}`);
}
if (!els.hair.innerHTML.includes('data-mood="smile"')) growProblems.push('restored hair should smile');
if (!els.hair.title.includes('100%')) {
  growProblems.push(`restored tooltip should be 100%, got ${JSON.stringify(els.hair.title)}`);
}
if (!hairClasses.has('regrow')) growProblems.push('Done should put .regrow on the mascot');
if (!els.hair.innerHTML.includes('class="grow-fx"')) {
  growProblems.push('Done should sprinkle sparkles while hair grows back');
}
if ((els.hair.innerHTML.match(/class="grow-fx"/g) || []).length !== 1) {
  growProblems.push('sparkle overlay should appear once');
}
if ((els.hair.innerHTML.match(/<span class="grow-fx"[\s\S]*?<\/span>/) || [''])[0].split('<i ').length - 1 < 8) {
  growProblems.push('grow-back sparkles should have several stars');
}
if (ctx.sayPool('regrow', 'en').indexOf(els.say.textContent) === -1) {
  growProblems.push(`Done should blurt a grow-back line, got ${JSON.stringify(els.say.textContent)}`);
}
if (!ctx.hairHead(100).includes('style="--i:0"') || !ctx.hairHead(100).includes('style="--i:23"')) {
  growProblems.push('locks should carry --i so the sprout stagger can run');
}
if (!ctx.growFxMarkup().includes('class="grow-fx"')) growProblems.push('growFxMarkup should render the sparkle overlay');
const popupCss = readFileSync(resolve(root, 'popup.html'), 'utf8');
if (!/@keyframes hair-sprout/.test(popupCss) || !/@keyframes spark-pop/.test(popupCss) || !/@keyframes hair-flash/.test(popupCss)) {
  growProblems.push('regrow CSS should sprout locks, flash, and sparkle');
}
if (!/\.buddy\.wander \.mascot\.regrow/.test(popupCss)) {
  growProblems.push('regrow pop should override the idle bob');
}
if (!/\.mascot\.regrow \.h\.off/.test(popupCss)) {
  growProblems.push('locks that stay off during the flash must not pop back in');
}
store.agents = {
  'grok-build': {
    ...grok,
    limits: [{ label: 'Weekly (SuperGrok)', percent_left: 57, resets_text: grok.limits[0].resets_text }],
  },
};
ctx.render();
if (strandsOn(els.hair.innerHTML) !== 22) {
  growProblems.push(`further burn 57+33=90 should show 22 strands, got ${strandsOn(els.hair.innerHTML)}`);
}
if (els.hair.innerHTML.includes('grow-fx')) {
  growProblems.push('sparkles should not stick around on later renders');
}
store.agents = { 'grok-build': grok };
store.hairBoostPct = 90;
ctx.render();
if (store.hairBoostPct !== 33) {
  growProblems.push(`boost should clamp to 100-67=33, got ${store.hairBoostPct}`);
}
store.agents = { 'grok-build': grok };
delete store.hairBoostPct;
delete store.activityPick;
delete store.activityDoneAt;
ctx.render();
if (growProblems.length) {
  console.error(growProblems.join('\n'));
  process.exit(1);
}
console.log('ok  Completing a move restores hair to 100% with a sparkle; later burns thin it again');

// --- Sit-clock hair engine: 1h hard-burn / 2h normal, quota is a ceiling ---
const engineProblems = [];
const t0 = 1_700_000_000_000;
if (ctx.sitHairPct(0, ctx.SIT_INTERVAL_BURN_MS, t0) !== 100) {
  engineProblems.push('no lastMovedAt should leave the sit clock at 100');
}
if (ctx.sitHairPct(t0, ctx.SIT_INTERVAL_BURN_MS, t0) !== 100) {
  engineProblems.push('just-moved sit clock should be 100');
}
if (ctx.sitHairPct(t0, ctx.SIT_INTERVAL_BURN_MS, t0 + 30 * 60000) !== 50) {
  engineProblems.push('30 min into a 1h clock should be 50');
}
if (ctx.sitHairPct(t0, ctx.SIT_INTERVAL_BURN_MS, t0 + ctx.SIT_INTERVAL_BURN_MS) !== 0) {
  engineProblems.push('1h clock should hit 0 when the reminder is due');
}
if (ctx.sitHairPct(t0, ctx.SIT_INTERVAL_MS, t0 + ctx.SIT_INTERVAL_BURN_MS) !== 50) {
  engineProblems.push('1h into a 2h clock should be 50 — hair is not gone yet');
}
if (ctx.sitHairPct(t0, ctx.SIT_INTERVAL_MS, t0 + ctx.SIT_INTERVAL_MS) !== 0) {
  engineProblems.push('2h clock should hit 0 when the reminder is due');
}
if (ctx.sitDue(t0, null, t0 + 1000, 0) !== false) {
  engineProblems.push('interval 0 should fall back to the 2h clock, not fire immediately');
}
if (ctx.restoreDue(99, true, null) !== false) {
  engineProblems.push('99% hair must not ask to restore, even if the sit clock claims due');
}
if (ctx.restoreDue(50, true, null) !== false) {
  engineProblems.push('half-full hair must not ask to restore');
}
if (ctx.restoreDue(0, true, null) !== true) {
  engineProblems.push('bald + sit clock due should ask to restore');
}
if (ctx.restoreDue(99, true, 'actJaw') !== true) {
  engineProblems.push('an in-progress pick should keep the restore UI');
}
if (ctx.restoreDue(0, false, null) !== false) {
  engineProblems.push('bald but sit clock not due should not restore-nudge');
}
if (ctx.displayHairPct(10, 90, t0, ctx.SIT_INTERVAL_BURN_MS, t0) !== 100) {
  engineProblems.push('just after a move, sit clock should keep the restored 100');
}
if (ctx.displayHairPct(10, 90, t0, ctx.SIT_INTERVAL_BURN_MS, t0 + 30 * 60000) !== 50) {
  engineProblems.push('restored hair should be half gone 30 min into a 1h clock');
}
if (ctx.displayHairPct(10, 90, t0, ctx.SIT_INTERVAL_BURN_MS, t0 + ctx.SIT_INTERVAL_BURN_MS) !== 0) {
  engineProblems.push('restored hair should be gone when the 1h reminder fires');
}
if (ctx.displayHairPct(10, 90, t0, ctx.SIT_INTERVAL_MS, t0 + ctx.SIT_INTERVAL_BURN_MS) !== 50) {
  engineProblems.push('same 1h sit on a 2h clock should still show 50% hair');
}
if (ctx.displayHairPct(10, 0, t0, ctx.SIT_INTERVAL_MS, t0) !== 10) {
  engineProblems.push('quota should cap hair when there is no exercise boost');
}
if (ctx.displayHairPct(80, 20, t0, ctx.SIT_INTERVAL_BURN_MS, t0 + 6 * 60000) !== 90) {
  engineProblems.push('6 min into 1h (90% sit) should still show 90, not wait on quota');
}
const tick1h = ctx.nextSitHairTickMs(t0, ctx.SIT_INTERVAL_BURN_MS, t0);
if (tick1h !== 36000) {
  engineProblems.push(`1h clock should tick every 36s (1%), got ${tick1h}`);
}
const tick2h = ctx.nextSitHairTickMs(t0, ctx.SIT_INTERVAL_MS, t0);
if (tick2h !== 72000) {
  engineProblems.push(`2h clock should tick every 72s (1%), got ${tick2h}`);
}
if (ctx.nextSitHairTickMs(t0, ctx.SIT_INTERVAL_BURN_MS, t0 + ctx.SIT_INTERVAL_BURN_MS) !== 0) {
  engineProblems.push('no hair tick after the clock has run out');
}
const lateWait = ctx.nextSitHairTickMs(t0, ctx.SIT_INTERVAL_BURN_MS, t0 + ctx.SIT_INTERVAL_BURN_MS - 8000);
if (lateWait !== 8000) {
  engineProblems.push(`last tick should land on due (8s left), got ${lateWait}`);
}

store.agents = { 'grok-build': grok };
store.history = [];
store.hairBoostPct = 33;
store.lastMovedAt = Date.now() - ctx.SIT_INTERVAL_BURN_MS - 1000;
store.activityDoneAt = store.lastMovedAt;
delete store.activityPick;
delete store.activityOffer;
ctx.render();
if (strandsOn(els.hair.innerHTML) !== 12) {
  engineProblems.push(`1h into a 2h clock (no hard burn) should show ~12 strands, got ${strandsOn(els.hair.innerHTML)}`);
}
if (!els.hair.title.includes('50%')) {
  engineProblems.push(`1h into a 2h clock should read 50%, got ${JSON.stringify(els.hair.title)}`);
}

const nowHard = Date.now();
store.history = [
  { id: 'grok-build', t: nowHard - 90 * 60000, pct: 82 },
  { id: 'grok-build', t: nowHard - 2 * 60000, pct: 67 },
];
store.lastMovedAt = nowHard - ctx.SIT_INTERVAL_BURN_MS - 1000;
store.activityDoneAt = store.lastMovedAt;
store.activityOffer = null;
ctx.render();
if (ctx.sitIntervalMs(store.history, ['grok-build'], nowHard) !== ctx.SIT_INTERVAL_BURN_MS) {
  engineProblems.push('15% burn in 2h should switch the sit clock to 1 hour');
}
if (strandsOn(els.hair.innerHTML) !== 0 || strandsOff(els.hair.innerHTML) !== 24) {
  engineProblems.push(`1h hard-burn clock should finish all 24 strands, on=${strandsOn(els.hair.innerHTML)} off=${strandsOff(els.hair.innerHTML)}`);
}
if (!els.hair.title.includes('0%')) {
  engineProblems.push(`bald tooltip should be 0% when the 1h reminder fires, got ${JSON.stringify(els.hair.title)}`);
}
if (els.acts.hidden) engineProblems.push('1h hard-burn clock should also bring the move reminder');
if (els.veil.hidden) engineProblems.push('1h hard-burn clock should frost the cards when hair is gone');
if (!store.activityOffer || store.activityOffer.stage !== 'low') {
  engineProblems.push('when hair is gone the offer must be low-stage, not quota-high seated stretches');
}

store.history = [];
store.agents = { 'grok-build': grok };
delete store.hairBoostPct;
delete store.activityPick;
delete store.activityDoneAt;
delete store.activityOffer;
store.lastMovedAt = Date.now();
ctx.render();
if (engineProblems.length) {
  console.error(engineProblems.join('\n'));
  process.exit(1);
}
console.log('ok  Sit-clock hair finishes in 1h when burning hard, 2h otherwise');

// --- 99% hair must never ask you to "restore" it ---
const restoreProblems = [];
store.agents = {
  'grok-build': {
    ...grok,
    limits: [{ label: 'Weekly (SuperGrok)', percent_left: 99, resets_text: grok.limits[0].resets_text }],
  },
};
store.history = [];
delete store.hairBoostPct;
delete store.activityPick;
delete store.activityOffer;
store.lastMovedAt = Date.now();
store.activityDoneAt = store.lastMovedAt;
ctx.render();
if (!els.hair.title.includes('99%')) {
  restoreProblems.push(`fresh sit clock with 99% quota should read 99% hair, got ${JSON.stringify(els.hair.title)}`);
}
if (!els.acts.hidden) restoreProblems.push('99% hair must not list restore activities');
if (!els.veil.hidden) restoreProblems.push('99% hair must not frost the cards');
if (els.acts.innerHTML.includes('grow the hair') || els.acts.innerHTML.includes('长回来') || els.acts.innerHTML.includes('复原')) {
  restoreProblems.push('restore copy must not appear while hair is 99%');
}

store.lastMovedAt = Date.now() - ctx.SIT_INTERVAL_MS - 1000;
store.activityDoneAt = store.lastMovedAt;
store.activityOffer = null;
ctx.render();
if (!els.hair.title.includes('0%')) {
  restoreProblems.push(`after the sit clock, 99% quota should still show 0% hair, got ${JSON.stringify(els.hair.title)}`);
}
if (els.acts.hidden) restoreProblems.push('when hair is actually gone, restore activities should show');
if (!store.activityOffer || store.activityOffer.stage !== 'low') {
  restoreProblems.push(`gone hair should draw from the low pool, got ${JSON.stringify(store.activityOffer)}`);
}
if ((store.activityOffer.ids || []).some((id) => ctx.activityIds('high').includes(id))) {
  restoreProblems.push('must not offer seated high-stage stretches (jaw / calves) after a 2h sit');
}

store.agents = { 'grok-build': grok };
delete store.hairBoostPct;
delete store.activityPick;
delete store.activityOffer;
store.lastMovedAt = Date.now();
ctx.render();
if (restoreProblems.length) {
  console.error(restoreProblems.join('\n'));
  process.exit(1);
}
console.log('ok  99% hair never asks to restore; gone hair uses the leave-the-desk pool');

// --- Buddy wander: long smooth glides, not a ±18px fidget ---
const wanderProblems = [];
const panel = { minX: 8, minY: 8, maxX: 176, maxY: 472 };
if (ctx.WANDER_GLIDE_MS !== 7200) {
  wanderProblems.push(`glide should be 7.2s so a panel-wide roam is unhurried, got ${ctx.WANDER_GLIDE_MS}`);
}
if (ctx.WANDER_INTERVAL_MS < ctx.WANDER_GLIDE_MS || ctx.WANDER_INTERVAL_MS > ctx.WANDER_GLIDE_MS + 2000) {
  wanderProblems.push(`interval should sit just after the glide (${ctx.WANDER_GLIDE_MS}–${ctx.WANDER_GLIDE_MS + 2000}), got ${ctx.WANDER_INTERVAL_MS}`);
}
const midRnd = () => 0.5;
const east = ctx.wanderStep(20, 60, panel, midRnd, 0);
const eastDist = Math.hypot(east.x - 20, east.y - 60);
if (eastDist <= 18) {
  wanderProblems.push(`east step should travel farther than the old ±18px fidget, got ${eastDist.toFixed(1)}`);
}
if (east.x < panel.minX || east.x > panel.maxX || east.y < panel.minY || east.y > panel.maxY) {
  wanderProblems.push(`east step left the panel: ${JSON.stringify(east)}`);
}
const south = ctx.wanderStep(80, 80, panel, midRnd, Math.PI / 2);
const southDist = Math.hypot(south.x - 80, south.y - 80);
if (southDist < 80) {
  wanderProblems.push(`south step should cross a large share of the panel, got ${southDist.toFixed(1)}`);
}
if (south.y <= 80) wanderProblems.push('heading π/2 should move downward');
const stuck = ctx.wanderStep(8, 8, { minX: 8, minY: 8, maxX: 8, maxY: 8 }, midRnd, 1);
if (stuck.x !== 8 || stuck.y !== 8) {
  wanderProblems.push(`zero-span panel should stay put, got ${JSON.stringify(stuck)}`);
}
let sum = 0;
for (let i = 0; i < 24; i++) {
  const p = ctx.wanderStep(40 + i, 90, panel, () => ((i * 17) % 100) / 100, i * 0.4);
  if (p.x < panel.minX || p.x > panel.maxX || p.y < panel.minY || p.y > panel.maxY) {
    wanderProblems.push(`step ${i} left the panel: ${JSON.stringify(p)}`);
    break;
  }
  sum += Math.hypot(p.x - (40 + i), p.y - 90);
}
const avgDist = sum / 24;
if (avgDist < 40) {
  wanderProblems.push(`average wander step should roam, got ${avgDist.toFixed(1)}px`);
}
const htmlCss = readFileSync(resolve(root, 'popup.html'), 'utf8');
const layoutProblems = [];
if (/min-height:\s*100vh/.test(htmlCss)) {
  layoutProblems.push('side panel must not use 100vh — Chrome’s panel header clips the footer');
}
if (!/overflow-y:\s*auto/.test(htmlCss)) {
  layoutProblems.push('body should scroll inside the side panel (overflow-y: auto)');
}
if (!/class="bottom"/.test(htmlCss) || !/\.bottom\{/.test(htmlCss)) {
  layoutProblems.push('version + credits should sit in a .bottom footer that cannot be crushed');
}
if (!/\.hint:empty\{display:none/.test(htmlCss)) {
  layoutProblems.push('empty hint must not leave a gap above the version line');
}
if (!/<div class="bottom">[\s\S]*id="share"[\s\S]*id="credits"/.test(htmlCss)) {
  layoutProblems.push('Share button should sit in the footer/credits area, not the top toolbar');
}
if (/<div class="top">[\s\S]*id="share"[\s\S]*<div class="settings"/.test(htmlCss)) {
  layoutProblems.push('Share must not clutter the Refresh/settings row');
}
if (!/id="share-overlay"[\s\S]*hidden/.test(htmlCss) || !/class="share-card"/.test(htmlCss)) {
  layoutProblems.push('Share should open a hidden overlay card, not a copy-only toast');
}
if (!/id="share-shot"/.test(htmlCss) || !/\.share-card \.shot\{/.test(htmlCss)) {
  layoutProblems.push('share card should show a dashboard screenshot, not text-only');
}
if (!/\.share-overlay\{[^}]*z-index:\s*60/.test(htmlCss)) {
  layoutProblems.push('share overlay should sit above the mascot (z-index 40) and veil');
}
if (!/\.ver\{[^}]*overflow-wrap:\s*anywhere/.test(htmlCss)) {
  layoutProblems.push('version line should wrap instead of overflowing the panel');
}
if (layoutProblems.length) {
  console.error(layoutProblems.join('\n'));
  process.exit(1);
}
console.log('ok  Side panel footer can scroll and wrap instead of clipping');

if (!/transition:\s*left 7\.2s/.test(htmlCss) || !/top 7\.2s/.test(htmlCss)) {
  wanderProblems.push('buddy CSS glide should be 7.2s so it matches WANDER_GLIDE_MS');
}
if (!/\.buddy\.dragging\{[^}]*transition:\s*none\s*!important/.test(htmlCss)) {
  wanderProblems.push('dragging should disable the glide transition with !important so it beats the inline 7.2s style');
}
if (!/background:rgba\(20,22,28,\.2[0-8]\)/.test(htmlCss) || !/backdrop-filter:blur\(/.test(htmlCss)) {
  wanderProblems.push('buddy card should be a frosted glass so quota text shows through');
}
if (!/\.say\{[^}]*font-size:10px/.test(htmlCss) || /\.say\{[^}]*position:absolute/.test(htmlCss) || /bottom:calc\(100%/.test(htmlCss) || /\.say:after/.test(htmlCss)) {
  wanderProblems.push('say line should sit inside the plate, not float outside as a balloon');
}
if (wanderProblems.length) {
  console.error(wanderProblems.join('\n'));
  process.exit(1);
}
console.log('ok  Buddy wander takes long glides and stays inside the panel');

// --- Drag must ignore the 7.2s wander glide (inline transition beats .dragging CSS) ---
const dragProblems = [];
delete els.buddy.dataset.ready;
const dragListeners = {};
els.buddy.addEventListener = (type, fn) => {
  (dragListeners[type] = dragListeners[type] || []).push(fn);
};
const dragClasses = new Set();
els.buddy.classList = {
  add: (c) => dragClasses.add(c),
  remove: (c) => dragClasses.delete(c),
  contains: (c) => dragClasses.has(c),
  toggle: noop,
};
let visual = { left: 80, top: 120 };
els.buddy.getBoundingClientRect = () => ({
  left: visual.left,
  top: visual.top,
  width: 176,
  height: 200,
  right: visual.left + 176,
  bottom: visual.top + 200,
});
els.buddy.offsetWidth = 176;
els.buddy.offsetHeight = 200;
els.buddy.hidden = false;
ctx.initBuddy();
if (typeof ctx.buddyGlide !== 'function') dragProblems.push('buddyGlide should be a helper for the wander CSS');
if (!els.buddy.style.transition || !els.buddy.style.transition.includes(`${ctx.WANDER_GLIDE_MS}ms`)) {
  dragProblems.push(`init should set the ${ctx.WANDER_GLIDE_MS}ms inline glide, got ${JSON.stringify(els.buddy.style.transition)}`);
}
// Mid-glide: CSS left/top already sit at the wander target, but the plate is still on the way.
els.buddy.style.left = '300px';
els.buddy.style.top = '400px';
const fire = (type, event) => {
  (dragListeners[type] || []).forEach((fn) => fn(event));
};
fire('pointerdown', { target: els.buddy, clientX: 90, clientY: 130, pointerId: 1, button: 0, preventDefault: noop });
if (els.buddy.style.transition !== 'none') {
  dragProblems.push(`pointerdown must clear the inline glide, got ${JSON.stringify(els.buddy.style.transition)}`);
}
if (els.buddy.style.left !== '80px' || els.buddy.style.top !== '120px') {
  dragProblems.push(`pointerdown should snap to the on-screen plate, got ${els.buddy.style.left},${els.buddy.style.top}`);
}
if (!dragClasses.has('dragging')) dragProblems.push('pointerdown should add the dragging class');
const beforeWander = { left: els.buddy.style.left, top: els.buddy.style.top };
ctx.wanderBuddy();
if (els.buddy.style.left !== beforeWander.left || els.buddy.style.top !== beforeWander.top) {
  dragProblems.push('wander must not move the buddy while dragging');
}
visual = { left: parseFloat(els.buddy.style.left), top: parseFloat(els.buddy.style.top) };
fire('pointermove', { clientX: 150, clientY: 200, pointerId: 1 });
visual = { left: parseFloat(els.buddy.style.left), top: parseFloat(els.buddy.style.top) };
if (els.buddy.style.left !== '140px' || els.buddy.style.top !== '190px') {
  dragProblems.push(`pointermove should follow the cursor immediately, got ${els.buddy.style.left},${els.buddy.style.top}`);
}
if (els.buddy.style.transition !== 'none') {
  dragProblems.push('glide must stay off for the whole drag');
}
fire('pointerup', { pointerId: 1 });
if (dragClasses.has('dragging')) dragProblems.push('pointerup should drop the dragging class');
if (!els.buddy.style.transition || !els.buddy.style.transition.includes(`${ctx.WANDER_GLIDE_MS}ms`)) {
  dragProblems.push(`pointerup should restore the glide, got ${JSON.stringify(els.buddy.style.transition)}`);
}
if (!store.buddyPos || store.buddyPos.x !== 140 || store.buddyPos.y !== 190) {
  dragProblems.push(`drop should persist the new spot, got ${JSON.stringify(store.buddyPos)}`);
}
const glideAfter = els.buddy.style.transition;
fire('pointerdown', {
  target: { tagName: 'BUTTON', dataset: { act: 'walk' }, parentNode: els.buddy },
  clientX: 150, clientY: 200, pointerId: 2, button: 0, preventDefault: noop,
});
if (els.buddy.style.transition !== glideAfter) {
  dragProblems.push('clicking an activity button should not start a drag');
}
if (dragProblems.length) {
  console.error(dragProblems.join('\n'));
  process.exit(1);
}
console.log('ok  Dragging the mascot follows the cursor instead of the 7.2s wander glide');

// --- Occasional mouth blurts, stage + language aware ---
const sayProblems = [];
['high', 'mid', 'low', 'due', 'regrow'].forEach((stage) => {
  ['zh', 'en'].forEach((lang) => {
    const pool = ctx.sayPool(stage, lang);
    if (pool.length < 8) sayProblems.push(`${stage}/${lang} should have ≥8 lines, got ${pool.length}`);
    if (new Set(pool).size !== pool.length) sayProblems.push(`${stage}/${lang} has duplicate lines`);
    if (lang === 'zh' && pool.some((s) => !/[\u4e00-\u9fff]/.test(s))) {
      sayProblems.push(`${stage}/zh should be spoken Chinese: ${JSON.stringify(pool)}`);
    }
    if (lang === 'en' && pool.some((s) => /[\u4e00-\u9fff]/.test(s) || !s.trim())) {
      sayProblems.push(`${stage}/en should be English-only spoken lines`);
    }
  });
});
if (ctx.sayStage(80, false) !== 'high' || ctx.sayStage(30, false) !== 'mid' || ctx.sayStage(10, false) !== 'low') {
  sayProblems.push('sayStage should follow hair high/mid/low');
}
if (ctx.sayStage(80, true) !== 'due') sayProblems.push('due sit clock should use the stretch lines');
const pickedSay = ctx.pickSay('high', 'zh', [], () => 0);
if (ctx.sayPool('high', 'zh').indexOf(pickedSay) === -1) sayProblems.push('pickSay should return a high/zh line');
const avoided = ctx.sayPool('high', 'zh')[0];
const next = ctx.pickSay('high', 'zh', [avoided], () => 0);
if (next === avoided) sayProblems.push('pickSay should skip the last line when others exist');
store.showHair = true;
store.lastMovedAt = Date.now();
ctx.render();
const said = ctx.blurtSay(80, false, () => 0);
if (!said) sayProblems.push('blurtSay should return a line when the buddy is visible');
if (els.say.hidden) sayProblems.push('blurtSay should unhide the bubble');
if (els.say.textContent !== said) sayProblems.push(`bubble text should match, got ${JSON.stringify(els.say.textContent)}`);
if (els.say.textContent.includes('<')) sayProblems.push('say must use textContent, not HTML');
ctx.blurtSay(10, false, () => 0);
if (ctx.sayPool('low', 'en').indexOf(els.say.textContent) === -1 && ctx.sayPool('low', 'zh').indexOf(els.say.textContent) === -1) {
  sayProblems.push(`10% hair should pick a low-stage line, got ${JSON.stringify(els.say.textContent)}`);
}
const grewLine = ctx.blurtSay(100, false, () => 0, 'regrow');
if (ctx.sayPool('regrow', 'en').indexOf(grewLine) === -1) {
  sayProblems.push(`regrow blurt should pick a grow-back line, got ${JSON.stringify(grewLine)}`);
}
ctx.hideSay();
if (!els.say.hidden) sayProblems.push('hideSay should hide the bubble');
store.showHair = false;
ctx.render();
if (!els.say.hidden) sayProblems.push('hiding the mascot should hide the bubble');
delete store.showHair;
store.lastMovedAt = Date.now();
ctx.render();
if (sayProblems.length) {
  console.error(sayProblems.join('\n'));
  process.exit(1);
}
console.log('ok  Mascot occasionally blurts stage-aware spoken lines');

// --- Scraped text is escaped before hitting innerHTML ---
const escProblems = [];
const evil = {
  id: 'cursor',
  name: 'Cursor<img src=x onerror=alert(1)>',
  scraped_at: Date.now(),
  plan: '<b>Pro</b> $20/mo',
  credits: '<script>steal()</script>',
  limits: [{ label: '"><svg onload=alert(2)>', percent_left: 50, resets_text: '<img src=x onerror=alert(3)>' }],
};
const evilHtml = ctx.card('cursor', evil, [], false);
if (evilHtml.includes('<img') || evilHtml.includes('<script>') || evilHtml.includes('<svg onload') || evilHtml.includes('<b>Pro</b>')) {
  escProblems.push('scraped markup must not survive into card HTML');
}
if (!evilHtml.includes('&lt;img')) escProblems.push('scraped markup should be HTML-escaped, not dropped');
const evilBd = ctx.breakdownBar([{ name: '"><i onmouseover=x>', percent: 40 }]);
if (evilBd.includes('"><i onmouseover')) escProblems.push('breakdown names must be escaped in title/legend');
if (escProblems.length) {
  console.error(evilHtml);
  console.error(evilBd);
  console.error(escProblems.join('\n'));
  process.exit(1);
}
console.log('ok  Scraped page text is escaped before rendering');

// --- Stale refresh.running must not lock the Refresh button forever ---
const staleProblems = [];
store.refresh = { running: true, started: Date.now() - 10 * 60000 };
ctx.render();
if (els.refresh.disabled) staleProblems.push('stale running (10 min old) must not disable the button');
if (els.refresh.textContent !== 'Refresh') staleProblems.push(`stale running should show Refresh, got ${JSON.stringify(els.refresh.textContent)}`);
store.refresh = { running: true, started: Date.now() };
ctx.render();
if (!els.refresh.disabled) staleProblems.push('a fresh running refresh should disable the button');
store.refresh = {};
els.refresh.disabled = false;
ctx.render();
if (staleProblems.length) {
  console.error(staleProblems.join('\n'));
  process.exit(1);
}
console.log('ok  Stuck refresh.running older than 2.5 min unlocks the Refresh button');

let langDone = false;
ctx.setLang('zh', () => { langDone = true; });
if (!langDone) {
  console.error('setLang should invoke its callback');
  process.exit(1);
}
if (store.uiLang !== 'zh') {
  console.error('expected uiLang persisted as zh, got', store.uiLang);
  process.exit(1);
}
if (ctx.currentLang() !== 'zh') {
  console.error('expected currentLang zh after toggle, got', ctx.currentLang());
  process.exit(1);
}

const htmlZh = ctx.card('grok-build', grok, []);
const zhProblems = [];
if (!htmlZh.includes('聊天 16%')) zhProblems.push('Chinese card should show 聊天 16%');
if (!htmlZh.includes('构建 10%')) zhProblems.push('Chinese card should show 构建 10%');
if (!htmlZh.includes('自动 6%')) zhProblems.push('Chinese card should show 自动 6%');
if (!htmlZh.includes('绘图 1%')) zhProblems.push('Chinese card should show 绘图 1%');
if (!htmlZh.includes('>剩余<')) zhProblems.push('Chinese card should say 剩余');
if (htmlZh.includes('>left<')) zhProblems.push('Chinese card should not say left');
if (els.lang.textContent !== 'EN') zhProblems.push(`Chinese UI should show an EN button, got ${JSON.stringify(els.lang.textContent)}`);
if (els.refresh.textContent !== '刷新') zhProblems.push(`Chinese refresh label should be 刷新, got ${JSON.stringify(els.refresh.textContent)}`);
if (els.share.textContent !== '分享') zhProblems.push(`Chinese share label should be 分享, got ${JSON.stringify(els.share.textContent)}`);
if (els['share-title'].textContent !== '分享 Token Police') {
  zhProblems.push(`Chinese share title, got ${JSON.stringify(els['share-title'].textContent)}`);
}
if (!els['share-pitch'].textContent.includes('侧边栏')) {
  zhProblems.push(`Chinese share pitch, got ${JSON.stringify(els['share-pitch'].textContent)}`);
}
if (els['share-copy'].textContent !== '复制链接' && els['share-copy'].textContent !== '已复制') {
  zhProblems.push(`Chinese copy button, got ${JSON.stringify(els['share-copy'].textContent)}`);
}
if (els['share-x'].textContent !== '分享到 X') zhProblems.push(`Chinese X button, got ${JSON.stringify(els['share-x'].textContent)}`);
if (!ctx.shareTweetText().includes('侧边栏') || !ctx.shareTweetText().includes('https://token-police.philosophie.ai/')) {
  zhProblems.push('Chinese tweet should keep the landing URL');
}
if (els['share-shot'].src !== 'icons/share-preview-zh.webp') {
  zhProblems.push(`Chinese share card should show the zh panel screenshot, got ${JSON.stringify(els['share-shot'].src)}`);
}
if (els['brand-name'].textContent !== 'TOKEN POLICE') {
  zhProblems.push(`Chinese brand, got ${JSON.stringify(els['brand-name'].textContent)}`);
}
if (popupCtx.document.documentElement.lang !== 'zh') {
  zhProblems.push(`<html lang> should be zh after toggle, got ${popupCtx.document.documentElement.lang}`);
}

if (zhProblems.length) {
  console.error(htmlZh);
  console.error(zhProblems.join('\n'));
  process.exit(1);
}
console.log('ok  中文 toggle switches dashboard strings and persists uiLang=zh');

ctx.setLang('en');
if (ctx.currentLang() !== 'en' || store.uiLang !== 'en') {
  console.error('switching back to English failed', ctx.currentLang(), store.uiLang);
  process.exit(1);
}
if (els.lang.textContent !== '中文') {
  console.error('English UI should show 中文 again, got', els.lang.textContent);
  process.exit(1);
}
console.log('ok  EN toggle restores English');

const savedStore = { agents: { 'grok-build': grok }, history: [], uiLang: 'zh' };
const els2 = {
  refresh: el(),
  lang: el(),
  'brand-name': el(),
  legend: el(),
  grid: el(),
  upd: el(),
  hint: el(),
  ver: el(),
};
const reloadCtxObj = {
  chrome: {
    i18n: { getUILanguage: () => 'en-US' },
    storage: {
      local: {
        get: (keys, cb) => {
          const out = {};
          const list = Array.isArray(keys) ? keys : Object.keys(savedStore);
          for (const k of list) {
            if (savedStore[k] !== undefined) out[k] = savedStore[k];
          }
          cb && cb(out);
        },
        set: (obj, cb) => { Object.assign(savedStore, obj); cb && cb(); },
      },
      onChanged: { addListener: noop },
    },
    runtime: {
      sendMessage: noop,
      getContexts: () => Promise.resolve([]),
      getURL: (p) => p,
      getManifest: () => ({ version: '1.2.1' }),
      lastError: null,
    },
    sidePanel: { open: () => Promise.resolve() },
    windows: { getLastFocused: (_opts, cb) => cb({ id: 1 }), create: noop },
  },
  document: {
    documentElement: { lang: 'en' },
    getElementById: (id) => els2[id] || null,
    body: { classList: { add: noop }, style: {} },
  },
  location: { href: 'chrome-extension://id/popup.html' },
  setTimeout: noop,
  setInterval: noop,
  clearInterval: noop,
  window: { innerWidth: 380, innerHeight: 720 },
};
const reloadCtx = vm.createContext(reloadCtxObj);
vm.runInContext(readFileSync(resolve(root, 'agents.js'), 'utf8'), reloadCtx, { filename: 'agents.js' });
vm.runInContext(readFileSync(resolve(root, 'activities.js'), 'utf8'), reloadCtx, { filename: 'activities.js' });
vm.runInContext(readFileSync(resolve(root, 'update.js'), 'utf8'), reloadCtx, { filename: 'update.js' });
vm.runInContext(readFileSync(resolve(root, 'i18n.js'), 'utf8'), reloadCtx, { filename: 'i18n.js' });
vm.runInContext(readFileSync(resolve(root, 'popup.js'), 'utf8'), reloadCtx, { filename: 'popup.js' });
if (reloadCtx.currentLang() !== 'zh') {
  console.error('saved uiLang=zh should reload as Chinese, got', reloadCtx.currentLang());
  process.exit(1);
}
if (els2.lang.textContent !== 'EN' || !els2.grid.innerHTML.includes('剩余')) {
  console.error('reloaded Chinese dashboard mismatch', els2.lang.textContent, els2.grid.innerHTML);
  process.exit(1);
}
console.log('ok  Persisted uiLang=zh is restored on next open');

sent = [];
sideOpened = 0;
windowsCreated = 0;
els.refresh.disabled = false;
ctx.startRefresh();
ctx.startRefresh();
if (!sent.some((m) => m && m.type === 'refreshAll')) {
  console.error('expected refreshAll, got', sent);
  process.exit(1);
}
if (sent.filter((m) => m && m.type === 'refreshAll').length !== 1) {
  console.error('Refresh should fire once while the button is disabled, got', sent);
  process.exit(1);
}
if (sideOpened !== 0) {
  console.error('Refresh must not open another side panel, got', sideOpened);
  process.exit(1);
}
if (windowsCreated !== 0) {
  console.error('Refresh must not create extra popup windows (the flashing bug), got', windowsCreated);
  process.exit(1);
}
console.log('ok  Refresh scrapes only and does not stack windows');

console.log('\nPopup card test passed.');
