// 后台协调"Refresh":
// - 轻页面(Claude/Codex)：后台悄悄开，抓完自己关。
// - 重页面(Cursor/Grok)：浏览器会冻结后台标签页导致抓不到，所以逐个"短暂切到前台"、
//   抓到就自动关，一个接一个，尽量少打扰。
// - 只刷新用户在面板里勾选的产品（enabledAgents，缺省全开）。
// - 刷新结束后按 agent 记录成/败（refresh.results），面板据此提示"没抓到，可能未登录"。

importScripts('agents.js', 'i18n.js', 'update.js', 'capture-logs.js', 'review.js');

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
// 绝不抢焦点。重页面(Cursor/Grok)在后台可能被浏览器节流渲染不出来——抓不到就保留
// 原数据，同时在卡片与本地日志里记录失败；要保证最新走手动 Refresh。
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
  const started = Date.now();
  await Promise.all(uniqueUrls(list).map((u) => openAndWait(u, false, 25000, 'automatic')));
  await recordRefreshFailures(list, started, 'automatic');
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
    chrome.storage.local.get(['agents', 'history', 'captureLogs', 'latestAttempts'], (res) => {
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
      const timestamp = Number(a.scraped_at) || Date.now();
      const log = {
        timestamp,
        attempted_at: timestamp,
        status: 'success',
        agent_id: a.id,
        agent_name: merged.name || (AGENTS.find((x) => x.id === a.id) || {}).name || a.id,
        trigger: a.capture_trigger || 'page',
        duration_ms: Math.max(0, Number(a.capture_duration_ms) || 0),
        reason: '',
        percent_left: pct,
        limits: (merged.limits || []).map((limit) => ({
          label: limit.label == null ? '' : String(limit.label),
          percent_left: limit.percent_left == null ? null : Number(limit.percent_left),
          resets_text: limit.resets_text == null ? null : String(limit.resets_text),
        })),
        tokens_total: merged.tokens && merged.tokens.total != null ? merged.tokens.total : null,
        credits: merged.credits == null ? null : String(merged.credits),
        plan: merged.plan == null ? null : String(merged.plan),
        source_url: sanitizeSourceUrl(a.capture_source_url),
        extension_version: chrome.runtime.getManifest().version,
      };
      const logs = pruneCaptureLogs([...(res.captureLogs || []), log], timestamp);
      const latestAttempts = Object.assign({}, res.latestAttempts, {
        [a.id]: {
          status: 'success',
          attempted_at: timestamp,
          duration_ms: log.duration_ms,
          reason: '',
          trigger: log.trigger,
        },
      });
      chrome.storage.local.set({ agents: map, history: hist, captureLogs: logs, latestAttempts }, resolve);
    });
  });
  writeQueue = writeQueue.then(run, run);
  return writeQueue;
}

function saveFailedAttempt(agent, status, reason, trigger, started, sourceUrl) {
  const run = () => new Promise((resolve) => {
    chrome.storage.local.get(['captureLogs', 'latestAttempts'], (res) => {
      const timestamp = Date.now();
      const log = {
        timestamp,
        attempted_at: timestamp,
        status: status === 'missing' ? 'missing' : 'failed',
        agent_id: agent.id,
        agent_name: agent.name || agent.id,
        trigger,
        duration_ms: Math.max(0, timestamp - started),
        reason: reason || 'read_failed',
        percent_left: null,
        limits: [],
        tokens_total: null,
        credits: null,
        plan: null,
        source_url: sanitizeSourceUrl(sourceUrl || agent.page),
        extension_version: chrome.runtime.getManifest().version,
      };
      const logs = pruneCaptureLogs([...(res.captureLogs || []), log], timestamp);
      const latestAttempts = Object.assign({}, res.latestAttempts, {
        [agent.id]: {
          status: log.status,
          attempted_at: timestamp,
          duration_ms: log.duration_ms,
          reason: log.reason,
          trigger,
        },
      });
      chrome.storage.local.set({ captureLogs: logs, latestAttempts }, resolve);
    });
  });
  writeQueue = writeQueue.then(run, run);
  return writeQueue;
}

function clearCaptureLogs() {
  const run = () => new Promise((resolve) => {
    chrome.storage.local.set({ captureLogs: [] }, resolve);
  });
  writeQueue = writeQueue.then(run, run);
  return writeQueue;
}

