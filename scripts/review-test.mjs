// Review prompt assembly, GitHub-link detection, conversation.md fallback.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ URL });
vm.runInContext(readFileSync(resolve(root, 'agents.js'), 'utf8'), ctx, { filename: 'agents.js' });
vm.runInContext(readFileSync(resolve(root, 'i18n.js'), 'utf8'), ctx, { filename: 'i18n.js' });
vm.runInContext(readFileSync(resolve(root, 'review.js'), 'utf8'), ctx, { filename: 'review.js' });

const problems = [];
const check = (cond, msg) => { if (!cond) problems.push(msg); };

const resolveCrosscheckPrompt = vm.runInContext('resolveCrosscheckPrompt', ctx);
const defaultCrosscheckPrompt = vm.runInContext('defaultCrosscheckPrompt', ctx);
const detectGithubContext = vm.runInContext('detectGithubContext', ctx);
const assembleReviewText = vm.runInContext('assembleReviewText', ctx);
const reviewPayload = vm.runInContext('reviewPayload', ctx);
const makeReviewJob = vm.runInContext('makeReviewJob', ctx);
const pickCrosscheckReviewer = vm.runInContext('pickCrosscheckReviewer', ctx);
const firstCrosscheckReviewer = vm.runInContext('firstCrosscheckReviewer', ctx);
const crosscheckReviewerPool = vm.runInContext('crosscheckReviewerPool', ctx);
const isStockCrosscheckPrompt = vm.runInContext('isStockCrosscheckPrompt', ctx);
const crosscheckSourceName = vm.runInContext('crosscheckSourceName', ctx);
const sessionToMarkdown = vm.runInContext('sessionToMarkdown', ctx);
const sessionSummary = vm.runInContext('sessionSummary', ctx);
const CROSSCHECK_COMPOSER_MAX = vm.runInContext('CROSSCHECK_COMPOSER_MAX', ctx);
const dispatchById = vm.runInContext('dispatchById', ctx);
const I18N = vm.runInContext('I18N', ctx);

const defChat = defaultCrosscheckPrompt('chat');
const defCode = defaultCrosscheckPrompt('code');
check(!!defChat && defChat.length > 40, 'default chat prompt should be the spec text');
check(!!defCode && defCode.length > 40, 'default code prompt should be the spec text');
check(!/code changes|test results|\bPR\b/.test(defChat), `chat default must not mention PRs/tests/code changes, got ${defChat}`);
check(/code changes|PR/.test(defCode), 'code default should mention code changes / PR');
check(resolveCrosscheckPrompt('', 'chat') === defChat, 'empty box falls back to chat default');
check(resolveCrosscheckPrompt('   ', 'code') === defCode, 'whitespace-only falls back to code default');
check(resolveCrosscheckPrompt(null, 'chat') === defChat, 'null stored value falls back to default');
check(resolveCrosscheckPrompt('Look for regressions.', 'chat') === 'Look for regressions.', 'user edit wins');
check(typeof isStockCrosscheckPrompt === 'function' && isStockCrosscheckPrompt(defCode), 'stock code default is detected');
check(isStockCrosscheckPrompt(defChat), 'stock chat default is detected');
check(!isStockCrosscheckPrompt('Look for regressions.'), 'custom prompt is not stock');

vm.runInContext('uiLang = "zh"', ctx);
check(defaultCrosscheckPrompt('chat').includes('独立审查') || defaultCrosscheckPrompt('chat').includes('独立'), `zh chat default should follow uiLang, got ${defaultCrosscheckPrompt('chat').slice(0, 40)}`);
check(!defaultCrosscheckPrompt('chat').includes('PR'), 'zh chat default must not mention PR');
check(resolveCrosscheckPrompt('Look for regressions.', 'code') === 'Look for regressions.', 'edited prompt no longer tracks language');
vm.runInContext('uiLang = "en"', ctx);
check(defaultCrosscheckPrompt('chat').includes('Independently review'), 'en chat default restored with uiLang');
check(defaultCrosscheckPrompt('code').includes('code changes'), 'en code default restored with uiLang');

