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

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('ok  dispatch URL builders, auto-pick, and jobs');
