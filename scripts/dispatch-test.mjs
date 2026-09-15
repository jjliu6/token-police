// URL builders + auto-pick for multi-dispatch. No browser.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ URL, Number, NumberIsNaN: Number.isNaN });
ctx.Number.isNaN = Number.isNaN;
vm.runInContext(readFileSync(resolve(root, 'agents.js'), 'utf8'), ctx, { filename: 'agents.js' });

const problems = [];
const AGENTS = vm.runInContext('AGENTS', ctx);
const buildDispatch = vm.runInContext('buildDispatch', ctx);
const pickAutoDispatch = vm.runInContext('pickAutoDispatch', ctx);
const pickReadyDispatch = vm.runInContext('pickReadyDispatch', ctx);
const makeDispatchJob = vm.runInContext('makeDispatchJob', ctx);
const leftoverOf = vm.runInContext('leftoverOf', ctx);
const leftoverLabel = vm.runInContext('leftoverLabel', ctx);
const selectedDispatchAgents = vm.runInContext('selectedDispatchAgents', ctx);
const agentsForKind = vm.runInContext('agentsForKind', ctx);

const claude = AGENTS.find((a) => a.id === 'claude-code');
const grok = AGENTS.find((a) => a.id === 'grok-build');
const cursor = AGENTS.find((a) => a.id === 'cursor');
const bot = AGENTS.find((a) => a.id === 'grok-bot');
const gemini = AGENTS.find((a) => a.id === 'gemini');

const c = buildDispatch(claude, 'fix login', 'jjliu6/token-police');
if (!c.url.includes('claude.ai/code')) problems.push('claude dispatch should open /code');
if (!c.url.includes('prompt=fix+login')) problems.push(`claude prompt param missing: ${c.url}`);
if (!c.url.includes('repositories=jjliu6')) problems.push(`claude repo param missing: ${c.url}`);
if (c.fill !== 'query') problems.push('claude should use query fill');

const g = buildDispatch(grok, 'hello world');
if (!g.url.includes('grok.com')) problems.push('grok should open grok.com');
if (/[?&]q=/.test(g.url)) problems.push(`grok must not use q= (auto-submits): ${g.url}`);
if (g.fill !== 'script') problems.push('grok should script-fill so the prompt is not sent');

const cur = buildDispatch(cursor, 'ship it');
if (cur.url !== 'https://cursor.com/agents') problems.push(`cursor url ${cur.url}`);
if (cur.fill !== 'script') problems.push('cursor should script-fill');

const codex = AGENTS.find((a) => a.id === 'codex');
const cx = buildDispatch(codex, 'ship it');
if (cx.url !== 'https://chatgpt.com/codex') problems.push(`codex url ${cx.url}`);
if (/[?&]prompt=/.test(cx.url)) problems.push(`codex must not use undocumented prompt=: ${cx.url}`);
if (cx.fill !== 'script') problems.push('codex should script-fill the cloud composer');

if (agentsForKind('code').some((a) => a.id === 'grok-bot')) {
  problems.push('Grok Bot has no web composer and must not be a dispatch destination');
}
if (selectedDispatchAgents('code', ['grok-bot', 'cursor']).map((a) => a.id).join() !== 'cursor') {
  problems.push('selecting Grok Bot must not dispatch it');
}
if (bot.dispatch !== false) problems.push('Grok Bot should opt out of dispatch');

const map = {
  'claude-code': { limits: [{ percent_left: 62 }] },
  'codex': { limits: [{ percent_left: 78 }] },
  'cursor': { limits: [{ percent_left: 88 }] },
  'grok-bot': { limits: [{ percent_left: 12 }] },
  'grok-build': { limits: [{ percent_left: 34 }] },
  'gemini': { limits: [{ percent_left: 91 }] },
};

const autoCode = pickAutoDispatch('code', map);
if (!autoCode || autoCode.id !== 'cursor') problems.push(`auto code should pick Cursor, got ${autoCode && autoCode.id}`);

const highBot = Object.assign({}, map, { 'grok-bot': { limits: [{ percent_left: 99 }] } });
if (pickAutoDispatch('code', highBot).id === 'grok-bot') {
  problems.push('auto-dispatch must not pick Grok Bot even when its quota is highest');
}
if (pickReadyDispatch('code', highBot).some((a) => a.id === 'grok-bot')) {
  problems.push('ready pool must not include Grok Bot');
}

const ready = pickReadyDispatch('code', map).map((a) => a.id);
if (ready.includes('grok-bot')) problems.push('Grok Bot at 12% must not be in ready pool');
if (!ready.includes('claude-code') || !ready.includes('codex') || !ready.includes('cursor')) {
  problems.push(`ready pool incomplete: ${ready.join(',')}`);
}

if (pickAutoDispatch('code', {}) != null) {
  problems.push('auto-dispatch must not treat missing quota as 100%');
}
if (pickReadyDispatch('chat', {}).length) {
  problems.push('ready pool must skip agents with no leftover data');
}
if (leftoverOf(claude, {}) != null) problems.push('unknown leftover should be null, not 100');
if (leftoverLabel(claude, {}) !== '—') problems.push(`unknown leftover label, got ${leftoverLabel(claude, {})}`);
if (leftoverLabel(cursor, map) !== '88') problems.push(`cursor leftover label, got ${leftoverLabel(cursor, map)}`);

const leaked = selectedDispatchAgents('chat', ['cursor', 'gemini', 'claude-code']).map((a) => a.id);
if (leaked.includes('cursor') || leaked.includes('claude-code')) {
  problems.push(`chat selection must not keep code agents, got ${leaked.join(',')}`);
}
if (!leaked.includes('gemini')) problems.push('chat selection should keep Gemini');

const disabled = pickAutoDispatch('chat', map, { gemini: false });
if (!disabled || disabled.id !== 'grok-build') {
  problems.push(`auto chat with Gemini off should pick Grok, got ${disabled && disabled.id}`);
}
if (agentsForKind('chat', { gemini: false }).some((a) => a.id === 'gemini')) {
  problems.push('disabled Gemini must not appear in chat chips');
}

const job = makeDispatchJob(claude, '  fix login  ', 'jjliu6/token-police', false);
if (job.prompt !== 'fix login') problems.push('job prompt should be trimmed');
if (job.repo !== 'jjliu6/token-police') problems.push('code job should keep repo');
if (makeDispatchJob(grok, 'hi', 'jjliu6/token-police', true).repo) {
  problems.push('chat job should not keep repo');
}
if (bot.kind !== 'code') problems.push('Grok Bot is a coding agent');
if (grok.kind !== 'chat') problems.push('Grok is a chat agent');
const gm = buildDispatch(gemini, 'hi');
if (gm.url !== 'https://gemini.google.com/app') problems.push(`gemini url ${gm.url}`);
if (gm.fill !== 'script') problems.push('gemini should script-fill');

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('ok  dispatch URL builders, auto-pick, and jobs');
