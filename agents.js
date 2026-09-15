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
    // 抓取 URL 与 Cursor 重复，background 会去重、只开一次页。
    // 产品本身是桌面/iOS 应用，没有可预填的网页 composer，所以不进入 Dispatch。
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

const AUTO_MIN_LEFT = 15;

function agentKind(agent) {
  return agent && agent.kind === 'chat' ? 'chat' : 'code';
}

function agentEnabled(agent, enabled) {
  return !enabled || !agent || enabled[agent.id] !== false;
}

function agentDispatchable(agent) {
  return !!(agent && agent.dispatch !== false);
}

function agentsForKind(kind, enabled) {
  return AGENTS.filter((a) => agentKind(a) === kind && agentEnabled(a, enabled) && agentDispatchable(a));
}

function leftoverOf(agent, map) {
  const row = map && agent && map[agent.id];
  const p = row && row.limits && row.limits[0] && row.limits[0].percent_left;
  return p == null || p === '' ? null : Number(p);
}

function leftoverLabel(agent, map) {
  const p = leftoverOf(agent, map);
  return p == null || Number.isNaN(p) ? '—' : String(Math.round(p));
}

function pickAutoDispatch(kind, map, enabled) {
  const pool = agentsForKind(kind, enabled).filter((a) => {
    const p = leftoverOf(a, map);
    return p != null && !Number.isNaN(p) && p >= AUTO_MIN_LEFT;
  });
  if (!pool.length) return null;
  return pool.reduce((best, a) => (leftoverOf(a, map) > leftoverOf(best, map) ? a : best));
}

function pickReadyDispatch(kind, map, enabled) {
  return agentsForKind(kind, enabled).filter((a) => {
    const p = leftoverOf(a, map);
    return p != null && !Number.isNaN(p) && p >= AUTO_MIN_LEFT;
  });
}

function selectedDispatchAgents(kind, ids, enabled) {
  const allow = {};
  agentsForKind(kind, enabled).forEach((a) => { allow[a.id] = a; });
  return (ids || []).map((id) => allow[id]).filter(Boolean);
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
    case 'codex':
      // Codex Cloud web is chatgpt.com/codex. The documented prompt= prefill is
      // ChatGPT chat (chatgpt.com/?prompt=) and the Codex desktop scheme
      // (codex://new?prompt=) — not the cloud composer. Script-fill so we
      // don't pretend an undocumented query param exists, and don't auto-send.
      return { url: 'https://chatgpt.com/codex', fill: 'script' };
    case 'grok-build':
      // grok.com/?q= often auto-submits. Prefill only — never send.
      return { url: 'https://grok.com/', fill: 'script' };
    case 'cursor':
      // Official Cloud Agents UI. No public prompt query param.
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
