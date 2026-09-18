// Cross-check review-prompt assembly: GitHub-link detection, composer vs
// conversation.md length handling, reviewer pick (highest leftover quota),
// and a review job that reuses Dispatch open/fill.
//
// Classic script: popup.html <script> + background importScripts. Depends on
// i18n.js `t()` / `currentLang()` and agents.js `makeDispatchJob` /
// `buildDispatch` / `dispatchById` / `leftoverOf` / `canDispatch`.

const CROSSCHECK_QUERY_FILL_MAX = 1500;
const CROSSCHECK_COMPOSER_MAX = 8000;

function defaultCrosscheckPrompt(kind) {
  const key = kind === 'code' ? 'crosscheckPromptDefaultCode' : 'crosscheckPromptDefaultChat';
  if (typeof t === 'function') return t(key);
  if (kind === 'code') {
    return 'Below is a full development session between another coding agent and a user. Independently review whether it correctly understood and completed the user\'s request. Check its code changes, PR, test results and completion claims. Do not assume the previous agent\'s conclusions are correct. Point out omissions, errors, potential regressions, and anything still unverified.';
  }
  return 'Below is a conversation between another assistant and a user. Independently review whether it correctly understood and answered the user\'s request. Check the reasoning, claims, and completeness of the reply. Do not assume the previous assistant\'s conclusions are correct. Point out omissions, errors, and anything still unverified.';
}

function isStockCrosscheckPrompt(s) {
  const text = String(s || '').trim();
  if (!text) return true;
  const keys = ['crosscheckPromptDefault', 'crosscheckPromptDefaultChat', 'crosscheckPromptDefaultCode'];
  const langs = (typeof I18N === 'object' && I18N) ? Object.keys(I18N) : [];
  for (let i = 0; i < langs.length; i++) {
    const pack = I18N[langs[i]];
    if (!pack) continue;
    for (let k = 0; k < keys.length; k++) {
      if (pack[keys[k]] && pack[keys[k]] === text) return true;
    }
  }
  return false;
}

// Empty box (or whitespace-only) falls back to the i18n default for that
// kind. Chat must not get the coding "PR / tests / code changes" instruction.
function resolveCrosscheckPrompt(stored, kind) {
  const s = stored == null ? '' : String(stored);
  return s.trim() ? s : defaultCrosscheckPrompt(kind);
}

function crosscheckSourceName(meta) {
  const id = meta && meta.sourceAgent;
  if (!id) return '';
  if (typeof dispatchById === 'function') {
    const a = dispatchById(id);
    if (a && a.name) return a.name;
  }
  if (typeof AGENTS !== 'undefined' && Array.isArray(AGENTS)) {
    for (let i = 0; i < AGENTS.length; i++) {
      if (AGENTS[i] && AGENTS[i].id === id && AGENTS[i].name) return AGENTS[i].name;
    }
  }
  return '';
}

function crosscheckKindOf(meta) {
  return (meta && meta.sourceKind === 'code') ? 'code' : 'chat';
}

function crosscheckReviewerPool(kind, skipId) {
  const want = kind === 'code' ? 'code' : 'chat';
  return agentsForKind(want).filter((a) => canDispatch(a) && a.id !== skipId);
}

function conversationPlain(session) {
  const turns = (session && session.conversation) || [];
  return turns.map((m) => {
    const role = (m && m.role) || 'unknown';
    const label = role === 'user' ? 'User' : (role === 'assistant' ? 'Assistant' : role);
    const bits = [];
    if (m && m.text) bits.push(m.text);
    if (m && m.attachments && m.attachments.length) bits.push('Attachments: ' + m.attachments.join(', '));
    if (m && m.links && m.links.length) bits.push('Links: ' + m.links.join(', '));
    return `### ${label}\n\n${bits.join('\n')}`;
  }).join('\n\n');
}

function detectGithubContext(session) {
  const chunks = [];
  if (session && session.sessionUrl) chunks.push(session.sessionUrl);
  if (session && session.repository) chunks.push(session.repository);
  if (session && session.pullRequest) chunks.push(session.pullRequest);
  ((session && session.conversation) || []).forEach((m) => {
    if (m && m.text) chunks.push(m.text);
    if (m && m.links) chunks.push(m.links.join('\n'));
  });
  const blob = chunks.join('\n');
  const re = /https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?:\/(pull|issues)\/(\d+))?/gi;
  let repository = (session && session.repository) || '';
  let pullRequest = (session && session.pullRequest) || '';
  let m;
  while ((m = re.exec(blob))) {
    const repo = m[1];
    if (!repo || /^(orgs|settings|login|marketplace|features|topics|about|pricing)\b/i.test(repo)) continue;
    if (!repository) repository = repo;
    if (m[2] === 'pull' && m[3] && !pullRequest) {
      pullRequest = `https://github.com/${repo}/pull/${m[3]}`;
    }
  }
  return { repository, pullRequest };
}

