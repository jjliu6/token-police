// 产品列表（名字/颜色/额度页 URL）统一放在 agents.js
const ORDER = AGENTS.map((a) => a.id);
const META = {};
AGENTS.forEach((a) => { META[a.id] = a; });

// 抓取值来自目标网页的文本，进 innerHTML 前必须转义，防止页面内容注入面板
const esc = (s) => ('' + s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const fmtTok = (n) => {
  if (n == null) return '';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return '' + n;
};
const health = (p) => (p > 50 ? 'var(--good)' : p >= 20 ? 'var(--warn)' : 'var(--bad)');
const ago = (ts) => {
  if (!ts) return '';
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return t('justNow');
  if (m < 60) return t('minsAgo', { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return t('hoursAgo', { n: h });
  return t('daysAgo', { n: Math.round(h / 24) });
};

// 把各家五花八门的"重置时间"文字，统一解析成一个真实的日期
function parseReset(txt, now) {
  if (!txt) return null;
  const t = txt.trim();
  let m;
  // "(31 days)" 这种直接给了天数（Cursor）
  if ((m = t.match(/\((\d+)\s*days?\)/i))) { const d = new Date(now); d.setDate(d.getDate() + +m[1]); return d; }
  // "23 hours and 4 minutes left" / "2 days left"（Cursor 的 Grok Bot）
  if (/\bleft\b/i.test(t)) {
    const d = new Date(now); let hit = false, mm;
    if ((mm = t.match(/(\d+)\s*days?/i))) { d.setDate(d.getDate() + +mm[1]); hit = true; }
    if ((mm = t.match(/(\d+)\s*hours?/i))) { d.setHours(d.getHours() + +mm[1]); hit = true; }
    if ((mm = t.match(/(\d+)\s*min/i))) { d.setMinutes(d.getMinutes() + +mm[1]); hit = true; }
    if (hit) return d;
  }
  // "in 1 hr 58 min" / "in 2 days"（Claude 会话）
  if ((m = t.match(/^in\s+(.+)/i))) {
    const d = new Date(now), s = m[1]; let mm;
    if ((mm = s.match(/(\d+)\s*day/i))) d.setDate(d.getDate() + +mm[1]);
    if ((mm = s.match(/(\d+)\s*hr/i))) d.setHours(d.getHours() + +mm[1]);
    if ((mm = s.match(/(\d+)\s*min/i))) d.setMinutes(d.getMinutes() + +mm[1]);
    return d;
  }
  // 中文 "9月26日"
  if ((m = t.match(/(\d+)\s*月\s*(\d+)\s*日/))) {
    const d = new Date(now); d.setMonth(+m[1] - 1, +m[2]); d.setHours(0, 0, 0, 0);
    if (d < now) d.setFullYear(d.getFullYear() + 1);
    return d;
  }
  // "August 28, 2026 at 2:20 AM"
  if (/\d{4}/.test(t) && /[A-Za-z]{3,}/.test(t)) {
    const d = new Date(t.replace(/\s+at\s+/i, ' '));
    if (!isNaN(d.getTime())) return d;
  }
  // "Sep 6 at 8:29 AM"（月 日 + 时间，没有年份 —— Gemini）
  if ((m = t.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:\s+at\s+|,?\s+)(\d{1,2}):(\d{2})\s*([AP]M)?$/i))) {
    // now 可能是时间戳数字，也可能是 Date，先统一成 Date 再取年份
    const d = new Date(`${m[1]} ${m[2]}, ${new Date(now).getFullYear()} ${m[3]}:${m[4]} ${m[5] || ''}`);
    if (!isNaN(d.getTime())) {
      if (d < now - 86400000) d.setFullYear(d.getFullYear() + 1); // 跨年：12月看到 "Jan 3"
      return d;
    }
  }
  // "Sat 5:00 PM"（星期几 + 时间）
  if ((m = t.match(/(Sun|Mon|Tue|Wed|Thu|Fri|Sat)[a-z]*\s+(\d{1,2}):(\d{2})\s*([AP]M)?/i))) {
    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const target = days.indexOf(m[1].toLowerCase().slice(0, 3));
    let h = +m[2]; const ap = (m[4] || '').toUpperCase();
    if (ap === 'PM' && h < 12) h += 12; if (ap === 'AM' && h === 12) h = 0;
    const d = new Date(now); d.setHours(h, +m[3], 0, 0);
    let diff = (target - d.getDay() + 7) % 7;
    if (diff === 0 && d <= now) diff = 7;
    d.setDate(d.getDate() + diff);
    return d;
  }
  // "6:20 PM"（只有时间）
  if ((m = t.match(/^(\d{1,2}):(\d{2})\s*([AP]M)?$/i))) {
    let h = +m[1]; const ap = (m[3] || '').toUpperCase();
    if (ap === 'PM' && h < 12) h += 12; if (ap === 'AM' && h === 12) h = 0;
    const d = new Date(now); d.setHours(h, +m[2], 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1);
    return d;
  }
  return null;
}

// "reset in X 天 / X 小时"
function untilText(d, now) {
  if (!d) return null;
  const ms = d - now;
  if (ms <= 0) return t('resettingSoon');
  const days = ms / 86400000;
  if (days >= 1) return t('resetInDays', { n: Math.round(days) });
  const hrs = ms / 3600000;
  if (hrs >= 1) return t('resetInHours', { n: Math.round(hrs) });
  return t('resetInMins', { n: Math.max(1, Math.round(ms / 60000)) });
}

// 科学的判断：要有足够历史、并且拿"预计见底时间"和"真实重置时间"比，才敢说够不够
function verdict(seg0, resetDate, now) {
  if (!seg0 || seg0.length < 3) return { text: t('burnCollecting'), color: 'var(--muted)' };
  seg0 = seg0.slice().sort((a, b) => a.t - b.t);
  let start = 0;
  for (let i = 1; i < seg0.length; i++) { if (seg0[i].pct > seg0[i - 1].pct + 2) start = i; } // 涨上去=重置过
  const seg = seg0.slice(start);
  const a = seg[0], b = seg[seg.length - 1];
  const span = (b.t - a.t) / 3600000; // 小时
  if (seg.length < 3 || span < 4) return { text: t('burnCollecting'), color: 'var(--muted)' };
  const perH = (a.pct - b.pct) / span;
  const perDay = perH * 24;
  if (perH < 0.1) return { text: t('burnBarely'), color: 'var(--ink2)' };
  const h2z = b.pct / perH; // 还能撑多少小时到 0
  const h2r = resetDate ? (resetDate - now) / 3600000 : null; // 离重置多少小时
  if (h2r != null && h2z > h2r) return { text: t('burnTillReset', { n: perDay.toFixed(0) }), color: 'var(--good)' };
  const eta = h2z < 48 ? t('burnEmptyHours', { n: Math.round(h2z) }) : t('burnEmptyDays', { n: Math.round(h2z / 24) });
  const color = h2r != null ? 'var(--bad)' : (h2z < 24 ? 'var(--bad)' : h2z < 72 ? 'var(--warn)' : 'var(--ink2)');
  return { text: t('burnLine', { n: perDay.toFixed(0), eta }) + (h2r != null ? t('burnBefore') : ''), color };
}

// 各产品的小标记（简约几何图形，不是官方 logo 的精确复制）
function logo(id, c) {
  if (id === 'claude-code') {
    let ls = '';
    for (let i = 0; i < 12; i++) { const a = i * 30 * Math.PI / 180; ls += `<line x1="${(10 + 3.6 * Math.cos(a)).toFixed(1)}" y1="${(10 + 3.6 * Math.sin(a)).toFixed(1)}" x2="${(10 + 8.4 * Math.cos(a)).toFixed(1)}" y2="${(10 + 8.4 * Math.sin(a)).toFixed(1)}"/>`; }
    return `<svg width="20" height="20"><g stroke="${c}" stroke-width="1.4" stroke-linecap="round">${ls}</g></svg>`;
  }
  if (id === 'codex') return `<svg width="20" height="20" fill="none" stroke="${c}" stroke-width="1.6"><polygon points="10,3 16,6.5 16,13.5 10,17 4,13.5 4,6.5"/><circle cx="10" cy="10" r="2.2"/></svg>`;
  if (id === 'grok-build') return `<svg width="20" height="20" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round"><rect x="3.5" y="3.5" width="13" height="13" rx="4"/><line x1="7.5" y1="12.5" x2="12.5" y2="7.5"/></svg>`;
  if (id === 'cursor') return `<svg width="20" height="20" fill="${c}"><path d="M6 4 L15 10 L10.6 11 L13 15.6 L11 16.6 L8.6 12 L6 15 Z"/></svg>`;
  // 小机器人头：圆角矩形 + 两只眼睛 + 天线
  if (id === 'grok-bot') return `<svg width="20" height="20" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round"><rect x="3.5" y="6" width="13" height="10" rx="3"/><line x1="10" y1="3" x2="10" y2="6"/><circle cx="7.5" cy="11" r="1.1" fill="${c}" stroke="none"/><circle cx="12.5" cy="11" r="1.1" fill="${c}" stroke="none"/></svg>`;
  // 四角星
  if (id === 'gemini') return `<svg width="20" height="20" fill="${c}"><path d="M10 2 C10 6.4 13.6 10 18 10 C13.6 10 10 13.6 10 18 C10 13.6 6.4 10 2 10 C6.4 10 10 6.4 10 2 Z"/></svg>`;
  return `<span style="width:10px;height:10px;border-radius:3px;background:${c};display:inline-block"></span>`;
}

const BD_COLOR = {
  Chat: '#5ccf9e',
  'App Builder': '#6E9BF5',
  Automations: '#e6b45c',
  Imagine: '#e57373',
  Voice: '#B78CF0',
  API: '#aab2c0',
};
const BD_SHORT_KEY = {
  Chat: 'chat',
  'App Builder': 'build',
  Automations: 'auto',
  Imagine: 'imagine',
  Voice: 'voice',
  API: 'api',
};
const LIMIT_KEYS = {
  'Weekly (All models)': 'weeklyAll',
  'Weekly 额度 (All models)': 'weeklyAll',
  'Session (5h)': 'session5h',
  '当前会话 (5h)': 'session5h',
  Weekly: 'weekly',
  'Weekly 额度': 'weekly',
  '5-hour limit': 'fiveHour',
  '5 小时额度': 'fiveHour',
  'Weekly (SuperGrok)': 'weeklyGrok',
  'Weekly 额度 (SuperGrok)': 'weeklyGrok',
  'Cursor Models': 'cursorModels',
  'Other Models': 'otherModels',
  'Current usage': 'currentUsage',
  当前用量: 'currentUsage',
  'This period': 'thisPeriod',
  本周期: 'thisPeriod',
};

function limLabel(s) {
  const key = LIMIT_KEYS[s];
  return key ? t(key) : esc(s);
}

function bdShort(name) {
  const key = BD_SHORT_KEY[name];
  return key ? t(key) : esc(name);
}

function breakdownBar(bd) {
  if (!bd || !bd.length) return '';
  const segs = bd.map((x) => {
    const c = BD_COLOR[x.name] || '#8a92a0';
    const p = Math.max(0, Math.min(100, +x.percent || 0));
    return `<i title="${esc(x.name)} ${p}%" style="width:${p}%;background:${c}"></i>`;
  }).join('');
  const legend = bd.map((x) => `${bdShort(x.name)} ${Math.max(0, Math.min(100, +x.percent || 0))}%`).join(' · ');
  return `<div class="barwrap"><div class="t"><span>${legend}</span></div>
    <div class="bar stacked">${segs}</div></div>`;
}

// 近 7 天剩余额度的迷你走势图（额度重置会画出"锯齿"，一眼看出使用节奏）
function sparkline(entries, color) {
  const now = Date.now();
  const from = now - 7 * 86400000;
  const pts = (entries || [])
    .filter((e) => e && e.t >= from && e.pct != null)
    .slice()
    .sort((a, b) => a.t - b.t);
  if (pts.length < 2) return '';
  const W = 100, H = 26, P = 2;
  const t0 = pts[0].t;
  const span = Math.max(pts[pts.length - 1].t - t0, 1);
  const xy = pts.map((e) => [
    ((e.t - t0) / span * W).toFixed(1),
    (P + (100 - e.pct) / 100 * (H - 2 * P)).toFixed(1),
  ]);
  const line = xy.map((p) => p.join(',')).join(' ');
  const area = `0,${H} ${line} ${W},${H}`;
  return `<div class="spark" title="${t('spark7d')}">
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <polygon points="${area}" fill="${color}" fill-opacity="0.10"/>
      <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2"
        vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>
    </svg></div>`;
}

function ring(pct, color) {
  const R = 28, C = 2 * Math.PI * R, off = C * (1 - (pct || 0) / 100);
  return `<svg width="66" height="66" viewBox="0 0 66 66">
    <circle cx="33" cy="33" r="${R}" fill="none" stroke="var(--track)" stroke-width="6"/>
    <circle cx="33" cy="33" r="${R}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round"
      stroke-dasharray="${C}" stroke-dashoffset="${off}" transform="rotate(-90 33 33)"/>
  </svg>`;
}

// ---- 发量：画一个会谢顶的人，不是色块拼图 ----
// 24 缕是手摆的头发，从脑顶先掉、刘海最后掉，看起来像发际线往后推。
const HAIR_N = 24;
const HAIR_FILL = '#c9842c';
const HAIR_EDGE = '#7a4a14';

// 每一缕：[根x, 根y, 控制点x, 控制点y, 梢x, 梢y, 宽度]
// 0–7 刘海（最后掉）  8–15 两侧  16–23 头顶（最先掉）
const HAIR_LOCKS = [
  [29, 41, 27, 49, 27, 55, 4.0],
  [33, 39, 32, 49, 31, 56, 4.2],
  [37, 38, 37, 49, 36, 57, 4.4],
  [43, 38, 43, 49, 44, 57, 4.4],
  [47, 39, 48, 49, 49, 56, 4.2],
  [51, 41, 53, 49, 53, 55, 4.0],
  [35, 40, 34, 48, 33, 54, 3.6],
  [45, 40, 46, 48, 47, 54, 3.6],
  [22, 44, 18, 48, 17, 56, 3.8],
  [20, 40, 15, 42, 14, 50, 3.8],
  [21, 35, 16, 34, 14, 40, 4.0],
  [25, 32, 20, 30, 17, 34, 4.0],
  [58, 44, 62, 48, 63, 56, 3.8],
  [60, 40, 65, 42, 66, 50, 3.8],
  [59, 35, 64, 34, 66, 40, 4.0],
  [55, 32, 60, 30, 63, 34, 4.0],
  [30, 30, 28, 22, 26, 18, 5.2],
  [35, 28, 34, 20, 33, 16, 5.4],
  [40, 27, 40, 19, 40, 15, 5.6],
  [45, 28, 46, 20, 47, 16, 5.4],
  [50, 30, 52, 22, 54, 18, 5.2],
  [37, 29, 36, 21, 35, 17, 4.6],
  [43, 29, 44, 21, 45, 17, 4.6],
  [40, 31, 40, 24, 40, 19, 5.0],
];

function hairSet(pct) {
  const shown = Math.round(Math.max(0, Math.min(100, pct == null ? 0 : pct)) / 100 * HAIR_N);
  const on = new Set();
  for (let k = 0; k < shown; k++) on.add(k);
  return on;
}

function hairLockPath(x0, y0, cx, cy, x1, y1, w) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len * w, py = dx / len * w;
  const n = (v) => v.toFixed(1);
  return `M${n(x0)} ${n(y0)} Q${n(cx + px)} ${n(cy + py)} ${n(x1)} ${n(y1)} Q${n(cx - px)} ${n(cy - py)} ${n(x0)} ${n(y0)} Z`;
}

