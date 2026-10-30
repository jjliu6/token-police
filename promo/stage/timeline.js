// Deterministic timeline engine for the promo. window.render(t) draws time t (s).
// The film itself (shots, camera, cards, captions) is data in scenes.js.
// Editing rule (same as the Estha promo): a new scene hard-cuts on the downbeat
// (shot + camera), state changes inside a scene crossfade. Story cards blur the
// screen behind them. Here the camera target is the side panel, which sits on
// the right of the frame so the left column can carry the section type.
(() => {
  const { S0, HDR, PF_TOP, X_CENTER, X_RIGHT, BAR, SCENES, REVEAL, GLIDE } = window.PROMO;
  const SHOT = (n) => `../capture/out/${n}.png`;
  const W = 500 * S0;                       // panel width on stage (530)
  const HOME = [250, 430];                  // whole-panel focus, CSS px
  const TYPE_RIGHT = 935;                   // the zoomed panel never crosses into the left-column type

  const SHOTS = [], CAM = [], CARDS = [], CAPS = [], NOTIFS = [];
  let END_AT = 0;
  SCENES.forEach((s, si) => {
    const t0 = s.at * BAR;
    (s.shots || []).forEach(([t, n, mode], i) => SHOTS.push([t0 + t, n, si > 0 && (i === 0 || mode === 'cut')]));
    (s.cam || []).forEach(([t, z, b, mode], i) => CAM.push([t0 + t, z, ...(b ? [b.x + b.width / 2, b.y + b.height / 2] : HOME), (si > 0 && i === 0) || mode === 'cut']));
    (s.cards || []).forEach(([a, b, who, l1, l2, l2In, opt]) => CARDS.push({ a: t0 + a, b: t0 + b, who, l1, l2, l2In: t0 + (l2In ?? a), black: !!(opt && opt.black) }));
    (s.captions || []).forEach(([a, b, k, h, sub]) => CAPS.push([t0 + a, t0 + b, k, h, sub]));
    (s.notifs || []).forEach(([a, b, title, body]) => NOTIFS.push([t0 + a, t0 + b, title, body]));
    if (s.end) END_AT = t0;
  });
  CAM.sort((a, b) => a[0] - b[0]);
  SCENES.forEach((s) => (s.cam || []).forEach(([t, z, b]) => {
    if (!b) return;
    const lx = b.x + b.width / 2;
    const ax = Math.max(X_RIGHT, TYPE_RIGHT + lx * S0 * z);
    const right = ax + (b.x + b.width - lx) * S0 * z;
    if (right > 1900) console.warn(`camera box leaves the frame: scene at ${s.at}, t=${t}, right edge ${Math.round(right)}`);
  }));
  const last = SCENES[SCENES.length - 1];
  const DURATION = (last.at + last.bars) * BAR;
  const XF = 0.32;

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lin = (t, a, b) => (b <= a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a)));
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const mix = (a, b, k) => a + (b - a) * k;
  const $ = (s) => document.querySelector(s);

  // Build DOM
  const content = $('#content');
  const imgs = {};
  SHOTS.forEach(([, n]) => {
    if (imgs[n]) return;
    const im = new Image();
    im.src = SHOT(n);
    im.decoding = 'sync';
    content.appendChild(im);
    imgs[n] = im;
  });
  const caps = CAPS.map(([, , k, h, sub]) => {
    const d = document.createElement('div');
    d.className = 'cap';
    d.innerHTML = `<div class="k"><i></i>${k}</div><div class="h">${h}</div>${sub ? `<div class="s">${sub}</div>` : ''}`;
    $('#caps').appendChild(d);
    return d;
  });

  function camera(t) {
    if (t <= CAM[0][0]) return CAM[0].slice(1, 4);
    for (let i = 0; i < CAM.length - 1; i++) {
      const [t0, z0, x0, y0] = CAM[i], [t1, z1, x1, y1, cut] = CAM[i + 1];
      if (t >= t0 && t < t1 && cut) return [z0, x0, y0];   // hold, then jump on the cut
      if (t >= t0 && t <= t1) {
        const k = ease(lin(t, t0, t1));
        return [mix(z0, z1, k), mix(x0, x1, k), mix(y0, y1, k)];
      }
    }
    return CAM[CAM.length - 1].slice(1, 4);
  }

  const card = $('#card');
  const notif = $('#notif');
  let cardKey = '', notifKey = '';

  window.render = (t) => {
    // Shots (crossfade within a scene, hard cut across scenes)
    const op = {};
    Object.keys(imgs).forEach((n) => (op[n] = 0));
    SHOTS.forEach(([ts, n, cut], i) => {
      if (t < ts) return;
      const k = i === 0 || cut ? 1 : ease(lin(t, ts, ts + XF));
      Object.keys(op).forEach((m) => (op[m] *= 1 - k));
      op[n] = Math.max(op[n], k);
    });
    Object.entries(imgs).forEach(([n, im]) => { im.style.opacity = op[n].toFixed(4); });

    // The panel rises in at REVEAL (centered), then glides to the right.
    const rise = easeOut(lin(t, REVEAL + 0.1, REVEAL + 1.4));
    const X = mix(X_CENTER, X_RIGHT, ease(lin(t, GLIDE[0], GLIDE[1])));
    const pf = $('#pf');
    pf.style.left = (X - W / 2).toFixed(2) + 'px';
    pf.style.top = PF_TOP + 'px';
    pf.style.opacity = rise.toFixed(4);
    pf.style.transform = `translateY(${mix(34, 0, rise).toFixed(2)}px) scale(${mix(0.965, 1, rise).toFixed(4)})`;
    const shown = ease(lin(t, REVEAL - 0.2, REVEAL + 0.5));
    $('#bg').style.opacity = shown.toFixed(4);

    // Camera — the focus point (panel CSS px) is brought to the panel's home centre,
    // pushed right when needed so the zoomed panel's left edge stays clear of the type.
    const [z, lx, ly] = camera(t);
    const gk = ease(lin(t, GLIDE[0], GLIDE[1]));
    const ax = X + gk * Math.max(0, TYPE_RIGHT + lx * S0 * z - X);
    // …and vertically, a zoomed panel never shows empty background above or below it.
    const PH = HDR + 860 * S0, above = HDR + ly * S0;
    const hi = PF_TOP + above * z, lo = 1080 - PF_TOP - (PH - above) * z;
    const ay0 = PF_TOP + HDR + HOME[1] * S0;
    const ay = lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, ay0));
    const fx = X - W / 2 + lx * S0, fy = PF_TOP + HDR + ly * S0;
    $('#cam').style.transform = `translate(${(ax - fx * z).toFixed(2)}px, ${(ay - fy * z).toFixed(2)}px) scale(${z.toFixed(4)})`;
    const glow = $('#glow');
    glow.style.left = X.toFixed(1) + 'px';
    glow.style.top = '560px';
    glow.style.opacity = (rise * (1 - 0.35 * lin(z, 1, 1.9))).toFixed(3);

    // Story card (one at a time)
    let ck = 0, blurK = 0;
    const active = CARDS.find((c) => t >= c.a - 0.05 && t <= c.b + 0.05);
    if (active) {
      const key = active.a + active.l1;
      if (key !== cardKey) {
        card.querySelector('.who').textContent = active.who || '';
        card.querySelector('.l1').textContent = active.l1 || '';
        card.querySelector('.l2').textContent = active.l2 || '';
        cardKey = key;
      }
      ck = Math.min(easeOut(lin(t, active.a, active.a + 0.5)), 1 - ease(lin(t, active.b - 0.45, active.b)));
      blurK = active.black ? 0 : ck;
      const l2 = card.querySelector('.l2');
      const k2 = easeOut(lin(t, active.l2In, active.l2In + 0.5));
      l2.style.opacity = k2;
      l2.style.transform = `translateY(${mix(14, 0, k2)}px)`;
      card.querySelector('.l1').style.transform = `translateY(${mix(14, 0, easeOut(lin(t, active.a, active.a + 0.6)))}px)`;
    }
    card.style.opacity = ck.toFixed(4);

    // Left-column captions
    CAPS.forEach(([a, b], i) => {
      const kin = easeOut(lin(t, a, a + 0.55));
      const k = Math.min(kin, 1 - ease(lin(t, b - 0.4, b)));
      caps[i].style.opacity = k.toFixed(4);
      caps[i].style.transform = `translateY(${mix(18, 0, kin).toFixed(2)}px)`;
    });

    // Notification banner
    const n = NOTIFS.find(([a, b]) => t >= a - 0.05 && t <= b + 0.05);
    let nk = 0;
    if (n) {
      const key = n[0] + n[2];
      if (key !== notifKey) {
        notif.querySelector('.t').textContent = n[2];
        notif.querySelector('.b').textContent = n[3];
        notifKey = key;
      }
      const kin = easeOut(lin(t, n[0], n[0] + 0.5));
      nk = Math.min(kin, 1 - ease(lin(t, n[1] - 0.35, n[1])));
      notif.style.transform = `translateX(${mix(60, 0, kin).toFixed(2)}px)`;
    }
    notif.style.opacity = nk.toFixed(4);

    // End card
    const E = END_AT;
    const endIn = ease(lin(t, E - 0.05, E + 0.75));
    const blur = Math.max(endIn * 14, blurK * 18);
    const dark = Math.max(endIn * 0.6, blurK * 0.62);
    const f = blur > 0.01 ? `blur(${blur.toFixed(2)}px) brightness(${(1 - dark).toFixed(3)})` : 'none';
    $('#cam').style.filter = f;
    $('#caps').style.filter = f;
    $('#caps').style.opacity = (1 - Math.max(endIn, blurK)).toFixed(4);
    const end = $('#end');
    end.style.opacity = endIn.toFixed(4);
    const icon = end.querySelector('img');
    const ik = easeOut(lin(t, E + 0.1, E + 1.2));
    icon.style.transform = `scale(${mix(0.86, 1, ik)})`;
    icon.style.opacity = ik;
    const stag = (el, t0) => {
      if (!el) return;
      const k = easeOut(lin(t, t0, t0 + 0.6));
      el.style.opacity = k;
      el.style.transform = `translateY(${mix(12, 0, k)}px)`;
    };
    const ET = window.PROMO.END_TIMES;
    stag(end.querySelector('.word'), E + 0.45);
    stag(end.querySelector('.tag'), E + ET.tag);
    stag(end.querySelector('.row'), E + ET.row);
    stag(end.querySelector('.url'), E + ET.url);
    stag(end.querySelector('.fine'), E + ET.fine);

    // Fade from / to black
    $('#black').style.opacity = Math.max(1 - lin(t, 0, 0.45), lin(t, DURATION - 0.7, DURATION)).toFixed(4);
  };

  window.ready = () => Promise.all(Object.values(imgs).map((im) => im.decode().catch(() => null)).concat(
    [document.fonts.ready, ...[...document.querySelectorAll('#end img, #pfh img, #notif img')].map((im) => im.decode().catch(() => null))]));
  window.DURATION = DURATION;
})();
