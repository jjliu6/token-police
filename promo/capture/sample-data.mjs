// Fictional sample data for the promo captures — one consistent "Friday morning"
// for a developer who uses all six agents. Nothing here is real usage.
//
// The panel's clock is pinned to NOW (harness.mjs), so every derived label is
// stable: "Updated 09:36 AM", "Last success: 2m ago", "reset in 4d", and the burn
// verdicts that popup.js computes from `history` (verdict(), see popup.js).
//
//   agent        left  reset text (as each usage page words it)   burn verdict popup.js derives
//   Claude Code   62%  Tue 8:00 AM                 → reset in 4d    ~12%/day · lasts till reset
//   Codex         78%  Sun 4:20 PM                 → reset in 2d    ~5%/day · lasts till reset
//   Grok          34%  November 3, 2026 at 2:20 AM → reset in 4d    ~20%/day · ~41h to empty (before reset!)
//   Cursor        88%  (11 days)                   → reset in 11d   Barely used lately
//   Grok Bot      70%  4 days left                 → reset in 4d    ~10%/day · lasts till reset
//   Gemini        12%  Oct 31 at 12:00 AM          → reset in 14h   ~14%/day · lasts till reset
export const NOW = Date.parse('2026-10-30T09:38:00Z');
const H = 3600000;
const MIN = 60000;

// Usage weight for one hour (UTC): most of the burn happens in working hours,
// a little in the evening, almost none at night, less on weekends.
function hourWeight(t) {
  const d = new Date(t);
  const h = d.getUTCHours();
  const dow = d.getUTCDay();
  let w = h >= 15 || h < 1 ? 1 : h >= 1 && h < 4 ? 0.45 : h >= 13 ? 0.5 : 0.04;
  if (dow === 0 || dow === 6) w *= 0.35;
  return w;
}

// Hourly samples (the background auto-check runs hourly) from `from` to NOW.
// Each segment between resets falls from `start` to `end` in proportion to
// the cumulative usage weight, so the sparkline has a natural day/night rhythm.
function series(id, segments) {
  const out = [];
  for (const { from, to, start, end } of segments) {
    const pts = [];
    for (let t = from; t <= to; t += H) pts.push(t);
    if (pts[pts.length - 1] !== to) pts.push(to);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + hourWeight(pts[i - 1]) * ((pts[i] - pts[i - 1]) / H));
    const total = cum[cum.length - 1] || 1;
    pts.forEach((t, i) => {
      const pct = start - (start - end) * (cum[i] / total);
      out.push({ id, t, pct: Math.round(pct) });
    });
  }
  return out;
}

const WEEK_AGO = NOW - 7 * 24 * H;
const at = (iso) => Date.parse(iso);

// One weekly reset inside the 7-day window for each weekly limit; the last
// sample before a reset is that week's low point.
export function history() {
  const end = NOW - 2 * MIN; // newest sample = the last successful refresh
  return [
    ...series('claude-code', [
      { from: WEEK_AGO, to: at('2026-10-27T07:00:00Z'), start: 41, end: 9 },
      { from: at('2026-10-27T08:00:00Z'), to: end, start: 100, end: 62 },
    ]),
    ...series('codex', [
      { from: WEEK_AGO, to: at('2026-10-25T15:00:00Z'), start: 31, end: 18 },
      { from: at('2026-10-25T16:20:00Z'), to: end, start: 100, end: 78 },
    ]),
    ...series('grok-build', [
      { from: WEEK_AGO, to: at('2026-10-27T01:00:00Z'), start: 22, end: 3 },
      { from: at('2026-10-27T02:20:00Z'), to: NOW - 3 * MIN, start: 100, end: 34 },
    ]),
    ...series('cursor', [
      { from: WEEK_AGO, to: NOW - 3 * MIN, start: 90, end: 88 },
    ]),
    ...series('grok-bot', [
      { from: WEEK_AGO, to: at('2026-10-27T08:00:00Z'), start: 48, end: 30 },
      { from: at('2026-10-27T09:00:00Z'), to: NOW - 3 * MIN, start: 100, end: 70 },
    ]),
    ...series('gemini', [
      { from: WEEK_AGO, to: at('2026-10-23T23:00:00Z'), start: 26, end: 22 },
      { from: at('2026-10-24T00:00:00Z'), to: end, start: 100, end: 12 },
    ]),
  ];
}

export function agents() {
  return {
    'claude-code': {
      id: 'claude-code', name: 'Claude Code', scraped_at: NOW - 2 * MIN,
      limits: [
        { label: 'Weekly (All models)', percent_left: 62, resets_text: 'Tue 8:00 AM' },
        { label: 'Session (5h)', percent_left: 80, resets_text: 'in 2 hr 10 min' },
      ],
    },
    codex: {
      id: 'codex', name: 'Codex', scraped_at: NOW - 2 * MIN,
      limits: [
        { label: 'Weekly', percent_left: 78, resets_text: 'Sun 4:20 PM' },
        { label: '5-hour limit', percent_left: 55, resets_text: '' },
      ],
    },
    'grok-build': {
      id: 'grok-build', name: 'Grok', scraped_at: NOW - 3 * MIN,
      limits: [{ label: 'Weekly (SuperGrok)', percent_left: 34, resets_text: 'November 3, 2026 at 2:20 AM' }],
      breakdown: [{ name: 'Chat', percent: 38 }, { name: 'Grok Build', percent: 22 }, { name: 'Imagine', percent: 6 }],
    },
    cursor: {
      id: 'cursor', name: 'Cursor', scraped_at: NOW - 3 * MIN, plan: 'Pro',
      limits: [
        { label: 'Cursor Models', percent_left: 88, resets_text: '(11 days)' },
        { label: 'Other Models', percent_left: 92, resets_text: '' },
      ],
    },
    'grok-bot': {
      id: 'grok-bot', name: 'Grok Bot', scraped_at: NOW - 3 * MIN,
      limits: [{ label: 'Weekly', percent_left: 70, resets_text: '4 days left' }],
    },
    gemini: {
      id: 'gemini', name: 'Gemini', scraped_at: NOW - 2 * MIN,
      limits: [
        { label: 'Weekly', percent_left: 12, resets_text: 'Oct 31 at 12:00 AM' },
        { label: 'Current usage', percent_left: 74, resets_text: '' },
      ],
    },
  };
}

// Average remaining across the six cards (popup.js avgPct) = 57.
export const AVG = Math.round((62 + 78 + 34 + 88 + 70 + 12) / 6);

// Base chrome.storage.local for every scene. Scenes override pieces of it.
export function baseStore(over = {}) {
  return {
    uiLang: 'en',
    agents: agents(),
    history: history(),
    refresh: { running: false, started: NOW - 3 * MIN, results: {} },
    autoRefresh: true,
    autoRefreshInterval: 60,
    notifyLow: true,
    showHair: true,
    moveReminder: true,
    checkUpdates: true,
    updateCheck: { checkedAt: NOW - 2 * H, latest: '1.7.7' },
    // Just came back from a stretch: hair is full (quota hair = avg + boost).
    lastMovedAt: NOW - 1 * MIN,
    activityDoneAt: NOW - 1 * MIN,
    hairBoostPct: 100 - AVG,
    activityPick: null,
    activityOffer: null,
    ...over,
  };
}

export { H, MIN };
