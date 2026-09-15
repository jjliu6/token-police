// Unit-tests the auto-send picking/guarding logic in content.js without a
// browser: load content.js on a fake dispatch surface, then drive
// isSendLabel / findSendButton / composerHasPrompt with hand-rolled DOM mocks.
// These cover the two auto-send P0s a review flagged: clicking the wrong button
// (Resend / Send feedback / type=submit noise) and refusing to submit a
// composer that no longer holds the prompt.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const parseSrc = readFileSync(resolve(root, 'parse.js'), 'utf8');
const contentSrc = readFileSync(resolve(root, 'content.js'), 'utf8');

const problems = [];
const check = (cond, msg) => { if (!cond) problems.push(msg); };

// A dispatch surface (chatgpt.com/codex) so content.js defines the fill/submit
// helpers and skips the usage-scraping observer path. document is a stub — the
// tests pass their own mock elements into the functions under test.
const ctxObj = {
  Date,
  setTimeout: () => 0,
  clearTimeout: () => {},
  setInterval: () => 0,
  clearInterval: () => {},
  document: { querySelectorAll: () => [], body: { querySelectorAll: () => [] } },
  location: { hostname: 'chatgpt.com', pathname: '/codex', search: '', hash: '', href: 'https://chatgpt.com/codex' },
  chrome: { runtime: { onMessage: { addListener: () => {} }, sendMessage: () => {}, lastError: null } },
};
const ctx = vm.createContext(ctxObj);
vm.runInContext(parseSrc, ctx, { filename: 'parse.js' });
vm.runInContext(contentSrc, ctx, { filename: 'content.js' });

const isSendLabel = vm.runInContext('isSendLabel', ctx);
const findSendButton = vm.runInContext('findSendButton', ctx);
const composerHasPrompt = vm.runInContext('composerHasPrompt', ctx);

// --- isSendLabel: the wrong-button filter ---
// Grok's send key is "Submit" / "提交", so those must be accepted too.
['Send', 'Send message', 'Send prompt', '发送', '发送消息', 'SEND', 'Submit', '提交'].forEach((s) => {
  check(isSendLabel(s), `isSendLabel should accept "${s}"`);
});
['Resend', 'Resubmit', 'Send feedback', 'Submit feedback', 'Send to phone', 'Sender', 'Report a problem', 'Share', 'Schedule for later', '', 'Regenerate'].forEach((s) => {
  check(!isSendLabel(s), `isSendLabel should reject "${s}"`);
});

// --- findSendButton: tiering, aria-disabled, and false-positive skipping ---
function btn({ testid = '', aria = '', title = '', text = '', type = '', disabled = false, ariaDisabled = false, w = 100, h = 40 } = {}) {
  const attrs = { 'data-testid': testid, 'aria-label': aria, title, type };
  if (ariaDisabled) attrs['aria-disabled'] = 'true';
  return {
    tagName: 'BUTTON',
    disabled,
    textContent: text,
    getAttribute: (n) => (n in attrs ? attrs[n] : null),
    getBoundingClientRect: () => ({ width: w, height: h }),
  };
}
// A composer whose only ancestor is a form holding the given labelled/submit sets.
function composerWith(labelled, submits) {
  const form = {
    querySelectorAll: (sel) => (sel === 'button[type="submit"]' ? submits : labelled),
  };
  return { closest: () => form, parentElement: null, isContentEditable: true, textContent: '' };
}

// Real send button wins over a decoy "Send feedback" in the same form.
const sendBtn = btn({ aria: 'Send message' });
const feedback = btn({ aria: 'Send feedback' });
check(findSendButton(composerWith([feedback, sendBtn], [])) === sendBtn, 'must pick the real Send button, not "Send feedback"');

// aria-disabled send button is not clickable → return null so the caller waits
// (instead of a synthetic Enter most composers ignore, or a false success).
const disabledSend = btn({ aria: 'Send', ariaDisabled: true });
check(findSendButton(composerWith([disabledSend], [])) === null, 'aria-disabled Send must not be returned');

// Invisible send button (0×0) is skipped too.
const hiddenSend = btn({ aria: 'Send', w: 0, h: 0 });
check(findSendButton(composerWith([hiddenSend], [])) === null, 'invisible Send must not be returned');

// No labelled button, but the composer form has a submit → tier 2 trusts it.
const submit = btn({ type: 'submit', text: '' });
check(findSendButton(composerWith([], [submit])) === submit, 'form submit should be used when nothing is labelled');

// A bare "Resend" labelled button is never picked, even with nothing else.
const resend = btn({ aria: 'Resend' });
check(findSendButton(composerWith([resend], [])) === null, 'Resend must never be treated as the send button');

// --- composerHasPrompt: the stale-draft / cleared-box guard ---
check(composerHasPrompt({ isContentEditable: true, textContent: 'hello world' }, 'hello world'), 'contenteditable holding the prompt is a match');
check(!composerHasPrompt({ isContentEditable: true, textContent: '' }, 'hello world'), 'emptied contenteditable is not a match');
check(composerHasPrompt({ value: 'do the thing now' }, 'do the thing'), 'textarea value containing the prompt is a match');
check(!composerHasPrompt({ value: 'something else' }, 'hello world'), 'unrelated value is not a match');
check(!composerHasPrompt({ isContentEditable: true, textContent: 'anything' }, ''), 'empty prompt is never a match');

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('ok  Auto-send picks the real Send button, skips decoys/disabled, and guards stale composers');
