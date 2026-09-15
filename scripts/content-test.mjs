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
function runPage({ host, path = '/', search = '', hash = '', text }) {
  const sent = [];
  let body = { innerText: text, childNodes: [] };
  let observerCb = null;
  let intervalCb = null;
  const ctxObj = {
    Date,
    setInterval: (fn) => { intervalCb = fn; return 1; },
    clearInterval: () => { intervalCb = null; },
    MutationObserver: class { constructor(cb) { observerCb = cb; } observe() {} disconnect() { observerCb = null; } },
    document: { body, documentElement: {} },
    location: { hostname: host, pathname: path, search, hash, href: `https://${host}${path}${search}${hash}` },
    chrome: { runtime: { sendMessage: (msg, cb) => { sent.push(msg); if (cb) cb(); }, lastError: null } },
  };
  const ctx = vm.createContext(ctxObj);
  vm.runInContext(parseSrc, ctx, { filename: 'parse.js' });
  vm.runInContext(contentSrc, ctx, { filename: 'content.js' });
  return {
    sent,
    setText: (t) => { body.innerText = t; if (observerCb) observerCb(); },
    tick: () => { if (intervalCb) intervalCb(); },
    agents: () => sent.filter((m) => m.type === 'agentData').map((m) => m.agent),
    closed: () => sent.some((m) => m.type === 'closeMe'),
    failures: () => sent.filter((m) => m.type === 'pageCaptureFailed'),
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
  check(fail && fail.agent_id === 'gemini' && fail.status === 'failed' && fail.reason === 'read_failed',
    `page timeout should report failed/read_failed, got ${JSON.stringify(p.failures())}`);
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

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('ok  Cursor spending page reports Cursor (4% left) and Grok Bot (87% left) from one scrape');
console.log('ok  Missing / late Grok Bot section: Cursor saved, page waits, closes once done');
console.log('ok  Gemini usage page reports weekly + current usage, PRO plan');
console.log('\nContent test passed.');
