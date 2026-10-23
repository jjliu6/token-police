// Run content.js against fake page text (no browser) and check which agents it
// reports back to background. Covers the Cursor spending page (Cursor + Grok Bot
// on one page), the Gemini usage page, and the "Grok Bot heading rendered but
// the number hasn't yet" wait.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const parseSrc = readFileSync(resolve(root, 'parse.js'), 'utf8');
const contentSrc = readFileSync(resolve(root, 'content.js'), 'utf8');

// 造一个最小的假浏览器环境：innerText 就是我们给的文本，MutationObserver / setInterval
// 都由测试手动触发，chrome.runtime.sendMessage 记录发出的消息。
// storage: 假的 chrome.storage.local 内容（content.js 从这里读 grokApiMap、学会后写回）
// scrapeInfo: background 对 "scrapeInfo" 的回答（模拟 SPA 改写了地址栏的情况）
// 返回的 message(data) 模拟 MAIN world 的 grok-rest-tap.js 用 postMessage 转交一条响应
function runPage({ host, path = '/', search = '', hash = '', text, nodes = [], fetch: fetchImpl, storage = {}, scrapeInfo = null }) {
  const sent = [];
  let body = { innerText: text, childNodes: nodes };
  let observerCb = null;
  let intervalCb = null;
  const listeners = [];
  const win = {
    addEventListener: (type, fn) => { if (type === 'message') listeners.push(fn); },
    postMessage: (data) => { sent.push({ type: 'postMessage', data }); },
  };
  win.top = win;
  const ctxObj = {
    Date,
    Promise,
    URL,
    JSON,
    setTimeout,
    fetch: fetchImpl,
    window: win,
    setInterval: (fn) => { intervalCb = fn; return 1; },
    clearInterval: () => { intervalCb = null; },
    MutationObserver: class { constructor(cb) { observerCb = cb; } observe() {} disconnect() { observerCb = null; } },
    document: { body, documentElement: {} },
    location: { hostname: host, pathname: path, search, hash, href: `https://${host}${path}${search}${hash}` },
    chrome: {
      runtime: {
        sendMessage: (msg, cb) => {
          sent.push(msg);
          if (msg && msg.type === 'scrapeInfo') { if (cb) cb(scrapeInfo); return; }
          if (cb) cb();
        },
        lastError: null,
      },
      storage: {
        local: {
          get: (keys, cb) => { const out = {}; (Array.isArray(keys) ? keys : [keys]).forEach((k) => { if (k in storage) out[k] = storage[k]; }); cb(out); },
          set: (obj, cb) => { Object.assign(storage, obj); if (cb) cb(); },
        },
      },
    },
  };
  const ctx = vm.createContext(ctxObj);
  vm.runInContext(parseSrc, ctx, { filename: 'parse.js' });
  vm.runInContext(contentSrc, ctx, { filename: 'content.js' });
  return {
    sent,
    storage,
    setText: (t) => { body.innerText = t; if (observerCb) observerCb(); },
    tick: () => { if (intervalCb) intervalCb(); },
    flush: async (n = 8) => { for (let i = 0; i < n; i++) await Promise.resolve(); },
    message: (data) => { listeners.forEach((fn) => fn({ source: win, data })); },
    agents: () => sent.filter((m) => m.type === 'agentData').map((m) => m.agent),
    closed: () => sent.some((m) => m.type === 'closeMe'),
    failures: () => sent.filter((m) => m.type === 'pageCaptureFailed'),
    posted: () => sent.filter((m) => m.type === 'postMessage').map((m) => m.data),
  };
}

const problems = [];
const check = (cond, msg) => { if (!cond) problems.push(msg); };

