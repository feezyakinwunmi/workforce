import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { BLOCK_SECONDS } from "./config";

export const uuid = () => randomUUID();

/** Start of the 10-minute block containing `ms`, as an ISO string. */
export function blockStart(ms: number): string {
  const size = BLOCK_SECONDS * 1000;
  return new Date(Math.floor(ms / size) * size).toISOString();
}

/** Local calendar date (YYYY-MM-DD) on this computer. */
export function localDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Write a file safely: write a temp file, then rename over the old one. */
export function writeFileAtomic(file: string, data: string | Buffer) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
