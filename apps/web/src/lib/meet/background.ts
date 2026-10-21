"use client";

/**
 * Background blur / picture backgrounds, done on the person's own device (nothing is uploaded).
 * Uses Google's MediaPipe selfie segmenter, loaded from a CDN only when someone picks a
 * background. If it can't load (old phone, blocked CDN), the camera simply stays as it is.
 */
export type BackgroundMode = { kind: "none" } | { kind: "blur"; strength: "light" | "strong" } | { kind: "image"; id: string };

export const BACKGROUND_IMAGES: Array<{ id: string; label: string; paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void }> = [
  {
    id: "office",
    label: "Office",
    paint: (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#e9e4dc");
      g.addColorStop(0.62, "#d8cfc2");
      g.addColorStop(0.62, "#8b6f55");
      g.addColorStop(1, "#6f5641");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#f6f3ee";
      ctx.fillRect(w * 0.08, h * 0.12, w * 0.34, h * 0.36); // window
      ctx.fillStyle = "#cfe3f2";
      ctx.fillRect(w * 0.1, h * 0.14, w * 0.3, h * 0.32);
      ctx.fillStyle = "#3f6b3a";
      ctx.beginPath();
      ctx.ellipse(w * 0.84, h * 0.48, w * 0.06, h * 0.16, 0, 0, Math.PI * 2); // plant
      ctx.fill();
    },
  },
  {
    id: "violet",
    label: "Workbase",
    paint: (ctx, w, h) => {
      const g = ctx.createRadialGradient(w * 0.3, h * 0.2, 10, w * 0.5, h * 0.5, w * 0.8);
      g.addColorStop(0, "#8f7bff");
      g.addColorStop(0.55, "#4b2fd6");
      g.addColorStop(1, "#15123a");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(242,169,59,0.85)";
      ctx.beginPath();
      ctx.arc(w * 0.85, h * 0.82, h * 0.22, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  {
    id: "lagos",
    label: "Sunset",
    paint: (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#ff9a62");
      g.addColorStop(0.55, "#f2a93b");
      g.addColorStop(0.56, "#1d3557");
      g.addColorStop(1, "#0b1a33");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#0b1a33";
      for (let i = 0; i < 9; i++) {
        const bw = w * (0.05 + ((i * 37) % 7) / 100);
        const bh = h * (0.12 + ((i * 53) % 25) / 100);
        ctx.fillRect(w * (i / 9), h * 0.56 - bh, bw, bh); // skyline
      }
    },
  },
  {
    id: "plain",
    label: "Plain",
    paint: (ctx, w, h) => {
      ctx.fillStyle = "#e7e5ef";
      ctx.fillRect(0, 0, w, h);
    },
  },
];

const VISION = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const MODEL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

type Segmenter = {
  segmentForVideo: (v: HTMLVideoElement, ts: number) => { confidenceMasks?: Array<{ getAsFloat32Array: () => Float32Array; width: number; height: number }>; close: () => void };
  close: () => void;
};
let segmenterPromise: Promise<Segmenter> | null = null;

async function loadSegmenter(): Promise<Segmenter> {
  segmenterPromise ??= (async () => {
    // Loaded at run time from the CDN, not bundled (keeps the app small for everyone else).
    const vision = await (new Function("u", "return import(u)") as (u: string) => Promise<any>)(`${VISION}/vision_bundle.mjs`);
    const fileset = await vision.FilesetResolver.forVisionTasks(`${VISION}/wasm`);
    const make = (delegate: "GPU" | "CPU") =>
      vision.ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL, delegate },
        runningMode: "VIDEO",
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      });
    // The graphics chip is fastest, but many phones (and iPhones) can't use it from a web page:
    // fall back to the processor instead of giving up.
    try {
      return await make("GPU");
    } catch {
      return await make("CPU");
    }
  })();
  try {
    return await segmenterPromise;
  } catch (e) {
    segmenterPromise = null;
    throw e;
  }
}

const isPhone = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

/** Safari (iPhone, iPad, Mac) has no canvas `filter`, so blur is done another way there. */
let filterOk: boolean | null = null;
function canvasFilterWorks() {
  if (filterOk === null) {
    try {
      const c = document.createElement("canvas").getContext("2d")!;
      c.filter = "blur(2px)";
      filterOk = c.filter === "blur(2px)";
    } catch {
      filterOk = false;
    }
  }
  return filterOk;
}

/** Wraps a camera track; `track` is what gets published. */
export class BackgroundProcessor {
  readonly track: MediaStreamTrack;
  private video = document.createElement("video");
  private out = document.createElement("canvas");
  private person = document.createElement("canvas");
  private maskCanvas = document.createElement("canvas");
  private bg = document.createElement("canvas");
  private small = document.createElement("canvas"); // for blur without canvas filters
  private mode: BackgroundMode = { kind: "none" };
  private seg: Segmenter | null = null;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  onError: (message: string) => void = () => {};