// --- Cursor spending page from the user's screenshot: Cursor + Grok Bot on one page ---
const SPENDING = `
CURRENT PLAN
Pro $20/mo
Usage limits reset on 9月26日 (24 days left)
Manage your plan in the iOS App
UPGRADE AVAILABLE
Pro+ $60/mo
Unlock 3x more usage on Agent & more
Upgrade
Included in Pro
Cursor Models · Includes Cursor Grok and Composer
96% used
Additional usage beyond limits consumes Other Models quota or on-demand spend.
Other Models
54% used
Additional usage beyond limits consumes on-demand spend.
Grok Bot
Weekly usage
13% used
Resets 9月3日 (23 hours and 4 minutes left)
`;
{
  const p = runPage({ host: 'cursor.com', search: '?cawrefresh=1', text: SPENDING });
  const ag = p.agents();
  const cursor = ag.find((a) => a.id === 'cursor');
  const bot = ag.find((a) => a.id === 'grok-bot');
  check(ag.length === 2, `spending page should report 2 agents, got ${JSON.stringify(ag.map((a) => a.id))}`);
  check(cursor && cursor.limits[0].percent_left === 4, `Cursor Models should be 4% left, got ${JSON.stringify(cursor)}`);
  check(cursor && cursor.limits[1] && cursor.limits[1].percent_left === 46, 'Other Models should be 46% left');
  check(cursor && cursor.limits[0].resets_text === '9月26日 (24 days)', `Cursor reset text, got ${cursor && cursor.limits[0].resets_text}`);
  check(cursor && cursor.plan === 'Pro $20/mo', `Cursor plan, got ${cursor && cursor.plan}`);
  check(bot && bot.limits[0].percent_left === 87, `Grok Bot should be 87% left, got ${JSON.stringify(bot)}`);
  check(bot && bot.limits[0].resets_text === '9月3日 (23 hours and 4 minutes left)', `Grok Bot reset text, got ${bot && bot.limits[0].resets_text}`);
  check(ag.every((a) => a.status === 'ok' && a.scraped_at > 0), 'every agent should carry status/scraped_at');
  check(ag.every((a) => a.capture_trigger === 'manual' && a.capture_source_url.includes('cursor.com')), 'auto-opened agents should carry trigger/source metadata');
  check(p.closed(), 'auto-opened spending page should close after both agents are saved');
}

// --- A user-opened spending page records section_missing, not a login failure ---
{
  const noBot = SPENDING.slice(0, SPENDING.indexOf('Grok Bot'));
  const p = runPage({ host: 'cursor.com', path: '/dashboard/spending', text: noBot });
  const miss = p.failures().find((x) => x.agent_id === 'grok-bot');
  check(miss && miss.status === 'missing' && miss.reason === 'section_missing',
    `page scrape should report missing/section_missing for Grok Bot, got ${JSON.stringify(p.failures())}`);
}

// --- Same page without a Grok Bot section: only Cursor, and the tab still closes ---
{
  const noBot = SPENDING.slice(0, SPENDING.indexOf('Grok Bot'));
  const p = runPage({ host: 'cursor.com', search: '?cawrefresh=1', text: noBot });
  check(p.agents().map((a) => a.id).join() === 'cursor', 'page without Grok Bot should report only cursor');
  check(p.closed(), 'page without Grok Bot should close right away');
}

// --- Grok Bot heading is there but its number renders later: save Cursor now, wait, then close ---
{
  const partial = SPENDING.replace('13% used\n', '');
  const p = runPage({ host: 'cursor.com', search: '?cawrefresh=1', text: partial });
  check(p.agents().map((a) => a.id).join() === 'cursor', 'Cursor should be saved before Grok Bot renders');
  check(!p.closed(), 'must keep the page open while the Grok Bot number is still loading');
  p.setText(SPENDING);
  check(p.agents().map((a) => a.id).join() === 'cursor,grok-bot', 'Grok Bot should be saved once its number renders');
  check(p.agents().filter((a) => a.id === 'cursor').length === 1, 'Cursor must not be saved twice');
  check(p.closed(), 'page should close after the late Grok Bot section is saved');
}

// --- Timeout: nothing usable after 30 ticks → close without data ---
{
  const p = runPage({ host: 'cursor.com', search: '?cawrefresh=1', text: 'Loading…' });
  for (let i = 0; i < 31; i++) p.tick();
  check(p.agents().length === 0, 'no data should be sent for a page that never renders');
  check(p.closed(), 'auto-opened page should still close after the timeout');
}

// --- User-opened usage page timeout reports a failed page attempt ---
{
  const p = runPage({ host: 'gemini.google.com', path: '/usage', text: 'Loading…' });
  for (let i = 0; i < 31; i++) p.tick();
  const fail = p.failures()[0];
  check(fail && fail.agent_id === 'gemini' && fail.status === 'failed' && fail.reason === 'blank_page',
    `page timeout on an unrendered page should report failed/blank_page, got ${JSON.stringify(p.failures())}`);
  check(fail && fail.trigger === 'page' && /text=/.test(fail.detail || ''),
    `page failure should carry the trigger and a text sample, got ${JSON.stringify(fail)}`);
}

