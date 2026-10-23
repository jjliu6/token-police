// Pure text parsers for usage pages (no DOM). Loaded before content.js.

// The usage dialog can show up twice in T: once in innerText (where Grok's
// animated NumberFlow digits are invisible, so the big "0%" is missing) and
// once in the Shadow-DOM walk (where they are present). Try every copy.
function grokUsageSections(T) {
  const out = [];
  const re = /Weekly SuperGrok Limit|Total Usage/gi;
  let m;
  while ((m = re.exec(T))) {
    const rest = T.slice(m.index);
    // Stop before Grok Bot's own bar so its "2% used" is never read as SuperGrok's.
    const endRel = rest.slice(1).search(/Weekly Grok Bot Limit|Extra Usage Credits|Auto Top-Up/i);
    const end = endRel < 0 ? Math.min(rest.length, 3000) : endRel + 1;
    out.push(rest.slice(0, end));
    re.lastIndex = m.index + end;
  }
  return out.length ? out : [T];
}

// Category slices under the weekly bar. Grok renames these every few months
// ("App Builder" became "Grok Build" in 2026-10), so known names come first and
// anything else shaped like "Some Name 7%" on its own line is picked up too.
const GROK_CATEGORY_NAMES = ['Chat', 'Grok Build', 'App Builder', 'Automations', 'Imagine', 'Voice', 'API', 'Companions'];
function grokCategories(section) {
  const bd = [];
  const taken = [];
  for (const nm of GROK_CATEGORY_NAMES) {
    const re = new RegExp('(^|[\\n•·\\s])' + nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\n?\\s*(\\d+)\\s*%', 'i');
    const m = section.match(re);
    if (m) { bd.push({ name: nm, percent: parseInt(m[2], 10) }); taken.push(m.index); }
  }
  // Generic "Name N%" lines the list above does not know yet (new slices).
  const generic = /(^|\n)\s*[•·]?\s*([A-Z][A-Za-z][A-Za-z &]{1,24}?)\s*\n?\s*(\d{1,3})\s*%\s*(?=\n|$)/g;
  let g;
  while ((g = generic.exec(section))) {
    const name = g[2].trim();
    if (/used|usage|limit|total|reset|credit/i.test(name)) continue;
    if (bd.some((x) => x.name.toLowerCase() === name.toLowerCase())) continue;
    if (taken.some((i) => Math.abs(i - g.index) < 3)) continue;
    bd.push({ name, percent: parseInt(g[3], 10) });
  }
  return bd;
}

function grokReset(T) {
  const m = T.match(/Resets\s+([A-Z][a-z]+\s+\d{1,2},?\s*\d{4}[^\n]*?[AP]M)/i);
  return m ? m[1].trim() : null;
}

function grokTotalUsed(section, catSum, catCount) {
  let used = null;
  const total = section.match(/Total Usage[\s\S]{0,200}?(\d+)\s*%/i);
  if (total) used = parseInt(total[1], 10);
  if (used == null) {
    const m = section.match(/(\d+)\s*%\s*used/i);
    if (m) used = parseInt(m[1], 10);
  }
  // Category slices on this page always add up to the weekly total. Prefer
  // that sum when the first "N% used" is a red herring or a mid-animation frame.
  if (catCount >= 2 && catSum >= 0 && catSum <= 100) {
    if (used == null || used < catSum - 1) used = catSum;
  }
  if (used == null || used < 0 || used > 100) return null;
  return used;
}

function parseGrokUsage(T) {
  if (!T || !/SuperGrok/i.test(T)) return null;
  for (const section of grokUsageSections(T)) {
    const breakdown = grokCategories(section);
    const catSum = breakdown.reduce((s, x) => s + x.percent, 0);
    const used = grokTotalUsed(section, catSum, breakdown.length);
    if (used == null) continue;
    return {
      used,
      reset: grokReset(section) || grokReset(T),
      breakdown,
    };
  }
  return null;
}

// Cursor's spending page is a heavy SPA. In a background tab Chrome often
// never paints the React tree, so innerText stays empty and the scrape times
// out. The same numbers live on the dashboard JSON the page itself fetches —
// same-origin, cookie session, no extra permissions. Parse that payload into
// the same shape the DOM scraper emits.
function cursorClampPct(n) {
  if (n == null || n === '') return null;
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v < 0 || v > 100) return null;
  return v;
}