function hairLockEl(i, visible) {
  const [x0, y0, cx, cy, x1, y1, w] = HAIR_LOCKS[i];
  return `<path class="h${visible ? '' : ' off'}" data-i="${i}" style="--i:${i}" d="${hairLockPath(x0, y0, cx, cy, x1, y1, w)}" fill="${HAIR_FILL}" stroke="${HAIR_EDGE}" stroke-width="1.05" stroke-linejoin="round"/>`;
}

function mouthMood(pct) {
  if (pct > 50) return 'smile';
  if (pct >= 20) return 'flat';
  return 'frown';
}

function mouthPath(pct) {
  if (pct > 50) return 'M33 62 Q40 67.5 47 62';
  if (pct >= 20) return 'M34 63 H46';
  return 'M33 64.2 Q40 60.2 47 64.2';
}

function faceMarkup(pct) {
  const mood = mouthMood(pct);
  const brows = mood === 'frown'
    ? '<path d="M27 48.2 Q31 46.6 35 48.6" fill="none" stroke="#3a2a20" stroke-width="1.6" stroke-linecap="round"/><path d="M53 48.2 Q49 46.6 45 48.6" fill="none" stroke="#3a2a20" stroke-width="1.6" stroke-linecap="round"/>'
    : '<path d="M27 48 Q31 46.4 35 48.2" fill="none" stroke="#3a2a20" stroke-width="1.55" stroke-linecap="round"/><path d="M53 48 Q49 46.4 45 48.2" fill="none" stroke="#3a2a20" stroke-width="1.55" stroke-linecap="round"/>';
  const eyes = '<ellipse cx="31" cy="53.2" rx="4.1" ry="4.8" fill="#fff"/><ellipse cx="49" cy="53.2" rx="4.1" ry="4.8" fill="#fff"/><ellipse cx="31.4" cy="53.6" rx="2.3" ry="2.7" fill="#3a2416"/><ellipse cx="49.4" cy="53.6" rx="2.3" ry="2.7" fill="#3a2416"/><circle cx="30.4" cy="52.2" r="1" fill="#fff"/><circle cx="48.4" cy="52.2" r="1" fill="#fff"/>';
  return `${brows}${eyes}<ellipse cx="24.5" cy="58.5" rx="4.2" ry="2.1" fill="#f0a090" opacity=".45"/><ellipse cx="55.5" cy="58.5" rx="4.2" ry="2.1" fill="#f0a090" opacity=".45"/><path d="M39.2 57.6 Q40 59.2 40.8 57.6" fill="none" stroke="#d4a07a" stroke-width="1.3" stroke-linecap="round"/><path class="m" data-mood="${mood}" d="${mouthPath(pct)}" fill="none" stroke="#3a2a20" stroke-width="2.1" stroke-linecap="round"/>`;
}

function hairHead(pct) {
  const on = hairSet(pct);
  let locks = '';
  for (let i = 16; i < HAIR_N; i++) locks += hairLockEl(i, on.has(i));
  for (let i = 8; i < 16; i++) locks += hairLockEl(i, on.has(i));
  for (let i = 0; i < 8; i++) locks += hairLockEl(i, on.has(i));
  return `<svg viewBox="0 0 80 96" aria-hidden="true">
    <path d="M26 76 C26 70 31 68 40 72 C49 68 54 70 54 76 L52 96 H28 Z" fill="#3a4c68" stroke="#2a3548" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M34 78 C36 83 44 83 46 78" fill="none" stroke="#2a3548" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M28.5 77.5 C31 72.5 34.5 70.5 40 74 C45.5 70.5 49 72.5 51.5 77.5" fill="none" stroke="#5CD6B3" stroke-width="2.3" stroke-linecap="round"/>
    <circle cx="40" cy="86" r="5.2" fill="#101218"/>
    <circle cx="40" cy="86" r="4.15" fill="#5CD6B3"/>
    <path fill="#101218" d="M40 82.4l1.5 3.3 3.3 1.5-3.3 1.5-1.5 3.3-1.5-3.3-3.3-1.5 3.3-1.5z"/>
    <path d="M35 71 h10 v9 H35 Z" fill="#f3c29a"/>
    <ellipse cx="20" cy="52" rx="5.2" ry="7.2" fill="#f3c29a" stroke="#c47a4a" stroke-width="1.8"/>
    <ellipse cx="60" cy="52" rx="5.2" ry="7.2" fill="#f3c29a" stroke="#c47a4a" stroke-width="1.8"/>
    <ellipse cx="40" cy="52" rx="22" ry="23" fill="#f3c29a" stroke="#c47a4a" stroke-width="2.15"/>
    <ellipse cx="40" cy="40" rx="9" ry="4.2" fill="#fff" opacity=".22"/>
    <g class="locks">${locks}</g>
    <g class="face">${faceMarkup(pct)}</g>
  </svg>`;
}

// 所有显示中的产品的平均剩余%（只算有数据的），没有任何数据就返回 null
function avgPct(map, ids) {
  let sum = 0, n = 0;
  ids.forEach((id) => {
    const a = map[id];
    const p = a && a.limits && a.limits[0] ? a.limits[0].percent_left : null;
    if (p != null) { sum += p; n++; }
  });
  return n ? Math.round(sum / n) : null;
}

// 每个发量阶段从一大池子里随机抽 2–3 个活动；同一轮提醒里保持不变
// 到点才催：默认每 2 小时；近 2 小时烧掉超过 10% 则改成 1 小时
var SIT_INTERVAL_MS = 2 * 3600000;
var SIT_INTERVAL_BURN_MS = 3600000;
var MOVE_WINDOW_MS = 2 * 3600000;
var MOVE_DROP_PCT = 10;
var ACT_SNOOZE_MS = SIT_INTERVAL_MS;

function activityStage(pct) {
  if (pct > 50) return 'high';
  if (pct >= 20) return 'mid';
  return 'low';
}

function activityIds(stage) {
  const pool = (typeof ACTS !== 'undefined' && ACTS[stage]) || [];
  return pool.slice();
}

function actLabel(id) {
  const a = typeof ACT_BY_ID !== 'undefined' ? ACT_BY_ID[id] : null;
  if (a) return a[currentLang()] || a.en;
  return t(id);
}

function shufflePick(ids, n, rnd) {
  rnd = typeof rnd === 'function' ? rnd : Math.random;
  n = Math.max(0, Math.min(n, ids.length));
  const copy = ids.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy.slice(0, n);
}

function makeActivityOffer(stage, rnd) {
  rnd = typeof rnd === 'function' ? rnd : Math.random;
  const pool = activityIds(stage);
  const n = rnd() < 0.35 ? 2 : 3;
  return { stage, ids: shufflePick(pool, Math.min(n, pool.length), rnd) };
}

function offerFits(offer, stage) {
  const pool = activityIds(stage);
  if (!offer || offer.stage !== stage || !offer.ids || !offer.ids.length) return false;
  if (offer.ids.length < 2 || offer.ids.length > 3) return false;
  return offer.ids.every((id) => pool.indexOf(id) !== -1);
}

function currentOffer(pct, pick, snoozed, stored) {
  if (pct == null || snoozed || pick) return stored || null;
  const stage = activityStage(pct);
  if (offerFits(stored, stage)) return stored;
  const offer = makeActivityOffer(stage);
  chrome.storage.local.set({ activityOffer: offer });
  return offer;
}

function actsSnoozed(doneAt, now) {
  now = now == null ? Date.now() : now;
  return !!(doneAt && now - doneAt < ACT_SNOOZE_MS);
}

function recentSitBurn(hist, id, now) {
  const seg = (hist || []).filter((h) => h.id === id && h.t >= now - MOVE_WINDOW_MS && h.t <= now)
    .sort((x, y) => x.t - y.t);
  if (seg.length < 2) return 0;
  let start = 0;
  for (let i = 1; i < seg.length; i++) { if (seg[i].pct > seg[i - 1].pct + 2) start = i; }
  const a = seg[start], b = seg[seg.length - 1];
  return a === b ? 0 : a.pct - b.pct;
}

function sitIntervalMs(hist, ids, now) {
  now = now == null ? Date.now() : now;
  const hard = (ids || []).some((id) => recentSitBurn(hist, id, now) > MOVE_DROP_PCT);
  return hard ? SIT_INTERVAL_BURN_MS : SIT_INTERVAL_MS;
}

function sitDue(lastMovedAt, pick, now, interval) {
  now = now == null ? Date.now() : now;
  // 跟 sitHairPct 一样：0 / 负数当没传，避免时钟已到期但头发还停在 99%。
  interval = interval == null || interval <= 0 ? SIT_INTERVAL_MS : interval;
  if (pick) return true;
  if (!lastMovedAt) return false;
  return now - lastMovedAt >= interval;
}

// 遮罩和「做完头发长回来」只在显示发量真的掉光时出现。
// 额度还剩 99% 就催复原是错的：活动档位必须看头发，不能看额度。
var RESTORE_HAIR_MAX = 0;

function restoreDue(hairPct, clockDue, pick) {
  if (pick) return true;
  if (!clockDue || hairPct == null) return false;
  return hairPct <= RESTORE_HAIR_MAX;
}

// 掉发引擎：显示发量 = min(额度发量, 久坐时钟)
//
// 额度发量 = avg + boost。做完运动把 boost 补到 100-avg，显示先回到 100%；
// 之后平均额度每掉 1%，头发也掉 1%。6 个产品里只有一个 2 小时烧掉 10% 时，
// 平均额度只掉 ~1.7%，24 缕里可能一根都不掉——所以单靠额度对不齐 1 小时提醒。
//
// 久坐时钟：从 lastMovedAt 起在当前 sit interval 内从 100 线性掉到 0。
//   平时 2 小时掉完 → 每缕 ≈ 5 分钟（24 缕 / 7200s）
//   近 2 小时某个产品烧掉 >10% 则 1 小时掉完 → 每缕 ≈ 2.5 分钟
// 催你动的那一刻显示发量一定是 0（restoreDue 再卡一道：头发还在就不催复原）。
// 活动池按显示发量分档，所以催的时候一定是 low（离开座位），不会在 99% 时甩「坐着绷小腿」。
// 额度仍是上限：刚打开、还没做过运动时，发量不会高于当前平均剩余。
function restoreHairBoost(avg) {
  if (avg == null) return 0;
  return Math.max(0, Math.min(100, 100 - avg));
}

function clampHairBoost(avg, boost) {
  if (avg == null) return 0;
  return Math.min(Math.max(0, boost || 0), restoreHairBoost(avg));
}

function sitHairPct(lastMovedAt, interval, now) {
  now = now == null ? Date.now() : now;
  interval = interval == null || interval <= 0 ? SIT_INTERVAL_MS : interval;
  if (!lastMovedAt) return 100;
  const elapsed = now - lastMovedAt;
  if (elapsed <= 0) return 100;
  if (elapsed >= interval) return 0;
  return 100 * (1 - elapsed / interval);
}

