"""Score for the Token Police promo, arranged from recorded instrument samples (not synthesis).

Instruments (fetch with audio/fetch_samples.sh; samples CC BY 3.0 — credits in NOTES.md §8):
  Salamander Grand Piano V3 (3 velocity layers); tonejs-instruments xylophone,
  nylon guitar, electric bass, violin, cello, harp.

100 BPM, one bar = 2.4 s, G major — lighter and more playful than the Estha score.
The arrangement follows the film's sections (stage/scenes.js): a ticking xylophone
for the hook, the full band comes in when the panel appears, each story card drops
to a two-instrument break, the mascot section builds, the end card resolves on G.

Run: python3 promo/audio/make_score.py  ->  promo/build/music.wav
     PROMO_CUT=short python3 promo/audio/make_score.py  ->  build/music-short.wav
"""
import os
import re
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
SAMPLES = ROOT / ".cache" / "samples"
CUT = os.environ.get("PROMO_CUT", "long")  # "long" | "short" (30-second cut)
OUT = ROOT / "build" / ("music.wav" if CUT == "long" else f"music-{CUT}.wav")
SR = 44100
BPM = 100
BEAT = 60 / BPM          # 0.6 s
BAR = 4 * BEAT           # 2.4 s
E8 = BEAT / 2            # eighth note, 0.3 s

NOTE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def midi_of(name):
    """'C4', 'D#1', 'Fs2', 'As1' -> MIDI number."""
    m = re.match(r"([A-G])(#|s)?(-?\d)", name)
    n, acc, octv = m.group(1), m.group(2), int(m.group(3))
    return 12 * (octv + 1) + NOTE[n] + (1 if acc else 0)


def load_dir(d, pattern=r"^([A-G](?:#|s)?-?\d)(?:v\d+)?\.mp3$"):
    out = {}
    for f in sorted(Path(d).iterdir()):
        m = re.match(pattern, f.name)
        if not m:
            continue
        x, sr = sf.read(f, always_2d=True)
        assert sr == SR, (f, sr)
        keep_stereo = "piano" in str(d) and x.shape[1] == 2
        out[midi_of(m.group(1))] = x if keep_stereo else x.mean(1)
    return out


INSTR = {
    "piano": {v: load_dir(SAMPLES / f"audio-samples-piano-mp3-velocity{v}" / "audio") for v in (4, 8, 12)},
    "xylo": load_dir(SAMPLES / "tonejs-instrument-xylophone-mp3"),
    "guitar": load_dir(SAMPLES / "tonejs-instrument-guitar-nylon-mp3"),
    "bass": load_dir(SAMPLES / "tonejs-instrument-bass-electric-mp3"),
    "violin": load_dir(SAMPLES / "tonejs-instrument-violin-mp3"),
    "cello": load_dir(SAMPLES / "tonejs-instrument-cello-mp3"),
    "harp": load_dir(SAMPLES / "tonejs-instrument-harp-mp3"),
}


def pitched(bank, midi):
    """Nearest sample, resampled to the target pitch (stereo out)."""
    m0 = min(bank, key=lambda k: abs(k - midi))
    x = bank[m0]
    ratio = 2 ** ((midi - m0) / 12)
    n = int(len(x) / ratio)
    src = np.arange(n) * ratio
    if x.ndim == 1:
        y = np.interp(src, np.arange(len(x)), x)
        return np.stack([y, y], 1)
    return np.stack([np.interp(src, np.arange(len(x)), x[:, c]) for c in range(2)], 1)