function cursorTimestampMs(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw < 1e12 ? raw * 1000 : raw;
  }
  const s = String(raw).trim();
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return n < 1e12 ? n * 1000 : n;
  }
  const d = Date.parse(s);
  return Number.isFinite(d) ? d : null;
}

function cursorDaysLeftText(endMs, now) {
  if (endMs == null) return null;
  const days = Math.max(0, Math.round((endMs - now) / 86400000));
  return `(${days} days)`;
}

function cursorLeftText(endMs, now) {
  if (endMs == null) return null;
  const ms = endMs - now;
  if (!Number.isFinite(ms)) return null;
  if (ms <= 0) return '0 minutes left';
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  const bits = [];
  if (days) bits.push(days === 1 ? '1 day' : days + ' days');
  if (hours) bits.push(hours === 1 ? '1 hour' : hours + ' hours');
  if (!days && mins) bits.push(mins === 1 ? '1 minute' : mins + ' minutes');
  if (!bits.length) bits.push('1 minute');
  return bits.join(' and ') + ' left';
}

function cursorPlanUsage(usage) {
  if (!usage || typeof usage !== 'object') return null;
  if (usage.planUsage && typeof usage.planUsage === 'object') return usage.planUsage;
  const plan = usage.individualUsage && usage.individualUsage.plan;
  return plan && typeof plan === 'object' ? plan : null;
}

function cursorPlanLabel(plan) {
  const info = plan && plan.planInfo;
  if (!info || typeof info !== 'object') return null;
  const name = (info.planName || '').trim();
  const price = (info.price || '').trim();
  if (name && price) return (name + ' ' + price).replace(/\s+/g, ' ');
  return name || price || null;
}

function cursorGrokMissing(sand) {
  if (!sand || typeof sand !== 'object') return false;
  if (sand.usesPooledEnterpriseAllowance === true) return true;
  if (sand.includedLimitZero === true) return true;
  if (sand.hasNonZeroIncludedLimit === false) return true;
  return false;
}

function parseCursorDashboard(usage, plan, sand, now) {
  const t0 = now == null ? Date.now() : now;
  const pu = cursorPlanUsage(usage);
  const auto = pu ? cursorClampPct(pu.autoPercentUsed) : null;
  const api = pu ? cursorClampPct(pu.apiPercentUsed) : null;
  let cursor = null;
  if (auto != null) {
    const endMs = cursorTimestampMs(
      (plan && plan.planInfo && plan.planInfo.billingCycleEnd)
      || (usage && usage.billingCycleEnd)
    );
    const rt = cursorDaysLeftText(endMs, t0);
    const limits = [{ label: 'Cursor Models', percent_left: 100 - auto, resets_text: rt }];
    if (api != null) limits.push({ label: 'Other Models', percent_left: 100 - api, resets_text: rt });
    cursor = { limits, plan: cursorPlanLabel(plan) };
  }

  let grokBot = null;
  const grokMissing = cursorGrokMissing(sand);
  if (!grokMissing && sand && typeof sand === 'object' && sand.usagePercent != null) {
    const used = cursorClampPct(sand.usagePercent);
    if (used != null && sand.hasNonZeroIncludedLimit !== false) {
      grokBot = {
        limits: [{
          label: 'Weekly',
          percent_left: 100 - used,
          resets_text: cursorLeftText(cursorTimestampMs(sand.nextResetTimestampUtc), t0),
        }],
      };
    }
  }

  if (!cursor && !grokBot && !grokMissing) return null;
  return { cursor, grokBot, grokMissing };
}