function displayHairPct(avg, boost, lastMovedAt, interval, now) {
  if (avg == null) return null;
  const quota = Math.max(0, Math.min(100, Math.round(avg + clampHairBoost(avg, boost))));
  const sit = Math.round(sitHairPct(lastMovedAt, interval, now));
  return Math.max(0, Math.min(quota, sit));
}

// 面板开着时按「每 1% 久坐时钟」重绘，24 缕会一根根掉，到点遮罩也会自己出现。
// 1 小时间隔 → 36s 一跳；2 小时 → 72s。已经到期就不再排。
var hairTickTimer = null;
function nextSitHairTickMs(lastMovedAt, interval, now) {
  now = now == null ? Date.now() : now;
  interval = interval == null || interval <= 0 ? SIT_INTERVAL_MS : interval;
  if (!lastMovedAt) return 0;
  const untilDue = lastMovedAt + interval - now;
  if (untilDue <= 0) return 0;
  const step = Math.max(1000, Math.round(interval / 100));
  return Math.max(200, Math.min(untilDue, step));
}

function scheduleHairTick(lastMovedAt, interval, now) {
  if (typeof setTimeout !== 'function' || typeof clearTimeout !== 'function') return;
  if (hairTickTimer != null) {
    clearTimeout(hairTickTimer);
    hairTickTimer = null;
  }
  const wait = nextSitHairTickMs(lastMovedAt, interval, now);
  if (wait <= 0) return;
  hairTickTimer = setTimeout(render, wait);
}

// 点「完成」后播一次长发闪光：逐缕长回 + 星点。只在这一次重绘里触发，重开面板不重播。
var hairRegrowFx = false;
var hairRegrowTimer = null;
var HAIR_REGROW_MS = 2200;

function growFxMarkup() {
  const bits = [
    [18, 16, 0.04, 1],
    [74, 12, 0.14, 1.15],
    [48, 4, 0.26, 0.85],
    [8, 38, 0.2, 1.05],
    [90, 34, 0.32, 0.9],
    [28, 8, 0.4, 1.2],
    [64, 20, 0.08, 0.75],
    [42, 30, 0.48, 1],
    [80, 50, 0.36, 0.8],
    [22, 52, 0.44, 0.7],
  ];
  const dots = bits.map(([l, t, d, s]) =>
    `<i style="left:${l}%;top:${t}%;--d:${d}s;--s:${s}"></i>`
  ).join('');
  return `<span class="grow-fx" aria-hidden="true">${dots}</span>`;
}

function stopHairRegrow(box) {
  if (hairRegrowTimer != null && typeof clearTimeout === 'function') {
    clearTimeout(hairRegrowTimer);
    hairRegrowTimer = null;
  }
  if (!box) return;
  if (box.classList && box.classList.remove) box.classList.remove('regrow');
  const fx = box.querySelector ? box.querySelector('.grow-fx') : null;
  if (fx && fx.parentNode) fx.parentNode.removeChild(fx);
  const buddy = document.getElementById('buddy');
  if (buddy && buddy.style && !(buddy.classList && buddy.classList.contains && buddy.classList.contains('dragging'))) {
    buddy.style.transition = buddyGlide();
  }
}

function startHairRegrow(box) {
  if (!box) return;
  if (box.classList && box.classList.add) box.classList.add('regrow');
  const buddy = document.getElementById('buddy');
  if (buddy && buddy.style && buddy.getBoundingClientRect) {
    const r = buddy.getBoundingClientRect();
    buddy.style.left = r.left + 'px';
    buddy.style.top = r.top + 'px';
    buddy.style.right = 'auto';
    buddy.style.transition = 'none';
  }
  const strands = box.querySelectorAll ? box.querySelectorAll('.h') : null;
  if (strands && strands.forEach) {
    strands.forEach((el) => {
      if (el.style && el.style.setProperty) el.style.setProperty('--i', String(+el.dataset.i || 0));
    });
  }
  if (box.querySelector && !box.querySelector('.grow-fx') && box.insertAdjacentHTML) {
    box.insertAdjacentHTML('beforeend', growFxMarkup());
  }
  if (hairRegrowTimer != null && typeof clearTimeout === 'function') clearTimeout(hairRegrowTimer);
  if (typeof setTimeout === 'function') {
    hairRegrowTimer = setTimeout(() => {
      hairRegrowTimer = null;
      stopHairRegrow(box);
    }, HAIR_REGROW_MS);
  }
  blurtSay(100, false, null, 'regrow');
}

function completeActivity() {
  hairRegrowFx = true;
  chrome.storage.local.get(['agents', 'enabledAgents'], (res) => {
    const en = res.enabledAgents || {};
    const shown = ORDER.filter((id) => en[id] !== false);
    const avg = avgPct(res.agents || {}, shown);
    chrome.storage.local.set({
      activityPick: null,
      activityDoneAt: Date.now(),
      lastMovedAt: Date.now(),
      hairBoostPct: restoreHairBoost(avg),
      activityOffer: null,
    });
  });
}

function buddyBounds(buddy) {
  const w = (buddy && buddy.offsetWidth) || 176;
  const h = (buddy && buddy.offsetHeight) || 160;
  const vw = (typeof window !== 'undefined' && window.innerWidth) || 360;
  const vh = (typeof window !== 'undefined' && window.innerHeight) || 640;
  return {
    minX: 8,
    minY: 8,
    maxX: Math.max(8, vw - w - 8),
    maxY: Math.max(8, vh - h - 8),
  };
}

function clampBuddy(x, y, buddy) {
  const b = buddyBounds(buddy);
  return {
    x: Math.max(b.minX, Math.min(x, b.maxX)),
    y: Math.max(b.minY, Math.min(y, b.maxY)),
  };
}

function placeBuddy(x, y) {
  const buddy = document.getElementById('buddy');
  if (!buddy || !buddy.style) return;
  const p = clampBuddy(x, y, buddy);
  buddy.style.left = p.x + 'px';
  buddy.style.top = p.y + 'px';
  buddy.style.right = 'auto';
}

// 乱逛：朝一个方向做大跨度滑行，碰到边就反弹。旧逻辑每 4.8s 只抖 ±18×±14，
// 看起来像在原地磨蹭。最短步长约是短边的 38%，最长约是对角线的 85%。
// 滑行约 7.2s（CSS 里同期），8.4s 开下一程，留一秒落稳。2.4s/2.8s 会整屏闪过去。
var WANDER_MIN_RATIO = 0.38;
var WANDER_MAX_RATIO = 0.85;
var WANDER_GLIDE_MS = 7200;
var WANDER_INTERVAL_MS = 8400;

function wanderStep(x, y, bounds, rnd, heading) {
  rnd = typeof rnd === 'function' ? rnd : Math.random;
  bounds = bounds || { minX: 8, minY: 8, maxX: 176, maxY: 472 };
  const spanX = Math.max(0, bounds.maxX - bounds.minX);
  const spanY = Math.max(0, bounds.maxY - bounds.minY);
  if (spanX < 1 && spanY < 1) {
    return { x: bounds.minX, y: bounds.minY, heading: heading || 0 };
  }
  const short = Math.max(1, Math.min(spanX || spanY, spanY || spanX));
  const minDist = Math.max(48, short * WANDER_MIN_RATIO);
  const maxDist = Math.max(minDist + 8, Math.hypot(spanX, spanY) * WANDER_MAX_RATIO);
  let ang = heading;
  if (ang == null || !isFinite(ang)) ang = rnd() * Math.PI * 2;
  else if (rnd() < 0.28) ang = rnd() * Math.PI * 2;
  else ang += (rnd() - 0.5) * 1.15;
  const dist = minDist + rnd() * (maxDist - minDist);
  let nx = x + Math.cos(ang) * dist;
  let ny = y + Math.sin(ang) * dist;
  if (nx < bounds.minX) { nx = bounds.minX + (bounds.minX - nx); ang = Math.PI - ang; }
  if (nx > bounds.maxX) { nx = bounds.maxX - (nx - bounds.maxX); ang = Math.PI - ang; }
  if (ny < bounds.minY) { ny = bounds.minY + (bounds.minY - ny); ang = -ang; }
  if (ny > bounds.maxY) { ny = bounds.maxY - (ny - bounds.maxY); ang = -ang; }
  nx = Math.max(bounds.minX, Math.min(bounds.maxX, nx));
  ny = Math.max(bounds.minY, Math.min(bounds.maxY, ny));
  return { x: nx, y: ny, heading: ang };
}

function wanderBuddy() {
  const buddy = document.getElementById('buddy');
  if (!buddy || buddy.hidden || !buddy.getBoundingClientRect) return;
  if (buddy.classList && buddy.classList.contains && buddy.classList.contains('dragging')) return;
  if (hairRegrowTimer != null) return;
  const w = typeof window !== 'undefined' ? window : {};
  const r = buddy.getBoundingClientRect();
  const fromX = w.__buddyTarget && typeof w.__buddyTarget.x === 'number' ? w.__buddyTarget.x : r.left;
  const fromY = w.__buddyTarget && typeof w.__buddyTarget.y === 'number' ? w.__buddyTarget.y : r.top;
  const next = wanderStep(fromX, fromY, buddyBounds(buddy), Math.random, w.__buddyHeading);
  w.__buddyHeading = next.heading;
  w.__buddyTarget = { x: next.x, y: next.y };
  placeBuddy(next.x, next.y);
}

function buddyGlide() {
  return `left ${WANDER_GLIDE_MS}ms cubic-bezier(.4,.08,.2,1), top ${WANDER_GLIDE_MS}ms cubic-bezier(.4,.08,.2,1)`;
}

function initBuddy(pos) {
  const buddy = document.getElementById('buddy');
  if (!buddy || (buddy.dataset && buddy.dataset.ready)) return;
  if (buddy.dataset) buddy.dataset.ready = '1';
  if (buddy.style) buddy.style.transition = buddyGlide();
  if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') placeBuddy(pos.x, pos.y);
  if (buddy.addEventListener) {
    let dragging = false, ox = 0, oy = 0;
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      if (buddy.classList && buddy.classList.remove) buddy.classList.remove('dragging');
      if (buddy.style) buddy.style.transition = buddyGlide();
      const r = buddy.getBoundingClientRect ? buddy.getBoundingClientRect() : null;
      if (r) {
        const w = typeof window !== 'undefined' ? window : {};
        w.__buddyTarget = { x: r.left, y: r.top };
        chrome.storage.local.set({ buddyPos: { x: r.left, y: r.top } });
      }
    };
    buddy.addEventListener('pointerdown', (e) => {
      if (e.button != null && e.button !== 0) return;
      let n = e.target;
      while (n && n !== buddy) {
        if (n.tagName === 'BUTTON' || (n.dataset && n.dataset.act)) return;
        n = n.parentNode;
      }
      const r = buddy.getBoundingClientRect ? buddy.getBoundingClientRect() : { left: e.clientX, top: e.clientY };
      // 先钉在当前画面位置，再关掉 7.2s 滑行。只加 .dragging 不够：
      // initBuddy 写的 inline transition 会盖掉 CSS 的 transition:none，拖起来像没动。
      if (buddy.style) {
        buddy.style.left = r.left + 'px';
        buddy.style.top = r.top + 'px';
        buddy.style.right = 'auto';
        buddy.style.transition = 'none';
      }
      dragging = true;
      if (buddy.classList && buddy.classList.add) buddy.classList.add('dragging');
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
      if (e.preventDefault) e.preventDefault();
      if (buddy.setPointerCapture && e.pointerId != null) {
        try { buddy.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      }
    });
    buddy.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      placeBuddy(e.clientX - ox, e.clientY - oy);
    });
    buddy.addEventListener('pointerup', endDrag);
    buddy.addEventListener('pointercancel', endDrag);
  }
  const w = typeof window !== 'undefined' ? window : null;
  if (w && !w.__buddyWander && typeof setInterval === 'function') {
    w.__buddyWander = setInterval(wanderBuddy, WANDER_INTERVAL_MS);
  }
}

function renderActs(pct, pick, due, offer) {
  const wrap = document.getElementById('acts');
  if (!wrap) return;
  if (!due || pct == null) {
    wrap.hidden = true;
    wrap.innerHTML = '';
    return;
  }
  wrap.hidden = false;
  if (pick) {
    wrap.innerHTML = `<p class="ttl">${t('actDoing', { act: actLabel(pick) })}</p><p class="note">${t('actDoingNote')}</p><button type="button" class="done" data-act="done">${t('actDone')}</button>`;
    return;
  }
  const ids = (offer && offer.ids) || [];
  const btns = ids.map((id) => `<button type="button" data-act="${id}">${actLabel(id)}</button>`).join('');
  wrap.innerHTML = `<p class="ttl">${t('actHint')}</p>${btns}`;
}