// --- Gemini usage page from the user's screenshot ---
const GEMINI = `
Usage limits PRO
Your plan's limits determine how much you can use Gemini over time. Advanced models and features can take up more usage. Learn more
Updated just now
Current usage
0% used
Resets at 2:29 PM
Weekly limit
Resets Sep 6 at 8:29 AM
0% used
Get 5x more usage with AI Ultra
$99.99/month
Upgrade
`;
{
  const p = runPage({ host: 'gemini.google.com', text: GEMINI });
  const g = p.agents()[0];
  check(p.agents().length === 1 && g.id === 'gemini', `gemini page should report gemini, got ${JSON.stringify(p.agents())}`);
  check(g && g.limits[0].label === 'Weekly' && g.limits[0].percent_left === 100, `Gemini weekly should be 100% left, got ${JSON.stringify(g)}`);
  check(g && g.limits[0].resets_text === 'Sep 6 at 8:29 AM', `Gemini weekly reset, got ${g && g.limits[0].resets_text}`);
  check(g && g.limits[1] && g.limits[1].label === 'Current usage' && g.limits[1].percent_left === 100, 'Gemini current usage should be 100% left');
  check(g && g.limits[1] && g.limits[1].resets_text === '2:29 PM', `Gemini current reset should drop "at", got ${g && g.limits[1].resets_text}`);
  check(g && g.plan === 'PRO', `Gemini plan, got ${g && g.plan}`);
  check(!p.closed(), 'a page the user opened themselves (no cawrefresh) must not be closed');
}

{
  const p = runPage({ host: 'cursor.com', path: '/agents', text: SPENDING });
  check(p.agents().length === 0, 'dispatch surface should not scrape usage');
  for (let i = 0; i < 31; i++) p.tick();
  check(p.agents().length === 0, 'dispatch surface should not poll-scrape');
  check(!p.closed(), 'dispatch tab must not auto-close');
}
{
  const p = runPage({ host: 'grok.com', path: '/', text: 'Ask Grok' });
  for (let i = 0; i < 31; i++) p.tick();
  check(p.agents().length === 0, 'grok chat home should not scrape usage');
  check(!p.closed(), 'grok chat tab must not auto-close');
}
{
  const p = runPage({ host: 'claude.ai', path: '/new', text: 'All models\n10% used' });
  check(p.agents().length === 0, 'Claude chat /new should not scrape usage');
}
{
  const p = runPage({ host: 'chatgpt.com', path: '/', text: 'What can I help with?' });
  check(p.agents().length === 0, 'ChatGPT chat home should not scrape Codex usage');
}

{
  const CODEX = `
Weekly usage limit
44% remaining
Resets Sep 26, 2026 at 3:00 AM PT
5-hour usage limit
100% remaining
Resets 8:12 PM
`;
  const p = runPage({ host: 'chatgpt.com', path: '/codex/cloud/settings/analytics', text: CODEX });
  const c = p.agents()[0];
  check(c && c.id === 'codex' && c.limits[0].percent_left === 44, `codex weekly remaining, got ${JSON.stringify(c)}`);
  check(c && c.limits[0].resets_text === 'Sep 26, 2026 at 3:00 AM PT', `codex weekly reset, got ${c && c.limits[0].resets_text}`);
  check(c && c.limits[1] && c.limits[1].percent_left === 100 && c.limits[1].resets_text === '8:12 PM',
    `codex 5-hour row, got ${JSON.stringify(c && c.limits[1])}`);
}

{
  const NEW_CODEX = `
Plan limits
5-hour limit
Resets in 5h 0m
100% left
Weekly limit
Resets in 6d 4h
97% left
0 credits remaining
`;
  const p = runPage({ host: 'chatgpt.com', path: '/settings/usage', search: '?tab=overview', text: NEW_CODEX });
  const c = p.agents()[0];
  check(c && c.id === 'codex' && c.limits[0].percent_left === 97, `new codex weekly left, got ${JSON.stringify(c)}`);
  check(c && c.limits[1] && c.limits[1].percent_left === 100 && c.limits[1].resets_text === 'in 5h 0m',
    `new codex 5-hour row, got ${JSON.stringify(c && c.limits[1])}`);
}

{
  const busy = GEMINI.replace('Current usage\n0% used\nResets at 2:29 PM', 'Current usage\n42% used').replace('Weekly limit\nResets Sep 6 at 8:29 AM\n0% used', 'Weekly limit\nResets Sep 6 at 8:29 AM\n17% used');
  const g = runPage({ host: 'gemini.google.com', text: busy }).agents()[0];
  check(g && g.limits[0].percent_left === 83, 'Gemini weekly 17% used → 83% left');
  check(g && g.limits[1].percent_left === 58, 'Gemini current 42% used → 58% left');
  check(g && g.limits[1].resets_text == null, 'Current usage without its own Resets line must not borrow the weekly one');
}
{
  const p = runPage({ host: 'gemini.google.com', text: 'Hello, how can I help you today?' });
  check(p.agents().length === 0, 'the Gemini chat page must not produce data');
}

