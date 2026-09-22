// 在各产品的 usage 页面上运行：把页面上的数字抠下来，存起来。
// 只有真的认出数字才存，普通页面不动。
// 一个页面可能对应多个产品（Cursor 的 spending 页同时有 Cursor 和 Grok Bot），
// 所以 makeAgents 返回数组；waiting=true 表示页上还有区块没渲染完、先别关页。

function num(s) {
  if (s == null) return null;
  s = ('' + s).trim().replace(/,/g, '');
  let m;
  if ((m = s.match(/^([\d.]+)\s*万$/))) return Math.round(parseFloat(m[1]) * 1e4);
  if ((m = s.match(/^([\d.]+)\s*[Bb]$/))) return Math.round(parseFloat(m[1]) * 1e9);
  if ((m = s.match(/^([\d.]+)\s*[Mm]$/))) return Math.round(parseFloat(m[1]) * 1e6);
  if ((m = s.match(/^([\d.]+)\s*[Kk]$/))) return Math.round(parseFloat(m[1]) * 1e3);
  if ((m = s.match(/^([\d.]+)$/))) return parseFloat(m[1]);
  return null;
}

// 有些页面（比如 Grok）把内容放进 Shadow DOM，普通 innerText 读不到。
// 这个函数会连 Shadow DOM 里的文字一起收集。脚本/样式里的 "%" 不要算进去。
function deepText(root) {
  let out = '';
  const SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1 };
  const walk = (node) => {
    if (!node) return;
    if (node.nodeType === 3) { out += node.nodeValue + '\n'; return; }
    if (node.nodeType === 1 && SKIP[node.nodeName]) return;
    if (node.shadowRoot) node.shadowRoot.childNodes.forEach(walk);
    if (node.childNodes) node.childNodes.forEach(walk);
  };
  walk(root || document.body);
  return out;
}

