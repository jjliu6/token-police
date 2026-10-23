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
const sessionStore = {};
let onMessage = null;
const removedTabs = [];
const createdTabs = [];
const openTabs = {};
const reloadedTabs = [];
const tabUpdates = [];
const badge = { texts: [], colors: [] };
const alarms = { created: [], cleared: 0, listener: null, live: {} };
const notifications = [];
const fetches = [];
// 抓取页默认“一打开就关”，老测试靠这个让 openAndWait 立刻 resolve。
// 卡住不关时改成 true，用来模拟空白页一直挂着、service worker 的 setTimeout 也没了。
let holdScrapeTabs = false;
let discardCreatedTabs = false;
const pendingTimers = [];
let timerSeq = 1;
function fakeSetTimeout(fn, ms) {
  const id = timerSeq++;
  pendingTimers.push({ id, fn, ms: ms || 0 });
  return id;
}
function fakeClearTimeout(id) {
  const i = pendingTimers.findIndex((t) => t.id === id);
  if (i >= 0) pendingTimers.splice(i, 1);
}
function flushTimers(pred) {
  const want = pred || (() => true);
  let guard = 0;
  while (guard++ < 30) {
    const batch = pendingTimers.filter(want);
    if (!batch.length) return;
    batch.forEach((t) => {
      const i = pendingTimers.indexOf(t);
      if (i >= 0) pendingTimers.splice(i, 1);
    });
    batch.forEach((t) => t.fn());
  }
}
// 假的 GitHub API：默认回 v9.9.9（比任何已装版本都新）；可以改成失败
let fetchReply = { ok: true, json: () => Promise.resolve({ tag_name: 'v9.9.9', html_url: 'https://github.com/jjliu6/token-police/releases/tag/v9.9.9' }) };
const storageListeners = [];
const onRemovedListeners = [];
let nextTabId = 100;