const session = {
  sourceAgent: 'chatgpt',
  sourceKind: 'chat',
  sessionUrl: 'https://chatgpt.com/c/abc',
  conversation: [
    { role: 'user', text: 'Fix login. https://github.com/jjliu6/token-police', attachments: ['login-bug.png'] },
    { role: 'assistant', text: 'Opened a PR.', links: ['https://github.com/jjliu6/token-police/pull/63'] },
  ],
};
const gh = detectGithubContext(session);
check(gh.repository === 'jjliu6/token-police', `repo detect, got ${JSON.stringify(gh)}`);
check(gh.pullRequest === 'https://github.com/jjliu6/token-police/pull/63', `PR detect, got ${JSON.stringify(gh)}`);

const sumEn = sessionSummary(session);
check(sumEn.includes('messages'), `en summary, got ${sumEn}`);
check(sumEn.includes('repo jjliu6/token-police'), `en summary repo, got ${sumEn}`);
check(!/[\u4e00-\u9fff]/.test(sumEn), `en summary must not be Chinese, got ${sumEn}`);
vm.runInContext('uiLang = "zh"', ctx);
const sumZh = sessionSummary(session);
check(sumZh.includes('条消息'), `zh summary, got ${sumZh}`);
check(!sumZh.includes(' messages'), `zh summary must not keep English messages, got ${sumZh}`);
vm.runInContext('uiLang = "fr"', ctx);
const sumFr = sessionSummary(session);
check(sumFr.includes('caractères') || sumFr.includes('messages'), `fr summary, got ${sumFr}`);
vm.runInContext('uiLang = "en"', ctx);

const assembled = assembleReviewText(session, '');
check(assembled.includes('Independently review'), 'assembled text starts with default instruction');
check(assembled.includes('answered the user'), 'chat session uses the chat review instruction');
check(!/code changes|test results/i.test(assembled), 'chat review must not tell the reviewer to check PRs/tests/code');
check(assembled.includes('Fix login'), 'assembled text includes the transcript');
check(assembled.includes('jjliu6/token-police'), 'assembled text includes the repo');
check(assembled.includes('login-bug.png'), 'attachments survive into the prompt');

const codeSession = { sourceAgent: 'codex', sourceKind: 'code', sessionUrl: 'https://chatgpt.com/codex/t/1', conversation: session.conversation };
const assembledCode = assembleReviewText(codeSession, '');
check(/code changes|PR/.test(assembledCode), 'coding session uses the coding review instruction');

const short = reviewPayload(session, '');
check(short.useFile === false, 'short session stays in the composer');
check(!short.attachName, 'no file on a short session');
check(short.prompt.includes('### User'), 'inline prompt includes the conversation');

const longTurns = [];
for (let i = 0; i < 80; i++) {
  longTurns.push({ role: i % 2 ? 'assistant' : 'user', text: ('word '.repeat(80)) + i });
}
const longSession = { sourceAgent: 'chatgpt', sourceKind: 'chat', sessionUrl: 'https://chatgpt.com/c/z', conversation: longTurns };
const long = reviewPayload(longSession, '');
check(long.chars > CROSSCHECK_COMPOSER_MAX, `long session should exceed composer cap (${long.chars})`);
check(long.useFile === true && long.attachName === 'conversation.md', 'long session hands a conversation.md');
check(long.prompt.includes('conversation.md'), 'composer gets a pointer at the file, not the whole dump');
check(long.prompt.length < 2000, `short pointer should be small, got ${long.prompt.length}`);
check(long.attachText.includes('# Cross-check session'), 'markdown file has a header');
check(long.attachText.includes('word '), 'markdown file has the turns');
check(sessionToMarkdown(session).includes('login-bug.png'), 'markdown lists attachments');

const claude = dispatchById('claude-chat');
const job = makeReviewJob(claude, short, session);
check(job.send === false, 'review job defaults to prefill (no auto-send)');
check(job.fill === 'script', 'Claude chat stays script-fill');
check(job.prompt.includes('Independently review'), 'job carries the assembled prompt');
const jobSend = makeReviewJob(claude, short, session, true);
check(jobSend.send === true, 'Chat reviewer may auto-send when the user opts in');
const grok = dispatchById('grok-build');
check(makeReviewJob(grok, short, session, true).send === true, 'Grok chat may auto-send when opted in');
check(makeReviewJob(grok, short, session, false).send === false, 'Grok stays prefill when the toggle is off');

