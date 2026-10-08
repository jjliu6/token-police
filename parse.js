// Pure text parsers for usage pages (no DOM). Loaded before content.js.

function grokUsageSection(T) {
  const start = T.search(/Weekly SuperGrok Limit|Total Usage/i);
  if (start < 0) return T;
  const rest = T.slice(start);
  const endRel = rest.search(/Extra Usage Credits|Auto Top-Up/i);
  const end = endRel < 0 ? Math.min(rest.length, 3000) : Math.min(rest.length, endRel + 40);
  return rest.slice(0, end);
}

function grokJoinUsedDigits(section) {
  return section.replace(
    /((?:\d[\t ]*\n?)*)(\d)[\t ]*(?:\n[\t ]*)*%[\t ]*(?:\n[\t ]*)*used/gi,
    (_, a, d) => (String(a) + d).replace(/\s+/g, '') + '% used'
  );
}

function grokHeadlineUsed(section) {
  const s = grokJoinUsedDigits(section);
  const re = /(\d+)\s*%\s*used/gi;
  let m;
  while ((m = re.exec(s))) {
    const n = parseInt(m[1], 10);
    if (n < 0 || n > 100) continue;
    const tail = (s.slice(Math.max(0, m.index - 80), m.index).split(/\n/).pop() || '').trim();
    // Slice aria ("App Builder 10% used") is not the weekly headline.
    if (/^[A-Za-z][A-Za-z0-9]*(?:\s+[A-Za-z][A-Za-z0-9]*){0,4}$/.test(tail)
        && !/^(?:total usage|weekly supergrok limit|supergrok)$/i.test(tail)) {
      continue;
    }
    return n;
  }
  return null;
}

function grokSkipSliceWord(w) {
  return /^(used|limit|usage|resets?|credits?|upgrade|weekly|total|supergrok|am|pm|auto|top-?up|buy|extra)$/i.test(w);
}

function grokSliceNameBefore(before) {
  const words = String(before).trim().split(/\s+/).filter(Boolean);
  const taken = [];
  for (let i = words.length - 1; i >= 0 && taken.length < 4; i--) {
    const w = words[i];
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(w) || grokSkipSliceWord(w)) break;
    taken.unshift(w);
  }
  return taken.length ? taken.join(' ') : null;
}

function grokCategories(section) {
  const flat = String(section).replace(/[ \t]*[\n\r]+[ \t]*/g, ' ').replace(/\s+/g, ' ');
  const re = /(\d{1,3}) ?%/g;
  const bd = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(flat))) {
    const percent = parseInt(m[1], 10);
    if (percent < 0 || percent > 100) continue;
    const after = flat.slice(m.index + m[0].length, m.index + m[0].length + 8);
    if (/^\s*used\b/i.test(after)) continue;
    const name = grokSliceNameBefore(flat.slice(0, m.index));
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    bd.push({ name, percent });
  }
  return bd;
}

function grokReset(T) {
  const m = T.match(/Resets\s+([A-Z][a-z]+\s+\d{1,2},?\s*\d{4}[^\n]*?[AP]M)/i);
  return m ? m[1].trim() : null;
}

function parseGrokUsage(T) {
  if (!T || !/SuperGrok/i.test(T)) return null;
  const section = grokUsageSection(T);
  const used = grokHeadlineUsed(section);
  if (used == null) return null;
  return {
    used,
    reset: grokReset(section) || grokReset(T),
    breakdown: grokCategories(section),
  };
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
