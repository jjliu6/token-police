#!/usr/bin/env bash
# Fetch the recorded instrument samples used by make_score.py into promo/.cache/samples.
# Licenses (commercial use OK with attribution — credit line is in promo/NOTES.md §8):
#   - Salamander Grand Piano V3 by Alexander Holm — CC BY 3.0 (npm: @audio-samples/piano-mp3-velocity*)
#   - tonejs-instruments (xylophone, nylon guitar, electric bass, violin, cello, harp)
#     compiled by Nicholaus Brosowsky — samples CC BY 3.0
set -euo pipefail
DEST="$(cd "$(dirname "$0")/.." && pwd)/.cache/samples"
mkdir -p "$DEST" && cd "$DEST"
for p in @audio-samples/piano-mp3-velocity4 @audio-samples/piano-mp3-velocity8 @audio-samples/piano-mp3-velocity12 \
         tonejs-instrument-xylophone-mp3 tonejs-instrument-guitar-nylon-mp3 tonejs-instrument-bass-electric-mp3 \
         tonejs-instrument-violin-mp3 tonejs-instrument-cello-mp3 tonejs-instrument-harp-mp3; do
  name=$(echo "$p" | sed 's#@##; s#/#-#')
  [ -d "$name" ] && continue
  tgz=$(npm pack "$p" --silent)
  mkdir -p "$name" && tar xzf "$tgz" -C "$name" --strip-components=1 && rm "$tgz"
done
ls "$DEST"
