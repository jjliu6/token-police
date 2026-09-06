// Draft quota tips for the hair mascot. NOT wired into the dashboard yet.
// Copy is WIP — revise before merging. Do not load this file from popup.html
// until the wording and triggers are approved.
//
// fat  — remaining quota is high, or reset is close and a lot is still unused
// thin — remaining quota is low; stretch what is left, or wait
//
// say = mascot bubble. btn = optional pickable tip label (same pattern as activities).

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
  'tipCompetitors',
  "quota's about to rot. paste two competitors, get a feature map.",
  '额度要作废了。丢两个竞品链接，让它拆功能表。',
  'competitor feature map',
  '竞品功能对照'
);
addQuotaTip(
  'fat',
  'tipTranslate',
  "don't let tokens die at reset. paste a long piece and translate it.",
  '别让 token 烂在重置里。丢一篇长文，中英来回翻。',
  'translate a long piece',
  '翻译一篇长文'
);
addQuotaTip(
  'fat',
  'tipTests',
  "quota's still fat. have it cover the barest module with tests.",
  '额度还胖。让它给最裸的模块补测试，别再手写样板。',
  'cover a bare module',
  '给裸模块补测试'
);
addQuotaTip(
  'fat',
  'tipOnboarding',
  'this batch expires anyway. dump the onboarding in your head into a doc.',
  '这波过期没人心疼。把脑子里的 onboarding 倒给它，写成文档。',
  'dump onboarding docs',
  '倒出 onboarding'
);
addQuotaTip(
  'fat',
  'tipStalePrs',
  "you've barely burned anything. toss the stale PRs in for review notes.",
  '你都快零消耗了。积压 PR 丢进来，先让它写 review 要点。',
  'review stale PRs',
  '清积压 PR'
);
addQuotaTip(
  'fat',
  'tipPriceyModel',
  "don't cheap out today. use the pricey model on the hard design.",
  '今天别省着。切最贵的模型，把难设计问透。',
  'use the expensive model',
  '切大模型想清楚'
);
addQuotaTip(
  'fat',
  'tipNewStack',
  "it's zeroing out anyway. blow this on a throwaway of that stack you want.",
  '反正要清零。用这波额度探一个一直想试的栈，能跑就行。',
  'throwaway stack prototype',
  '扔一个新栈原型'
);
addQuotaTip(
  'fat',
  'tipArchMap',
  'feed it the entry files. get a module map. next onboarding just got shorter.',
  '丢入口文件进去，让它画模块图。下次 onboarding 少讲半小时。',
  'map the architecture',
  '画仓库模块图'
);
addQuotaTip(
  'fat',
  'tipChangelog',
  "quota's idle. turn recent commits into a changelog humans can read.",
  '额度闲着。把最近的 commit 喂进去，写一版人能看的更新说明。',
  'changelog from git',
  '从 commit 写更新说明'
);
addQuotaTip(
  'fat',
  'tipRedTeam',
  "feature's in, quota isn't gone. have it hunt edges, bad data, and holes.",
  '功能写完了，额度还在。让它专门找边界、坏数据和权限漏洞。',
  'red-team the feature',
  '给功能做红队'
);

// --- thin: save / stretch quota ---
addQuotaTip(
  'thin',
  'tipSpecFirst',
  'no more long chats. write the goal on paper, then ask once.',
  '别开长会话了。纸上写清目标，一次问完。',
  'spec first, then one ask',
  '先写 spec 再提问'
);
addQuotaTip(
  'thin',
  'tipCheapModel',
  "don't use the flagship to rename stuff. save quota for the part that thinks.",
  '改文案、改 import 别用旗舰。额度留给会想的那一步。',
  'cheap model for boilerplate',
  '样板用便宜模型'
);
addQuotaTip(
  'thin',
  'tipAtFiles',
  'longer context, faster burn. @ the files. don\'t dump the whole repo.',
  '上下文越长越烧。点名文件，别把整个 repo 塞进去。',
  '@ only the files you need',
  '只 @ 相关文件'
);
addQuotaTip(
  'thin',
  'tipGrepFirst',
  'grep the error, run the tests. if you can find it, don\'t ask.',
  '报错先搜、测试先跑。搜得到就别问 agent。',
  'grep before you ask',
  '先 grep 再问'
);
addQuotaTip(
  'thin',
  'tipPlanOnly',
  'take the plan, then stop. write this round yourself.',
  '让它出步骤就停。这轮手写，额度留着打难的。',
  'take the plan, write it',
  '只要计划自己写'
);
addQuotaTip(
  'thin',
  'tipDiffOnly',
  "ask for a diff, not a full reprint. that's half the tokens.",
  '要补丁，不要全文重印。能省一半 token。',
  'ask for a diff',
  '只要 diff 不要全文'
);
addQuotaTip(
  'thin',
  'tipBatchAsks',
  'three small questions, one prompt. don\'t open three chats.',
  '三个小问题合成一条。别连开三个会话。',
  'batch the questions',
  '问题合成一条'
);
addQuotaTip(
  'thin',
  'tipSwitchAgent',
  "this one's empty. the card next to it is still fat — use that.",
  '这个见底了。旁边那个还肥，先用它顶住。',
  'switch to a fatter agent',
  '换一个还有额度的'
);
addQuotaTip(
  'thin',
  'tipWaitReset',
  'hold on. reset is cheaper than stretching this. comments and tickets till then.',
  '撑一下。重置比续命便宜。先写注释、整理 ticket。',
  'wait for reset',
  '撑到重置'
);
addQuotaTip(
  'thin',
  'tipZeroToken',
  "quota's gone, don't force it. sketch, reply, sort the backlog. brain is free this round.",
  '额度见底就别硬烧。去画稿、回消息、整理 backlog。人脑这轮免费。',
  'do zero-token work',
  '做零 token 的活'
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
