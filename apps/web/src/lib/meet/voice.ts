"use client";

/**
 * Noise cancellation for your microphone in Workbase Meet, done on your own device.
 *
 * On top of the browser's own noise suppression (always on), the mic goes through:
 *   1. filters that cut rumble (generator, fan, traffic) and hiss outside the voice range;
 *   2. a "voice gate": it learns the room's background level (the quietest moments of the last
 *      ~2 seconds) and turns the sound down whenever you aren't speaking, so the noise between
 *      your words disappears;
 *   3. a leveller + limiter that brings a soft or far-away voice up to a steady level without
 *      clipping when you shout.
 * Everything is plain WebAudio (no download, no AI model), light enough for cheap phones. It uses
 * the one shared AudioContext (iPhones break with several). If that context can't run (no tap on
 * the page yet, an iPhone interruption), the plain mic is sent instead, so nobody is ever silent
 * because of this.
 */
import { audioContext } from "./engine";

export type NoiseMode = "off" | "on" | "strong";

export const NOISE_LABEL: Record<NoiseMode, string> = {
  off: "Off",
  on: "On (recommended)",
  strong: "Strong (very noisy places)",
};

/** Gate settings: how far the background is turned down, and how loud speech must be to open. */
const GATE: Record<Exclude<NoiseMode, "off">, { depth: number; open: number; low: number; high: number }> = {
  on: { depth: 0.06, open: 1.5, low: 90, high: 9000 }, // background about 15 dB quieter between words
  strong: { depth: 0.02, open: 2.1, low: 140, high: 6500 }, // about 25 dB quieter, narrower voice band
};

const WORKLET = `
class WorkbaseVoiceGate extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "depth", defaultValue: 0.18, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "open", defaultValue: 2.6, minValue: 1, maxValue: 20, automationRate: "k-rate" },
    ];
  }
  constructor() {
    super();
    this.env = 0;            // smoothed loudness (10 ms)
    this.gain = 1;           // current gain applied to the sound
    this.hold = 0;           // seconds the gate stays open after speech
    this.mins = [1, 1, 1, 1]; // quietest moment in each of the last four 0.5 s windows
    this.cur = 1;
    this.t = 0;
  }
  // Input 0 = the sound to pass on (already levelled), input 1 = the filtered microphone, used
  // only to decide whether someone is speaking (levelling would hide the gap between voice and noise).
  process(inputs, outputs, params) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input[0]) return true;
    const x = input[0];
    const d = (inputs[1] && inputs[1][0]) || x;
    const n = x.length;
    const dt = n / sampleRate;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += d[i] * d[i];
    const rms = Math.sqrt(sum / n) + 1e-9;
    const a = Math.exp(-dt / 0.025);
    this.env = a * this.env + (1 - a) * rms;
    // Background level = the quietest 10 ms in the last ~2 s (speech always has gaps).
    this.cur = Math.min(this.cur, this.env);
    this.t += dt;
    if (this.t >= 0.5) {
      this.mins.shift();
      this.mins.push(this.cur);
      this.cur = 1;
      this.t = 0;
    }
    // The quietest moments sit below the average noise: lift the estimate back to it.
    const floor = Math.max(Math.min(Math.min(...this.mins), this.cur), 2e-5) * 1.3;
    const depth = params.depth[0];
    const open = params.open[0];
    if (this.env > floor * open && this.env > 0.002) this.hold = 0.2;
    else this.hold -= dt;
    const target = this.hold > 0 ? 1 : depth;
    const attack = 1 - Math.exp(-1 / (0.004 * sampleRate));
    const release = 1 - Math.exp(-1 / (0.08 * sampleRate));
    let g = this.gain;
    for (let c = 0; c < output.length; c++) {
      const xin = input[c] || x;
      const y = output[c];
      g = this.gain;
      for (let i = 0; i < n; i++) {
        g += (target - g) * (target > g ? attack : release);
        y[i] = xin[i] * g;
      }
    }
    this.gain = g;
    return true;
  }
}
registerProcessor("workbase-voice-gate", WorkbaseVoiceGate);
`;