function makeAgents() {
  if (!document.body) return { agents: [], waiting: true };
  const T = (document.body.innerText || '') + '\n' + deepText(document.body);
  const h = location.hostname;
  const g = (re) => { const m = T.match(re); return m ? m[1].trim() : null; };
  const pct = (re) => { const m = T.match(re); return m ? parseInt(m[1], 10) : null; };
  const one = (a) => ({ agents: a ? [a] : [], waiting: false });

  if (h.includes('claude.ai')) {
    const wu = pct(/All models[\s\S]{0,60}?(\d+)%\s*used/i);
    if (wu == null) return one(null);
    const su = pct(/Current session[\s\S]{0,60}?(\d+)%\s*used/i);
    const limits = [{ label: 'Weekly (All models)', percent_left: 100 - wu, resets_text: g(/All models[\s\S]{0,120}?Resets\s+([^\n]+)/i) }];
    if (su != null) limits.push({ label: 'Session (5h)', percent_left: 100 - su, resets_text: g(/Current session[\s\S]{0,90}?Resets\s+([^\n]+)/i) });
    return one({ id: 'claude-code', name: 'Claude Code', color: '#D97757', limits });
  }

  if (h.includes('chatgpt.com')) {
    const parsed = parseCodexUsage(T);
    if (!parsed) return one(null);
    const limits = [{ label: 'Weekly', percent_left: parsed.weekly, resets_text: parsed.weeklyReset }];
    if (parsed.five != null) {
      limits.push({ label: '5-hour limit', percent_left: parsed.five, resets_text: parsed.fiveReset });
    }
    return one({ id: 'codex', name: 'Codex', color: '#5CD6B3', limits, credits: parsed.credits });
  }

  if (h.includes('grok.com')) {
    const parsed = parseGrokUsage(T);
    if (!parsed) return one(null);
    return one({ id: 'grok-build', name: 'Grok', color: '#B78CF0',
      limits: [{ label: 'Weekly (SuperGrok)', percent_left: 100 - parsed.used, resets_text: parsed.reset }],
      breakdown: parsed.breakdown });
  }

  // gemini.google.com/usage："Weekly limit / Resets Sep 6 at 8:29 AM / 0% used"
  // 和 "Current usage / 0% used / Resets at 2:29 PM"。Weekly 是主额度。
  if (h.includes('gemini.google.com')) {
    const wk = pct(/Weekly limit[\s\S]{0,80}?(\d+)%\s*used/i);
    if (wk == null) return one(null);
    const limits = [{ label: 'Weekly', percent_left: 100 - wk, resets_text: g(/Weekly limit[\s\S]{0,40}?Resets\s+(?:at\s+)?([^\n]+)/i) }];
    // "Current usage" 后面的 Resets 只能取本区块的，别越界抓到 Weekly 的那行
    const cu = pct(/Current usage(?:(?!Weekly)[\s\S]){0,40}?(\d+)%\s*used/i);
    if (cu != null) limits.push({ label: 'Current usage', percent_left: 100 - cu, resets_text: g(/Current usage(?:(?!Weekly)[\s\S]){0,80}?Resets\s+(?:at\s+)?([^\n]+)/i) });
    const plan = g(/Usage limits\s+([A-Z][A-Za-z]{1,10})\s*\n/);
    return one({ id: 'gemini', name: 'Gemini', color: '#3B78E7', limits, plan });
  }

  if (h.includes('cursor.com')) {
    const out = [];
    const a = { id: 'cursor', name: 'Cursor', color: '#6E9BF5' };
    const cm = pct(/Cursor Models[\s\S]{0,90}?(\d+)%\s*used/i);
    if (cm != null) {
      const om = pct(/Other Models[\s\S]{0,60}?(\d+)%\s*used/i);
      const resets = g(/Usage limits reset on\s+([^\n(]+)/i), dl = g(/Usage limits reset on[^\n]*?(\d+)\s*days? left/i);
      const rt = resets ? resets + (dl ? ` (${dl} days)` : '') : null;
      a.limits = [{ label: 'Cursor Models', percent_left: 100 - cm, resets_text: rt }];
      if (om != null) a.limits.push({ label: 'Other Models', percent_left: 100 - om, resets_text: rt });
      a.plan = g(/CURRENT PLAN[\s\S]{0,30}?([A-Za-z+]+\s+\$\d+\/mo)/i);
    }
    const tt = num(g(/Total tokens[\s\S]{0,25}?([\d.]+\s*[KMB万]?)/i));
    if (tt != null) {
      a.tokens = {
        total: tt,
        included: num(g(/Included[\s\S]{0,25}?([\d.]+\s*[KMB万]?)/i)),
        on_demand: num(g(/On-demand[\s\S]{0,25}?([\d.]+\s*[KMB万]?|0)/i)),
      };
    }
    if (a.limits || a.tokens) out.push(a);

    // 同一页下面的 "Grok Bot › Weekly usage · 13% used · Resets 9月3日 (23 hours and 4 minutes left)"
    // 区块标题已经出现但百分比还没渲染 → waiting，等它出来再关页
    const gbHead = /Grok Bot[\s\S]{0,120}?Weekly usage/i.test(T);
    const gb = pct(/Grok Bot[\s\S]{0,120}?Weekly usage[\s\S]{0,60}?(\d+)%\s*used/i);
    if (gb != null) {
      out.push({ id: 'grok-bot', name: 'Grok Bot', color: '#F49AC1',
        limits: [{ label: 'Weekly', percent_left: 100 - gb, resets_text: g(/Grok Bot[\s\S]{0,300}?Resets\s+([^\n]+)/i) }] });
    }
    return { agents: out, waiting: gbHead && gb == null };
  }
  return one(null);
}

// 抓到的数据发给 background 统一写入。多个抓取标签页可能同时完成，
// 各自 get→改→set 会互相覆盖，所以由 background 排队串行写。
const captureStartedAt = Date.now();

function captureTrigger() {
  const m = (location.search || '').match(/[?&]cawtrigger=([^&]+)/);
  if (m && decodeURIComponent(m[1]) === 'automatic') return 'automatic';
  if (m && decodeURIComponent(m[1]) === 'manual') return 'manual';
  if (/(?:\?|&)cawrefresh(?:=|&|$)/.test(location.search || '')) return 'manual';
  return 'page';
}

function captureSourceUrl() {
  if (location.href) return location.href;
  return `https://${location.hostname}${location.pathname || '/'}${location.search || ''}${location.hash || ''}`;
}

function pageAgentIds() {
  const h = location.hostname;
  const p = location.pathname || '';
  const q = location.search || '';
  if (h.includes('claude.ai') && p.startsWith('/new')) return ['claude-code'];
  if (h.includes('chatgpt.com') && p.includes('/codex/cloud/settings/analytics')) return ['codex'];
  if (h.includes('grok.com') && /[?&]_s=usage/.test(q)) return ['grok-build'];
  if (h.includes('cursor.com') && p.includes('/dashboard/spending')) return ['cursor', 'grok-bot'];
  if (h.includes('cursor.com') && p.includes('/dashboard/usage')) return ['cursor'];
  if (h.includes('gemini.google.com') && p.includes('/usage')) return ['gemini'];
  return [];
}

function reportPageOutcomes() {
  if (captureTrigger() !== 'page') return;
  pageAgentIds().forEach((id) => {
    if (saved[id]) return;
    const missing = id === 'grok-bot' && !!saved.cursor;
    try {
      chrome.runtime.sendMessage({
        type: 'pageCaptureFailed',
        agent_id: id,
        status: missing ? 'missing' : 'failed',
        reason: missing ? 'section_missing' : 'read_failed',
        started: captureStartedAt,
        source_url: captureSourceUrl(),
      });
    } catch (e) {}
  });
}

function save(a, done) {
  a.scraped_at = Date.now();
  a.status = 'ok';
  a.capture_trigger = captureTrigger();
  a.capture_source_url = captureSourceUrl();
  a.capture_duration_ms = a.scraped_at - captureStartedAt;
  try {
    chrome.runtime.sendMessage({ type: 'agentData', agent: a }, () => {
      void chrome.runtime.lastError;
      if (done) done();
    });
  } catch (e) {
    if (done) done();
  }
}

function closeIfAuto() {
  if (location.search.includes('cawrefresh')) {
    try { chrome.runtime.sendMessage({ type: 'closeMe' }); } catch (e) {}
  }
}

// 页面/弹窗可能加载很慢（Grok、Cursor 尤其）。改成"盯着页面，数字一出现就抓"，
// 最多等 60 秒，兼顾慢加载和后台标签页被浏览器降速的情况。
// Grok 的大数字会从 0 往上滚，第一次匹配到的 "N% used" 往往是动画中间值，
// 所以同一读数要稳住一小会儿才存。
let done = false, closing = false, inflight = 0, iv = null, obs = null;
const saved = {};
let grokHold = { sig: '', t: 0 };
function grokStable(a) {
  const pct = a.limits && a.limits[0] ? a.limits[0].percent_left : '';
  const sig = pct + '|' + (a.breakdown || []).map((x) => x.percent).join(',');
  const now = Date.now();
  if (grokHold.sig !== sig) {
    grokHold = { sig, t: now };
    return false;
  }
  return now - grokHold.t >= 1200;
}
function finish() { if (obs) obs.disconnect(); if (iv) clearInterval(iv); }
// 所有该存的都存完、并且 background 都收到了，才关掉自动打开的页
function maybeClose() {
  if (!done || inflight > 0 || closing) return;
  closing = true;
  reportPageOutcomes();
  closeIfAuto();
}
function cursorDashboardPath() {
  const h = location.hostname || '';
  const p = location.pathname || '';
  return h.includes('cursor.com') && p.includes('/dashboard/');
}

function cursorJsonOk(r) {
  if (!r || r.type === 'opaqueredirect') return null;
  if (r.status === 0 || r.status === 301 || r.status === 302 || r.status === 303 || r.status === 307 || r.status === 308) return null;
  if (!r.ok) return null;
  return r.json().catch(() => null);
}

function cursorDashboardPost(path) {
  return fetch('https://cursor.com/api/dashboard/' + path, {
    method: 'POST',
    credentials: 'include',
    redirect: 'manual',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  }).then(cursorJsonOk, () => null);
}

function cursorAgentsFromDashboard(parsed) {
  if (!parsed) return [];
  const out = [];
  if (parsed.cursor && parsed.cursor.limits) {
    out.push({
      id: 'cursor',
      name: 'Cursor',
      color: '#6E9BF5',
      limits: parsed.cursor.limits,
      plan: parsed.cursor.plan || undefined,
    });
  }
  if (parsed.grokBot && parsed.grokBot.limits) {
    out.push({
      id: 'grok-bot',
      name: 'Grok Bot',
      color: '#F49AC1',
      limits: parsed.grokBot.limits,
    });
  }
  return out;
}

// Heavy Cursor dashboard tabs often never paint in the background. Read the
// same JSON the spending page uses so quiet refresh does not depend on React.
let cursorApi = { state: 'idle', agents: [], grokMissing: false, grokUnknown: false };

function startCursorApi() {
  if (cursorApi.state !== 'idle') return;
  if (typeof fetch !== 'function') return;
  if (!cursorDashboardPath()) return;
  if (!inTopFrame()) return;
  cursorApi.state = 'pending';
  Promise.all([
    cursorDashboardPost('get-current-period-usage'),
    cursorDashboardPost('get-plan-info'),
    cursorDashboardPost('get-sand-usage-status'),
  ]).then(([usage, plan, sand]) => {
    const apply = (parsed) => {
      cursorApi.agents = cursorAgentsFromDashboard(parsed);
      cursorApi.grokMissing = !!(parsed && parsed.grokMissing);
      cursorApi.state = (cursorApi.agents.length || cursorApi.grokMissing) ? 'done' : 'failed';
      cursorApi.grokUnknown = cursorApi.state === 'done'
        && !cursorApi.grokMissing
        && !cursorApi.agents.some((a) => a.id === 'grok-bot');
      tryOnce();
    };
    const parsed = typeof parseCursorDashboard === 'function'
      ? parseCursorDashboard(usage, plan, sand, Date.now())
      : null;
    if (parsed && (parsed.cursor || parsed.grokBot || parsed.grokMissing)) {
      apply(parsed);
      return;
    }
    // GET fallback: no CSRF Origin check, still cookie-auth'd.
    return fetch('https://cursor.com/api/usage-summary', {
      credentials: 'include',
      redirect: 'manual',
    }).then(cursorJsonOk, () => null).then((summary) => {
      const again = typeof parseCursorDashboard === 'function'
        ? parseCursorDashboard(summary, plan, sand, Date.now())
        : null;
      apply(again);
    });
  }).catch(() => {
    cursorApi.state = 'failed';
    tryOnce();
  });
}

function tryOnce() {
  if (done) return;
  startCursorApi();
  const r = makeAgents();
  const extra = cursorApi.state === 'done' ? cursorApi.agents : [];
  let pending = !!r.waiting;
  r.agents.concat(extra).forEach((a) => {
    if (saved[a.id]) return; // 每个产品只存一次
    if (a.id === 'grok-build' && !grokStable(a)) { pending = true; return; }
    saved[a.id] = true;
    inflight++;
    save(a, () => { inflight--; maybeClose(); });
  });
  const grokResolved = !!saved['grok-bot'] || cursorApi.grokMissing;
  if (grokResolved) pending = false;
  else if (r.waiting || cursorApi.grokUnknown) pending = true;
  else if (cursorApi.state === 'pending' && !saved.cursor) pending = true;
  if (pending || !Object.keys(saved).length) return;
  done = true;
  finish();
  maybeClose();
}

function isDispatchSurface() {
  const h = location.hostname || '';
  const p = location.pathname || '';
  const q = location.search || '';
  const hash = location.hash || '';
  if (h.includes('cursor.com') && /^\/agents(\/|$)/.test(p)) return true;
  if (h.includes('gemini.google.com') && /^\/app(\/|$)/.test(p)) return true;
  if (h.includes('claude.ai') && /^\/code(\/|$)/.test(p)) return true;
  if (h.includes('claude.ai') && /^\/new(\/|$)/.test(p) && !/settings\/usage/.test(hash)) return true;
  if (h.includes('chatgpt.com') && /\/codex(\/|$)/.test(p) && !p.includes('/settings')) return true;
  if (h.includes('chatgpt.com') && !p.includes('/codex') && !p.includes('/auth')) return true;
  if (h.includes('grok.com') && !/[?&]_s=usage/.test(q)) return true;
  return false;
}

function inTopFrame() {
  try { return typeof window === 'undefined' || !window.top || window === window.top; }
  catch (e) { return true; }
}

// Injected at document_idle (see manifest). v1.6.1 used document_start so
// Cursor JSON could start earlier; inactive refresh tabs then froze before
// this watcher ran, and every agent failed together at the 25s tab-kill.
if (!isDispatchSurface()) {
  tryOnce();
  if (!done) {
    obs = new MutationObserver(tryOnce);
    obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    let n = 0;
    iv = setInterval(() => {
      n++;
      tryOnce();
      if (!done && n > 30) { done = true; finish(); maybeClose(); }
    }, 2000);
  }
}

function isFillableComposer(el) {
  if (!el) return false;
  const tag = (el.tagName || '').toUpperCase();
  if (tag === 'INPUT') return false;
  const role = ((el.getAttribute && el.getAttribute('role')) || '').toLowerCase();
  if (role === 'searchbox') return false;
  const label = (
    ((el.getAttribute && (el.getAttribute('placeholder') || el.getAttribute('aria-label') || el.getAttribute('name'))) || '')
    + ' ' + (el.id || '') + ' ' + (el.className || '')
  ).toLowerCase();
  if (/search|filter|查询|搜索|筛选/.test(label)) return false;
  try {
    if (el.closest && el.closest('nav, header, [role="search"], [role="navigation"]')) return false;
  } catch (e) {}
  const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 240, height: 48 };
  if (!r || r.width < 120 || r.height < 20) return false;
  return true;
}