  constructor(private source: MediaStreamTrack) {
    const s = source.getSettings();
    this.resize(s.width ?? 640, s.height ?? 360);
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.setAttribute("playsinline", "");
    this.video.autoplay = true;
    // iPhones only update a video that is on the page: keep it there, invisible.
    this.video.style.cssText = "position:fixed;top:0;left:0;width:2px;height:2px;opacity:0;pointer-events:none;z-index:-1";
    document.body.appendChild(this.video);
    this.video.srcObject = new MediaStream([source]);
    void this.video.play().catch(() => undefined);
    document.addEventListener("visibilitychange", this.resume);
    this.track = this.out.captureStream(isPhone() ? 15 : 24).getVideoTracks()[0];
    this.loop();
  }

  /** Canvas size follows the real picture (phones turn it on its side in portrait). */
  private resize(vw: number, vh: number) {
    const max = isPhone() ? 640 : 960;
    const scale = Math.min(1, max / Math.max(vw, vh));
    const w = Math.max(2, Math.round(vw * scale));
    const h = Math.max(2, Math.round(vh * scale));
    for (const c of [this.out, this.person, this.maskCanvas, this.bg]) {
      c.width = w;
      c.height = h;
    }
    if (this.mode.kind === "image") this.paintImage();
  }

  private paintImage() {
    if (this.mode.kind !== "image") return;
    const id = this.mode.id;
    const img = BACKGROUND_IMAGES.find((b) => b.id === id) ?? BACKGROUND_IMAGES[0];
    img.paint(this.bg.getContext("2d")!, this.bg.width, this.bg.height);
  }

  // Back from the background (phones pause the camera video): play again.
  private resume = () => {
    if (!this.stopped && document.visibilityState === "visible" && this.video.paused) void this.video.play().catch(() => undefined);
  };

  async setMode(mode: BackgroundMode) {
    this.mode = mode;
    this.paintImage();
    if (mode.kind !== "none" && !this.seg) {
      try {
        this.seg = await loadSegmenter();
      } catch {
        this.mode = { kind: "none" };
        this.onError("Backgrounds couldn't load on this device or network.");
      }
    }
  }

  private loop = () => {
    if (this.stopped) return;
    const ctx = this.out.getContext("2d")!;
    const vw = this.video.videoWidth, vh = this.video.videoHeight;
    if (vw && vh && Math.abs(vw / vh - this.out.width / this.out.height) > 0.02) this.resize(vw, vh);
    const { width: w, height: h } = this.out;
    if (this.video.paused && this.video.readyState >= 1) void this.video.play().catch(() => undefined);
    if (this.video.readyState >= 2) {
      if (this.mode.kind === "none" || !this.seg) {
        if (canvasFilterWorks()) ctx.filter = "none";
        ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(this.video, 0, 0, w, h);
      } else {
        this.composite(ctx, w, h);
      }
    }
    this.timer = setTimeout(this.loop, 1000 / (isPhone() ? 15 : 24));
  };

  private composite(ctx: CanvasRenderingContext2D, w: number, h: number) {
    let result;
    try {
      result = this.seg!.segmentForVideo(this.video, performance.now());
    } catch {
      ctx.drawImage(this.video, 0, 0, w, h);
      return;
    }
    const mask = result.confidenceMasks?.[0];
    if (!mask) {
      result.close();
      return;
    }
    // Person = camera frame where the mask is confident.
    const data = mask.getAsFloat32Array();
    const mctx = this.maskCanvas.getContext("2d")!;
    if (this.maskCanvas.width !== mask.width) {
      this.maskCanvas.width = mask.width;
      this.maskCanvas.height = mask.height;
    }
    const img = mctx.createImageData(mask.width, mask.height);
    for (let i = 0; i < data.length; i++) img.data[i * 4 + 3] = Math.min(255, Math.max(0, (data[i] - 0.25) * 2 * 255));
    mctx.putImageData(img, 0, 0);
    result.close();

    const pctx = this.person.getContext("2d")!;
    pctx.globalCompositeOperation = "copy";
    const filters = canvasFilterWorks();
    if (filters) pctx.filter = "blur(2px)";
    pctx.drawImage(this.maskCanvas, 0, 0, w, h); // scaled up smoothly: soft edges even without filters
    if (filters) pctx.filter = "none";
    pctx.globalCompositeOperation = "source-in";
    pctx.drawImage(this.video, 0, 0, w, h);

    ctx.globalCompositeOperation = "copy";
    if (this.mode.kind === "blur") {
      const strong = this.mode.strength === "strong";
      if (filters) {
        ctx.filter = `blur(${strong ? 16 : 7}px)`;
        ctx.drawImage(this.video, 0, 0, w, h);
        ctx.filter = "none";
      } else {
        // Safari: shrink the picture a lot and stretch it back with smoothing = a blur.
        const f = strong ? 24 : 10;
        this.small.width = Math.max(2, Math.round(w / f));
        this.small.height = Math.max(2, Math.round(h / f));
        const sctx = this.small.getContext("2d")!;
        sctx.imageSmoothingEnabled = true;
        sctx.drawImage(this.video, 0, 0, this.small.width, this.small.height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(this.small, 0, 0, w, h);
      }
    } else {
      ctx.drawImage(this.bg, 0, 0, w, h);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(this.person, 0, 0, w, h);
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    document.removeEventListener("visibilitychange", this.resume);
    this.track.stop();
    this.video.srcObject = null;
    this.video.remove();
  }
}
