// Local-only scrape audit log helpers. This file is shared by the service
// worker and side panel; it performs no network I/O.
const CAPTURE_LOG_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const CAPTURE_LOG_MAX_ENTRIES = 5000;

function sanitizeSourceUrl(value) {
  if (!value) return '';
  try {
    const u = new URL(value);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch (e) {
    return '';
  }
}

function pruneCaptureLogs(logs, now) {
  now = now == null ? Date.now() : now;
  const cutoff = now - CAPTURE_LOG_MAX_AGE_MS;
  return (Array.isArray(logs) ? logs : [])
    .filter((entry) => entry && Number(entry.timestamp) >= cutoff)
    .sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
    .slice(-CAPTURE_LOG_MAX_ENTRIES);
}

function captureLogsJson(logs) {
  return JSON.stringify((Array.isArray(logs) ? logs : []).slice()
    .sort((a, b) => Number(b.timestamp) - Number(a.timestamp)), null, 2);
}

function csvSafe(value) {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function captureLogsCsv(logs) {
  const columns = [
    'timestamp', 'status', 'agent_id', 'agent_name', 'trigger', 'duration_ms',
    'reason', 'percent_left', 'limits', 'tokens_total', 'credits', 'plan',
    'source_url', 'extension_version',
  ];
  const rows = (Array.isArray(logs) ? logs : []).slice()
    .sort((a, b) => Number(b.timestamp) - Number(a.timestamp))
    .map((entry) => columns.map((key) => {
      const value = key === 'limits' ? JSON.stringify(entry.limits || []) : entry[key];
      return csvSafe(value);
    }).join(','));
  return [columns.map(csvSafe).join(','), ...rows].join('\r\n');
}
