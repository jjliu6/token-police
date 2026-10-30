# 旁白台本

> 用途：替换片中的 Kokoro 临时配音（如用 ElevenLabs 重录）。
> 时间码 = 该句在成片中的**起点**；「最长」是这一句可用的最长时长（下一句起点或场景结束前留出空隙）。
> 配套素材：`out/token-police-promo-no-vo.mp4`（只有配乐）、`build/vo_only.wav`（当前旁白干声）、`build/music_only.wav`（配乐干声）。
> 程序里的同一份数据：`audio/make_vo.py` 的 `LINES` / `LINES_SHORT`。当前音色 Kokoro `af_bella`。

## 表演提示

- 语气：轻快、带一点调侃，像一个也在 vibe coding 的朋友——不是播音腔，也不是推销。
- 处境句（「Mid-week, mid-refactor…」「Three hours in…」）放慢半拍，带一点同理心；念到**功能名**时稍作强调。
- 名字一律原样读：**Token Police、Dispatch、Cross-check**；第三方产品名 **Claude Code、Codex、Cursor、Grok、Gemini** 只作为名字出现，不加评价。
- 发量段可以更俏皮（「This little guy…」），收尾「Know what's left — at a glance.」放稳。

## 长版台本（73.2 s）

| 起点 | 最长 | 画面 | 旁白 |
|---|---|---|---|
| 0:00.6 | 3.4 s | 黑底字卡：五家工具名 | Claude Code. Codex. Cursor. Grok. Gemini. |
| 0:04.2 | 3.3 s | 黑底字卡 | Every one hides its quota in a different place. |
| 0:07.8 | 3.0 s | 侧边栏上浮 | **Token Police** puts it all in one Chrome side panel — |
| 0:11.0 | 3.4 s | 侧边栏右移，左栏标题 | what's left, and when each one resets. |
| 0:14.7 | 4.5 s | 推近 Refresh → 全部更新 | One click reads every usage page you're already signed into. |
| 0:19.4 | 3.1 s | 处境卡：周中重构 | Mid-week, mid-refactor. Is your quota going to last? |
| 0:22.8 | 4.4 s | Grok 卡消耗速度 + 7 天曲线 | **Token Police** tracks your burn rate, and warns you before you run out. |
| 0:27.4 | 3.8 s | Gemini 12% + 桌面通知 | Drop below fifteen percent, and you get a desktop alert. |
| 0:31.4 | 2.4 s | 处境卡：该让哪个 agent 来 | Can't decide which agent should take a task? |
| 0:34.0 | 4.3 s | **Dispatch** 输入框 | **Dispatch** opens one prompt in all of them — filled in, not sent. |
| 0:38.5 | 2.3 s | 标签列表 | You still hit Send. |
| 0:41.0 | 2.1 s | 处境卡：答案对不对 | Not sure an answer is right? |
| 0:43.3 | 4.7 s | **Cross-check** 面板 | **Cross-check** hands it to a second AI — the one with the most quota left. |
| 0:48.2 | 2.4 s | 处境卡：坐了三小时 | Three hours in. When did you last get up? |
| 0:50.8 | 4.3 s | 发量 40% → 15% | This little guy loses hair while you sit. |
| 0:55.3 | 2.1 s | 卡片结霜 + 三个活动 | When it's gone, the cards frost over. |
| 0:57.6 | 2.7 s | 选活动 → Done → 头发长回来 | Take a break, tap Done, and the hair grows back. |
| 1:00.5 | 4.2 s | Share 卡片隐私句 | No API keys. No account linking. Nothing leaves your browser. |
| 1:05.3 | 1.3 s | 片尾卡 | **Token Police.** |
| 1:06.8 | 3.0 s | 片尾卡 | Know what's left — at a glance. |

## 30 秒版台本

| 起点 | 最长 | 画面 | 旁白 |
|---|---|---|---|
| 0:00.4 | 4.2 s | 黑底字卡 | Every AI coding tool hides its quota somewhere else. |
| 0:05.1 | 4.5 s | 侧边栏上浮 → 右移 | **Token Police** shows them all in one side panel. |
| 0:09.8 | 4.6 s | Grok 卡消耗速度 | It tracks your burn rate, and warns you before you run out. |
| 0:14.6 | 4.6 s | **Dispatch** → 标签列表 | **Dispatch** opens one prompt in several agents at once. |
| 0:19.4 | 4.4 s | 发量小人 → 结霜 → 长回来 | And if you sit too long, the mascot makes you stretch. |
| 0:24.4 | 1.2 s | 片尾卡 | **Token Police.** |
| 0:25.8 | 3.8 s | 片尾卡 | Free, open source — and nothing leaves your browser. |

## 文案出处

- 「Every one hides its quota in a different place」— 落地页 `docs/index.html`：「Every AI coding tool hides its quota in a different place.」
- 「in one Chrome side panel / what's left, and when each one resets」— README 第一段「remaining … quota — reset times, burn rate and low-quota alerts in one side panel」
- 「reads every usage page you're already signed into」— README「it reads the numbers straight off each tool's own usage page that you're already logged into」
- 「tracks your burn rate, and warns you before you run out」— 落地页「estimates how fast you're spending and warns when you'll run out before the next reset」
- 「below fifteen percent … desktop alert」— 落地页「Desktop notification when any tracked agent drops below 15%, and again below 5%」
- 「Dispatch opens one prompt in all of them — filled in, not sent / You still hit Send」— 落地页「One prompt, opened in all of them.」「Filled in, not sent.」「You still hit Send yourself.」
- 「Cross-check … second AI … the one with the most quota left」— README「hand the transcript to a second AI of the same kind … System recommend (default — the matching-kind reviewer with the most remaining quota)」
- 发量三句 — 落地页「A hair mascot that thins while you sit, and makes you stretch.」「A frosted veil covers the cards…」「Pick one, go do it, tap Done. The veil lifts, the hair grows back」
- 「No API keys. No account linking. Nothing leaves your browser.」— 落地页「No API keys, no account linking … nothing leaves your browser」
- 「Free, open source — and nothing leaves your browser」— 面板分享卡 `i18n.js` `sharePitch`「Free, open source — nothing leaves your browser.」
- 处境句（周中重构、三个 agent、坐了三小时）是示意场景，不代表真实用户。
