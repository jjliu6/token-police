// Per-host transcript extractors for Cross-check.
//
// v1 source: ChatGPT chat only (chatgpt.com, not Codex). That page has kept
// `data-message-author-role` stable for years; every other host waits until
// this path is proven. There is no shared extractor — a site redesign breaks
// these selectors and that is expected.
//
// This module is a classic script (content_scripts + tests via vm). It reads
// the page DOM; it never calls a model API.

const CROSSCHECK_V1_SOURCE = 'chatgpt';

function crosscheckHost(loc) {
  try {
    const raw = loc && (loc.hostname || loc.host || '');
    return String(raw).toLowerCase();
  } catch (e) {
    return '';
  }
}

function crosscheckPath(loc) {
  try {
    return String((loc && loc.pathname) || '');
  } catch (e) {
    return '';
  }
}

function crosscheckHref(loc) {
  try {
    return String((loc && loc.href) || '');
  } catch (e) {
    return '';
  }
}

// ChatGPT chat vs Codex / auth / settings. Codex shares the host but not the
// conversation DOM this adapter knows how to read.
function isChatGptChat(loc) {
  const h = crosscheckHost(loc);
  if (!h.includes('chatgpt.com')) return false;
  const p = crosscheckPath(loc);
  if (p.includes('/codex')) return false;
  if (p.includes('/auth')) return false;
  if (p.includes('/backend-api')) return false;
  return true;
}

function detectCrosscheckSource(loc) {
  const href = crosscheckHref(loc);
  const h = crosscheckHost(loc);
  const p = crosscheckPath(loc);
  if (isChatGptChat(loc)) {
    return {
      sourceAgent: 'chatgpt',
      sourceKind: 'chat',
      supported: true,
      sessionUrl: href,
    };
  }
  if (h.includes('chatgpt.com') && p.includes('/codex')) {
    return { sourceAgent: 'codex', sourceKind: 'code', supported: false, sessionUrl: href };
  }
  if (h.includes('claude.ai')) {
    const code = /^\/code(\/|$)/.test(p);
    return {
      sourceAgent: code ? 'claude-code' : 'claude-chat',
      sourceKind: code ? 'code' : 'chat',
      supported: false,
      sessionUrl: href,
    };
  }
  if (h.includes('grok.com')) {
    return { sourceAgent: 'grok-build', sourceKind: 'chat', supported: false, sessionUrl: href };
  }
  if (h.includes('cursor.com')) {
    return { sourceAgent: 'cursor', sourceKind: 'code', supported: false, sessionUrl: href };
  }
  if (h.includes('gemini.google.com')) {
    return { sourceAgent: 'gemini', sourceKind: 'chat', supported: false, sessionUrl: href };
  }
  return { sourceAgent: null, sourceKind: null, supported: false, sessionUrl: href };
}

function normalizeMessageRole(raw) {
  const r = String(raw || '').trim().toLowerCase();
  if (r === 'user' || r === 'human') return 'user';
  if (r === 'assistant' || r === 'bot' || r === 'system-assistant' || r === 'gpt') return 'assistant';
  return '';
}

