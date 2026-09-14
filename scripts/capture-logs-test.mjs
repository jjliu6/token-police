import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ URL, Date });
vm.runInContext(readFileSync(resolve(root, 'capture-logs.js'), 'utf8'), ctx, { filename: 'capture-logs.js' });

const problems = [];
const now = Date.now();
const rows = [
  { timestamp: now - 31 * 86400000, status: 'failed', agent_id: 'old' },
  ...Array.from({ length: 5005 }, (_, i) => ({
    timestamp: now - 5005 + i,
    status: i % 2 ? 'success' : 'failed',
    agent_id: `agent-${i}`,
    agent_name: i === 5004 ? '=HYPERLINK("bad")' : 'Agent',
    trigger: 'manual',
    reason: i === 5003 ? '+cmd' : '',
    plan: i === 5002 ? '@formula' : '',
    credits: i === 5001 ? '-1 day' : '',
    limits: [{ label: i === 5002 ? '@formula' : 'Weekly', percent_left: 42, resets_text: '-1 day' }],
    source_url: 'https://example.com/usage',
  })),
];

const pruned = ctx.pruneCaptureLogs(rows, now);
if (pruned.length !== 5000) problems.push(`expected 5,000 retained logs, got ${pruned.length}`);
if (pruned.some((x) => x.agent_id === 'old')) problems.push('logs older than 30 days must be removed');
if (pruned[0].agent_id !== 'agent-5') problems.push(`retention should keep newest entries, first is ${pruned[0]?.agent_id}`);

const cleanUrl = ctx.sanitizeSourceUrl('https://example.com/usage?token=secret#account');
if (cleanUrl !== 'https://example.com/usage') problems.push(`source URL must drop query/hash, got ${cleanUrl}`);

const json = ctx.captureLogsJson(pruned);
const parsed = JSON.parse(json);
if (parsed.length !== 5000 || parsed[0].timestamp < parsed[1].timestamp) {
  problems.push('JSON export should contain logs in reverse chronological order');
}

const csv = ctx.captureLogsCsv(pruned);
if (!csv.startsWith('"timestamp","status"')) problems.push('CSV export should include a stable header');
if (/(?:^|,)"[=+\-@]/m.test(csv)) {
  problems.push('CSV contains a cell whose first character can trigger a spreadsheet formula');
}
for (const safe of ['"\'=HYPERLINK', '"\'+cmd"', '"\'@formula', '"\'-1 day"']) {
  if (!csv.includes(safe)) problems.push(`CSV should prefix formula-like values: ${safe}`);
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('ok  Capture logs retain 30 days / 5,000 newest entries');
console.log('ok  Source URLs drop query strings and hashes');
console.log('ok  JSON/CSV exports are reverse chronological and CSV-neutralize formulas');
console.log('\nCapture logs test passed.');
