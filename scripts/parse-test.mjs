// Fixture tests for SuperGrok usage parsing (no browser required).

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = { Uint8Array, ArrayBuffer, DataView, TextEncoder, TextDecoder, Date };
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

{
  const v163 = `
Weekly SuperGrok Limit
2% used
Resets September 25, 2026 at 2:20 AM
Chat 2%
Extra Usage Credits
$0.00
Auto Top-Up
`;
  const p = parseGrokUsage(v163);
  check('v1.6.3 screenshot: 2% used', p && p.used, 2);
  check('v1.6.3 screenshot: remaining', p && leftover(p.used), 98);
  check('v1.6.3 screenshot: Chat slice', p && p.breakdown.find((x) => x.name === 'Chat')?.percent, 2);
  check('v1.6.3 screenshot: reset', p && p.reset, 'September 25, 2026 at 2:20 AM');
}

{
  const chatOnly = `
Weekly SuperGrok Limit SuperGrok
Resets September 25, 2026 at 2:20 AM
Chat 2%
Extra Usage Credits
`;
  const p = parseGrokUsage(chatOnly);
  check('single Chat slice is the weekly total after reset', p && p.used, 2);
}

{
  check('usage modal with SuperGrok but no numbers is parse_miss', ctx.grokCaptureReason(`
Weekly SuperGrok Limit
Extra Usage Credits
`), 'parse_miss');
  check('empty grok tab is timeout', ctx.grokCaptureReason(''), 'timeout');
  check('open usage URL with unread text is parse_miss', ctx.grokCaptureReason('', true), 'parse_miss');
  check('login wall is need_signin', ctx.grokCaptureReason('Sign in to continue to Grok'), 'need_signin');
  check('visible SuperGrok is not blamed on login', ctx.grokCaptureReason(`
Weekly SuperGrok Limit
Sign in
Extra Usage Credits
`), 'parse_miss');
}

function encodeVarint(n) {
  const out = [];
  let v = n >>> 0;
  while (v > 0x7f) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
  return Uint8Array.from(out);
}

function concatBytes(...parts) {
  const arrs = parts.map((p) => (p instanceof Uint8Array ? p : Uint8Array.from(p)));
  const out = new Uint8Array(arrs.reduce((s, a) => s + a.length, 0));
  let o = 0;
  arrs.forEach((a) => { out.set(a, o); o += a.length; });
  return out;
}

function encodeKey(field, wire) {
  return encodeVarint((field << 3) | wire);
}

function encodeLen(field, bytes) {
  return concatBytes(encodeKey(field, 2), encodeVarint(bytes.length), bytes);
}

function encodeFixed32(field, floatVal) {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setFloat32(0, floatVal, true);
  return concatBytes(encodeKey(field, 5), new Uint8Array(buf));
}

function encodeTimestamp(seconds) {
  return concatBytes(encodeKey(1, 0), encodeVarint(seconds));
}

function grpcWebFrame(msg) {
  const header = new Uint8Array(5);
  header[0] = 0;
  new DataView(header.buffer).setUint32(1, msg.length, false);
  return concatBytes(header, msg);
}

{
  const end = Date.parse('2026-09-25T09:20:00Z');
  const local = ctx.grokResetText(end);
  const config = concatBytes(
    encodeFixed32(1, 2),
    encodeLen(5, encodeTimestamp(Math.floor(end / 1000))),
  );
  const framed = grpcWebFrame(encodeLen(1, config));
  const p = ctx.parseGrokCreditsConfig(framed);
  check('credits protobuf: 2% used', p && p.used, 2);
  check('credits protobuf: reset text', p && p.reset, local);
}

{
  const json = JSON.stringify({
    config: {
      creditUsagePercent: 2,
      currentPeriod: { end: '2026-09-25T09:20:00.000Z' },
      productUsage: [{ product: 'GrokChat', usagePercent: 2 }],
    },
  });
  const p = ctx.parseGrokCreditsConfig(json);
  check('credits JSON: 2% used', p && p.used, 2);
  check('credits JSON: Chat slice', p && p.breakdown.find((x) => x.name === 'Chat')?.percent, 2);
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

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log('\nAll parse tests passed.');
