// grok.com 用量数据的"网络监听器"（MAIN world，document_start，只在 ?_s=usage 页、顶层框架）。
//
// 为什么需要它：Grok 的用量弹窗是重 SPA，后台标签页经常根本画不出来，靠 innerText
// 抓就三天两头失败。弹窗里的数字其实来自页面自己发的某个请求（不一定在 /rest/ 下）。这里把
// 页面收到的同源 JSON 响应原样转交给 content.js（postMessage），其它请求只报路径和类型；content.js
// 在 DOM 抓取成功时"对答案"学会这个接口（见 parse.js learnGrokApiMap），以后刷新就直接
// 自己重放请求，不再依赖弹窗。
//
// 约束：不碰 DOM、不改请求、不发网络、任何异常都吞掉，绝不能影响页面本身。
// content.js 在 document_idle 才加载，所以先缓存，等它发 "ready" 再一次性补发。
(function () {
  try {
    if (window.top !== window) return;
    if (!/[?&]_s=usage/.test(location.search || '') && !/[?&]caw(refresh|trigger)=/.test(location.search || '')) return;
  } catch (e) { return; }

  const MAX_TEXT = 300000;
  const buffer = [];
  let ready = false;

  function post(item) {
    try { window.postMessage(Object.assign({ __tokenPolice: 'grok-rest' }, item), location.origin); } catch (e) {}
  }
  function emit(item) {
    if (ready) { post(item); return; }
    buffer.push(item);
    if (buffer.length > 120) buffer.shift();
  }
  window.addEventListener('message', (ev) => {
    if (ev.source !== window || !ev.data || ev.data.__tokenPolice !== 'grok-rest-ready') return;
    ready = true;
    buffer.splice(0).forEach(post);
  });

  // Same-origin grok.com requests are candidates (JSON is forwarded whole). The
  // usage call is not guaranteed to live under /rest/ (it may be gRPC-web or on
  // another host), so everything else is still reported by path + content-type —
  // no body — so a failed learn can say what the page actually fetched.
  const STATIC = /\.(js|mjs|css|map|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|mp4|webm|mp3|wav)$/i;
  function tapUrl(u) {
    try {
      const x = new URL(String(u), location.href);
      if (!/^https?:$/.test(x.protocol) || STATIC.test(x.pathname) || /^\/(_next|cdn-cgi)\//.test(x.pathname)) return null;
      return { url: x.toString(), same: x.origin === location.origin };
    } catch (e) { return null; }
  }
  function headerObj(h) {
    const out = {};
    try {
      if (!h) return out;
      if (typeof h.forEach === 'function' && !Array.isArray(h)) h.forEach((v, k) => { out[String(k)] = String(v); });
      else if (Array.isArray(h)) h.forEach((kv) => { if (kv && kv.length === 2) out[String(kv[0])] = String(kv[1]); });
      else Object.keys(h).forEach((k) => { out[k] = String(h[k]); });
    } catch (e) {}
    return out;
  }
  function bodyText(b) {
    if (b == null) return null;
    if (typeof b === 'string') return b.length <= 20000 ? b : null;
    return null; // FormData / streams cannot be replayed from a map
  }

  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (input, init) {
      const p = origFetch.apply(this, arguments);
      try {
        const t = tapUrl(typeof input === 'string' ? input : (input && input.url));
        if (t) {
          const url = t.url;
          const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
          const headers = headerObj((init && init.headers) || (input && input.headers));
          const body = bodyText(init && init.body);
          p.then((res) => {
            if (!res || !res.headers) return;
            const ct = (res.headers.get && res.headers.get('content-type')) || '';
            if (!t.same || !/json/i.test(ct)) { emit({ url, method, status: res.status, contentType: ct, text: null }); return; }
            res.clone().text().then((text) => {
              if (text && text.length <= MAX_TEXT) emit({ url, method, headers, body, status: res.status, contentType: ct, text });
            }).catch(() => {});
          }).catch(() => {});
        }
      } catch (e) {}
      return p;
    };
  }

  const XP = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
  if (XP && XP.open && XP.send && XP.setRequestHeader) {
    const oOpen = XP.open, oSend = XP.send, oSet = XP.setRequestHeader;
    XP.open = function (method, url) {
      try { const t = tapUrl(url); this.__tpRest = t ? { method: String(method || 'GET').toUpperCase(), url: t.url, same: t.same, headers: {} } : null; } catch (e) {}
      return oOpen.apply(this, arguments);
    };
    XP.setRequestHeader = function (k, v) {
      try { if (this.__tpRest) this.__tpRest.headers[String(k)] = String(v); } catch (e) {}
      return oSet.apply(this, arguments);
    };
    XP.send = function (body) {
      try {
        const tp = this.__tpRest;
        if (tp && tp.url) {
          tp.body = bodyText(body);
          this.addEventListener('load', () => {
            try {
              const ct = this.getResponseHeader('content-type') || '';
              if (!tp.same || !/json/i.test(ct)) { emit({ url: tp.url, method: tp.method, status: this.status, contentType: ct, text: null }); return; }
              const text = (this.responseType === '' || this.responseType === 'text') ? this.responseText : null;
              if (text && text.length <= MAX_TEXT) emit({ url: tp.url, method: tp.method, headers: tp.headers, body: tp.body, status: this.status, contentType: ct, text });
            } catch (e) {}
          });
        }
      } catch (e) {}
      return oSend.apply(this, arguments);
    };
  }
})();
