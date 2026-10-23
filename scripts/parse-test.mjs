// Fixture tests for SuperGrok usage parsing (no browser required).

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = {};
vm.runInNewContext(readFileSync(resolve(root, 'parse.js'), 'utf8'), ctx, { filename: 'parse.js' });
const { parseGrokUsage } = ctx;
if (typeof parseGrokUsage !== 'function') {
  console.error('parseGrokUsage was not loaded from parse.js');
  process.exit(1);
}

const USER_SUPERGROK = `
Settings
General
Account
Appearance
Behavior
Grok
Customize
Payments
Billing
Usage
Data & Information
Data Controls

Weekly SuperGrok Limit
Resets August 28, 2026 at 2:20 AM
Total Usage
33% used
Chat
16%
App Builder
10%
Automations
6%
Imagine
1%
Extra Usage Credits
$0.00
Buy Credits
Auto Top-Up
Automatically top-up when your credit balance runs low
Set up
`;

let failed = 0;
function check(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) {
    console.log(`ok  ${name}`);
    return;
  }
  failed++;
  console.error(`fail  ${name}\n  got  ${g}\n  want ${w}`);
}

function leftover(used) {
  return 100 - used;
}

{
  const p = parseGrokUsage(USER_SUPERGROK);
  check('user screenshot: used %', p && p.used, 33);
  check('user screenshot: remaining %', p && leftover(p.used), 67);
  check('user screenshot: reset', p && p.reset, 'August 28, 2026 at 2:20 AM');
  check('user screenshot: category sum', p && p.breakdown.reduce((s, x) => s + x.percent, 0), 33);
  check('user screenshot: App Builder slice', p && p.breakdown.find((x) => x.name === 'App Builder')?.percent, 10);
  check('user screenshot: category order', p && p.breakdown.map((x) => x.name), ['Chat', 'App Builder', 'Automations', 'Imagine']);
}

{
  const noisy = `Grok\nYour disk is 9% used\ncontinue the task\n${USER_SUPERGROK}`;
  const p = parseGrokUsage(noisy);
  check('ignores earlier "9% used" on grok.com (the 91%-left bug)', p && leftover(p.used), 67);
  check('noisy page still reports 33% used', p && p.used, 33);
}

{
  const oldFirstMatch = (T) => {
    const m = T.match(/(\d+)\s*%\s*used/i);
    return m ? parseInt(m[1], 10) : null;
  };
  const noisy = `chat history\n9% used\n${USER_SUPERGROK}`;
  check('old whole-page regex would have returned 9', oldFirstMatch(noisy), 9);
}

{
  const aria = `
Weekly SuperGrok Limit SuperGrok
Resets August 28, 2026 at 2:20 AM
App Builder 10% used
Automations 6% used
Chat 16% used
Imagine 1% used
Extra Usage Credits
`;
  const p = parseGrokUsage(aria);
  check('category aria-labels summing to total', p && p.used, 33);
  check('does not treat App Builder 10% as the weekly total', p && leftover(p.used), 67);
}

{
  const splitDigits = `
Weekly SuperGrok Limit SuperGrok
Resets August 28, 2026 at 2:20 AM
Total Usage
3
3
%
used
Chat 16%
App Builder 10%
Automations 6%
Imagine 1%
Extra Usage Credits
`;
  const p = parseGrokUsage(splitDigits);
  check('split "33% used" digits still resolve via category sum', p && p.used, 33);
}

{
  const noTotal = `
Weekly SuperGrok Limit SuperGrok
Resets August 28, 2026 at 2:20 AM
Chat 16%
App Builder 10%
Automations 6%
Imagine 1%
Extra Usage Credits
`;
  const p = parseGrokUsage(noTotal);
  check('fallback to category sum when Total Usage is not in the text', p && p.used, 33);
}

{
  const empty = `
Weekly SuperGrok Limit SuperGrok
Resets August 28, 2026 at 2:20 AM
Total Usage
0% used
Extra Usage Credits
$0.00
`;
  const p = parseGrokUsage(empty);
  check('0% used is valid (100% remaining)', p && leftover(p.used), 100);
}

{
  check('not the usage view', parseGrokUsage('just chatting with grok about code'), null);
}

