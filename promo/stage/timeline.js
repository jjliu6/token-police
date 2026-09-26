// Scenes follow the voiceover: each scene starts 0.35 s before its first VO line
// (build/vo_timing.js). Boxes are CSS px in the 460×900 captured panel.
(() => {
  const VO = window.VO_TIMING;
  const PW = 460, DISP = 491 / 460;
  const box = (x, y, w, h) => ({ x, y, w, h });
  const FULL = box(0, 0, 460, 900);
  const SCENES = {
    hook: {},
    dash: { shot: 'dash', head: 'Every quota.\n<span class="k">One side panel.</span>', cam: [FULL, FULL] },
    burn: { shot: 'dash', head: 'Know before\nyou <span class="k">run dry.</span>', cam: [box(0, 40, 460, 500), box(236, 100, 214, 200)] },
    dispatch: { shot: 'dispatch', head: 'One prompt.\n<span class="k">Several AIs.</span>', cam: [box(0, 380, 460, 520), box(18, 500, 430, 340)] },
    cross: { shot: 'crosscheck', head: 'Get a\n<span class="k">second opinion.</span>', cam: [box(0, 330, 460, 520), box(0, 560, 460, 290)] },
    bald: { shot: 'bald', head: 'Sit less.\n<span class="k">Keep your hair.</span>', cam: [box(0, 0, 460, 620), box(60, 30, 310, 400)] },
    private: { shot: 'dash', head: 'No API keys.\n<span class="k">Stays in your browser.</span>', cam: [FULL, box(0, 0, 460, 820)] },
    end: {},
  };
  const order = [];
  VO.lines.forEach((l) => { if (!order.find((o) => o.id === l.scene)) order.push({ id: l.scene, at: l.scene === 'hook' ? 0 : l.start - 0.35 }); });
  order.forEach((o, i) => (o.to = i + 1 < order.length ? order[i + 1].at : VO.duration + 0.8));
  const DURATION = VO.duration + 0.8;

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lin = (t, a, b) => clamp((t - a) / (b - a));
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const eo = (x) => 1 - Math.pow(1 - x, 3);
  const mix = (a, b, k) => a + (b - a) * k;
  const $ = (s) => document.querySelector(s);

  const imgs = {};
  const heads = {};
  order.forEach(({ id }) => {
    const s = SCENES[id];
    if (s.shot && !imgs[s.shot]) { const im = new Image(); im.src = `../capture/out/${s.shot}.png`; $('#panel').appendChild(im); imgs[s.shot] = im; }
    if (s.head) { const d = document.createElement('div'); d.className = 'h'; d.innerHTML = s.head; $('#head').appendChild(d); heads[id] = d; }
  });

  // camera: fit box into the panel frame (aspect 460:900), zoom ≥ 1
  function camXf(b) {
    const z = Math.max(1, Math.min(PW / b.w, 900 / b.h));
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const tx = clamp(PW / 2 - cx * z, PW - PW * z, 0), ty = clamp(450 - cy * z, 900 - 900 * z, 0);
    return [z, tx, ty];
  }

  window.render = (t) => {
    const cur = order.find((o) => t >= o.at && t < o.to) || order[order.length - 1];
    const s = SCENES[cur.id];
    // hook
    const hookOut = order[1].at;
    $('#hook').style.opacity = (1 - ease(lin(t, hookOut - 0.3, hookOut + 0.25))).toFixed(3);
    document.querySelectorAll('#hook .names span').forEach((el, i) => {
      const k = eo(lin(t, 0.55 + i * 0.62, 0.95 + i * 0.62));
      el.style.opacity = k; el.style.transform = `translateY(${mix(18, 0, k)}px)`;
    });
    const qk = eo(lin(t, 6.9, 7.5)); $('#hook .q').style.opacity = qk;
    $('#hook .q').style.transform = `translateY(${mix(14, 0, qk)}px)`;

    // panel shot + camera (cut on scene change, eased move inside a scene)
    Object.entries(imgs).forEach(([n, im]) => {
      const on = s.shot === n;
      im.style.opacity = on ? 1 : 0;
      if (on) {
        const k = ease(lin(t, cur.at + 0.3, cur.to - 0.2));
        const a = camXf(s.cam[0]), b = camXf(s.cam[1]);
        const z = mix(a[0], b[0], k), tx = mix(a[1], b[1], k), ty = mix(a[2], b[2], k);
        im.style.transform = `translate(${tx}px, ${ty}px) scale(${z})`;
      }
    });
    const pIn = eo(lin(t, order[1].at, order[1].at + 1.0));
    $('#panel').style.opacity = pIn;
    $("#panel").style.transform = `translateY(${mix(40, 0, pIn)}px) scale(1.12)`;
    $('#kicker').style.opacity = pIn * (1 - lin(t, order.find((o) => o.id === 'end').at - 0.4, order.find((o) => o.id === 'end').at));

    Object.entries(heads).forEach(([id, el]) => {
      const o = order.find((x) => x.id === id);
      const k = Math.min(eo(lin(t, o.at + 0.1, o.at + 0.7)), 1 - ease(lin(t, o.to - 0.3, o.to)));
      el.style.opacity = k.toFixed(3);
      el.style.transform = `translateY(${mix(-50, -80, 0) + mix(20, 0, k)}px)`;
    });

    // captions
    const line = VO.lines.find((l) => t >= l.start - 0.1 && t <= l.end + 0.25 && l.scene !== 'end');
    document.body.classList.toggle('center', cur.id === 'hook');
    const cap = $('#cap span');
    cap.textContent = line ? line.text : '';
    cap.style.display = line ? 'inline-block' : 'none';

    // end card
    const E = order.find((o) => o.id === 'end').at;
    const ek = ease(lin(t, E - 0.1, E + 0.6));
    $('#end').style.opacity = ek;
    const st = (el, t0) => { const k = eo(lin(t, t0, t0 + 0.6)); el.style.opacity = k; el.style.transform = `translateY(${mix(14, 0, k)}px)`; };
    st($('#end img'), E + 0.1); st($('#end .word'), E + 0.35); st($('#end .tag'), E + 0.9);
    st($('#end .row'), E + 1.6); st($('#end .url'), E + 2.2);
    $('#black').style.opacity = Math.max(1 - lin(t, 0, 0.4), lin(t, DURATION - 0.6, DURATION)).toFixed(3);
  };
  window.ready = () => Promise.all(Object.values(imgs).map((i) => i.decode().catch(() => 0)).concat([document.fonts.ready]));
  window.DURATION = DURATION;
})();
