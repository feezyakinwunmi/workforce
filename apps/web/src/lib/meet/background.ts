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
    return vision.ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL, delegate: "GPU" },
      runningMode: "VIDEO",
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    });
  })();
  try {
    return await segmenterPromise;
  } catch (e) {
    segmenterPromise = null;
    throw e;
  }
}

/** Wraps a camera track; `track` is what gets published. */
export class BackgroundProcessor {
  readonly track: MediaStreamTrack;
  private video = document.createElement("video");
  private out = document.createElement("canvas");
  private person = document.createElement("canvas");
  private maskCanvas = document.createElement("canvas");
  private bg = document.createElement("canvas");
  private mode: BackgroundMode = { kind: "none" };
  private seg: Segmenter | null = null;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  onError: (message: string) => void = () => {};

  constructor(private source: MediaStreamTrack) {
    const s = source.getSettings();
    const w = Math.min(s.width ?? 640, 960);
    const h = Math.round(w * ((s.height ?? 360) / (s.width ?? 640)));
    for (const c of [this.out, this.person, this.maskCanvas, this.bg]) {
      c.width = w;
      c.height = h;
    }
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.srcObject = new MediaStream([source]);
    void this.video.play();
    this.track = this.out.captureStream(24).getVideoTracks()[0];
    this.loop();
  }

  async setMode(mode: BackgroundMode) {
    this.mode = mode;
    if (mode.kind === "image") {
      const img = BACKGROUND_IMAGES.find((b) => b.id === mode.id) ?? BACKGROUND_IMAGES[0];
      img.paint(this.bg.getContext("2d")!, this.bg.width, this.bg.height);
    }
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
    const { width: w, height: h } = this.out;
    if (this.video.readyState >= 2) {
      if (this.mode.kind === "none" || !this.seg) {
        ctx.filter = "none";
        ctx.drawImage(this.video, 0, 0, w, h);
      } else {
        this.composite(ctx, w, h);
      }
    }
    this.timer = setTimeout(this.loop, 1000 / 24);
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
    pctx.filter = "blur(2px)";
    pctx.drawImage(this.maskCanvas, 0, 0, w, h);
    pctx.filter = "none";
    pctx.globalCompositeOperation = "source-in";
    pctx.drawImage(this.video, 0, 0, w, h);

    ctx.globalCompositeOperation = "copy";
    if (this.mode.kind === "blur") {
      ctx.filter = `blur(${this.mode.strength === "strong" ? 16 : 7}px)`;
      ctx.drawImage(this.video, 0, 0, w, h);
      ctx.filter = "none";
    } else {
      ctx.drawImage(this.bg, 0, 0, w, h);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(this.person, 0, 0, w, h);
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.track.stop();
    this.video.srcObject = null;
  }
}
