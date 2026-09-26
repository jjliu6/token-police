"""A quiet ambient bed synthesized from scratch (numpy sine/triangle tones only).

No samples, loops or third-party recordings → no licence or attribution needed.
Run: python3 promo/audio/make_bed.py -> promo/build/music.wav (length from vo_timing.js)
"""
import json, re
from pathlib import Path
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
SR = 48000
dur = json.loads(re.search(r"=\s*(\{.*\});", (ROOT / "build/vo_timing.js").read_text(), re.S).group(1))["duration"] + 1.0
n = int(dur * SR)
t = np.arange(n) / SR
f = lambda m: 440 * 2 ** ((m - 69) / 12)
# Dmaj9 → Bm7 → Gmaj7 → A6, one chord per 5.5 s
CHORDS = [[50, 57, 62, 66, 69, 76], [47, 54, 62, 66, 69, 74], [43, 55, 62, 66, 71, 74], [45, 57, 61, 64, 66, 73]]
L = 5.5
out = np.zeros((n, 2))
for ci in range(int(dur / L) + 1):
    notes = CHORDS[ci % 4]
    a, b = int(ci * L * SR), min(int((ci * L + L + 1.5) * SR), n)
    if a >= n: break
    tt = t[a:b] - ci * L
    env = np.minimum(1, tt / 1.6) * np.minimum(1, np.maximum(0, (L + 1.5 - tt) / 1.5))
    for k, m in enumerate(notes):
        fr = f(m)
        det = 1 + 0.0015 * (k % 3 - 1)
        v = (np.sin(2 * np.pi * fr * det * tt) + 0.25 * np.sin(2 * np.pi * 2 * fr * tt + 0.5) + 0.08 * np.sin(2 * np.pi * 3 * fr * tt)) * env
        g = 0.09 if m < 52 else 0.05
        pan = 0.5 + 0.3 * np.sin(k * 1.7)
        out[a:b, 0] += v * g * (1 - pan) * 2
        out[a:b, 1] += v * g * pan * 2
    # soft plucked arpeggio on top (decaying sine)
    for j, m in enumerate([notes[2] + 12, notes[3] + 12, notes[4] + 12, notes[3] + 12]):
        s = int((ci * L + j * L / 4) * SR)
        if s >= n: break
        e = min(s + 2 * SR, n); tp = t[s:e] - t[s]
        p = np.sin(2 * np.pi * f(m) * tp) * np.exp(-tp * 3.2) * np.minimum(1, tp / 0.005) * 0.05
        out[s:e, j % 2] += p; out[s:e, 1 - j % 2] += p * 0.6
# gentle fade in/out; simple one-pole lowpass to soften
out *= np.minimum(1, t / 1.5)[:, None] * np.minimum(1, (dur - t) / 2.5)[:, None]
for c in range(2):
    y = out[:, c]; acc = 0.0; al = 0.25
    z = np.empty_like(y)
    for i in range(n):
        acc += al * (y[i] - acc); z[i] = acc
    out[:, c] = z
out /= np.max(np.abs(out)) + 1e-9
(ROOT / "build").mkdir(exist_ok=True)
sf.write(ROOT / "build/music.wav", (out * 0.8).astype(np.float32), SR)
print("music.wav", round(dur, 2), "s")
