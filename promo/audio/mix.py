"""Duck the synthesized bed under the VO and loudness-normalise to -14 LUFS (social platforms).
Run: python3 promo/audio/mix.py -> promo/build/mix.wav
"""
import subprocess
from pathlib import Path
import imageio_ffmpeg
import numpy as np
import soundfile as sf

B = Path(__file__).resolve().parents[1] / "build"
music, sr = sf.read(B / "music.wav")
vo, _ = sf.read(B / "vo.wav")
n = max(len(music), len(vo))
music = np.pad(music, ((0, n - len(music)), (0, 0))); vo = np.pad(vo, (0, n - len(vo)))
win = int(0.03 * sr)
env = np.sqrt(np.convolve(vo ** 2, np.ones(win) / win, mode="same"))
gate = (env > 0.02).astype(float)
duck = np.zeros(n); acc = 0.0
a, r = np.exp(-1 / (0.08 * sr)), np.exp(-1 / (0.4 * sr))
for i, g in enumerate(gate):
    c = a if g > acc else r
    acc = c * acc + (1 - c) * g; duck[i] = acc
gain = 10 ** (-8 * duck / 20)
mix = music * gain[:, None] * 0.22 + np.stack([vo, vo], 1)
mix /= np.max(np.abs(mix)) + 1e-9
sf.write(B / "mix_raw.wav", (mix * 0.89).astype(np.float32), sr)
ff = imageio_ffmpeg.get_ffmpeg_exe()
subprocess.run([ff, "-y", "-loglevel", "error", "-i", str(B / "mix_raw.wav"),
                "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", "48000", str(B / "mix.wav")], check=True)
print("wrote", B / "mix.wav")