function fillComposer(prompt) {
  // Always return the filled element or null (never false) — callers submit
  // what comes back, so a mixed boolean/element return is a foot-gun.
  if (!prompt || !inTopFrame() || !isDispatchSurface()) return null;
  const visible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 1, height: 1 };
    return r.width > 0 && r.height > 0;
  };
  const trySet = (el) => {
    if (!el || !visible(el) || !isFillableComposer(el)) return false;
    try {
      el.focus();
      if (el.isContentEditable) {
        // The coding surfaces (Codex, Claude Code, Cursor) run rich-text editors
        // (ProseMirror / Lexical). A raw textContent write bypasses their input
        // pipeline, so the framework's model stays empty and reconciles the DOM
        // back to a blank composer — which is why the prompt never appeared and
        // nothing sent. Route the text through execCommand insertText instead so
        // the editor records it; fall back to textContent only if that no-ops.
        let ok = false;
        try {
          const sel = window.getSelection && window.getSelection();
          if (sel && document.createRange) {
            const range = document.createRange();
            range.selectNodeContents(el);
            sel.removeAllRanges();
            sel.addRange(range);
          }
          ok = !!(document.execCommand && document.execCommand('insertText', false, prompt));
        } catch (e) { ok = false; }
        if (!ok || !(el.textContent || '').includes(prompt)) {
          el.textContent = prompt;
          el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: prompt }));
        }
        return true;
      }
      if ('value' in el) {
        const proto = Object.getOwnPropertyDescriptor(el.__proto__ || {}, 'value')
          || Object.getOwnPropertyDescriptor(HTMLTextAreaElement && HTMLTextAreaElement.prototype || {}, 'value')
          || Object.getOwnPropertyDescriptor(HTMLInputElement && HTMLInputElement.prototype || {}, 'value');
        if (proto && proto.set) proto.set.call(el, prompt);
        else el.value = prompt;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    } catch (e) {}
    return false;
  };
  const sels = 'textarea, [contenteditable="true"], [role="textbox"]';
  const nodes = [];
  const walk = (root) => {
    if (!root) return;
    if (root.querySelectorAll) {
      const found = root.querySelectorAll(sels);
      for (let i = 0; i < found.length; i++) nodes.push(found[i]);
      const all = root.querySelectorAll('*');
      for (let i = 0; i < all.length; i++) {
        if (all[i].shadowRoot) walk(all[i].shadowRoot);
      }
    }
    if (root.shadowRoot) walk(root.shadowRoot);
  };
  walk(document);
  if (document.body) walk(document.body);
  let best = null;
  let bestArea = 0;
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (!isFillableComposer(el) || !visible(el)) continue;
    const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 240, height: 48 };
    const area = (r.width || 0) * (r.height || 0);
    if (area >= bestArea) { best = el; bestArea = area; }
  }
  // Return the element we filled (not just a boolean) so the caller can submit it.
  return best && trySet(best) ? best : null;
}

