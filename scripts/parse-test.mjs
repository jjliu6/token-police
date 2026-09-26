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

{
  check('codex chat page is not usage', parseCodexUsage('What can I help with?'), null);
}

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log('\nAll parse tests passed.');
