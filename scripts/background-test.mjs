// Exercise background.js: serialized storage writes, empty toolbar badge,
// low-quota notifications, and the hourly quiet-check alarm. Storage
// callbacks are async (setTimeout) exactly so an unserialized
// implementation would interleave and lose an update.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const clone = (v) => JSON.parse(JSON.stringify(v));
const tick = (n = 3) => new Promise((r) => setTimeout(r, n));

const store = {};
let onMessage = null;
const removedTabs = [];
const createdTabs = [];
const badge = { texts: [], colors: [] };
const alarms = { created: [], cleared: 0, listener: null, live: {} };
const notifications = [];
const fetches = [];
// 假的 GitHub API：默认回 v9.9.9（比任何已装版本都新）；可以改成失败
let fetchReply = { ok: true, json: () => Promise.resolve({ tag_name: 'v9.9.9', html_url: 'https://github.com/jjliu6/token-police/releases/tag/v9.9.9' }) };
const storageListeners = [];
const onRemovedListeners = [];
let nextTabId = 100;

const ctxObj = {
  setTimeout,
  clearTimeout,
  fetch: (url, opts) => { fetches.push({ url, opts }); return Promise.resolve(fetchReply); },
  chrome: {
    storage: {
      local: {
        get: (keys, cb) => {
          const out = {};
          (Array.isArray(keys) ? keys : [keys]).forEach((k) => {
            if (store[k] !== undefined) out[k] = clone(store[k]);
          });
          setTimeout(() => cb(out), 0);
        },
        set: (obj, cb) => {
          setTimeout(() => {
            const changes = {};
            Object.keys(obj).forEach((k) => { changes[k] = { newValue: clone(obj[k]) }; });
            Object.assign(store, clone(obj));
            if (cb) cb();
            storageListeners.forEach((fn) => fn(changes, 'local'));
          }, 0);
        },
        remove: (keys, cb) => {
          setTimeout(() => {
            const changes = {};
            (Array.isArray(keys) ? keys : [keys]).forEach((k) => { if (store[k] !== undefined) { changes[k] = { oldValue: clone(store[k]) }; delete store[k]; } });
            if (cb) cb();
            if (Object.keys(changes).length) storageListeners.forEach((fn) => fn(changes, 'local'));
          }, 0);
        },
      },
      onChanged: { addListener: (fn) => storageListeners.push(fn) },
    },
    runtime: {
      onMessage: { addListener: (fn) => { onMessage = fn; } },
      getManifest: () => ({ version: '1.2.1' }),
      lastError: null,
    },
    tabs: {
      create: (opts, cb) => {
        createdTabs.push(clone(opts));
        const id = nextTabId++;
        setTimeout(() => {
          if (cb) cb({ id });
          // 标签页"抓完自动关"：马上触发 onRemoved，让 openAndWait 尽快 resolve
          setTimeout(() => onRemovedListeners.slice().forEach((fn) => fn(id)), 0);
        }, 0);
      },
      remove: (id, cb) => { removedTabs.push(id); if (cb) cb(); },
      onRemoved: {
        addListener: (fn) => onRemovedListeners.push(fn),
        removeListener: (fn) => {
          const i = onRemovedListeners.indexOf(fn);
          if (i >= 0) onRemovedListeners.splice(i, 1);
        },
      },
    },
    action: {
      setBadgeText: ({ text }) => badge.texts.push(text),
      setBadgeBackgroundColor: ({ color }) => badge.colors.push(color),
    },
    alarms: {
      // create 覆盖同名闹钟（真实 Chrome 会取消旧的重建）；live 记录当前存在哪些闹钟，
      // 好让 get 像真实 API 那样异步回调告知某个闹钟是否已存在。
      create: (name, info) => { alarms.created.push({ name, ...info }); alarms.live[name] = { name, ...info }; },
      clear: (name, cb) => { alarms.cleared++; delete alarms.live[name]; if (cb) cb(); },
      get: (name, cb) => { setTimeout(() => cb(alarms.live[name] || null), 0); },
      onAlarm: { addListener: (fn) => { alarms.listener = fn; } },
    },
    notifications: {
      create: (id, opts, cb) => { notifications.push({ id, ...opts }); if (cb) cb(); },
    },
    sidePanel: { setPanelBehavior: () => Promise.resolve() },
  },
};
const ctx = vm.createContext(ctxObj);
ctxObj.importScripts = (...files) => files.forEach((f) =>
  vm.runInContext(readFileSync(resolve(root, f), 'utf8'), ctx, { filename: f }));