// 嘴里偶尔冒一句。按发量 / 该不该动 换词库，中英两套口语，不连着重复。
var SAYS = {
  high: {
    zh: ['加油，vibe 住', '这波能成', '额度还在，大胆写', '今天额度自由', '再推一把就收工', 'agent 比你还卷', '写就完了', '灵感在，发也在', '来都来了'],
    en: ['vibe coding. don\'t die', 'this one\'s gonna slap', 'quota\'s fat, go wild', 'living that remaining-% life', 'one more push then ship', 'the agent is grinding harder than you', 'just write the thing', 'ideas in, hair in', 'you\'re already here'],
    fr: ['vibe coding. on lâche rien', 'celle-là va claquer', 'quota en forme, go', 'la belle vie du % restant', 'un dernier push et on ship', 'l\'agent grind plus dur que toi', 'écris, un point c\'est tout', 'les idées y sont, les cheveux aussi', 't\'es déjà lancé'],
  },
  mid: {
    zh: ['再问一句就掉一根', '提示词越写越长，发际线不是', '喝口水，代码又不会跑', '腰开始抗议了', '别坐成一尊佛', 'token 在烧，人别废', '先保存，再站起来', '这需求我看行，椅子不行'],
    en: ['one more prompt, one more follicle', 'prompt got longer. hairline didn\'t', 'sip water. the code will wait', 'your lumbar just filed a ticket', 'you\'ve become furniture', 'tokens burning, human optional?', 'save, then stand', 'the spec is fine. the chair isn\'t'],
    fr: ['encore un prompt, encore un cheveu', 'le prompt s\'allonge. pas la raie', 'bois une gorgée. le code attendra', 'tes lombaires viennent de poser un ticket', 't\'es devenu un meuble', 'les tokens brûlent, l\'humain optionnel ?', 'sauvegarde, puis lève-toi', 'le spec est bon. la chaise non'],
  },
  low: {
    zh: ['你不休息，我先秃', '发比 token 金贵', '我快见底了你还坐着', '低空飞过重置日', '留点发过年行不行', '再熬我就剩刘海了', '额度和人都见底了', '风好大，我头皮冷'],
    en: ['you stay seated, i go bald', 'hair > tokens. fight me', 'i\'m almost gone and you\'re still typing', 'skating into reset on fumes', 'leave me some hair for the holidays', 'one more all-nighter and it\'s just bangs', 'quota\'s empty. so is my scalp', 'breeze on the scalp. uncool'],
    fr: ['tu restes assis, moi je pelade', 'les cheveux > les tokens. débat ouvert', 'je suis presque à sec et tu tapes encore', 'on rentre au reset sur les vapeurs', 'laisse-moi deux trois cheveux pour les fêtes', 'encore une nuit blanche et il reste la frange', 'quota à sec. cuir chevelu aussi', 'il y a du vent, j\'ai le crâne à l\'air'],
  },
  due: {
    zh: ['站起来晃两下嘛', '草还在外面长着呢', '动一动，我想留点发', '去做那个，别光点着玩', '起来，vibe 也要呼吸', '摸摸草，字面意思', '椅子会想你的，去吧', '先动，再继续造'],
    en: ['stand up. wiggle. please', 'grass is still growing out there', 'move. i\'d like to keep these', 'go do the thing. don\'t just hover', 'vibe needs oxygen too', 'touch grass. the plant', 'the chair will miss you. go', 'stretch first, then keep building'],
    fr: ['lève-toi. remue-toi. s\'il te plaît', 'l\'herbe pousse encore, dehors', 'bouge. j\'aimerais garder ceux-là', 'va faire le truc. arrête de survoler', 'le vibe aussi a besoin d\'air', 'touche de l\'herbe. la plante', 'la chaise va te manquer. vas-y', 'étire-toi d\'abord, ensuite on construit'],
  },
  regrow: {
    zh: ['发回来了！', '这下值了', '头皮回温', '根根到位', '谢了，真的', '又是满头的一天', '动得漂亮', '发比额度先回来'],
    en: ["hair's back!", 'worth the wiggle', 'follicles online', 'scalp: restored', 'ok that helped', 'full head. for now', 'nice move', 'tokens stay. hair stays'],
    fr: ['les cheveux sont de retour !', 'le mouvement valait le coup', 'follicules en ligne', 'cuir chevelu : restauré', 'ok, ça m\'a fait du bien', 'tête pleine. pour l\'instant', 'joli move', 'les tokens restent. les cheveux aussi'],
  },
};
var SAY_FIRST_MS = 2200;
var SAY_MIN_GAP_MS = 18000;
var SAY_MAX_GAP_MS = 32000;
var SAY_HOLD_MS = 4400;
var sayCtx = { pct: 80, due: false };
var lastSays = [];
var sayTimer = null;
var sayHideTimer = null;
var sayArmed = false;

function sayStage(pct, due) {
  if (due) return 'due';
  return activityStage(pct == null ? 100 : pct);
}

function sayPool(stage, lang) {
  const pack = SAYS[stage] || SAYS.high;
  return ((pack[lang] || pack.en) || []).slice();
}

function pickSay(stage, lang, avoid, rnd) {
  rnd = typeof rnd === 'function' ? rnd : Math.random;
  const pool = sayPool(stage, lang);
  const blocked = avoid || [];
  const open = pool.filter((s) => blocked.indexOf(s) === -1);
  const src = open.length ? open : pool;
  if (!src.length) return '';
  return src[Math.floor(rnd() * src.length)];
}

function hideSay() {
  const el = document.getElementById('say');
  if (el) {
    el.hidden = true;
    el.textContent = '';
    if (el.classList && el.classList.remove) el.classList.remove('on');
  }
  if (sayHideTimer != null && typeof clearTimeout === 'function') {
    clearTimeout(sayHideTimer);
    sayHideTimer = null;
  }
}

function blurtSay(pct, due, rnd, stage) {
  const buddy = document.getElementById('buddy');
  const el = document.getElementById('say');
  if (!buddy || buddy.hidden || !el) return '';
  if (buddy.classList && buddy.classList.contains && buddy.classList.contains('dragging')) return '';
  const line = pickSay(stage || sayStage(pct, due), currentLang(), lastSays, rnd);
  if (!line) return '';
  lastSays.push(line);
  if (lastSays.length > 3) lastSays.shift();
  el.textContent = line;
  el.hidden = false;
  if (el.classList && el.classList.add) el.classList.add('on');
  if (typeof setTimeout === 'function') {
    if (sayHideTimer != null) clearTimeout(sayHideTimer);
    sayHideTimer = setTimeout(() => {
      hideSay();
      scheduleSay(false);
    }, SAY_HOLD_MS);
  }
  return line;
}

function scheduleSay(first) {
  if (typeof setTimeout !== 'function') return;
  if (sayTimer != null) clearTimeout(sayTimer);
  const wait = first ? SAY_FIRST_MS : SAY_MIN_GAP_MS + Math.random() * (SAY_MAX_GAP_MS - SAY_MIN_GAP_MS);
  sayTimer = setTimeout(() => {
    if (!first && Math.random() < 0.18) {
      scheduleSay(false);
      return;
    }
    blurtSay(sayCtx.pct, sayCtx.due);
  }, wait);
}

function armSay(pct, due, show) {
  sayCtx.pct = pct;
  sayCtx.due = !!due;
  if (!show) {
    sayArmed = false;
    if (sayTimer != null && typeof clearTimeout === 'function') clearTimeout(sayTimer);
    sayTimer = null;
    hideSay();
    return;
  }
  if (!sayArmed) {
    sayArmed = true;
    scheduleSay(true);
  }
}

function renderBuddy(show, pct, pick, due, pos, offer) {
  const buddy = document.getElementById('buddy');
  if (!buddy) return;
  buddy.hidden = !show;
  if (!show) {
    armSay(pct, due, false);
    return;
  }
  initBuddy(pos);
  renderActs(pct, pick, due, offer);
  armSay(pct, due, true);
}

function setVeil(on) {
  const veil = document.getElementById('veil');
  const stage = document.getElementById('stage');
  const grid = document.getElementById('grid');
  if (grid && grid.style) grid.style.display = '';
  if (veil) veil.hidden = !on;
  if (stage && stage.classList) {
    if (on) stage.classList.add('veiled');
    else stage.classList.remove('veiled');
  }
}

function renderHair(pct, show) {
  const box = document.getElementById('hair');
  if (!box) return;
  box.hidden = show === false || pct == null;
  if (box.hidden) {
    hairRegrowFx = false;
    stopHairRegrow(box);
    return;
  }
  // 点完「完成」这一帧才播长发闪光；普通重绘（掉发、刷新）不要重来一遍。
  const grew = !!(hairRegrowFx && pct > RESTORE_HAIR_MAX);
  hairRegrowFx = false;
  box.title = t('hairTip', { n: pct });
  if (grew && box.classList && box.classList.add) box.classList.add('regrow');
  // 已经画过就只切换 class，保留原来的 DOM 节点，CSS 过渡才会播放"掉发"动画
  const strands = box.querySelectorAll ? box.querySelectorAll('.h') : null;
  if (strands && strands.length === HAIR_N) {
    const on = hairSet(pct);
    strands.forEach((el) => el.classList.toggle('off', !on.has(+el.dataset.i)));
    const face = box.querySelector('.face');
    if (face) face.innerHTML = faceMarkup(pct);
    const m = box.querySelector('.m');
    if (m) {
      m.setAttribute('d', mouthPath(pct));
      m.setAttribute('data-mood', mouthMood(pct));
    }
    const b = box.querySelector('.hl b');
    if (b) {
      b.textContent = pct + '%';
      b.style.color = health(pct);
    }
    const lab = box.querySelector('.hl i');
    if (lab) lab.textContent = t('hairLabel');
  } else {
    box.innerHTML = hairHead(pct) + `<span class="hl"><b style="color:${health(pct)}">${pct}%</b><i>${t('hairLabel')}</i></span>` + (grew ? growFxMarkup() : '');
  }
  if (grew) startHairRegrow(box);
}

function openLink(id) {
  return `<a href="#" data-open="${id}">${t('openPage')} ↗</a>`;
}

function failText(fail) {
  return fail === 'missing' ? t('sectionMissing') : t('fetchFailed');
}

const STALE_WARNING_MS = 2 * 3600000;
const STALE_CACHE_MS = 24 * 3600000;

function staleLevel(scrapedAt, now) {
  if (!scrapedAt) return 0;
  const age = (now == null ? Date.now() : now) - scrapedAt;
  if (age > STALE_CACHE_MS) return 2;
  if (age > STALE_WARNING_MS) return 1;
  return 0;
}

function card(id, a, hist, fail, latestAttempt) {
  const meta = META[id];
  if (!a) {
    return `<div class="card">
      <div class="chead"><div class="name">${logo(id, meta.color)}${meta.name}</div></div>
      <div class="empty">${t('empty')} ${openLink(id)}</div>
      ${fail ? `<div class="fail">⚠ ${failText(fail)}</div>` : ''}
    </div>`;
  }
  const L = a.limits || [], p0 = L[0], p1 = L[1];
  const pct = p0 ? p0.percent_left : null;
  const now = Date.now();
  const stale = staleLevel(a.scraped_at, now);
  const resetDate = p0 ? parseReset(p0.resets_text, now) : null;
  const resetLabel = untilText(resetDate, now) || (p0 && p0.resets_text && esc(p0.resets_text)) || '';
  const est = pct != null && stale === 0 ? verdict(hist, resetDate, now) : null;
  const plan = a.plan ? esc(a.plan) : null;
  const foot = [];
  if (a.tokens && a.tokens.total != null) foot.push(t('tokens', { n: fmtTok(a.tokens.total) }));
  if (a.credits && a.credits !== '0' && a.credits !== '$0.00') foot.push(t('credits', { n: esc(a.credits) }));
  else if (plan) foot.push(plan);

  const center = pct != null
    ? `<b style="color:${health(pct)}">${pct}%</b><span>${t('left')}</span>`
    : `<b style="font-size:13px">${fmtTok(a.tokens && a.tokens.total)}</b><span>TOKENS</span>`;
  const sec = p1
    ? `<div class="barwrap"><div class="t"><span>${limLabel(p1.label)}</span><span>${t('pctLeft', { n: p1.percent_left })}</span></div>
    <div class="bar"><i style="width:${p1.percent_left}%;background:${meta.color}"></i></div></div>`
    : breakdownBar(a.breakdown);

  let burn = '';
  if (est) burn = `<div class="burn" style="color:${est.color}">🔥 ${est.text}</div>`;
  const failLine = fail
    ? `<div class="fail">⚠ ${failText(fail)} ${openLink(id)}</div>`
    : '';
  const freshness = stale
    ? `<div class="freshness${stale === 2 ? ' cache' : ''}">⚠ ${t(stale === 2 ? 'stale24h' : 'stale2h')}</div>`
    : '';
  const lastAttempt = latestAttempt && latestAttempt.status !== 'success' &&
    latestAttempt.attempted_at > a.scraped_at
    ? `<div class="attempt">${t('lastAttempt', { time: ago(latestAttempt.attempted_at) })}</div>`
    : '';

  return `<div class="card${stale ? ' stale' : ''}">
    <div class="chead">
      <div class="name">${logo(id, meta.color)}${a.name ? esc(a.name) : meta.name}</div>
      ${plan ? `<span class="plan">${plan}</span>` : ''}
    </div>
    <div class="mid">
      <div class="ring">${ring(pct == null ? 0 : pct, meta.color)}<div class="c">${center}</div></div>
      <div class="stats">
        <div class="l0"><span>${p0 ? limLabel(p0.label) : (a.tokens ? t('thisPeriod') : '')}</span>${resetLabel ? `<span class="r">${resetLabel}</span>` : ''}</div>
        ${sec}
      </div>
    </div>
    ${burn}
    ${sparkline(hist, meta.color)}
    ${freshness}
    ${failLine}
    ${lastAttempt}
    <div class="foot"><span>${foot.filter(Boolean).join(' · ')}</span><span>${t('lastSuccess', { time: ago(a.scraped_at) })}</span></div>
  </div>`;
}

