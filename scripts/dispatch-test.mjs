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
const DISPATCH_TARGETS = vm.runInContext('DISPATCH_TARGETS', ctx);
const dispatchById = vm.runInContext('dispatchById', ctx);
const agentsForKind = vm.runInContext('agentsForKind', ctx);
const selectedForKind = vm.runInContext('selectedForKind', ctx);
const canDispatch = vm.runInContext('canDispatch', ctx);
const putDispatchPending = vm.runInContext('putDispatchPending', ctx);
const takeDispatchPending = vm.runInContext('takeDispatchPending', ctx);
const mergeDispatchJobs = vm.runInContext('mergeDispatchJobs', ctx);

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
if (g.url !== 'https://grok.com/') problems.push(`grok should open bare grok.com, got ${g.url}`);
if (/[?&]q=/.test(g.url)) problems.push('grok must not use ?q= (that auto-sends)');
if (g.fill !== 'script') problems.push('grok should script-fill so the prompt is not sent');

const cur = buildDispatch(cursor, 'ship it');
if (cur.url !== 'https://cursor.com/agents') problems.push(`cursor url ${cur.url}`);
if (cur.fill !== 'script') problems.push('cursor should script-fill');

const cx = buildDispatch(AGENTS.find((a) => a.id === 'codex'), 'fix tests');
if (cx.url !== 'https://chatgpt.com/codex') problems.push(`codex should open Cloud UI, got ${cx.url}`);
if (/[?&]prompt=/.test(cx.url)) problems.push('codex must not use ?prompt= (that is chat / desktop, not Cloud)');
if (cx.fill !== 'script') problems.push('codex should script-fill');
if (buildDispatch(bot, 'nope').url.includes('cursor.com/agents')) {
  problems.push('Grok Bot must not open Cursor Agents');
}