// --- 2026-10 layout: "Grok Build" slice, total before reset, no "Total Usage" label ---
{
  const T = `Usage
Weekly SuperGrok Limit
10% used
Resets October 22, 2026 at 11:20 AM
Grok Build 7%
Automations 3%
Extra Usage Credits
$0.00
Additional Credits
Buy Credits
Auto Top-Up
Automatically top-up when your credit balance runs low.
Set up`;
  const p = parseGrokUsage(T);
  check('2026-10 layout: used %', p && p.used, 10);
  check('2026-10 layout: reset', p && p.reset, 'October 22, 2026 at 11:20 AM');
  check('2026-10 layout: Grok Build slice is known', p && p.breakdown.map((x) => x.name + ':' + x.percent), ['Grok Build:7', 'Automations:3']);
  const renamed = T.replace('Grok Build 7%', 'Companion Mode 7%');
  const q = parseGrokUsage(renamed);
  check('unknown slice name is still picked up generically', q && q.breakdown.map((x) => x.name + ':' + x.percent), ['Automations:3', 'Companion Mode:7']);
}

// --- Learn the REST shape from a DOM read, then read fresh JSON with the map ---
const { learnGrokApiMap, readGrokApiMap, grokFormatReset, grokParseResetMs, classifyCaptureFailure, captureTextSample } = ctx;
{
  const resetMs = Date.parse('October 22, 2026 11:20 AM');
  const parsed = { used: 10, reset: 'October 22, 2026 at 11:20 AM', breakdown: [{ name: 'Grok Build', percent: 7 }, { name: 'Automations', percent: 3 }] };
  const candidates = [
    { url: 'https://grok.com/rest/auth/get-user', method: 'GET', status: 200, json: { userId: 'u1', createTime: '2024-01-01T00:00:00Z' } },
    { url: 'https://grok.com/rest/app-chat/conversations', method: 'GET', status: 200, json: { conversations: [{ id: 'c1', title: 'ten things' }] } },
    {
      url: 'https://grok.com/rest/subscriptions/usage',
      method: 'POST',
      body: '{"window":"WEEKLY"}',
      headers: { 'content-type': 'application/json', cookie: 'sso=secret', authorization: 'Bearer nope', 'x-xai-request-id': 'abc' },
      status: 200,
      json: {
        weekly: {
          percentUsed: 10,
          resetsAt: new Date(resetMs).toISOString(),
          categories: [
            { name: 'Grok Build', percentUsed: 7 },
            { name: 'Automations', percentUsed: 3 },
          ],
        },
      },
    },
  ];
  const map = learnGrokApiMap(candidates, parsed, 1000);
  check('learn: picks the usage request', map && map.request.url, 'https://grok.com/rest/subscriptions/usage');
  check('learn: keeps method + body for replay', map && [map.request.method, map.request.body], ['POST', '{"window":"WEEKLY"}']);
  check('learn: drops cookie/authorization headers', map && Object.keys(map.request.headers).sort(), ['content-type', 'x-xai-request-id']);
  check('learn: used path + kind', map && [map.used.path.join('.'), map.used.kind], ['weekly.percentUsed', 'used']);
  check('learn: reset path + kind', map && [map.reset.path.join('.'), map.reset.kind], ['weekly.resetsAt', 'iso']);
  check('learn: array breakdown rule', map && map.breakdown.map((r) => r.type + ':' + (r.arrayPath || r.path).join('.') + ':' + (r.nameKey || '') + ':' + (r.valueKey || '')), ['array:weekly.categories:name:percentUsed']);

  // next week: different numbers, a brand-new slice → read straight from JSON
  const later = {
    weekly: {
      percentUsed: 42,
      resetsAt: '2026-10-29T18:20:00.000Z',
      categories: [
        { name: 'Grok Build', percentUsed: 30 },
        { name: 'Automations', percentUsed: 2 },
        { name: 'Imagine', percentUsed: 10 },
      ],
    },
  };
  const read = readGrokApiMap(map, later);
  check('read: used from map', read && read.used, 42);
  check('read: reset ms from map', read && read.resetAt, Date.parse('2026-10-29T18:20:00.000Z'));
  check('read: every category, including a new one', read && read.breakdown, [{ name: 'Grok Build', percent: 30 }, { name: 'Automations', percent: 2 }, { name: 'Imagine', percent: 10 }]);
  check('read: shape changed → null (falls back to DOM)', readGrokApiMap(map, { weekly: { usage: { pct: 42 } } }), null);
  check('read: out-of-range → null', readGrokApiMap(map, { weekly: { percentUsed: 180 } }), null);
  check('format reset round-trips through the DOM parser', grokParseResetMs(grokFormatReset(resetMs)), resetMs);
}

