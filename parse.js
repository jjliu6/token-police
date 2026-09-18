// Pure text parsers for usage pages (no DOM). Loaded before content.js.

function grokUsageSection(T) {
  const start = T.search(/Weekly SuperGrok Limit|Total Usage/i);
  if (start < 0) return T;
  const rest = T.slice(start);
  const endRel = rest.search(/Extra Usage Credits|Auto Top-Up/i);
  const end = endRel < 0 ? Math.min(rest.length, 3000) : Math.min(rest.length, endRel + 40);
  return rest.slice(0, end);
}

function grokCategories(section) {
  const names = ['Chat', 'App Builder', 'Automations', 'Imagine', 'Voice', 'API'];
  const bd = [];
  for (const nm of names) {
    const re = new RegExp(nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*(\\d+)\\s*%', 'i');
    const m = section.match(re);
    if (m) bd.push({ name: nm, percent: parseInt(m[1], 10) });
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
  const section = grokUsageSection(T);
  const breakdown = grokCategories(section);
  const catSum = breakdown.reduce((s, x) => s + x.percent, 0);
  const used = grokTotalUsed(section, catSum, breakdown.length);
  if (used == null) return null;
  return {
    used,
    reset: grokReset(section) || grokReset(T),
    breakdown,
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
