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
const sessionToMarkdown = vm.runInContext('sessionToMarkdown', ctx);
const CROSSCHECK_COMPOSER_MAX = vm.runInContext('CROSSCHECK_COMPOSER_MAX', ctx);
const dispatchById = vm.runInContext('dispatchById', ctx);
const I18N = vm.runInContext('I18N', ctx);

const def = defaultCrosscheckPrompt();
check(!!def && def.length > 40, 'default prompt should be the spec text');
check(resolveCrosscheckPrompt('') === def, 'empty box falls back to default');
check(resolveCrosscheckPrompt('   ') === def, 'whitespace-only falls back to default');
check(resolveCrosscheckPrompt(null) === def, 'null stored value falls back to default');
check(resolveCrosscheckPrompt('Look for regressions.') === 'Look for regressions.', 'user edit wins');

vm.runInContext('uiLang = "zh"', ctx);
check(defaultCrosscheckPrompt().includes('独立审查') || defaultCrosscheckPrompt().includes('独立'), `zh default should follow uiLang, got ${defaultCrosscheckPrompt().slice(0, 40)}`);
check(resolveCrosscheckPrompt('Look for regressions.') === 'Look for regressions.', 'edited prompt no longer tracks language');
vm.runInContext('uiLang = "en"', ctx);
check(defaultCrosscheckPrompt().includes('Independently review'), 'en default restored with uiLang');

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

const assembled = assembleReviewText(session, '');
check(assembled.includes('Independently review'), 'assembled text starts with default instruction');
check(assembled.includes('Fix login'), 'assembled text includes the transcript');
check(assembled.includes('jjliu6/token-police'), 'assembled text includes the repo');
check(assembled.includes('login-bug.png'), 'attachments survive into the prompt');

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
  'crosscheckPickLabel',
  'crosscheckPickRecommend',
  'crosscheckPickManual',
  'crosscheckRecommendPicked',
  'crosscheckRecommendWhy',
  'crosscheckRecommendEmpty',
];
['en', 'fr', 'zh'].forEach((lang) => {
  pickKeys.forEach((k) => {
    check(typeof I18N[lang][k] === 'string' && I18N[lang][k].length > 0, `${lang}.${k} missing`);
  });
});
check(I18N.en.crosscheckPickRecommend.includes('recommend') || I18N.en.crosscheckPickRecommend.includes('Recommend'), 'EN recommend label');
check(I18N.zh.crosscheckPickRecommend.includes('推荐'), 'ZH recommend label');
check(I18N.zh.crosscheckPickManual.includes('自己'), 'ZH manual label');

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
  cursor: { limits: [{ percent_left: 10 }] },
});
check(fakeGpt && fakeGpt.id === 'cursor', `quotaId-null ChatGPT is skipped even at 99%, got ${fakeGpt && fakeGpt.id}`);

const lowOnly = {
  'cursor': { limits: [{ percent_left: 8 }] },
  'codex': { limits: [{ percent_left: 4 }] },
};
const low = pickCrosscheckReviewer(lowOnly);
check(low && low.id === 'cursor', `no 15% floor — 8% Cursor still wins, got ${low && low.id}`);

const claudeOnly = { 'claude-code': { limits: [{ percent_left: 55 }] } };
const tied = pickCrosscheckReviewer(claudeOnly);
check(tied && tied.id === 'claude-chat', `Claude chat and Claude Code share quota; first in DISPATCH_TARGETS wins, got ${tied && tied.id}`);

const geminiWins = pickCrosscheckReviewer({
  'gemini': { limits: [{ percent_left: 91 }] },
  'cursor': { limits: [{ percent_left: 88 }] },
  'claude-code': { limits: [{ percent_left: 40 }] },
});
check(geminiWins && geminiWins.id === 'gemini', `Gemini 91% beats Cursor 88%, got ${geminiWins && geminiWins.id}`);

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('ok  review prompt assembly, GitHub links, conversation.md fallback');