const ctxObj = {
  setTimeout: fakeSetTimeout,
  clearTimeout: fakeClearTimeout,
  URL,
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
      session: {
        get: (keys, cb) => {
          const out = {};
          const list = keys == null ? Object.keys(sessionStore) : (Array.isArray(keys) ? keys : [keys]);
          list.forEach((k) => { if (sessionStore[k] !== undefined) out[k] = clone(sessionStore[k]); });
          setTimeout(() => cb(out), 0);
        },
        set: (obj, cb) => {
          const snapshot = clone(obj);
          setTimeout(() => {
            Object.assign(sessionStore, snapshot);
            if (cb) cb();
          }, 0);
        },
        remove: (keys, cb) => {
          setTimeout(() => {
            (Array.isArray(keys) ? keys : [keys]).forEach((k) => { delete sessionStore[k]; });
            if (cb) cb();
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
        const discarded = discardCreatedTabs;
        const tab = {
          id,
          url: discarded ? '' : opts.url,
          pendingUrl: opts.url,
          status: discarded ? 'unloaded' : 'complete',
          discarded,
          windowId: 1,
        };
        openTabs[id] = tab;
        const hold = holdScrapeTabs && opts.url && String(opts.url).includes('cawrefresh');
        setTimeout(() => {
          if (cb) cb(clone(tab));
          // 标签页"抓完自动关"：马上触发 onRemoved，让 openAndWait 尽快 resolve。
          // hold 时留着，用来测空白页不会自己消失。
          if (hold) return;
          setTimeout(() => {
            delete openTabs[id];
            onRemovedListeners.slice().forEach((fn) => fn(id));
          }, 0);
        }, 0);
      },
      remove: (id, cb) => {
        const ids = Array.isArray(id) ? id : [id];
        ids.forEach((one) => {
          removedTabs.push(one);
          const existed = !!openTabs[one];
          delete openTabs[one];
          if (existed) onRemovedListeners.slice().forEach((fn) => fn(one));
        });
        if (cb) cb();
      },
      query: (_info, cb) => { setTimeout(() => cb(Object.keys(openTabs).map((id) => clone(openTabs[id]))), 0); },
      get: (id, cb) => {
        setTimeout(() => {
          const tab = openTabs[id];
          if (!tab) {
            ctxObj.chrome.runtime.lastError = { message: 'no tab' };
            cb(undefined);
            ctxObj.chrome.runtime.lastError = null;
            return;
          }
          cb(clone(tab));
        }, 0);
      },
      update: (id, props, cb) => {
        tabUpdates.push({ id, props: clone(props || {}) });
        const tab = openTabs[id];
        if (tab && props) Object.assign(tab, props);
        if (cb) cb(tab ? clone(tab) : { id });
      },
      reload: (id, cb) => {
        reloadedTabs.push(id);
        const tab = openTabs[id];
        if (tab) {
          tab.discarded = false;
          tab.status = 'complete';
          if (!tab.url || tab.url === 'about:blank') tab.url = tab.pendingUrl || tab.url;
        }
        if (cb) cb();
      },
      onRemoved: {
        addListener: (fn) => onRemovedListeners.push(fn),
        removeListener: (fn) => {
          const i = onRemovedListeners.indexOf(fn);
          if (i >= 0) onRemovedListeners.splice(i, 1);
        },
      },
      sendMessage: (tabId, msg, cb) => {
        if (msg && msg.type === 'captureConversation') {
          setTimeout(() => cb && cb({
            ok: true,
            sourceAgent: 'chatgpt',
            sourceKind: 'chat',
            conversation: [
              { role: 'user', text: 'Fix login' },
              { role: 'assistant', text: 'Done. https://github.com/jjliu6/token-police/pull/63' },
            ],
            sessionUrl: 'https://chatgpt.com/c/abc',
          }), 0);
          return;
        }
        if (cb) setTimeout(() => cb(), 0);
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
const backgroundSource = readFileSync(resolve(root, 'background.js'), 'utf8');
function bootBackground() {
  // 上一个 worker 的监听器和 setTimeout 都没了。闹钟、session、还开着的标签留下。
  storageListeners.length = 0;
  onRemovedListeners.length = 0;
  pendingTimers.length = 0;
  const sandbox = {
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
    URL,
    console,
    fetch: ctxObj.fetch,
    chrome: ctxObj.chrome,
  };
  const context = vm.createContext(sandbox);
  sandbox.importScripts = (...files) => files.forEach((f) =>
    vm.runInContext(readFileSync(resolve(root, f), 'utf8'), context, { filename: f }));
  vm.runInContext(backgroundSource, context, { filename: 'background.js' });
  return context;
}
const ctx = bootBackground();

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
  send(agentData({ id: 'claude-code', scraped_at: now, capture_trigger: 'page', capture_source_url: 'https://claude.ai/new?token=secret#settings/usage', limits: [{ label: 'Weekly (All models)', percent_left: 80 }] })),
  send(agentData({ id: 'codex', scraped_at: now, limits: [{ label: 'Weekly', percent_left: 60 }] })),
]);
if (!store.agents || !store.agents['claude-code'] || !store.agents.codex) {
  problems.push(`concurrent saves lost an agent: ${JSON.stringify(Object.keys(store.agents || {}))}`);
}
if (!store.history || store.history.length !== 2) {
  problems.push(`expected 2 history entries, got ${JSON.stringify(store.history)}`);
}
if (!store.captureLogs || store.captureLogs.length !== 2) {
  problems.push(`concurrent agentData should retain both logs, got ${JSON.stringify(store.captureLogs)}`);
}
const claudeLog = store.captureLogs && store.captureLogs.find((x) => x.agent_id === 'claude-code');
if (!claudeLog || claudeLog.status !== 'success' || claudeLog.percent_left !== 80) {
  problems.push(`successful scrape log should preserve percent_left=80, got ${JSON.stringify(claudeLog)}`);
}
if (claudeLog && claudeLog.source_url !== 'https://claude.ai/new') {
  problems.push(`capture log source URL should remove query/hash, got ${claudeLog.source_url}`);
}

// 1b) Grok 页面在成功之后补一段"接口学没学会"的说明：只写到最新那条成功日志上
await send(agentData({ id: 'grok-build', scraped_at: Date.now(), limits: [{ label: 'Weekly (SuperGrok)', percent_left: 44 }] }));
await send({ type: 'captureDetail', agent_id: 'grok-build', detail: 'learn=fail; dom_used=56; json=[/rest/products]' });
const grokLog = store.captureLogs && store.captureLogs.find((x) => x.agent_id === 'grok-build');
if (!grokLog || grokLog.status !== 'success' || grokLog.detail !== 'learn=fail; dom_used=56; json=[/rest/products]') {
  problems.push(`captureDetail should attach to the fresh Grok success log, got ${JSON.stringify(grokLog)}`);
}
await send({ type: 'captureDetail', agent_id: 'gemini', detail: 'no log to attach to' });
if (store.captureLogs.some((x) => x.agent_id === 'gemini')) problems.push('captureDetail must not invent a log');

// 1c) 失败日志带上页面结构（黑匣子）
await send({ type: 'pageCaptureFailed', agent_id: 'grok-build', status: 'failed', reason: 'parse_failed', trigger: 'manual', started: Date.now(), detail: 'x', dom: '<div>\n  "0%"' });
const domLog = store.captureLogs && store.captureLogs.slice().reverse().find((x) => x.agent_id === 'grok-build' && x.status === 'failed');
if (!domLog || domLog.dom !== '<div>\n  "0%"') problems.push(`failed log should keep the page structure, got ${JSON.stringify(domLog)}`);

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

// 4b) dispatchCloseTabs 真正关闭任务板打开的标签页，并回 {ok:true}
let closeRes = null;
await new Promise((done) => {
  const ret = onMessage({ type: 'dispatchCloseTabs', tabIds: [11, 12] }, {}, (r) => { closeRes = r; done(); });
  if (ret !== true) done();
});
const closedFlat = removedTabs.flat ? removedTabs.flat() : [].concat(...removedTabs);
if (!closedFlat.includes(11) || !closedFlat.includes(12)) {
  problems.push(`dispatchCloseTabs should remove the board's tabs, got ${JSON.stringify(removedTabs)}`);
}
if (!closeRes || closeRes.ok !== true) problems.push('dispatchCloseTabs must reply {ok:true} so the popup clears the board');

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

// 9) 闹钟：默认 60 分钟；autoRefresh=false 清除；改间隔才重建
if (!alarms.created.some((a) => a.name === 'quietRefresh' && a.periodInMinutes === 60)) {
  problems.push('startup should create the hourly quietRefresh alarm');
}
await new Promise((r) => ctxObj.chrome.storage.local.set({ autoRefresh: false }, r));
await tick(10);
if (alarms.cleared < 1) problems.push('autoRefresh=false should clear the alarm');
await new Promise((r) => ctxObj.chrome.storage.local.set({ autoRefresh: true, autoRefreshInterval: 15 }, r));
await tick(10);
if (!alarms.created.some((a) => a.name === 'quietRefresh' && a.periodInMinutes === 15)) {
  problems.push('autoRefreshInterval=15 should recreate quietRefresh at 15 minutes');
}

// 10) 静默检查：所有勾选产品都在后台标签页尝试（cursor 已取消勾选 → 不开）
const before = createdTabs.length;
alarms.listener({ name: 'quietRefresh' });
await tick(60);
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
const autoFailures = (store.captureLogs || []).filter((x) => x.trigger === 'automatic' && x.status === 'failed');
if (!autoFailures.length) problems.push('automatic check failures must be written to captureLogs');

// 11) Cursor 和 Grok Bot 共用 spending 页：勾选全部时同一 URL 只开一次
await new Promise((r) => ctxObj.chrome.storage.local.set({ enabledAgents: {} }, r));
await tick(10);
delete store.quietRefreshAt; // 上一轮刚记过时间；这里要测的是去重，不是间隔
const before2 = createdTabs.length;
alarms.listener({ name: 'quietRefresh' });
await tick(40);
const all = createdTabs.slice(before2).map((o) => o.url);
const spending = all.filter((u) => u.startsWith('https://cursor.com/dashboard/spending'));
if (spending.length !== 1) problems.push(`shared spending page should open once, got ${JSON.stringify(all)}`);
if (all.some((u) => u.startsWith('https://cursor.com/dashboard/usage'))) problems.push('cursor usage page should no longer be scraped');

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
const manualFailures = (store.captureLogs || []).filter((x) => x.trigger === 'manual' && x.status === 'failed');
if (!manualFailures.some((x) => x.agent_id === 'grok-build' && x.reason === 'tab_timeout')) {
  problems.push(`manual refresh failures must be logged, got ${JSON.stringify(manualFailures)}`);
}
const missingLog = (store.captureLogs || []).find((x) =>
  x.trigger === 'manual' && x.agent_id === 'grok-bot' && x.status === 'missing');
if (!missingLog || missingLog.reason !== 'section_missing') {
  problems.push(`missing Grok Bot section must log missing/section_missing, got ${JSON.stringify(missingLog)}`);
}
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
  problems.push('re-syncing must not recreate an existing quietRefresh alarm (that would reset its countdown so it never fires)');
}
const qrAfterSame = alarms.created.filter((a) => a.name === 'quietRefresh').length;
await new Promise((r) => ctxObj.chrome.storage.local.set({ autoRefreshInterval: 120, autoRefresh: true }, r));
await tick(10);
if (!alarms.created.some((a) => a.name === 'quietRefresh' && a.periodInMinutes === 120)) {
  problems.push('changing the interval must recreate quietRefresh with the new period');
}
if (alarms.created.filter((a) => a.name === 'quietRefresh').length <= qrAfterSame) {
  problems.push('changing autoRefreshInterval should create a new quietRefresh alarm');
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

// Cross-check: captureConversation reads the source tab; reviewOpen prefills.
let captured = null;
await new Promise((done) => {
  const ret = onMessage({ type: 'captureConversation', tabId: 7 }, {}, (r) => { captured = r; done(); });
  if (ret !== true) done();
});
await tick(10);
if (!captured || captured.ok !== true || captured.sourceAgent !== 'chatgpt') {
  problems.push(`captureConversation should return the ChatGPT session, got ${JSON.stringify(captured)}`);
}
if (!captured || !captured.conversation || captured.conversation.length !== 2) {
  problems.push(`captureConversation must include the transcript, got ${JSON.stringify(captured)}`);
}
const reviewJob = {
  agentId: 'claude-chat',
  name: 'Claude',
  prompt: 'Independently review this.',
  url: 'https://claude.ai/new',
  fill: 'script',
  send: false,
};
let reviewOpened = null;
await new Promise((done) => {
  const ret = onMessage({ type: 'reviewOpen', job: reviewJob }, {}, (r) => { reviewOpened = r; done(); });
  if (ret !== true) done();
});
await tick(20);
if (!reviewOpened || !reviewOpened.length) {
  problems.push(`reviewOpen should open a tab, got ${JSON.stringify(reviewOpened)}`);
}
const lastCreate = createdTabs[createdTabs.length - 1];
if (!lastCreate || lastCreate.url !== 'https://claude.ai/new') {
  problems.push(`reviewOpen should open the reviewer URL, got ${JSON.stringify(lastCreate)}`);
}
if (!lastCreate || lastCreate.active !== true) {
  problems.push(`reviewOpen must open the reviewer in the foreground, got ${JSON.stringify(lastCreate)}`);
}
if (reviewOpened && reviewOpened[0] && reviewOpened[0].send) {
  problems.push('reviewOpen must not auto-send');
}

// 14) 静默检查不会比设定间隔更密，过点补发也不在浏览器刚醒来时开页
delete store.quietRefreshAt;
const freqBefore = createdTabs.length;
alarms.listener({ name: 'quietRefresh', scheduledTime: Date.now() });
await tick(80);
if (createdTabs.length === freqBefore) problems.push('on-time quiet refresh should open scrape tabs');
const openedQuiet = createdTabs.slice(freqBefore);
if (!openedQuiet.some((o) => String(o.url).includes('cawdue='))) {
  problems.push(`scrape URLs should carry a close deadline, got ${JSON.stringify(openedQuiet.map((o) => o.url))}`);
}
const freqMid = createdTabs.length;
alarms.listener({ name: 'quietRefresh', scheduledTime: Date.now() });
await tick(40);
if (createdTabs.length !== freqMid) {
  problems.push(`quiet refresh inside the interval must not open another batch, opened ${createdTabs.length - freqMid}`);
}
delete store.quietRefreshAt;
const catchBefore = createdTabs.length;
alarms.listener({ name: 'quietRefresh', scheduledTime: Date.now() - 3 * 3600000 });
await tick(20);
alarms.listener({ name: 'quietRefresh', scheduledTime: Date.now() - 3 * 3600000 });
await tick(40);
if (createdTabs.length !== catchBefore) {
  problems.push('an overdue catch-up must not open scrape tabs while the browser is still restoring');
}
if (!alarms.live.quietRefreshSoon || alarms.live.quietRefreshSoon.delayInMinutes !== 1) {
  problems.push(`catch-up should defer one minute via quietRefreshSoon, got ${JSON.stringify(alarms.live.quietRefreshSoon)}`);
}
alarms.listener({ name: 'quietRefreshSoon', scheduledTime: Date.now() });
await tick(80);
if (createdTabs.length === catchBefore) problems.push('deferred quiet refresh should open tabs once the deferral elapses');

// 15) 被丢掉的后台页要重载一次，并且不许浏览器再丢掉；到点即使页面没加载也要关掉
delete store.quietRefreshAt;
discardCreatedTabs = true;
holdScrapeTabs = true;
const reloadBefore = reloadedTabs.length;
const updBefore = tabUpdates.length;
alarms.listener({ name: 'quietRefresh', scheduledTime: Date.now() });
await tick(80);
discardCreatedTabs = false;
const discIds = Object.keys(openTabs).map(Number);
const newUpdates = tabUpdates.slice(updBefore);
if (!discIds.length) problems.push('discarded-tab case should leave the scrape tabs open until the deadline');
if (!newUpdates.length || newUpdates.some((u) => !u.props || u.props.autoDiscardable !== false)) {
  problems.push(`scrape tabs must opt out of discarding, got ${JSON.stringify(newUpdates)}`);
}
if (!discIds.every((id) => reloadedTabs.includes(id)) || reloadedTabs.length < reloadBefore + discIds.length) {
  problems.push(`a discarded scrape tab should be reloaded, reloaded=${JSON.stringify(reloadedTabs)} open=${JSON.stringify(discIds)}`);
}
const reloadedOnce = reloadedTabs.length;
flushTimers((t) => t.ms < 40000);
await tick(30);
if (reloadedTabs.length !== reloadedOnce) problems.push('a discarded scrape tab is only reloaded once');
flushTimers((t) => t.ms >= 40000);
await tick(30);
discIds.forEach((id) => {
  if (openTabs[id] || !removedTabs.includes(id)) problems.push(`deadline timer should close scrape tab ${id}`);
});
holdScrapeTabs = false;

// 16) service worker 重启后，内存里的 setTimeout 没了，过了 deadline 仍要把页关掉
holdScrapeTabs = true;
delete store.quietRefreshAt;
alarms.listener({ name: 'quietRefresh', scheduledTime: Date.now() });
await tick(80);
const heldIds = Object.keys(openTabs).map(Number);
if (!heldIds.length) problems.push('expected scrape tabs to stay open when the page never loads');
if (!alarms.live.scrapeClose || !alarms.live.scrapeClose.when) {
  problems.push(`open scrape tabs must schedule a scrapeClose alarm, got ${JSON.stringify(alarms.live.scrapeClose)}`);
}
if (!sessionStore.scrapeBook || !heldIds.every((id) => sessionStore.scrapeBook[id])) {
  problems.push(`scrape deadlines must be persisted across worker restarts, book=${JSON.stringify(sessionStore.scrapeBook)}`);
}
bootBackground();
await tick(50);
heldIds.forEach((id) => {
  if (!openTabs[id]) problems.push(`restarting before the deadline must keep scrape tab ${id} open`);
});
Object.keys(sessionStore.scrapeBook || {}).forEach((id) => { sessionStore.scrapeBook[id].deadline = Date.now() - 1000; });
bootBackground();
await tick(50);
heldIds.forEach((id) => {
  if (openTabs[id] || !removedTabs.includes(id)) problems.push(`a scrape tab past its deadline must be closed after the worker restarts (${id})`);
});
holdScrapeTabs = false;

// 17) 浏览器重启：session 清空，上次没关掉的抓取页被恢复成空白标签，启动时关掉，且不因此再开一轮
Object.keys(sessionStore).forEach((k) => { delete sessionStore[k]; });
openTabs[501] = {
  id: 501,
  url: 'https://grok.com/?_s=usage&cawrefresh=1&cawtrigger=automatic',
  pendingUrl: 'https://grok.com/?_s=usage&cawrefresh=1&cawtrigger=automatic',
  status: 'unloaded',
  discarded: true,
  windowId: 1,
};
openTabs[502] = {
  id: 502,
  url: 'https://cursor.com/dashboard/spending?cawrefresh=1&cawdue=' + (Date.now() - 5000),
  pendingUrl: 'https://cursor.com/dashboard/spending?cawrefresh=1',
  status: 'unloaded',
  discarded: true,
  windowId: 1,
};
const restoredBefore = createdTabs.length;
bootBackground();
await tick(50);
if (openTabs[501] || openTabs[502]) problems.push('restored blank scrape tabs must be closed on startup');
if (!removedTabs.includes(501) || !removedTabs.includes(502)) {
  problems.push(`startup sweep should remove restored scrape tabs, removed=${JSON.stringify(removedTabs.slice(-8))}`);
}
if (createdTabs.length !== restoredBefore) problems.push('closing restored scrape tabs must not open a new batch');

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('ok  Concurrent agentData saves are serialized (no lost update)');
console.log('ok  Grok learn report attaches to its success log');
console.log('ok  Cursor usage+spending pages merge into one record');
console.log('ok  History dedupe and closeMe behave as before');
console.log('ok  Toolbar badge stays empty (no remaining-% number, including after refresh)');
console.log('ok  Low-quota notifications fire only on threshold crossings');
console.log('ok  Hourly quiet check: background tabs only, tracked agents only, toggleable');
console.log('ok  Move reminder: on by default, >10% burned in 2h, 2h cooldown, off when unticked, counts from the last reset');
console.log('ok  Cursor + Grok Bot share one spending-page scrape; missing Grok Bot section is flagged, not failed');
console.log('ok  Daily update check stores the latest release, survives failures, and is toggleable');
console.log('ok  Alarms are not recreated on re-sync, so their countdowns are never reset');
console.log('ok  Quiet check stays on its interval, and scrape tabs close after the deadline across worker restarts');
console.log('\nBackground test passed.');
