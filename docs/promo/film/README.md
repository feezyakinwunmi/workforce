# Launch film (62 s)

1. Start the mock dashboard and run `node grab.js desk|ov|dark|notedark|slip|phone` to capture the screens into `img/` (2x) and element positions into `img/boxes.json`; make 960x600 JPEG copies in `thumbs/` for the wall.
2. `node cap.js wide fw` and `node cap.js tall ft` render the frames (30 fps) and write `cues.json`.
3. `python3 sound.py cues.json track.wav` builds the music and sound effects from the cues, then `ffmpeg ... loudnorm=I=-14` and mux with the frames.
