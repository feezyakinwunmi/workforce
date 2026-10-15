"use client";

/**
 * Meeting media in the browser (WebRTC through Cloudflare Realtime, via /api/meet/[room]/media).
 * One connection publishes my mic / camera / screen; a second one receives everyone else's.
 * Turning the camera off swaps in a tiny black frame, so the published tracks never change.
 */

export type Sdp = { type: "offer" | "answer"; sdp: string };
export type Source = "mic" | "camera" | "screen";
export type RemoteRef = { participantId: string; sessionId: string; trackName: Source };
type CfTrack = { mid?: string; trackName?: string; sessionId?: string; errorCode?: string };
type Reply = { sessionDescription?: Sdp; tracks?: CfTrack[]; requiresImmediateRenegotiation?: boolean; error?: string };

export class MediaApi {
  constructor(private roomId: string) {}
  async post<T = Reply>(op: string, body: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(`/api/meet/${this.roomId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op, ...body }),
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new Error(json.error || `Media request failed (${res.status})`);
    return json;
  }
}

/** Runs async jobs one after another (Cloudflare wants one change at a time per session). */
class Queue {
  private last: Promise<unknown> = Promise.resolve();
  run<T>(job: () => Promise<T>): Promise<T> {
    const next = this.last.then(job, job);
    this.last = next.catch(() => undefined);
    return next;
  }
}

/** A black 16×9 frame at 1 fps, sent while the camera is off. */
export function blackVideoTrack(): MediaStreamTrack {
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 9;
  const ctx = c.getContext("2d")!;
  ctx.fillRect(0, 0, 16, 9);
  const stream = c.captureStream(1);
  const track = stream.getVideoTracks()[0];
  // Keep painting so the track doesn't stall.
  const t = setInterval(() => ctx.fillRect(0, 0, 16, 9), 1000);
  track.addEventListener("ended", () => clearInterval(t));
  return track;
}

/** Silence, for people without a microphone. */
export function silentAudioTrack(): MediaStreamTrack {
  const ac = new AudioContext();
  const dest = ac.createMediaStreamDestination();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  gain.gain.value = 0;
  osc.connect(gain).connect(dest);
  osc.start();
  return dest.stream.getAudioTracks()[0];
}

async function iceConfig(api: MediaApi): Promise<RTCConfiguration> {
  const { iceServers } = await api.post<{ iceServers: RTCIceServer[] }>("ice");
  return { iceServers, bundlePolicy: "max-bundle" };
}

export class Publisher {
  pc!: RTCPeerConnection;
  session = "";
  private ticket = "";
  private tx = new Map<Source, RTCRtpTransceiver>();
  private q = new Queue();
  constructor(private api: MediaApi) {}

  /** Connect and publish mic + camera. */
  async start(config: RTCConfiguration, mic: MediaStreamTrack, camera: MediaStreamTrack, lowData: boolean) {
    this.pc = new RTCPeerConnection(config);
    const s = await this.api.post<{ session: string; ticket: string }>("session");
    this.session = s.session;
    this.ticket = s.ticket;
    this.tx.set("mic", this.pc.addTransceiver(mic, { direction: "sendonly" }));
    this.tx.set("camera", this.pc.addTransceiver(camera, { direction: "sendonly", sendEncodings: [videoEncoding(lowData)] }));
    await this.q.run(() => this.publish(["mic", "camera"]));
  }

  private async publish(sources: Source[]) {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    const tracks = sources.map((s) => ({ mid: this.tx.get(s)!.mid!, trackName: s }));
    const res = await this.api.post("push", { session: this.session, ticket: this.ticket, offer: this.pc.localDescription!.toJSON(), tracks });
    if (!res.sessionDescription) throw new Error("No answer from the call service");
    await this.pc.setRemoteDescription(res.sessionDescription);
  }

  /** Swap what a published track carries (mute, camera off, new device, background). */
  async replace(source: Source, track: MediaStreamTrack | null) {
    const t = this.tx.get(source);
    if (t) await t.sender.replaceTrack(track);
  }

  async setLowData(lowData: boolean) {
    const sender = this.tx.get("camera")?.sender;
    if (!sender) return;
    const p = sender.getParameters();
    if (!p.encodings?.length) p.encodings = [{}];
    Object.assign(p.encodings[0], videoEncoding(lowData));
    await sender.setParameters(p).catch(() => undefined);
  }

  /** Screen sharing: the first time adds a third track; later times reuse it. */
  async shareScreen(track: MediaStreamTrack | null) {
    const existing = this.tx.get("screen");
    if (existing) return existing.sender.replaceTrack(track);
    if (!track) return;
    this.tx.set("screen", this.pc.addTransceiver(track, { direction: "sendonly", sendEncodings: [{ maxBitrate: 1_200_000, maxFramerate: 15 }] }));
    await this.q.run(() => this.publish(["screen"]));
  }

  get hasScreenTrack() {
    return this.tx.has("screen");
  }

  close() {
    this.pc?.close();
  }
}

function videoEncoding(lowData: boolean): RTCRtpEncodingParameters {
  return lowData ? { maxBitrate: 150_000, scaleResolutionDownBy: 2, maxFramerate: 15 } : { maxBitrate: 700_000, maxFramerate: 24 };
}

export class Subscriber {
  pc!: RTCPeerConnection;
  session = "";
  private ticket = "";
  private q = new Queue();
  private byMid = new Map<string, RemoteRef>();
  private pulled = new Map<string, string>(); // key -> mid
  onTrack: (ref: RemoteRef, track: MediaStreamTrack) => void = () => {};
  onRemoved: (ref: RemoteRef) => void = () => {};
  constructor(private api: MediaApi) {}

  static key(r: { sessionId: string; trackName: string }) {
    return `${r.sessionId}/${r.trackName}`;
  }

  async start(config: RTCConfiguration) {
    this.pc = new RTCPeerConnection(config);
    this.pc.ontrack = (e) => {
      const ref = e.transceiver.mid ? this.byMid.get(e.transceiver.mid) : undefined;
      if (ref) this.onTrack(ref, e.track);
    };
    const s = await this.api.post<{ session: string; ticket: string }>("session");
    this.session = s.session;
    this.ticket = s.ticket;
  }

  has(r: { sessionId: string; trackName: string }) {
    return this.pulled.has(Subscriber.key(r));
  }

  /** Receive these tracks (skips ones already received). */
  pull(refs: RemoteRef[]) {
    return this.q.run(async () => {
      const todo = refs.filter((r) => !this.pulled.has(Subscriber.key(r)));
      if (!todo.length) return;
      const res = await this.api.post("pull", {
        session: this.session,
        ticket: this.ticket,
        remotes: todo.map((r) => ({ sessionId: r.sessionId, trackName: r.trackName })),
      });
      for (const t of res.tracks ?? []) {
        if (t.errorCode || !t.mid) continue;
        const ref = todo.find((r) => r.sessionId === t.sessionId && r.trackName === t.trackName);
        if (!ref) continue;
        this.byMid.set(t.mid, ref);
        this.pulled.set(Subscriber.key(ref), t.mid);
      }
      if (res.sessionDescription?.type === "offer") {
        await this.pc.setRemoteDescription(res.sessionDescription);
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        await this.api.post("renegotiate", { session: this.session, ticket: this.ticket, answer: this.pc.localDescription!.toJSON() });
      }
    });
  }

  /** Stop receiving these tracks. */
  drop(refs: Array<{ sessionId: string; trackName: string; participantId?: string }>) {
    return this.q.run(async () => {
      const mids: string[] = [];
      for (const r of refs) {
        const k = Subscriber.key(r);
        const mid = this.pulled.get(k);
        if (!mid) continue;
        mids.push(mid);
        this.pulled.delete(k);
        const ref = this.byMid.get(mid);
        this.byMid.delete(mid);
        if (ref) this.onRemoved(ref);
      }
      if (!mids.length) return;
      for (const t of this.pc.getTransceivers()) if (t.mid && mids.includes(t.mid)) t.stop();
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      const res = await this.api.post("close", { session: this.session, ticket: this.ticket, mids, offer: this.pc.localDescription!.toJSON() });
      if (res.sessionDescription?.type === "answer") await this.pc.setRemoteDescription(res.sessionDescription);
    });
  }

  close() {
    this.pc?.close();
  }
}

/** Starts both connections. */
export async function connectMedia(roomId: string, mic: MediaStreamTrack, camera: MediaStreamTrack, lowData: boolean) {
  const api = new MediaApi(roomId);
  const config = await iceConfig(api);
  const pub = new Publisher(api);
  const sub = new Subscriber(api);
  await Promise.all([pub.start(config, mic, camera, lowData), sub.start(config)]);
  return { pub, sub };
}

/** Bytes sent + received and a 0–3 signal score from both connections. */
export async function readStats(pcs: RTCPeerConnection[]) {
  let bytes = 0;
  let rtt: number | null = null;
  let lost = 0;
  let packets = 0;
  for (const pc of pcs) {
    if (!pc || pc.connectionState === "closed") continue;
    const stats = await pc.getStats();
    stats.forEach((s) => {
      if (s.type === "transport") bytes += (s.bytesSent ?? 0) + (s.bytesReceived ?? 0);
      if (s.type === "candidate-pair" && s.nominated && s.state === "succeeded" && typeof s.currentRoundTripTime === "number") {
        rtt = Math.max(rtt ?? 0, s.currentRoundTripTime);
      }
      if (s.type === "inbound-rtp") {
        lost += s.packetsLost ?? 0;
        packets += (s.packetsReceived ?? 0) + (s.packetsLost ?? 0);
      }
    });
  }
  return { bytes, rtt, lost, packets };
}

export function signalScore(rtt: number | null, lossRate: number, connected: boolean) {
  if (!connected) return 0;
  if ((rtt ?? 0) > 0.6 || lossRate > 0.08) return 1;
  if ((rtt ?? 0) > 0.3 || lossRate > 0.03) return 2;
  return 3;
}

/** Loudness 0–1 of an audio track, for the "speaking" ring. Returns a stop function. */
export function watchLevel(track: MediaStreamTrack, onLevel: (level: number) => void) {
  const AC = window.AudioContext;
  const ac = new AC();
  const src = ac.createMediaStreamSource(new MediaStream([track]));
  const an = ac.createAnalyser();
  an.fftSize = 512;
  src.connect(an);
  const buf = new Uint8Array(an.fftSize);
  const t = setInterval(() => {
    an.getByteTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += (v - 128) * (v - 128);
    onLevel(Math.min(1, Math.sqrt(sum / buf.length) / 40));
  }, 150);
  return () => {
    clearInterval(t);
    void ac.close();
  };
}
