// The film as data. `at` is the starting bar (bar = 2.4 s, 100 BPM — matches
// audio/make_score.py). Times inside a scene are seconds from the scene start.
// Boxes are CSS px in the captured 500×860 side panel (capture/out/*.json).
//   shots:    [t, name, 'cut'?]                 crossfade unless first-in-scene / 'cut'
//   cam:      [t, zoom, focusBox|null, 'cut'?]  eased between keys; null = whole panel
//   cards:    [in, out, who, line1, line2, line2In, {black}]   story card (blurs the screen)
//   captions: [in, out, kicker, headline, sub]  left-column type while the panel is on the right
//   notifs:   [in, out, title, body]            desktop notification banner (drawn)
(() => {
  const S0 = 1.06;            // panel CSS px → stage px (500×860 → 530×911.6)
  const HDR = 42;             // drawn side-panel header
  const PF_TOP = 63;          // (1080 − (911.6 + 42)) / 2
  const X_CENTER = 960, X_RIGHT = 1340;
  const box = (x, y, width, height) => ({ x, y, width, height });
  const BLACK = { black: true };

  // Camera targets (from capture/out/*.json)
  const B = {
    headerRight: box(240, 4, 255, 44),   // Updated · FR EN 中文 · ⚙ · Refresh
    grok: box(13, 261, 232, 214),
    grokBurnSpark: box(13, 362, 232, 84), // burn line + 7-day sparkline
    gemini: box(255, 485, 232, 199),
    dispFloat: box(12, 423, 476, 385),
    dispBottom: box(12, 560, 476, 240),   // repo, agents, "Dispatch 3"
    boardTop: box(8, 6, 484, 176),        // "Opened 3 tabs · prefill only, not sent" + tiles
    crossTop: box(12, 313, 476, 170),     // source · privacy · confirm
    crossBottom: box(12, 612, 476, 166),  // System recommend → Claude · Prefill Claude
    buddyA: box(162, 236, 176, 166),
    veil: box(140, 224, 220, 384),
    buddyC: box(162, 236, 176, 152),
    shareText: box(100, 440, 300, 180),   // pitch + privacy line + link
  };

  const LONG = [
    // 0 · Hook — black cards (0–7.2)
    { at: 0, bars: 3,
      cards: [[0.45, 3.95, '', 'Claude Code. Codex. Cursor. Grok. Gemini.', '', null, BLACK],
              [4.05, 7.05, '', 'Every one hides its quota in a different place.', 'Different pages. Different reset times.', 5.4, BLACK]] },

    // 1 · Token Police — the panel rises, then moves right (7.2–14.4)
    { at: 3, bars: 3, shots: [[0, 'dash-A']],
      cam: [[0, 1.0, null], [7.2, 1.03, null]],
      captions: [[2.1, 7.0, 'Token Police', 'Know how much AI coding quota you have left — at a glance.',
                  'Claude Code, Codex, Cursor, Grok, Grok Bot and Gemini — in one Chrome side panel.']] },

    // 2 · All quotas, one click (14.4–19.2)
    { at: 6, bars: 2, shots: [[0, 'dash-A'], [1.05, 'dash-B'], [2.9, 'dash-C']],
      cam: [[0, 1.03, null], [0.9, 1.72, B.headerRight], [2.8, 1.72, B.headerRight], [3.7, 1.0, null], [4.75, 1.0, null]],
      captions: [[0.15, 4.6, 'All quotas, one click', 'Stop tab-hopping between usage pages.',
                  'Weekly and short-term limits, plus exactly when each one resets.']] },

    // 3 · Mid-week → burn rate, then low-quota alerts (19.2–31.2)
    { at: 8, bars: 5, shots: [[0, 'dash-C']],
      cam: [[0, 1.0, null], [3.2, 1.0, null], [4.3, 1.85, B.grok], [6.2, 1.9, B.grokBurnSpark], [7.6, 1.92, B.grokBurnSpark],
            [8.7, 1.8, B.gemini], [11.95, 1.84, B.gemini]],
      cards: [[0, 3.3, 'Mid-week, mid-refactor', 'Is this week’s quota going to last?']],
      captions: [[3.4, 7.75, 'Burn rate & 7-day trend', 'Know before you run out.',
                  'It estimates how fast you’re spending — and warns when you’ll run out before the next reset.'],
                 [7.95, 11.9, 'Low-quota alerts', 'A heads-up below 15%.',
                  'A desktop notification when a tracked agent drops below 15%, and again below 5%.']],
      notifs: [[8.5, 11.7, 'Gemini: 12% left', 'Usage quota is running low. Resets Oct 31 at 12:00 AM.']] },

    // 4 · Which agent? → Dispatch (31.2–40.8)
    { at: 13, bars: 4,
      shots: [[0, 'dash-C'], [2.4, 'dispatch-T1', 'cut'], [3.0, 'dispatch-T2'], [3.6, 'dispatch-T3'], [4.2, 'dispatch-A'], [7.2, 'dispatch-B', 'cut']],
      cam: [[0, 1.0, null], [2.35, 1.0, null], [2.4, 1.48, B.dispFloat, 'cut'], [4.6, 1.5, B.dispFloat], [6.4, 1.62, B.dispBottom], [7.1, 1.62, B.dispBottom],
            [7.2, 1.52, B.boardTop, 'cut'], [9.55, 1.58, B.boardTop]],
      cards: [[0, 2.35, '', 'Which agent should take this one?', 'Why not all three?', 1.2]],
      captions: [[2.5, 9.5, 'Dispatch', 'One prompt, opened in all of them.',
                  'Filled in, not sent — you still hit Send yourself.']] },

    // 5 · Not sure? → Cross-check (40.8–48.0)
    { at: 17, bars: 3, shots: [[0, 'cross-A']],
      cam: [[0, 1.0, null], [2.2, 1.0, null], [3.2, 1.55, B.crossTop], [4.6, 1.55, B.crossTop], [5.6, 1.6, B.crossBottom], [7.15, 1.64, B.crossBottom]],
      cards: [[0, 2.2, '', 'Not sure the answer is right?']],
      captions: [[2.3, 7.05, 'Cross-check', 'Get a second opinion.',
                  'Hands the conversation to another AI of the same kind — by default, the one with the most quota left.']] },

    // 6 · Hours in the chair → the hair mascot (48.0–60.0)
    { at: 20, bars: 5,
      shots: [[0, 'hair-A'], [4.6, 'hair-B'], [7.2, 'veil-A', 'cut'], [9.45, 'veil-B'], [10.55, 'veil-C']],
      cam: [[0, 1.0, null], [2.5, 1.0, null], [3.5, 1.82, B.buddyA], [7.1, 1.9, B.buddyA],
            [7.2, 1.58, B.veil, 'cut'], [9.4, 1.62, B.veil], [10.4, 1.72, B.buddyC], [11.95, 1.78, B.buddyC]],
      cards: [[0, 2.5, '3 hours in', 'When did you last get up?']],
      captions: [[2.6, 7.05, 'The hair mascot', 'It thins while you sit…',
                  'Hair falls the longer you sit. Leftover quota is the cap.'],
                 [7.25, 11.9, 'The hair mascot', '…and makes you stretch.',
                  'The cards frost over. Pick a break, go do it, tap Done — the hair grows back.']] },

    // 7 · Private by design (60.0–64.8)
    { at: 25, bars: 2, shots: [[0, 'share-A']],
      cam: [[0, 1.0, null], [1.0, 1.62, B.shareText], [4.75, 1.68, B.shareText]],
      captions: [[0.2, 4.6, 'Private by design', 'Your usage data never leaves your browser.',
                  'No API keys, no account linking. Numbers stay in the browser’s local storage.']] },

    // 8 · End card (64.8–73.2)
    { at: 27, bars: 3.5, end: true, shots: [], cam: [[0, 1.0, null]] },
  ];

  // ── 30-second cut (index.html?cut=short) ──
  const SHORT = [
    { at: 0, bars: 2,
      cards: [[0.3, 4.65, '', 'Claude Code. Codex. Cursor. Grok. Gemini.', 'Every one hides its quota in a different place.', 1.6, BLACK]] },
    { at: 2, bars: 2, shots: [[0, 'dash-A']],
      cam: [[0, 1.0, null], [4.8, 1.03, null]],
      captions: [[1.7, 4.7, 'Token Police', 'Know how much AI coding quota you have left — at a glance.',
                  'Claude Code, Codex, Cursor, Grok, Grok Bot and Gemini — in one Chrome side panel.']] },
    { at: 4, bars: 2, shots: [[0, 'dash-C']],
      cam: [[0, 1.03, null], [1.0, 1.85, B.grok], [3.0, 1.9, B.grokBurnSpark], [4.75, 1.93, B.grokBurnSpark]],
      captions: [[0.2, 4.65, 'Burn rate & 7-day trend', 'Know before you run out.',
                  'It warns when you’ll run out before the next reset.']] },
    { at: 6, bars: 2, shots: [[0, 'dispatch-A'], [2.4, 'dispatch-B', 'cut']],
      cam: [[0, 1.5, B.dispFloat], [2.35, 1.6, B.dispBottom], [2.4, 1.52, B.boardTop, 'cut'], [4.75, 1.58, B.boardTop]],
      captions: [[0.2, 4.65, 'Dispatch', 'One prompt, opened in all of them.', 'Filled in, not sent — you still hit Send yourself.']] },
    { at: 8, bars: 2, shots: [[0, 'hair-A'], [1.2, 'hair-B'], [2.4, 'veil-A', 'cut'], [3.6, 'veil-C', 'cut']],
      cam: [[0, 1.8, B.buddyA], [2.35, 1.9, B.buddyA], [2.4, 1.58, B.veil, 'cut'], [3.55, 1.62, B.veil], [3.6, 1.72, B.buddyC, 'cut'], [4.75, 1.78, B.buddyC]],
      captions: [[0.2, 4.65, 'The hair mascot', 'It thins while you sit — and makes you stretch.',
                  'Pick a break, go do it, tap Done. The hair grows back.']] },
    { at: 10, bars: 2.5, end: true, shots: [], cam: [[0, 1.0, null]] },
  ];

  const CUT = new URLSearchParams(location.search).get('cut') || 'long';
  const SCENES = CUT === 'short' ? SHORT : LONG;
  const REVEAL = CUT === 'short' ? 4.8 : 7.2;

  window.PROMO = {
    CUT, S0, HDR, PF_TOP, X_CENTER, X_RIGHT, BAR: 2.4, SCENES, REVEAL,
    // the panel rises centered, then glides right to make room for the type
    GLIDE: CUT === 'short' ? [6.3, 7.3] : [8.9, 10.1],
    END_TIMES: CUT === 'short' ? { tag: 0.95, row: 2.0, url: 2.4, fine: 2.8 } : { tag: 0.95, row: 2.6, url: 3.1, fine: 3.6 },
  };
})();
