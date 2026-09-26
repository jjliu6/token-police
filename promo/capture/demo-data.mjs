// Fictional demo usage for the promo. Numbers are sample data, not real accounts.
import { NOW } from './harness.mjs';
const H = 3600000;
const lim = (label, pct, resets) => ({ label, percent_left: pct, resets_text: resets });
export function agents(over = {}) {
  const a = {
    'claude-code': { id: 'claude-code', name: 'Claude Code', scraped_at: NOW - 4 * 60000, plan: 'Max',
      limits: [lim('Weekly (All models)', 62, 'in 3 days'), lim('Session (5h)', 41, 'in 1 hr 58 min')] },
    codex: { id: 'codex', name: 'Codex', scraped_at: NOW - 4 * 60000, plan: 'Pro',
      limits: [lim('Weekly', 14, 'in 4 days'), lim('5-hour limit', 38, 'in 2 hr 10 min')] },
    'grok-build': { id: 'grok-build', name: 'Grok', scraped_at: NOW - 5 * 60000,
      limits: [lim('Weekly (SuperGrok)', 67, 'in 5 days')],
      breakdown: [{ name: 'Chat', percent: 16 }, { name: 'App Builder', percent: 10 }, { name: 'Automations', percent: 6 }, { name: 'Imagine', percent: 1 }] },
    cursor: { id: 'cursor', name: 'Cursor', scraped_at: NOW - 5 * 60000, plan: 'Pro+',
      limits: [lim('Cursor Models', 78, '(12 days)'), lim('Other Models', 55, '(12 days)')] },
    'grok-bot': { id: 'grok-bot', name: 'Grok Bot', scraped_at: NOW - 5 * 60000,
      limits: [lim('Weekly', 88, '2 days 6 hours left')] },
    gemini: { id: 'gemini', name: 'Gemini', scraped_at: NOW - 6 * 60000,
      limits: [lim('Weekly', 71, 'in 6 days'), lim('Current usage', 90, 'in 3 hr')] },
  };
  return { ...a, ...over };
}
// 7 days of history with a smooth burn; Codex burns fast (→ runs out before reset).
export function history(map) {
  const out = [];
  Object.values(map).forEach((a) => {
    const end = a.limits[0].percent_left;
    const rate = a.id === 'codex' ? 1.3 : a.id === 'claude-code' ? 0.35 : 0.18; // %/h
    for (let h = 7 * 24; h >= 0; h -= 3) {
      let pct = Math.min(100, end + rate * h * (1 + 0.25 * Math.sin(h / 7)));
      out.push({ id: a.id, t: NOW - h * H, pct: Math.round(pct) });
    }
  });
  return out;
}
export function store(extra = {}) {
  const map = agents();
  return { agents: map, history: history(map), lastMovedAt: NOW - 20 * 60000, checkUpdates: false, uiLang: 'en', ...extra };
}