function renderSettings(en, prefs) {
  const box = document.getElementById('settings');
  if (!box) return;
  const agents = AGENTS.map((a) =>
    `<label><input type="checkbox" data-agent="${a.id}"${en[a.id] !== false ? ' checked' : ''}>${a.name}</label>`
  ).join('');
  // 功能开关：每小时静默自动检查、低额度通知、发量小人、每天检查更新、动一动提醒（全部默认开）
  const toggles = [
    ['autoRefresh', t('autoCheck'), t('autoCheckTip'), true],
    ['notifyLow', t('notifyLow'), t('notifyLowTip'), true],
    ['showHair', t('showHair'), t('showHairTip'), true],
    ['checkUpdates', t('checkUpdates'), t('checkUpdatesTip'), true],
    ['moveReminder', t('moveReminder'), t('moveReminderTip'), true],
  ].map(([k, label, tip, dflt]) => {
    const on = prefs[k] == null ? dflt : prefs[k] !== false;
    return `<label title="${tip}"><input type="checkbox" data-pref="${k}"${on ? ' checked' : ''}>${label}</label>`;
  }).join('');
  box.innerHTML = `<span class="st">${t('tracked')}</span>${agents}<span class="brk"></span>${toggles}`;
}

// 面板底部的版本行：
// - 平时：  "v1.2.1"（点开落地页）
// - 查过了：  "v1.2.1 · up to date"
// - 有新版：  "v1.2.1 · New version v1.3.0 available — download ↗"（橙色，链到落地页）
// 版本号读自 manifest（update.js 的 currentVersion），不在这里手写。
// 下载链接始终走 UPDATE_PAGE，不信 storage 里可能残留的 GitHub Releases URL。
function versionLine(info) {
  const cur = currentVersion();
  if (!cur) return '';
  const link = (href, cls, text) =>
    `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer"${cls ? ` class="${cls}"` : ''}>${text}</a>`;
  const me = `<a href="${esc(UPDATE_PAGE)}" target="_blank" rel="noopener noreferrer" title="${esc(t('versionTitle'))}">v${esc(cur)}</a>`;
  if (updateAvailable(info, cur)) {
    return `${me} · ${link(UPDATE_PAGE, 'new', esc(t('updateAvail', { v: 'v' + info.latest })))}`;
  }
  if (info && info.latest) return `${me} · ${esc(t('upToDate'))}`;
  return me;
}

function renderVersion(info) {
  const el = document.getElementById('ver');
  if (el) el.innerHTML = versionLine(info);
}

// 面板最底部的小字：作者 / 协议 / 源码链接 + 免责声明。跟版本行一样在每次 render() 时重画，
// 这样切换中英文后文字会跟着变。链接文字来自 i18n，URL 写死在这里。
function creditsLine() {
  const link = (href, text) =>
    `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;
  const line = t('builtBy', {
    name: link('https://x.com/jjl13579', 'Junjie Liu'),
    org: link('https://philosophie.ai', 'Philosophie AI'),
    src: link('https://github.com/' + UPDATE_REPO, t('creditsSrc')),
  });
  return `${line}<br>${esc(t('disclaimer'))}`;
}

function renderCredits() {
  const el = document.getElementById('credits');
  if (el) el.innerHTML = creditsLine();
}

// 分享卡片：落地页链接（不是 GitHub），复制 + 预填 X 推文。不发新的网络请求。
var SHARE_COPIED_MS = 1600;
var shareCopiedTimer = null;

function sharePageUrl() {
  return UPDATE_PAGE;
}

function shareTweetText() {
  return t('shareTweet', { url: sharePageUrl() });
}

function shareIntentUrl() {
  return 'https://x.com/intent/tweet?text=' + encodeURIComponent(shareTweetText());
}

function sharePreviewSrc() {
  return currentLang() === 'zh' ? 'icons/share-preview-zh.webp' : 'icons/share-preview-en.webp';
}

function shareOverlayOpen() {
  const overlay = document.getElementById('share-overlay');
  return !!(overlay && !overlay.hidden);
}

function fillShareCard() {
  const shot = document.getElementById('share-shot');
  if (shot) {
    shot.src = sharePreviewSrc();
    shot.alt = t('shareShotAlt');
  }
  const title = document.getElementById('share-title');
  if (title) title.textContent = t('shareTitle');
  const pitch = document.getElementById('share-pitch');
  if (pitch) pitch.textContent = t('sharePitch');
  const privacy = document.getElementById('share-privacy');
  if (privacy) privacy.textContent = t('sharePrivacy');
  const urlEl = document.getElementById('share-url');
  if (urlEl) urlEl.textContent = sharePageUrl();
  const copyBtn = document.getElementById('share-copy');
  if (copyBtn && shareCopiedTimer == null) copyBtn.textContent = t('shareCopy');
  const xBtn = document.getElementById('share-x');
  if (xBtn) xBtn.textContent = t('shareX');
  const closeBtn = document.getElementById('share-close');
  if (closeBtn) {
    closeBtn.title = t('shareClose');
    if (closeBtn.setAttribute) closeBtn.setAttribute('aria-label', t('shareClose'));
  }
}

function openShare() {
  fillShareCard();
  const overlay = document.getElementById('share-overlay');
  if (overlay) overlay.hidden = false;
}

function closeShare() {
  const overlay = document.getElementById('share-overlay');
  if (overlay) overlay.hidden = true;
  if (shareCopiedTimer != null && typeof clearTimeout === 'function') {
    clearTimeout(shareCopiedTimer);
    shareCopiedTimer = null;
  }
  const copyBtn = document.getElementById('share-copy');
  if (copyBtn) copyBtn.textContent = t('shareCopy');
}

function fallbackCopy(text) {
  if (typeof document === 'undefined' || !document.body) return false;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = !!(document.execCommand && document.execCommand('copy')); } catch (e) { ok = false; }
  if (ta.parentNode) ta.parentNode.removeChild(ta);
  return ok;
}

function markShareCopied() {
  const copyBtn = document.getElementById('share-copy');
  if (!copyBtn) return;
  copyBtn.textContent = t('shareCopied');
  if (shareCopiedTimer != null && typeof clearTimeout === 'function') clearTimeout(shareCopiedTimer);
  if (typeof setTimeout === 'function') {
    shareCopiedTimer = setTimeout(() => {
      shareCopiedTimer = null;
      if (copyBtn) copyBtn.textContent = t('shareCopy');
    }, SHARE_COPIED_MS);
  }
}

function copyShareLink() {
  const url = sharePageUrl();
  const done = () => markShareCopied();
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    const p = navigator.clipboard.writeText(url);
    if (p && typeof p.then === 'function') {
      p.then(done).catch(() => { if (fallbackCopy(url)) done(); });
      return;
    }
    done();
    return;
  }
  if (fallbackCopy(url)) done();
}

function openShareX() {
  const url = shareIntentUrl();
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
    chrome.tabs.create({ url });
    return;
  }
  if (typeof window !== 'undefined' && window.open) window.open(url, '_blank', 'noopener,noreferrer');
}

let staleTimer = null;
let freshnessTimer = null;
let logFilter = 'all';
let visibleLogs = [];

function logTriggerLabel(trigger) {
  if (trigger === 'automatic') return t('logAutomatic');
  if (trigger === 'manual') return t('logManual');
  return t('logPage');
}

function logMatches(entry) {
  if (logFilter === 'success') return entry.status === 'success';
  if (logFilter === 'failure') return entry.status === 'failed' || entry.status === 'missing';
  return true;
}

function renderLogRows() {
  const list = document.getElementById('logs-list');
  if (!list) return;
  const rows = visibleLogs.filter(logMatches)
    .sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
  if (!rows.length) {
    list.innerHTML = `<div class="logs-empty">${esc(t('logsEmpty'))}</div>`;
    return;
  }
  list.innerHTML = rows.map((entry) => {
    const limits = (entry.limits || []).map((limit) =>
      `${esc(limit.label)}: ${limit.percent_left == null ? '—' : esc(limit.percent_left + '%')}${limit.resets_text ? ` · ${esc(limit.resets_text)}` : ''}`
    ).join('<br>');
    const detail = entry.status === 'success'
      ? `${entry.percent_left == null ? '' : `${esc(entry.percent_left + '%')} · `}${limits}`
      : esc(entry.reason || 'read_failed');
    return `<article class="log-row">
      <div class="log-top"><span><b>${esc(entry.agent_name || entry.agent_id)}</b> · ${esc(logTriggerLabel(entry.trigger))}</span><span class="log-status ${esc(entry.status)}">${esc(entry.status)}</span></div>
      <div class="log-meta">${esc(new Date(entry.timestamp).toLocaleString())} · ${esc(entry.duration_ms || 0)}ms</div>
      ${detail ? `<div class="log-detail">${detail}</div>` : ''}
      <div class="log-meta">${esc(entry.source_url || '')} · v${esc(entry.extension_version || '')}</div>
    </article>`;
  }).join('');
}

function fillLogsView() {
  const text = {
    'logs-title': 'logs',
    'logs-close': 'logsClose',
    'logs-json': 'logsJson',
    'logs-csv': 'logsCsv',
    'logs-clear': 'logsClear',
  };
  Object.keys(text).forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = t(text[id]);
  });
  const labels = { all: 'logsAll', success: 'logsSuccess', failure: 'logsFailure' };
  const filters = document.querySelectorAll ? document.querySelectorAll('[data-log-filter]') : [];
  if (filters && filters.forEach) filters.forEach((button) => {
    button.textContent = t(labels[button.dataset.logFilter]);
    button.classList.toggle('active', button.dataset.logFilter === logFilter);
  });
  renderLogRows();
}

function openLogs() {
  const view = document.getElementById('logs-view');
  if (view) view.hidden = false;
  chrome.storage.local.get(['captureLogs'], (res) => {
    visibleLogs = pruneCaptureLogs(res.captureLogs || []);
    fillLogsView();
  });
}

function closeLogs() {
  const view = document.getElementById('logs-view');
  if (view) view.hidden = true;
}

function downloadLogs(kind) {
  const data = kind === 'json' ? captureLogsJson(visibleLogs) : captureLogsCsv(visibleLogs);
  const type = kind === 'json' ? 'application/json' : 'text/csv';
  const blob = new Blob([data], { type: `${type};charset=utf-8` });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = `token-police-logs.${kind}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

function render() {
  chrome.storage.local.get(['agents', 'history', 'refresh', 'latestAttempts', 'enabledAgents', 'autoRefresh', 'notifyLow', 'showHair', 'moveReminder', 'activityPick', 'activityDoneAt', 'lastMovedAt', 'buddyPos', 'hairBoostPct', 'activityOffer', 'checkUpdates', 'updateCheck'], (res) => {
    const map = res.agents || {};
    const hist = res.history || [];
    const en = res.enabledAgents || {};
    const shown = ORDER.filter((id) => en[id] !== false);
    const byId = {};
    hist.forEach((e) => { (byId[e.id] = byId[e.id] || []).push(e); });
    const rf = res.refresh || {};
    // 兜底：MV3 service worker 可能中途被回收，refresh.running 会永远留在 true。
    // 一轮刷新最长约 100 秒，started 超过 2.5 分钟仍 running 就当它已经死了，别把按钮锁死。
    const STALE_MS = 150000;
    const running = !!(rf.running && rf.started && Date.now() - rf.started < STALE_MS);
    if (running) {
      // 面板开着不动也要能解锁：到过期时刻再重绘一次
      clearTimeout(staleTimer);
      staleTimer = setTimeout(render, STALE_MS - (Date.now() - rf.started) + 1000);
    }
    // 上一轮 Refresh 没抓到（'fail'）或页面里没这个区块（'missing'）、且之后也没有更新的数据 → 卡片上提示
    const failed = (id) => {
      const st = !running && rf.results && rf.results[id];
      if (st !== 'fail' && st !== 'missing') return false;
      return (map[id] && rf.started && map[id].scraped_at >= rf.started) ? false : st;
    };
    document.getElementById('grid').innerHTML =
      shown.map((id) => {
        const attempt = (res.latestAttempts || {})[id];
        const attemptFail = attempt && attempt.status !== 'success' && attempt.attempted_at > ((map[id] && map[id].scraped_at) || 0)
          ? attempt.status
          : false;
        return card(id, map[id], byId[id], failed(id) || attemptFail, attempt);
      }).join('');
    renderSettings(en, { autoRefresh: res.autoRefresh, notifyLow: res.notifyLow, showHair: res.showHair, moveReminder: res.moveReminder, checkUpdates: res.checkUpdates });
    const pct = avgPct(map, shown);
    const boost = clampHairBoost(pct, res.hairBoostPct);
    if (pct != null && (res.hairBoostPct || 0) !== boost) {
      chrome.storage.local.set({ hairBoostPct: boost });
    }
    const showMascot = res.showHair !== false && pct != null;
    const pick = res.activityPick || null;
    let lastMoved = res.lastMovedAt || res.activityDoneAt || 0;
    if (!lastMoved) {
      lastMoved = Date.now();
      chrome.storage.local.set({ lastMovedAt: lastMoved });
    }
    const interval = sitIntervalMs(hist, shown, Date.now());
    const hairPct = displayHairPct(pct, boost, lastMoved, interval);
    renderHair(hairPct, res.showHair);
    if (showMascot) scheduleHairTick(lastMoved, interval);
    else if (hairTickTimer != null && typeof clearTimeout === 'function') {
      clearTimeout(hairTickTimer);
      hairTickTimer = null;
    }
    const clockDue = sitDue(lastMoved, pick, Date.now(), interval);
    const due = restoreDue(hairPct, clockDue, pick);
    const offer = due ? currentOffer(hairPct, pick, false, res.activityOffer) : null;
    setVeil(showMascot && due);
    renderBuddy(showMascot, hairPct, pick, due, res.buddyPos, offer);
    renderVersion(res.checkUpdates === false ? null : res.updateCheck);
    renderCredits();
    const any = shown.some((id) => map[id]);
    const btn = document.getElementById('refresh');
    // 顶部：最后一次Refresh时间（取所有产品里最新的一次）
    let latest = 0;
    shown.forEach((id) => { if (map[id] && map[id].scraped_at > latest) latest = map[id].scraped_at; });
    document.getElementById('upd').textContent = latest
      ? t('updated', { time: new Date(latest).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })
      : '';
    if (running) {
      if (btn) { btn.textContent = t('fetching'); btn.disabled = true; }
      document.getElementById('hint').textContent = t('fetchingHint');
    } else {
      if (btn) { btn.textContent = t('refresh'); btn.disabled = false; }
      document.getElementById('hint').textContent = any ? '' : t('firstTime');
    }
    if (freshnessTimer != null) clearTimeout(freshnessTimer);
    freshnessTimer = setTimeout(render, 60000);
    quotaMap = map;
    renderDispatch();
  });
}

// Refresh only scrapes. The dashboard already lives in the side panel —
// do not open the toolbar popup or extra windows (that stacks flashing UIs).
function startRefresh() {
  const btn = document.getElementById('refresh');
  if (btn) {
    if (btn.disabled) return;
    btn.textContent = t('fetching');
    btn.disabled = true;
  }
  chrome.storage.local.set({ refresh: { running: true, started: Date.now() } });
  chrome.runtime.sendMessage({ type: 'refreshAll' });
}

document.getElementById('refresh').addEventListener('click', startRefresh);
const gearBtn = document.getElementById('gear');
if (gearBtn) {
  gearBtn.addEventListener('click', () => {
    const box = document.getElementById('settings');
    if (box) box.hidden = !box.hidden;
  });
}
const settingsBox = document.getElementById('settings');
if (settingsBox) {
  settingsBox.addEventListener('change', (e) => {
    const el = e.target;
    if (!el || !el.dataset) return;
    const checked = !!el.checked;
    const id = el.dataset.agent;
    if (id) {
      chrome.storage.local.get(['enabledAgents'], (res) => {
        const en = res.enabledAgents || {};
        en[id] = checked;
        chrome.storage.local.set({ enabledAgents: en }); // onChanged 会触发重绘
      });
      return;
    }
    const pref = el.dataset.pref;
    if (pref === 'autoRefresh' || pref === 'notifyLow' || pref === 'showHair' || pref === 'moveReminder' || pref === 'checkUpdates') {
      chrome.storage.local.set({ [pref]: checked });
    }
  });
}
const gridEl = document.getElementById('grid');
if (gridEl && gridEl.addEventListener) {
  // 卡片里的 "打开页面 ↗"：在普通标签页打开该产品的额度页（顺便也就完成了一次抓取）
  gridEl.addEventListener('click', (e) => {
    let n = e.target;
    while (n && n !== e.currentTarget && !(n.dataset && n.dataset.open)) n = n.parentNode;
    const id = n && n.dataset && n.dataset.open;
    if (!id || !META[id]) return;
    e.preventDefault();
    chrome.tabs.create({ url: META[id].page });
  });
}
const actsEl = document.getElementById('acts');
if (actsEl && actsEl.addEventListener) {
  actsEl.addEventListener('click', (e) => {
    let n = e.target;
    while (n && n !== e.currentTarget && !(n.dataset && n.dataset.act)) n = n.parentNode;
    const act = n && n.dataset && n.dataset.act;
    if (!act) return;
    if (act === 'done') {
      completeActivity();
    } else {
      chrome.storage.local.set({ activityPick: act, activityDoneAt: 0 });
    }
  });
}
const langsEl = document.getElementById('langs');
if (langsEl) {
  langsEl.addEventListener('click', (e) => {
    let n = e.target;
    while (n && n !== e.currentTarget && !(n.dataset && n.dataset.lang)) n = n.parentNode;
    const lang = n && n.dataset && n.dataset.lang;
    if (!lang) return;
    setLang(lang, render);
  });
}
const shareBtn = document.getElementById('share');
if (shareBtn && shareBtn.addEventListener) {
  shareBtn.addEventListener('click', openShare);
}
const logsBtn = document.getElementById('logs');
if (logsBtn && logsBtn.addEventListener) logsBtn.addEventListener('click', openLogs);
const logsClose = document.getElementById('logs-close');
if (logsClose && logsClose.addEventListener) logsClose.addEventListener('click', closeLogs);
const logsView = document.getElementById('logs-view');
if (logsView && logsView.addEventListener) {
  logsView.addEventListener('click', (e) => {
    const filter = e.target && e.target.dataset && e.target.dataset.logFilter;
    if (!filter) return;
    logFilter = filter;
    fillLogsView();
  });
}
const logsJson = document.getElementById('logs-json');
if (logsJson && logsJson.addEventListener) logsJson.addEventListener('click', () => downloadLogs('json'));
const logsCsv = document.getElementById('logs-csv');
if (logsCsv && logsCsv.addEventListener) logsCsv.addEventListener('click', () => downloadLogs('csv'));
const logsClear = document.getElementById('logs-clear');
if (logsClear && logsClear.addEventListener) {
  logsClear.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'clearCaptureLogs' }, () => {
      visibleLogs = [];
      renderLogRows();
    });
  });
}
const shareOverlay = document.getElementById('share-overlay');
if (shareOverlay && shareOverlay.addEventListener) {
  shareOverlay.addEventListener('click', (e) => {
    if (e.target === shareOverlay) closeShare();
  });
}
const shareClose = document.getElementById('share-close');
if (shareClose && shareClose.addEventListener) {
  shareClose.addEventListener('click', closeShare);
}
const shareCopy = document.getElementById('share-copy');
if (shareCopy && shareCopy.addEventListener) {
  shareCopy.addEventListener('click', copyShareLink);
}
const shareX = document.getElementById('share-x');
if (shareX && shareX.addEventListener) {
  shareX.addEventListener('click', openShareX);
}
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('keydown', (e) => {
    if (!e || e.key !== 'Escape') return;
    const logs = document.getElementById('logs-view');
    if (logs && !logs.hidden) closeLogs();
    else if (shareOverlayOpen()) closeShare();
    else if (dispatchBoardOpen()) closeDispatchBoard();
    else if (dispatchFloatOpen()) setDispatchOpen(false);
    else if (crosscheckFloatOpen()) setCrosscheckOpen(false);
  });
}

