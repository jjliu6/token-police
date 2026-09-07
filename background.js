// 后台协调"Refresh":
// - 轻页面(Claude/Codex)：后台悄悄开，抓完自己关。
// - 重页面(Cursor/Grok)：浏览器会冻结后台标签页导致抓不到，所以逐个"短暂切到前台"、
//   抓到就自动关，一个接一个，尽量少打扰。
// - 只刷新用户在面板里勾选的产品（enabledAgents，缺省全开）。
// - 刷新结束后按 agent 记录成/败（refresh.results），面板据此提示"没抓到，可能未登录"。

importScripts('agents.js', 'i18n.js', 'update.js');

let refreshing = false;

if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

// Older builds put the lowest remaining % on the toolbar icon. Users found
// that metric confusing, so the number is gone — clear leftover text on load
// so an in-place update does not keep a stale badge.
function clearBadge() {
  chrome.action.setBadgeText({ text: '' });
}

// 每小时静默自动检查（autoRefresh，默认开）：所有勾选的产品统一在后台标签页尽力抓，
// 绝不抢焦点。重页面(Cursor/Grok)在后台可能被浏览器节流渲染不出来——抓不到就保持
// 原数据、不标失败（卡片上的 "Xh ago" 反映新鲜度），要保证最新走手动 Refresh。
// 只在闹钟还不存在时才创建。service worker 会被反复唤醒又休眠，每次冷启动都重跑
// syncAlarm/syncUpdateAlarm；而 chrome.alarms.create 用同一个名字再建一次，会取消旧闹钟、
// 把周期倒计时清零。频繁重启就意味着倒计时永远走不到点——闹钟从不触发。先 get 一下，
// 没有才建，已有就别碰它的计时。（开关切换时对应的 clear 已经先把闹钟删掉，所以再打开时
// get 拿到的是空，会正常重建。）
function ensureAlarm(name, info) {
  chrome.alarms.get(name, (existing) => {
    void chrome.runtime.lastError;
    if (!existing) chrome.alarms.create(name, info);
  });
}

function syncAlarm() {
  if (!chrome.alarms) return;
  chrome.storage.local.get(['autoRefresh'], (res) => {
    if (res.autoRefresh !== false) ensureAlarm('quietRefresh', { periodInMinutes: 60 });
    else chrome.alarms.clear('quietRefresh', () => void chrome.runtime.lastError);
  });
}

// 多个产品可能共用同一个抓取页（Cursor 和 Grok Bot 都在 cursor.com/dashboard/spending），
// 同一 URL 只开一次：一页抓完会把页上所有产品的数据都发回来。
function uniqueUrls(list, pick) {
  const seen = {};
  const out = [];
  list.forEach((a) => {
    if (pick && !pick(a)) return;
    a.scrape.forEach((u) => { if (!seen[u]) { seen[u] = true; out.push(u); } });
  });
  return out;
}

async function runQuietRefresh() {
  if (refreshing) return; // 手动刷新进行中就别添乱
  const en = (await getLocal(['enabledAgents'])).enabledAgents || {};
  const list = AGENTS.filter((a) => en[a.id] !== false);
  await Promise.all(uniqueUrls(list).map((u) => openAndWait(u, false, 25000)));
}

// 每天检查一次有没有新版本（checkUpdates，默认开）：向 GitHub 的公开 API 问一句
// "最新 Release 是哪个版本"，结果存进 updateCheck，面板底部据此显示"有新版本 ↗"。
// 用户点提示打开落地页（下载 + 安装步骤），不丢到 GitHub Releases。
// 只请求 GitHub、不带任何账号或用量数据。关掉开关就清掉闹钟和已存的结果。
function syncUpdateAlarm() {
  if (!chrome.alarms) return;
  chrome.storage.local.get(['checkUpdates'], (res) => {
    if (res.checkUpdates !== false) ensureAlarm('updateCheck', { periodInMinutes: UPDATE_INTERVAL_MS / 60000 });
    else chrome.alarms.clear('updateCheck', () => void chrome.runtime.lastError);
  });
}

