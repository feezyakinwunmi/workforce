import fs from "node:fs";
import path from "node:path";
import { desktopCapturer, screen } from "electron";
import type { Api } from "./api";
import { uuid, writeFileAtomic } from "./util";

/**
 * Pro plan screenshots (only when the company switched them on AND the worker agreed).
 *
 * - One per interval window (e.g. every 10 minutes), at a random moment inside it.
 * - Only the screen the mouse is on, scaled to at most 1600 px wide, JPEG.
 * - Blurring happens here, before the file is saved or uploaded, so details never leave the computer.
 * - Waiting files live in <userData>/screenshots until uploaded (kept at most 3 days, 200 files).
 */
export type ShotMeta = {
  id: string;
  userId: string;
  orgId: string;
  sessionId: string | null;
  takenAt: string;
  app: string | null;
  blurred: boolean;
  width: number;
  height: number;
};

const MAX_WIDTH = 1600;
const MAX_QUEUE = 200;
const MAX_AGE_MS = 3 * 24 * 3600 * 1000;

export class Screenshots {
  private dir: string;
  private nextAt: number | null = null;
  private windowMs = 0;
  private uploading = false;
  private capturing = false;

  constructor(userData: string) {
    this.dir = path.join(userData, "screenshots");
    fs.mkdirSync(this.dir, { recursive: true });
  }

  /** Forget the schedule (clock-out, settings change). */
  reset() {
    this.nextAt = null;
  }

  /** Is it time for this window's screenshot? Picks a random moment per window. */
  due(nowMs: number, intervalMinutes: number): boolean {
    const size = Math.max(5, intervalMinutes) * 60_000;
    if (size !== this.windowMs || this.nextAt === null) {
      this.windowMs = size;
      this.nextAt = this.pick(nowMs, false);
    }
    return nowMs >= this.nextAt;
  }

  /** After taking (or skipping) one, schedule the next window. */
  done(nowMs: number) {
    this.nextAt = this.pick(nowMs, true);
  }

  private pick(nowMs: number, nextWindow: boolean) {
    const start = Math.floor(nowMs / this.windowMs) * this.windowMs + (nextWindow ? this.windowMs : 0);
    const at = start + Math.floor(Math.random() * this.windowMs);
    // In the current window, a moment already past means "skip to the next window".
    return at < nowMs && !nextWindow ? at + this.windowMs : at;
  }

  /** Take one picture of the screen in use and queue it for upload. */
  async capture(meta: Omit<ShotMeta, "id" | "width" | "height">): Promise<boolean> {
    if (this.capturing) return false;
    this.capturing = true;
    try {
      const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      const scale = display.scaleFactor || 1;
      const fullW = Math.round(display.size.width * scale);
      const fullH = Math.round(display.size.height * scale);
      const ratio = Math.min(1, MAX_WIDTH / fullW);
      const size = { width: Math.round(fullW * ratio), height: Math.round(fullH * ratio) };

      const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: size });
      const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
      if (!source || source.thumbnail.isEmpty()) return false;

      let image = source.thumbnail;
      if (meta.blurred) {
        // Shrink to a tiny picture and scale it back up: shapes and colours stay, text does not.
        const { width } = image.getSize();
        image = image.resize({ width: Math.max(24, Math.round(width / 28)), quality: "good" }).resize({ width, quality: "good" });
      }
      const { width, height } = image.getSize();
      const id = uuid();
      writeFileAtomic(path.join(this.dir, `${id}.jpg`), image.toJPEG(meta.blurred ? 60 : 70));
      writeFileAtomic(path.join(this.dir, `${id}.json`), JSON.stringify({ ...meta, id, width, height } satisfies ShotMeta));
      this.trim();
      return true;
    } catch {
      return false; // never let a failed screenshot disturb time tracking
    } finally {
      this.capturing = false;
    }
  }

  /** Upload waiting screenshots of this person. Stops at the first network problem. */
  async upload(api: Api, userId: string, orgId: string) {
    if (this.uploading) return;
    this.uploading = true;
    try {
      for (const meta of this.queue()) {
        if (meta.userId !== userId || meta.orgId !== orgId || Date.now() - Date.parse(meta.takenAt) > MAX_AGE_MS) {
          this.remove(meta.id);
          continue;
        }
        const file = path.join(this.dir, `${meta.id}.jpg`);
        if (!fs.existsSync(file)) {
          this.remove(meta.id);
          continue;
        }
        const result = await api.uploadScreenshot(meta, fs.readFileSync(file));
        if (result === "retry") break; // offline: try again on the next sync
        this.remove(meta.id); // "ok", or refused for good (e.g. screenshots switched off meanwhile)
      }
    } finally {
      this.uploading = false;
    }
  }

  /** Delete everything waiting (log out, or another person logs in). */
  clear() {
    for (const f of this.files()) fs.rmSync(path.join(this.dir, f), { force: true });
  }

  pendingCount() {
    return this.files().filter((f) => f.endsWith(".json")).length;
  }

  private files() {
    try {
      return fs.readdirSync(this.dir);
    } catch {
      return [];
    }
  }

  private queue(): ShotMeta[] {
    const metas: ShotMeta[] = [];
    for (const f of this.files()) {
      if (!f.endsWith(".json")) continue;
      try {
        metas.push(JSON.parse(fs.readFileSync(path.join(this.dir, f), "utf8")) as ShotMeta);
      } catch {
        fs.rmSync(path.join(this.dir, f), { force: true });
      }
    }
    return metas.sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  }

  private trim() {
    const q = this.queue();
    for (const meta of q.slice(0, Math.max(0, q.length - MAX_QUEUE))) this.remove(meta.id);
  }

  private remove(id: string) {
    fs.rmSync(path.join(this.dir, `${id}.jpg`), { force: true });
    fs.rmSync(path.join(this.dir, `${id}.json`), { force: true });
  }
}