{
  // remaining-fraction shape with fixed-path slices and an epoch-seconds reset
  const resetMs = Date.parse('October 22, 2026 11:20 AM');
  const parsed = { used: 25, reset: 'October 22, 2026 at 11:20 AM', breakdown: [{ name: 'Chat', percent: 20 }, { name: 'Automations', percent: 5 }] };
  const cand = [{
    url: 'https://grok.com/rest/billing/limits', method: 'GET', status: 200,
    json: { superGrok: { remainingFraction: 0.75, resetUnix: Math.round(resetMs / 1000), chatPct: 20, automationsPct: 5, imaginePct: 0 } },
  }];
  const map = learnGrokApiMap(cand, parsed, 1);
  check('learn: remaining fraction kind', map && [map.used.path.join('.'), map.used.kind], ['superGrok.remainingFraction', 'remainingFraction']);
  check('learn: epoch seconds reset', map && map.reset.kind, 's');
  check('learn: fixed-path slices', map && map.breakdown.map((r) => r.type + ':' + r.name + ':' + r.path.join('.')), ['path:Chat:superGrok.chatPct', 'path:Automations:superGrok.automationsPct']);
  const read = readGrokApiMap(map, { superGrok: { remainingFraction: 0.4, resetUnix: 1800000000, chatPct: 50, automationsPct: 10 } });
  check('read: remaining fraction → used %', read && read.used, 60);
  check('read: epoch seconds → ms', read && read.resetAt, 1800000000000);
}

{
  // a number that merely equals the total, with no usage hint anywhere, is not a map
  const parsed = { used: 10, reset: null, breakdown: [] };
  const cand = [{ url: 'https://grok.com/rest/app-chat/conversations', method: 'GET', status: 200, json: { page: 10, items: [] } }];
  check('learn: coincidental number without hints is rejected', learnGrokApiMap(cand, parsed, 1), null);
  check('learn: nothing to learn from', learnGrokApiMap([], parsed, 1), null);
  const hinted = [{ url: 'https://grok.com/rest/foo', method: 'GET', status: 200, json: { quota: { percentUsed: 10 } } }];
  check('learn: usage-named key alone is enough', (learnGrokApiMap(hinted, parsed, 1) || {}).used, { path: ['quota', 'percentUsed'], kind: 'used' });
  const err = [{ url: 'https://grok.com/rest/subscriptions/usage', method: 'GET', status: 401, json: { error: 'unauthorized', percentUsed: 10 } }];
  check('learn: non-2xx responses are ignored', learnGrokApiMap(err, parsed, 1), null);
}

// --- Failure triage: which layer broke ---
{
  check('triage: empty page', classifyCaptureFailure('grok.com', '  Loading… '), 'blank_page');
  check('triage: login wall', classifyCaptureFailure('grok.com', 'Welcome back. Sign in to continue with Grok. Terms of service and privacy policy apply to everyone here.'), 'login_required');
  check('triage: grok page without the usage dialog', classifyCaptureFailure('grok.com', 'Ask Grok anything. Build Imagine Voice. New chat. History: ten things about my project and more text to pass the size gate.'), 'usage_view_closed');
  check('triage: grok dialog present but unparsed', classifyCaptureFailure('grok.com', 'Weekly SuperGrok Limit. Resets soon. Nothing numeric here but the dialog is open and long enough.'), 'parse_failed');
  check('triage: other site, no percent', classifyCaptureFailure('gemini.google.com', 'Gemini is ready. Start a conversation about anything you like, there is plenty of text.'), 'usage_view_closed');
  check('triage: other site, percent present', classifyCaptureFailure('gemini.google.com', 'Usage limits PRO. Something new 20% consumed. Resets on a date we do not recognise yet.'), 'parse_failed');
  const sample = captureTextSample('Account\njane.doe@example.com\n\n\nWeekly SuperGrok Limit\n10% used\n');
  check('sample: email removed', /\[email\]/.test(sample) && !/example\.com/.test(sample), true);
  check('sample: blank lines squeezed', /\n\n/.test(sample), false);
  check('sample: capped', captureTextSample('x'.repeat(5000)).length <= 702, true);
}

