"use client";

/**
 * Meeting media in the browser (WebRTC through Cloudflare Realtime, via /api/meet/[room]/media).
 * One connection publishes my mic / camera / screen; a second one receives everyone else's.
 * Turning the camera off swaps in a tiny black frame, so the published tracks never change.
 */

export type Sdp = { type: "offer" | "answer"; sdp: string };
export type Source = "mic" | "camera" | "screen";
export type RemoteRef = { participantId: string; sessionId: string; trackName: string; source: Source };
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
  // A disabled track still sends black frames, even when the tab is in the background (timers
  // slow down there). Without packets Cloudflare would remove the track after 30 s.
  track.enabled = false;
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

export type PublishedTrack = { name: string; kind: "audio" | "video" };
export type SendInfo = { source: Source; name: string; cloudflare: string; bytes: number; frames: number | null; size: string | null; codec: string | null };

/** "camera.3" → "camera". Track names get a number when a track is published again. */
export const sourceOf = (trackName: string) => trackName.split(".")[0] as Source;

export class Publisher {
  pc!: RTCPeerConnection;
  session = "";
  private ticket = "";
  private tx = new Map<Source, RTCRtpTransceiver>();
  private names = new Map<Source, string>();
  private version = 0;
  private lowData = false;
  private q = new Queue();
  private screenIdle: MediaStreamTrack | null = null;
  private misses = new Map<Source, number>();
  private lastRepublish = new Map<Source, number>();
  /** What Cloudflare last said about each of my tracks (for "Connection details"). */
  cloudflare = new Map<string, string>();
  /** Called when a track was published again under a new name: tell the others. */
  onTracksChanged: () => void = () => {};
  constructor(private api: MediaApi) {}

  /** Connect and publish mic + camera. */
  async start(config: RTCConfiguration, mic: MediaStreamTrack, camera: MediaStreamTrack, lowData: boolean) {
    this.lowData = lowData;
    this.pc = new RTCPeerConnection(config);
    const s = await this.api.post<{ session: string; ticket: string }>("session");
    this.session = s.session;
    this.ticket = s.ticket;
    // On a weak network the browser keeps sound going and lets video suffer first.
    this.tx.set("mic", this.pc.addTransceiver(mic, { direction: "sendonly", sendEncodings: [AUDIO_ENCODING] }));
    this.tx.set("camera", this.pc.addTransceiver(camera, { direction: "sendonly", sendEncodings: [videoEncoding(lowData)] }));
    this.names.set("mic", "mic");
    this.names.set("camera", "camera");
    await this.q.run(() => this.publish(["mic", "camera"]));
    // Others can only receive my tracks once this connection is up, so wait for it (max 15 s).
    await connectedOrTimeout(this.pc, 15_000);
  }

  /** The tracks to announce to the others. */
  tracks(): PublishedTrack[] {
    return [...this.names.entries()].map(([source, name]) => ({ name, kind: source === "mic" ? "audio" : "video" }));
  }

  private async publish(sources: Source[]) {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    const tracks = sources.map((s) => ({ mid: this.tx.get(s)!.mid!, trackName: this.names.get(s)! }));
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
    this.lowData = lowData;
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
    // When sharing stops, keep sending a black frame: Cloudflare removes a track after 30 s without data.
    if (existing) return existing.sender.replaceTrack(track ?? (this.screenIdle ??= blackVideoTrack()));
    if (!track) return;
    this.tx.set("screen", this.pc.addTransceiver(track, { direction: "sendonly", sendEncodings: [SCREEN_ENCODING] }));
    this.names.set("screen", "screen");
    await this.q.run(() => this.publish(["screen"]));
  }

  get hasScreenTrack() {
    return this.tx.has("screen");
  }

  /**
   * Publish a track again under a new name. Used when Cloudflare lost it (e.g. a phone stopped
   * the camera while the browser was in the background for more than 30 s).
   */
  republish(source: Source) {
    const now = Date.now();
    if (now - (this.lastRepublish.get(source) ?? 0) < 20_000) return Promise.resolve(false);
    this.lastRepublish.set(source, now);
    return this.q.run(async () => {
      const old = this.tx.get(source);
      if (!old || this.pc.connectionState === "closed") return false;
      const track = old.sender.track;
      const oldMid = old.mid;
      await old.sender.replaceTrack(null);
      old.stop();
      if (oldMid) {
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        const res = await this.api
          .post("close", { session: this.session, ticket: this.ticket, mids: [oldMid], offer: this.pc.localDescription!.toJSON() })
          .catch(() => null);
        if (res?.sessionDescription?.type === "answer") await this.pc.setRemoteDescription(res.sessionDescription);
      }
      const replacement = track ?? (source === "mic" ? silentAudioTrack() : blackVideoTrack());
      const sendEncodings = source === "camera" ? [videoEncoding(this.lowData)] : source === "screen" ? [SCREEN_ENCODING] : [AUDIO_ENCODING];
      this.tx.set(source, this.pc.addTransceiver(replacement, { direction: "sendonly", sendEncodings }));
      this.names.set(source, `${source}.${++this.version}`);
      await this.publish([source]);
      this.onTracksChanged();
      return true;
    });
  }

