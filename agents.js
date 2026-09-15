// 所有产品的统一注册表，background（importScripts）和 popup（<script>）共用。
// - page:   给用户手动打开的额度页
// - scrape: Refresh 时后台打开的抓取页（带 cawrefresh 标记，抓完自动关）
// - foreground: 重页面（后台标签页会被浏览器冻结），刷新时需要短暂切到前台
// - kind:   chat 直接开对话页；code 走云端 coding agent，可能要带仓库
const AGENTS = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    color: '#D97757',
    kind: 'code',
    page: 'https://claude.ai/new#settings/usage',
    scrape: ['https://claude.ai/new?cawrefresh=1#settings/usage'],
    foreground: false,
  },
  {
    id: 'codex',
    name: 'Codex',
    color: '#5CD6B3',
    kind: 'code',
    page: 'https://chatgpt.com/codex/cloud/settings/analytics#usage',
    scrape: ['https://chatgpt.com/codex/cloud/settings/analytics?cawrefresh=1#usage'],
    foreground: false,
  },
  {
    id: 'grok-build',
    name: 'Grok',
    color: '#B78CF0',
    kind: 'chat',
    page: 'https://grok.com/?_s=usage',
    scrape: ['https://grok.com/?_s=usage&cawrefresh=1'],
    foreground: true,
  },
  {
    id: 'cursor',
    name: 'Cursor',
    color: '#6E9BF5',
    kind: 'code',
    page: 'https://cursor.com/dashboard/usage',
    scrape: [
      'https://cursor.com/dashboard/usage?cawrefresh=1',
      'https://cursor.com/dashboard/spending?cawrefresh=1',
    ],
    foreground: true,
  },
  {
    // Grok Bot 的额度和 Cursor 在同一个 spending 页上（"Grok Bot › Weekly usage"），
    // 抓取 URL 与 Cursor 重复，background 会去重、只开一次页
    id: 'grok-bot',
    name: 'Grok Bot',
    color: '#F49AC1',
    kind: 'code',
    dispatch: false,
    page: 'https://cursor.com/dashboard/spending',
    scrape: ['https://cursor.com/dashboard/spending?cawrefresh=1'],
    foreground: true,
  },
  {
    id: 'gemini',
    name: 'Gemini',
    color: '#3B78E7',
    kind: 'chat',
    page: 'https://gemini.google.com/usage',
    scrape: ['https://gemini.google.com/usage?cawrefresh=1'],
    foreground: false,
  },
];

// 指派入口和额度卡分开：同一家产品 Chat / Code 不是同一个页面。
// quotaId 指向 AGENTS 里的额度卡；没有额度卡的（ChatGPT 对话）不参与 Auto。
const DISPATCH_TARGETS = [
  { id: 'claude-chat', name: 'Claude', color: '#D97757', kind: 'chat', quotaId: 'claude-code' },
  { id: 'chatgpt', name: 'ChatGPT', color: '#10A37F', kind: 'chat', quotaId: null },
  { id: 'grok-build', name: 'Grok', color: '#B78CF0', kind: 'chat', quotaId: 'grok-build' },
  { id: 'gemini', name: 'Gemini', color: '#3B78E7', kind: 'chat', quotaId: 'gemini' },
  { id: 'claude-code', name: 'Claude Code', color: '#D97757', kind: 'code', quotaId: 'claude-code' },
  { id: 'codex', name: 'Codex', color: '#5CD6B3', kind: 'code', quotaId: 'codex' },
  { id: 'cursor', name: 'Cursor', color: '#6E9BF5', kind: 'code', quotaId: 'cursor' },
  { id: 'grok-bot', name: 'Grok Bot', color: '#F49AC1', kind: 'code', quotaId: 'grok-bot', dispatch: false },
];

const AUTO_MIN_LEFT = 15;

function dispatchById(id) {
  return DISPATCH_TARGETS.find((a) => a.id === id) || null;
}

function agentKind(agent) {
  return agent && agent.kind === 'chat' ? 'chat' : 'code';
}

function agentsForKind(kind) {
  return DISPATCH_TARGETS.filter((a) => agentKind(a) === kind);
}

function canDispatch(agent) {
  return !!(agent && agent.dispatch !== false);
}