function nodeText(el) {
  if (!el) return '';
  const raw = el.innerText != null ? el.innerText : el.textContent;
  return String(raw || '').replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function qsa(root, sel) {
  if (!root || !root.querySelectorAll) return [];
  try {
    const found = root.querySelectorAll(sel);
    const out = [];
    for (let i = 0; i < found.length; i++) out.push(found[i]);
    return out;
  } catch (e) {
    return [];
  }
}

function qs(root, sel) {
  if (!root) return null;
  if (root.querySelector) {
    try { return root.querySelector(sel) || null; } catch (e) {}
  }
  return qsa(root, sel)[0] || null;
}

function closestMatch(el, test) {
  let n = el;
  for (let i = 0; i < 12 && n; i++) {
    if (test(n)) return n;
    n = n.parentElement || n.parentNode || null;
  }
  return null;
}

function inChatGptComposer(el) {
  if (!el) return false;
  try {
    if (el.closest) {
      if (el.closest('form, [data-testid="composer"], #prompt-textarea, [id="prompt-textarea"]')) return true;
    }
  } catch (e) {}
  return !!closestMatch(el, (n) => {
    const id = (n.id || (n.getAttribute && n.getAttribute('id')) || '').toLowerCase();
    const testid = ((n.getAttribute && n.getAttribute('data-testid')) || '').toLowerCase();
    const tag = (n.tagName || '').toUpperCase();
    return id === 'prompt-textarea' || testid === 'composer' || tag === 'FORM';
  });
}

function chatGptMessageBody(el) {
  const body = qs(el, '.markdown, .whitespace-pre-wrap, [class*="markdown"], [class*="whitespace-pre-wrap"]');
  return nodeText(body || el);
}

function collectHrefs(el) {
  const out = [];
  const seen = {};
  qsa(el, 'a[href]').forEach((a) => {
    const href = (a.getAttribute && a.getAttribute('href')) || a.href || '';
    if (!href || href === '#' || /^javascript:/i.test(href)) return;
    if (/^https?:\/\/(chatgpt\.com|chat\.openai\.com)\b/i.test(href)) return;
    if (seen[href]) return;
    seen[href] = true;
    out.push(href);
  });
  return out;
}

function collectAttachments(el) {
  const names = [];
  const seen = {};
  const push = (name) => {
    const n = String(name || '').trim();
    if (!n || n.length > 180) return;
    if (seen[n.toLowerCase()]) return;
    seen[n.toLowerCase()] = true;
    names.push(n);
  };
  qsa(el, '[data-testid*="file" i], [class*="attachment"], a[download]').forEach((node) => {
    const labeled = (node.getAttribute && (node.getAttribute('download') || node.getAttribute('aria-label') || node.getAttribute('title'))) || '';
    const text = nodeText(node);
    const cand = labeled || text;
    if (/\.[A-Za-z0-9]{1,8}\b/.test(cand) || labeled) push(cand.split('\n')[0]);
  });
  qsa(el, 'img[alt]').forEach((img) => {
    const alt = (img.getAttribute && img.getAttribute('alt')) || '';
    if (/\.(png|jpe?g|gif|webp|svg|pdf|txt|md|csv|json|zip)\b/i.test(alt)) push(alt);
  });
  return names;
}

function chatGptTurnNodes(doc) {
  const articles = qsa(doc, 'article[data-testid^="conversation-turn-"], article[data-turn]');
  if (articles.length) return articles.filter((el) => !inChatGptComposer(el));
  return qsa(doc, '[data-message-author-role]').filter((el) => !inChatGptComposer(el));
}

function roleFromTurn(el) {
  const self = (el.getAttribute && el.getAttribute('data-message-author-role')) || '';
  const fromSelf = normalizeMessageRole(self);
  if (fromSelf) return fromSelf;
  const nested = qsa(el, '[data-message-author-role]');
  for (let i = nested.length - 1; i >= 0; i--) {
    const r = normalizeMessageRole(nested[i].getAttribute && nested[i].getAttribute('data-message-author-role'));
    if (r) return r;
  }
  const turn = (el.getAttribute && (el.getAttribute('data-turn') || el.getAttribute('data-testid'))) || '';
  if (/user/i.test(turn)) return 'user';
  if (/assistant|agent/i.test(turn)) return 'assistant';
  return '';
}

function extractChatGptMessages(doc) {
  const turns = chatGptTurnNodes(doc);
  const out = [];
  for (let i = 0; i < turns.length; i++) {
    const el = turns[i];
    const role = roleFromTurn(el);
    if (!role) continue;
    const text = chatGptMessageBody(el);
    const attachments = collectAttachments(el);
    const links = collectHrefs(el);
    if (!text && !attachments.length && !links.length) continue;
    const msg = { role, text };
    if (attachments.length) msg.attachments = attachments;
    if (links.length) msg.links = links;
    out.push(msg);
  }
  return out;
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chatGptScroller(doc) {
  const first = chatGptTurnNodes(doc)[0];
  if (first) {
    const overflowParent = closestMatch(first, (n) => {
      if (!n || n === doc.body || n === doc.documentElement) return false;
      const style = n.style || {};
      const ov = String(style.overflowY || style.overflow || '').toLowerCase();
      if (ov === 'auto' || ov === 'scroll') return true;
      const cls = String(n.className || '');
      return /overflow-y-(auto|scroll)|overflow-auto/i.test(cls);
    });
    if (overflowParent) return overflowParent;
  }
  return (doc.scrollingElement || doc.documentElement || doc.body || null);
}

// Best-effort: ChatGPT lazy-loads older turns as you scroll up. A few trips
// to scrollTop=0 is enough for a typical session; we stop once the count
// stops growing so capture cannot hang.
function loadChatGptHistory(doc, opts) {
  const skip = opts && opts.skipScroll;
  if (skip) return Promise.resolve();
  const rounds = (opts && opts.scrollRounds) || 8;
  const wait = (opts && opts.scrollWaitMs) || 220;
  const scroller = chatGptScroller(doc);
  let last = -1;
  let stable = 0;
  const step = (i) => {
    const n = chatGptTurnNodes(doc).length;
    if (n === last) stable += 1;
    else stable = 0;
    last = n;
    if (i >= rounds || (n > 0 && stable >= 2 && i > 0)) return Promise.resolve();
    try {
      if (scroller) {
        if ('scrollTop' in scroller) scroller.scrollTop = 0;
        if (typeof scroller.scrollTo === 'function') scroller.scrollTo(0, 0);
      }
      const w = (opts && opts.win) || (typeof window !== 'undefined' ? window : null);
      if (w && typeof w.scrollTo === 'function') w.scrollTo(0, 0);
    } catch (e) {}
    return sleepMs(wait).then(() => step(i + 1));
  };
  return step(0);
}

function emptySession(meta, reason) {
  return {
    ok: false,
    reason: reason || 'empty',
    sourceAgent: meta.sourceAgent,
    sourceKind: meta.sourceKind,
    conversation: [],
    repository: '',
    branch: '',
    pullRequest: '',
    sessionUrl: meta.sessionUrl || '',
  };
}

function extractConversation(win, opts) {
  const w = win || (typeof window !== 'undefined' ? window : null);
  const loc = (opts && opts.location) || (w && w.location) || (typeof location !== 'undefined' ? location : {});
  const doc = (opts && opts.document) || (w && w.document) || (typeof document !== 'undefined' ? document : null);
  const meta = detectCrosscheckSource(loc);
  if (!meta.supported) {
    return Promise.resolve(emptySession(meta, 'unsupported'));
  }
  if (!doc) return Promise.resolve(emptySession(meta, 'empty'));
  return loadChatGptHistory(doc, opts).then(() => {
    const conversation = extractChatGptMessages(doc);
    if (!conversation.length) return emptySession(meta, 'empty');
    return {
      ok: true,
      reason: null,
      sourceAgent: meta.sourceAgent,
      sourceKind: meta.sourceKind,
      conversation,
      repository: '',
      branch: '',
      pullRequest: '',
      sessionUrl: meta.sessionUrl || '',
    };
  });
}
