"use client";

/**
 * Bizz Padi flyer designer (rebuilt 26 Nov 2026 after Femi: "the image is poor for a template,
 * let them import their own").
 *
 * Draws a 1080×1350 flyer (Instagram portrait) on a <canvas> in the browser, from the post's
 * flyer text, the brand's colours and, optionally, the person's own picture. Nothing runs on a
 * server and no AI image model is used, so it costs nothing and looks the same every time.
 *
 * Nine designs (FLYER_STYLES in lib/padi/types.ts):
 *   bold     brand colour, soft glowing shapes, dot pattern, huge headline with a highlight bar
 *   clean    off-white with a thin frame, headline in the brand colour, outlined button
 *   minimal  black and white, thin lines, light + heavy type mix
 *   promo    diagonal band, big centred headline, round "sticker" with the button text
 *   quote    pale tint, big quote mark, headline as a quote (tips, sayings)
 *   photo    the person's picture full-bleed with a dark fade and white text
 *   split    picture on top, brand-colour panel with the text below
 *   frame    picture in a tilted white frame on the brand colour, text underneath
 *   own      the person's own finished design, shown exactly as uploaded (no text added)
 *
 * Picture designs without a picture show a tidy "add your photo" placeholder.
 * Everything is drawn at full size; the <canvas> is scaled down on screen by CSS.
 */
import { useEffect, useRef, useState } from "react";
import type { Flyer } from "@/lib/padi/types";

const W = 1080;
const H = 1350;
const PAD = 88;

type BrandLook = { name: string; contact: string; primary: string; accent: string };
type Ctx = CanvasRenderingContext2D;

// ---------------------------------------------------------------------------
// Small drawing helpers
// ---------------------------------------------------------------------------

/** Inter at a weight and size (falls back to the system font until Inter has loaded). */
const font = (weight: number, size: number) => `${weight} ${size}px Inter, "Helvetica Neue", Arial, sans-serif`;

/** Tighter letters for big headlines (browsers without letterSpacing just ignore it). */
function tracking(ctx: Ctx, px: number) {
  (ctx as Ctx & { letterSpacing?: string }).letterSpacing = `${px}px`;
}

/** "#rrggbb" → [r, g, b] */
function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** Mix two colours; t = 0 → a, 1 → b. */
function mix(a: string, b: string, t: number) {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}
/** Dark or white text, whichever reads better on this colour. */
function inkOn(hex: string) {
  const [r, g, b] = rgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#111113" : "#ffffff";
}

