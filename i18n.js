// UI strings. Default English; user can switch to Chinese and it is stored.
let uiLang = 'en';

function currentLang() {
  return uiLang === 'zh' ? 'zh' : 'en';
}

const I18N = {
  en: {
    brand: 'TOKEN POLICE',
    legend: 'number = remaining',
    refresh: 'Refresh',
    fetching: 'Fetching…',
    left: 'left',
    pctLeft: '{n}% left',
    thisPeriod: 'This period',
    empty: 'No data yet — click "Refresh", or open its usage page in a normal tab.',
    firstTime: 'First time? Click "Refresh" to fetch data.',
    updated: 'Updated {time}',
    fetchingHint: 'Fetching… tabs may flash open and close. Results stay in this side panel.',
    justNow: 'just now',
    minsAgo: '{n}m ago',
    hoursAgo: '{n}h ago',
    daysAgo: '{n}d ago',
    resettingSoon: 'resetting soon',
    resetInDays: 'reset in {n}d',
    resetInHours: 'reset in {n}h',
    resetInMins: 'reset in {n}m',
    burnCollecting: 'Burn rate: collecting… (need more data)',
    burnBarely: 'Barely used lately',
    burnTillReset: 'Burning ~{n}%/day · lasts till reset',
    burnEmptyHours: '~{n}h to empty',
    burnEmptyDays: '~{n}d to empty',
    burnBefore: ' (before reset!)',
    burnLine: 'Burning ~{n}%/day · {eta}',
    credits: 'credits {n}',
    tokens: '{n} tokens',
    tracked: 'Tracked:',
    gearTitle: 'Settings',
    autoCheck: 'Hourly auto-check',
    autoCheckTip: 'Every hour, quietly re-checks all tracked agents in background tabs — never steals focus. A page that won’t render in a background tab (can happen with Cursor/Grok) just keeps its last data; click Refresh for a guaranteed update.',
    notifyLow: 'Low-quota alerts',
    notifyLowTip: 'Notify when a tracked agent drops below 15% (and again below 5%) remaining.',
    checkUpdates: 'Check for updates',
    checkUpdatesTip: 'Once a day, asks GitHub which version is the latest release (no account or usage data is sent) and shows a notice at the bottom when a newer one exists.',
    versionTitle: 'Installed version — click to open the download page',
    upToDate: 'up to date',
    updateAvail: 'New version {v} available — download ↗',
    builtBy: 'Built by {name} at {org} · MIT License · {src}',
    creditsSrc: 'Source on GitHub',
    disclaimer: 'Unofficial. Not affiliated with Anthropic, OpenAI, xAI, Cursor or Google. It only reads usage numbers already shown on each product\'s own page.',
    share: 'Share',
    shareTitle: 'Share Token Police',
    sharePitch: 'Remaining Claude Code, Codex, Cursor, Grok & Gemini quota in one Chrome side panel. Free, open source — nothing leaves your browser.',
    shareCopy: 'Copy link',
    shareCopied: 'Copied',
    shareX: 'Share on X',
    shareClose: 'Close',
    shareTweet: 'Token Police: remaining Claude, Codex, Cursor, Grok & Gemini quota in one Chrome side panel. {url}',
    shareShotAlt: 'Token Police dashboard preview',
    lowTitle: '{name}: {n}% left',
    lowBody: 'Usage quota is running low.',
    lowBodyR: 'Usage quota is running low. Resets {r}.',
    openPage: 'Open page',
    fetchFailed: "Last refresh couldn't read this page — you may need to sign in.",
    sectionMissing: "Cursor's spending page has no Grok Bot section — untick it in ⚙ if you don't use it.",
    spark7d: 'Remaining % — past 7 days',
    showHair: 'Hair mascot',
    hairLabel: 'HAIR LEFT',
    showHairTip: 'A little person who floats on the dashboard. Hair falls while you sit — 2 hours normally, 1 hour if a tracked agent is burning hard. Remaining quota is a ceiling. Finish a stretch and it grows back; it also returns at reset. Drag it, or let it wander.',
    hairTip: 'Hair left: {n}% — falls over the sit clock (1h when you burn hard, 2h otherwise). Finish a move to grow it back.',
    actHint: 'Pick one — finish it to grow the hair back.',
    actDoing: 'Doing: {act}',
    actDoingNote: 'Go do it. Come back and tap Done: hair grows back and the numbers return.',
    actDone: "Done — hair's back",
    moveReminder: 'Move reminder',
    moveReminderTip: 'When a tracked agent burns more than 10% of its quota within 2 hours, nudge you to stand up and move (at most once every 2 hours per agent).',
    moveTitle: '{name}: {n}% burned in 2h 🔥',
    moveBody: 'Stand up, stretch, touch some grass. No movement, no more vibe coding.',
    weeklyAll: 'Weekly (All models)',
    session5h: 'Session (5h)',
    weekly: 'Weekly',
    fiveHour: '5-hour limit',
    weeklyGrok: 'Weekly (SuperGrok)',
    cursorModels: 'Cursor Models',
    otherModels: 'Other Models',
    currentUsage: 'Current usage',
    chat: 'Chat',
    build: 'Build',
    auto: 'Auto',
    imagine: 'Img',
    voice: 'Voice',
    api: 'API',
  },
  zh: {
    brand: 'TOKEN POLICE',
    legend: '数字为剩余额度',
    refresh: '刷新',
    fetching: '刷新中…',
    left: '剩余',
    pctLeft: '剩 {n}%',
    thisPeriod: '本周期',
    empty: '暂无数据 — 点「刷新」，或在普通标签页打开对应额度页面。',
    firstTime: '第一次用？点「刷新」拉取数据。',
    updated: '{time} 更新',
    fetchingHint: '正在抓取… 标签页会闪一下自动开关，结果会留在这个侧边栏里。',
    justNow: '刚刚',
    minsAgo: '{n} 分钟前',
    hoursAgo: '{n} 小时前',
    daysAgo: '{n} 天前',
    resettingSoon: '即将重置',
    resetInDays: '还 {n} 天重置',
    resetInHours: '还 {n} 小时重置',
    resetInMins: '还 {n} 分钟重置',
    burnCollecting: '消耗速度：记录中…（需更多数据）',
    burnBarely: '近期几乎没消耗',
    burnTillReset: '消耗 ~{n}%/天 · 能撑到重置',
    burnEmptyHours: '约 {n} 小时后见底',
    burnEmptyDays: '约 {n} 天后见底',
    burnBefore: ' (早于重置！)',
    burnLine: '消耗 ~{n}%/天 · {eta}',
    credits: '积分 {n}',
    tokens: '{n} tokens',
    tracked: '跟踪：',
    gearTitle: '设置',
    autoCheck: '每小时自动检查',
    autoCheckTip: '每小时在后台标签页悄悄检查所有勾选的产品，绝不抢焦点。个别页面（常见于 Cursor/Grok）在后台渲染不出来时保持原数据；要保证最新就点「刷新」。',
    notifyLow: '低额度提醒',
    notifyLowTip: '跟踪的产品剩余额度跌破 15%（以及 5%）时弹出通知。',
    checkUpdates: '检查更新',
    checkUpdatesTip: '每天向 GitHub 查一次最新发布的版本（不发送任何账号或用量数据），有新版时在面板底部提示。',
    versionTitle: '当前安装的版本 — 点击打开下载页',
    upToDate: '已是最新',
    updateAvail: '有新版本 {v} — 去下载 ↗',
    builtBy: '由 {name} @ {org} 构建 · MIT 协议 · {src}',
    creditsSrc: 'GitHub 源码',
    disclaimer: '非官方项目，与 Anthropic、OpenAI、xAI、Cursor、Google 均无关联。它只读取各产品页面上已经展示的用量数字。',
    share: '分享',
    shareTitle: '分享 Token Police',
    sharePitch: '一个 Chrome 侧边栏看清 Claude Code、Codex、Cursor、Grok、Gemini 还剩多少额度。免费开源，数据不出浏览器。',
    shareCopy: '复制链接',
    shareCopied: '已复制',
    shareX: '分享到 X',
    shareClose: '关闭',
    shareTweet: 'Token Police：一个 Chrome 侧边栏看清 Claude、Codex、Cursor、Grok、Gemini 还剩多少额度。{url}',
    shareShotAlt: 'Token Police 面板预览',
    lowTitle: '{name}：剩余 {n}%',
    lowBody: '额度即将用完。',
    lowBodyR: '额度即将用完。重置时间：{r}',
    openPage: '打开页面',
    fetchFailed: '上次刷新没抓到数据，可能需要登录。',
    sectionMissing: 'Cursor 的 spending 页里没有 Grok Bot 区块，没用到的话可在 ⚙ 里取消勾选。',
    spark7d: '近 7 天剩余额度走势',
    showHair: '发量小人',
    hairLabel: '发量',
    showHairTip: '会在面板上漂着的小人。坐着头发就会掉：平时 2 小时掉完，某个产品烧得猛则 1 小时掉完；额度剩余是上限。做完运动会长回来，额度重置时也会长回来。可以拖，也会自己晃。',
    hairTip: '发量 {n}% — 坐着就会掉（烧得猛 1 小时掉完，平时 2 小时）。做完运动会长回来。',
    actHint: '挑一件去做，做完头发就长回来。',
    actDoing: '正在做：{act}',
    actDoingNote: '去做吧。回来点「完成」，头发就长回来，数字也重新显示。',
    actDone: '完成，头发长回来了',
    moveReminder: '动一动提醒',
    moveReminderTip: '某个产品 2 小时内消耗超过 10% 额度时，提醒你起来动一动（每个产品每 2 小时最多一次）。',
    moveTitle: '{name}：2 小时烧了 {n}% 🔥',
    moveBody: '起来伸个懒腰、出去透口气。不动一动，就别接着 vibe coding 了！',
    weeklyAll: 'Weekly 额度 (All models)',
    session5h: '当前会话 (5h)',
    weekly: 'Weekly 额度',
    fiveHour: '5 小时额度',
    weeklyGrok: 'Weekly 额度 (SuperGrok)',
    cursorModels: 'Cursor Models',
    otherModels: 'Other Models',
    currentUsage: '当前用量',
    chat: '聊天',
    build: '构建',
    auto: '自动',
    imagine: '绘图',
    voice: '语音',
    api: 'API',
  },
};

