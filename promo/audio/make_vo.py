"""English voiceover, offline, with Kokoro-82M (Apache-2.0) via kokoro-onnx.

Lines are packed back-to-back with a pause after each; the resulting timing
(build/vo_timing.js) drives the scene timing in stage/, so picture follows voice.
Model files: kokoro-v1.0.onnx + voices-v1.0.bin from
https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0 → promo/.cache/kokoro/

Run: python3 promo/audio/make_vo.py -> promo/build/vo.wav, promo/build/vo_timing.js
"""
import json, os
from pathlib import Path
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = Path(os.environ.get("KOKORO_DIR", ROOT / ".cache" / "kokoro"))
VOICE = os.environ.get("VO_VOICE", "af_heart")
SR = 48000
START = 0.6

# (scene, text, speed, pause-after seconds). Every claim is in README.md (see NOTES.md).
LINES = [
    ("hook", "Claude Code. Codex. Cursor. Grok. Gemini.", 0.95, 0.35),
    ("hook", "Every tool has its own usage page, and you never know which one is about to run out.", 1.02, 0.6),
    ("dash", "Token Police puts every quota in one side panel.", 0.97, 0.3),
    ("dash", "What's left, and when it resets, at a glance.", 0.97, 0.5),
    ("burn", "It tracks your burn rate, and warns you before you run dry.", 0.98, 0.6),
    ("dispatch", "Dispatch opens one prompt in several AIs at once, so you can compare their answers.", 1.02, 0.6),
    ("cross", "Cross-check hands a conversation to a second AI for review.", 1.0, 0.6),
    ("bald", "Sat too long? Your mascot starts losing hair.", 0.97, 0.3),
    ("bald", "Take a break, and it grows back.", 0.95, 0.6),
    ("private", "No API keys. No account linking. Everything stays in your browser.", 0.97, 0.7),
    ("end", "Token Police. Free and open source, for Chrome.", 0.92, 2.2),
]


def trim(x, thr=0.004):
    idx = np.where(np.abs(x) > thr)[0]
    return x if len(idx) == 0 else x[max(idx[0] - 240, 0): idx[-1] + 1440]


def main():
    k = Kokoro(str(MODEL_DIR / "kokoro-v1.0.onnx"), str(MODEL_DIR / "voices-v1.0.bin"))
    clips, timing, t = [], [], START
    for scene, text, speed, pause in LINES:
        y, sr = k.create(text, voice=VOICE, speed=speed, lang="en-us")
        y = trim(np.asarray(y, dtype=np.float64))
        y = np.interp(np.linspace(0, len(y) - 1, int(len(y) * SR / sr)), np.arange(len(y)), y)
        y /= np.max(np.abs(y)) + 1e-9
        clips.append((t, y))
        d = len(y) / SR
        timing.append({"scene": scene, "start": round(t, 3), "end": round(t + d, 3), "text": text})
        print(f"{t:6.2f} → {t + d:6.2f}  {text}")
        t += d + pause
    out = np.zeros(int(t * SR) + SR)
    for s, y in clips:
        i = int(s * SR)
        out[i:i + len(y)] += y * 0.7
    (ROOT / "build").mkdir(exist_ok=True)
    sf.write(ROOT / "build" / "vo.wav", out.astype(np.float32), SR)
    (ROOT / "build" / "vo_timing.js").write_text(
        "window.VO_TIMING = " + json.dumps({"duration": round(t, 3), "lines": timing}, indent=1) + ";\n")


if __name__ == "__main__":
    main()