const chatClaude = dispatchById('claude-chat');
const gpt = dispatchById('chatgpt');
const claudeChat = buildDispatch(chatClaude, 'hello');
if (claudeChat.url !== 'https://claude.ai/new') problems.push(`Claude chat should open /new, got ${claudeChat.url}`);
if (/[?&]q=/.test(claudeChat.url)) problems.push('Claude chat must not use ?q= (can auto-send)');
if (claudeChat.fill !== 'script') problems.push('Claude chat should script-fill');
const gptUrl = buildDispatch(gpt, 'hello');
if (gptUrl.url !== 'https://chatgpt.com/') problems.push(`ChatGPT should open chatgpt.com/, got ${gptUrl.url}`);
if (/[?&]q=/.test(gptUrl.url) || /[?&]prompt=/.test(gptUrl.url)) problems.push('ChatGPT must not auto-send via query');
if (agentsForKind('chat').some((a) => a.id === 'claude-code')) problems.push('Claude Code must not appear in Chat');
if (agentsForKind('code').some((a) => a.id === 'chatgpt' || a.id === 'claude-chat')) {
  problems.push('ChatGPT / Claude chat must not appear in Code');
}
if (!agentsForKind('chat').some((a) => a.id === 'claude-chat') || !agentsForKind('chat').some((a) => a.id === 'chatgpt')) {
  problems.push('Chat tab needs Claude + ChatGPT');
}
if (!agentsForKind('code').some((a) => a.id === 'claude-code') || !agentsForKind('code').some((a) => a.id === 'codex')) {
  problems.push('Code tab needs Claude Code + Codex');
}
if (leftoverOf(chatClaude, { 'claude-code': { limits: [{ percent_left: 62 }] } }) !== 62) {
  problems.push('Claude chat leftover should reuse Claude Code quota');
}

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
if (emptyAuto) problems.push(`empty map auto must not pick anyone, got ${emptyAuto && emptyAuto.id}`);
if (pickReadyDispatch('code', {}).length) problems.push('empty map ready pool must be empty');
const crossed = selectedForKind(['cursor', 'grok-build', 'gemini'], 'chat');
if (crossed.join() !== 'grok-build,gemini') problems.push(`kind filter should drop Cursor, got ${crossed.join()}`);
if (selectedForKind(['cursor'], 'chat').length) problems.push('Cursor must not dispatch after switching to Chat');
if (canDispatch(bot)) problems.push('Grok Bot has no public composer and must not dispatch');
const fatBot = { 'grok-bot': { limits: [{ percent_left: 90 }] }, 'cursor': { limits: [{ percent_left: 40 }] } };
if (pickReadyDispatch('code', fatBot).some((a) => a.id === 'grok-bot')) {
  problems.push('Grok Bot must stay out of Auto / Select ready even at 90%');
}
if (selectedForKind(['cursor', 'grok-bot'], 'code').join() !== 'cursor') {
  problems.push('stored Grok Bot selection must be dropped');
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

// Auto-send flag: only chat script-fill surfaces carry it (coding composers are
// gated off for now), and it must survive the pending round-trip so the content
// script knows whether to submit.
const sendJob = makeDispatchJob(grok, 'go', '', false, true);
if (sendJob.send !== true) problems.push('chat script-fill job must keep send=true');
const noSendJob = makeDispatchJob(claude, 'go', 'a/b', false, true);
if (noSendJob.send !== false) problems.push('query-fill job must never auto-send');
const offJob = makeDispatchJob(grok, 'go', '', false, false);
if (offJob.send !== false) problems.push('send must default off when not requested');
// Conservative gate: coding targets never auto-send yet, even with send=true.
if (makeDispatchJob(dispatchById('codex'), 'go', '', false, true).send !== false) {
  problems.push('Codex (coding) must not auto-send even when requested');
}
if (makeDispatchJob(dispatchById('cursor'), 'go', '', false, true).send !== false) {
  problems.push('Cursor (coding) must not auto-send even when requested');
}
let sp = putDispatchPending({}, 21, { prompt: 'go', host: 'grok.com', send: true });
if (sp['21'].send !== true) problems.push('pending must carry send flag');
const st = takeDispatchPending(sp, 21);
if (!st.job || st.job.send !== true) problems.push('claim must return the send flag');
const spOff = putDispatchPending({}, 22, { prompt: 'go', host: 'grok.com' });
if (spOff['22'].send !== false) problems.push('pending send must default false');

// Grok Build: a coding target that opens grok.com and carries mode:'build' so
// the content script flips the composer's mode selector before it sends.
const gbc = dispatchById('grok-build-code');
if (!gbc) problems.push('Grok Build must be a dispatch target');
if (gbc && gbc.kind !== 'code') problems.push('Grok Build must be a coding target');
if (gbc && gbc.name !== 'Grok Build') problems.push('Grok Build target must be labelled "Grok Build"');
if (!agentsForKind('code').some((a) => a.id === 'grok-build-code')) problems.push('Code tab must list Grok Build');
if (dispatchById('grok-bot')) problems.push('Grok Bot must not be a dispatch target');
if (agentsForKind('code').some((a) => a.id === 'grok-bot')) problems.push('Grok Bot must be gone from the Code tab');
const gbcBuilt = buildDispatch(gbc, 'make a snake game');
if (gbcBuilt.url !== 'https://grok.com/') problems.push(`Grok Build should open grok.com, got ${gbcBuilt.url}`);
if (gbcBuilt.mode !== 'build') problems.push('Grok Build must carry mode:build');
if (gbcBuilt.fill !== 'script') problems.push('Grok Build should script-fill');
if (leftoverOf(gbc, { 'grok-build': { limits: [{ percent_left: 44 }] } }) !== 44) {
  problems.push('Grok Build leftover should reuse the SuperGrok (grok-build) quota');
}
const gbcJob = makeDispatchJob(gbc, 'go', '', false, true);
if (gbcJob.mode !== 'build') problems.push('Grok Build job must keep mode:build');
// Grok Build is a coding target, so auto-send is gated off for now (prefill
// only) even though the user asked for send — its Build-mode submit isn't
// reliable enough to burn quota on yet.
if (gbcJob.send !== false) problems.push('Grok Build (coding) must not auto-send yet');
let mp = putDispatchPending({}, 31, { prompt: 'go', host: 'grok.com', send: true, mode: 'build' });
if (mp['31'].mode !== 'build') problems.push('pending must carry the mode flag');
const mt = takeDispatchPending(mp, 31);
if (!mt.job || mt.job.mode !== 'build') problems.push('claim must return the mode flag');
if (makeDispatchJob(grok, 'go', '', false, true).mode !== null) problems.push('chat Grok must not carry a mode');

// Accumulating the board across dispatches: newest batch first, earlier
// still-open tabs kept, and a re-dispatched tab deduped (moved to the front).
const prior = [{ tabId: 1, name: 'A' }, { tabId: 2, name: 'B' }];
const merged = mergeDispatchJobs(prior, [{ tabId: 3, name: 'C' }]);
if (merged.map((j) => j.tabId).join() !== '3,1,2') problems.push(`merge order wrong: ${merged.map((j) => j.tabId).join()}`);
const readd = mergeDispatchJobs(prior, [{ tabId: 2, name: 'B2' }]);
if (readd.map((j) => j.tabId).join() !== '2,1') problems.push(`re-dispatched tab must dedupe to front: ${readd.map((j) => j.tabId).join()}`);
if (readd[0].name !== 'B2') problems.push('re-dispatched tab must take the fresh job');
if (mergeDispatchJobs(undefined, undefined).length) problems.push('merge of nothing must be empty');
if (mergeDispatchJobs([{ tabId: 5 }], []).map((j) => j.tabId).join() !== '5') problems.push('empty batch must keep prior tabs');

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('ok  dispatch URL builders, auto-pick, and jobs');
