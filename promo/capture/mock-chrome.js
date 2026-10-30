// Browser-side init script for promo captures.
// Installs window.chrome BEFORE the real popup.html scripts run, so the real
// side-panel UI renders with deterministic sample data. Same idea as Estha's
// promo/capture/mock-base.js (a fake Go backend); here it is a fake
// chrome.storage / chrome.runtime / chrome.windows. Nothing here ships with the
// extension; it only runs inside Playwright.
//
// Inputs (set by harness.mjs before this script runs):
//   window.__TP_STORE     initial chrome.storage.local contents
//   window.__TP_MANIFEST  the real manifest.json
//   window.__TP_HANDLERS  optional { [message.type]: (msg) => response }
(() => {
  const store = JSON.parse(JSON.stringify(window.__TP_STORE || {}));
  const listeners = [];
  const unmocked = (window.__TP_UNMOCKED = new Set());
  const sent = (window.__TP_SENT = []);
  const handlers = (window.__TP_HANDLERS = window.__TP_HANDLERS || {});
  const later = (fn) => setTimeout(fn, 0);
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

  function pick(keys) {
    if (keys == null) return clone(store);
    if (typeof keys === 'string') keys = [keys];
    const out = {};
    if (Array.isArray(keys)) keys.forEach((k) => { if (k in store) out[k] = clone(store[k]); });
    else Object.keys(keys).forEach((k) => { out[k] = k in store ? clone(store[k]) : keys[k]; });
    return out;
  }
  function fire(changes) {
    if (!Object.keys(changes).length) return;
    listeners.slice().forEach((fn) => { try { fn(changes, 'local'); } catch (e) { console.error(e); } });
  }
  const local = {
    get(keys, cb) {
      const res = pick(keys);
      if (typeof cb === 'function') later(() => cb(res));
      return Promise.resolve(res);
    },
    set(items, cb) {
      const changes = {};
      Object.keys(items || {}).forEach((k) => {
        changes[k] = { oldValue: clone(store[k]), newValue: clone(items[k]) };
        store[k] = clone(items[k]);
      });
      later(() => { fire(changes); if (typeof cb === 'function') cb(); });
      return Promise.resolve();
    },
    remove(keys, cb) {
      const changes = {};
      (Array.isArray(keys) ? keys : [keys]).forEach((k) => {
        if (k in store) { changes[k] = { oldValue: clone(store[k]) }; delete store[k]; }
      });
      later(() => { fire(changes); if (typeof cb === 'function') cb(); });
      return Promise.resolve();
    },
  };

  const runtime = {
    id: 'promo-token-police',
    lastError: null,
    getManifest: () => clone(window.__TP_MANIFEST || { version: '0.0.0' }),
    getURL: (p) => location.origin + '/' + String(p || '').replace(/^\//, ''),
    sendMessage(msg, cb) {
      sent.push(clone(msg));
      const h = msg && handlers[msg.type];
      if (!h) unmocked.add('runtime.sendMessage:' + (msg && msg.type));
      Promise.resolve(h ? h(msg) : undefined).then((res) => {
        if (typeof cb === 'function') later(() => cb(res));
      });
    },
    onMessage: { addListener() {}, removeListener() {} },
  };

  const chromeObj = {
    storage: { local, onChanged: { addListener: (fn) => listeners.push(fn), removeListener() {} } },
    runtime,
    tabs: {
      create(opts, cb) { sent.push({ type: 'tabs.create', opts }); if (typeof cb === 'function') later(() => cb({ id: 900 })); },
      query(q, cb) { if (typeof cb === 'function') later(() => cb([])); },
      update(id, opts, cb) { if (typeof cb === 'function') later(() => cb({ id })); },
    },
    windows: {
      getLastFocused(opts, cb) {
        const win = window.__TP_WINDOW || null;
        if (!win) unmocked.add('windows.getLastFocused');
        if (typeof cb === 'function') later(() => cb(clone(win)));
      },
    },
    i18n: { getUILanguage: () => 'en', getMessage: (k) => k },
  };

  // Anything else the page touches is recorded instead of throwing.
  const guard = (obj, path) => new Proxy(obj, {
    get(t, p) {
      if (p in t) {
        const v = t[p];
        return v && typeof v === 'object' && !Array.isArray(v) ? guard(v, path + '.' + String(p)) : v;
      }
      if (typeof p === 'symbol' || p === 'then' || p === 'toJSON') return undefined;
      unmocked.add(path + '.' + String(p));
      return undefined;
    },
  });
  window.chrome = guard(chromeObj, 'chrome');
  window.__tpStore = store;

  // ── Fonts: Linux Chromium has no SF Pro; map the panel's font stack to Inter ──
  const FONT_BASE = window.__PROMO_FONT_BASE || '';
  const css = `
    @font-face{font-family:"SF Pro Text";src:url(${FONT_BASE}/InterVariable-latin.woff2) format("woff2");font-weight:100 900;}
    @font-face{font-family:"Segoe UI";src:url(${FONT_BASE}/InterVariable-latin.woff2) format("woff2");font-weight:100 900;}
    @font-face{font-family:"SFMono-Regular";src:url(${FONT_BASE}/jetbrains-mono-latin-400-normal.woff2) format("woff2");font-weight:400;}
    @font-face{font-family:"SFMono-Regular";src:url(${FONT_BASE}/jetbrains-mono-latin-500-normal.woff2) format("woff2");font-weight:500 700;}
    html{font-feature-settings:"tnum" 1,"cv11","ss01";}
    ::-webkit-scrollbar{width:0;height:0}
  `;
  const inject = () => { const s = document.createElement('style'); s.id = 'promo-fonts'; s.textContent = css; document.head.appendChild(s); };
  if (document.head) inject(); else document.addEventListener('DOMContentLoaded', inject);
})();