async function recordRefreshFailures(list, started, trigger) {
  const map = (await getLocal(['agents'])).agents || {};
  const fresh = (id) => !!(map[id] && map[id].scraped_at >= started);
  const statuses = {};
  for (const agent of list) {
    if (fresh(agent.id)) {
      statuses[agent.id] = 'ok';
      continue;
    }
    const missing = agent.id === 'grok-bot' && fresh('cursor');
    statuses[agent.id] = missing ? 'missing' : 'fail';
    await saveFailedAttempt(
      agent,
      missing ? 'missing' : 'failed',
      missing ? 'section_missing' : 'read_failed',
      trigger,
      started,
      agent.id === 'grok-bot' ? 'https://cursor.com/dashboard/spending' : agent.page,
    );
  }
  return statuses;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'agentData' && msg.agent && typeof msg.agent.id === 'string') {
    saveAgent(msg.agent).then(() => sendResponse({ ok: true }));
    return true; // 等写完再 sendResponse
  }
  if (msg && msg.type === 'pageCaptureFailed' && typeof msg.agent_id === 'string') {
    const agent = AGENTS.find((a) => a.id === msg.agent_id);
    if (agent) {
      saveFailedAttempt(
        agent,
        msg.status === 'missing' ? 'missing' : 'failed',
        msg.reason || 'read_failed',
        'page',
        Number(msg.started) || Date.now(),
        msg.source_url || (sender.tab && sender.tab.url),
      ).then(() => sendResponse({ ok: true }));
      return true;
    }
  }
  if (msg && msg.type === 'clearCaptureLogs') {
    clearCaptureLogs().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg && msg.type === 'closeMe' && sender.tab && sender.tab.id != null) {
    chrome.tabs.remove(sender.tab.id, () => void chrome.runtime.lastError);
  }
  if (msg && msg.type === 'refreshAll') runRefresh();
  if (msg && msg.type === 'dispatchOpen' && Array.isArray(msg.jobs)) {
    openDispatchJobs(msg.jobs, { tile: !!msg.tile, screen: msg.screen }).then((opened) => sendResponse(opened));
    return true;
  }
  if (msg && msg.type === 'dispatchFocus') {
    focusDispatchTab(msg.tabId, msg.url).then((ok) => sendResponse({ ok }));
    return true;
  }
  if (msg && msg.type === 'dispatchClaimFill') {
    claimDispatchFill(sender && sender.tab && sender.tab.id).then((job) => sendResponse(job || null));
    return true;
  }
  if (msg && msg.type === 'dispatchLiveTabs' && Array.isArray(msg.tabIds)) {
    liveDispatchTabs(msg.tabIds).then((live) => sendResponse(live));
    return true;
  }
  if (msg && msg.type === 'dispatchCloseTabs' && Array.isArray(msg.tabIds)) {
    closeDispatchTabs(msg.tabIds).then((closed) => sendResponse({ ok: true, closed }));
    return true;
  }
  if (msg && msg.type === 'captureConversation') {
    captureConversation(msg.tabId).then((res) => sendResponse(res));
    return true;
  }
  if (msg && msg.type === 'reviewOpen' && msg.job) {
    openDispatchJobs([msg.job], { tile: false }).then((opened) => sendResponse(opened));
    return true;
  }
});

// Close the tabs a dispatch board opened. content/popup only has the ids; the
// service worker owns tab access, so removal happens here. Resolves with the
// ids actually removed so the popup only clears the board on success.
function closeDispatchTabs(tabIds) {
  const ids = (tabIds || []).map(Number).filter((n) => !Number.isNaN(n));
  if (!ids.length || !chrome.tabs || !chrome.tabs.remove) return Promise.resolve([]);
  return new Promise((resolve) => {
    chrome.tabs.remove(ids, () => { void chrome.runtime.lastError; resolve(ids); });
  });
}

// Which of these tab ids still point at an open tab. The board accumulates
// jobs across dispatches, so it must drop the ones the user has since closed.
function liveDispatchTabs(tabIds) {
  if (!chrome.tabs || !chrome.tabs.get) return Promise.resolve([]);
  return Promise.all(tabIds.map((id) => new Promise((resolve) => {
    if (id == null) return resolve(null);
    chrome.tabs.get(Number(id), (tab) => {
      resolve(chrome.runtime.lastError || !tab ? null : Number(id));
    });
  }))).then((ids) => ids.filter((x) => x != null));
}

// Open each dispatch job. Default: a background tab per job (focus stays on the
// dashboard). Tile mode: one window per job, laid out by tileRects so they fill
// the screen side by side (2), 1-big-left-plus-2-stacked (3), or a 2×2 grid (4).
// Either way the prompt is prefilled/sent the same, keyed off the tab id — a
// windowed tab has an id too, so the board can still focus and close it.
// Tiling tops out at 4 windows — past that each pane is too cramped to read a
// desktop site, so only the first 4 jobs get tiled windows and any extra opens
// as a normal background tab. (Dispatch already caps a batch at 4 per kind, so
// this is a guard, not the usual path.)
const TILE_MAX = 4;