vm.runInContext(readFileSync(resolve(root, 'background.js'), 'utf8'), ctx, { filename: 'background.js' });

if (typeof onMessage !== 'function') {
  console.error('background.js should register an onMessage listener');
  process.exit(1);
}

// update.js 的 const 不会挂到 ctx 对象上
const UPDATE_PAGE = vm.runInContext('UPDATE_PAGE', ctx);

function send(msg) {
  return new Promise((res) => {
    const ret = onMessage(msg, { tab: { id: 7 } }, res);
    if (ret !== true) res(); // 非异步分支：立即完成
  });
}

const agentData = (agent) => ({ type: 'agentData', agent });
const problems = [];
await tick();

// 1) 两个 agent 同时抓完：都必须写进去，谁也不能覆盖谁
const now = Date.now();
await Promise.all([
  send(agentData({ id: 'claude-code', scraped_at: now, limits: [{ label: 'Weekly (All models)', percent_left: 80 }] })),
  send(agentData({ id: 'codex', scraped_at: now, limits: [{ label: 'Weekly', percent_left: 60 }] })),
]);
if (!store.agents || !store.agents['claude-code'] || !store.agents.codex) {
  problems.push(`concurrent saves lost an agent: ${JSON.stringify(Object.keys(store.agents || {}))}`);
}
if (!store.history || store.history.length !== 2) {
  problems.push(`expected 2 history entries, got ${JSON.stringify(store.history)}`);
}

// 2) Cursor 分两页：后到的一页要合并、不能丢掉先到那页的字段
await send(agentData({ id: 'cursor', scraped_at: now + 1, limits: [{ label: 'Cursor Models', percent_left: 40 }] }));
await send(agentData({ id: 'cursor', scraped_at: now + 2, tokens: { total: 5e6 } }));
const cursor = store.agents && store.agents.cursor;
if (!cursor || !cursor.limits || !cursor.tokens) {
  problems.push(`cursor pages should merge (limits + tokens), got ${JSON.stringify(cursor)}`);
}

// 3) 5 分钟内同值不重复记历史
await send(agentData({ id: 'codex', scraped_at: now + 60000, limits: [{ label: 'Weekly', percent_left: 60 }] }));
if (store.history.filter((h) => h.id === 'codex').length !== 1) {
  problems.push('unchanged pct within 5 min should not add a history entry');
}

// 4) closeMe 仍然关掉发消息的标签页
await send({ type: 'closeMe' });
if (!removedTabs.includes(7)) problems.push('closeMe should remove the sender tab');

// 5) 工具栏徽章不再显示剩余%（启动时清空；写数据 / 改勾选也不再写数字）
await tick(10);
const badgeHasMetric = (texts) => texts.some((t) => t !== '');
if (badgeHasMetric(badge.texts)) {
  problems.push(`badge must stay empty after agent data, got ${JSON.stringify(badge.texts)}`);
}

// 6) 取消勾选 cursor：徽章仍应为空（不再按最低剩余%重算）
await new Promise((r) => ctxObj.chrome.storage.local.set({ enabledAgents: { cursor: false } }, r));
await tick(10);
if (badgeHasMetric(badge.texts)) {
  problems.push(`toggling enabledAgents must not write a badge number, got ${JSON.stringify(badge.texts)}`);
}

// 7) 低额度通知：只在跌破阈值那一刻触发（动一动提醒默认开，这里只数 low- 通知）
const lows = () => notifications.filter((n) => n.id.startsWith('low-'));
const notify = async (pct, t) => { await send(agentData({ id: 'codex', scraped_at: t, limits: [{ label: 'Weekly', percent_left: pct }] })); await tick(10); };
await notify(12, now + 120000); // 60 → 12：跌破 15
if (lows().length !== 1 || !lows()[0].title.includes('12% left')) {
  problems.push(`crossing 15% should notify once, got ${JSON.stringify(lows())}`);
}
await notify(10, now + 180000); // 12 → 10：没有新的穿越
if (lows().length !== 1) problems.push('no crossing → no extra notification');
await notify(4, now + 240000); // 10 → 4：跌破 5
if (lows().length !== 2) problems.push('crossing 5% should notify again');
await notify(90, now + 300000); // 重置回 90：不通知
if (lows().length !== 2) problems.push('reset upward must not notify');
await notify(9, now + 360000); // 90 → 9：新周期再次跌破 15
if (lows().length !== 3) problems.push('crossing 15% after a reset should notify again');