// --- Other hosts still work the same way ---
{
  const p = runPage({ host: 'claude.ai', text: 'All models\n30% used\nResets in 2 days\nCurrent session\n10% used\nResets in 1 hr 58 min' });
  const c = p.agents()[0];
  check(c && c.id === 'claude-code' && c.limits[0].percent_left === 70 && c.limits[1].percent_left === 90, `claude page, got ${JSON.stringify(c)}`);
}
{
  const NEW_CLAUDE = `
Current session
Resets at 6:30 AM
8% used
This week
Resets at 5:00 PM
84% used
Fable this week
72% used
This week's usage by product
Claude Code
98%
`;
  const p = runPage({ host: 'claude.ai', text: NEW_CLAUDE });
  const c = p.agents()[0];
  check(c && c.id === 'claude-code', `new claude page should still be Claude Code, got ${JSON.stringify(c)}`);
  check(c && c.limits[0].percent_left === 16 && c.limits[0].resets_text === 'at 5:00 PM',
    `new claude weekly leftover from This week 84%, got ${JSON.stringify(c && c.limits[0])}`);
  check(c && c.limits[1] && c.limits[1].percent_left === 92 && c.limits[1].resets_text === 'at 6:30 AM',
    `new claude session leftover from 8% used, got ${JSON.stringify(c && c.limits[1])}`);
  check(c && c.limits.length === 2, `new claude page must not add a Fable or product card, got ${c && c.limits.length} limits`);
}

function jsonOk(body) {
  return { ok: true, status: 200, type: 'basic', json: async () => JSON.parse(JSON.stringify(body)) };
}

function cursorFetch(handlers) {
  return async (url) => {
    const path = String(url);
    for (const [key, body] of Object.entries(handlers)) {
      if (path.includes(key)) return jsonOk(body);
    }
    return { ok: false, status: 404, type: 'basic', json: async () => null };
  };
}

{
  const now = Date.parse('2026-09-17T12:00:00Z');
  const p = runPage({
    host: 'cursor.com',
    path: '/dashboard/spending',
    search: '?cawrefresh=1',
    text: 'Loading…',
    fetch: cursorFetch({
      'get-current-period-usage': {
        billingCycleEnd: String(now + 16 * 86400000),
        planUsage: { autoPercentUsed: 35, apiPercentUsed: 100 },
      },
      'get-plan-info': { planInfo: { planName: 'Pro+', price: '$60/mo' } },
      'get-sand-usage-status': {
        usagePercent: 1,
        hasNonZeroIncludedLimit: true,
        nextResetTimestampUtc: now + 7 * 86400000,
      },
    }),
  });
  await p.flush();
  const ag = p.agents();
  const cursor = ag.find((a) => a.id === 'cursor');
  const bot = ag.find((a) => a.id === 'grok-bot');
  check(cursor && cursor.limits[0].percent_left === 65, `background spending JSON should save Cursor 65% left, got ${JSON.stringify(cursor)}`);
  check(cursor && cursor.limits[1] && cursor.limits[1].percent_left === 0, 'background spending JSON should save Other Models 0% left');
  check(cursor && cursor.plan === 'Pro+ $60/mo', `background spending JSON should save the plan, got ${cursor && cursor.plan}`);
  check(bot && bot.limits[0].percent_left === 99, `background spending JSON should save Grok Bot 99% left, got ${JSON.stringify(bot)}`);
  check(p.closed(), 'auto-opened spending page should close after the dashboard JSON is saved');
}

{
  const p = runPage({
    host: 'cursor.com',
    path: '/dashboard/spending',
    search: '?cawrefresh=1',
    text: 'Loading…',
    fetch: cursorFetch({
      'get-current-period-usage': { planUsage: { autoPercentUsed: 35, apiPercentUsed: 100 } },
      'get-plan-info': { planInfo: { planName: 'Pro+', price: '$60/mo' } },
      'get-sand-usage-status': { hasNonZeroIncludedLimit: false, usagePercent: 0 },
    }),
  });
  await p.flush();
  check(p.agents().map((a) => a.id).join() === 'cursor', 'JSON with no Grok Bot allowance should save only cursor');
  check(p.closed(), 'page should close once JSON says Grok Bot is not included');
}

{
  const p = runPage({
    host: 'cursor.com',
    path: '/dashboard/spending',
    search: '?cawrefresh=1',
    text: 'Loading…',
    fetch: cursorFetch({
      'usage-summary': {
        individualUsage: { plan: { autoPercentUsed: 40, apiPercentUsed: 10 } },
      },
    }),
  });
  await p.flush();
  const cursor = p.agents().find((a) => a.id === 'cursor');
  check(cursor && cursor.limits[0].percent_left === 60, `usage-summary GET fallback should save Cursor, got ${JSON.stringify(cursor)}`);
  check(!p.closed(), 'usage-summary without Grok Bot JSON should keep waiting rather than close as missing');
}