function codexPctRemaining(block) {
  if (!block) return null;
  // 旧版 "44% remaining"，2026-10 新版 "97% left"
  const m = block.match(/(\d+)\s*%\s*(?:remaining|left)/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

function codexResetsText(block) {
  if (!block) return null;
  const m = block.match(/\bResets\s+(?:on\s+|at\s+)?([^\n]+)/i);
  if (!m) return null;
  // 新版有时 innerText 把 "Resets in 6d 4h" 和 "97% left" 拼在同一行，砍掉百分比尾巴
  const s = m[1].replace(/\s*\d+\s*%\s*(?:remaining|left)\b.*$/i, '').trim().replace(/\s+/g, ' ');
  if (!s || /^use\b/i.test(s)) return null;
  return s;
}

function codexBlock(T, startRe, endRe) {
  const start = T.search(startRe);
  if (start < 0) return null;
  const rest = T.slice(start);
  const endRel = rest.search(endRe);
  const end = endRel < 0 ? Math.min(rest.length, 420) : Math.min(rest.length, endRel);
  return rest.slice(0, end);
}

function claudePctUsed(block) {
  if (!block) return null;
  const m = block.match(/(\d+)\s*%\s*used/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

function claudeResetsText(block) {
  if (!block) return null;
  const m = block.match(/\bResets\s+([^\n]+)/i);
  if (!m) return null;
  const s = m[1].trim().replace(/\s+/g, ' ');
  return s || null;
}

// Claude usage: legacy "All models" / "Current session", or 2026-09
// "This week" / "Current session". Ignore Fable's extra weekly row and
// "This week's usage by product" (Claude Code 98% is share-of-week, not leftover).
function parseClaudeUsage(T) {
  if (!T) return null;
  const weeklyBlock = codexBlock(
    T,
    /All models|(?<!Fable\s)This week(?!['’]s)/i,
    /Current session|Fable this week|Usage credits|This week['’]s usage/i
  );
  const weekly = claudePctUsed(weeklyBlock);
  if (weekly == null) return null;
  const sessionBlock = codexBlock(
    T,
    /Current session/i,
    /This week(?!['’]s)|All models|Fable this week|Usage credits/i
  );
  const session = claudePctUsed(sessionBlock);
  return {
    weekly,
    weeklyReset: claudeResetsText(weeklyBlock),
    session,
    sessionReset: session == null ? null : claudeResetsText(sessionBlock),
  };
}

// Codex usage. 两种页面文案：
// - 旧（/codex/cloud/settings/analytics）："Weekly usage limit / 44% remaining / Resets Sep 26…"
// - 新（/settings/usage?tab=overview）："Weekly limit / Resets in 6d 4h / 97% left"，
//   页面下方 Analytics 区有复数 "Weekly limits" 表头，要排除。
function parseCodexUsage(T) {
  if (!T) return null;
  const WEEKLY = /Weekly (?:usage )?limit(?!s)/i;
  const FIVE = /5[\s-]?hour (?:usage )?limit(?!s)/i;
  const END = /Usage limit resets|Credits remaining|\d[\d,]*\s+credits remaining|^\s*Credits\s*$/im;
  if (!WEEKLY.test(T)) return null;
  const weeklyBlock = codexBlock(T, WEEKLY, new RegExp(`${FIVE.source}|${END.source}`, 'im'));
  const weekly = codexPctRemaining(weeklyBlock);
  if (weekly == null) return null;
  const fiveBlock = codexBlock(T, FIVE, new RegExp(`${WEEKLY.source}|${END.source}`, 'im'));
  const five = codexPctRemaining(fiveBlock);
  const creditsM = T.match(/Credits remaining[\s\S]{0,20}?(\d[\d,]*)/i)
    || T.match(/(\d[\d,]*)\s+credits remaining/i);
  return {
    weekly,
    weeklyReset: codexResetsText(weeklyBlock),
    five,
    fiveReset: five == null ? null : codexResetsText(fiveBlock),
    credits: creditsM ? creditsM[1] : null,
  };
}

// ---------------------------------------------------------------------------
// Grok REST self-learning.
//
// The usage dialog on grok.com is drawn from a JSON request the page makes.
// grok-rest-tap.js (MAIN world) hands every grok.com /rest/ JSON response to
// content.js. Once the DOM scrape has succeeded a single time we *correlate*
// those responses with the numbers we just read: which leaf equals "10% used",
// which leaf is the reset timestamp, where the category slices live. The result
// is a small "map" (request to replay + JSON paths). From then on a refresh
// replays that request itself — no dialog, no animation, no background-tab
// throttling — and the DOM is only a fallback that re-teaches the map when the
// API shape changes. These functions are pure so they can be unit-tested.
// ---------------------------------------------------------------------------

function grokParseResetMs(text) {
  if (!text) return null;
  const t = String(text).trim().replace(/\s+at\s+/i, ' ').replace(/\s+(PT|PST|PDT|ET|EST|EDT|UTC|GMT)$/i, '');
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? ms : null;
}

function grokFormatReset(ms) {
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return null;
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  let h = d.getHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} at ${h}:${mm} ${ap}`;
}

// Flatten JSON into [{ path: ['a','0','b'], key: 'b', value, parent }] leaves.
function grokJsonLeaves(json, maxLeaves) {
  const out = [];
  const limit = maxLeaves || 4000;
  const walk = (node, path, depth) => {
    if (out.length >= limit || depth > 12) return;
    if (node === null || typeof node !== 'object') {
      out.push({ path, key: path.length ? path[path.length - 1] : '', value: node });
      return;
    }
    const keys = Array.isArray(node) ? node.map((_, i) => String(i)) : Object.keys(node);
    for (const k of keys) {
      if (out.length >= limit) return;
      const child = node[k];
      if (child !== null && typeof child === 'object') walk(child, path.concat(k), depth + 1);
      else out.push({ path: path.concat(k), key: k, value: child, parent: node, parentPath: path });
    }
  };
  walk(json, [], 0);
  return out;
}

function grokGetPath(json, path) {
  let cur = json;
  for (const k of path || []) {
    if (cur === null || typeof cur !== 'object' || !(k in cur)) return undefined;
    cur = cur[k];
  }
  return cur;
}

// How a numeric leaf relates to "N% used": percent used, fraction used,
// percent remaining, fraction remaining. Returns the kind or null.
function grokUsedKind(value, used) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (Math.abs(value - used) < 0.5) return 'used';
  if (Math.abs((100 - value) - used) < 0.5 && value >= 0 && value <= 100) return 'remaining';
  if (value >= 0 && value <= 1 && Math.abs(value * 100 - used) < 0.5) return 'usedFraction';
  if (value >= 0 && value <= 1 && Math.abs((1 - value) * 100 - used) < 0.5) return 'remainingFraction';
  return null;
}

function grokUsedFromKind(value, kind) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  let used;
  if (kind === 'used') used = value;
  else if (kind === 'remaining') used = 100 - value;
  else if (kind === 'usedFraction') used = value * 100;
  else if (kind === 'remainingFraction') used = (1 - value) * 100;
  else return null;
  used = Math.round(used);
  if (used < 0 || used > 100) return null;
  return used;
}

function grokResetKind(value, resetMs) {
  if (resetMs == null) return null;
  const TOL = 120000;
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (Math.abs(value - resetMs) <= TOL) return 'ms';
    if (Math.abs(value * 1000 - resetMs) <= TOL) return 's';
    return null;
  }
  if (typeof value === 'string' && value.length >= 8 && value.length <= 40) {
    const ms = Date.parse(value);
    if (Number.isFinite(ms) && Math.abs(ms - resetMs) <= TOL) return 'iso';
  }
  return null;
}

function grokResetFromKind(value, kind) {
  if (kind === 'ms' && typeof value === 'number') return value;
  if (kind === 's' && typeof value === 'number') return value * 1000;
  if (kind === 'iso' && typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

const GROK_USED_HINT = /used|usage|consum|spent|percent|pct|utiliz/i;
const GROK_REMAIN_HINT = /remain|left|avail/i;
const GROK_URL_HINT = /usage|limit|quota|billing|subscription|rate/i;
const GROK_DROP_HEADERS = /^(cookie|authorization|content-length|host|origin|referer|user-agent|sec-|accept-encoding|connection)/i;

function grokNorm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

function grokCleanHeaders(headers) {
  const out = {};
  Object.keys(headers || {}).forEach((k) => {
    if (GROK_DROP_HEADERS.test(k)) return;
    const v = headers[k];
    if (typeof v === 'string' && v.length < 2000) out[k] = v;
  });
  return out;
}

function grokPathHasKind(leaf, hintRe) {
  return (leaf.path || []).some((k) => hintRe.test(String(k)));
}

// Learn where the category slices live. Two shapes are recognised:
//  - fixed path:  { chatPercent: 16, automationsPercent: 6 }  → one entry per slice
//  - array:       { breakdown: [{ name: 'Chat', percent: 16 }, ...] }
//                 → one rule that reads *every* element, so new slices show up by themselves.
function grokLearnBreakdown(leaves, breakdown) {
  const rules = [];
  for (const cat of breakdown || []) {
    const want = grokNorm(cat.name);
    if (!want) continue;
    let hit = null;
    for (const leaf of leaves) {
      const kind = grokUsedKind(leaf.value, cat.percent);
      if (!kind || kind === 'remaining' || kind === 'remainingFraction') continue;
      // array element whose sibling string names the category
      const parent = leaf.parent;
      if (parent && !Array.isArray(parent) && leaf.parentPath && leaf.parentPath.length && /^\d+$/.test(leaf.parentPath[leaf.parentPath.length - 1])) {
        const nameKey = Object.keys(parent).find((k) => typeof parent[k] === 'string' && grokNorm(parent[k]) === want);
        if (nameKey) {
          hit = { type: 'array', arrayPath: leaf.parentPath.slice(0, -1), nameKey, valueKey: leaf.key, kind };
          break;
        }
      }
      if (leaf.path.some((k) => grokNorm(k).includes(want))) {
        hit = { type: 'path', name: cat.name, path: leaf.path, kind };
        break;
      }
    }
    if (!hit) continue;
    if (hit.type === 'array') {
      if (!rules.some((r) => r.type === 'array' && r.arrayPath.join('/') === hit.arrayPath.join('/'))) rules.push(hit);
    } else rules.push(hit);
  }
  return rules;
}

function grokReadBreakdown(rules, json) {
  const out = [];
  for (const r of rules || []) {
    if (r.type === 'array') {
      const arr = grokGetPath(json, r.arrayPath);
      if (!Array.isArray(arr)) continue;
      arr.forEach((el) => {
        if (!el || typeof el !== 'object') return;
        const name = el[r.nameKey];
        const pct = grokUsedFromKind(el[r.valueKey], r.kind);
        if (typeof name === 'string' && name && pct != null) out.push({ name, percent: pct });
      });
    } else if (r.type === 'path') {
      const pct = grokUsedFromKind(grokGetPath(json, r.path), r.kind);
      if (pct != null) out.push({ name: r.name, percent: pct });
    }
  }
  return out;
}

// candidates: [{ url, method, body, headers, status, json }] seen by the tap.
// parsed: the DOM result { used, reset, breakdown }. Returns a map or null.
// At 0% or 100% used every stray 0 / 100 / 1.0 in a response "matches", so a
// map learned then could lock onto the wrong field and read 0% forever. Wait
// for a reading in between.
function grokLearnSkipped(parsed) {
  return !parsed || parsed.used == null || parsed.used <= 0 || parsed.used >= 100;
}

function learnGrokApiMap(candidates, parsed, now) {
  if (grokLearnSkipped(parsed) || !Array.isArray(candidates) || !candidates.length) return null;
  const resetMs = grokParseResetMs(parsed.reset);
  let best = null;
  for (const c of candidates) {
    if (!c || !c.url || c.json == null || typeof c.json !== 'object') continue;
    if (c.status != null && (c.status < 200 || c.status >= 300)) continue;
    const leaves = grokJsonLeaves(c.json);
    let usedLeaf = null, usedKind = null, usedScore = -Infinity, usedHinted = false;
    for (const leaf of leaves) {
      const kind = grokUsedKind(leaf.value, parsed.used);
      if (!kind) continue;
      const remainingKind = kind === 'remaining' || kind === 'remainingFraction';
      let score = 0;
      const hinted = grokPathHasKind(leaf, remainingKind ? GROK_REMAIN_HINT : GROK_USED_HINT);
      if (hinted) score += 2;
      else if (grokPathHasKind(leaf, remainingKind ? GROK_USED_HINT : GROK_REMAIN_HINT)) score -= 2;
      if (kind === 'used') score += 1; // prefer the plain percent reading on ties
      if (leaf.path.length <= 3) score += 0.5;
      if (score > usedScore) { usedScore = score; usedLeaf = leaf; usedKind = kind; usedHinted = hinted; }
    }
    if (!usedLeaf) continue;
    let resetLeaf = null, resetKind = null;
    if (resetMs != null) {
      for (const leaf of leaves) {
        const kind = grokResetKind(leaf.value, resetMs);
        if (kind) { resetLeaf = leaf; resetKind = kind; break; }
      }
    }
    const urlHinted = GROK_URL_HINT.test(c.url);
    // A bare number equal to the total with no hint anywhere (key name, reset
    // timestamp alongside, usage-ish URL) is a coincidence, not a map.
    if (!usedHinted && !resetLeaf && !urlHinted) continue;
    let score = 2 + Math.max(0, usedScore) + (resetLeaf ? 2 : 0) + (urlHinted ? 1 : 0);
    if (usedScore < 0) score -= 2;
    if (score < 3) continue;
    if (best && score <= best.score) continue;
    best = {
      score,
      map: {
        version: 1,
        learnedAt: now == null ? Date.now() : now,
        request: {
          url: c.url,
          method: (c.method || 'GET').toUpperCase(),
          headers: grokCleanHeaders(c.headers),
          body: typeof c.body === 'string' ? c.body : null,
        },
        used: { path: usedLeaf.path, kind: usedKind },
        reset: resetLeaf ? { path: resetLeaf.path, kind: resetKind } : null,
        breakdown: grokLearnBreakdown(leaves, parsed.breakdown),
      },
    };
  }
  return best ? best.map : null;
}

// Apply a learned map to a fresh JSON response. Null when the shape no longer fits.
function readGrokApiMap(map, json) {
  if (!map || !map.used || !json || typeof json !== 'object') return null;
  const used = grokUsedFromKind(grokGetPath(json, map.used.path), map.used.kind);
  if (used == null) return null;
  let resetAt = null;
  if (map.reset) resetAt = grokResetFromKind(grokGetPath(json, map.reset.path), map.reset.kind);
  return { used, resetAt, breakdown: grokReadBreakdown(map.breakdown, json) };
}

// ---------------------------------------------------------------------------
// Failure triage. "read_failed" told nobody anything; these say *which layer*
// broke so the card can give a real hint and the log carries a text sample.
// ---------------------------------------------------------------------------
function classifyCaptureFailure(host, text) {
  const T = (text || '').replace(/\s+/g, ' ').trim();
  if (T.length < 40) return 'blank_page';
  if (/\b(sign in|log in|login|se connecter|登录|登入)\b/i.test(T) && !/\d\s*%/.test(T)) return 'login_required';
  if ((host || '').includes('grok.com')) {
    if (!/SuperGrok|Weekly[^.]{0,20}Limit|Total Usage|Extra Usage Credits/i.test(T)) return 'usage_view_closed';
    return 'parse_failed';
  }
  if (!/\d\s*%/.test(T)) return 'usage_view_closed';
  return 'parse_failed';
}

// A short, email-free sample of the page text around the usage block for the
// local log. Everything stays on the machine; this exists so a layout change
// can be fixed from the log instead of from guesswork.
function captureTextSample(text, max) {
  const limit = max || 700;
  let T = (text || '').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
  T = T.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]');
  const anchor = T.search(/SuperGrok|Weekly|Usage|usage limit|Current usage|Cursor Models/i);
  const start = anchor > 200 ? anchor - 200 : 0;
  let s = T.slice(start, start + limit);
  if (start > 0) s = '…' + s;
  if (start + limit < T.length) s += '…';
  return s;
}