let quotaMap = {};
let dispatchKind = 'chat';
let dispatchSelected = [];
let dispatchPrompt = '';
let dispatchRepo = '';
let dispatchRepos = [];
let dispatchJobs = [];
let dispatchAutoSend = false;
let dispatchTile = false;
let dispatchShake = false;
let crosscheckPromptStored = '';
let crosscheckReviewer = 'claude-chat';
let crosscheckConfirm = false;
let crosscheckAutoSend = false;
let crosscheckSession = null;
let crosscheckStatus = '';
let crosscheckStatusKind = '';
let crosscheckCapturing = false;

function crosscheckFloatOpen() {
  const el = document.getElementById('crosscheck-float');
  return !!(el && !el.hidden);
}

function setCrosscheckOpen(on) {
  const el = document.getElementById('crosscheck-float');
  if (!el) return;
  if (on) setDispatchOpen(false);
  el.hidden = !on;
  const btn = document.getElementById('crosscheck-toggle');
  if (btn) btn.title = on ? t('crosscheckFold') : t('crosscheckOpen');
  if (on) {
    crosscheckConfirm = false;
    captureCrosscheckSource();
  }
  renderCrosscheck();
}

function persistCrosscheck() {
  if (!chrome.storage || !chrome.storage.local) return;
  const payload = { crosscheckReviewer, crosscheckAutoSend };
  if (crosscheckPromptStored.trim()) payload.crosscheckPrompt = crosscheckPromptStored;
  else if (chrome.storage.local.remove) chrome.storage.local.remove('crosscheckPrompt');
  chrome.storage.local.set(payload);
}

function resetCrosscheckPrompt() {
  crosscheckPromptStored = '';
  if (chrome.storage && chrome.storage.local && chrome.storage.local.remove) {
    chrome.storage.local.remove('crosscheckPrompt', () => renderCrosscheck());
  } else {
    renderCrosscheck();
  }
  persistCrosscheck();
}

function downloadConversationMd(name, text) {
  try {
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name || 'conversation.md';
    a.rel = 'noopener';
    if (document.body) document.body.appendChild(a);
    a.click();
    if (a.parentNode) a.parentNode.removeChild(a);
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} }, 2000);
  } catch (e) {}
}

function findCrosscheckTab(cb) {
  if (!chrome.windows || !chrome.windows.getLastFocused) { cb(null); return; }
  chrome.windows.getLastFocused({ populate: true, windowTypes: ['normal'] }, (win) => {
    if (chrome.runtime.lastError || !win || !Array.isArray(win.tabs)) { cb(null); return; }
    const tab = win.tabs.filter((x) => x && x.active)[0] || null;
    cb(tab);
  });
}

function captureCrosscheckSource() {
  crosscheckCapturing = true;
  crosscheckSession = null;
  crosscheckStatusKind = 'capturing';
  crosscheckStatus = t('crosscheckCapturing');
  renderCrosscheck();
  findCrosscheckTab((tab) => {
    if (!tab || tab.id == null) {
      crosscheckCapturing = false;
      crosscheckStatusKind = 'need';
      crosscheckStatus = t('crosscheckNeedSource');
      renderCrosscheck();
      return;
    }
    if (!chrome.runtime || !chrome.runtime.sendMessage) {
      crosscheckCapturing = false;
      crosscheckStatusKind = 'error';
      crosscheckStatus = t('crosscheckError');
      renderCrosscheck();
      return;
    }
    chrome.runtime.sendMessage({ type: 'captureConversation', tabId: tab.id }, (res) => {
      crosscheckCapturing = false;
      if (chrome.runtime.lastError || !res) {
        crosscheckSession = null;
        crosscheckStatusKind = 'error';
        crosscheckStatus = t('crosscheckError');
        renderCrosscheck();
        return;
      }
      if (res.ok && res.conversation && res.conversation.length) {
        crosscheckSession = res;
        crosscheckStatusKind = 'ready';
        const summary = (typeof sessionSummary === 'function') ? sessionSummary(res) : `${res.conversation.length} messages`;
        crosscheckStatus = t('crosscheckReady', { summary });
        if (!crosscheckReviewer) crosscheckReviewer = 'claude-chat';
      } else if (res.reason === 'unsupported') {
        crosscheckSession = null;
        crosscheckStatusKind = 'unsupported';
        crosscheckStatus = t('crosscheckUnsupported');
      } else if (res.reason === 'empty') {
        crosscheckSession = null;
        crosscheckStatusKind = 'empty';
        crosscheckStatus = t('crosscheckEmpty');
      } else {
        crosscheckSession = null;
        crosscheckStatusKind = 'error';
        crosscheckStatus = t('crosscheckError');
      }
      renderCrosscheck();
    });
  });
}