{
  const p = runPage({
    host: 'cursor.com',
    path: '/dashboard/spending',
    search: '?cawrefresh=1',
    text: 'Loading…',
    fetch: async () => ({ ok: false, status: 401, type: 'basic', json: async () => ({ error: 'not_authenticated' }) }),
  });
  await p.flush();
  check(p.agents().length === 0, 'failed dashboard JSON should not invent numbers');
  check(!p.closed(), 'failed JSON should keep waiting for the DOM, not close immediately');
}

// ===================== Grok: learned REST map first, DOM as fallback/teacher =====================
const GROK_RESET_MS = Date.parse('October 22, 2026 11:20 AM');
const GROK_USAGE_JSON = {
  weekly: {
    percentUsed: 10,
    resetsAt: new Date(GROK_RESET_MS).toISOString(),
    categories: [{ name: 'Grok Build', percentUsed: 7 }, { name: 'Automations', percentUsed: 3 }],
  },
};
const GROK_DOM = `Usage
Weekly SuperGrok Limit
10% used
Resets October 22, 2026 at 11:20 AM
Grok Build 7%
Automations 3%
Extra Usage Credits
$0.00
Buy Credits
Auto Top-Up`;
const GROK_MAP = {
  version: 1,
  learnedAt: 1,
  request: { url: 'https://grok.com/rest/subscriptions/usage', method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"window":"WEEKLY"}' },
  used: { path: ['weekly', 'percentUsed'], kind: 'used' },
  reset: { path: ['weekly', 'resetsAt'], kind: 'iso' },
  breakdown: [{ type: 'array', arrayPath: ['weekly', 'categories'], nameKey: 'name', valueKey: 'percentUsed', kind: 'used' }],
};
function grokFetch(json, status = 200) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    if (status !== 200) return { ok: false, status, type: 'basic', json: async () => null };
    return { ok: true, status: 200, type: 'basic', json: async () => json };
  };
  impl.calls = calls;
  return impl;
}

// --- Learned map: the frozen page never renders, the replayed request still yields the numbers ---
{
  const fetchImpl = grokFetch({ weekly: { percentUsed: 42, resetsAt: '2026-10-29T18:20:00.000Z', categories: [{ name: 'Grok Build', percentUsed: 30 }, { name: 'Imagine', percentUsed: 12 }] } });
  const p = runPage({ host: 'grok.com', search: '?_s=usage&cawrefresh=1&cawtrigger=automatic', text: 'Loading…', fetch: fetchImpl, storage: { grokApiMap: GROK_MAP } });
  await p.flush(12);
  const g = p.agents().find((a) => a.id === 'grok-build');
  check(g && g.limits[0].percent_left === 58, `replayed request should save Grok 58% left without any DOM, got ${JSON.stringify(g)}`);
  check(g && g.source === 'api', 'API-sourced Grok agent should be tagged source=api');
  check(g && g.breakdown && g.breakdown.map((x) => x.name + ':' + x.percent).join() === 'Grok Build:30,Imagine:12', `API breakdown should include every slice, got ${JSON.stringify(g && g.breakdown)}`);
  check(g && g.limits[0].resets_text && !isNaN(Date.parse(g.limits[0].resets_text.replace(' at ', ' '))), `API reset should format like the page text, got ${g && g.limits[0].resets_text}`);
  check(p.closed(), 'auto-opened Grok tab should close right after the API read');
  const call = fetchImpl.calls[0];
  check(call && call.url === GROK_MAP.request.url && call.init.method === 'POST' && call.init.body === '{"window":"WEEKLY"}' && call.init.credentials === 'include',
    `replay must reuse url/method/body with cookies, got ${JSON.stringify(call)}`);
  check(p.posted().some((d) => d.__tokenPolice === 'grok-rest-ready'), 'content.js must tell the MAIN-world tap it is ready');
}

