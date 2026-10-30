"""Encode rendered frames + final mix into the deliverable MP4.

Run after `node promo/render/render.mjs frames 30` and `python3 promo/audio/mix.py`:
  python3 promo/render/encode.py                          ->  promo/out/token-police-promo.mp4
  PROMO_AUDIO=music_only python3 promo/render/encode.py   ->  promo/out/token-police-promo-no-vo.mp4
  PROMO_CUT=short python3 promo/render/encode.py          ->  promo/out/token-police-promo-30s.mp4
"""
import os
import subprocess
from pathlib import Path

import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[1]
CUT = os.environ.get("PROMO_CUT", "long")
SUFFIX = "" if CUT == "long" else f"-{CUT}"
AUDIO = os.environ.get("PROMO_AUDIO", "mix")   # "mix" | "music_only" (no VO, for re-voicing)
name = "token-police-promo" if CUT == "long" else "token-police-promo-30s"
out = ROOT / "out" / (name + ("" if AUDIO == "mix" else "-no-vo") + ".mp4")
out.parent.mkdir(exist_ok=True)
ff = imageio_ffmpeg.get_ffmpeg_exe()
subprocess.run([
    ff, "-y", "-loglevel", "error",
    "-framerate", "30", "-i", str(ROOT / "build" / f"frames{SUFFIX}" / "f-%05d.jpg"),
    "-i", str(ROOT / "build" / f"{AUDIO}{SUFFIX}.wav"),
    "-c:v", "libx264", "-preset", "slow", "-crf", os.environ.get("PROMO_CRF", "23"), "-tune", "film", "-x264-params", "aq-mode=3",
    "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart",
    "-c:a", "aac", "-b:a", "160k", "-shortest", str(out),
], check=True)
print(out, round(out.stat().st_size / 1e6, 2), "MB")