const loaded = new WeakMap<BaseAudioContext, Promise<boolean>>();
function loadWorklet(ac: AudioContext) {
  let p = loaded.get(ac);
  if (!p) {
    p = (async () => {
      if (!ac.audioWorklet) return false;
      const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
      try {
        await ac.audioWorklet.addModule(url);
        return true;
      } catch {
        return false;
      } finally {
        URL.revokeObjectURL(url);
      }
    })();
    loaded.set(ac, p);
  }
  return p;
}

export class VoiceCleaner {
  /** The cleaned microphone (send this one while `running`). */
  readonly track: MediaStreamTrack;
  readonly ac: AudioContext;
  private src: MediaStreamAudioSourceNode;
  private low: BiquadFilterNode;
  private high: BiquadFilterNode;
  private gate: AudioWorkletNode | null;
  private comp: DynamicsCompressorNode;
  private makeup: GainNode;
  private ahead: DelayNode;
  private limit: DynamicsCompressorNode;
  private dest: MediaStreamAudioDestinationNode;

  private constructor(raw: MediaStreamTrack, ac: AudioContext, gate: AudioWorkletNode | null) {
    this.ac = ac;
    this.src = ac.createMediaStreamSource(new MediaStream([raw]));
    this.low = ac.createBiquadFilter();
    this.low.type = "highpass";
    this.low.Q.value = 0.7;
    this.high = ac.createBiquadFilter();
    this.high.type = "lowpass";
    this.high.Q.value = 0.7;
    this.gate = gate;
    // Leveller: soft voices up, loud ones down, then a limiter so nothing clips.
    this.comp = ac.createDynamicsCompressor();
    // Gentle on purpose: browsers add their own make-up gain to this node, and the gate after it
    // takes care of the noise between words.
    this.comp.threshold.value = -26;
    this.comp.knee.value = 10;
    this.comp.ratio.value = 2.5;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.25;
    this.makeup = ac.createGain();
    this.makeup.gain.value = 1;
    // The sound reaches the gate 40 ms after the part that listens for speech, so the gate is
    // already open when a word starts (first syllables aren't cut).
    this.ahead = ac.createDelay(0.1);
    this.ahead.delayTime.value = gate ? 0.04 : 0;
    this.limit = ac.createDynamicsCompressor();
    this.limit.threshold.value = -3;
    this.limit.knee.value = 0;
    this.limit.ratio.value = 20;
    this.limit.attack.value = 0.001;
    this.limit.release.value = 0.08;
    this.dest = ac.createMediaStreamDestination();
    // mic → filters → leveller → gate → limiter → out; the gate listens to the filtered mic (input 1).
    let node: AudioNode = this.src;
    for (const next of [this.low, this.high, this.comp, this.makeup, this.ahead, ...(gate ? [gate] : []), this.limit, this.dest] as AudioNode[]) {
      node.connect(next);
      node = next;
    }
    if (gate) this.high.connect(gate, 0, 1);
    this.track = this.dest.stream.getAudioTracks()[0];
  }

  /** Build the chain for this microphone. Returns null when the browser can't do it. */
  static async create(raw: MediaStreamTrack, mode: Exclude<NoiseMode, "off">): Promise<VoiceCleaner | null> {
    try {
      const ac = audioContext();
      const ok = await loadWorklet(ac);
      const gate = ok ? new AudioWorkletNode(ac, "workbase-voice-gate", { numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [1] }) : null;
      const v = new VoiceCleaner(raw, ac, gate);
      v.setMode(mode);
      void ac.resume().catch(() => undefined);
      return v;
    } catch {
      return null;
    }
  }

  get running() {
    return this.ac.state === "running";
  }

  /** Has the gate (the part that removes background noise between words)? */
  get gating() {
    return this.gate !== null;
  }

  setMode(mode: Exclude<NoiseMode, "off">) {
    const s = GATE[mode];
    const t = this.ac.currentTime;
    this.low.frequency.setValueAtTime(s.low, t);
    this.high.frequency.setValueAtTime(s.high, t);
    this.gate?.parameters.get("depth")?.setValueAtTime(s.depth, t);
    this.gate?.parameters.get("open")?.setValueAtTime(s.open, t);
  }

  /** Stop the cleaned track (the raw microphone is left alone). */
  stop() {
    this.track.stop();
    for (const n of [this.src, this.low, this.high, this.gate, this.comp, this.makeup, this.ahead, this.limit]) {
      try {
        n?.disconnect();
      } catch {
        // already disconnected
      }
    }
  }
}