// Best-effort "press send" after a prefill. Composers differ a lot between
// sites and many ignore synthetic Enter (isTrusted=false), so we try a real
// send button first and fall back to a keyboard Enter.
// A button counts only if it's actually clickable right now — a disabled or
// aria-disabled button is the site telling us "input not registered yet", which
// is exactly the case we must wait through rather than fall back to Enter.
function clickableButton(b) {
  if (!b || b.disabled) return false;
  if (b.getAttribute && b.getAttribute('aria-disabled') === 'true') return false;
  const r = b.getBoundingClientRect ? b.getBoundingClientRect() : { width: 1, height: 1 };
  return r.width > 0 && r.height > 0;
}

// Buttons whose aria-label / testid / title mentions "send" or "submit" — Grok
// labels its send key "Submit" / "提交", not "Send". The substring match is
// deliberately loose in CSS; isSendLabel below tightens it so we don't click
// "Resend", "Send feedback", "Submit report", "Send to phone", "Sender", etc.
const SEND_LABELLED = 'button[data-testid*="send" i],button[data-testid*="submit" i],'
  + 'button[aria-label*="send" i],button[aria-label*="submit" i],'
  + 'button[aria-label*="发送"],button[aria-label*="提交"],'
  + 'button[title*="send" i],button[title*="submit" i],'
  + 'button[title*="发送"],button[title*="提交"]';

