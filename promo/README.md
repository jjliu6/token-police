# promo/ — Token Police 宣传片工程

独立于扩展本身：不改任何扩展源码，只读取它们。`npm run build` / `npm start` 已把 `promo` 排除在打包之外，Release workflow 也忽略 `promo/**`。做法照搬 Estha for Mac 宣传片（`philosophieai/estha-mac-wails` 的 `promo/`）。

- [`NOTES.md`](./NOTES.md)：调研笔记（品牌、画面来源、已上线功能、文案出处、虚构数据、与真实扩展的差异、音频署名）
- [`STORYBOARD.md`](./STORYBOARD.md)：分镜；关键静帧在 [`storyboard/`](./storyboard/)（`contact-sheet.jpg` 一页看完，`audio-preview.m4a` 是长版混音）
- [`VO_SCRIPT.md`](./VO_SCRIPT.md)：旁白台本与时间码（重录用）

## 目录

| 路径 | 作用 |
|---|---|
| `capture/` | Playwright 驱动**真实侧边栏**（仓库里原样的 `popup.html`）截图：`mock-chrome.js`（假的 `chrome.*`）、`sample-data.mjs`（虚构额度与历史）、`harness.mjs`、`scenes/panel.mjs`（按故事顺序操作）、`out/`（1000×1720 帧 + 元素位置 JSON） |
| `assets/fonts/` | Inter / JetBrains Mono（OFL），代替 Linux 上没有的 SF 字体 |
| `stage/` | 1920×1080 合成页：通用侧边栏外框 + 运镜 + 左栏大字 + 处境卡 + 通知横幅 + 片尾卡；`window.render(t)` 是确定性的 |
| `audio/` | `make_score.py`（真实乐器采样编曲，署名见 NOTES §8）、`fetch_samples.sh`、`make_vo.py`（Kokoro 离线旁白）、`mix.py`（ducking + 响度归一） |
| `render/` | `render.mjs`（静帧 / 逐帧渲染，可分段并行）、`encode.py`（H.264 + AAC 封装） |

## 复现

```bash
# 0. 依赖
pip install pillow numpy soundfile kokoro-onnx imageio-ffmpeg
# Kokoro 模型放到 promo/.cache/kokoro/（见 audio/make_vo.py 顶部说明）；Playwright 用全局安装的那份

# 1. 真实侧边栏截图（不用起服务器）
node promo/capture/scenes/panel.mjs

# 2. 音频（配乐用真实乐器采样，先拉采样）
bash promo/audio/fetch_samples.sh
python3 promo/audio/make_score.py && python3 promo/audio/make_vo.py && python3 promo/audio/mix.py

# 3. 静帧 / 成片（73.2 s → out/token-police-promo.mp4）
node promo/render/render.mjs stills 11.8 25.8 37.0 56.6
node promo/render/render.mjs frames 30 && python3 promo/render/encode.py
# 可以分两段并行：先跑从 0 开始的那段（它会清空 build/frames）
#   node promo/render/render.mjs frames 30 0 1098 & node promo/render/render.mjs frames 30 1098

# 无旁白版（→ out/token-police-promo-no-vo.mp4，便于重配音）
PROMO_AUDIO=music_only python3 promo/render/encode.py

# 30 秒版（→ out/token-police-promo-30s.mp4）：同一套脚本加 PROMO_CUT=short
PROMO_CUT=short python3 promo/audio/make_score.py
PROMO_CUT=short python3 promo/audio/make_vo.py
PROMO_CUT=short python3 promo/audio/mix.py
PROMO_CUT=short node promo/render/render.mjs frames 30
PROMO_CUT=short python3 promo/render/encode.py
PROMO_CUT=short PROMO_AUDIO=music_only python3 promo/render/encode.py
```

编码：H.264 High · CRF 23（`PROMO_CRF` 可调）· yuv420p · 30 fps · AAC 160k · faststart。
剪辑规则：换场景在小节线上硬切（画面与镜头同时切），同一界面的状态变化用 0.32 s 叠化（`stage/timeline.js`）。

`build/`、`.cache/` 与 `out/`（成片 MP4）不入库，可随时重建。

## 约束（沿用 Estha 宣传片）

- 画面只用真实界面截图；面板里的每个字都是 `popup.html` 自己渲染的。外框和通知横幅是舞台画的系统界面（NOTES §7）。
- 放大时裁切框里不能有被截断的进度条、额度环；推近时侧边栏左缘不越过左栏文字。
- 截图顺序就是故事顺序。
- 只讲已上线的功能，文案都要能在 README / 落地页 / `i18n.js` 里找到（NOTES §5）；不写商店上架、自动发送、速度、用户数、价格。
- 额度数字、对话、仓库都用虚构演示数据；第三方产品只出现名字和扩展自己的简化标记。
- 界面改版后要重拍截图（`node promo/capture/scenes/panel.mjs`），再重渲染。