function renderCrosscheck() {
  const box = document.getElementById('crosscheck-float');
  if (!box) return;
  const fold = document.getElementById('crosscheck-fold');
  if (fold) fold.textContent = t('crosscheck');
  const status = document.getElementById('crosscheck-status');
  if (status) status.textContent = crosscheckStatus || t('crosscheckNeedSource');
  const privacy = document.getElementById('crosscheck-privacy');
  if (privacy) privacy.textContent = t('crosscheckPrivacy');
  const confirm = document.getElementById('crosscheck-confirm');
  if (confirm) confirm.checked = !!crosscheckConfirm;
  const confirmLabel = document.getElementById('crosscheck-confirm-label');
  if (confirmLabel) confirmLabel.textContent = t('crosscheckConfirm');
  const promptLabel = document.getElementById('crosscheck-prompt-label');
  if (promptLabel) promptLabel.textContent = t('crosscheckPromptLabel');
  const area = document.getElementById('crosscheck-prompt');
  if (area && document.activeElement !== area) {
    const shown = (typeof resolveCrosscheckPrompt === 'function')
      ? resolveCrosscheckPrompt(crosscheckPromptStored)
      : crosscheckPromptStored;
    if (area.value !== shown) area.value = shown;
  }
  const reset = document.getElementById('crosscheck-reset');
  if (reset) reset.textContent = t('crosscheckReset');
  const agent = dispatchById(crosscheckReviewer);
  const warn = document.getElementById('crosscheck-warn');
  if (warn) {
    const srcKind = crosscheckSession && crosscheckSession.sourceKind;
    let msg = '';
    if (agent && srcKind === 'chat' && agentKind(agent) === 'code') msg = t('crosscheckCodeWarn');
    if (agent && srcKind === 'code' && agentKind(agent) === 'chat') msg = t('crosscheckChatWarn');
    warn.textContent = msg;
    warn.hidden = !msg;
  }
  const chips = document.getElementById('crosscheck-chips');
  if (chips) {
    chips.innerHTML = DISPATCH_TARGETS.filter((a) => canDispatch(a)).map((a) => {
      const on = a.id === crosscheckReviewer;
      const left = leftoverOf(a, quotaMap);
      const pct = left == null ? '' : ` · ${Math.round(left)}%`;
      return `<button type="button" class="chip${on ? ' on' : ''}" data-agent="${a.id}">
        <span class="ord">${on ? '✓' : ''}</span>${esc(a.name)}${pct}
      </button>`;
    }).join('');
  }
  const sendAllowed = !!(agent && canAutoSend(agent));
  const sendTog = document.getElementById('crosscheck-send');
  if (sendTog) {
    sendTog.disabled = !sendAllowed;
    sendTog.checked = sendAllowed && crosscheckAutoSend;
    const wrap = sendTog.closest ? sendTog.closest('.sendtog') : null;
    if (wrap) wrap.classList.toggle('dim', !sendAllowed);
  }
  const sendLabel = document.getElementById('crosscheck-send-label');
  if (sendLabel) sendLabel.textContent = sendAllowed ? t('dispatchSend') : t('dispatchSendCode');
  const go = document.getElementById('crosscheck-go');
  if (go) {
    if (!agent) go.textContent = t('crosscheckGoNeed');
    else go.textContent = t((sendAllowed && crosscheckAutoSend) ? 'crosscheckGoSend' : 'crosscheckGo', { name: agent.name });
  }
  const note = document.getElementById('crosscheck-note');
  if (note) {
    const payload = (crosscheckSession && crosscheckSession.ok && typeof reviewPayload === 'function')
      ? reviewPayload(crosscheckSession, crosscheckPromptStored)
      : null;
    note.textContent = (payload && payload.useFile) ? t('crosscheckLong') : t('crosscheckHint');
  }
}

function runCrosscheck() {
  const note = document.getElementById('crosscheck-note');
  if (!crosscheckSession || !crosscheckSession.ok) {
    if (note) note.textContent = t('crosscheckNeedSource');
    return;
  }
  if (!crosscheckConfirm) {
    if (note) note.textContent = t('crosscheckNeedConfirm');
    return;
  }
  const agent = dispatchById(crosscheckReviewer);
  if (!agent || !canDispatch(agent)) {
    if (note) note.textContent = t('crosscheckNeedReviewer');
    return;
  }
  const payload = reviewPayload(crosscheckSession, crosscheckPromptStored);
  if (payload.useFile) downloadConversationMd(payload.attachName, payload.attachText);
  const job = makeReviewJob(agent, payload, crosscheckSession, crosscheckAutoSend);
  chrome.runtime.sendMessage({ type: 'reviewOpen', job }, (opened) => {
    if (chrome.runtime.lastError) {
      if (note) note.textContent = t('crosscheckError');
      return;
    }
    const one = (opened && opened[0]) || job;
    if (note) note.textContent = t(job.send ? 'crosscheckOpenedSent' : 'crosscheckOpened', { name: agent.name });
    if (one && one.tabId != null) {
      chrome.runtime.sendMessage({ type: 'dispatchFocus', tabId: one.tabId, url: one.url });
    }
  });
}

const crosscheckToggle = document.getElementById('crosscheck-toggle');
if (crosscheckToggle && crosscheckToggle.addEventListener) {
  crosscheckToggle.addEventListener('click', () => setCrosscheckOpen(!crosscheckFloatOpen()));
}
const crosscheckFold = document.getElementById('crosscheck-fold');
if (crosscheckFold && crosscheckFold.addEventListener) {
  crosscheckFold.addEventListener('click', () => setCrosscheckOpen(false));
}
const crosscheckConfirmEl = document.getElementById('crosscheck-confirm');
if (crosscheckConfirmEl && crosscheckConfirmEl.addEventListener) {
  crosscheckConfirmEl.addEventListener('change', () => {
    crosscheckConfirm = !!crosscheckConfirmEl.checked;
  });
}
const crosscheckPromptEl = document.getElementById('crosscheck-prompt');
if (crosscheckPromptEl && crosscheckPromptEl.addEventListener) {
  crosscheckPromptEl.addEventListener('input', () => {
    crosscheckPromptStored = crosscheckPromptEl.value;
    persistCrosscheck();
  });
}
const crosscheckReset = document.getElementById('crosscheck-reset');
if (crosscheckReset && crosscheckReset.addEventListener) {
  crosscheckReset.addEventListener('click', resetCrosscheckPrompt);
}
const crosscheckChips = document.getElementById('crosscheck-chips');
if (crosscheckChips && crosscheckChips.addEventListener) {
  crosscheckChips.addEventListener('click', (e) => {
    let n = e.target;
    while (n && n !== e.currentTarget && !(n.dataset && n.dataset.agent)) n = n.parentNode;
    const id = n && n.dataset && n.dataset.agent;
    if (!id || !dispatchById(id)) return;
    crosscheckReviewer = id;
    persistCrosscheck();
    renderCrosscheck();
  });
}
const crosscheckSendEl = document.getElementById('crosscheck-send');
if (crosscheckSendEl && crosscheckSendEl.addEventListener) {
  crosscheckSendEl.addEventListener('change', () => {
    const agent = dispatchById(crosscheckReviewer);
    if (!agent || !canAutoSend(agent)) {
      crosscheckSendEl.checked = false;
      return;
    }
    crosscheckAutoSend = !!crosscheckSendEl.checked;
    persistCrosscheck();
    renderCrosscheck();
  });
}
const crosscheckGo = document.getElementById('crosscheck-go');
if (crosscheckGo && crosscheckGo.addEventListener) {
  crosscheckGo.addEventListener('click', runCrosscheck);
}

// The screen's usable area, read from the side panel (which sees the whole
// display, not just its own narrow strip). Handed to the background so it can
// place tiled windows without the extension needing a "system.display"
// permission. availLeft/availTop are non-standard but present in Chrome; they
// keep tiling on the correct monitor in a multi-display setup.
function screenArea() {
  try {
    const s = window.screen || {};
    return {
      left: typeof s.availLeft === 'number' ? s.availLeft : 0,
      top: typeof s.availTop === 'number' ? s.availTop : 0,
      width: s.availWidth || s.width || 1440,
      height: s.availHeight || s.height || 900,
    };
  } catch (e) {
    return { left: 0, top: 0, width: 1440, height: 900 };
  }
}

function dispatchFloatOpen() {
  const el = document.getElementById('dispatch-float');
  return !!(el && !el.hidden);
}

function dispatchBoardOpen() {
  const el = document.getElementById('dispatch-board');
  return !!(el && !el.hidden);
}

function setDispatchOpen(on) {
  const el = document.getElementById('dispatch-float');
  if (!el) return;
  if (on) setCrosscheckOpen(false);
  el.hidden = !on;
  const btn = document.getElementById('dispatch-toggle');
  if (btn) btn.title = on ? t('dispatchFold') : t('dispatchOpen');
  if (on) renderDispatch();
}

function closeDispatchBoard() {
  const el = document.getElementById('dispatch-board');
  if (el) el.hidden = true;
}

// Close every tab this board opened in one click. The background service worker
// owns tab access, so it does the actual removal; we hand it the ids and only
// clear the board once it confirms — otherwise a failed close would leave the
// tabs open while the board says they're gone.
function closeDispatchTabs() {
  const ids = dispatchJobs.map((j) => j && j.tabId).filter((x) => x != null);
  if (!ids.length || !chrome.runtime || !chrome.runtime.sendMessage) {
    dispatchJobs = [];
    persistDispatch();
    closeDispatchBoard();
    return;
  }
  chrome.runtime.sendMessage({ type: 'dispatchCloseTabs', tabIds: ids }, (res) => {
    if (chrome.runtime.lastError || !res || !res.ok) return; // keep the board; tabs may still be open
    dispatchJobs = [];
    persistDispatch();
    closeDispatchBoard();
  });
}

function openDispatchBoard() {
  pruneDispatchJobs(() => {
    const el = document.getElementById('dispatch-board');
    if (el) el.hidden = false;
    renderDispatchBoard();
  });
}

// Drop jobs whose tab the user has closed, so the accumulated board and the
// "Tabs · N" count only ever show tabs that are still open. Async (asks the
// background, which owns tab access); calls back once dispatchJobs is settled.
function pruneDispatchJobs(cb) {
  const ids = dispatchJobs.map((j) => j && j.tabId).filter((x) => x != null);
  if (!ids.length || !chrome.runtime || !chrome.runtime.sendMessage) { if (cb) cb(); return; }
  chrome.runtime.sendMessage({ type: 'dispatchLiveTabs', tabIds: ids }, (live) => {
    void chrome.runtime.lastError;
    if (Array.isArray(live)) {
      const set = new Set(live.map(Number));
      const kept = dispatchJobs.filter((j) => j && j.tabId != null && set.has(Number(j.tabId)));
      if (kept.length !== dispatchJobs.length) { dispatchJobs = kept; persistDispatch(); }
    }
    if (cb) cb();
  });
}

function persistDispatch() {
  if (!chrome.storage || !chrome.storage.local || !chrome.storage.local.set) return;
  chrome.storage.local.set({
    dispatchKind,
    dispatchPrompt,
    dispatchRepo,
    dispatchSelected,
    dispatchRepos,
    dispatchJobs,
    dispatchAutoSend,
    dispatchTile,
  });
}

function hostOf(url) {
  try { return new URL(url).host; } catch (e) { return url || ''; }
}

function renderDispatch() {
  const box = document.getElementById('dispatch-float');
  if (!box) return;
  const kindBtns = box.querySelectorAll('#dispatch-kind [data-kind]');
  kindBtns.forEach((b) => {
    b.classList.toggle('on', b.dataset.kind === dispatchKind);
    b.textContent = b.dataset.kind === 'chat' ? t('dispatchChat') : t('dispatchCode');
  });
  const fold = document.getElementById('dispatch-fold');
  if (fold) fold.textContent = t('dispatch');
  // Re-entry to the tab board: once a batch is open, this is the only way back
  // to it — clicking a tile jumps to that tab and closes the popup, so on the
  // next open the board is hidden and would otherwise be unreachable.
  const tabsBtn = document.getElementById('dispatch-tabs');
  if (tabsBtn) {
    tabsBtn.hidden = dispatchJobs.length <= 1;
    tabsBtn.textContent = t('dispatchTabs', { n: dispatchJobs.length });
  }
  const area = document.getElementById('dispatch-prompt');
  if (area && area.value !== dispatchPrompt) area.value = dispatchPrompt;
  if (area) area.placeholder = t('dispatchPlaceholder');
  if (dispatchShake && area) {
    area.style.outline = '1px solid var(--bad)';
    setTimeout(() => { area.style.outline = ''; dispatchShake = false; }, 220);
  }
  const repoRow = document.getElementById('dispatch-repo-row');
  if (repoRow) repoRow.hidden = dispatchKind !== 'code';
  const repoIn = document.getElementById('dispatch-repo');
  if (repoIn && repoIn.value !== dispatchRepo) repoIn.value = dispatchRepo;
  const recents = document.getElementById('dispatch-recents');
  if (recents) {
    recents.innerHTML = dispatchRepos.slice(0, 2).map((r) =>
      `<button type="button" data-repo="${esc(r)}" class="${r === dispatchRepo ? 'on' : ''}">${esc((r.split('/')[1] || r))}</button>`
    ).join('');
  }
  const par = document.getElementById('dispatch-parallel');
  if (par) par.textContent = t('dispatchParallel');
  const readyBtn = document.getElementById('dispatch-ready');
  const ready = pickReadyDispatch(dispatchKind, quotaMap);
  if (readyBtn) readyBtn.textContent = `${t('dispatchSelectReady')}${ready.length ? ` · ${ready.length}` : ''}`;
  const chips = document.getElementById('dispatch-chips');
  const kindSelected = selectedForKind(dispatchSelected, dispatchKind);
  if (chips) {
    chips.innerHTML = agentsForKind(dispatchKind).map((a) => {
      const blocked = !canDispatch(a);
      const idx = blocked ? -1 : kindSelected.indexOf(a.id);
      const left = leftoverOf(a, quotaMap);
      return `<button type="button" class="chip${idx >= 0 ? ' on' : ''}${blocked ? ' dim' : ''}" data-agent="${a.id}" ${blocked ? 'disabled' : ''} title="${blocked ? esc(t('dispatchSoon')) : ''}">
        <span class="ord">${idx >= 0 ? idx + 1 : ''}</span>
        <span class="dot" style="background:${a.color}"></span>
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.name)}</span>
        <span style="color:var(--muted);font-variant-numeric:tabular-nums">${left == null ? '—' : left}</span>
      </button>`;
    }).join('');
  }
  const autoBtn = document.getElementById('dispatch-auto');
  const picked = pickAutoDispatch(dispatchKind, quotaMap);
  if (autoBtn) autoBtn.textContent = picked ? `${t('dispatchAuto')} · ${picked.name}` : t('dispatchAuto');
  const go = document.getElementById('dispatch-go');
  if (go) go.textContent = kindSelected.length
    ? t('dispatchMulti', { n: kindSelected.length })
    : t('dispatch');
  // Auto-send is chat-only for now (coding composers have flaky submit paths),
  // so on the Code tab the toggle is greyed out and forced off — prefill only.
  const sendAllowed = dispatchKind !== 'code';
  const sendTog = document.getElementById('dispatch-send');
  if (sendTog) {
    sendTog.disabled = !sendAllowed;
    sendTog.checked = sendAllowed && dispatchAutoSend;
    const wrap = sendTog.closest ? sendTog.closest('.sendtog') : null;
    if (wrap) wrap.classList.toggle('dim', !sendAllowed);
  }
  const sendLabel = document.getElementById('dispatch-send-label');
  if (sendLabel) sendLabel.textContent = sendAllowed ? t('dispatchSend') : t('dispatchSendCode');
  // Tile-windows works for both Chat and Code targets, so it's always live.
  const tileTog = document.getElementById('dispatch-tile');
  if (tileTog) tileTog.checked = dispatchTile;
  const tileLabel = document.getElementById('dispatch-tile-label');
  if (tileLabel) {
    tileLabel.textContent = t('dispatchTile');
    tileLabel.title = t('dispatchTileHint');
  }
  const note = document.getElementById('dispatch-note');
  if (note) note.textContent = t('dispatchHint');
  renderDispatchBoard();
}