function leftoverOf(agent, map) {
  const id = agent && (agent.quotaId || agent.id);
  const row = map && id && map[id];
  const p = row && row.limits && row.limits[0] && row.limits[0].percent_left;
  return typeof p === 'number' ? p : null;
}

function isDispatchReady(agent, map) {
  if (!canDispatch(agent)) return false;
  const left = leftoverOf(agent, map);
  return left != null && left >= AUTO_MIN_LEFT;
}

function pickAutoDispatch(kind, map) {
  const pool = pickReadyDispatch(kind, map);
  if (!pool.length) return null;
  return pool.reduce((best, a) => (leftoverOf(a, map) > leftoverOf(best, map) ? a : best));
}

function pickReadyDispatch(kind, map) {
  return agentsForKind(kind).filter((a) => isDispatchReady(a, map));
}

function selectedForKind(ids, kind) {
  const allow = {};
  agentsForKind(kind).forEach((a) => { if (canDispatch(a)) allow[a.id] = true; });
  return (ids || []).filter((id) => allow[id]);
}

function buildDispatch(agent, prompt, repo) {
  const text = (prompt || '').trim();
  switch (agent && agent.id) {
    case 'claude-chat':
      // claude.ai/new?q= often auto-sends. Prefill only → script fill.
      return { url: 'https://claude.ai/new', fill: 'script' };
    case 'chatgpt':
      // chatgpt.com/?q= often auto-sends. Prefill only → script fill.
      return { url: 'https://chatgpt.com/', fill: 'script' };
    case 'claude-code': {
      const u = new URL('https://claude.ai/code');
      u.searchParams.set('prompt', text);
      if (repo) u.searchParams.set('repositories', repo);
      return { url: u.toString(), fill: 'query' };
    }
    case 'codex':
      return { url: 'https://chatgpt.com/codex', fill: 'script' };
    case 'grok-build':
      return { url: 'https://grok.com/', fill: 'script' };
    case 'cursor':
      return { url: 'https://cursor.com/agents', fill: 'script' };
    case 'gemini':
      return { url: 'https://gemini.google.com/app', fill: 'script' };
    default:
      return { url: 'about:blank', fill: 'script' };
  }
}

function makeDispatchJob(agent, prompt, repo, auto, send) {
  const built = buildDispatch(agent, prompt, repo);
  return {
    agentId: agent.id,
    name: agent.name,
    color: agent.color,
    kind: agentKind(agent),
    prompt: (prompt || '').trim(),
    repo: agentKind(agent) === 'code' ? (repo || '') : '',
    url: built.url,
    fill: built.fill,
    // Auto-send only makes sense for surfaces we type into ourselves.
    // 'query' fill hands the prompt to the site via the URL, so it decides.
    send: built.fill === 'script' ? !!send : false,
    auto: !!auto,
    at: Date.now(),
  };
}

function putDispatchPending(map, tabId, job) {
  const next = Object.assign({}, map && typeof map === 'object' && !Array.isArray(map) ? map : {});
  if (tabId == null || !job || !job.prompt) return next;
  next[String(tabId)] = { prompt: job.prompt, host: job.host || '', send: !!job.send };
  return next;
}

function takeDispatchPending(map, tabId) {
  if (!map || typeof map !== 'object') return { map: {}, job: null };
  if (map.prompt && map.tabId != null) {
    if (tabId != null && Number(map.tabId) === Number(tabId)) {
      return { map: {}, job: { prompt: map.prompt, host: map.host || '', send: !!map.send } };
    }
    return { map, job: null };
  }
  if (tabId == null) return { map, job: null };
  const key = String(tabId);
  const job = map[key] || map[tabId] || null;
  if (!job || !job.prompt) return { map, job: null };
  const next = Object.assign({}, map);
  delete next[key];
  if (tabId in next) delete next[tabId];
  return { map: next, job };
}

// Merge a fresh dispatch batch into the accumulated board: newest batch first,
// earlier tabs kept, deduped by tabId (a re-dispatched tab moves to the front).
// Closed tabs are pruned separately once the browser can be asked.
function mergeDispatchJobs(existing, fresh) {
  const list = Array.isArray(fresh) ? fresh : [];
  const seen = new Set(list.map((j) => j && j.tabId));
  const prior = (Array.isArray(existing) ? existing : []).filter((j) => j && !seen.has(j.tabId));
  return list.concat(prior);
}