// --- No map yet: DOM read succeeds, tap hands over the JSON, the map is learned and stored ---
{
  const p = runPage({ host: 'grok.com', search: '?_s=usage&cawrefresh=1', text: 'Loading…', fetch: grokFetch(null, 404), storage: {} });
  await p.flush(12);
  p.message({ __tokenPolice: 'grok-rest', url: 'https://grok.com/rest/auth/get-user', method: 'GET', status: 200, headers: {}, body: null, text: JSON.stringify({ userId: 'u1' }) });
  p.message({ __tokenPolice: 'grok-rest', url: 'https://grok.com/rest/subscriptions/usage', method: 'POST', status: 200, headers: { 'content-type': 'application/json', cookie: 'sso=secret' }, body: '{"window":"WEEKLY"}', text: JSON.stringify(GROK_USAGE_JSON) });
  p.message({ __tokenPolice: 'grok-rest', url: 'https://grok.com/rest/app-chat/stream', method: 'POST', status: 200, contentType: 'text/event-stream', text: null });
  check(p.agents().length === 0, 'nothing saved before the dialog renders');
  p.setText(GROK_DOM);
  await new Promise((r) => setTimeout(r, 1300)); // the big number must hold still (grokStable)
  p.tick();
  await p.flush(12);
  const g = p.agents().find((a) => a.id === 'grok-build');
  check(g && g.limits[0].percent_left === 90 && g.source === 'dom', `DOM read should save Grok 90% left, got ${JSON.stringify(g)}`);
  const map = p.storage.grokApiMap;
  check(map && map.request.url === 'https://grok.com/rest/subscriptions/usage', `DOM success must teach the REST map, got ${JSON.stringify(map)}`);
  check(map && map.used.path.join('.') === 'weekly.percentUsed' && map.reset && map.reset.kind === 'iso', `learned paths, got ${JSON.stringify(map)}`);
  check(map && !('cookie' in map.request.headers), 'learned map must not keep the cookie header');
  check(p.closed(), 'Grok tab closes once the DOM read is saved and the map learned');
}

// --- Learning fails: the success log gets a report of what the page fetched ---
{
  const p = runPage({ host: 'grok.com', search: '?_s=usage&cawrefresh=1', text: 'Loading…', fetch: grokFetch(null, 404), storage: {} });
  await p.flush(12);
  p.message({ __tokenPolice: 'grok-rest', url: 'https://grok.com/rest/products', method: 'GET', status: 200, headers: {}, body: null, text: JSON.stringify({ plans: [{ price: 30 }] }) });
  p.message({ __tokenPolice: 'grok-rest', url: 'https://grok.com/xai.billing.Usage/GetWeekly', method: 'POST', status: 200, contentType: 'application/grpc-web+proto', text: null });
  p.message({ __tokenPolice: 'grok-rest', url: 'https://api.x.ai/v1/usage', method: 'GET', status: 200, contentType: 'application/json; charset=utf-8', text: null });
  p.setText(GROK_DOM);
  await new Promise((r) => setTimeout(r, 1300));
  p.tick();
  await new Promise((r) => setTimeout(r, 2800)); // learn hold expires, page closes
  await p.flush(12);
  const d = p.sent.find((m) => m.type === 'captureDetail');
  check(d && d.agent_id === 'grok-build' && /^learn=fail; dom_used=10/.test(d.detail), `failed learn should send a report, got ${JSON.stringify(d)}`);
  check(d && /json=\[\/rest\/products\]/.test(d.detail), `report lists JSON candidates, got ${d && d.detail}`);
  check(d && /\/xai\.billing\.Usage\/GetWeekly \[application\/grpc-web\+proto\]/.test(d.detail) && /api\.x\.ai\/v1\/usage \[application\/json\]/.test(d.detail),
    `report lists non-JSON and other-host requests with their type, got ${d && d.detail}`);
  check(!p.storage.grokApiMap, 'nothing learned from unrelated JSON');
}

// --- Learning works: the report names the endpoint and field ---
{
  const p = runPage({ host: 'grok.com', search: '?_s=usage&cawrefresh=1', text: 'Loading…', fetch: grokFetch(null, 404), storage: {} });
  await p.flush(12);
  p.message({ __tokenPolice: 'grok-rest', url: 'https://grok.com/rest/subscriptions/usage', method: 'POST', status: 200, headers: {}, body: '{}', text: JSON.stringify(GROK_USAGE_JSON) });
  p.setText(GROK_DOM);
  await new Promise((r) => setTimeout(r, 1300));
  p.tick();
  await p.flush(12);
  const d = p.sent.find((m) => m.type === 'captureDetail');
  check(d && d.detail === 'learn=ok; POST /rest/subscriptions/usage used=weekly.percentUsed(used)', `successful learn report, got ${JSON.stringify(d)}`);
}

