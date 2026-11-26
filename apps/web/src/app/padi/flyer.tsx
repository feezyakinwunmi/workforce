"use client";

/**
 * Bizz Padi flyer maker (26 Nov 2026).
 *
 * Draws a 1080×1350 (Instagram portrait) flyer on a <canvas> in the browser from the post's
 * flyer text + the brand's colours. No AI image model, no server, no cost: the same templates
 * every time, so a brand's posts look consistent. "Download" saves a PNG to post anywhere.
 *
 * Four styles:
 *   bold   big headline on the main colour, highlight bar for the call to action
 *   clean  light background, main-colour text, thin accent line (premium look)
 *   promo  diagonal accent band, made for sales and offers
 *   quote  large quote marks, for tips and sayings
 */
import { useEffect, useRef } from "react";
import type { Flyer } from "@/lib/padi/types";

const W = 1080;
const H = 1350;

/** Split text into lines that fit `max` pixels wide at the current font. */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
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

/** Black or white text, whichever reads better on this background colour. */
function inkOn(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#15123a" : "#ffffff";
}

/** Draw the whole flyer. Exported so the calendar thumbnails can reuse it. */
export function drawFlyer(canvas: HTMLCanvasElement, f: Flyer, brand: { name: string; contact: string; primary: string; accent: string }) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = W;
  canvas.height = H;
  const style = f.style ?? "bold";
  const font = (weight: number, size: number) => `${weight} ${size}px Inter, system-ui, sans-serif`;
  const light = style === "clean" || style === "quote";
  const bg = light ? "#f7f6fb" : brand.primary;
  const ink = light ? "#15123a" : inkOn(brand.primary);

  // Background
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Style-specific decoration
  if (style === "bold") {
    ctx.fillStyle = brand.accent;
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.arc(W - 120, 160, 360, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else if (style === "promo") {
    ctx.save();
    ctx.translate(W / 2, H * 0.42);
    ctx.rotate(-0.12);
    ctx.fillStyle = brand.accent;
    ctx.fillRect(-W, -70, W * 2, 140);
    ctx.restore();
  } else if (style === "clean") {
    ctx.fillStyle = brand.primary;
    ctx.fillRect(96, 200, 120, 12);
  } else if (style === "quote") {
    ctx.fillStyle = brand.accent;
    ctx.font = font(800, 360);
    ctx.fillText("“", 70, 470);
  }

  // Brand name, top left
  ctx.fillStyle = light ? brand.primary : ink;
  ctx.font = font(800, 40);
  ctx.fillText(brand.name.toUpperCase(), 96, 130);

  // Headline: as big as fits, up to 4 lines
  let size = 128;
  let lines: string[] = [];
  const headline = (f.headline || brand.name).trim();
  do {
    ctx.font = font(800, size);
    lines = wrap(ctx, headline, W - 192);
    size -= 8;
  } while (lines.length > 4 && size > 56);
  const top = style === "promo" ? H * 0.42 - (lines.length * (size + 22)) / 2 + size : 420;
  ctx.fillStyle = style === "promo" ? "#15123a" : light ? "#15123a" : ink;
  if (style === "promo") ctx.textAlign = "center";
  lines.forEach((l, i) => ctx.fillText(l, style === "promo" ? W / 2 : 96, top + i * (size + 22)));
  ctx.textAlign = "left";

  // Subline
  if (f.subline) {
    ctx.font = font(500, 44);
    ctx.fillStyle = light ? "#4a4766" : ink;
    ctx.globalAlpha = light ? 1 : 0.88;
    const subTop = style === "promo" ? H * 0.62 : top + lines.length * (size + 22) + 40;
    if (style === "promo") ctx.textAlign = "center";
    wrap(ctx, f.subline, W - 192).slice(0, 3).forEach((l, i) => ctx.fillText(l, style === "promo" ? W / 2 : 96, subTop + i * 60));
    ctx.textAlign = "left";
    ctx.globalAlpha = 1;
  }

  // Call to action pill
  if (f.cta) {
    ctx.font = font(800, 46);
    const tw = ctx.measureText(f.cta).width;
    const x = style === "promo" ? (W - tw - 96) / 2 : 96;
    const y = H - 330;
    ctx.fillStyle = light || style === "promo" ? brand.primary : brand.accent;
    ctx.beginPath();
    ctx.roundRect(x, y, tw + 96, 104, 52);
    ctx.fill();
    ctx.fillStyle = light || style === "promo" ? inkOn(brand.primary) : inkOn(brand.accent);
    ctx.fillText(f.cta, x + 48, y + 68);
  }

  // Footer: contact + thin rule
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = light ? "#15123a" : ink;
  ctx.fillRect(96, H - 160, W - 192, 2);
  ctx.globalAlpha = 1;
  ctx.font = font(600, 36);
  ctx.fillStyle = light ? "#15123a" : ink;
  ctx.fillText(brand.contact || brand.name, 96, H - 96);
}

/** The flyer on screen, with a download button. */
export function FlyerCanvas({
  flyer,
  brand,
  fileName,
  className,
  download = true,
}: {
  flyer: Flyer;
  brand: { name: string; contact: string; primary: string; accent: string };
  fileName: string;
  className?: string;
  download?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Wait for the web font so the first draw uses Inter, not a fallback.
    const draw = () => ref.current && drawFlyer(ref.current, flyer, brand);
    draw();
    document.fonts?.ready.then(draw).catch(() => undefined);
  }, [flyer, brand]);

  const save = () => {
    const url = ref.current?.toDataURL("image/png");
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.png`;
    a.click();
  };

  return (
    <div className={className}>
      <canvas ref={ref} className="h-auto w-full rounded-2xl border border-slate-200 shadow-sm" aria-label={`Flyer: ${flyer.headline ?? ""}`} />
      {download && (
        <button type="button" onClick={save} className="btn-secondary btn-sm mt-3 w-full">
          Download flyer (PNG)
        </button>
      )}
    </div>
  );
}