const claudeCode = dispatchById('claude-code');
const tiny = reviewPayload({
  sourceAgent: 'chatgpt',
  sourceKind: 'chat',
  sessionUrl: 'https://chatgpt.com/c/x',
  conversation: [{ role: 'user', text: 'hi' }, { role: 'assistant', text: 'hello' }],
}, 'Review this.');
const qJob = makeReviewJob(claudeCode, tiny, { conversation: [] }, true);
check(qJob.fill === 'query', `short Claude Code review may use ?prompt=, got ${qJob.fill}`);
check(qJob.send === false, 'Claude Code review must not auto-send even when requested');
check(qJob.url.includes('prompt='), 'short query fill keeps the prompt param');

const longJob = makeReviewJob(claudeCode, long, longSession, true);
check(longJob.send === false, 'long Claude Code review never auto-sends');
check(longJob.fill === 'script', 'long Claude Code review cannot use ?prompt=');
check(!/[?&]prompt=/.test(longJob.url), `long review must drop the URL prompt, got ${longJob.url}`);
check(longJob.attachName === 'conversation.md', 'long job carries the markdown attachment');

const codeAgent = dispatchById('codex');
const codeJob = makeReviewJob(codeAgent, short, session, true);
check(codeJob.repo === 'jjliu6/token-police', `code reviewer gets detected repo, got ${codeJob.repo}`);
check(codeJob.send === false, 'Codex review is prefill only even when send is requested');

const pickKeys = [
  'crosscheckPickLabelChat',
  'crosscheckPickLabelCode',
  'crosscheckPromptDefaultChat',
  'crosscheckPromptDefaultCode',
  'crosscheckErrorGeneric',
  'crosscheckUnsupportedGeneric',
  'crosscheckPickRecommend',
  'crosscheckPickManual',
  'crosscheckRecommendPicked',
  'crosscheckRecommendWhy',
  'crosscheckRecommendEmpty',
  'crosscheckSummaryMessages',
  'crosscheckSummaryChars',
  'crosscheckSummaryRepo',
  'crosscheckSummaryPr',
];
['en', 'fr', 'zh'].forEach((lang) => {
  pickKeys.forEach((k) => {
    check(typeof I18N[lang][k] === 'string' && I18N[lang][k].length > 0, `${lang}.${k} missing`);
  });
});
check(I18N.en.crosscheckPickRecommend.includes('recommend') || I18N.en.crosscheckPickRecommend.includes('Recommend'), 'EN recommend label');
check(I18N.zh.crosscheckPickRecommend.includes('推荐'), 'ZH recommend label');
check(I18N.zh.crosscheckPickManual.includes('自己'), 'ZH manual label');
check(!/[\u4e00-\u9fff]/.test(I18N.en.crosscheckErrorGeneric), 'EN error generic must not be Chinese');
check(!/[\u4e00-\u9fff]/.test(I18N.en.crosscheckPromptDefaultChat), 'EN chat prompt must not be Chinese');
check(!/code changes|\bPR\b/.test(I18N.en.crosscheckPromptDefaultChat), 'EN chat prompt must not mention PRs/code changes');
check(/PR|code changes/i.test(I18N.en.crosscheckPromptDefaultCode), 'EN code prompt mentions PRs/code changes');

const quotaMap = {
  'claude-code': { limits: [{ percent_left: 62 }] },
  'codex': { limits: [{ percent_left: 41 }] },
  'cursor': { limits: [{ percent_left: 12 }] },
  'grok-build': { limits: [{ percent_left: 88 }] },
  'gemini': { limits: [{ percent_left: 73 }] },
  'chatgpt': { limits: [{ percent_left: 99 }] },
  'grok-bot': { limits: [{ percent_left: 100 }] },
};
const rec = pickCrosscheckReviewer(quotaMap);
check(rec && rec.id === 'grok-build', `highest leftover should pick Grok chat (88%), got ${rec && rec.id}`);
check(rec.id !== 'chatgpt', 'ChatGPT must not win recommend');
check(pickCrosscheckReviewer({}) == null, 'empty quota map recommends nobody');
check(pickCrosscheckReviewer(null) == null, 'null map recommends nobody');
const fakeGpt = pickCrosscheckReviewer({
  chatgpt: { limits: [{ percent_left: 99 }] },
  gemini: { limits: [{ percent_left: 10 }] },
});
check(fakeGpt && fakeGpt.id === 'gemini', `quotaId-null ChatGPT is skipped even at 99%, got ${fakeGpt && fakeGpt.id}`);