// 8) notifyLow=false 关掉通知
await new Promise((r) => ctxObj.chrome.storage.local.set({ notifyLow: false }, r));
await notify(95, now + 420000);
await notify(8, now + 480000);
if (lows().length !== 3) problems.push('notifyLow=false should suppress notifications');
await new Promise((r) => ctxObj.chrome.storage.local.set({ notifyLow: true }, r));

// 9) 闹钟：默认创建；autoRefresh=false 清除；true 恢复
if (!alarms.created.some((a) => a.name === 'quietRefresh' && a.periodInMinutes === 60)) {
  problems.push('startup should create the hourly quietRefresh alarm');
}
await new Promise((r) => ctxObj.chrome.storage.local.set({ autoRefresh: false }, r));
await tick(10);
if (alarms.cleared < 1) problems.push('autoRefresh=false should clear the alarm');
await new Promise((r) => ctxObj.chrome.storage.local.set({ autoRefresh: true }, r));
await tick(10);

// 10) 静默检查：所有勾选产品都在后台标签页尝试（cursor 已取消勾选 → 不开）
const before = createdTabs.length;
alarms.listener({ name: 'quietRefresh' });
await tick(15);
const quiet = createdTabs.slice(before);
if (!quiet.length || quiet.some((o) => o.active !== false)) {
  problems.push(`quiet check must only open background tabs, got ${JSON.stringify(quiet)}`);
}
const urls = quiet.map((o) => o.url).join(' ');
if (!urls.includes('claude.ai') || !urls.includes('chatgpt.com') || !urls.includes('grok.com')) {
  problems.push(`quiet check should cover all enabled agents, got ${urls}`);
}
// cursor 取消勾选 → 它自己的 usage 页不开；但 grok-bot 还勾着，共用的 spending 页仍要开
if (urls.includes('cursor.com/dashboard/usage')) problems.push('quiet check must skip unchecked agents');
if (!urls.includes('cursor.com/dashboard/spending')) problems.push('quiet check should still open the spending page for Grok Bot');
if (!urls.includes('gemini.google.com')) problems.push('quiet check should include Gemini');

// 11) Cursor 和 Grok Bot 共用 spending 页：勾选全部时同一 URL 只开一次
await new Promise((r) => ctxObj.chrome.storage.local.set({ enabledAgents: {} }, r));
await tick(10);
const before2 = createdTabs.length;
alarms.listener({ name: 'quietRefresh' });
await tick(15);
const all = createdTabs.slice(before2).map((o) => o.url);
const spending = all.filter((u) => u.startsWith('https://cursor.com/dashboard/spending'));
if (spending.length !== 1) problems.push(`shared spending page should open once, got ${JSON.stringify(all)}`);
if (!all.some((u) => u.startsWith('https://cursor.com/dashboard/usage'))) problems.push('cursor usage page should still open');

// 12) 手动 Refresh：也去重；Cursor 抓到、Grok Bot 没抓到 → grok-bot 标为 missing（不是 fail）
// 假标签页一打开就"抓完关掉"，整轮刷新几毫秒就结束；所以先把 cursor/gemini 的数据
// 用"未来"的 scraped_at 写好，模拟这一轮抓到了它们，其它产品没抓到
const before3 = createdTabs.length;
const t0 = Date.now();
await send(agentData({ id: 'cursor', scraped_at: t0 + 60000, limits: [{ label: 'Cursor Models', percent_left: 30 }] }));
await send(agentData({ id: 'gemini', scraped_at: t0 + 60000, limits: [{ label: 'Weekly', percent_left: 90 }] }));
await send(agentData({ id: 'codex', scraped_at: t0 - 60000, limits: [{ label: 'Weekly', percent_left: 60 }] }));
await send(agentData({ id: 'grok-build', scraped_at: t0 - 60000, limits: [{ label: 'Weekly (SuperGrok)', percent_left: 60 }] }));
onMessage({ type: 'refreshAll' }, {}, () => {});
await tick(80);
const manual = createdTabs.slice(before3).map((o) => o.url);
if (manual.filter((u) => u.startsWith('https://cursor.com/dashboard/spending')).length !== 1) {
  problems.push(`manual refresh should open the spending page once, got ${JSON.stringify(manual)}`);
}
const rr = store.refresh && store.refresh.results;
if (!rr || rr.cursor !== 'ok' || rr.gemini !== 'ok') problems.push(`refresh results should mark cursor/gemini ok, got ${JSON.stringify(rr)}`);
if (!rr || rr['grok-bot'] !== 'missing') problems.push(`grok-bot should be 'missing' when cursor was read but no Grok Bot section, got ${JSON.stringify(rr)}`);
if (!rr || rr['grok-build'] !== 'fail') problems.push(`an agent whose page never reported should stay 'fail', got ${JSON.stringify(rr)}`);
if (badge.texts.includes('…') || badgeHasMetric(badge.texts)) {
  problems.push(`refresh must not put a number or ellipsis on the badge, got ${JSON.stringify(badge.texts)}`);
}

