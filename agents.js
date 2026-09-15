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

const AUTO_MIN_LEFT = 15;

function agentKind(agent) {
  return agent && agent.kind === 'chat' ? 'chat' : 'code';
}

function agentsForKind(kind) {
  return AGENTS.filter((a) => agentKind(a) === kind);
}

function leftoverOf(agent, map) {
  const row = map && agent && map[agent.id];
  const p = row && row.limits && row.limits[0] && row.limits[0].percent_left;
  return typeof p === 'number' ? p : null;
}

function isDispatchReady(agent, map) {
  const left = leftoverOf(agent, map);
  return left == null || left >= AUTO_MIN_LEFT;
}

function pickAutoDispatch(kind, map) {
  const pool = agentsForKind(kind).filter((a) => isDispatchReady(a, map));
  if (!pool.length) return null;
  const known = pool.filter((a) => leftoverOf(a, map) != null);
  const ranked = known.length ? known : pool;
  return ranked.reduce((best, a) => {
    const bl = leftoverOf(best, map);
    const al = leftoverOf(a, map);
    if (al == null) return best;
    if (bl == null) return a;
    return al > bl ? a : best;
  });
}

function pickReadyDispatch(kind, map) {
  return agentsForKind(kind).filter((a) => isDispatchReady(a, map));
}

function buildDispatch(agent, prompt, repo) {
  const text = (prompt || '').trim();
  switch (agent && agent.id) {
    case 'claude-code': {
      const u = new URL('https://claude.ai/code');
      u.searchParams.set('prompt', text);
      if (repo) u.searchParams.set('repositories', repo);
      return { url: u.toString(), fill: 'query' };
    }
    case 'codex': {
      const u = new URL('https://chatgpt.com/codex');
      u.searchParams.set('prompt', text);
      return { url: u.toString(), fill: 'query' };
    }
    case 'grok-build': {
      const u = new URL('https://grok.com/');
      u.searchParams.set('q', text);
      return { url: u.toString(), fill: 'query' };
    }
    case 'cursor':
    case 'grok-bot':
      return { url: 'https://cursor.com/agents', fill: 'script' };
    case 'gemini':
      return { url: 'https://gemini.google.com/app', fill: 'script' };
    default:
      return { url: agent && agent.page ? agent.page : 'about:blank', fill: 'script' };
  }
}

function makeDispatchJob(agent, prompt, repo, auto) {
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
    auto: !!auto,
    at: Date.now(),
  };
}

function putDispatchPending(map, tabId, job) {
  const next = Object.assign({}, map && typeof map === 'object' && !Array.isArray(map) ? map : {});
  if (tabId == null || !job || !job.prompt) return next;
  next[String(tabId)] = { prompt: job.prompt, host: job.host || '' };
  return next;
}

function takeDispatchPending(map, tabId) {
  if (!map || typeof map !== 'object') return { map: {}, job: null };
  if (map.prompt && map.tabId != null) {
    if (tabId != null && Number(map.tabId) === Number(tabId)) {
      return { map: {}, job: { prompt: map.prompt, host: map.host || '' } };
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
