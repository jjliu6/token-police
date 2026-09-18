// MAIN-world hook: grok.com's own GetGrokCreditsConfig fetch is the same
// payload the Usage modal paints. Isolated-world content.js cannot see that
// request; this forwards a copy so we still scrape when the page is open.
(function () {
  const orig = window.fetch;
  if (typeof orig !== 'function') return;
  window.fetch = function (input) {
    const req = orig.apply(this, arguments);
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (/GetGrokCreditsConfig/.test(String(url))) {
        req.then((res) => res.clone().arrayBuffer()).then((buf) => {
          window.postMessage({
            source: 'token-police-grok',
            type: 'credits',
            bytes: Array.from(new Uint8Array(buf)),
          }, location.origin);
        }).catch(() => {});
      }
    } catch (e) {}
    return req;
  };
})();