// force=false 时只在"上次查过了一天以上"才真的发请求：service worker 每次被唤醒都会
// 跑到这里，不能每次都去撞网络。失败（断网、限流）就记下 failedAt，最少一小时后再试。
async function checkForUpdate(force) {
  if (typeof fetch !== 'function') return;
  const res = await getLocal(['checkUpdates', 'updateCheck']);
  if (res.checkUpdates === false) return;
  const prev = res.updateCheck || {};
  const now = Date.now();
  if (!force) {
    if (prev.checkedAt && now - prev.checkedAt < UPDATE_INTERVAL_MS) return;
    if (prev.failedAt && now - prev.failedAt < UPDATE_RETRY_MS) return;
  }
  try {
    const r = await fetch(UPDATE_API, { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const body = await r.json();
    const latest = parseVersionTag(body && body.tag_name);
    if (!latest) throw new Error('no version tag in response');
    chrome.storage.local.set({ updateCheck: { checkedAt: now, latest, url: UPDATE_PAGE } });
  } catch (e) {
    // 保留上次查到的结果（有新版的提示不该因为一次断网就消失），只记一下失败时间
    chrome.storage.local.set({ updateCheck: Object.assign({}, prev, { failedAt: now }) });
  }
}

if (chrome.alarms) {
  chrome.alarms.onAlarm.addListener((al) => {
    if (!al) return;
    if (al.name === 'quietRefresh') runQuietRefresh();
    if (al.name === 'updateCheck') checkForUpdate(true);
  });
}

chrome.storage.onChanged.addListener((ch, area) => {
  if (area !== 'local' || !ch) return;
  if (ch.autoRefresh) syncAlarm();
  if (ch.checkUpdates) {
    syncUpdateAlarm();
    // 关掉：把结果也清掉，面板上不再显示；打开：马上查一次
    if (ch.checkUpdates.newValue === false) chrome.storage.local.remove('updateCheck', () => void chrome.runtime.lastError);
    else checkForUpdate(true);
  }
});

syncAlarm();
clearBadge();
syncUpdateAlarm();
checkForUpdate(false);

function setRefresh(partial) {
  chrome.storage.local.get(['refresh'], (res) => {
    chrome.storage.local.set({ refresh: Object.assign({ running: false }, res.refresh, partial) });
  });
}

function getLocal(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

// content.js 抓到的数据都经这里写入。多个抓取标签页可能同时完成，
// 各自 get→改→set 会丢更新，所以全部排进一个队列串行执行。
let writeQueue = Promise.resolve();

// 低额度提醒：剩余% 从阈值上方跌破阈值那一刻才通知（重置后涨回去，下次再跌破会再提醒）。
// 只在"穿越"时触发，天然去重，不会反复轰炸。
const LOW_THRESHOLDS = [15, 5];

function maybeNotify(a, oldPct, pct) {
  if (!chrome.notifications || oldPct == null || pct == null) return;
  const crossed = LOW_THRESHOLDS.filter((T) => oldPct > T && pct <= T);
  if (!crossed.length) return;
  chrome.storage.local.get(['notifyLow', 'uiLang'], (res) => {
    if (res.notifyLow === false) return;
    applyStoredLang(res.uiLang);
    const meta = AGENTS.find((x) => x.id === a.id);
    const reset = a.limits && a.limits[0] && a.limits[0].resets_text;
    chrome.notifications.create('low-' + a.id + '-' + crossed[crossed.length - 1], {
      type: 'basic',
      iconUrl: 'icons/mark-128.png',
      title: t('lowTitle', { name: (meta && meta.name) || a.id, n: pct }),
      message: reset ? t('lowBodyR', { r: reset }) : t('lowBody'),
    }, () => void chrome.runtime.lastError);
  });
}

// 动一动提醒（moveReminder，默认开）：某个产品在最近 2 小时内烧掉超过 10% 主额度，
// 就弹通知让人起来活动。每个产品 2 小时内最多提醒一次（moveNudgedAt 记上次时间）。
// 只看"上次重置之后"的那段：额度涨回去说明重置过，之前的消耗不算。
const MOVE_WINDOW_MS = 2 * 3600000;
const MOVE_DROP_PCT = 10;
const MOVE_COOLDOWN_MS = 2 * 3600000;

// 返回这段窗口里烧掉的百分点数；数据不够就返回 0
function recentBurn(hist, id, now) {
  const seg = hist.filter((h) => h.id === id && h.t >= now - MOVE_WINDOW_MS && h.t <= now)
    .sort((x, y) => x.t - y.t);
  if (seg.length < 2) return 0;
  let start = 0;
  for (let i = 1; i < seg.length; i++) { if (seg[i].pct > seg[i - 1].pct + 2) start = i; } // 涨上去=重置过
  const a = seg[start], b = seg[seg.length - 1];
  return a === b ? 0 : a.pct - b.pct;
}

function maybeMoveNudge(a, hist) {
  if (!chrome.notifications) return;
  const now = a.scraped_at;
  const burn = recentBurn(hist, a.id, now);
  if (burn <= MOVE_DROP_PCT) return;
  chrome.storage.local.get(['moveReminder', 'moveNudgedAt', 'uiLang'], (res) => {
    if (res.moveReminder === false) return; // 默认开：只有在 ⚙ 里明确关掉才不提醒
    const last = (res.moveNudgedAt || {})[a.id] || 0;
    if (now - last < MOVE_COOLDOWN_MS) return;
    applyStoredLang(res.uiLang);
    const meta = AGENTS.find((x) => x.id === a.id);
    chrome.notifications.create('move-' + a.id + '-' + now, {
      type: 'basic',
      iconUrl: 'icons/mark-128.png',
      title: t('moveTitle', { name: (meta && meta.name) || a.id, n: Math.round(burn) }),
      message: t('moveBody'),
    }, () => void chrome.runtime.lastError);
    const stamp = Object.assign({}, res.moveNudgedAt, { [a.id]: now });
    chrome.storage.local.set({ moveNudgedAt: stamp });
  });
}

function saveAgent(a) {
  const run = () => new Promise((resolve) => {
    chrome.storage.local.get(['agents', 'history'], (res) => {
      const map = res.agents || {};
      const prev = map[a.id];
      const oldPct = prev && prev.limits && prev.limits[0] ? prev.limits[0].percent_left : null;
      // Cursor 分两页，合并保留各自字段
      map[a.id] = (a.id === 'cursor' && map.cursor) ? Object.assign({}, map.cursor, a) : a;

      // 记历史：只存主额度的left%，用来算消耗速度 / 预计用完时间
      let hist = res.history || [];
      const merged = map[a.id];
      const pct = merged.limits && merged.limits[0] ? merged.limits[0].percent_left : null;
      if (pct != null) {
        let last = null;
        for (let i = hist.length - 1; i >= 0; i--) { if (hist[i].id === a.id) { last = hist[i]; break; } }
        // 同一 agent：距上次超过 5 分钟、或数值变了才记一笔，避免灌水
        if (!last || a.scraped_at - last.t > 5 * 60000 || Math.abs(last.pct - pct) >= 1) {
          hist.push({ id: a.id, t: a.scraped_at, pct });
          if (hist.length > 1200) hist = hist.slice(hist.length - 1200);
        }
      }
      maybeNotify(merged, oldPct, pct);
      maybeMoveNudge(merged, hist);
      chrome.storage.local.set({ agents: map, history: hist }, resolve);
    });
  });
  writeQueue = writeQueue.then(run, run);
  return writeQueue;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'agentData' && msg.agent && typeof msg.agent.id === 'string') {
    saveAgent(msg.agent).then(() => sendResponse({ ok: true }));
    return true; // 等写完再 sendResponse
  }
  if (msg && msg.type === 'closeMe' && sender.tab && sender.tab.id != null) {
    chrome.tabs.remove(sender.tab.id, () => void chrome.runtime.lastError);
  }
  if (msg && msg.type === 'refreshAll') runRefresh();
});

// 打开一个标签页，等它被 content.js 抓完自己关掉；最多等 maxMs 就强制关、继续下一个
function openAndWait(url, active, maxMs) {
  return new Promise((resolve) => {
    chrome.tabs.create({ url, active }, (tab) => {
      const tid = tab && tab.id;
      if (tid == null) return resolve();
      let finished = false;
      const timer = setTimeout(() => {
        if (finished) return;
        finished = true;
        chrome.tabs.onRemoved.removeListener(onRemoved);
        chrome.tabs.remove(tid, () => void chrome.runtime.lastError);
        resolve();
      }, maxMs);
      function onRemoved(id) {
        if (id !== tid || finished) return;
        finished = true;
        clearTimeout(timer);
        chrome.tabs.onRemoved.removeListener(onRemoved);
        resolve();
      }
      chrome.tabs.onRemoved.addListener(onRemoved);
    });
  });
}

async function runRefresh() {
  if (refreshing) return;
  refreshing = true;
  const started = Date.now();
  let results = null;
  setRefresh({ running: true, started, finished: null, results: null });
  try {
    const en = (await getLocal(['enabledAgents'])).enabledAgents || {};
    const list = AGENTS.filter((a) => en[a.id] !== false);
    // 轻页面：后台并行；重页面：前台逐个，抓到即关（同一 URL 只开一次）
    const bg = uniqueUrls(list, (a) => !a.foreground).map((u) => openAndWait(u, false, 25000));
    for (const u of uniqueUrls(list, (a) => a.foreground)) await openAndWait(u, true, 25000);
    await Promise.all(bg);
    // 这轮有没有真的抓到新数据：拿 scraped_at 和本轮开始时间比
    const map = (await getLocal(['agents'])).agents || {};
    results = {};
    const fresh = (id) => !!(map[id] && map[id].scraped_at >= started);
    list.forEach((a) => {
      results[a.id] = fresh(a.id) ? 'ok' : 'fail';
    });
    // Grok Bot 和 Cursor 同页：Cursor 抓到了而 Grok Bot 没有 → 页面读到了，只是没有 Grok Bot 区块
    //（多半是没开通），面板据此提示"可在 ⚙ 里取消勾选"，而不是误报"可能未登录"
    if (results['grok-bot'] === 'fail' && fresh('cursor')) results['grok-bot'] = 'missing';
  } finally {
    refreshing = false;
    setRefresh({ running: false, finished: Date.now(), results });
  }
}
