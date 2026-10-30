# Token Police 宣传片：调研笔记

> 状态：v1 已渲染（长版 73.2 秒 + 30 秒版）　日期：2026-10-30
>
> 本文只记录仓库里**能查到**的事实，每条附出处。片中出现的文案、功能、界面全部能在下表找到来源；查不到的一律不用。做法照搬 Estha for Mac 宣传片（`philosophieai/estha-mac-wails` 的 `promo/`）。

---

## 1. 产品是什么（README / 落地页）

| 事实 | 出处 |
|---|---|
| Chrome（Manifest V3）扩展：一个侧边栏里显示 Claude Code、Codex、Cursor、Grok、Grok Bot、Gemini 的剩余额度、重置时间、消耗速度和低额度提醒 | `README.md` 第一段；`manifest.json`（`side_panel.default_path = popup.html`） |
| 落地页标题：**"Know how much AI coding quota you have left — at a glance."** | `docs/index.html` `<h1>` |
| 不需要 API key、不绑账号；只读你已经登录的各家用量页；数据存在 `chrome.storage.local`，不发到任何服务器 | README「What it does」、落地页「Private by design」 |
| 当前版本 1.7.7 | `manifest.json` |
| 非官方，与 Anthropic、OpenAI、xAI、Cursor、Google 无关 | README「Disclaimer」、`i18n.js` `disclaimer` |

## 2. 品牌与设计系统

| 项 | 值 | 出处 |
|---|---|---|
| 图标 | 发量小人 + 警察领口 + 薄荷色装饰环（装饰，不代表额度） | `icons/token-police.svg`（源）、`icons/mark-128.png` |
| 底色 / 卡片 / 文字 | `#101218` / `#1c222c` / `#f3f5f9` | `popup.html` `:root` |
| 强调色（薄荷绿） | `#7fe3c3`；健康 `#4fd9a8`、警告 `#e8b85c`、危险 `#ef7d7d` | 同上 |
| 字体 | `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", …` | 同上 |
| 各家颜色与标记 | Claude Code `#D97757`、Codex `#5CD6B3`、Grok `#B78CF0`、Cursor `#6E9BF5`、Grok Bot `#F49AC1`、Gemini `#3B78E7`；标记是**简化几何图形，不是官方 logo** | `agents.js`、`popup.js` `logo()` 注释 |

舞台（`stage/`）沿用面板 token：深色底 + 薄荷色光晕，左栏大字用 Inter，片尾用 `icons/token-police.svg`。

## 3. 画面来源：用的是真界面

仓库里的截图（`docs/shot-*.png`、`docs/dashboard.webp`）是旧版本，不能直接用；可运行的 UI 就是 `popup.html` 本身。

做法（与 Estha 用 mock Go 后端起真实前端是同一个思路）：

1. `capture/harness.mjs` 用 Playwright 打开仓库里**原样的** `popup.html`（`page.route` 直接把仓库文件当网站服务，不用起服务器）。
2. `capture/mock-chrome.js` 在页面脚本运行**之前**装上假的 `window.chrome`：`storage.local`（内存实现，会触发 `onChanged`）、`runtime.sendMessage`（按消息类型交给场景脚本里的 handler，替代 `background.js`）、`runtime.getManifest()`（返回真实 `manifest.json`）、`windows.getLastFocused`。任何没 mock 的调用都会被记下来，截图结束时打印——这次是空的。扩展源码一行未改。
3. `capture/sample-data.mjs` 给出一套虚构但自洽的数据（见 §6），面板自己算出「reset in 4d」「Burning ~20%/day · ~41h to empty (before reset!)」等文字。
4. `capture/scenes/panel.mjs` 在 500×860 @2x 下**点真实按钮、往真实输入框打字、真拖动发量小人**，按故事顺序截出 1000×1720 帧到 `capture/out/`，并导出各元素的位置（`*.json`）给舞台运镜用。
5. `stage/` 把这些帧放进一个画出来的通用 Chrome 侧边栏外框里做运镜。

Linux 容器没有 SF Pro，截图时把 `"SF Pro Text"` / `"Segoe UI"` 映射到 Inter（OFL，`assets/fonts/`），等宽字体映射到 JetBrains Mono（OFL）。在真 Mac 上会是 SF 字体，字形略有差别。

## 4. 片中演示的能力（都已上线，v1.7.7）

