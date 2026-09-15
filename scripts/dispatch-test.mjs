// URL builders + auto-pick for multi-dispatch. No browser.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ URL });
vm.runInContext(readFileSync(resolve(root, 'agents.js'), 'utf8'), ctx, { filename: 'agents.js' });

const problems = [];
const AGENTS = vm.runInContext('AGENTS', ctx);
const buildDispatch = vm.runInContext('buildDispatch', ctx);
const pickAutoDispatch = vm.runInContext('pickAutoDispatch', ctx);
const pickReadyDispatch = vm.runInContext('pickReadyDispatch', ctx);
const makeDispatchJob = vm.runInContext('makeDispatchJob', ctx);
const leftoverOf = vm.runInContext('leftoverOf', ctx);
const putDispatchPending = vm.runInContext('putDispatchPending', ctx);
const takeDispatchPending = vm.runInContext('takeDispatchPending', ctx);

const claude = AGENTS.find((a) => a.id === 'claude-code');
const grok = AGENTS.find((a) => a.id === 'grok-build');
const cursor = AGENTS.find((a) => a.id === 'cursor');
const bot = AGENTS.find((a) => a.id === 'grok-bot');

const c = buildDispatch(claude, 'fix login', 'jjliu6/token-police');
if (!c.url.includes('claude.ai/code')) problems.push('claude dispatch should open /code');
if (!c.url.includes('prompt=fix+login')) problems.push(`claude prompt param missing: ${c.url}`);
if (!c.url.includes('repositories=jjliu6')) problems.push(`claude repo param missing: ${c.url}`);
if (c.fill !== 'query') problems.push('claude should use query fill');

const g = buildDispatch(grok, 'hello world');
if (!g.url.includes('grok.com')) problems.push('grok should open grok.com');
if (!g.url.includes('q=hello')) problems.push(`grok q param missing: ${g.url}`);

const cur = buildDispatch(cursor, 'ship it');
if (cur.url !== 'https://cursor.com/agents') problems.push(`cursor url ${cur.url}`);
if (cur.fill !== 'script') problems.push('cursor should script-fill');

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

const ready = pickReadyDispatch('code', map).map((a) => a.id);
if (ready.includes('grok-bot')) problems.push('Grok Bot at 12% must not be in ready pool');
if (!ready.includes('claude-code') || !ready.includes('codex') || !ready.includes('cursor')) {
  problems.push(`ready pool incomplete: ${ready.join(',')}`);
}

const job = makeDispatchJob(claude, '  fix login  ', 'jjliu6/token-police', false);
if (job.prompt !== 'fix login') problems.push('job prompt should be trimmed');
if (job.repo !== 'jjliu6/token-police') problems.push('code job should keep repo');
if (makeDispatchJob(grok, 'hi', 'jjliu6/token-police', true).repo) {
  problems.push('chat job should not keep repo');
}
if (bot.kind !== 'code') problems.push('Grok Bot is a coding agent');
if (grok.kind !== 'chat') problems.push('Grok is a chat agent');

const mixed = {
  'claude-code': {},
  'codex': { limits: [{ percent_left: 78 }] },
  'cursor': { limits: [{ percent_left: 88 }] },
  'grok-bot': { limits: [{ percent_left: 12 }] },
};
const autoKnown = pickAutoDispatch('code', mixed);
if (!autoKnown || autoKnown.id !== 'cursor') {
  problems.push(`unknown leftover must not beat 88% Cursor, got ${autoKnown && autoKnown.id}`);
}
if (leftoverOf(claude, {}) != null) problems.push('no data should be leftover null, not 100');
const emptyAuto = pickAutoDispatch('code', {});
if (!emptyAuto || emptyAuto.id !== 'claude-code') {
  problems.push(`empty map auto should fall back to first code agent, got ${emptyAuto && emptyAuto.id}`);
}

let pending = putDispatchPending({}, 11, { prompt: 'one', host: 'cursor.com' });
pending = putDispatchPending(pending, 12, { prompt: 'two', host: 'gemini.google.com' });
if (pending['11'].prompt !== 'one' || pending['12'].prompt !== 'two') {
  problems.push('pending must keep both tab ids');
}
const taken = takeDispatchPending(pending, 11);
if (!taken.job || taken.job.prompt !== 'one') problems.push('claim should return tab 11 prompt');
if (taken.map['11']) problems.push('claimed tab must be removed');
if (!taken.map['12'] || taken.map['12'].prompt !== 'two') problems.push('other tab pending must stay');
const again = takeDispatchPending(taken.map, 11);
if (again.job) problems.push('second claim of same tab must be empty');
const closed = takeDispatchPending(taken.map, 12);
if (!closed.job || closed.job.prompt !== 'two') problems.push('tab close should take remaining job');
if (Object.keys(closed.map).length) problems.push('map should be empty after last take');
const legacy = takeDispatchPending({ tabId: 9, prompt: 'old', host: 'cursor.com' }, 9);
if (!legacy.job || legacy.job.prompt !== 'old') problems.push('legacy single-blob pending should still claim');
if (Object.keys(legacy.map).length) problems.push('legacy claim should clear the blob');
const legacyMiss = takeDispatchPending({ tabId: 9, prompt: 'old', host: 'cursor.com' }, 99);
if (legacyMiss.job) problems.push('legacy blob must not fill a different tab');

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('ok  dispatch URL builders, auto-pick, and jobs');