// 13) 更新检查：启动时查一次 GitHub、存结果；每天一次的闹钟；关掉开关就清掉
await tick(10);
if (fetches.length !== 1 || !fetches[0].url.startsWith('https://api.github.com/repos/jjliu6/token-police/releases/latest')) {
  problems.push(`startup should ask the GitHub releases API once, got ${JSON.stringify(fetches)}`);
}
if (!store.updateCheck || store.updateCheck.latest !== '9.9.9' || !store.updateCheck.checkedAt) {
  problems.push(`updateCheck should record the latest release, got ${JSON.stringify(store.updateCheck)}`);
}
if (!store.updateCheck || store.updateCheck.url !== UPDATE_PAGE) {
  problems.push(`updateCheck should store the landing page url, got ${JSON.stringify(store.updateCheck)}`);
}
if (!alarms.created.some((a) => a.name === 'updateCheck' && a.periodInMinutes === 1440)) {
  problems.push(`startup should create a daily updateCheck alarm, got ${JSON.stringify(alarms.created)}`);
}
// 闹钟到点：强制再查一次
alarms.listener({ name: 'updateCheck' });
await tick(10);
if (fetches.length !== 2) problems.push(`alarm should re-check, got ${fetches.length} fetches`);
// 查失败：保留上次结果，只记 failedAt
fetchReply = { ok: false, status: 503 };
alarms.listener({ name: 'updateCheck' });
await tick(10);
if (!store.updateCheck || store.updateCheck.latest !== '9.9.9' || !store.updateCheck.failedAt) {
  problems.push(`a failed check must keep the last result and note failedAt, got ${JSON.stringify(store.updateCheck)}`);
}
// GitHub 的 html_url 只用于查版本，用户点击始终去落地页
fetchReply = { ok: true, json: () => Promise.resolve({ tag_name: 'v9.9.9', html_url: 'https://evil.example/x' }) };
alarms.listener({ name: 'updateCheck' });
await tick(10);
if (!store.updateCheck || store.updateCheck.url !== UPDATE_PAGE) {
  problems.push(`stored update url should always be the landing page, got ${JSON.stringify(store.updateCheck)}`);
}
// 关掉开关：清闹钟、清结果、不再请求
const clearedBefore = alarms.cleared;
const fetchesBefore = fetches.length;
await new Promise((r) => ctxObj.chrome.storage.local.set({ checkUpdates: false }, r));
await tick(10);
if (alarms.cleared <= clearedBefore) problems.push('checkUpdates=false should clear the updateCheck alarm');
if (store.updateCheck !== undefined) problems.push(`checkUpdates=false should drop the stored result, got ${JSON.stringify(store.updateCheck)}`);
alarms.listener({ name: 'updateCheck' });
await tick(10);
if (fetches.length !== fetchesBefore) problems.push('checkUpdates=false must not contact GitHub');
// 打开开关：马上查一次
await new Promise((r) => ctxObj.chrome.storage.local.set({ checkUpdates: true }, r));
await tick(10);
if (fetches.length !== fetchesBefore + 1) problems.push('checkUpdates=true should check right away');
if (!store.updateCheck || store.updateCheck.latest !== '9.9.9') problems.push('re-enabling should store a fresh result');