  /**
   * Asks Cloudflare which of my tracks it has. A track missing twice in a row (≈20 s) is
   * published again. Call every ~10 s.
   */
  async checkHealth() {
    if (!this.session || this.pc.connectionState !== "connected") return;
    let state: { tracks?: Array<{ trackName?: string; location?: string; status?: string }> };
    try {
      state = await this.api.post("state", { session: this.session, ticket: this.ticket });
    } catch {
      return;
    }
    const list = Array.isArray(state.tracks) ? state.tracks : null;
    this.cloudflare.clear();
    for (const t of list ?? []) if (t.trackName) this.cloudflare.set(t.trackName, t.status ?? "listed");
    // Only act when Cloudflare clearly lists my tracks (so an unexpected answer never triggers this).
    if (!list || !list.some((t) => [...this.names.values()].includes(t.trackName ?? ""))) return;
    for (const [source, name] of this.names) {
      const found = list.some((t) => t.trackName === name);
      const n = found ? 0 : (this.misses.get(source) ?? 0) + 1;
      this.misses.set(source, n);
      if (n >= 2) {
        this.misses.set(source, 0);
        void this.republish(source).catch(() => undefined);
      }
    }
  }

  /** Sending details for "Connection details". */
  async info(): Promise<SendInfo[]> {
    const out: SendInfo[] = [];
    for (const [source, t] of this.tx) {
      const name = this.names.get(source) ?? source;
      const stats = await t.sender.getStats().catch(() => null);
      let bytes = 0, frames: number | null = null, size: string | null = null, codec: string | null = null;
      stats?.forEach((r) => {
        if (r.type === "outbound-rtp") {
          bytes += r.bytesSent ?? 0;
          if (typeof r.framesEncoded === "number") frames = r.framesEncoded;
          if (r.frameWidth) size = `${r.frameWidth}×${r.frameHeight}`;
          if (r.codecId) codec = (stats.get(r.codecId) as { mimeType?: string } | undefined)?.mimeType ?? null;
        }
      });
      out.push({ source, name, cloudflare: this.cloudflare.get(name) ?? "?", bytes, frames, size, codec });
    }
    return out;
  }

  close() {
    this.pc?.close();
    this.screenIdle?.stop();
  }
}

const SCREEN_ENCODING: RTCRtpEncodingParameters = { maxBitrate: 1_200_000, maxFramerate: 15, priority: "low" } as RTCRtpEncodingParameters;
const AUDIO_ENCODING = { priority: "high", networkPriority: "high" } as RTCRtpEncodingParameters;

/** Resolves when the connection is up, or after the timeout (later retries cover slow networks). */
function connectedOrTimeout(pc: RTCPeerConnection, ms: number) {
  return new Promise<void>((resolve) => {
    const done = () => {
      if (pc.connectionState === "connected" || pc.connectionState === "failed" || pc.connectionState === "closed") finish();
    };
    const finish = () => {
      clearTimeout(t);
      pc.removeEventListener("connectionstatechange", done);
      resolve();
    };
    const t = setTimeout(finish, ms);
    pc.addEventListener("connectionstatechange", done);
    done();
  });
}

function videoEncoding(lowData: boolean): RTCRtpEncodingParameters {
  const base = lowData ? { maxBitrate: 150_000, scaleResolutionDownBy: 2, maxFramerate: 15 } : { maxBitrate: 600_000, maxFramerate: 24 };
  return { ...base, priority: "low", networkPriority: "low" } as RTCRtpEncodingParameters;
}

export class Subscriber {
  pc!: RTCPeerConnection;
  session = "";
  private ticket = "";
  private config: RTCConfiguration = {};
  private q = new Queue();
  private byMid = new Map<string, RemoteRef>();
  private pulled = new Map<string, string>(); // key -> mid
  private failures = 0;
  lastError: string | null = null;
  /** Why a track isn't being received yet (for "Connection details"). */
  problems = new Map<string, string>();
  onTrack: (ref: RemoteRef, track: MediaStreamTrack) => void = () => {};
  onRemoved: (ref: RemoteRef) => void = () => {};
  /** Called after the receiving connection was rebuilt: everything must be received again. */
  onReset: () => void = () => {};
  /** Connection state changes of the current receiving connection. */
  onState: (state: RTCPeerConnectionState) => void = () => {};
  constructor(private api: MediaApi) {}

  static key(r: { sessionId: string; trackName: string }) {
    return `${r.sessionId}/${r.trackName}`;
  }

  async start(config: RTCConfiguration) {
    this.config = config;
    this.newConnection();
  }

  private newConnection() {
    this.pc?.close();
    this.pc = new RTCPeerConnection(this.config);
    const pc = this.pc;
    pc.ontrack = (e) => {
      const ref = e.transceiver.mid ? this.byMid.get(e.transceiver.mid) : undefined;
      if (ref) this.onTrack(ref, e.track);
    };
    pc.addEventListener("connectionstatechange", () => pc === this.pc && this.onState(pc.connectionState));
    this.session = "";
    this.ticket = "";
    this.byMid.clear();
    this.pulled.clear();
  }