// A CSS "*=send*" match also catches Resend / Send feedback / Send to phone /
// Sender — clicking any of those would fire the wrong action (and on a quota
// product, maybe burn a request). Keep only labels that are actually the
// composer's send control.
function isSendLabel(raw) {
  const t = (raw || '').trim().toLowerCase();
  if (!t) return false;
  if (/resend|resubmit|feedback|report|invite|share|phone|email|sms|slack|whatsapp|schedul|later/.test(t)) return false;
  // Accept the real send control: "send", "send message", "submit", "提交",
  // "发送", "发送消息" — but not "sender", "send to …", "submit feedback"
  // (already excluded above). Grok's key is "Submit" / "提交".
  return (/(^|[^a-z])(send|submit)([^a-z]|$)/.test(t) || /发送|提交/.test(t)) && !/send\s+to\b/.test(t);
}

function sendLabelOf(b) {
  if (!b) return '';
  const g = (n) => (b.getAttribute && b.getAttribute(n)) || '';
  return `${g('data-testid')} ${g('aria-label')} ${g('title')} ${b.textContent || ''}`;
}

function findSendButton(el) {
  const scopes = [];
  const form = el.closest ? el.closest('form') : null;
  if (form) scopes.push(form);
  let p = el.parentElement;
  for (let i = 0; i < 8 && p; i++) { scopes.push(p); p = p.parentElement; }
  // Tier 1: a clickable, genuinely send-labelled button in the composer's own
  // form / nearby ancestors. This is the safest match.
  for (let i = 0; i < scopes.length; i++) {
    const found = scopes[i].querySelectorAll ? scopes[i].querySelectorAll(SEND_LABELLED) : [];
    for (let j = 0; j < found.length; j++) {
      if (clickableButton(found[j]) && isSendLabel(sendLabelOf(found[j]))) return found[j];
    }
  }
  // Tier 2: still nothing labelled nearby, so trust the composer form's own
  // submit button (scoped, so it's the composer's — not a random page form).
  for (let i = 0; i < scopes.length; i++) {
    const subs = scopes[i].querySelectorAll ? scopes[i].querySelectorAll('button[type="submit"]') : [];
    for (let j = 0; j < subs.length; j++) {
      if (clickableButton(subs[j]) && !/feedback|report|resend/i.test(sendLabelOf(subs[j]))) return subs[j];
    }
  }
  // Tier 3: Gemini and Grok keep the send button outside the composer's
  // ancestors (sometimes inside a shadow root). Search the whole document and
  // shadow DOM, but only for genuinely send-labelled buttons.
  const hits = [];
  const collect = (root) => {
    if (!root || !root.querySelectorAll) return;
    const found = root.querySelectorAll(SEND_LABELLED);
    for (let i = 0; i < found.length; i++) hits.push(found[i]);
    const all = root.querySelectorAll('*');
    for (let i = 0; i < all.length; i++) { if (all[i].shadowRoot) collect(all[i].shadowRoot); }
  };
  collect(document);
  for (let i = 0; i < hits.length; i++) {
    if (clickableButton(hits[i]) && isSendLabel(sendLabelOf(hits[i]))) return hits[i];
  }
  return null;
}

