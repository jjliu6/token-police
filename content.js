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
    const wk = pct(/Weekly usage limit[\s\S]{0,40}?(\d+)%\s*remaining/i);
    if (wk == null) return one(null);
    const fh = pct(/5[\s-]?hour usage limit[\s\S]{0,40}?(\d+)%\s*remaining/i);
    const limits = [{ label: 'Weekly', percent_left: wk, resets_text: null }];
    if (fh != null) limits.push({ label: '5-hour limit', percent_left: fh, resets_text: g(/Resets\s+(\d{1,2}:\d{2}\s*[AP]M)/i) });
    return one({ id: 'codex', name: 'Codex', color: '#5CD6B3', limits, credits: g(/Credits remaining[\s\S]{0,20}?(\d[\d,]*)/i) });
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
function tryOnce() {
  if (done) return;
  const r = makeAgents();
  let pending = !!r.waiting;
  r.agents.forEach((a) => {
    if (saved[a.id]) return; // 每个产品只存一次
    if (a.id === 'grok-build' && !grokStable(a)) { pending = true; return; }
    saved[a.id] = true;
    inflight++;
    save(a, () => { inflight--; maybeClose(); });
  });
  if (pending || !Object.keys(saved).length) return;
  done = true;
  finish();
  maybeClose();
}

function isDispatchSurface() {
  const h = location.hostname || '';
  const p = location.pathname || '';
  const q = location.search || '';
  if (h.includes('cursor.com') && /^\/agents(\/|$)/.test(p)) return true;
  if (h.includes('gemini.google.com') && /^\/app(\/|$)/.test(p)) return true;
  if (h.includes('claude.ai') && /^\/code(\/|$)/.test(p)) return true;
  if (h.includes('chatgpt.com') && /\/codex(\/|$)/.test(p) && !p.includes('/settings')) return true;
  if (h.includes('grok.com') && /[?&]q=/.test(q)) return true;
  return false;
}

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

function fillComposer(prompt) {
  if (!prompt) return false;
  const visible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 1, height: 1 };
    return r.width > 0 && r.height > 0;
  };
  const trySet = (el) => {
    if (!el || !visible(el)) return false;
    try {
      el.focus();
      if (el.isContentEditable) {
        el.textContent = prompt;
        el.dispatchEvent(new Event('input', { bubbles: true }));
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
  for (let i = 0; i < nodes.length; i++) {
    if (trySet(nodes[i])) return true;
  }
  return false;
}

function claimDispatchFill() {
  if (!chrome.runtime || !chrome.runtime.sendMessage) return;
  try { chrome.runtime.sendMessage({ type: 'dispatchClaimFill' }); } catch (e) {}
}

function onDispatchFill(msg) {
  if (!msg || msg.type !== 'dispatchFill' || !msg.prompt) return;
  const run = () => {
    if (!fillComposer(msg.prompt)) return false;
    claimDispatchFill();
    return true;
  };
  if (run()) return;
  let n = 0;
  const ivFill = setInterval(() => {
    n++;
    if (run() || n > 20) {
      clearInterval(ivFill);
      if (n > 20) claimDispatchFill();
    }
  }, 400);
}

if (chrome.runtime && chrome.runtime.onMessage && chrome.runtime.onMessage.addListener) {
  chrome.runtime.onMessage.addListener((msg) => { onDispatchFill(msg); });
}
if (chrome.runtime && chrome.runtime.sendMessage) {
  try {
    chrome.runtime.sendMessage({ type: 'dispatchClaimFill' }, (job) => {
      if (chrome.runtime.lastError || !job || !job.prompt) return;
      onDispatchFill({ type: 'dispatchFill', prompt: job.prompt });
    });
  } catch (e) {}
}

