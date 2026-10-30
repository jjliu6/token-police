# Token Police 宣传片：分镜

> 状态：已定稿并渲染　日期：2026-10-30
> 成片：长版 73.2 s（`out/token-police-promo.mp4`）与 30 秒版（`out/token-police-promo-30s.mp4`），各有无旁白版（`*-no-vo.mp4`）。
> 规格：16:9 · 1920×1080 · 30 fps · H.264 + AAC · 约 −16 LUFS。
> 音乐 100 BPM，1 小节 = 2.4 s；每个场景都从小节线开始。场景数据在 [`stage/scenes.js`](./stage/scenes.js)（`LONG` / `SHORT`），旁白台本在 [`VO_SCRIPT.md`](./VO_SCRIPT.md)。

## 叙事

沿用 Estha 宣传片 v3 的「处境 → 功能」写法：每个功能先由一句开发者熟悉的处境引出（大字卡片，背后的侧边栏模糊压暗），再切到真实界面，左栏大字写出功能名，旁白念出功能名。

> 五家 AI 编程工具，额度藏在五个不同的地方 → Token Police 把它们放进一个 Chrome 侧边栏 → 周中重构到一半，额度够不够？（消耗速度 + 低额度提醒）→ 一个任务想让三个 agent 都试试？（Dispatch）→ 不确定答案对不对？（Cross-check）→ 坐了三个小时？（发量小人）→ 没有 API key，数据不出浏览器 → 片尾。

## 镜头语言

- **开场黑底字卡**：先讲「额度分散在各家页面」，Token Police 再登场。
- **侧边栏先居中上浮，再滑到右侧**：给左栏腾出位置。之后整片都是「左栏大字 + 右侧真实侧边栏」的 keynote 构图（侧边栏又高又窄，放不满 16:9）。
- **左栏大字**：小号绿色功能名 + 一句标题 + 一句说明，文字都出自落地页 / README（出处见 [`NOTES.md`](./NOTES.md) §5），代替 Estha 片里左下角的产品名胶囊。
- **镜头**：只推近 / 平移侧边栏；推近时侧边栏左缘永远不越过左栏文字，上下也不露出空背景。
- **剪辑**：换场景在小节线上硬切，同一界面的状态变化用 0.32 s 叠化（Dispatch 打字就是三帧真实输入框截图叠化出来的）。

## 长版（73.2 s）

| # | 时间 | 小节 | 处境（卡片） | 画面（全部是真实侧边栏） | 左栏 / 功能名 |
|---|---|---|---|---|---|
| 0 | 0:00–0:07.2 | 1–3 | 黑底：Claude Code. Codex. Cursor. Grok. Gemini. / Every one hides its quota in a different place. | — | — |
| 1 | 0:07.2–0:14.4 | 4–6 | — | 侧边栏居中上浮 → 滑到右侧；六张额度卡 + 发量小人 | **Token Police** · Know how much AI coding quota you have left — at a glance. |
| 2 | 0:14.4–0:19.2 | 7–8 | — | 推近顶栏：点 Refresh → 「Fetching…」→ 全部更新（Last success: just now）→ 拉回 | All quotas, one click |
| 3 | 0:19.2–0:31.2 | 9–13 | Mid-week, mid-refactor — Is this week's quota going to last? | 推近 Grok 卡：红色「~41h to empty (before reset!)」+ 7 天曲线 → 移到 Gemini 卡（12%）+ 右上角桌面通知 | Burn rate & 7-day trend → Low-quota alerts |
| 4 | 0:31.2–0:40.8 | 14–17 | Which agent should take this one? / Why not all three? | Dispatch：Code、逐段打字、仓库、勾三个 agent → 「Dispatch 3」→ 「Opened 3 tabs · prefill only, not sent」标签列表 | **Dispatch** · One prompt, opened in all of them. |
| 5 | 0:40.8–0:48.0 | 18–20 | Not sure the answer is right? | Cross-check：读到 ChatGPT 对话 → 勾选隐私确认 → System recommend 选出 Claude（62% left）→ Prefill Claude | **Cross-check** · Get a second opinion. |
| 6 | 0:48.0–1:00.0 | 21–25 | 3 hours in — When did you last get up? | 发量 40%（小人说话）→ 15%（皱眉）→ 掉光、卡片结霜、给出三个活动 → 选「Touch some grass」→ Done，头发长回来（闪光帧） | The hair mascot · It thins while you sit… / …and makes you stretch. |
| 7 | 1:00.0–1:04.8 | 26–27 | — | Share 卡片推近：「Free, open source — nothing leaves your browser.」+「Your quota, logs, and account data are never included.」 | Private by design · Your usage data never leaves your browser. |
| 8 | 1:04.8–1:13.2 | 28–31 | — | 片尾卡：图标、Token Police、标语、Free / Open source / Nothing leaves your browser、token-police.philosophie.ai、免责声明 | — |

## 30 秒版

| 时间 | 画面 | 旁白 |
|---|---|---|
| 0–4.8 | 黑底字卡（五家工具名 → 额度藏在不同地方） | Every AI coding tool hides its quota somewhere else. |
| 4.8–9.6 | 侧边栏上浮 → 右移，左栏 Token Police | Token Police shows them all in one side panel. |
| 9.6–14.4 | Grok 卡消耗速度推近 | It tracks your burn rate, and warns you before you run out. |
| 14.4–19.2 | Dispatch 输入框 → 标签列表 | Dispatch opens one prompt in several agents at once. |
| 19.2–24.0 | 发量 40% → 15% → 结霜 → 长回来 | And if you sit too long, the mascot makes you stretch. |
| 24.0–30.0 | 片尾卡 | Token Police. Free, open source — and nothing leaves your browser. |

## 配乐

真实录音乐器采样编曲（Salamander 三角钢琴 + tonejs-instruments 木琴 / 尼龙吉他 / 电贝斯 / 小提琴 / 大提琴 / 竖琴，CC BY 3.0，署名见 [`NOTES.md`](./NOTES.md) §8），100 BPM、G 大调，比 Estha 的配乐更轻快：开场只有「滴答」的木琴（找额度页的焦虑）→ 侧边栏出现时整组进来（贝斯弹跳 + 吉他琶音 + 钢琴切分）→ 每张处境卡降到贝斯 + 木琴的小停顿 → Dispatch / Cross-check 段加入木琴主题 → 发量段弦乐推高，头发长回来时竖琴上行 → 隐私段收暖 → 片尾 G 大调收束。30 秒版按 12.5 小节压缩同一走向。

## 迭代记录

- v1（本版）：按 Estha v3 的方法一次成片——真实界面截图（mock `chrome.*`）、处境卡引出功能、念出功能名、真实乐器配乐、长版 + 30 秒版 + 无旁白版。
