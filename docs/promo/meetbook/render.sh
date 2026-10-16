#!/bin/bash
# Render one film: ./render.sh <meet|book|flow> <wide|tall> <workdir>
# Frames (30 fps) → soundtrack from the film's cues → MP4 (H.264 + AAC, -14 LUFS).
set -e
F=$1; FMT=$2; WD=$3
D=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$WD/$F-$FMT" "$D/out"
node "$D/cap.js" "$F" "$FMT" "$WD/$F-$FMT"
[ -f "$WD/$F.wav" ] || python3 "$D/sound.py" "$D/$F-cues.json" "$WD/$F.wav"
NAME=$( [ "$FMT" = wide ] && echo "16x9" || echo "vertical" )
ffmpeg -y -loglevel error -framerate 30 -i "$WD/$F-$FMT/%05d.jpg" -i "$WD/$F.wav" \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -movflags +faststart \
  -af "loudnorm=I=-14:TP=-1.5:LRA=9" -c:a aac -b:a 192k -shortest "$D/out/Workbase-${F^}-$NAME.mp4"
echo "done $F $FMT"