// --- Map exists but the API shape changed: fall back to the DOM and re-learn ---
{
  const stale = Object.assign({}, GROK_MAP, { used: { path: ['weekly', 'oldField'], kind: 'used' } });
  const p = runPage({ host: 'grok.com', search: '?_s=usage&cawrefresh=1', text: 'Loading…', fetch: grokFetch({ weekly: { percentUsed: 10 } }), storage: { grokApiMap: stale } });
  await p.flush(12);
  check(p.agents().length === 0, 'shape mismatch must not invent a number');
  p.message({ __tokenPolice: 'grok-rest', url: 'https://grok.com/rest/subscriptions/usage', method: 'POST', status: 200, headers: {}, body: null, text: JSON.stringify(GROK_USAGE_JSON) });
  p.setText(GROK_DOM);
  await new Promise((r) => setTimeout(r, 1300));
  p.tick();
  await p.flush(12);
  const g = p.agents().find((a) => a.id === 'grok-build');
  check(g && g.source === 'dom' && g.limits[0].percent_left === 90, `DOM fallback after shape mismatch, got ${JSON.stringify(g)}`);
  check(p.storage.grokApiMap && p.storage.grokApiMap.used.path.join('.') === 'weekly.percentUsed', 're-learned map replaces the stale one');
}

// --- Everything fails: the report says which layer broke and carries diagnostics ---
{
  const p = runPage({ host: 'grok.com', search: '?_s=usage&cawrefresh=1&cawtrigger=manual', text: 'Ask Grok anything. Build Imagine Voice. New chat. History: ten things about my project and lots more words here.', fetch: grokFetch(null, 401), storage: { grokApiMap: GROK_MAP } });
  await p.flush(12);
  p.message({ __tokenPolice: 'grok-rest', url: 'https://grok.com/rest/auth/get-user', method: 'GET', status: 200, headers: {}, body: null, text: JSON.stringify({ userId: 'u1' }) });
  for (let i = 0; i < 20; i++) p.tick();
  const f = p.failures().find((x) => x.agent_id === 'grok-build');
  check(f && f.reason === 'usage_view_closed', `grok page without the dialog should report usage_view_closed, got ${JSON.stringify(f)}`);
  check(f && f.trigger === 'manual', 'manual refresh failures are reported by the page itself');
  check(f && /api=http_401/.test(f.detail) && /\/rest\/auth\/get-user/.test(f.detail) && /text="/.test(f.detail),
    `diagnostics should carry api status, seen requests and a text sample, got ${f && f.detail}`);
  check(p.closed(), 'auto-opened tab still closes after reporting');
}

// --- SPA rewrote the address bar: background says this tab is a scrape tab, so we scrape anyway ---
{
  const p = runPage({ host: 'grok.com', path: '/', search: '', text: 'Loading…', fetch: grokFetch({ weekly: { percentUsed: 10, resetsAt: new Date(GROK_RESET_MS).toISOString(), categories: [] } }), storage: { grokApiMap: GROK_MAP }, scrapeInfo: { url: 'https://grok.com/?_s=usage&cawrefresh=1&cawtrigger=automatic', trigger: 'automatic' } });
  await p.flush(12);
  const g = p.agents().find((a) => a.id === 'grok-build');
  check(g && g.limits[0].percent_left === 90, `scrape tab with a rewritten URL should still read Grok via the map, got ${JSON.stringify(g)}`);
  check(p.closed(), 'rewritten-URL scrape tab should still auto-close');
}
{
  const p = runPage({ host: 'grok.com', path: '/', search: '', text: 'Ask Grok', storage: {}, scrapeInfo: null });
  await p.flush(4);
  check(p.sent.some((m) => m.type === 'scrapeInfo'), 'a grok chat page asks background whether it is a scrape tab');
  check(p.agents().length === 0 && !p.closed(), 'a real chat tab (not a scrape tab) is left alone');
}

