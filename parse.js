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
  // After a weekly reset the Usage modal often shows a single slice
  // ("Chat 2%") and no "Total Usage" heading. That one slice is the total.
  if (catCount >= 1 && catSum >= 0 && catSum <= 100) {
    if (used == null || (catCount >= 2 && used < catSum - 1)) used = catSum;
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

function looksLikeLogin(T) {
  if (!T) return false;
  if (/SuperGrok|Weekly SuperGrok Limit|All models|Weekly usage limit|Cursor Models|Weekly limit/i.test(T)) {
    return false;
  }
  return /\b(sign in|log in|sign-in|登录|se connecter|create an account)\b/i.test(T);
}

function grokCaptureReason(T, usageOpen) {
  if (parseGrokUsage(T)) return '';
  if (looksLikeLogin(T)) return 'need_signin';
  // Usage URL / overlay already painted: we failed to extract numbers, not to
  // wait out a slow load. Callers pass usageOpen when `_s=usage` is set.
  if (usageOpen) return 'parse_miss';
  if (T && /Weekly SuperGrok Limit|SuperGrok|Extra Usage Credits/i.test(T)) return 'parse_miss';
  return 'timeout';
}

function abortAfter(ms) {
  try {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      return AbortSignal.timeout(ms);
    }
  } catch (e) {}
  if (typeof AbortController !== 'function') return undefined;
  const c = new AbortController();
  setTimeout(() => { try { c.abort(); } catch (e) {} }, ms);
  return c.signal;
}

function grokResetText(ms) {
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return null;
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  let h = d.getHours();
  const min = String(d.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (!h) h = 12;
  return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear() + ' at ' + h + ':' + min + ' ' + ap;
}

function grokProductLabel(raw) {
  const s = String(raw || '').replace(/^Grok/i, '');
  if (/chat/i.test(s)) return 'Chat';
  if (/build|app.?builder/i.test(s)) return 'App Builder';
  if (/auto/i.test(s)) return 'Automations';
  if (/imag/i.test(s)) return 'Imagine';
  if (/voice/i.test(s)) return 'Voice';
  if (/api/i.test(s)) return 'API';
  return null;
}

function grokBytes(raw) {
  if (!raw) return null;
  if (raw instanceof Uint8Array) return raw;
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (typeof raw === 'string') {
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(raw);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i) & 0xff;
    return out;
  }
  if (Array.isArray(raw)) return Uint8Array.from(raw);
  return null;
}

function grokReadVarint(bytes, pos) {
  let value = 0, shift = 0;
  while (pos < bytes.length) {
    const b = bytes[pos++];
    value |= (b & 0x7f) << shift;
    if (!(b & 0x80)) return { value, pos };
    shift += 7;
    if (shift > 35) break;
  }
  return null;
}

function grokProtoFields(bytes, visit) {
  let pos = 0;
  while (pos < bytes.length) {
    const key = grokReadVarint(bytes, pos);
    if (!key) return;
    const number = key.value >>> 3;
    const wire = key.value & 7;
    pos = key.pos;
    if (wire === 0) {
      const v = grokReadVarint(bytes, pos);
      if (!v) return;
      visit(number, wire, v.value);
      pos = v.pos;
    } else if (wire === 1) {
      if (pos + 8 > bytes.length) return;
      visit(number, wire, bytes.subarray(pos, pos + 8));
      pos += 8;
    } else if (wire === 2) {
      const len = grokReadVarint(bytes, pos);
      if (!len || pos + len.value > bytes.length) return;
      pos = len.pos;
      visit(number, wire, bytes.subarray(pos, pos + len.value));
      pos += len.value;
    } else if (wire === 5) {
      if (pos + 4 > bytes.length) return;
      visit(number, wire, bytes.subarray(pos, pos + 4));
      pos += 4;
    } else return;
  }
}

function grokProtoBytesField(bytes, field) {
  let found = null;
  grokProtoFields(bytes, (number, wire, value) => {
    if (found || number !== field || wire !== 2) return;
    found = value;
  });
  return found;
}

function grokFloat32(bytes) {
  if (!bytes || bytes.length < 4) return null;
  return new DataView(bytes.buffer, bytes.byteOffset, 4).getFloat32(0, true);
}

function grokProtoTimestampMs(bytes) {
  let seconds = 0, nanos = 0;
  grokProtoFields(bytes, (number, wire, value) => {
    if (wire !== 0) return;
    if (number === 1) seconds = value;
    if (number === 2) nanos = value;
  });
  if (!seconds) return null;
  return seconds * 1000 + Math.floor(nanos / 1e6);
}