function openDispatchJobs(jobs, opts) {
  const tile = !!(opts && opts.tile) && chrome.windows && chrome.windows.create;
  const rects = tile ? tileRects(Math.min(jobs.length, TILE_MAX), opts && opts.screen) : null;
  const opened = [];
  const afterOpen = (job, tab, resolve) => {
    const tabId = tab && tab.id;
    const next = Object.assign({}, job, { tabId: tabId == null ? null : tabId });
    opened.push(next);
    if (tabId == null || job.fill !== 'script' || !job.prompt) { resolve(); return; }
    getLocal(['dispatchPending']).then((stored) => {
      const pending = putDispatchPending(stored.dispatchPending, tabId, {
        prompt: job.prompt,
        host: hostFromUrl(job.url),
        send: job.send,
        mode: job.mode,
        attachName: job.attachName,
        attachText: job.attachText,
      });
      chrome.storage.local.set({ dispatchPending: pending }, () => {
        pingFill(tabId, job.prompt, 0, job.send, job.mode, job.attachName, job.attachText);
        resolve();
      });
    });
  };
  return jobs.reduce((chain, job, i) => chain.then(() => new Promise((resolve) => {
    if (tile && rects && rects[i]) {
      const r = rects[i];
      chrome.windows.create({
        url: job.url,
        focused: i === jobs.length - 1,
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
      }, (win) => {
        void chrome.runtime.lastError;
        afterOpen(job, win && win.tabs && win.tabs[0], resolve);
      });
      return;
    }
    chrome.tabs.create({ url: job.url, active: false }, (tab) => afterOpen(job, tab, resolve));
  })), Promise.resolve()).then(() => opened);
}

function hostFromUrl(url) {
  try { return new URL(url).hostname; } catch (e) { return ''; }
}

function pingFill(tabId, prompt, attempt, send, mode, attachName, attachText) {
  if (!chrome.tabs.sendMessage) return;
  chrome.tabs.sendMessage(tabId, {
    type: 'dispatchFill',
    prompt,
    send: !!send,
    mode: mode || null,
    attachName: attachName || null,
    attachText: attachText || null,
  }, () => {
    const err = chrome.runtime.lastError;
    // Keep re-delivering until the content script is listening. A slow tab can
    // take many seconds to load content.js; ~21s of retries (was ~5.6s) covers
    // it. The content script also claims on its own once loaded, so this is a
    // best-effort nudge, not the only delivery path.
    if (!err || attempt >= 30) return;
    setTimeout(() => pingFill(tabId, prompt, attempt + 1, send, mode, attachName, attachText), 700);
  });
}

function captureConversation(tabId) {
  if (tabId == null || !chrome.tabs || !chrome.tabs.sendMessage) {
    return Promise.resolve({ ok: false, reason: 'error' });
  }
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(Number(tabId), { type: 'captureConversation' }, (res) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, reason: 'error' });
        return;
      }
      resolve(res || { ok: false, reason: 'empty' });
    });
  });
}

function claimDispatchFill(tabId) {
  return getLocal(['dispatchPending']).then((res) => {
    const taken = takeDispatchPending(res.dispatchPending, tabId);
    return new Promise((resolve) => {
      chrome.storage.local.set({ dispatchPending: taken.map }, () => resolve(taken.job));
    });
  });
}

if (chrome.tabs.onRemoved && chrome.tabs.onRemoved.addListener) {
  chrome.tabs.onRemoved.addListener((id) => {
    claimDispatchFill(id);
  });
}

function focusDispatchTab(tabId, url) {
  return new Promise((resolve) => {
    const focus = (tab) => {
      if (!tab || tab.id == null) return resolve(false);
      chrome.tabs.update(tab.id, { active: true }, () => {
        if (tab.windowId != null && chrome.windows && chrome.windows.update) {
          chrome.windows.update(tab.windowId, { focused: true }, () => resolve(true));
        } else resolve(true);
      });
    };
    if (tabId != null && chrome.tabs.get) {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError || !tab) {
          if (url) {
            chrome.tabs.create({ url, active: true }, (created) => resolve(!!(created && created.id)));
          } else resolve(false);
          return;
        }
        focus(tab);
      });
      return;
    }
    if (url) chrome.tabs.create({ url, active: true }, (created) => resolve(!!(created && created.id)));
    else resolve(false);
  });
}

// 打开一个标签页，等它被 content.js 抓完自己关掉；最多等 maxMs 就强制关、继续下一个
function openAndWait(url, active, maxMs, trigger) {
  return new Promise((resolve) => {
    let target = url;
    if (trigger) {
      try {
        const parsed = new URL(url);
        parsed.searchParams.set('cawtrigger', trigger);
        target = parsed.toString();
      } catch (e) { /* keep the registered URL */ }
    }
    chrome.tabs.create({ url: target, active }, (tab) => {
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
    const bg = uniqueUrls(list, (a) => !a.foreground).map((u) => openAndWait(u, false, 25000, 'manual'));
    for (const u of uniqueUrls(list, (a) => a.foreground)) await openAndWait(u, true, 25000, 'manual');
    await Promise.all(bg);
    results = await recordRefreshFailures(list, started, 'manual');
  } finally {
    refreshing = false;
    setRefresh({ running: false, finished: Date.now(), results });
  }
}