| 段落 | 能力 | 出处 | 画面来源（真实界面） |
|---|---|---|---|
| 总览 | 六家额度、重置时间、一键 Refresh | README「What it does」 | 六张卡片；点 Refresh →「Fetching…」→ 全部更新 |
| 消耗速度 | 有几小时数据后估算消耗速度，重置前会用完时变红警告；每张卡 7 天曲线 | README、`popup.js` `verdict()` / `sparkline()` | Grok 卡「~41h to empty (before reset!)」 |
| 低额度提醒 | 低于 15%、再低于 5% 时桌面通知（可在 ⚙ 关） | README、`background.js` `maybeNotify()` | Gemini 12% 卡片 + 舞台画的通知横幅（文字见 §5） |
| Dispatch | 一个提示词同时打开到多个 Chat / Code 目标，默认只预填不发送；Code 目标不能自动发送 | README、`agents.js` `canAutoSend()` | Code 页签、打字、仓库、勾三个 agent →「Opened 3 tabs · prefill only, not sent」 |
| Cross-check | 把当前对话交给同类型的另一个 AI；默认「System recommend」选剩余额度最多的 | README、`review.js` `pickCrosscheckReviewer()` | ChatGPT 对话 → 隐私确认 → Claude · 62% left → Prefill Claude |
| 发量小人 | 久坐掉发（默认 2 小时掉光），掉光后卡片结霜，从 100 个活动里抽 2–3 个，做完点 Done 头发长回来 | README、落地页、`popup.js` 掉发引擎、`activities.js` | 40% → 15% → 0% 结霜 → 选活动 → Done 闪光 |
| 隐私 | 无 API key、不绑账号、数据不出浏览器 | README、落地页、分享卡 `sharePitch` / `sharePrivacy` | Share 卡片 |

**没有放进片里的**：Logs / 诊断、语言切换（FR/EN/中文）、自动检查间隔、平铺窗口（Tile windows）、Grok 学习 REST 接口、更新提醒、Move reminder 通知（与样例数据的消耗量对不上，见 §7）。

## 5. 片中文案出处

**左栏大字、卡片与旁白**

| 片中文案 | 出处（原句） |
|---|---|
| "Every one hides its quota in a different place." | 落地页 "Every AI coding tool hides its quota in a different place." |
| "Know how much AI coding quota you have left — at a glance." | 落地页 `<h1>` |
| "Claude Code, Codex, Cursor, Grok, Grok Bot and Gemini — in one Chrome side panel." | README 第一段 / 落地页导语 "One side panel shows your remaining usage for Claude Code, Codex, Cursor, Grok, Grok Bot and Gemini" |
| "Stop tab-hopping between usage pages." | 落地页 `<h2>` "Stop tab-hopping to check six different usage pages."（去掉了「six」：Cursor 与 Grok Bot 共用一个页面） |
| "Weekly and short-term limits, plus exactly when each one resets." | 落地页「All quotas, one click」段 |
| "One click reads every usage page you're already signed into." | README "it reads the numbers straight off each tool's own usage page that you're already logged into" |
| "Know before you run out." / "It estimates how fast you're spending — and warns when you'll run out before the next reset." | 落地页「Burn rate & 7-day trend」段 |
| "A heads-up below 15%." / "…drops below 15%, and again below 5%." | 落地页「Low-quota alerts」段 |
| 通知横幅 "Gemini: 12% left" / "Usage quota is running low. Resets Oct 31 at 12:00 AM." | `i18n.js` `lowTitle` / `lowBodyR`（`background.js` 用卡片的 `resets_text` 填 `{r}`） |
| "One prompt, opened in all of them." / "Filled in, not sent — you still hit Send yourself." | 落地页 Dispatch 段 `<h2>`、"Filled in, not sent."、"You still hit Send yourself." |
| "Get a second opinion." / "Hands the conversation to another AI of the same kind — by default, the one with the most quota left." | README Cross-check 段（"hand the transcript to a second AI of the same kind … System recommend (default — the matching-kind reviewer with the most remaining quota)"） |
| "It thins while you sit… / …and makes you stretch." | 落地页 `<h2>` "A hair mascot that thins while you sit, and makes you stretch." |
| "Hair falls the longer you sit. Leftover quota is the cap." | 落地页图注 |
| "The cards frost over. Pick a break, go do it, tap Done — the hair grows back." | 落地页列表 "A frosted veil covers the cards…" / "Pick one, go do it, tap Done. The veil lifts, the hair grows back" |
| "Your usage data never leaves your browser." / "No API keys, no account linking…" | 落地页 `<h2>` 与「Private by design」段 |
| 片尾 "Free · Open source · Nothing leaves your browser" | 分享卡 `sharePitch` "Free, open source — nothing leaves your browser." |
| 片尾小字 "Unofficial. Not affiliated with Anthropic, OpenAI, xAI, Cursor or Google." | `i18n.js` `disclaimer` 前半句 |

**刻意不用的**

- 「Chrome Web Store 上架」「一键安装」：扩展只以 .zip 分发（README「Install」），片中不出现商店字样。
- 自动发送：默认关闭且只对 Chat 目标开放；片中只讲「filled in, not sent」。
- 速度、用户数、下载量、各家套餐价格：一个都不出现（Cursor 卡片的套餐只写 "Pro"，不写价格）。
- 第三方 logo：只出现扩展自己的简化几何标记；产品名只作为名字出现。
- 分享卡上方的预览图是旧版面板截图（`icons/share-preview-en.webp`），推近镜头只拍下方文字。

**片中出现的数字**：都来自虚构样例数据（§6），由面板自己的代码算出；不是任何真实账号的用量。

## 6. 演示数据（全部虚构）

时钟固定在 2026-10-30（周五）09:38 UTC。

