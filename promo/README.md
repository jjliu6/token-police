# promo/ — Token Police promo video (English, with voiceover)

Same method as the Estha for Mac promo: **real UI, not mockups** → a deterministic
1920×1080 HTML stage → offline voiceover → ffmpeg. The extension's own code is not modified.

| Path | What it does |
|---|---|
| `capture/` | Playwright opens the **real `popup.html`** with a `chrome.*` stub (`chrome-stub.js`) and fictional demo data (`demo-data.mjs`); `shoot.mjs` clicks real buttons and saves 920×1800 frames to `capture/out/` |
| `audio/make_vo.py` | Voiceover with Kokoro-82M (Apache-2.0, offline). Writes `build/vo_timing.js` — **scene timing follows the voice** |
| `audio/make_bed.py` | Quiet ambient bed synthesized from pure sine tones in numpy — no samples, so **no music licence or credit needed** |
| `audio/mix.py` | Ducks the bed under the voice, normalizes to −14 LUFS (social platforms) |
| `stage/` | Composition: headline left, real panel right with camera moves, burned-in captions (for muted autoplay), end card |
| `render/` | `render.mjs` (stills / frames), `encode.py` → `out/token-police-promo.mp4` |

## Rebuild

```bash
pip install pillow numpy soundfile kokoro-onnx imageio-ffmpeg
# Kokoro model → promo/.cache/kokoro/ (kokoro-v1.0.onnx, voices-v1.0.bin; URL in audio/make_vo.py)
node promo/capture/shoot.mjs
python3 promo/audio/make_vo.py && python3 promo/audio/make_bed.py && python3 promo/audio/mix.py
node promo/render/render.mjs frames 30 && python3 promo/render/encode.py
```

`build/`, `.cache/`, `out/` are not committed. Contact sheet: [`storyboard/contact-sheet.jpg`](storyboard/contact-sheet.jpg).

## Script (~46 s) — every claim is from the repo README

| Scene | Voiceover |
|---|---|
| Hook | Claude Code. Codex. Cursor. Grok. Gemini. Every tool has its own usage page, and you never know which one is about to run out. |
| Dashboard | Token Police puts every quota in one side panel. What's left, and when it resets, at a glance. |
| Burn rate | It tracks your burn rate, and warns you before you run dry. |
| Dispatch | Dispatch opens one prompt in several AIs at once, so you can compare their answers. |
| Cross-check | Cross-check hands a conversation to a second AI for review. |
| Mascot | Sat too long? Your mascot starts losing hair. Take a break, and it grows back. |
| Privacy | No API keys. No account linking. Everything stays in your browser. |
| End | Token Police. Free and open source, for Chrome. |

Notes: usage numbers are fictional sample data. Fonts: Inter replaces SF Pro in the Linux capture.