function t(key, vars) {
  const pack = I18N[currentLang()] || I18N.en;
  let s = pack[key] || I18N.en[key] || key;
  if (vars) {
    Object.keys(vars).forEach((k) => {
      s = s.split('{' + k + '}').join(vars[k]);
    });
  }
  return s;
}

function applyI18n() {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = currentLang() === 'zh' ? 'zh' : 'en';
  const brand = document.getElementById('brand-name');
  if (brand) brand.textContent = t('brand');
  const legend = document.getElementById('legend');
  if (legend) legend.textContent = t('legend');
  const btn = document.getElementById('refresh');
  if (btn && !btn.disabled) btn.textContent = t('refresh');
  const langBtn = document.getElementById('lang');
  if (langBtn) {
    langBtn.textContent = currentLang() === 'zh' ? 'EN' : '中文';
    langBtn.title = currentLang() === 'zh' ? 'Switch to English' : '切换到中文';
  }
  const gearBtn = document.getElementById('gear');
  if (gearBtn) gearBtn.title = t('gearTitle');
  const shareBtn = document.getElementById('share');
  if (shareBtn) {
    shareBtn.textContent = t('share');
    shareBtn.title = t('shareTitle');
  }
  if (typeof fillShareCard === 'function') fillShareCard();
}

function applyStoredLang(lang) {
  uiLang = lang === 'zh' ? 'zh' : 'en';
  applyI18n();
}

function loadLang(done) {
  const finish = () => { if (typeof done === 'function') done(); };
  if (!chrome.storage || !chrome.storage.local || !chrome.storage.local.get) {
    applyStoredLang('en');
    finish();
    return;
  }
  chrome.storage.local.get(['uiLang'], (res) => {
    applyStoredLang(res && res.uiLang);
    finish();
  });
}

function setLang(lang, done) {
  applyStoredLang(lang);
  const finish = () => { if (typeof done === 'function') done(); };
  if (chrome.storage && chrome.storage.local && chrome.storage.local.set) {
    chrome.storage.local.set({ uiLang }, finish);
  } else {
    finish();
  }
}
