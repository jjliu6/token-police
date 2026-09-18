// MAIN-world hook, all frames: grok.com paints Usage from GetGrokCreditsConfig.
// Isolated-world content.js cannot see that request. Forward a copy so we scrape
// the same payload the modal already showed the user.
(function () {
  function emit(buf) {
    try {
      window.postMessage({
        source: 'token-police-grok',
        type: 'credits',
        bytes: Array.from(new Uint8Array(buf)),
      }, location.origin);
    } catch (e) {}
  }

  function watchUrl(url) {
    return /GetGrokCreditsConfig/.test(String(url || ''));
  }

  const orig = window.fetch;
  if (typeof orig === 'function') {
    window.fetch = function (input) {
      const req = orig.apply(this, arguments);
      try {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        if (watchUrl(url)) {
          req.then((res) => res.clone().arrayBuffer()).then(emit).catch(() => {});
        }
      } catch (e) {}
      return req;
    };
  }

  const XHR = window.XMLHttpRequest;
  if (!XHR || !XHR.prototype) return;
  const open = XHR.prototype.open;
  const send = XHR.prototype.send;
  XHR.prototype.open = function (method, url) {
    try { this.__tpGrokCredits = watchUrl(url); } catch (e) { this.__tpGrokCredits = false; }
    return open.apply(this, arguments);
  };
  XHR.prototype.send = function () {
    if (this.__tpGrokCredits) {
      this.addEventListener('load', function () {
        try {
          if (this.response instanceof ArrayBuffer) emit(this.response);
          else if (this.response) emit(this.response);
        } catch (e) {}
      });
    }
    return send.apply(this, arguments);
  };
})();