const { parseCursorDashboard } = ctx;
if (typeof parseCursorDashboard !== 'function') {
  console.error('parseCursorDashboard was not loaded from parse.js');
  process.exit(1);
}

{
  const now = Date.parse('2026-09-17T12:00:00Z');
  const usage = {
    billingCycleEnd: String(now + 16 * 86400000),
    planUsage: { autoPercentUsed: 35.2, apiPercentUsed: 100 },
  };
  const plan = { planInfo: { planName: 'Pro+', price: '$60/mo', billingCycleEnd: String(now + 16 * 86400000) } };
  const sand = { usagePercent: 1.2, hasNonZeroIncludedLimit: true, nextResetTimestampUtc: now + 7 * 86400000 };
  const p = parseCursorDashboard(usage, plan, sand, now);
  check('cursor dashboard: models remaining', p && p.cursor && p.cursor.limits[0].percent_left, 65);
  check('cursor dashboard: other models remaining', p && p.cursor && p.cursor.limits[1].percent_left, 0);
  check('cursor dashboard: plan label', p && p.cursor && p.cursor.plan, 'Pro+ $60/mo');
  check('cursor dashboard: reset days', p && p.cursor && p.cursor.limits[0].resets_text, '(16 days)');
  check('cursor dashboard: grok bot remaining', p && p.grokBot && p.grokBot.limits[0].percent_left, 99);
  check('cursor dashboard: grok bot reset', p && p.grokBot && p.grokBot.limits[0].resets_text, '7 days left');
  check('cursor dashboard: grok not missing', p && p.grokMissing, false);
}

{
  const now = Date.parse('2026-09-17T12:00:00Z');
  const summary = {
    billingCycleEnd: '2026-10-03T12:00:00.000Z',
    individualUsage: { plan: { autoPercentUsed: 35, apiPercentUsed: 100 } },
  };
  const p = parseCursorDashboard(summary, { planInfo: { planName: 'Pro+', price: '$60/mo' } }, {
    hasNonZeroIncludedLimit: false,
    usagePercent: 0,
  }, now);
  check('usage-summary shape still parses cursor', p && p.cursor && p.cursor.limits[0].percent_left, 65);
  check('no grok bot allowance is section_missing', p && p.grokMissing, true);
  check('excluded grok bot is not a 100% ring', p && p.grokBot, null);
}

{
  check('empty dashboard json is null', parseCursorDashboard({}, {}, {}, Date.now()), null);
}

const { parseClaudeUsage } = ctx;
if (typeof parseClaudeUsage !== 'function') {
  console.error('parseClaudeUsage was not loaded from parse.js');
  process.exit(1);
}

const CLAUDE_USAGE_2026_09 = `
Your usage Max (5x)
On track. You should reach today's reset with room to spare.
Current session
Resets at 6:30 AM
8% used
This week
Resets at 5:00 PM
84% used
Fable this week
Separate weekly limit for Fable
Resets at 5:00 PM
72% used
Resets
Get extra wiggle room to explore Opus 5.5. Expires Oct 23.
Usage credits
$0
This week's usage by product
Claude Code
98%
`;

{
  const p = parseClaudeUsage(CLAUDE_USAGE_2026_09);
  check('claude 2026-09 weekly used is This week, not Fable or product', p && p.weekly, 84);
  check('claude 2026-09 weekly reset', p && p.weeklyReset, 'at 5:00 PM');
  check('claude 2026-09 session used', p && p.session, 8);
  check('claude 2026-09 session reset', p && p.sessionReset, 'at 6:30 AM');
}

{
  const p = parseClaudeUsage('All models\n30% used\nResets in 2 days\nCurrent session\n10% used\nResets in 1 hr 58 min');
  check('claude legacy All models weekly', p && p.weekly, 30);
  check('claude legacy weekly reset', p && p.weeklyReset, 'in 2 days');
  check('claude legacy session', p && p.session, 10);
  check('claude legacy session reset', p && p.sessionReset, 'in 1 hr 58 min');
}

{
  check('claude chat page is not usage', parseClaudeUsage('How can I help you today?'), null);
}

const { parseCodexUsage } = ctx;
if (typeof parseCodexUsage !== 'function') {
  console.error('parseCodexUsage was not loaded from parse.js');
  process.exit(1);
}