| 卡片 | 剩余 | 重置文字（各家页面的写法） | 面板算出的消耗判断 |
|---|---|---|---|
| Claude Code | 62%（Session 80%） | Tue 8:00 AM → reset in 4d | ~12%/day · lasts till reset |
| Codex | 78%（5-hour 55%） | Sun 4:20 PM → reset in 2d | ~5%/day · lasts till reset |
| Grok | 34%（Chat 38% · Build 22% · Img 6%） | November 3, 2026 at 2:20 AM → reset in 4d | ~20%/day · ~41h to empty (before reset!) |
| Cursor | 88%（Other Models 92%，Pro） | (11 days) → reset in 11d | Barely used lately |
| Grok Bot | 70% | 4 days left → reset in 4d | ~10%/day · lasts till reset |
| Gemini | 12%（Current usage 74%） | Oct 31 at 12:00 AM → reset in 14h | ~14%/day · lasts till reset |

历史记录按每小时一次（自动检查的默认间隔）生成 7 天，消耗集中在工作时段、周末减少，每个周额度在窗口内重置一次，所以 7 天曲线有真实的「锯齿」。Dispatch 的提示词、仓库 `acme/webapp`、Cross-check 读到的 ChatGPT 对话（Postgres 加列与建索引的问答）都是虚构的。

## 7. 与真实扩展的已知差异（诚实清单）

- 字体：Inter / JetBrains Mono 代替 SF Pro / SF Mono（见 §3）。
- 时钟：截图时浏览器时钟固定在 2026-10-30 09:38（UTC）。
- `chrome.*` 是假的（§3）；`background.js` 的回应由场景脚本给出：Refresh 完成时按 `background.js` 的写法更新 `scraped_at`、`history` 和 `refresh.results`；Dispatch 返回三个标签 id；Cross-check 返回一段虚构对话。真实扩展会真的打开各家页面和标签。
- 侧边栏外框（标题栏、关闭符号）和桌面通知横幅是舞台画的系统界面，不是截图；通知的文字来自 `i18n.js`，图标是扩展真实的 `icons/mark-128.png`。真实 macOS 上通知由 Chrome 发出，外观随系统而变。
- 面板宽 500 px（Chrome 侧边栏可拖宽；这个宽度下品牌名完整显示，个别标签仍按真实布局截断成「Weekly (A…」）。
- 发量小人：截图时关掉了它的随机游走和上下浮动动画（`window.__buddyWander`、注入 CSS），位置由真实拖动设定，这样叠化时不会跳；Math.random 换成固定种子，每次截图抽到的活动和台词一致。小人说的四句台词（"one more prompt, one more follicle" 等）都来自 `popup.js` 的 `SAYS` 词库，由脚本调用面板自己的 `blurtSay()` 指定。
- 掉发过程是把 `lastMovedAt` 往前拨（相当于坐了 72 / 102 / 122 分钟），不是真等两小时。
- Gemini 跌破 15% 的时刻在样例数据里早于 09:38，片中把通知和这张卡放在一起展示，是示意。
- Move reminder 通知（2 小时内烧掉超过 10%）没进片：样例数据里没有哪家烧得这么快，硬放会和卡片数字矛盾。

## 8. 音频

- **配乐**：`audio/make_score.py` 用**真实录音的乐器采样**编曲（100 BPM，每小节 2.4 秒，G 大调；段落跟着画面走：开场木琴滴答 → 侧边栏出现时整组进来 → 每张处境卡降成贝斯 + 木琴 → Dispatch / Cross-check 段加木琴主题 → 发量段弦乐推高、竖琴上行 → 片尾收束）。采样由 `audio/fetch_samples.sh` 从 npm 拉到 `.cache/samples/`（不入库）。
- **署名（CC BY 3.0，允许商用，发布时请在视频描述中保留）**：
  - Piano: *Salamander Grand Piano V3* by Alexander Holm — CC BY 3.0
  - Xylophone, nylon guitar, electric bass, violin, cello, harp: *tonejs-instruments* samples compiled by Nicholaus Brosowsky — CC BY 3.0
- **旁白**：Kokoro-82M（Apache-2.0）离线合成，音色 `af_bella`（Kokoro VOICES.md 里评级仅次于 Estha 片用的 `af_heart`；男声评级都在 C+ 及以下），按短语逐句生成、句间留停顿。台本与时间码见 [`VO_SCRIPT.md`](./VO_SCRIPT.md)，可用 ElevenLabs 等重录后替换。
- **混音**：`audio/mix.py`（与 Estha 相同）按旁白包络对配乐 ducking，`loudnorm` 到 −16 LUFS；同时导出 `build/music_only.wav`（−20 LUFS）、`build/vo_only.wav` 分轨。
- **实测**：长版 −16.3 LUFS、真峰值 −1.5 dBTP；30 秒版 −16.0 LUFS、−1.5 dBTP；无旁白版约 −19 LUFS。
- **交付**：`out/token-police-promo.mp4`、`out/token-police-promo-no-vo.mp4`、`out/token-police-promo-30s.mp4`、`out/token-police-promo-30s-no-vo.mp4`（不入库）。
- 我无法试听，音频只做了电平、时长和音高（频谱）检查。
