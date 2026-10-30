"""Mix VO over music with sidechain-style ducking, then loudness-normalise.

Run: python3 promo/audio/mix.py  ->  promo/build/mix.wav (+ mix-preview.m4a)
     PROMO_CUT=short python3 promo/audio/mix.py  ->  the 30-second cut
Same chain as the Estha promo: duck the music under the VO, then loudnorm to −16 LUFS.
"""
import subprocess
from pathlib import Path

import imageio_ffmpeg
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
B = ROOT / "build"
import os
SUFFIX = "" if os.environ.get("PROMO_CUT", "long") == "long" else "-" + os.environ["PROMO_CUT"]
music, sr = sf.read(B / f"music{SUFFIX}.wav")
vo, sr2 = sf.read(B / f"vo{SUFFIX}.wav")
assert sr == sr2 == 48000
n = min(len(music), len(vo))
music, vo = music[:n], vo[:n]

# Envelope follower on the VO -> duck music by up to ~7 dB while speaking.
win = int(0.03 * sr)
env = np.sqrt(np.convolve(vo ** 2, np.ones(win) / win, mode="same"))
gate = (env > 0.02).astype(float)
# smooth attack/release (80 ms / 350 ms)
duck = np.zeros(n)
a, r = np.exp(-1 / (0.08 * sr)), np.exp(-1 / (0.35 * sr))
acc = 0.0
for i, g in enumerate(gate):
    acc = (a if g > acc else r) * acc + (1 - (a if g > acc else r)) * g
    duck[i] = acc
gain = 10 ** (-7 * duck / 20)

mix = music * gain[:, None] * 0.55 + np.stack([vo, vo], 1) * 1.0
mix /= np.max(np.abs(mix)) + 1e-9
sf.write(B / f"mix_raw{SUFFIX}.wav", (mix * 0.89).astype(np.float32), sr)

ff = imageio_ffmpeg.get_ffmpeg_exe()
subprocess.run([ff, "-y", "-loglevel", "error", "-i", str(B / f"mix_raw{SUFFIX}.wav"),
                "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", str(B / f"mix{SUFFIX}.wav")], check=True)
subprocess.run([ff, "-y", "-loglevel", "error", "-i", str(B / f"mix{SUFFIX}.wav"), "-c:a", "aac", "-b:a", "128k",
                str(B / f"mix-preview{SUFFIX}.m4a")], check=True)
# Stems for re-voicing (e.g. ElevenLabs): music alone (not ducked) and VO alone.
subprocess.run([ff, "-y", "-loglevel", "error", "-i", str(B / f"music{SUFFIX}.wav"),
                "-af", "loudnorm=I=-20:TP=-1.5:LRA=11", "-ar", "48000", str(B / f"music_only{SUFFIX}.wav")], check=True)
subprocess.run([ff, "-y", "-loglevel", "error", "-i", str(B / f"vo{SUFFIX}.wav"),
                "-af", "loudnorm=I=-18:TP=-1.5:LRA=11", "-ar", "48000", str(B / f"vo_only{SUFFIX}.wav")], check=True)
print("wrote", B / f"mix{SUFFIX}.wav", B / f"mix-preview{SUFFIX}.m4a", "+ music_only / vo_only stems")