// Read what's currently in the composer, so we can (a) refuse to submit a
// composer that no longer holds our prompt and (b) tell whether a send landed.
function composerText(el) {
  if (!el) return '';
  if (el.isContentEditable) return el.textContent || '';
  if ('value' in el) return el.value || '';
  return el.textContent || '';
}
function composerHasPrompt(el, prompt) {
  return !!prompt && composerText(el).indexOf(prompt) >= 0;
}

// Synthetic Enter — a genuine last resort. Most composers ignore it
// (isTrusted=false), which is exactly why we prefer a real button click.
function pressEnter(el) {
  try {
    el.focus();
    const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent('keydown', opts));
    el.dispatchEvent(new KeyboardEvent('keypress', opts));
    el.dispatchEvent(new KeyboardEvent('keyup', opts));
    return true;
  } catch (e) {}
  return false;
}

// Submit runs at most once per page (this latch), and never treats "I clicked
// something" as success. On a quota product a false success is the worst
// outcome: the user thinks the prompt went out, or we fire the wrong button.
let submitted = false;
function scheduleSubmit(el, prompt) {
  if (submitted) return;
  // Bound the total sends we can ever cause: one real button click, then — only
  // if that click didn't take — one synthetic Enter. Never a loop of clicks,
  // which could double-send on a site that sent but didn't clear the box.
  let n = 0;
  let clickedAt = 0;      // 0 = not yet; else the tick we clicked on
  let triedEnter = false;
  const succeeded = (btn) => {
    // The send landed if the composer emptied of our prompt, or the button we
    // clicked went disabled/away (composers do one or the other after sending).
    if (!composerHasPrompt(el, prompt)) return true;
    if (btn && !clickableButton(btn)) return true;
    return false;
  };
  let lastBtn = null;
  const tick = () => {
    if (submitted) return;
    n++;
    // Verify a prior click before doing anything else.
    if (clickedAt) {
      if (succeeded(lastBtn)) { submitted = true; return; }
      // Give the click ~1.2s (3 ticks) to take before deciding it was a no-op.
      if (n - clickedAt < 3) { setTimeout(tick, 400); return; }
      // The click did nothing. Try Enter once, then stop — don't keep clicking.
      if (!triedEnter && composerHasPrompt(el, prompt)) { triedEnter = true; pressEnter(el); setTimeout(tick, 800); return; }
      submitted = true; // we tried a click and an Enter; give up rather than spam
      return;
    }
    // Refuse to submit a composer that no longer holds our prompt (stale draft
    // or a cleared box) — sending an empty or old message is worse than not
    // sending. Keep waiting in case the fill is still settling.
    if (!composerHasPrompt(el, prompt)) {
      if (n >= 45) { submitted = true; return; }
      setTimeout(tick, 400); return;
    }
    const btn = findSendButton(el);
    if (btn) { lastBtn = btn; try { btn.click(); } catch (e) {} clickedAt = n; setTimeout(tick, 400); return; }
    // No button yet. A slow/backgrounded tab can take 15s+ to enable it, so keep
    // looking (~18s) before the Enter fallback.
    if (n >= 45) { if (!triedEnter && composerHasPrompt(el, prompt)) { triedEnter = true; pressEnter(el); } submitted = true; return; }
    setTimeout(tick, 400);
  };
  setTimeout(tick, 400);
}