const CODEX_ANALYTICS = `
Codex and Work Analytics
Usage
Weekly usage limit
Codex and ChatGPT share this limit
44% remaining
Resets Sep 26, 2026 at 3:00 AM PT
5-hour usage limit
100% remaining
Resets 8:12 PM
Usage limit resets
Full reset · Use reset
Credits remaining
0
`;

{
  const p = parseCodexUsage(CODEX_ANALYTICS);
  check('codex weekly remaining', p && p.weekly, 44);
  check('codex weekly reset is the dated line, not the 5-hour clock', p && p.weeklyReset, 'Sep 26, 2026 at 3:00 AM PT');
  check('codex 5-hour remaining', p && p.five, 100);
  check('codex 5-hour reset stays time-only', p && p.fiveReset, '8:12 PM');
  check('codex credits', p && p.credits, '0');
}

{
  const weeklyOnly = `
Weekly usage limit
82% remaining
Resets in 5 days
`;
  const p = parseCodexUsage(weeklyOnly);
  check('codex weekly-only remaining', p && p.weekly, 82);
  check('codex weekly-only reset', p && p.weeklyReset, 'in 5 days');
  check('codex weekly-only has no 5-hour row', p && p.five, null);
}

// 2026-10 新版 chatgpt.com/settings/usage?tab=overview（5 小时在前，周在后，"% left"）
const CODEX_OVERVIEW = `
Plan limits
Shared across Codex, Work, Workspace Agents, and ChatGPT for Excel.
5-hour limit
Resets in 5h 0m
100% left
Weekly limit
Resets in 6d 4h
97% left
Credits
Buy credits or turn on automatic reload to continue using Work and Codex when you reach usage limits.
0 credits remaining
Current balance
Automatic reload
Usage limit resets
Available 3
`;

{
  const p = parseCodexUsage(CODEX_OVERVIEW);
  check('codex overview weekly left', p && p.weekly, 97);
  check('codex overview weekly reset', p && p.weeklyReset, 'in 6d 4h');
  check('codex overview 5-hour left', p && p.five, 100);
  check('codex overview 5-hour reset', p && p.fiveReset, 'in 5h 0m');
  check('codex overview credits', p && p.credits, '0');
}

{
  // innerText 可能把重置时间和百分比拼成一行
  const joined = CODEX_OVERVIEW.replace('Resets in 6d 4h\n97% left', 'Resets in 6d 4h 97% left');
  const p = parseCodexUsage(joined);
  check('codex overview joined line weekly', p && p.weekly, 97);
  check('codex overview joined line reset has no percent tail', p && p.weeklyReset, 'in 6d 4h');
}

{
  // Analytics 标签页的 "Weekly limits" 表头不是额度行
  check('codex analytics tab is not usage', parseCodexUsage('Plan usage history\n5-hour limits\nWeekly limits\nPeriod\n% of limit used'), null);
}

{
  check('codex chat page is not usage', parseCodexUsage('What can I help with?'), null);
}

// --- 2026-10-22 after the weekly reset: the big "0%" is a NumberFlow widget in
// Shadow DOM, so innerText has a bare "used" and no category slices. The deep
// (Shadow DOM) copy appended after it does carry the number. ---
{
  const inner = `Settings\nUsage\nWeekly SuperGrok Limit\nused\nResets October 29, 2026 at 11:20 AM\nWeekly Grok Bot Limit\nused\nResets October 28, 2026 at 12:41 AM\nExtra Usage Credits\nAdditional Credits\nBuy Credits\nAuto Top-Up\nSet up`;
  check('reset week, innerText only: no guess', parseGrokUsage(inner), null);
  const deep = `Usage\nWeekly SuperGrok Limit\n0%\nused\nResets October 29, 2026 at 11:20 AM\nWeekly Grok Bot Limit\n2%\nused\nResets October 28, 2026 at 12:41 AM\nExtra Usage Credits\n$0.00\n`;
  const p = parseGrokUsage(inner + '\n' + deep);
  check('reset week, deep copy: used %', p && p.used, 0);
  check('reset week, deep copy: reset', p && p.reset, 'October 29, 2026 at 11:20 AM');
  const noSuper = deep.replace('0%\nused', 'used');
  check('Grok Bot "2% used" is never read as SuperGrok', parseGrokUsage(inner + '\n' + noSuper), null);
}

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log('\nAll parse tests passed.');