const lowOnly = {
  'cursor': { limits: [{ percent_left: 8 }] },
  'codex': { limits: [{ percent_left: 4 }] },
};
const low = pickCrosscheckReviewer(lowOnly, { kind: 'code' });
check(low && low.id === 'cursor', `no 15% floor — 8% Cursor still wins, got ${low && low.id}`);
check(pickCrosscheckReviewer(lowOnly) == null, 'coding leftover must not leak into a chat recommend');

const claudeOnly = { 'claude-code': { limits: [{ percent_left: 55 }] } };
const tied = pickCrosscheckReviewer(claudeOnly);
check(tied && tied.id === 'claude-chat', `Claude chat and Claude Code share quota; chat kind picks Claude chat, got ${tied && tied.id}`);
const tiedCode = pickCrosscheckReviewer(claudeOnly, { kind: 'code' });
check(tiedCode && tiedCode.id === 'claude-code', `code kind picks Claude Code, got ${tiedCode && tiedCode.id}`);

const geminiWins = pickCrosscheckReviewer({
  'gemini': { limits: [{ percent_left: 91 }] },
  'cursor': { limits: [{ percent_left: 88 }] },
  'claude-code': { limits: [{ percent_left: 40 }] },
});
check(geminiWins && geminiWins.id === 'gemini', `Gemini 91% beats Cursor 88% on chat, got ${geminiWins && geminiWins.id}`);

const codeRec = pickCrosscheckReviewer(quotaMap, { kind: 'code' });
check(codeRec && codeRec.id === 'grok-build-code', `code recommend should pick Grok Build (88%), got ${codeRec && codeRec.id}`);

const skipGrok = pickCrosscheckReviewer(quotaMap, { kind: 'chat', skipId: 'grok-build' });
check(skipGrok && skipGrok.id === 'gemini', `skip source Grok → Gemini, got ${skipGrok && skipGrok.id}`);

const chatPool = crosscheckReviewerPool('chat', 'chatgpt');
check(chatPool.every((a) => a.kind === 'chat'), 'chat pool is chat-only');
check(!chatPool.some((a) => a.id === 'chatgpt'), 'chat pool skips the ChatGPT source');
check(chatPool.some((a) => a.id === 'claude-chat'), 'chat pool includes Claude chat');
check(!chatPool.some((a) => a.id === 'claude-code' || a.id === 'codex' || a.id === 'cursor' || a.id === 'grok-build-code'), 'chat pool must not mix coding reviewers');

const codePool = crosscheckReviewerPool('code', 'codex');
check(codePool.every((a) => a.kind === 'code'), 'code pool is code-only');
check(!codePool.some((a) => a.id === 'codex'), 'code pool skips the Codex source');
check(!codePool.some((a) => a.id === 'claude-chat' || a.id === 'chatgpt' || a.id === 'gemini' || a.id === 'grok-build'), 'code pool must not mix chat reviewers');
check(codePool.some((a) => a.id === 'claude-code') && codePool.some((a) => a.id === 'cursor') && codePool.some((a) => a.id === 'grok-build-code'), 'code pool includes Claude Code / Cursor / Grok Build');

check(firstCrosscheckReviewer('chat', 'chatgpt') && firstCrosscheckReviewer('chat', 'chatgpt').id === 'claude-chat', 'first chat reviewer is Claude');
check(crosscheckSourceName({ sourceAgent: 'chatgpt' }) === 'ChatGPT', 'source name ChatGPT');
check(crosscheckSourceName({ sourceAgent: 'claude-code' }) === 'Claude Code', 'source name Claude Code');
check(crosscheckSourceName({}) === '', 'unknown source has no name');

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('ok  review prompt assembly, GitHub links, conversation.md fallback');