// Grok's coding surface is "Build" mode, chosen from the composer's mode
// dropdown (Auto / Fast / Expert / Build / Heavy). Until Build is active the
// composer only says "Switch to Build Mode to create apps", so a coding
// dispatch must flip that selector before filling. Best-effort and idempotent:
// returns true once Build is active (or we just picked it), false while we're
// still opening the menu / waiting for it to render, so the caller keeps
// retrying. Selectors are matched by the visible mode labels, so a Grok layout
// change may need a tweak here.
// Mode words the trigger button / menu items start with, English + Chinese.
const GROK_MODE_WORDS = ['auto', 'fast', 'expert', 'build', 'heavy', '自动', '快速', '专家', '构建', '重型'];
function grokLeadMode(t) {
  for (let i = 0; i < GROK_MODE_WORDS.length; i++) { if (t.indexOf(GROK_MODE_WORDS[i]) === 0) return GROK_MODE_WORDS[i]; }
  return null;
}
function isGrokBuildWord(m) { return m === 'build' || m === '构建'; }
function seenVisible(el) {
  if (!el || !el.getBoundingClientRect) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}
// Returns true ONLY once the trigger actually reads "Build" — never right after
// clicking the menu entry. Switching modes rehangs the composer, so if we
// reported success on the click, the caller would fill the outgoing Chat box
// that's about to be torn down. Menu items are "Build\nCreate apps…", so match
// by prefix, not exact text (the old `=== 'build'` never matched).
function selectGrokBuildMode() {
  if (!location.hostname.includes('grok.com')) return true;
  const label = (el) => ((el && el.textContent) || '').trim().toLowerCase();
  // 1. Trigger already on Build? Done. Otherwise remember it to open the menu.
  const btns = document.querySelectorAll('button');
  let trigger = null;
  for (let i = 0; i < btns.length; i++) {
    const b = btns[i];
    if (!seenVisible(b)) continue;
    const t = label(b);
    if (t.length > 24) continue;
    const m = grokLeadMode(t);
    if (m) { if (isGrokBuildWord(m)) return true; if (!trigger) trigger = b; }
  }
  // 2. Menu open with a Build entry? Click it, but report NOT-done — a later
  //    pass confirms via the trigger that Build actually took before we fill.
  const menuItems = document.querySelectorAll('[role="menuitem"],[role="menuitemradio"],[role="option"]');
  for (let i = 0; i < menuItems.length; i++) {
    const it = menuItems[i];
    if (!seenVisible(it)) continue;
    const t = label(it);
    if (t.indexOf('build') === 0 || t.indexOf('构建') === 0) { try { it.click(); } catch (e) {} return false; }
  }
  // 3. Otherwise open the mode menu so the next pass can pick Build.
  if (trigger) { try { trigger.click(); } catch (e) {} }
  return false;
}

function claimDispatchFill() {
  if (!chrome.runtime || !chrome.runtime.sendMessage) return;
  try { chrome.runtime.sendMessage({ type: 'dispatchClaimFill' }); } catch (e) {}
}

