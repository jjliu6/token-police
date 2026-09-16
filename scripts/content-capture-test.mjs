// Wire content.js captureConversation to the ChatGPT extractor.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const check = (cond, msg) => { if (!cond) problems.push(msg); };

function node(tag, attrs, kids) {
  const children = (kids || []).map((c) => (typeof c === 'string' ? { textContent: c, innerText: c } : c));
  const n = {
    tagName: String(tag).toUpperCase(),
    attrs: attrs || {},
    children,
    parentElement: null,
    id: (attrs && attrs.id) || '',
    className: (attrs && (attrs.class || attrs.className)) || '',
    getAttribute(k) { return this.attrs[k] != null ? this.attrs[k] : null; },
    closest(sel) {
      const want = String(sel).split(',').map((s) => s.trim());
      let cur = this;
      while (cur) {
        for (const w of want) {
          if (w.startsWith('#') && cur.id === w.slice(1)) return cur;
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
  children.forEach((c) => { if (c && c.tagName) c.parentElement = c.parentNode = n; });
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
  if (s === 'a[href]') return el.tagName === 'A' && !!el.getAttribute('href');
  if (s === 'img[alt]') return el.tagName === 'IMG' && el.getAttribute('alt') != null;
  if (s === 'a[download]') return el.tagName === 'A' && el.getAttribute('download') != null;
  if (s === '[data-message-author-role]') return el.getAttribute('data-message-author-role') != null;
  if (s === 'article[data-testid^="conversation-turn-"]') {
    const v = el.getAttribute('data-testid') || '';
    return el.tagName === 'ARTICLE' && v.indexOf('conversation-turn-') === 0;
  }
  if (s === 'article[data-turn]') return el.tagName === 'ARTICLE' && el.getAttribute('data-turn') != null;
  if (s === '.markdown') return /(^|\s)markdown(\s|$)/.test(el.className);
  if (s === '.whitespace-pre-wrap') return /whitespace-pre-wrap/.test(el.className);
  if (s === '[class*="markdown"]') return /markdown/.test(el.className);
  if (s === '[class*="whitespace-pre-wrap"]') return /whitespace-pre-wrap/.test(el.className);
  if (s.includes('data-testid*="file"')) return /file/i.test(el.getAttribute('data-testid') || '');
  if (s === '[class*="attachment"]') return /attachment/.test(el.className);
  return false;
}

function queryAll(root, selector) {
  const parts = String(selector).split(',').map((s) => s.trim()).filter(Boolean);
  const acc = [];
  allElements(root, []).forEach((el) => {
    if (parts.some((p) => match(el, p))) acc.push(el);
  });
  return acc;
}

const user = node('article', { 'data-testid': 'conversation-turn-1', 'data-turn': 'user' }, [
  node('div', { 'data-message-author-role': 'user' }, [
    node('div', { class: 'whitespace-pre-wrap' }, ['Please review the login fix.']),
  ]),
]);
const assistant = node('article', { 'data-testid': 'conversation-turn-2', 'data-turn': 'assistant' }, [
  node('div', { 'data-message-author-role': 'assistant' }, [
    node('div', { class: 'markdown' }, ['I opened a PR.']),
  ]),
]);
const body = node('body', {}, [user, assistant]);
const document = {
  body,
  documentElement: body,
  querySelectorAll: (sel) => queryAll(body, sel),
  querySelector: (sel) => queryAll(body, sel)[0] || null,
};
body.parentElement = document;

let onMessage = null;
const ctxObj = {
  Date,
  setTimeout,
  setInterval: () => 1,
  clearInterval: () => {},
  Promise,
  document,
  window: { top: {}, scrollTo: () => {} },
  location: { hostname: 'chatgpt.com', pathname: '/c/abc', search: '', hash: '', href: 'https://chatgpt.com/c/abc' },
  chrome: {
    runtime: {
      onMessage: { addListener: (fn) => { onMessage = fn; } },
      sendMessage: () => {},
      lastError: null,
    },
  },
};
ctxObj.window.top = ctxObj.window;
const ctx = vm.createContext(ctxObj);
vm.runInContext(readFileSync(resolve(root, 'parse.js'), 'utf8'), ctx, { filename: 'parse.js' });
vm.runInContext(readFileSync(resolve(root, 'conversation-adapters.js'), 'utf8'), ctx, { filename: 'conversation-adapters.js' });
vm.runInContext(readFileSync(resolve(root, 'content.js'), 'utf8'), ctx, { filename: 'content.js' });

check(typeof onMessage === 'function', 'content.js should listen for captureConversation');
const got = await new Promise((resolve) => {
  const ret = onMessage({ type: 'captureConversation' }, {}, resolve);
  if (ret !== true) resolve(null);
});
check(got && got.ok === true, `capture should succeed, got ${JSON.stringify(got)}`);
check(got && got.conversation && got.conversation.length === 2, 'capture must return both turns');
check(got && got.conversation[0].text.includes('login fix'), `user turn missing: ${JSON.stringify(got)}`);
check(got && got.sourceAgent === 'chatgpt', 'sourceAgent chatgpt');

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('ok  content.js captureConversation returns a ChatGPT transcript');