function renderDispatchBoard() {
  const board = document.getElementById('dispatch-board');
  if (!board) return;
  const title = document.getElementById('dispatch-board-title');
  // Title must reflect what actually happened: jobs on 'script'-fill surfaces
  // carry send:true when auto-send is on, so if any tab was auto-sent, say so
  // instead of the flat "prefill only, not sent".
  if (title) title.textContent = dispatchJobs.length
    ? t(dispatchJobs.some((job) => job && job.send) ? 'dispatchOpenedNSent' : 'dispatchOpenedN', { n: dispatchJobs.length })
    : t('dispatch');
  const hint = document.getElementById('dispatch-board-hint');
  if (hint) hint.textContent = t('dispatchBoardHint');
  const foot = document.getElementById('dispatch-board-foot');
  if (foot) foot.textContent = t('dispatchNoLive');
  const close = document.getElementById('dispatch-board-close');
  if (close) close.textContent = t('dispatchBoard');
  const closeTabs = document.getElementById('dispatch-board-close-tabs');
  if (closeTabs) {
    closeTabs.textContent = t('dispatchCloseTabs');
    // Nothing to close once every tab is gone — hide the button so the header
    // doesn't offer a no-op.
    closeTabs.hidden = !dispatchJobs.some((j) => j && j.tabId != null);
  }
  const tiles = document.getElementById('dispatch-tiles');
  if (!tiles) return;
  tiles.innerHTML = dispatchJobs.map((job, i) => `
    <button type="button" class="tile" data-tab="${job.tabId == null ? '' : job.tabId}" data-url="${esc(job.url)}">
      <div class="nm"><span class="dot" style="background:${job.color}"></span>${i + 1}. ${esc(job.name)}</div>
      <div class="host">${esc(hostOf(job.url))}${job.repo ? ` · ${esc(job.repo)}` : ''}</div>
      <div class="pr">${esc(job.prompt)}</div>
    </button>`).join('');
}

function shakeDispatch() {
  dispatchShake = true;
  setDispatchOpen(true);
  renderDispatch();
}

function fireDispatch(agents, auto) {
  const prompt = (dispatchPrompt || '').trim();
  if (!prompt) { shakeDispatch(); return; }
  if (!agents.length) { shakeDispatch(); return; }
  if (dispatchKind === 'code' && dispatchRepo) {
    dispatchRepos = [dispatchRepo].concat(dispatchRepos.filter((r) => r !== dispatchRepo)).slice(0, 6);
  }
  const jobs = agents.map((a) => makeDispatchJob(a, prompt, dispatchRepo, auto, dispatchAutoSend));
  persistDispatch();
  chrome.runtime.sendMessage({ type: 'dispatchOpen', jobs, tile: dispatchTile, screen: screenArea() }, (opened) => {
    void chrome.runtime.lastError;
    const fresh = Array.isArray(opened) ? opened : jobs;
    // Accumulate across dispatches: keep the tabs still open from earlier
    // batches and prepend this batch, deduped by tabId.
    dispatchJobs = mergeDispatchJobs(dispatchJobs, fresh);
    persistDispatch();
    setDispatchOpen(false);
    // A single live destination doesn't need the whole tab board — just jump to
    // it. Prune closed tabs first so the count reflects what's actually open.
    pruneDispatchJobs(() => {
      if (dispatchJobs.length <= 1) {
        const only = dispatchJobs[0] || fresh[0];
        // Only jump to a tab we actually have an id for. If dispatchOpen failed
        // and we fell back to the pre-open jobs (no tabId), focusing by URL would
        // open a *second* identical tab, so just show the board instead.
        if (only && only.tabId != null) {
          chrome.runtime.sendMessage(
            { type: 'dispatchFocus', tabId: only.tabId, url: only.url },
            () => void chrome.runtime.lastError,
          );
        } else if (dispatchJobs.length) {
          openDispatchBoard();
        }
      } else {
        openDispatchBoard();
      }
    });
  });
}

function selectedAgents() {
  return selectedForKind(dispatchSelected, dispatchKind)
    .map((id) => dispatchById(id))
    .filter(Boolean);
}

const dispatchToggle = document.getElementById('dispatch-toggle');
if (dispatchToggle && dispatchToggle.addEventListener) {
  dispatchToggle.addEventListener('click', () => setDispatchOpen(!dispatchFloatOpen()));
}
const dispatchFold = document.getElementById('dispatch-fold');
if (dispatchFold && dispatchFold.addEventListener) {
  dispatchFold.addEventListener('click', () => setDispatchOpen(false));
}
const dispatchTabsBtn = document.getElementById('dispatch-tabs');
if (dispatchTabsBtn && dispatchTabsBtn.addEventListener) {
  dispatchTabsBtn.addEventListener('click', () => { setDispatchOpen(false); openDispatchBoard(); });
}
const dispatchKindEl = document.getElementById('dispatch-kind');
if (dispatchKindEl && dispatchKindEl.addEventListener) {
  dispatchKindEl.addEventListener('click', (e) => {
    const k = e.target && e.target.dataset && e.target.dataset.kind;
    if (!k) return;
    dispatchKind = k;
    persistDispatch();
    renderDispatch();
  });
}
const dispatchPromptEl = document.getElementById('dispatch-prompt');
if (dispatchPromptEl && dispatchPromptEl.addEventListener) {
  dispatchPromptEl.addEventListener('input', () => {
    dispatchPrompt = dispatchPromptEl.value;
    persistDispatch();
  });
  dispatchPromptEl.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (selectedAgents().length) fireDispatch(selectedAgents(), false);
      else {
        const one = pickAutoDispatch(dispatchKind, quotaMap);
        if (one) fireDispatch([one], true);
        else shakeDispatch();
      }
    }
  });
}
const dispatchSendEl = document.getElementById('dispatch-send');
if (dispatchSendEl && dispatchSendEl.addEventListener) {
  dispatchSendEl.addEventListener('change', () => {
    dispatchAutoSend = !!dispatchSendEl.checked;
    persistDispatch();
  });
}
const dispatchTileEl = document.getElementById('dispatch-tile');
if (dispatchTileEl && dispatchTileEl.addEventListener) {
  dispatchTileEl.addEventListener('change', () => {
    dispatchTile = !!dispatchTileEl.checked;
    persistDispatch();
  });
}
const dispatchRepoEl = document.getElementById('dispatch-repo');
if (dispatchRepoEl && dispatchRepoEl.addEventListener) {
  dispatchRepoEl.addEventListener('input', () => {
    dispatchRepo = dispatchRepoEl.value.trim();
    persistDispatch();
  });
}
const dispatchRecents = document.getElementById('dispatch-recents');
if (dispatchRecents && dispatchRecents.addEventListener) {
  dispatchRecents.addEventListener('click', (e) => {
    const repo = e.target && e.target.dataset && e.target.dataset.repo;
    if (!repo) return;
    dispatchRepo = repo;
    persistDispatch();
    renderDispatch();
  });
}
const dispatchChips = document.getElementById('dispatch-chips');
if (dispatchChips && dispatchChips.addEventListener) {
  dispatchChips.addEventListener('click', (e) => {
    let n = e.target;
    while (n && n !== e.currentTarget && !(n.dataset && n.dataset.agent)) n = n.parentNode;
    const id = n && n.dataset && n.dataset.agent;
    if (!id) return;
    const agent = dispatchById(id);
    if (!canDispatch(agent)) return;
    dispatchSelected = dispatchSelected.includes(id)
      ? dispatchSelected.filter((x) => x !== id)
      : dispatchSelected.concat(id);
    persistDispatch();
    renderDispatch();
  });
}
const dispatchReady = document.getElementById('dispatch-ready');
if (dispatchReady && dispatchReady.addEventListener) {
  dispatchReady.addEventListener('click', () => {
    const keep = dispatchSelected.filter((id) => {
      const a = dispatchById(id);
      return a && agentKind(a) !== dispatchKind;
    });
    dispatchSelected = keep.concat(pickReadyDispatch(dispatchKind, quotaMap).map((a) => a.id));
    persistDispatch();
    renderDispatch();
  });
}
const dispatchAutoBtn = document.getElementById('dispatch-auto');
if (dispatchAutoBtn && dispatchAutoBtn.addEventListener) {
  dispatchAutoBtn.addEventListener('click', () => {
    const one = pickAutoDispatch(dispatchKind, quotaMap);
    if (!one) { shakeDispatch(); return; }
    fireDispatch([one], true);
  });
}
const dispatchGo = document.getElementById('dispatch-go');
if (dispatchGo && dispatchGo.addEventListener) {
  dispatchGo.addEventListener('click', () => {
    const list = selectedAgents();
    if (!list.length) { shakeDispatch(); return; }
    fireDispatch(list, false);
  });
}
const dispatchBoardClose = document.getElementById('dispatch-board-close');
if (dispatchBoardClose && dispatchBoardClose.addEventListener) {
  dispatchBoardClose.addEventListener('click', closeDispatchBoard);
}
const dispatchBoardCloseTabs = document.getElementById('dispatch-board-close-tabs');
if (dispatchBoardCloseTabs && dispatchBoardCloseTabs.addEventListener) {
  dispatchBoardCloseTabs.addEventListener('click', closeDispatchTabs);
}
const dispatchTiles = document.getElementById('dispatch-tiles');
if (dispatchTiles && dispatchTiles.addEventListener) {
  dispatchTiles.addEventListener('click', (e) => {
    let n = e.target;
    while (n && n !== e.currentTarget && !(n.dataset && n.dataset.url != null)) n = n.parentNode;
    if (!n || !n.dataset) return;
    const tabId = n.dataset.tab ? Number(n.dataset.tab) : null;
    chrome.runtime.sendMessage({ type: 'dispatchFocus', tabId, url: n.dataset.url }, (res) => {
      void chrome.runtime.lastError;
      if (res && res.ok === false) {
        const foot = document.getElementById('dispatch-board-foot');
        if (foot) foot.textContent = t('dispatchGone');
      }
    });
  });
}

if (chrome.storage && chrome.storage.local && chrome.storage.local.get) {
  chrome.storage.local.get(['dispatchKind', 'dispatchPrompt', 'dispatchRepo', 'dispatchSelected', 'dispatchRepos', 'dispatchJobs', 'dispatchAutoSend', 'dispatchTile'], (res) => {
    if (res.dispatchKind === 'chat' || res.dispatchKind === 'code') dispatchKind = res.dispatchKind;
    if (typeof res.dispatchPrompt === 'string') dispatchPrompt = res.dispatchPrompt;
    if (typeof res.dispatchRepo === 'string') dispatchRepo = res.dispatchRepo;
    if (Array.isArray(res.dispatchSelected)) dispatchSelected = res.dispatchSelected;
    if (Array.isArray(res.dispatchRepos)) dispatchRepos = res.dispatchRepos;
    if (Array.isArray(res.dispatchJobs)) dispatchJobs = res.dispatchJobs;
    if (typeof res.dispatchAutoSend === 'boolean') dispatchAutoSend = res.dispatchAutoSend;
    if (typeof res.dispatchTile === 'boolean') dispatchTile = res.dispatchTile;
    // Some of those tabs may have been closed since; drop them before the
    // "Tabs · N" re-entry button reports a stale count.
    pruneDispatchJobs(() => renderDispatch());
  });
  chrome.storage.local.get(['crosscheckPrompt', 'crosscheckReviewer', 'crosscheckAutoSend'], (res) => {
    if (typeof res.crosscheckPrompt === 'string') crosscheckPromptStored = res.crosscheckPrompt;
    if (typeof res.crosscheckReviewer === 'string') crosscheckReviewer = res.crosscheckReviewer;
    if (typeof res.crosscheckAutoSend === 'boolean') crosscheckAutoSend = res.crosscheckAutoSend;
    renderCrosscheck();
  });
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes && changes.uiLang) applyStoredLang(changes.uiLang.newValue);
  if (changes && changes.captureLogs) {
    visibleLogs = pruneCaptureLogs(changes.captureLogs.newValue || []);
    renderLogRows();
  }
  render();
});
loadLang(render);
