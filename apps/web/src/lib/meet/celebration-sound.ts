"use client";

/**
 * Celebration sounds for Meet shout-outs, made on the spot with WebAudio (no files, no copyrighted
 * music): a short brass fanfare (the old public-domain "Happy Birthday" tune for birthdays), a
 * crowd cheering "woo!" and a round of applause. About 5 seconds. Returns a stop function.
 */
export type CelebrationStyle = "shoutout" | "birthday" | "welldone" | "welcome";

const NOTE = (n: string) => {
  const names: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const m = /^([A-G])(#?)(\d)$/.exec(n)!;
  const midi = 12 * (Number(m[3]) + 1) + names[m[1]] + (m[2] ? 1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
};

const TUNES: Record<CelebrationStyle, Array<[string, number]>> = {
  // [note, beats]; a beat = 0.16 s
  shoutout: [["G4", 1], ["C5", 1], ["E5", 1], ["G5", 2], ["E5", 1], ["G5", 4]],
  welldone: [["C5", 1], ["C5", 1], ["C5", 1], ["C5", 2], ["G#4", 2], ["A#4", 2], ["C5", 1], ["A#4", 1], ["C5", 4]],
  welcome: [["E5", 1], ["G5", 1], ["C6", 2], ["G5", 1], ["C6", 4]],
  // "Happy Birthday to You" (Hill sisters, public domain), first line.
  birthday: [["G4", 1.5], ["G4", 0.5], ["A4", 2], ["G4", 2], ["C5", 2], ["B4", 4]],
};

function noiseBuffer(ac: BaseAudioContext, seconds: number) {
  const b = ac.createBuffer(1, Math.floor(ac.sampleRate * seconds), ac.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

export function playCelebration(style: CelebrationStyle, volume = 0.55): () => void {
  let ac: AudioContext;
  try {
    ac = new AudioContext();
  } catch {
    return () => {};
  }
  void ac.resume().catch(() => undefined);
  const t0 = ac.currentTime + 0.05;
  const master = ac.createGain();
  master.gain.value = volume;
  const comp = ac.createDynamicsCompressor();
  master.connect(comp).connect(ac.destination);

  // 1. Fanfare: two detuned saws + a square, through a soft filter = a brassy sound.
  const beat = 0.16;
  let t = t0;
  for (const [n, beats] of TUNES[style]) {
    const f = NOTE(n);
    const len = beats * beat;
    const g = ac.createGain();
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.linearRampToValueAtTime(3200, t + 0.05);
    lp.frequency.linearRampToValueAtTime(1800, t + len);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.03);
    g.gain.setValueAtTime(0.22, t + Math.max(0.04, len - 0.06));
    g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.12);
    lp.connect(g).connect(master);
    for (const [type, detune] of [["sawtooth", -6], ["sawtooth", 7], ["square", 0]] as const) {
      const o = ac.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = detune;
      o.connect(lp);
      o.start(t);
      o.stop(t + len + 0.15);
    }
    t += len;
  }
  const tuneEnd = t;

  // 2. Crowd: a swell of filtered noise ("yeaaah") and a few voices shouting "woo!".
  const crowd = ac.createBufferSource();
  crowd.buffer = noiseBuffer(ac, 4);
  const cf = ac.createBiquadFilter();
  cf.type = "bandpass";
  cf.frequency.value = 1100;
  cf.Q.value = 0.6;
  const cg = ac.createGain();
  const cStart = t0 + 0.25;
  cg.gain.setValueAtTime(0.0001, cStart);
  cg.gain.exponentialRampToValueAtTime(0.32, cStart + 0.5);
  cg.gain.setValueAtTime(0.32, cStart + 1.8);
  cg.gain.exponentialRampToValueAtTime(0.0001, cStart + 3.8);
  crowd.connect(cf).connect(cg).connect(master);
  crowd.start(cStart);
  crowd.stop(cStart + 4);

  for (let i = 0; i < 5; i++) {
    const s = cStart + 0.15 + i * 0.32 + Math.random() * 0.2;
    const base = 380 + Math.random() * 260;
    const o = ac.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(base, s);
    o.frequency.exponentialRampToValueAtTime(base * 1.9, s + 0.22); // the rising "woo"
    o.frequency.exponentialRampToValueAtTime(base * 1.5, s + 0.7);
    const vib = ac.createOscillator();
    const vg = ac.createGain();
    vib.frequency.value = 6 + Math.random() * 2;
    vg.gain.value = base * 0.04;
    vib.connect(vg).connect(o.frequency);
    const formant = ac.createBiquadFilter();
    formant.type = "bandpass";
    formant.frequency.value = 900 + Math.random() * 500;
    formant.Q.value = 2.5;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(0.09, s + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, s + 0.8);
    o.connect(formant).connect(g).connect(master);
    o.start(s);
    vib.start(s);
    o.stop(s + 0.85);
    vib.stop(s + 0.85);
  }

  // 3. Applause: lots of short claps, thinning out at the end.
  const clapNoise = noiseBuffer(ac, 0.2);
  const clapStart = t0 + 0.1;
  const clapEnd = Math.max(tuneEnd, t0 + 3.2) + 1;
  const count = 90;
  for (let i = 0; i < count; i++) {
    const s = clapStart + Math.pow(Math.random(), 1.5) * (clapEnd - clapStart);
    const src = ac.createBufferSource();
    src.buffer = clapNoise;
    src.playbackRate.value = 0.8 + Math.random() * 0.5;
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 900 + Math.random() * 1400;
    bp.Q.value = 0.9;
    const g = ac.createGain();
    const peak = 0.12 + Math.random() * 0.22;
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(peak, s + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, s + 0.07 + Math.random() * 0.05);
    src.connect(bp).connect(g).connect(master);
    src.start(s);
    src.stop(s + 0.15);
  }

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    void ac.close().catch(() => undefined);
  };
  const timer = setTimeout(close, (clapEnd - t0 + 1) * 1000);
  return () => {
    clearTimeout(timer);
    master.gain.setTargetAtTime(0, ac.currentTime, 0.05);
    setTimeout(close, 200);
  };
}