# ── Harmony: one chord per bar — (bass root MIDI, chord tones MIDI) ───────────
C = {
    "G": (43, [55, 59, 62, 67, 71]), "Gadd9": (43, [55, 59, 62, 69, 71]),
    "D": (38, [50, 54, 57, 62, 66]), "D/F#": (42, [50, 54, 57, 62, 66]),
    "Em7": (40, [52, 55, 59, 62, 67]), "C": (36, [48, 52, 55, 60, 64]),
    "Cmaj7": (36, [48, 52, 55, 59, 64]), "Am7": (45, [45, 52, 55, 60, 64]),
}
# section, chord — 31 bars ≈ 73.2 s (matches stage/scenes.js LONG)
PLAN = [
    ("hook", "Em7"), ("hook", "Cmaj7"), ("hook2", "D"),                    # 0–7.2    black cards
    ("reveal", "Gadd9"), ("groove", "D/F#"), ("groove", "Em7"),            # 7.2–14.4 Token Police
    ("groove", "C"), ("groove", "D"),                                      # 14.4–19.2 one click
    ("break", "Em7"), ("groove2", "G"), ("groove2", "D/F#"), ("groove2", "Em7"), ("groove2", "C"),  # 19.2–31.2 burn · alerts
    ("break", "Am7"), ("melody", "G"), ("melody", "D/F#"), ("melody", "C"),  # 31.2–40.8 Dispatch
    ("break", "Am7"), ("melody", "Em7"), ("melody", "D"),                  # 40.8–48.0 Cross-check
    ("break", "Cmaj7"), ("build", "G"), ("build", "D/F#"), ("build", "Em7"), ("build", "C"),  # 48.0–60.0 mascot
    ("warm", "Am7"), ("warm", "D"),                                        # 60.0–64.8 privacy
    ("end", "Gadd9"), ("end", "Gadd9"), ("end", "Gadd9"), ("end", "Gadd9"),  # 64.8–73.2 end card
]
HARP_BARS, GLISS_BARS, SWELL_BARS, FILM_END = {3, 27}, {24}, (3, 27), 73.2

# 30-second cut: 12.5 bars, same instruments and voicings.
PLAN_SHORT = [
    ("hook", "Em7"), ("hook2", "D"),                                       # 0–4.8   card
    ("reveal", "Gadd9"), ("groove", "D/F#"),                               # 4.8–9.6  Token Police
    ("groove2", "Em7"), ("groove2", "C"),                                  # 9.6–14.4 burn rate
    ("melody", "G"), ("melody", "D/F#"),                                   # 14.4–19.2 Dispatch
    ("build", "Em7"), ("build", "C"),                                      # 19.2–24.0 mascot
    ("end", "Gadd9"), ("end", "Gadd9"), ("end", "Gadd9"),                  # 24.0–30.0 end card
]
if CUT == "short":
    PLAN = PLAN_SHORT
    HARP_BARS, GLISS_BARS, SWELL_BARS, FILM_END = {2, 10}, {9}, (2, 10), 30.0

DUR = len(PLAN) * BAR + 3.0
N = int(DUR * SR)
bus = {k: np.zeros((N, 2)) for k in ("piano", "xylo", "guitar", "bass", "strings", "harp", "fx")}


def place(busname, sig, t, gain=1.0, pan=0.0, length=None, attack=0.0, release=0.4):
    i = int(t * SR)
    if i >= N or i < 0:
        return
    if length is not None:
        L = min(len(sig), int((length + release) * SR))
        sig = sig[:L].copy()
        r = min(int(release * SR), L)
        if r > 0:
            sig[-r:] *= np.linspace(1, 0, r)[:, None] ** 2
    if attack > 0:
        a = min(int(attack * SR), len(sig))
        sig[:a] *= np.linspace(0, 1, a)[:, None] ** 1.5
    sig = sig[: N - i]
    gl, gr = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    bus[busname][i:i + len(sig)] += sig * np.array([gl, gr]) * gain


def piano(midi, t, vel=0.5, length=1.0, pan=0.0):
    layer = 4 if vel < 0.4 else (8 if vel < 0.75 else 12)
    place("piano", pitched(INSTR["piano"][layer], midi), t, gain=0.3 + 0.6 * vel, pan=pan, length=length, release=0.5)


def xylo(midi, t, gain=0.28, pan=0.3, length=1.2):
    place("xylo", pitched(INSTR["xylo"], midi), t, gain=gain, pan=pan, length=length, release=0.5)


def guitar(midi, t, gain=0.3, pan=-0.35, length=0.9):
    place("guitar", pitched(INSTR["guitar"], midi), t, gain=gain, pan=pan, length=length, release=0.3)


def bass(midi, t, gain=0.45, length=0.5):
    place("bass", pitched(INSTR["bass"], midi), t, gain=gain, length=length, release=0.12)


def strings(midi, t, length, gain=0.2, inst="violin", pan=0.0, attack=0.9):
    place("strings", pitched(INSTR[inst], midi), t, gain=gain, pan=pan, length=length, attack=attack, release=1.2)


def harp_up(tones, t, gain=0.2, step=0.07):
    for j, m in enumerate(tones):
        place("harp", pitched(INSTR["harp"], m), t + step * j, gain=gain, pan=0.4 - 0.1 * j, length=2.2)


