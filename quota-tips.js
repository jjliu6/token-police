// Draft quota tips for the hair mascot. NOT wired into the dashboard yet.
// Do not load this file from popup.html until wiring is intentional.
// The live panel never shows these today.
//
// Intended display (not coded yet):
//   fat  — that agent's remaining is high AND reset is close
//          (or this period is barely used). Example: Grok 88% left, 3h to reset.
//   thin — that agent's remaining is low, reset still far
//          (same neighborhood as the 15% / 5% low-quota alerts).
//   Sit-clock rest veil still wins: stretch activities, not these tips.
//   Surface: mascot .say bubble (full say) + optional .acts buttons (btn).
//
// Eric-approved v2 (8 agent-specific tips). Copy formula:
//   fat  ZH: 烧掉用不完的 token，你可以这样：…
//   fat  EN: Burn the quota you’d waste anyway — you can do this: …
//   thin ZH: 额度紧了，先别硬烧，你可以这样：…
//   thin EN: Quota is tight — don’t burn it on fluff; do this instead: …
// No slang like「还肥」.
//
// fat  — remaining quota is high, or reset is close and a lot is still unused
// thin — remaining quota is low; stretch what is left, or wait
//
// say = mascot bubble (full text, including the lead-in). btn = short pickable label.

var QUOTA_TIP_LIST = [];
function addQuotaTip(pool, id, sayEn, sayZh, btnEn, btnZh) {
  QUOTA_TIP_LIST.push({
    id,
    pool,
    say: { en: sayEn, zh: sayZh },
    btn: { en: btnEn, zh: btnZh },
  });
}

// --- fat: spend leftover quota ---
addQuotaTip(
  'fat',
  'tipGrokXComplaints',
  'Burn the quota you’d waste anyway — you can do this: open Grok, search X for real user complaints about a product, and export a punch list with original post links.',
  '烧掉用不完的 token，你可以这样：打开 Grok，搜 X 上用户对某产品的真实吐槽，整理成带原帖链接的抱怨清单。',
  'Grok: X complaint list',
  'Grok：搜 X 抱怨清单'
);
addQuotaTip(
  'fat',
  'tipGeminiPromoImages',
  'Burn the quota you’d waste anyway — you can do this: open Gemini, upload a product blurb or screenshot, and generate 3 promo-image drafts in different styles.',
  '烧掉用不完的 token，你可以这样：打开 Gemini，上传一页产品说明或截图，让它生成 3 张不同风格的宣传图草稿。',
  'Gemini: 3 promo drafts',
  'Gemini：3 张宣传图'
);
addQuotaTip(
  'fat',
  'tipCursorCloudBug',
  'Burn the quota you’d waste anyway — you can do this: launch a Cursor cloud agent on one repo with one clear bug and have it open a PR.',
  '烧掉用不完的 token，你可以这样：在 Cursor 开 cloud agent，指定 repo 和一个边界清晰的 bug，让它改完并开 PR。',
  'Cursor: cloud agent PR',
  'Cursor：cloud agent 开 PR'
);
addQuotaTip(
  'fat',
  'tipGrokBotRoutine',
  'Burn the quota you’d waste anyway — you can do this: demo once to Grok Bot—log into a portal, export, save to Drive—then save it as a routine to run overnight.',
  '烧掉用不完的 token，你可以这样：演示一次「登录某后台→导出→归档到 Drive」给 Grok Bot，让它固化成 routine 过夜跑。',
  'Grok Bot: overnight routine',
  'Grok Bot：固化过夜 routine'
);
addQuotaTip(
  'fat',
  'tipClaudeCodeTests',
  'Burn the quota you’d waste anyway — you can do this: open Claude Code in your terminal on this repo, run the tests, and fix until green.',
  '烧掉用不完的 token，你可以这样：在本机终端打开 Claude Code，对准当前仓库跑测试并修到绿。',
  'Claude Code: tests to green',
  'Claude Code：测试修到绿'
);

// --- thin: save / stretch quota ---
addQuotaTip(
  'thin',
  'tipGrokShortAsk',
  'Quota is tight — don’t burn it on fluff; do this instead: ask Grok one concrete question for a 3-bullet answer plus two links—no long research.',
  '额度紧了，先别硬烧，你可以这样：只丢一个具体问题给 Grok，要三句结论+两条链接，别开长调研。',
  'Grok: 3 bullets + 2 links',
  'Grok：三句+两条链接'
);
addQuotaTip(
  'thin',
  'tipCursorLocalFirst',
  'Quota is tight — don’t burn it on fluff; do this instead: fix one file locally with the shortest prompt; only then spend cloud agent quota.',
  '额度紧了，先别硬烧，你可以这样：先在本地用最短提示改一个文件，确认思路再开 cloud agent。',
  'Cursor: local first',
  'Cursor：先本地再 cloud'
);
addQuotaTip(
  'thin',
  'tipGeminiOnePass',
  'Quota is tight — don’t burn it on fluff; do this instead: use Gemini for one short Q&A or a single image pass—skip long video and multi-round polish.',
  '额度紧了，先别硬烧，你可以这样：用 Gemini 只做一次短问答或压一张图，别开长视频/多轮精修。',
  'Gemini: one short pass',
  'Gemini：一次短问答或压图'
);

var QUOTA_TIPS = { fat: [], thin: [] };
var QUOTA_TIP_BY_ID = {};
var QUOTA_SAYS = { fat: { en: [], zh: [] }, thin: { en: [], zh: [] } };
QUOTA_TIP_LIST.forEach((tip) => {
  QUOTA_TIPS[tip.pool].push(tip.id);
  QUOTA_TIP_BY_ID[tip.id] = tip;
  QUOTA_SAYS[tip.pool].en.push(tip.say.en);
  QUOTA_SAYS[tip.pool].zh.push(tip.say.zh);
});
