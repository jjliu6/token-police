"""Generate the English voiceover offline with Kokoro-82M (Apache-2.0) via kokoro-onnx.

Every claim in a line comes from copy that already ships in the repo (README,
the landing page docs/index.html, i18n.js); the source table is promo/NOTES.md §5.

Setup (once):
  pip install kokoro-onnx soundfile
  download kokoro-v1.0.onnx + voices-v1.0.bin from
  https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
  and point KOKORO_DIR at them (default: promo/.cache/kokoro).

Run: python3 promo/audio/make_vo.py  ->  promo/build/vo.wav, promo/build/vo_timing.json
     PROMO_CUT=short python3 promo/audio/make_vo.py  ->  the 30-second cut
"""
import json
import os
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = Path(os.environ.get("KOKORO_DIR", ROOT / ".cache" / "kokoro"))
# af_bella: brighter than Estha's af_heart, and the next-best graded American
# voice in Kokoro's VOICES.md (A-); the male voices are graded C+ or lower.
VOICE = os.environ.get("VO_VOICE", "af_bella")
SR_OUT = 48000
CUT = os.environ.get("PROMO_CUT", "long")  # "long" | "short"
SUFFIX = "" if CUT == "long" else f"-{CUT}"

# (start seconds, text, speed). Bar = 2.4 s (100 BPM); each line starts just
# after the bar-line cut of its scene — see stage/scenes.js.
LINES = [
    # Hook (0–7.2)
    (0.55, "Claude Code. Codex. Cursor. Grok. Gemini.", 1.0),
    (4.2, "Every one hides its quota in a different place.", 1.0),
    # Token Police (7.2–14.4)
    (7.75, "Token Police puts it all in one Chrome side panel —", 1.0),
    (11.0, "what's left, and when each one resets.", 0.97),
    # One click (14.4–19.2)
    (14.65, "One click reads every usage page you're already signed into.", 1.0),
    # Burn rate · alerts (19.2–31.2)
    (19.4, "Mid-week, mid-refactor. Is your quota going to last?", 1.0),
    (22.75, "Token Police tracks your burn rate, and warns you before you run out.", 1.0),
    (27.35, "Drop below fifteen percent, and you get a desktop alert.", 1.0),
    # Dispatch (31.2–40.8)
    (31.4, "Can't decide which agent should take a task?", 1.0),
    (34.0, "Dispatch opens one prompt in all of them — filled in, not sent.", 1.0),
    (38.5, "You still hit Send.", 0.95),
    # Cross-check (40.8–48.0)
    (41.0, "Not sure an answer is right?", 1.0),
    (43.3, "Cross-check hands it to a second AI — the one with the most quota left.", 1.02),
    # The hair mascot (48.0–60.0)
    (48.2, "Three hours in. When did you last get up?", 1.0),
    (50.8, "This little guy loses hair while you sit.", 1.0),
    (55.3, "When it's gone, the cards frost over.", 1.0),
    (57.55, "Take a break, tap Done, and the hair grows back.", 1.1),
    # Privacy (60.0–64.8)
    (60.45, "No API keys. No account linking. Nothing leaves your browser.", 1.08),
    # End (64.8–73.2)
    (65.3, "Token Police.", 0.95),
    (66.8, "Know what's left — at a glance.", 0.95),
]
DUR = 74.5

# 30-second cut (index.html?cut=short).
LINES_SHORT = [
    (0.4, "Every AI coding tool hides its quota somewhere else.", 1.0),
    (5.1, "Token Police shows them all in one side panel.", 1.0),
    (9.8, "It tracks your burn rate, and warns you before you run out.", 1.0),
    (14.6, "Dispatch opens one prompt in several agents at once.", 1.0),
    (19.4, "And if you sit too long, the mascot makes you stretch.", 1.0),
    (24.4, "Token Police.", 0.95),
    (25.75, "Free, open source — and nothing leaves your browser.", 1.0),
]
if CUT == "short":
    LINES, DUR = LINES_SHORT, 31.0


def trim(x, thr=0.004):
    idx = np.where(np.abs(x) > thr)[0]
    if len(idx) == 0:
        return x
    a = max(idx[0] - int(0.01 * 24000), 0)
    b = min(idx[-1] + int(0.06 * 24000), len(x))
    return x[a:b]


def resample(x, sr_in, sr_out):
    n = int(round(len(x) * sr_out / sr_in))
    return np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x)


def main():
    k = Kokoro(str(MODEL_DIR / "kokoro-v1.0.onnx"), str(MODEL_DIR / "voices-v1.0.bin"))
    out = np.zeros(int(DUR * SR_OUT))
    timing = []
    for start, text, speed in LINES:
        y, sr = k.create(text, voice=VOICE, speed=speed, lang="en-us")
        y = resample(trim(np.asarray(y, dtype=np.float64)), sr, SR_OUT)
        y /= np.max(np.abs(y)) + 1e-9
        i = int(start * SR_OUT)
        out[i:i + len(y)] += y[: len(out) - i] * 0.7
        timing.append({"start": start, "end": round(start + len(y) / SR_OUT, 3), "text": text})
        print(f"{start:6.2f} → {start + len(y) / SR_OUT:6.2f}  {text}")
    for a, b in zip(timing, timing[1:]):
        if a["end"] > b["start"] - 0.1:
            print("WARNING overlap:", a["text"], "→", b["text"])
    (ROOT / "build").mkdir(exist_ok=True)
    sf.write(ROOT / "build" / f"vo{SUFFIX}.wav", out.astype(np.float32), SR_OUT)
    (ROOT / "build" / f"vo_timing{SUFFIX}.json").write_text(json.dumps(timing, indent=2))


if __name__ == "__main__":
    main()