prev = None
for b, (sec, ch) in enumerate(PLAN):
    t0 = b * BAR
    root, tones = C[ch]
    up = [m + 12 for m in tones[1:]]          # upper voicing (4 notes)
    if sec in ("hook", "hook2"):
        # a ticking xylophone — "which page was it again?" — over a held cello
        for i in range(8):
            if sec == "hook" and i % 2:
                continue
            xylo(tones[4] + 12 if i % 4 == 0 else tones[3] + 12, t0 + i * E8, gain=0.16 + (0.05 if i == 0 else 0), pan=0.25, length=0.35)
        strings(root + 12, t0, BAR + 0.2, gain=0.16, inst="cello", pan=-0.2, attack=0.6)
        if sec == "hook2":
            for j, m in enumerate(up):           # rising pickup into the reveal
                guitar(m, t0 + BAR / 2 + j * E8, gain=0.22 + 0.03 * j, pan=-0.3)
    elif sec == "reveal":
        for j, m in enumerate(tones):
            piano(m, t0 + j * 0.015, 0.55, length=2.2, pan=-0.25 + 0.12 * j)
        piano(root, t0, 0.55, length=2.2)
        bass(root, t0, gain=0.5, length=BAR)
        strings(tones[2] + 12, t0, BAR + 0.4, gain=0.2, pan=-0.3)
        strings(tones[3] + 12, t0, BAR + 0.4, gain=0.18, pan=0.3)
        if b in HARP_BARS:
            harp_up(up + [up[0] + 12], t0 + 0.05)
        xylo(up[-1] + 12, t0 + BAR - E8, gain=0.18)
    elif sec in ("groove", "groove2", "melody", "build"):
        # bass: root–root–fifth–octave bounce
        fifth = root + 7
        for i, (n, ln) in enumerate([(root, 0.45), (root, 0.2), (fifth, 0.35), (root + 12, 0.2), (root, 0.35), (fifth, 0.25)]):
            pos = [0, 3, 4, 5, 6, 7][i]
            bass(n, t0 + pos * E8, gain=0.42 if pos in (0, 4) else 0.3, length=ln)
        # nylon guitar: eighth-note arpeggio
        arp = [0, 1, 2, 3, 2, 1, 2, 3]
        for i, k in enumerate(arp):
            guitar(up[k] - 12, t0 + i * E8, gain=0.2 if i % 2 else 0.26, pan=-0.4, length=0.6)
        # piano: syncopated chord on 1 and the and-of-2
        if sec != "groove":
            for pos, v, ln in ((0, 0.42, 0.55), (3, 0.34, 0.3), (6, 0.3, 0.3)):
                for j, m in enumerate(up[:3]):
                    piano(m, t0 + pos * E8 + 0.01 * j, v, length=ln, pan=0.15)
        if sec in ("melody", "build"):
            # xylophone hook: down the chord, then step back up
            hi = sorted([m + 12 for m in up])
            mel = [(0, hi[3]), (2, hi[2]), (4, hi[0]), (5, hi[0] + 2), (6, hi[1])]
            for pos, m in mel:
                xylo(m, t0 + pos * E8, gain=0.26 if pos == 0 else 0.2, pan=0.35, length=0.6)
        if sec == "build":
            strings(tones[2] + 12, t0, BAR + 0.3, gain=0.17, pan=-0.35, attack=0.6)
            strings(tones[4] + 12, t0, BAR + 0.3, gain=0.15, pan=0.35, attack=0.6)
            strings(root + 12, t0, BAR + 0.3, gain=0.18, inst="cello", pan=-0.1, attack=0.4)
            if b in GLISS_BARS:  # the hair grows back: harp sweep up two octaves
                harp_up([m + o for o in (12, 24) for m in sorted(tones[1:])], t0 + BAR / 2, gain=0.17, step=0.05)
    elif sec == "break":
        # story card: just bass and a xylophone question
        bass(root, t0, gain=0.4, length=1.2)
        bass(root + 7, t0 + 4 * E8, gain=0.3, length=0.6)
        for pos, m in ((0, up[2] + 12), (3, up[3] + 12), (5, up[1] + 12)):
            xylo(m, t0 + pos * E8, gain=0.2, pan=0.3, length=0.8)
        strings(tones[1] + 12, t0, BAR + 0.2, gain=0.12, inst="cello", pan=-0.2, attack=0.5)
    elif sec == "warm":
        for j, m in enumerate(tones[1:]):
            piano(m, t0 + j * 0.02, 0.4, length=2.3, pan=-0.2 + 0.1 * j)
        bass(root, t0, gain=0.4, length=BAR)
        strings(tones[2] + 12, t0, BAR + 0.3, gain=0.2, pan=-0.3, attack=0.5)
        strings(tones[4] + 12, t0, BAR + 0.3, gain=0.17, pan=0.3, attack=0.5)
        for i in range(0, 8, 2):
            guitar(up[i // 2] - 12, t0 + i * E8, gain=0.18, pan=-0.4, length=0.8)
    elif sec == "end":
        if prev != "end":
            for j, m in enumerate(tones):
                piano(m, t0 + j * 0.03, 0.55, length=6.5, pan=-0.3 + 0.12 * j)
            piano(root, t0, 0.6, length=6.5)
            piano(root - 12, t0, 0.5, length=6.5)
            strings(tones[2] + 12, t0, 6.5, gain=0.22, pan=-0.3, attack=0.3)
            strings(tones[3] + 12, t0, 6.5, gain=0.2, pan=0.3, attack=0.3)
            strings(root + 12, t0, 6.5, gain=0.2, inst="cello", pan=0.0, attack=0.3)
            bass(root, t0, gain=0.5, length=5.5)
            if b in HARP_BARS:
                harp_up(up + [up[0] + 12, up[1] + 12], t0 + 0.6, gain=0.18)
            # the xylophone tick, now resolved
            for pos, m in ((0, up[3] + 12), (2, up[2] + 12), (4, up[3] + 24)):
                xylo(m, t0 + 1.2 + pos * E8, gain=0.17, pan=0.3, length=1.4)
        if b == len(PLAN) - 1:
            xylo(up[3] + 24, t0 + 0.3, gain=0.12, pan=0.35, length=2.0)  # last glint
    prev = sec

# Reverse-piano swells into the reveal and into the end card.
for bar_hit in SWELL_BARS:
    swell = sum(pitched(INSTR["piano"][8], m)[: int(1.8 * SR)] for m in C["Gadd9"][1][1:4])
    swell = swell[::-1] * np.linspace(0, 1, len(swell))[:, None] ** 2
    place("fx", swell, bar_hit * BAR - len(swell) / SR, gain=0.3)


def reverb(x, secs, mix, seed):
    r = np.random.default_rng(seed)
    n = int(secs * SR)
    t = np.arange(n) / SR
    out = np.zeros_like(x)
    for c in range(2):
        ir = r.standard_normal(n) * np.exp(-t * 6.9 / secs)
        X = np.fft.rfft(ir)
        f = np.fft.rfftfreq(n, 1 / SR)
        ir = np.fft.irfft(X / np.sqrt(1 + (f / 6500) ** 4), n)
        ir[: int(0.015 * SR)] = 0
        ir /= np.sqrt(np.sum(ir ** 2))
        L = len(x) + n
        wet = np.fft.irfft(np.fft.rfft(x[:, c], L) * np.fft.rfft(ir, L), L)[: len(x)]
        out[:, c] = (1 - mix) * x[:, c] + mix * wet
    return out


mix = (reverb(bus["piano"], 2.2, 0.24, 1) * 1.0
       + reverb(bus["xylo"], 2.0, 0.28, 2) * 0.9
       + reverb(bus["guitar"], 1.8, 0.2, 3) * 0.9
       + reverb(bus["bass"], 1.2, 0.08, 4) * 1.0
       + reverb(bus["strings"], 3.2, 0.38, 5) * 1.0
       + reverb(bus["harp"], 2.8, 0.4, 6) * 1.0
       + reverb(bus["fx"], 2.5, 0.45, 7) * 1.0)

fi = int(0.2 * SR)
mix[:fi] *= np.linspace(0, 1, fi)[:, None]
# Let the last chord ring, then fade out just before the film ends (FILM_END).
fo, fe = int((FILM_END - 2.2) * SR), int((FILM_END - 0.1) * SR)
mix[fo:fe] *= np.linspace(1, 0, fe - fo)[:, None] ** 2
mix[fe:] = 0
peak = np.max(np.abs(mix)) + 1e-9
mix = np.tanh(mix / peak * 1.15) / np.tanh(1.15) * 0.85

# Output at 48 kHz for the video.
n48 = int(len(mix) * 48000 / SR)
src = np.linspace(0, len(mix) - 1, n48)
out = np.stack([np.interp(src, np.arange(len(mix)), mix[:, c]) for c in range(2)], 1)
OUT.parent.mkdir(parents=True, exist_ok=True)
sf.write(OUT, out.astype(np.float32), 48000)
print("wrote", OUT, round(len(out) / 48000, 2), "s,", len(PLAN), "bars")
