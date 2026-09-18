// Per-host transcript extractors for Cross-check.
//
// Source is the current tab. ChatGPT, Claude, Grok, Gemini, Codex and Cursor
// conversation pages are supported; usage/settings pages of those products are
// named but unsupported. There is no shared extractor — a site redesign breaks
// these selectors and that is expected.
//
// This module is a classic script (content_scripts + popup + tests via vm).
// It reads the page DOM; it never calls a model API.

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

function crosscheckHash(loc) {
  try {
    return String((loc && loc.hash) || '');
  } catch (e) {
    return '';
  }
}

function crosscheckBlob(loc) {
  return (crosscheckPath(loc) + ' ' + crosscheckHref(loc) + ' ' + crosscheckHash(loc)).toLowerCase();
}

function isUsageLike(loc) {
  const blob = crosscheckBlob(loc);
  if (blob.includes('/auth') || blob.includes('/backend-api')) return true;
  if (blob.includes('settings/usage') || blob.includes('_s=usage')) return true;
  if (/\/(usage|spending|dashboard|analytics|account|billing)(\/|$|\?|#)/.test(blob)) return true;
  if (blob.includes('/settings/') && (blob.includes('usage') || blob.includes('analytics'))) return true;
  return false;
}

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
  if (h.includes('chatgpt.com')) {
    if (p.includes('/codex')) {
      const usage = p.includes('/settings') || p.includes('/analytics') || isUsageLike(loc);
      return { sourceAgent: 'codex', sourceKind: 'code', supported: !usage, sessionUrl: href };
    }
    if (p.includes('/auth') || p.includes('/backend-api')) {
      return { sourceAgent: 'chatgpt', sourceKind: 'chat', supported: false, sessionUrl: href };
    }
    return { sourceAgent: 'chatgpt', sourceKind: 'chat', supported: true, sessionUrl: href };
  }
  if (h.includes('claude.ai')) {
    const code = /^\/code(\/|$)/.test(p);
    const agent = code ? 'claude-code' : 'claude-chat';
    const kind = code ? 'code' : 'chat';
    if (!code && isUsageLike(loc)) {
      return { sourceAgent: agent, sourceKind: kind, supported: false, sessionUrl: href };
    }
    return { sourceAgent: agent, sourceKind: kind, supported: true, sessionUrl: href };
  }
  if (h.includes('grok.com')) {
    if (isUsageLike(loc)) {
      return { sourceAgent: 'grok-build', sourceKind: 'chat', supported: false, sessionUrl: href };
    }
    return { sourceAgent: 'grok-build', sourceKind: 'chat', supported: true, sessionUrl: href };
  }
  if (h.includes('cursor.com')) {
    const agents = /\/agents(\/|$)/.test(p);
    return { sourceAgent: 'cursor', sourceKind: 'code', supported: agents, sessionUrl: href };
  }
  if (h.includes('gemini.google.com')) {
    if (isUsageLike(loc) || p.includes('/usage')) {
      return { sourceAgent: 'gemini', sourceKind: 'chat', supported: false, sessionUrl: href };
    }
    return { sourceAgent: 'gemini', sourceKind: 'chat', supported: true, sessionUrl: href };
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

function isAncestor(anc, el) {
  let n = el && (el.parentElement || el.parentNode);
  while (n) {
    if (n === anc) return true;
    n = n.parentElement || n.parentNode || null;
  }
  return false;
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

function inComposer(el) {
  if (inChatGptComposer(el)) return true;
  try {
    if (el.closest && el.closest('textarea, [contenteditable="true"], [data-testid="composer"]')) return true;
  } catch (e) {}
  return !!closestMatch(el, (n) => {
    const tag = (n.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA') return true;
    const ce = n.getAttribute && n.getAttribute('contenteditable');
    return ce === 'true';
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
    if (/^https?:\/\/(chatgpt\.com|chat\.openai\.com|claude\.ai|grok\.com|gemini\.google\.com|cursor\.com)\b/i.test(href)) return;
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

function pushMessage(out, role, el) {
  if (!role) return;
  const text = chatGptMessageBody(el);
  const attachments = collectAttachments(el);
  const links = collectHrefs(el);
  if (!text && !attachments.length && !links.length) return;
  const msg = { role, text };
  if (attachments.length) msg.attachments = attachments;
  if (links.length) msg.links = links;
  out.push(msg);
}

function extractChatGptMessages(doc) {
  const turns = chatGptTurnNodes(doc);
  const out = [];
  for (let i = 0; i < turns.length; i++) {
    const el = turns[i];
    pushMessage(out, roleFromTurn(el), el);
  }
  return out;
}

function extractPairedMessages(doc, groups) {
  const sels = [];
  groups.forEach((g) => { (g.sels || []).forEach((s) => sels.push(s)); });
  if (!sels.length) return [];
  const order = qsa(doc, sels.join(', '));
  const out = [];
  for (let i = 0; i < order.length; i++) {
    const el = order[i];
    if (inComposer(el)) continue;
    let nested = false;
    for (let j = 0; j < order.length; j++) {
      if (i !== j && isAncestor(order[j], el)) { nested = true; break; }
    }
    if (nested) continue;
    let role = '';
    for (let g = 0; g < groups.length; g++) {
      if (groupOwns(el, groups[g])) { role = groups[g].role; break; }
    }
    pushMessage(out, role, el);
  }
  return out;
}

function groupOwns(el, group) {
  const sels = group && group.sels ? group.sels : [];
  for (let i = 0; i < sels.length; i++) {
    if (elMatchesSimple(el, sels[i])) return true;
  }
  return false;
}

// Tiny matcher for the selectors this file actually uses. Not a CSS engine.
function elMatchesSimple(el, sel) {
  if (!el || !sel) return false;
  const s = String(sel).trim();
  const tag = (el.tagName || '').toUpperCase();
  if (/^[a-z][\w-]*$/i.test(s)) return tag === s.toUpperCase();
  if (s[0] === '.' && s.indexOf('[') < 0) {
    const cls = s.slice(1);
    return new RegExp('(^|\\s)' + cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)').test(el.className || '');
  }
  let m = s.match(/^\[class\*=["']?([^"'\]]+)["']?\]$/);
  if (m) return String(el.className || '').indexOf(m[1]) >= 0;
  m = s.match(/^\[data-testid=["']([^"']+)["']\]$/);
  if (m) return (el.getAttribute && el.getAttribute('data-testid')) === m[1];
  m = s.match(/^\[data-testid\^=["']([^"']+)["']\]$/);
  if (m) return String((el.getAttribute && el.getAttribute('data-testid')) || '').indexOf(m[1]) === 0;
  m = s.match(/^\[data-message-author-role=["']([^"']+)["']\]$/);
  if (m) return (el.getAttribute && el.getAttribute('data-message-author-role')) === m[1];
  m = s.match(/^\[data-message-role=["']([^"']+)["']\]$/);
  if (m) return (el.getAttribute && el.getAttribute('data-message-role')) === m[1];
  m = s.match(/^\[data-role=["']([^"']+)["']\]$/);
  if (m) return (el.getAttribute && el.getAttribute('data-role')) === m[1];
  m = s.match(/^\[data-turn=["']([^"']+)["']\]$/);
  if (m) return (el.getAttribute && el.getAttribute('data-turn')) === m[1];
  return false;
}

function extractClaudeMessages(doc) {
  return extractPairedMessages(doc, [
    { role: 'user', sels: ['[data-testid="user-message"]', '.font-user-message', '[class*="font-user-message"]'] },
    { role: 'assistant', sels: ['[data-testid="assistant-message"]', '.font-claude-response', '[class*="font-claude-response"]'] },
  ]);
}

function extractGrokMessages(doc) {
  return extractPairedMessages(doc, [
    { role: 'user', sels: ['[data-testid="user-message"]'] },
    { role: 'assistant', sels: ['[data-testid="grok-response"]'] },
  ]);
}

function extractGeminiMessages(doc) {
  return extractPairedMessages(doc, [
    { role: 'user', sels: ['user-query', '.query-text'] },
    { role: 'assistant', sels: ['model-response', '.model-response-text'] },
  ]);
}

function extractCursorMessages(doc) {
  const gpt = extractChatGptMessages(doc);
  if (gpt.length) return gpt;
  return extractPairedMessages(doc, [
    { role: 'user', sels: ['[data-message-role="user"]', '[data-role="user"]'] },
    { role: 'assistant', sels: ['[data-message-role="assistant"]', '[data-role="assistant"]'] },
  ]);
}

function extractCodexMessages(doc) {
  const gpt = extractChatGptMessages(doc);
  if (gpt.length) return gpt;
  return extractPairedMessages(doc, [
    { role: 'user', sels: ['[data-message-author-role="user"]'] },
    { role: 'assistant', sels: ['[data-message-author-role="assistant"]'] },
  ]);
}

function extractMessagesFor(meta, doc) {
  const agent = meta && meta.sourceAgent;
  if (agent === 'chatgpt') return extractChatGptMessages(doc);
  if (agent === 'codex') return extractCodexMessages(doc);
  if (agent === 'claude-chat' || agent === 'claude-code') return extractClaudeMessages(doc);
  if (agent === 'grok-build' || agent === 'grok-build-code') return extractGrokMessages(doc);
  if (agent === 'gemini') return extractGeminiMessages(doc);
  if (agent === 'cursor') return extractCursorMessages(doc);
  return extractChatGptMessages(doc);
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
// stops growing so capture cannot hang. Other hosts get the same scroll nudge.
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
    const conversation = extractMessagesFor(meta, doc);
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