function sessionToMarkdown(session) {
  const meta = detectGithubContext(session);
  const lines = [
    '# Cross-check session',
    '',
    `- Source: ${(session && session.sourceAgent) || 'unknown'} (${(session && session.sourceKind) || '?'})`,
    `- URL: ${(session && session.sessionUrl) || ''}`,
  ];
  if (meta.repository) lines.push(`- Repository: ${meta.repository}`);
  if (meta.pullRequest) lines.push(`- Pull request: ${meta.pullRequest}`);
  if (session && session.branch) lines.push(`- Branch: ${session.branch}`);
  lines.push('', '## Conversation', '', conversationPlain(session), '');
  return lines.join('\n');
}

function sessionSummary(session) {
  const turns = (session && session.conversation) || [];
  const chars = conversationPlain(session).length;
  const meta = detectGithubContext(session);
  const tr = (key, vars, fallback) => (typeof t === 'function' ? t(key, vars) : fallback);
  const bits = [
    tr('crosscheckSummaryMessages', { n: turns.length }, `${turns.length} messages`),
    tr('crosscheckSummaryChars', { n: chars }, `${chars} chars`),
  ];
  if (meta.repository) bits.push(tr('crosscheckSummaryRepo', { name: meta.repository }, 'repo ' + meta.repository));
  if (meta.pullRequest) bits.push(tr('crosscheckSummaryPr', null, 'PR linked'));
  return bits.join(' · ');
}

function assembleReviewText(session, instruction) {
  const prompt = resolveCrosscheckPrompt(instruction, crosscheckKindOf(session));
  const meta = detectGithubContext(session);
  const head = [
    prompt.trim(),
    '',
    `Source: ${(session && session.sourceAgent) || 'unknown'} (${(session && session.sourceKind) || '?'})`,
    `Session: ${(session && session.sessionUrl) || ''}`,
  ];
  if (meta.repository) head.push(`Repository: ${meta.repository}`);
  if (meta.pullRequest) head.push(`Pull request: ${meta.pullRequest}`);
  head.push('', '---', '', conversationPlain(session));
  return head.join('\n');
}

function reviewPayload(session, instruction) {
  const full = assembleReviewText(session, instruction);
  const markdown = sessionToMarkdown(session);
  const useFile = full.length > CROSSCHECK_COMPOSER_MAX;
  if (!useFile) {
    return {
      prompt: full,
      useFile: false,
      markdown,
      attachName: null,
      attachText: null,
      chars: full.length,
    };
  }
  const meta = detectGithubContext(session);
  const turns = (session && session.conversation) || [];
  const short = [
    resolveCrosscheckPrompt(instruction, crosscheckKindOf(session)).trim(),
    '',
    'The full session is in conversation.md (downloaded locally, and attached here if this composer accepts files). Do not assume the previous agent was correct.',
    '',
    `Source: ${(session && session.sourceAgent) || 'unknown'} · ${turns.length} messages`,
    `Session: ${(session && session.sessionUrl) || ''}`,
    meta.repository ? `Repository: ${meta.repository}` : '',
    meta.pullRequest ? `Pull request: ${meta.pullRequest}` : '',
  ].filter(Boolean).join('\n');
  return {
    prompt: short,
    useFile: true,
    markdown,
    attachName: 'conversation.md',
    attachText: markdown,
    chars: full.length,
  };
}

// Highest remaining quota among dispatchable reviewers of the same kind as
// the source (chat↔chat, code↔code). Skip the source agent. ChatGPT
// (quotaId null) never wins. Ties keep DISPATCH_TARGETS order. No
// AUTO_MIN_LEFT floor — Cross-check is "额度最多", not Dispatch's "ready" pool.
function pickCrosscheckReviewer(map, opts) {
  const kind = (opts && opts.kind) || 'chat';
  const skipId = opts && opts.skipId;
  const pool = crosscheckReviewerPool(kind, skipId).filter((a) => a.quotaId && leftoverOf(a, map) != null);
  if (!pool.length) return null;
  return pool.reduce((best, a) => (leftoverOf(a, map) > leftoverOf(best, map) ? a : best));
}

function firstCrosscheckReviewer(kind, skipId) {
  const pool = crosscheckReviewerPool(kind, skipId);
  return pool.length ? pool[0] : null;
}

// Prefill by default. Auto-send is the same gate as Dispatch: only chat
// script-fill surfaces (`canAutoSend()`), and only when the caller passes
// send=true. Code reviewers stay prefill-only. Long Claude Code reviews cannot
// use ?prompt= (URL cap); switch those to script fill. A conversation.md
// attachment also forces script fill.
function makeReviewJob(agent, payload, session, send) {
  const meta = detectGithubContext(session);
  const text = (payload && payload.prompt) || '';
  const repo = (agent && agent.kind === 'code') ? (meta.repository || '') : '';
  const job = makeDispatchJob(agent, text, repo, false, !!send);
  if (payload && payload.attachName && payload.attachText) {
    job.attachName = payload.attachName;
    job.attachText = payload.attachText;
  }
  const tooLongForQuery = text.length > CROSSCHECK_QUERY_FILL_MAX || !!(job.attachName);
  if (job.fill === 'query' && tooLongForQuery) {
    try {
      const u = new URL(job.url);
      u.searchParams.delete('prompt');
      job.url = u.toString();
    } catch (e) {}
    job.fill = 'script';
    // Still a coding target — canAutoSend stays false even after we drop query fill.
    job.send = false;
  }
  return job;
}