  /**
   * Cloudflare drops a session whose connection doesn't come up within ~30 s, so the receiving
   * session is created only when there is something to receive (and again after a failure).
   */
  private async ensureSession() {
    if (this.session) return;
    const s = await this.api.post<{ session: string; ticket: string }>("session");
    this.session = s.session;
    this.ticket = s.ticket;
  }

  /** Rebuild the receiving side from scratch (new connection + session). */
  private reset() {
    const had = [...this.byMid.values()];
    this.newConnection();
    for (const ref of had) this.onRemoved(ref);
    this.onReset();
  }

  /** Rebuild only the receiving side (my sending is untouched, so nobody else notices). */
  rebuild() {
    return this.q.run(async () => this.reset());
  }

  has(r: { sessionId: string; trackName: string }) {
    return this.pulled.has(Subscriber.key(r));
  }

  /**
   * Receive these tracks (skips ones already received). Returns the ones that aren't available
   * yet (e.g. the person is still connecting), so the caller can try again shortly.
   */
  pull(refs: RemoteRef[]): Promise<RemoteRef[]> {
    return this.q.run(async () => {
      const todo = refs.filter((r) => !this.pulled.has(Subscriber.key(r)));
      if (!todo.length) return [];
      let res: Reply;
      try {
        await this.ensureSession();
        res = await this.api.post("pull", {
          session: this.session,
          ticket: this.ticket,
          remotes: todo.map((r) => ({ sessionId: r.sessionId, trackName: r.trackName })),
        });
      } catch (e) {
        // The session may have expired or broken: after two failures in a row, start a fresh one.
        this.lastError = e instanceof Error ? e.message : String(e);
        for (const r of todo) this.problems.set(Subscriber.key(r), this.lastError);
        if (++this.failures >= 2) {
          this.failures = 0;
          this.reset();
        }
        throw e;
      }
      this.failures = 0;
      this.lastError = null;
      const ok: RemoteRef[] = [];
      for (const t of res.tracks ?? []) {
        const k = `${t.sessionId}/${t.trackName}`;
        if (t.errorCode || !t.mid) {
          this.problems.set(k, [t.errorCode, (t as { errorDescription?: string }).errorDescription].filter(Boolean).join(": ") || "not available yet");
          continue;
        }
        this.problems.delete(k);
        const ref = todo.find((r) => r.sessionId === t.sessionId && r.trackName === t.trackName);
        if (!ref) continue;
        this.byMid.set(t.mid, ref);
        this.pulled.set(Subscriber.key(ref), t.mid);
        ok.push(ref);
      }
      if (res.sessionDescription?.type === "offer") {
        try {
          await this.pc.setRemoteDescription(res.sessionDescription);
          const answer = await this.pc.createAnswer();
          await this.pc.setLocalDescription(answer);
          await this.api.post("renegotiate", { session: this.session, ticket: this.ticket, answer: this.pc.localDescription!.toJSON() });
        } catch (e) {
          for (const r of ok) this.pulled.delete(Subscriber.key(r));
          throw e;
        }
      }
      return todo.filter((r) => !ok.includes(r));
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
      // Nothing left to receive: a fresh, empty connection is simpler than renegotiating to zero.
      if (!this.pc.getTransceivers().some((t) => t.direction !== "stopped")) {
        void this.api.post("close", { session: this.session, ticket: this.ticket, mids }).catch(() => undefined);
        this.reset();
        return;
      }
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      const res = await this.api.post("close", { session: this.session, ticket: this.ticket, mids, offer: this.pc.localDescription!.toJSON() });
      if (res.sessionDescription?.type === "answer") await this.pc.setRemoteDescription(res.sessionDescription);
    });
  }

  /** Receiving details for one track (for "Connection details"). */
  async info(track: MediaStreamTrack) {
    const r = this.pc.getReceivers().find((x) => x.track === track);
    const stats = await r?.getStats().catch(() => null);
    let bytes = 0, frames: number | null = null, size: string | null = null, codec: string | null = null;
    stats?.forEach((s) => {
      if (s.type === "inbound-rtp") {
        bytes += s.bytesReceived ?? 0;
        if (typeof s.framesDecoded === "number") frames = s.framesDecoded;
        if (s.frameWidth) size = `${s.frameWidth}×${s.frameHeight}`;
        if (s.codecId) codec = (stats.get(s.codecId) as { mimeType?: string } | undefined)?.mimeType ?? null;
      }
    });
    return { bytes, frames, size, codec, live: track.readyState === "live", muted: track.muted };
  }

  close() {
    this.pc?.close();
  }
}

/** Starts both connections. */
/** A fresh sending connection (when only my sending side broke). */
export async function connectPublisher(roomId: string, mic: MediaStreamTrack, camera: MediaStreamTrack, lowData: boolean) {
  const api = new MediaApi(roomId);
  const pub = new Publisher(api);
  await pub.start(await iceConfig(api), mic, camera, lowData);
  return pub;
}

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
