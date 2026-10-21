/**
 * Records a meeting on this device: draws everyone's video (or the shared screen) onto one canvas,
 * mixes everyone's sound, and saves 5-second pieces as it goes (recordings-store). Nothing is
 * uploaded. Uses only what this device already receives, so it adds no data use.
 */
import { deleteRecording, saveChunk, saveMeta, type SavedRecording } from "./recordings-store";
import { workerTicker } from "./ticker";

export type RecordTile = { id: string; name: string; colour: string; initials: string; video: MediaStreamTrack | null; speaking: boolean; muted: boolean };
export type RecordInputs = { tiles: RecordTile[]; screen: { name: string; track: MediaStreamTrack } | null; audio: MediaStreamTrack[] };

const W = 1280;
const H = 720;
const FPS = 15;

function pickMime(audioOnly: boolean) {
  if (typeof MediaRecorder === "undefined") return null;
  const list = audioOnly
    ? ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/mp4;codecs=mp4a.40.2"]
    : ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm", "video/mp4;codecs=avc1,mp4a.40.2", "video/mp4"];
  return list.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

/** Can this browser record at all? */
export function canRecord() {
  return typeof window !== "undefined" && !!pickMime(false) && typeof HTMLCanvasElement.prototype.captureStream === "function" && typeof AudioContext !== "undefined";
}

export class MeetRecorder {
  readonly id = crypto.randomUUID();
  readonly startedAt = Date.now();
  readonly audioOnly: boolean;
  private meta: SavedRecording;
  private rec: MediaRecorder | null = null;
  private ctx: AudioContext | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private sources = new Map<string, MediaStreamAudioSourceNode>();
  private videos = new Map<string, HTMLVideoElement>();
  private canvas: HTMLCanvasElement | null = null;
  private g: CanvasRenderingContext2D | null = null;
  private canvasTrack: CanvasCaptureMediaStreamTrack | null = null;
  private stopTicker: (() => void) | null = null;
  private seq = 0;
  private bytes = 0;
  private saving: Promise<unknown> = Promise.resolve();
  private finished: Promise<SavedRecording> | null = null;
  /** True when pieces had to be kept in memory (device full or private mode). */
  inMemory = false;

  constructor(private opts: { code: string; title: string; audioOnly: boolean; inputs: () => RecordInputs }) {
    this.audioOnly = opts.audioOnly;
    this.meta = {
      id: this.id, code: opts.code, title: opts.title, mime: "", audioOnly: opts.audioOnly,
      startedAt: this.startedAt, lastAt: this.startedAt, durationMs: 0, bytes: 0, done: false, downloadedAt: null,
    };
    // Made right away inside the click: Safari only lets sound start from a tap or click.
    try {
      this.ctx = new AudioContext();
      void this.ctx.resume().catch(() => undefined);
    } catch {
      this.ctx = null;
    }
  }

  get recording() {
    return this.rec?.state === "recording";
  }

  /** Call from a click (browsers only start sound mixing after one). */
  async start() {
    const mime = pickMime(this.audioOnly);
    if (!mime) throw new Error("This browser can't record. Try Chrome, Edge or Firefox.");
    // Older Safari: no rounded rectangles on canvas, so draw square ones.
    const proto = CanvasRenderingContext2D.prototype as CanvasRenderingContext2D & { roundRect?: unknown };
    if (!proto.roundRect) {
      proto.roundRect = function (this: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
        this.rect(x, y, w, h);
      } as CanvasRenderingContext2D["roundRect"];
    }
    if (!this.ctx) throw new Error("This browser can't record sound.");
    await this.ctx.resume().catch(() => undefined);
    this.dest = this.ctx.createMediaStreamDestination();
    // A silent source keeps the sound track running when nobody talks or everyone is muted.
    const hush = this.ctx.createConstantSource();
    const zero = this.ctx.createGain();
    zero.gain.value = 0;
    hush.connect(zero).connect(this.dest);
    hush.start();

    const tracks: MediaStreamTrack[] = [...this.dest.stream.getAudioTracks()];
    if (!this.audioOnly) {
      this.canvas = document.createElement("canvas");
      this.canvas.width = W;
      this.canvas.height = H;
      this.g = this.canvas.getContext("2d");
      const stream = this.canvas.captureStream(0);
      this.canvasTrack = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
      tracks.unshift(this.canvasTrack);
    }
    this.sync();
    this.draw();

    this.rec = new MediaRecorder(new MediaStream(tracks), {
      mimeType: mime,
      audioBitsPerSecond: this.audioOnly ? 48_000 : 64_000,
      ...(this.audioOnly ? {} : { videoBitsPerSecond: 850_000 }),
    });
    this.meta.mime = this.rec.mimeType || mime;
    await saveMeta(this.meta);
    this.rec.ondataavailable = (e) => {
      if (!e.data?.size) return;
      const seq = this.seq++;
      this.bytes += e.data.size;
      const now = Date.now();
      this.saving = this.saving.then(async () => {
        const onDevice = await saveChunk(this.id, seq, e.data);
        if (!onDevice) this.inMemory = true;
        this.meta = { ...this.meta, lastAt: now, durationMs: now - this.startedAt, bytes: this.bytes };
        await saveMeta(this.meta);
      });
    };
    this.rec.start(5000);
    this.stopTicker = workerTicker(1000 / FPS, () => {
      this.sync();
      this.draw();
    });
  }

  /** Stop and keep the file on this device. Safe to call more than once. */
  stop(): Promise<SavedRecording> {
    if (this.finished) return this.finished;
    this.finished = new Promise<SavedRecording>((resolve) => {
      const done = async () => {
        this.stopTicker?.();
        if (!this.rec) {
          // Never started (cancelled, or no room on the device): nothing to keep.
          this.cleanup();
          resolve(this.meta);
          return;
        }
        await this.saving;
        if (!this.bytes) {
          await deleteRecording(this.id);
          this.cleanup();
          resolve(this.meta);
          return;
        }
        const now = Date.now();
        this.meta = { ...this.meta, done: true, lastAt: now, durationMs: now - this.startedAt, bytes: this.bytes };
        await saveMeta(this.meta);
        this.cleanup();
        resolve(this.meta);
      };
      if (this.rec && this.rec.state !== "inactive") {
        this.rec.addEventListener("stop", () => void done(), { once: true });
        try {
          this.rec.stop();
        } catch {
          void done();
        }
      } else void done();
    });
    return this.finished;
  }

  /** Last few seconds to disk now (when the page is closing). */
  flush() {
    try {
      if (this.rec?.state === "recording") this.rec.requestData();
    } catch {
      // ignore
    }
  }

  private cleanup() {
    for (const s of this.sources.values()) s.disconnect();
    this.sources.clear();
    for (const v of this.videos.values()) {
      v.pause();
      v.srcObject = null;
    }
    this.videos.clear();
    this.canvasTrack?.stop();
    void this.ctx?.close().catch(() => undefined);
  }

  /** Follow people joining, leaving and switching devices: sound sources and video players. */
  private sync() {
    const input = this.opts.inputs();
    if (this.ctx && this.dest) {
      const want = new Map(input.audio.filter((t) => t.readyState === "live").map((t) => [t.id, t]));
      for (const [id, node] of this.sources) if (!want.has(id)) (node.disconnect(), this.sources.delete(id));
      for (const [id, t] of want) {
        if (this.sources.has(id)) continue;
        try {
          const node = this.ctx.createMediaStreamSource(new MediaStream([t]));
          node.connect(this.dest);
          this.sources.set(id, node);
        } catch {
          // a track that ended in between
        }
      }
    }
    if (this.audioOnly) return;
    const live = [...input.tiles.map((t) => t.video), input.screen?.track].filter((t): t is MediaStreamTrack => !!t && t.readyState === "live");
    const ids = new Set(live.map((t) => t.id));
    for (const [id, v] of this.videos) if (!ids.has(id)) (v.srcObject = null, this.videos.delete(id));
    for (const t of live) {
      if (this.videos.has(t.id)) continue;
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.srcObject = new MediaStream([t]);
      void v.play().catch(() => undefined);
      this.videos.set(t.id, v);
    }
  }

  private frame(track: MediaStreamTrack | null | undefined) {
    const v = track ? this.videos.get(track.id) : undefined;
    return v && v.readyState >= 2 && v.videoWidth ? v : null;
  }

  /** Draw a video into a box: "cover" fills it, "contain" shows all of it. */
  private video(v: HTMLVideoElement, x: number, y: number, w: number, h: number, fit: "cover" | "contain") {
    const g = this.g!;
    const r = v.videoWidth / v.videoHeight;
    let dw = w;
    let dh = w / r;
    if ((fit === "cover" && dh < h) || (fit === "contain" && dh > h)) {
      dh = h;
      dw = h * r;
    }
    g.save();
    g.beginPath();
    g.roundRect(x, y, w, h, 12);
    g.clip();
    g.drawImage(v, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    g.restore();
  }

  private tile(t: RecordTile, x: number, y: number, w: number, h: number) {
    const g = this.g!;
    g.fillStyle = "#1c1945";
    g.beginPath();
    g.roundRect(x, y, w, h, 12);
    g.fill();
    const v = this.frame(t.video);
    if (v) this.video(v, x, y, w, h, "cover");
    else {
      const r = Math.min(w, h) * 0.18;
      g.fillStyle = t.colour;
      g.beginPath();
      g.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#fff";
      g.font = `600 ${Math.round(r * 0.8)}px Inter, system-ui, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(t.initials, x + w / 2, y + h / 2 + 1);
    }
    if (t.speaking) {
      g.strokeStyle = "#8f7bff";
      g.lineWidth = 4;
      g.beginPath();
      g.roundRect(x + 2, y + 2, w - 4, h - 4, 11);
      g.stroke();
    }
    // Name label
    const size = Math.max(12, Math.min(18, Math.round(h / 14)));
    g.font = `500 ${size}px Inter, system-ui, sans-serif`;
    const label = (t.muted ? "🔇 " : "") + t.name;
    const tw = Math.min(g.measureText(label).width, w - 24);
    g.fillStyle = "rgba(0,0,0,.55)";
    g.beginPath();
    g.roundRect(x + 8, y + h - size - 18, tw + 16, size + 10, 8);
    g.fill();
    g.fillStyle = "#fff";
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillText(label, x + 16, y + h - size / 2 - 13, w - 32);
  }

  private draw() {
    const g = this.g;
    if (!g) return;
    const { tiles, screen } = this.opts.inputs();
    g.fillStyle = "#0f0d26";
    g.fillRect(0, 0, W, H);
    const pad = 12;
    const s = this.frame(screen?.track);
    if (screen && s) {
      // Shared screen big, up to 4 people down the side.
      const side = 232;
      this.video(s, pad, pad, W - side - pad * 3, H - pad * 2, "contain");
      g.fillStyle = "rgba(0,0,0,.55)";
      g.font = "500 15px Inter, system-ui, sans-serif";
      const text = `${screen.name} is sharing`;
      g.beginPath();
      g.roundRect(pad + 10, pad + 10, g.measureText(text).width + 20, 28, 8);
      g.fill();
      g.fillStyle = "#fff";
      g.textAlign = "left";
      g.textBaseline = "middle";
      g.fillText(text, pad + 20, pad + 24);
      const th = Math.round((side * 9) / 16);
      const shown = [...tiles].sort((a, b) => Number(b.speaking) - Number(a.speaking)).slice(0, 4);
      shown.forEach((t, i) => this.tile(t, W - side - pad, pad + i * (th + pad), side, th));
      if (tiles.length > 4) {
        g.fillStyle = "rgba(255,255,255,.7)";
        g.font = "500 15px Inter, system-ui, sans-serif";
        g.textAlign = "center";
        g.fillText(`+${tiles.length - 4} more`, W - side / 2 - pad, pad + 4 * (th + pad) + 14);
      }
    } else {
      // Everyone in a grid (speakers first when there are more than 16).
      const list = tiles.length > 16 ? [...tiles].sort((a, b) => Number(b.speaking) - Number(a.speaking)).slice(0, 16) : tiles;
      const n = Math.max(1, list.length);
      const cols = n === 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4;
      const rows = Math.ceil(n / cols);
      let w = (W - pad * (cols + 1)) / cols;
      let h = (w * 9) / 16;
      if (h * rows + pad * (rows + 1) > H - 28) {
        h = (H - 28 - pad * (rows + 1)) / rows;
        w = (h * 16) / 9;
      }
      const top = (H - 28 - (h * rows + pad * (rows - 1))) / 2;
      list.forEach((t, i) => {
        const r = Math.floor(i / cols);
        const inRow = r === rows - 1 ? n - r * cols : cols;
        const left = (W - (w * inRow + pad * (inRow - 1))) / 2;
        this.tile(t, left + (i % cols) * (w + pad), top + r * (h + pad), w, h);
      });
    }
    // Small brand mark, bottom right.
    g.font = "600 13px Inter, system-ui, sans-serif";
    g.fillStyle = "rgba(255,255,255,.45)";
    g.textAlign = "right";
    g.textBaseline = "alphabetic";
    g.fillText("Workbase Meet", W - pad - 2, H - 8);
    this.canvasTrack?.requestFrame?.();
  }
}