// --- After the weekly reset Grok shows "0% used" via NumberFlow: the number lives
// in Shadow DOM as digit columns 0-9 where only the current digit is not inert ---
{
  const txt = (t) => ({ nodeType: 3, nodeValue: t });
  const el = (name, kids = [], attrs = {}, shadow = null) => ({
    nodeType: 1, nodeName: name, childNodes: kids, shadowRoot: shadow ? { childNodes: shadow } : null,
    hasAttribute: (a) => a in attrs,
  });
  const digit = (n) => el('SPAN', Array.from({ length: 10 }, (_, i) => el('SPAN', [txt(String(i))], i === n ? {} : { inert: '' })));
  const flow = (digits) => el('NUMBER-FLOW-REACT', [], {}, [el('STYLE', [txt('.digit{--x:50%}')]), el('SPAN', digits.map(digit)), el('SPAN', [el('SPAN', [txt('%')])])]);
  const inner = 'Usage\nWeekly SuperGrok Limit\nused\nResets October 29, 2026 at 11:20 AM\nWeekly Grok Bot Limit\nused\nResets October 28, 2026 at 12:41 AM\nExtra Usage Credits\nBuy Credits';
  const nodes = [el('DIV', [
    el('P', [txt('Weekly SuperGrok Limit')]), flow([4, 4]), el('SPAN', [txt('used')]), el('P', [txt('Resets October 29, 2026 at 11:20 AM')]),
    el('P', [txt('Weekly Grok Bot Limit')]), flow([2]), el('SPAN', [txt('used')]), el('P', [txt('Extra Usage Credits')]),
  ])];
  const p = runPage({ host: 'grok.com', search: '?_s=usage&cawrefresh=1&cawtrigger=manual', text: inner, nodes, fetch: grokFetch(null, 404), storage: {} });
  await p.flush(12);
  p.tick();
  await new Promise((r) => setTimeout(r, 1300));
  p.tick();
  await p.flush(12);
  const g = p.agents().find((a) => a.id === 'grok-build');
  check(g && g.limits[0].percent_left === 56, `NumberFlow "44%" in Shadow DOM should save Grok 56% left, got ${JSON.stringify(g)}`);
  check(g && g.limits[0].resets_text === 'October 29, 2026 at 11:20 AM', `reset from the dialog, got ${JSON.stringify(g)}`);
}

// --- Black box: a Grok page that cannot be read stores the usage area's structure in the log ---
{
  const txt = (t) => ({ nodeType: 3, nodeValue: t });
  const el = (name, kids = [], attrs = {}, shadow = null) => {
    const node = {
      nodeType: 1, nodeName: name, childNodes: kids, shadowRoot: shadow ? { childNodes: shadow } : null,
      attributes: Object.keys(attrs).map((k) => ({ name: k, value: attrs[k] })),
      hasAttribute: (a) => a in attrs,
      get textContent() { return kids.map((k) => k.nodeType === 3 ? k.nodeValue : k.textContent).join(''); },
    };
    kids.forEach((k) => { k.parentElement = node; k.parentNode = node; });
    if (shadow) { node.shadowRoot.host = node; shadow.forEach((k) => { k.parentNode = node.shadowRoot; }); }
    return node;
  };
  const filler = 'x'.repeat(700);
  const nodes = [el('SECTION', [
    el('DIV', [el('P', [txt('Weekly SuperGrok Limit')]), el('DIV', [], { 'data-value': '0', style: '--num: 0' }), el('SPAN', [txt('used')])], { class: 'card' }),
    el('DIV', [el('DIV', [], { role: 'progressbar', style: 'width: 0%' })]),
    el('P', [txt(filler)]),
    el('P', [txt('me@example.com')]),
  ])];
  const inner = 'Usage\nWeekly SuperGrok Limit\nused\nResets October 29, 2026 at 11:20 AM\nExtra Usage Credits\nBuy Credits';
  const p = runPage({ host: 'grok.com', search: '?_s=usage&cawrefresh=1&cawtrigger=manual', text: inner, nodes, fetch: grokFetch(null, 404), storage: {} });
  await p.flush(12);
  for (let i = 0; i < 20; i++) p.tick();
  const f = p.failures().find((x) => x.agent_id === 'grok-build');
  check(f && f.reason === 'parse_failed', `unreadable dialog should be parse_failed, got ${JSON.stringify(f && f.reason)}`);
  check(f && typeof f.dom === 'string' && /<p>\n\s+"Weekly SuperGrok Limit"/.test(f.dom), `dom dump should include the heading, got ${f && f.dom}`);
  check(f && /data-value="0" style="--num: 0"/.test(f.dom) && /role="progressbar" style="width: 0%"/.test(f.dom), `dom dump keeps attributes that may hold the number, got ${f && f.dom}`);
  check(f && /\[email\]/.test(f.dom) && !/me@example\.com/.test(f.dom), 'dom dump strips emails');
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('ok  Cursor spending page reports Cursor (4% left) and Grok Bot (87% left) from one scrape');
console.log('ok  Missing / late Grok Bot section: Cursor saved, page waits, closes once done');
console.log('ok  Grok: learned REST map replays first, DOM teaches/falls back, failures say which layer broke');
console.log('ok  Grok NumberFlow digits in Shadow DOM are read as one number');
console.log('ok  Unreadable Grok page stores its usage-area structure in the log');
console.log('ok  Gemini usage page reports weekly + current usage, PRO plan');
console.log('ok  Codex analytics page reports weekly reset text (not null)');
console.log('ok  Frozen spending page still saves Cursor + Grok Bot from dashboard JSON');
console.log('\nContent test passed.');