function grokGrpcWebPayload(bytes) {
  if (!bytes || !bytes.length) return null;
  if (bytes[0] === 0x7b) return null; // JSON
  if (bytes.length >= 5 && (bytes[0] === 0 || bytes[0] === 0x80)) {
    const chunks = [];
    let pos = 0;
    while (pos + 5 <= bytes.length) {
      const flags = bytes[pos];
      const len = ((bytes[pos + 1] * 0x1000000) + (bytes[pos + 2] << 16) + (bytes[pos + 3] << 8) + bytes[pos + 4]) >>> 0;
      pos += 5;
      if (len < 0 || pos + len > bytes.length) break;
      const payload = bytes.subarray(pos, pos + len);
      pos += len;
      if (!(flags & 0x80)) chunks.push(payload);
    }
    if (chunks.length) {
      if (chunks.length === 1) return chunks[0];
      let n = 0;
      chunks.forEach((c) => { n += c.length; });
      const out = new Uint8Array(n);
      let o = 0;
      chunks.forEach((c) => { out.set(c, o); o += c.length; });
      return out;
    }
  }
  return bytes;
}

function grokTryJson(bytes) {
  if (!bytes || !bytes.length || bytes[0] !== 0x7b) return null;
  try {
    const text = typeof TextDecoder === 'function'
      ? new TextDecoder('utf-8').decode(bytes)
      : String.fromCharCode.apply(null, bytes);
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

function grokCreditsFromConfig(config) {
  if (!config || typeof config !== 'object') return null;
  let used = config.creditUsagePercent;
  if (used == null) used = config.usagePercent;
  if (used == null) return null;
  used = Math.round(Number(used));
  if (!Number.isFinite(used) || used < 0 || used > 100) return null;
  const period = config.currentPeriod && typeof config.currentPeriod === 'object' ? config.currentPeriod : {};
  const end = period.end || config.billingPeriodEnd;
  const endMs = end ? Date.parse(end) : NaN;
  const breakdown = [];
  const pu = config.productUsage;
  if (Array.isArray(pu)) {
    pu.forEach((item) => {
      const name = grokProductLabel(item && (item.product || item.name));
      if (!name || item.usagePercent == null) return;
      const pct = Math.round(Number(item.usagePercent));
      if (pct >= 0 && pct <= 100) breakdown.push({ name, percent: pct });
    });
  }
  return {
    used,
    reset: Number.isFinite(endMs) ? grokResetText(endMs) : null,
    breakdown,
  };
}

function parseGrokCreditsJson(obj) {
  if (!obj || typeof obj !== 'object') return null;
  return grokCreditsFromConfig(obj.config && typeof obj.config === 'object' ? obj.config : obj);
}

function parseGrokCreditsConfig(raw) {
  const bytes = grokBytes(raw);
  if (!bytes || !bytes.length) return null;
  const json = grokTryJson(bytes);
  if (json) return parseGrokCreditsJson(json);
  const payload = grokGrpcWebPayload(bytes);
  if (!payload) return null;
  const config = grokProtoBytesField(payload, 1);
  if (!config) return parseGrokCreditsJson(payload);
  let used = null, usedPresent = false, endMs = null;
  const breakdown = [];
  grokProtoFields(config, (number, wire, value) => {
    if (number === 1 && wire === 5) {
      used = grokFloat32(value);
      usedPresent = true;
    }
    if (number === 5 && wire === 2) endMs = grokProtoTimestampMs(value);
    if (number === 7 && wire === 2) {
      let code = null, pct = null;
      grokProtoFields(value, (n, w, v) => {
        if (n === 1 && w === 0) code = v;
        if (n === 2 && w === 5) pct = grokFloat32(v);
        if (n === 1 && w === 2) code = typeof TextDecoder === 'function'
          ? new TextDecoder('utf-8').decode(v)
          : '';
      });
      const name = grokProductLabel(code);
      if (name != null && pct != null) {
        const rounded = Math.round(pct);
        if (rounded >= 0 && rounded <= 100) breakdown.push({ name, percent: rounded });
      }
    }
  });
  if (!usedPresent) used = 0;
  used = Math.round(Number(used));
  if (!Number.isFinite(used) || used < 0 || used > 100) return null;
  if (!usedPresent && endMs == null && !breakdown.length) return null;
  return { used, reset: endMs ? grokResetText(endMs) : null, breakdown };
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
