// Minimal chrome.* stub so the REAL popup.html runs in a plain browser tab.
// Storage is seeded from window.__PROMO_STORE (set by the scene before load).
(() => {
  const store = JSON.parse(JSON.stringify(window.__PROMO_STORE || {}));
  const listeners = [];
  const pick = (keys) => {
    if (keys == null) return { ...store };
    const ks = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
    const out = {};
    ks.forEach((k) => { if (k in store) out[k] = store[k]; else if (keys && !Array.isArray(keys) && typeof keys === 'object') out[k] = keys[k]; });
    return out;
  };
  const cbOrPromise = (v, cb) => { if (cb) setTimeout(() => cb(v), 0); return Promise.resolve(v); };
  const local = {
    get: (k, cb) => cbOrPromise(pick(k), cb),
    set: (obj, cb) => {
      const changes = {};
      Object.entries(obj).forEach(([k, v]) => { changes[k] = { oldValue: store[k], newValue: v }; store[k] = v; });
      setTimeout(() => listeners.forEach((l) => l(changes, 'local')), 0);
      return cbOrPromise(undefined, cb);
    },
    remove: (k, cb) => { [].concat(k).forEach((x) => delete store[x]); return cbOrPromise(undefined, cb); },
  };
  const ev = () => ({ addListener() {}, removeListener() {}, hasListener: () => false });
  window.chrome = {
    storage: { local, onChanged: { addListener: (f) => listeners.push(f), removeListener() {} } },
    runtime: {
      getManifest: () => window.__PROMO_MANIFEST,
      sendMessage: (msg, cb) => { (window.__PROMO_SENT = window.__PROMO_SENT || []).push(msg); if (typeof cb === 'function') setTimeout(() => cb(window.__PROMO_REPLY ? window.__PROMO_REPLY(msg) : {}), 0); return Promise.resolve({}); },
      lastError: undefined, onMessage: ev(), getURL: (p) => p, id: 'promo',
    },
    tabs: { query: (q, cb) => cbOrPromise([], cb), create: (o, cb) => cbOrPromise({ id: 1 }, cb), update: (...a) => cbOrPromise({}, a.pop()), onUpdated: ev() },
    windows: { getCurrent: (o, cb) => cbOrPromise({ id: 1 }, typeof o === 'function' ? o : cb), create: (o, cb) => cbOrPromise({ id: 2 }, cb) },
    sidePanel: { open: () => Promise.resolve(), setPanelBehavior: () => Promise.resolve() },
    i18n: { getUILanguage: () => 'en-US', getMessage: (k) => k },
    alarms: { create() {}, onAlarm: ev() },
  };
  // Linux has no SF Pro → Inter (OFL). Applied as a late style so layout is unchanged otherwise.
  document.addEventListener('DOMContentLoaded', () => {
    const s = document.createElement('style');
    s.textContent = `@font-face{font-family:"PromoInter";src:url(${window.__PROMO_FONT}) format("woff2");font-weight:100 900}
      body,button,input,textarea,select{font-family:"PromoInter",sans-serif!important}`;
    document.head.appendChild(s);
  });
})();