// A single dispatch reaches us through two racing paths — the on-load claim
// and the background's dispatchFill ping (which itself retries) — and each can
// re-enter while the fill retry loop is still spinning. Without a guard every
// path schedules its own submit, so the site sees the prompt sent twice or
// three times. This latch makes fill+submit happen exactly once per page; a
// fresh dispatch always opens a new tab, so a new content script starts unlatched.
// One driver per page. The on-load claim and the background's dispatchFill ping
// (which retries) both call onDispatchFill; fillStarted makes sure only the
// first one runs a retry loop, so we never end up with two loops racing to fill
// or, worse, two loops both poking Grok's mode dropdown open/closed.
let fillStarted = false;

function attachMarkdownFile(name, text) {
  if (!name || text == null) return false;
  if (typeof File === 'undefined' || typeof DataTransfer === 'undefined') return false;
  const inputs = [];
  const collect = (root) => {
    if (!root || !root.querySelectorAll) return;
    const found = root.querySelectorAll('input[type="file"]');
    for (let i = 0; i < found.length; i++) inputs.push(found[i]);
    const all = root.querySelectorAll('*');
    for (let i = 0; i < all.length; i++) { if (all[i].shadowRoot) collect(all[i].shadowRoot); }
  };
  collect(document);
  if (!inputs.length) return false;
  try {
    const file = new File([text], name, { type: 'text/markdown' });
    const dt = new DataTransfer();
    dt.items.add(file);
    let ok = false;
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      try {
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        ok = true;
      } catch (e) {}
    }
    return ok;
  } catch (e) {
    return false;
  }
}

function onDispatchFill(msg) {
  if (fillStarted) return;
  if (!inTopFrame() || !isDispatchSurface()) return;
  if (!msg || msg.type !== 'dispatchFill' || !msg.prompt) return;
  fillStarted = true;
  const needBuild = msg.mode === 'build';
  const attachName = msg.attachName || null;
  const attachText = msg.attachText || null;
  let attached = false;
  let el = null;
  let committedAt = 0; // the tick we first confirmed the prompt was in the box
  let n = 0;
  const iv = setInterval(() => {
    n++;
    // Grok coding dispatch must be in Build mode before we fill — the switch
    // rehangs the composer, so wait until Build is actually active.
    if (needBuild && !selectGrokBuildMode()) { if (n > 90) done(); return; }
    // (Re)assert the prompt while it's missing. A raw write into a ProseMirror /
    // Lexical editor gets reconciled away a frame later (and a Grok mode switch
    // tears the box down), so a single fill isn't enough — but only re-fill for a
    // short window after the first success, so we never fight the user's edits.
    const present = el && composerHasPrompt(el, msg.prompt);
    if (!present && (!committedAt || n <= committedAt + 5)) {
      const filled = fillComposer(msg.prompt);
      if (filled) el = filled;
    }
    if (el && attachName && attachText && !attached) {
      attached = !!attachMarkdownFile(attachName, attachText);
    }
    // Commit only once the prompt is genuinely sitting in the composer — never
    // on "fillComposer returned an element", which the reconcile can undo.
    if (el && composerHasPrompt(el, msg.prompt) && !committedAt) {
      committedAt = n;
      claimDispatchFill();
      if (msg.send) scheduleSubmit(el, msg.prompt);
    }
    if (committedAt && n > committedAt + 5) return done(); // fill settled
    if (n > 90) return done();                             // gave up (~36s)
  }, 400);
  function done() { clearInterval(iv); if (!committedAt) claimDispatchFill(); }
}

if (inTopFrame()) {
  if (chrome.runtime && chrome.runtime.onMessage && chrome.runtime.onMessage.addListener) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg && msg.type === 'captureConversation') {
        const run = (typeof extractConversation === 'function')
          ? extractConversation()
          : Promise.resolve({ ok: false, reason: 'unsupported' });
        Promise.resolve(run)
          .then((res) => { try { sendResponse(res); } catch (e) {} })
          .catch(() => { try { sendResponse({ ok: false, reason: 'error' }); } catch (e) {} });
        return true;
      }
      onDispatchFill(msg);
    });
  }
  if (isDispatchSurface() && chrome.runtime && chrome.runtime.sendMessage) {
    try {
      chrome.runtime.sendMessage({ type: 'dispatchClaimFill' }, (job) => {
        if (chrome.runtime.lastError || !job || !job.prompt) return;
        onDispatchFill({
          type: 'dispatchFill',
          prompt: job.prompt,
          send: job.send,
          mode: job.mode,
          attachName: job.attachName,
          attachText: job.attachText,
        });
      });
    } catch (e) {}
  }
}