// 关键回归：闹钟已存在时不该被重复创建。service worker 反复重启会重跑 syncUpdateAlarm/
// syncAlarm；若每次都 create，会把周期倒计时清零，闹钟永远走不到点、从不触发（正是
// "装着旧版却一直显示 up to date" 的根因）。此刻两个闹钟都已存在，再触发一次 sync
// （模拟重启 / 重复写设置）不应新增 create。
const upCreatedBefore = alarms.created.filter((a) => a.name === 'updateCheck').length;
await new Promise((r) => ctxObj.chrome.storage.local.set({ checkUpdates: true }, r));
await tick(10);
if (alarms.created.filter((a) => a.name === 'updateCheck').length !== upCreatedBefore) {
  problems.push('re-syncing must not recreate an existing updateCheck alarm (that would reset its daily countdown so it never fires)');
}
const qrCreatedBefore = alarms.created.filter((a) => a.name === 'quietRefresh').length;
await new Promise((r) => ctxObj.chrome.storage.local.set({ autoRefresh: true }, r));
await tick(10);
if (alarms.created.filter((a) => a.name === 'quietRefresh').length !== qrCreatedBefore) {
  problems.push('re-syncing must not recreate an existing quietRefresh alarm (that would reset its hourly countdown so it never fires)');
}

// 11) 动一动提醒：默认开；2 小时内烧掉 >10% 才提醒；2 小时冷却；关掉开关就不提醒；只算重置之后的消耗
const H = 3600000;
const T = now + 30 * 86400000; // 远离前面的历史，互不干扰
const grok = async (pct, t) => { await send(agentData({ id: 'grok-build', scraped_at: t, limits: [{ label: 'Weekly (SuperGrok)', percent_left: pct }] })); await tick(10); };
const moves = () => notifications.filter((n) => n.id.startsWith('move-grok-build-')); // 只看这一段的 Grok 提醒
await grok(90, T);
await grok(78, T + 1 * H); // 窗口内 90→78，掉 12 → 默认开，直接提醒
if (moves().length !== 1 || !moves()[0].title.includes('12%')) {
  problems.push(`move reminder should be on by default: burning 12% in 2h should nudge once, got ${JSON.stringify(moves())}`);
}
await grok(60, T + 2 * H); // 冷却中：不再提醒
if (moves().length !== 1) problems.push('second nudge within the 2h cooldown must be suppressed');
await new Promise((r) => ctxObj.chrome.storage.local.set({ moveReminder: false }, r));
await grok(40, T + 3.5 * H); // 窗口 [1.5h,3.5h]：60→40 掉 20，冷却也过了，但开关已关 → 不提醒
if (moves().length !== 1) problems.push('moveReminder=false must suppress the nudge');
await new Promise((r) => ctxObj.chrome.storage.local.set({ moveReminder: true }, r));
await grok(20, T + 5 * H); // 重新打开：窗口 [3h,5h]：40→20 掉 20 → 提醒
if (moves().length !== 2 || !moves()[1].title.includes('20%')) {
  problems.push(`re-enabling the switch should nudge again, got ${JSON.stringify(moves())}`);
}
await grok(100, T + 6.5 * H); // 额度重置
await grok(88, T + 7 * H); // 窗口 [5h,7h]：20→100 是重置，只算 100→88 = 12 → 提醒
if (moves().length !== 3) problems.push(`burn after a reset should count from the reset, got ${JSON.stringify(moves())}`);
if (!moves()[2].message.includes('vibe coding')) problems.push('nudge body should carry the vibe-coding line');
if (!store.moveNudgedAt || store.moveNudgedAt['grok-build'] !== T + 7 * H) {
  problems.push(`moveNudgedAt should record the last nudge time, got ${JSON.stringify(store.moveNudgedAt)}`);
}
await grok(86, T + 9.5 * H); // 冷却已过，但窗口 [7.5h,9.5h] 里只有这一条 → 数据不够，不提醒
if (moves().length !== 3) problems.push('a single point in the window is not enough to nudge');
await grok(82, T + 10 * H); // 窗口 [8h,10h]：86→82 只掉 4，低于阈值
if (moves().length !== 3) problems.push('a small burn below 10% must not nudge');

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('ok  Concurrent agentData saves are serialized (no lost update)');
console.log('ok  Cursor usage+spending pages merge into one record');
console.log('ok  History dedupe and closeMe behave as before');
console.log('ok  Toolbar badge stays empty (no remaining-% number, including after refresh)');
console.log('ok  Low-quota notifications fire only on threshold crossings');
console.log('ok  Hourly quiet check: background tabs only, tracked agents only, toggleable');
console.log('ok  Move reminder: on by default, >10% burned in 2h, 2h cooldown, off when unticked, counts from the last reset');
console.log('ok  Cursor + Grok Bot share one spending-page scrape; missing Grok Bot section is flagged, not failed');
console.log('ok  Daily update check stores the latest release, survives failures, and is toggleable');
console.log('ok  Alarms are not recreated on re-sync, so their countdowns are never reset');
console.log('\nBackground test passed.');
