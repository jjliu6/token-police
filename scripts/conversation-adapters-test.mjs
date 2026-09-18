// ChatGPT transcript extractor — the Cross-check hard part. Fixture DOM is
// shaped like the live chatgpt.com conversation markup (data-message-author-role
// + conversation-turn articles). No browser.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({
  setTimeout,
  URL,
  location: { hostname: 'chatgpt.com', pathname: '/c/abc', href: 'https://chatgpt.com/c/abc' },
  document: { querySelectorAll: () => [] },
  window: {},
});
vm.runInContext(readFileSync(resolve(root, 'conversation-adapters.js'), 'utf8'), ctx, {
  filename: 'conversation-adapters.js',
});

const problems = [];
const check = (cond, msg) => { if (!cond) problems.push(msg); };

const detectCrosscheckSource = vm.runInContext('detectCrosscheckSource', ctx);
const extractChatGptMessages = vm.runInContext('extractChatGptMessages', ctx);
const extractClaudeMessages = vm.runInContext('extractClaudeMessages', ctx);
const extractGrokMessages = vm.runInContext('extractGrokMessages', ctx);
const extractGeminiMessages = vm.runInContext('extractGeminiMessages', ctx);
const extractConversation = vm.runInContext('extractConversation', ctx);
const isChatGptChat = vm.runInContext('isChatGptChat', ctx);

check(isChatGptChat({ hostname: 'chatgpt.com', pathname: '/c/xyz' }), 'chatgpt.com/c/… is a chat source');
check(!isChatGptChat({ hostname: 'chatgpt.com', pathname: '/codex' }), 'Codex must not use the ChatGPT chat extractor');
check(!isChatGptChat({ hostname: 'claude.ai', pathname: '/chat/1' }), 'Claude is not ChatGPT');

const gpt = detectCrosscheckSource({ hostname: 'chatgpt.com', pathname: '/c/abc', href: 'https://chatgpt.com/c/abc' });
check(gpt.supported === true && gpt.sourceAgent === 'chatgpt' && gpt.sourceKind === 'chat', `ChatGPT chat should be supported, got ${JSON.stringify(gpt)}`);

const codex = detectCrosscheckSource({ hostname: 'chatgpt.com', pathname: '/codex', href: 'https://chatgpt.com/codex' });
check(codex.supported === true && codex.sourceAgent === 'codex' && codex.sourceKind === 'code', `Codex conversation should be supported, got ${JSON.stringify(codex)}`);

const codexUsage = detectCrosscheckSource({ hostname: 'chatgpt.com', pathname: '/codex/cloud/settings/analytics', href: 'https://chatgpt.com/codex/cloud/settings/analytics#usage' });
check(codexUsage.supported === false && codexUsage.sourceAgent === 'codex', `Codex usage page is named but unsupported, got ${JSON.stringify(codexUsage)}`);

const claude = detectCrosscheckSource({ hostname: 'claude.ai', pathname: '/chat/x', href: 'https://claude.ai/chat/x' });
check(claude.supported === true && claude.sourceAgent === 'claude-chat' && claude.sourceKind === 'chat', `Claude chat should be supported, got ${JSON.stringify(claude)}`);

const claudeCode = detectCrosscheckSource({ hostname: 'claude.ai', pathname: '/code', href: 'https://claude.ai/code' });
check(claudeCode.supported === true && claudeCode.sourceAgent === 'claude-code' && claudeCode.sourceKind === 'code', `Claude Code should be supported, got ${JSON.stringify(claudeCode)}`);

const claudeUsage = detectCrosscheckSource({ hostname: 'claude.ai', pathname: '/new', href: 'https://claude.ai/new#settings/usage', hash: '#settings/usage' });
check(claudeUsage.supported === false && claudeUsage.sourceAgent === 'claude-chat', `Claude usage is named unsupported, got ${JSON.stringify(claudeUsage)}`);

const grok = detectCrosscheckSource({ hostname: 'grok.com', pathname: '/', href: 'https://grok.com/' });
check(grok.supported === true && grok.sourceAgent === 'grok-build' && grok.sourceKind === 'chat', `Grok chat should be supported, got ${JSON.stringify(grok)}`);

