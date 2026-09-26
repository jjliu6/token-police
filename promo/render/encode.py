"""Frames + mix → the single deliverable MP4 (1080p30, H.264 + AAC, faststart for social uploads).
Run: python3 promo/render/encode.py -> promo/out/token-police-promo.mp4
"""
import os, subprocess
from pathlib import Path
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[1]
out = ROOT / "out" / "token-police-promo.mp4"
out.parent.mkdir(exist_ok=True)
subprocess.run([
    imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-loglevel", "error",
    "-framerate", "30", "-i", str(ROOT / "build/frames/f-%05d.jpg"), "-i", str(ROOT / "build/mix.wav"),
    "-c:v", "libx264", "-preset", "slow", "-crf", os.environ.get("PROMO_CRF", "20"), "-pix_fmt", "yuv420p",
    "-profile:v", "high", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "192k", "-shortest", str(out),
], check=True)
print(out, round(out.stat().st_size / 1e6, 2), "MB")