/** Split text into lines that fit `max` pixels at the current font. */
function wrap(ctx: Ctx, text: string, max: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > max && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Find the biggest font size (from `start` down to `min`) at which `text` fits in `maxLines`
 * lines of `width`. Returns the size and the lines.
 */
function fit(ctx: Ctx, text: string, width: number, weight: number, start: number, min: number, maxLines: number) {
  let size = start;
  let lines: string[] = [];
  for (; size >= min; size -= 4) {
    ctx.font = font(weight, size);
    tracking(ctx, -size * 0.03);
    lines = wrap(ctx, text, width);
    if (lines.length <= maxLines) break;
  }
  return { size, lines: lines.slice(0, maxLines) };
}

/** Draw lines of text; returns the y below the last line. */
function lines(ctx: Ctx, rows: string[], x: number, y: number, lh: number) {
  rows.forEach((r, i) => ctx.fillText(r, x, y + i * lh));
  return y + rows.length * lh;
}

/** Draw an image to cover a box (like CSS object-fit: cover), clipped to rounded corners. */
function cover(ctx: Ctx, img: HTMLImageElement, x: number, y: number, w: number, h: number, r = 0) {
  const s = Math.max(w / img.width, h / img.height);
  const iw = img.width * s;
  const ih = img.height * s;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.clip();
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
  ctx.restore();
}

/** A soft glowing circle. */
function glow(ctx: Ctx, x: number, y: number, r: number, color: string, alpha: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  const [cr, cg, cb] = rgb(color);
  g.addColorStop(0, `rgba(${cr},${cg},${cb},${alpha})`);
  g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** A grid of small dots, for texture. */
function dots(ctx: Ctx, x: number, y: number, cols: number, rows: number, gap: number, color: string, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    ctx.beginPath();
    ctx.arc(x + i * gap, y + j * gap, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Brand mark: a rounded square with the first letter + the name, top left. */
function brandMark(ctx: Ctx, b: BrandLook, x: number, y: number, ink: string, tile: string) {
  ctx.fillStyle = tile;
  ctx.beginPath();
  ctx.roundRect(x, y, 64, 64, 18);
  ctx.fill();
  ctx.fillStyle = inkOn(tile);
  ctx.font = font(800, 34);
  tracking(ctx, 0);
  ctx.textAlign = "center";
  ctx.fillText(b.name.slice(0, 1).toUpperCase(), x + 32, y + 45);
  ctx.textAlign = "left";
  ctx.fillStyle = ink;
  ctx.font = font(700, 30);
  tracking(ctx, 1.5);
  ctx.fillText(b.name.toUpperCase().slice(0, 26), x + 84, y + 43);
  tracking(ctx, 0);
}

/** A pill button. `outline` = border only. Returns its width. */
function pill(ctx: Ctx, text: string, x: number, y: number, bg: string, fg: string, outline = false, center = false) {
  ctx.font = font(800, 40);
  tracking(ctx, 0.5);
  const tw = ctx.measureText(text).width;
  const w = tw + 104;
  const left = center ? x - w / 2 : x;
  ctx.beginPath();
  ctx.roundRect(left, y, w, 100, 50);
  if (outline) {
    ctx.lineWidth = 4;
    ctx.strokeStyle = bg;
    ctx.stroke();
    ctx.fillStyle = bg;
  } else {
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.fillStyle = fg;
  }
  ctx.fillText(text, left + 52, y + 64);
  tracking(ctx, 0);
  return w;
}

/** Bottom line: a thin rule and the contact. */
function footer(ctx: Ctx, b: BrandLook, color: string, center = false) {
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = color;
  ctx.fillRect(PAD, H - 150, W - PAD * 2, 2);
  ctx.restore();
  ctx.fillStyle = color;
  ctx.font = font(600, 32);
  tracking(ctx, 0.5);
  ctx.textAlign = center ? "center" : "left";
  ctx.fillText(b.contact || b.name, center ? W / 2 : PAD, H - 92);
  ctx.textAlign = "left";
  tracking(ctx, 0);
}

/** Placeholder for picture designs when no picture has been added yet. */
function photoPlaceholder(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, tint: string) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.clip();
  ctx.fillStyle = mix(tint, "#ffffff", 0.82);
  ctx.fillRect(x, y, w, h);
  dots(ctx, x + 40, y + 40, Math.floor(w / 46), Math.floor(h / 46), 46, tint, 0.18);
  ctx.fillStyle = tint;
  ctx.font = font(700, 40);
  ctx.textAlign = "center";
  ctx.fillText("Add your photo", x + w / 2, y + h / 2 + 14);
  ctx.textAlign = "left";
  ctx.restore();
}

// ---------------------------------------------------------------------------
// The designs
// ---------------------------------------------------------------------------
export function drawFlyer(canvas: HTMLCanvasElement, f: Flyer, b: BrandLook, img: HTMLImageElement | null) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = W;
  canvas.height = H;
  ctx.textBaseline = "alphabetic";
  const style = f.style ?? "bold";
  const headline = (f.headline || b.name).trim();
  const sub = (f.subline || "").trim();
  const cta = (f.cta || "").trim();
  const P = b.primary;
  const A = b.accent;

  // ---- My own design: shown as uploaded ---------------------------------
  if (style === "own") {
    ctx.fillStyle = "#111113";
    ctx.fillRect(0, 0, W, H);
    if (img) {
      const s = Math.min(W / img.width, H / img.height);
      ctx.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
    } else photoPlaceholder(ctx, 60, 60, W - 120, H - 120, 36, "#8c8c96");
    return;
  }

  // ---- Bold --------------------------------------------------------------
  if (style === "bold") {
    const ink = inkOn(P);
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, mix(P, "#000000", 0.05));
    g.addColorStop(1, mix(P, "#000000", 0.35));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    glow(ctx, W - 80, 160, 520, A, 0.55);
    glow(ctx, 80, H - 200, 420, mix(P, "#ffffff", 0.4), 0.35);
    dots(ctx, W - 380, 200, 6, 5, 52, ink, 0.18);
    brandMark(ctx, b, PAD, PAD, ink, A);

    const t = fit(ctx, headline, W - PAD * 2, 900, 150, 72, 4);
    const lh = t.size * 1.02;
    const top = H - 520 - (t.lines.length - 1) * lh * 0.55;
    // Highlight bar behind the first line
    ctx.font = font(900, t.size);
    tracking(ctx, -t.size * 0.03);
    const w0 = Math.min(ctx.measureText(t.lines[0]).width, W - PAD * 2);
    ctx.fillStyle = A;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(PAD - 10, top - t.size * 0.28, w0 + 20, t.size * 0.32);
    ctx.globalAlpha = 1;
    ctx.fillStyle = ink;
    let y = lines(ctx, t.lines, PAD, top, lh);
    tracking(ctx, 0);
    if (sub) {
      ctx.font = font(500, 42);
      ctx.globalAlpha = 0.85;
      y = lines(ctx, wrap(ctx, sub, W - PAD * 2 - 60).slice(0, 2), PAD, y + 26, 56);
      ctx.globalAlpha = 1;
    }
    if (cta) pill(ctx, cta, PAD, Math.min(y + 40, H - 290), A, inkOn(A));
    footer(ctx, b, ink);
    return;
  }

  // ---- Clean -------------------------------------------------------------
  if (style === "clean") {
    ctx.fillStyle = "#fbfbfa";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = mix(P, "#ffffff", 0.55);
    ctx.lineWidth = 3;
    ctx.strokeRect(44, 44, W - 88, H - 88);
    glow(ctx, W - 140, H - 260, 380, A, 0.22);
    brandMark(ctx, b, PAD, PAD + 10, "#111113", P);

    ctx.fillStyle = A;
    ctx.fillRect(PAD, 330, 110, 10);
    const t = fit(ctx, headline, W - PAD * 2, 800, 128, 64, 4);
    ctx.fillStyle = P;
    let y = lines(ctx, t.lines, PAD, 330 + 60 + t.size, t.size * 1.06);
    tracking(ctx, 0);
    if (sub) {
      ctx.fillStyle = "#52525b";
      ctx.font = font(400, 44);
      y = lines(ctx, wrap(ctx, sub, W - PAD * 2 - 80).slice(0, 3), PAD, y + 30, 60);
    }
    if (cta) pill(ctx, cta, PAD, Math.min(y + 50, H - 290), P, P, true);
    footer(ctx, b, "#111113");
    return;
  }

  // ---- Minimal (black and white) -----------------------------------------
  if (style === "minimal") {
    ctx.fillStyle = "#0c0c0e";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#ffffff";
    ctx.font = font(600, 28);
    tracking(ctx, 8);
    ctx.fillText(b.name.toUpperCase().slice(0, 24), PAD, PAD + 30);
    ctx.textAlign = "right";
    ctx.fillText(new Date().getFullYear().toString(), W - PAD, PAD + 30);
    ctx.textAlign = "left";
    ctx.fillRect(PAD, PAD + 64, W - PAD * 2, 2);

    const t = fit(ctx, headline, W - PAD * 2, 300, 150, 72, 4);
    ctx.fillStyle = "#ffffff";
    // First line light, the rest heavy, for contrast.
    const lh = t.size * 1.04;
    let y = 470;
    t.lines.forEach((l, i) => {
      ctx.font = font(i === 0 ? 300 : 800, t.size);
      tracking(ctx, -t.size * 0.03);
      ctx.fillText(l, PAD, y);
      y += lh;
    });
    tracking(ctx, 0);
    if (sub) {
      ctx.font = font(400, 40);
      ctx.fillStyle = "#a1a1aa";
      y = lines(ctx, wrap(ctx, sub, W - PAD * 2 - 120).slice(0, 3), PAD, y + 20, 56);
    }
    if (cta) {
      ctx.fillStyle = A;
      ctx.font = font(700, 40);
      ctx.fillText(`${cta}  →`, PAD, Math.min(y + 110, H - 230));
    }
    footer(ctx, b, "#ffffff");
    return;
  }

  // ---- Promo / sale --------------------------------------------------------
  if (style === "promo") {
    const ink = inkOn(P);
    ctx.fillStyle = P;
    ctx.fillRect(0, 0, W, H);
    glow(ctx, W / 2, H * 0.42, 620, mix(P, "#ffffff", 0.35), 0.4);
    // Diagonal band
    ctx.save();
    ctx.translate(W / 2, H * 0.44);
    ctx.rotate(-0.1);
    ctx.fillStyle = A;
    ctx.fillRect(-W, -150, W * 2, 300);
    ctx.fillStyle = mix(A, "#000000", 0.15);
    ctx.fillRect(-W, 150, W * 2, 14);
    ctx.restore();
    brandMark(ctx, b, PAD, PAD, ink, inkOn(P) === "#ffffff" ? "#ffffff" : "#111113");

    ctx.save();
    ctx.translate(W / 2, H * 0.44);
    ctx.rotate(-0.1);
    const t = fit(ctx, headline.toUpperCase(), W - 180, 900, 140, 64, 2);
    ctx.fillStyle = inkOn(A);
    ctx.textAlign = "center";
    const lh = t.size * 0.98;
    lines(ctx, t.lines, 0, -((t.lines.length - 1) * lh) / 2 + t.size * 0.35, lh);
    ctx.restore();
    tracking(ctx, 0);

    if (sub) {
      ctx.fillStyle = ink;
      ctx.font = font(500, 44);
      ctx.textAlign = "center";
      lines(ctx, wrap(ctx, sub, W - PAD * 2 - 80).slice(0, 2), W / 2, H * 0.68, 58);
      ctx.textAlign = "left";
    }
    if (cta) {
      // Round sticker, top right
      const cx = W - 210;
      const cy = 330;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(0.18);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      for (let i = 0; i < 28; i++) {
        const r = i % 2 ? 128 : 146;
        const a = (i / 28) * Math.PI * 2;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#111113";
      ctx.textAlign = "center";
      const st = fit(ctx, cta.toUpperCase(), 190, 900, 44, 22, 2);
      lines(ctx, st.lines, 0, -((st.lines.length - 1) * st.size) / 2 + st.size * 0.35, st.size * 1.05);
      ctx.restore();
      ctx.textAlign = "left";
      tracking(ctx, 0);
    }
    footer(ctx, b, ink, true);
    return;
  }

  // ---- Quote / tip -----------------------------------------------------------
  if (style === "quote") {
    const bg = mix(A, "#ffffff", 0.84);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    glow(ctx, 160, 220, 420, A, 0.35);
    brandMark(ctx, b, PAD, PAD, "#111113", P);
    ctx.fillStyle = P;
    ctx.font = font(900, 420);
    ctx.fillText("“", PAD - 20, 600);
    const t = fit(ctx, headline, W - PAD * 2, 700, 108, 56, 5);
    ctx.fillStyle = "#111113";
    let y = lines(ctx, t.lines, PAD, 560, t.size * 1.12);
    tracking(ctx, 0);
    if (sub) {
      ctx.fillStyle = P;
      ctx.fillRect(PAD, y + 28, 60, 6);
      ctx.fillStyle = "#3f3f46";
      ctx.font = font(500, 40);
      y = lines(ctx, wrap(ctx, sub, W - PAD * 2 - 80).slice(0, 2), PAD + 84, y + 44, 54);
    }
    if (cta) pill(ctx, cta, PAD, Math.min(y + 50, H - 290), P, inkOn(P));
    footer(ctx, b, "#111113");
    return;
  }

  // ---- Photo (full-bleed picture) ----------------------------------------------
  if (style === "photo") {
    if (img) cover(ctx, img, 0, 0, W, H);
    else photoPlaceholder(ctx, 0, 0, W, H, 0, P);
    const g = ctx.createLinearGradient(0, H * 0.35, 0, H);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.85)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Brand name on a dark chip so it reads on any picture
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.roundRect(PAD - 20, PAD - 20, 520, 104, 52);
    ctx.fill();
    brandMark(ctx, b, PAD - 4, PAD, "#ffffff", A);

    const t = fit(ctx, headline, W - PAD * 2, 900, 128, 64, 3);
    const lh = t.size * 1.02;
    const top = H - 330 - t.lines.length * lh - (sub ? 70 : 0);
    ctx.fillStyle = "#ffffff";
    let y = lines(ctx, t.lines, PAD, top + t.size, lh);
    tracking(ctx, 0);
    if (sub) {
      ctx.font = font(500, 40);
      ctx.globalAlpha = 0.9;
      y = lines(ctx, wrap(ctx, sub, W - PAD * 2).slice(0, 2), PAD, y + 18, 54);
      ctx.globalAlpha = 1;
    }
    if (cta) pill(ctx, cta, PAD, Math.min(y + 30, H - 270), A, inkOn(A));
    footer(ctx, b, "#ffffff");
    return;
  }

  // ---- Split (picture on top, colour panel below) ---------------------------------
  if (style === "split") {
    const ph = Math.round(H * 0.56);
    if (img) cover(ctx, img, 0, 0, W, ph);
    else photoPlaceholder(ctx, 0, 0, W, ph, 0, P);
    ctx.fillStyle = P;
    ctx.fillRect(0, ph, W, H - ph);
    ctx.fillStyle = A;
    ctx.fillRect(0, ph, W, 14);
    const ink = inkOn(P);
    // Brand chip on the picture
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.beginPath();
    ctx.roundRect(PAD - 20, PAD - 20, 520, 104, 52);
    ctx.fill();
    brandMark(ctx, b, PAD - 4, PAD, "#111113", P);

    const t = fit(ctx, headline, W - PAD * 2, 900, 104, 56, 2);
    ctx.fillStyle = ink;
    let y = lines(ctx, t.lines, PAD, ph + 70 + t.size, t.size * 1.04);
    tracking(ctx, 0);
    if (sub) {
      ctx.font = font(500, 38);
      ctx.globalAlpha = 0.88;
      y = lines(ctx, wrap(ctx, sub, W - PAD * 2 - 300).slice(0, 2), PAD, y + 10, 50);
      ctx.globalAlpha = 1;
    }
    if (cta) {
      ctx.font = font(800, 40);
      const w = ctx.measureText(cta).width + 104;
      pill(ctx, cta, W - PAD - w, H - 250, A, inkOn(A));
    }
    footer(ctx, b, ink);
    return;
  }

  // ---- Frame (tilted polaroid) -------------------------------------------------------
  if (style === "frame") {
    const ink = inkOn(P);
    ctx.fillStyle = P;
    ctx.fillRect(0, 0, W, H);
    glow(ctx, W / 2, 420, 560, A, 0.35);
    dots(ctx, PAD, 210, 5, 4, 50, ink, 0.2);
    brandMark(ctx, b, PAD, PAD, ink, A);

    ctx.save();
    ctx.translate(W / 2, 560);
    ctx.rotate(-0.045);
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 60;
    ctx.shadowOffsetY = 24;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-330, -300, 660, 640);
    ctx.shadowColor = "transparent";
    if (img) cover(ctx, img, -306, -276, 612, 520);
    else photoPlaceholder(ctx, -306, -276, 612, 520, 0, P);
    ctx.restore();

    const t = fit(ctx, headline, W - PAD * 2, 900, 96, 52, 2);
    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    let y = lines(ctx, t.lines, W / 2, 1000 + t.size * 0.2, t.size * 1.04);
    tracking(ctx, 0);
    if (sub) {
      ctx.font = font(500, 36);
      ctx.globalAlpha = 0.85;
      y = lines(ctx, wrap(ctx, sub, W - PAD * 2).slice(0, 1), W / 2, y + 6, 48);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = "left";
    if (cta) pill(ctx, cta, W / 2, Math.min(y + 20, H - 260), A, inkOn(A), false, true);
    footer(ctx, b, ink, true);
  }
}

// ---------------------------------------------------------------------------
// The component
// ---------------------------------------------------------------------------
export function FlyerCanvas({
  flyer,
  brand,
  imageUrl,
  fileName,
  className,
  download = true,
}: {
  flyer: Flyer;
  brand: BrandLook;
  /** Signed link to the person's picture (or a local blob: link right after choosing one). */
  imageUrl?: string | null;
  fileName: string;
  className?: string;
  download?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [saveError, setSaveError] = useState("");

  // Load the picture (with CORS, so the canvas can still be downloaded).
  useEffect(() => {
    if (!imageUrl) {
      setImg(null);
      return;
    }
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => setImg(i);
    i.onerror = () => setImg(null);
    i.src = imageUrl;
  }, [imageUrl]);

  useEffect(() => {
    const draw = () => ref.current && drawFlyer(ref.current, flyer, brand, img);
    draw();
    document.fonts?.ready.then(draw).catch(() => undefined);
  }, [flyer, brand, img]);

  const save = () => {
    setSaveError("");
    try {
      const url = ref.current?.toDataURL("image/png");
      if (!url) return;
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}.png`;
      a.click();
    } catch {
      setSaveError("Couldn't save this one. Try re-adding the photo.");
    }
  };

  return (
    <div className={className}>
      <canvas ref={ref} className="h-auto w-full rounded-2xl border border-slate-200 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.45)]" aria-label={`Flyer: ${flyer.headline ?? ""}`} />
      {download && (
        <button type="button" onClick={save} className="btn-primary mt-3 w-full">
          Download flyer
        </button>
      )}
      {saveError && <p className="mt-2 text-sm text-red-600">{saveError}</p>}
    </div>
  );
}