const cursor = detectCrosscheckSource({ hostname: 'cursor.com', pathname: '/agents', href: 'https://cursor.com/agents' });
check(cursor.supported === true && cursor.sourceKind === 'code', `Cursor Agents should be supported, got ${JSON.stringify(cursor)}`);

const cursorSpend = detectCrosscheckSource({ hostname: 'cursor.com', pathname: '/dashboard/spending', href: 'https://cursor.com/dashboard/spending' });
check(cursorSpend.supported === false && cursorSpend.sourceAgent === 'cursor', `Cursor spending is named unsupported, got ${JSON.stringify(cursorSpend)}`);

const gemini = detectCrosscheckSource({ hostname: 'gemini.google.com', pathname: '/app', href: 'https://gemini.google.com/app' });
check(gemini.supported === true && gemini.sourceKind === 'chat', `Gemini should be supported, got ${JSON.stringify(gemini)}`);

const other = detectCrosscheckSource({ hostname: 'example.com', pathname: '/', href: 'https://example.com/' });
check(other.supported === false && other.sourceAgent == null, `unknown host is unsupported, got ${JSON.stringify(other)}`);

// --- tiny DOM ---
function node(tag, attrs, kids) {
  const children = (kids || []).map((c) => (typeof c === 'string' ? { textContent: c, innerText: c, nodeType: 3 } : c));
  const n = {
    tagName: String(tag).toUpperCase(),
    attrs: attrs || {},
    children,
    parentElement: null,
    parentNode: null,
    id: (attrs && attrs.id) || '',
    className: (attrs && (attrs.class || attrs.className)) || '',
    href: (attrs && attrs.href) || '',
    getAttribute(k) { return this.attrs[k] != null ? this.attrs[k] : null; },
    closest(sel) {
      const want = String(sel).split(',').map((s) => s.trim());
      let cur = this;
      while (cur) {
        for (const w of want) {
          if (w.startsWith('#') && cur.id === w.slice(1)) return cur;
          if (w.startsWith('[id=') && cur.id === w.replace(/^[^\"]*\"|[\"\]]/g, '')) return cur;
          if (w.includes('data-testid="composer"') && cur.getAttribute('data-testid') === 'composer') return cur;
          if (w.toLowerCase() === 'form' && cur.tagName === 'FORM') return cur;
        }
        cur = cur.parentElement;
      }
      return null;
    },
  };
  n.textContent = children.map((c) => c.textContent || '').join('');
  n.innerText = n.textContent;
  children.forEach((c) => {
    if (c && c.tagName) {
      c.parentElement = n;
      c.parentNode = n;
    }
  });
  n.querySelectorAll = (sel) => queryAll(n, sel);
  n.querySelector = (sel) => queryAll(n, sel)[0] || null;
  return n;
}

function allElements(root, acc) {
  if (!root || !root.tagName) return acc;
  acc.push(root);
  (root.children || []).forEach((c) => allElements(c, acc));
  return acc;
}

function match(el, sel) {
  const s = sel.trim();
  if (/^[a-z][\w-]*$/i.test(s)) return el.tagName === s.toUpperCase();
  if (s[0] === '.' && s.indexOf('[') < 0) {
    const cls = s.slice(1);
    return new RegExp('(^|\\s)' + cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)').test(el.className || '');
  }
  let m = s.match(/^\[class\*=["']?([^"'\]]+)["']?\]$/);
  if (m) return String(el.className || '').indexOf(m[1]) >= 0;
  m = s.match(/^\[data-testid=["']([^"']+)["']\]$/);
  if (m) return el.getAttribute('data-testid') === m[1];
  m = s.match(/^\[data-testid\^=["']([^"']+)["']\]$/);
  if (m) return String(el.getAttribute('data-testid') || '').indexOf(m[1]) === 0;
  m = s.match(/^\[data-message-author-role=["']([^"']+)["']\]$/);
  if (m) return el.getAttribute('data-message-author-role') === m[1];
  m = s.match(/^\[data-message-role=["']([^"']+)["']\]$/);
  if (m) return el.getAttribute('data-message-role') === m[1];
  m = s.match(/^\[data-role=["']([^"']+)["']\]$/);
  if (m) return el.getAttribute('data-role') === m[1];
  if (s === 'a[href]') return el.tagName === 'A' && !!el.getAttribute('href');
  if (s === 'img[alt]') return el.tagName === 'IMG' && el.getAttribute('alt') != null;
  if (s === 'a[download]') return el.tagName === 'A' && el.getAttribute('download') != null;
  if (s === '[data-message-author-role]') return el.getAttribute('data-message-author-role') != null;
  if (s === 'article[data-testid^="conversation-turn-"]') {
    const v = el.getAttribute('data-testid') || '';
    return el.tagName === 'ARTICLE' && v.indexOf('conversation-turn-') === 0;
  }
  if (s === 'article[data-turn]') return el.tagName === 'ARTICLE' && el.getAttribute('data-turn') != null;
  if (s === '[data-testid*="file" i]' || s === '[data-testid*="file" i i]') {
    return /file/i.test(el.getAttribute('data-testid') || '');
  }
  return false;
}

function queryAll(root, selector) {
  const parts = String(selector).split(',').map((s) => s.trim()).filter(Boolean);
  const acc = [];
  allElements(root, []).forEach((el) => {
    if (el === root && root.tagName === '#DOCUMENT') return;
    if (parts.some((p) => match(el, p))) acc.push(el);
  });
  return acc;
}

function docWith(children) {
  const body = node('body', {}, children);
  const d = {
    tagName: '#DOCUMENT',
    body,
    documentElement: body,
    children: [body],
    querySelectorAll: (sel) => queryAll(body, sel),
    querySelector: (sel) => queryAll(body, sel)[0] || null,
  };
  body.parentElement = d;
  return d;
}

const userBody = node('div', { class: 'whitespace-pre-wrap' }, [
  'Fix the login redirect. Repo is https://github.com/jjliu6/token-police — see also the screenshot.',
]);
const fileChip = node('div', { 'data-testid': 'file-thumbnail', class: 'attachment' }, ['login-bug.png']);
const user = node('article', { 'data-testid': 'conversation-turn-1', 'data-turn': 'user' }, [
  node('h6', { class: 'sr-only' }, ['You said:']),
  node('div', { 'data-message-author-role': 'user', 'data-message-id': 'u1' }, [fileChip, userBody]),
]);

const pr = node('a', { href: 'https://github.com/jjliu6/token-police/pull/63' }, ['PR 63']);
const md = node('div', { class: 'markdown prose w-full break-words' }, [
  node('p', {}, ['Opened ', pr, ' and added a test. Copy']),
]);
const copyBtn = node('button', { 'data-testid': 'copy-turn-action' }, ['Copy']);
const assistant = node('article', { 'data-testid': 'conversation-turn-2', 'data-turn': 'assistant' }, [
  node('h6', { class: 'sr-only' }, ['ChatGPT said:']),
  node('div', { 'data-message-author-role': 'assistant', 'data-message-id': 'a1' }, [md, copyBtn]),
]);

const composer = node('form', { 'data-testid': 'composer' }, [
  node('div', { id: 'prompt-textarea', 'data-message-author-role': 'user' }, ['draft still in the box']),
]);

const page = docWith([user, assistant, composer]);
const msgs = extractChatGptMessages(page);
check(msgs.length === 2, `expected 2 turns, got ${JSON.stringify(msgs)}`);
check(msgs[0] && msgs[0].role === 'user', `first role user, got ${msgs[0] && msgs[0].role}`);
check(msgs[0] && msgs[0].text.includes('Fix the login redirect'), `user text missing: ${msgs[0] && msgs[0].text}`);
check(msgs[0] && !(msgs[0].text || '').includes('You said:'), 'must not include the sr-only "You said" chrome');
check(msgs[0] && Array.isArray(msgs[0].attachments) && msgs[0].attachments.includes('login-bug.png'), `attachment name missing: ${JSON.stringify(msgs[0])}`);
check(msgs[1] && msgs[1].role === 'assistant', 'second role assistant');
check(msgs[1] && msgs[1].text.includes('Opened') && msgs[1].text.includes('PR 63'), `assistant body missing: ${msgs[1] && msgs[1].text}`);
check(msgs[1] && msgs[1].links && msgs[1].links.some((h) => h.includes('github.com/jjliu6/token-police/pull/63')), `PR link missing: ${JSON.stringify(msgs[1])}`);
check(msgs.every((m) => m.text !== 'draft still in the box'), 'composer draft must not be a turn');

const emptyPage = docWith([composer]);
check(extractChatGptMessages(emptyPage).length === 0, 'new chat (composer only) is empty, not a fake session');

const session = await extractConversation(null, {
  location: { hostname: 'chatgpt.com', pathname: '/c/abc', href: 'https://chatgpt.com/c/abc' },
  document: page,
  skipScroll: true,
});
check(session.ok === true, `live extract should succeed, got ${JSON.stringify(session)}`);
check(session.conversation.length === 2, 'session must carry both turns');
check(session.sourceAgent === 'chatgpt' && session.sourceKind === 'chat', 'session identity');
check(session.sessionUrl === 'https://chatgpt.com/c/abc', 'sessionUrl from the tab');

const unsupported = await extractConversation(null, {
  location: { hostname: 'example.com', pathname: '/', href: 'https://example.com/' },
  document: page,
  skipScroll: true,
});
check(unsupported.ok === false && unsupported.reason === 'unsupported', `unknown host must fail closed, got ${JSON.stringify(unsupported)}`);

const claudePage = docWith([
  node('div', { 'data-testid': 'user-message' }, ['Please explain the login bug.']),
  node('div', { class: 'font-claude-response' }, ['The redirect drops the next param.']),
]);
const claudeMsgs = extractClaudeMessages(claudePage);
check(claudeMsgs.length === 2 && claudeMsgs[0].role === 'user' && claudeMsgs[1].role === 'assistant', `Claude turns, got ${JSON.stringify(claudeMsgs)}`);
const claudeSession = await extractConversation(null, {
  location: { hostname: 'claude.ai', pathname: '/chat/1', href: 'https://claude.ai/chat/1' },
  document: claudePage,
  skipScroll: true,
});
check(claudeSession.ok === true && claudeSession.sourceKind === 'chat', `Claude extract should succeed, got ${JSON.stringify(claudeSession)}`);

const grokPage = docWith([
  node('div', { 'data-testid': 'user-message' }, ['What is leftover quota?']),
  node('div', { 'data-testid': 'grok-response' }, ['Percent remaining on the card.']),
]);
const grokMsgs = extractGrokMessages(grokPage);
check(grokMsgs.length === 2 && grokMsgs[1].text.includes('Percent remaining'), `Grok turns, got ${JSON.stringify(grokMsgs)}`);

const geminiPage = docWith([
  node('user-query', {}, [node('div', { class: 'query-text' }, ['Summarize the thread.'])]),
  node('model-response', {}, [node('div', { class: 'model-response-text' }, ['Two turns, one ask.'])]),
]);
const geminiMsgs = extractGeminiMessages(geminiPage);
check(geminiMsgs.length === 2 && geminiMsgs[0].role === 'user' && geminiMsgs[1].text.includes('Two turns'), `Gemini turns, got ${JSON.stringify(geminiMsgs)}`);

const usage = await extractConversation(null, {
  location: { hostname: 'claude.ai', pathname: '/new', href: 'https://claude.ai/new#settings/usage', hash: '#settings/usage' },
  document: claudePage,
  skipScroll: true,
});
check(usage.ok === false && usage.reason === 'unsupported' && usage.sourceAgent === 'claude-chat', `usage page is named unsupported, got ${JSON.stringify(usage)}`);

const vacant = await extractConversation(null, {
  location: { hostname: 'chatgpt.com', pathname: '/', href: 'https://chatgpt.com/' },
  document: emptyPage,
  skipScroll: true,
});
check(vacant.ok === false && vacant.reason === 'empty', `empty ChatGPT page must report empty, got ${JSON.stringify(vacant)}`);

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('ok  multi-host transcript extractors (current-tab source)');
