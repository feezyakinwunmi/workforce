/**
 * Meeting recordings kept on this device only (IndexedDB), in 5-second pieces as they are
 * recorded, so a closed tab, crash or flat battery loses at most the last few seconds.
 * Nothing here is ever uploaded. If the browser won't store (private mode), pieces stay in memory.
 */
import { fixWebmDuration } from "./webm-duration";

export type SavedRecording = {
  id: string;
  code: string;
  title: string;
  mime: string;
  audioOnly: boolean;
  startedAt: number;
  lastAt: number; // time of the last saved piece
  durationMs: number;
  bytes: number;
  done: boolean; // stopped normally (false = the tab closed mid-recording)
  downloadedAt: number | null;
};

const DB = "workbase-meet-recordings";
const listeners = new Set<() => void>();
// Fallbacks when the browser won't store: details and pieces kept in memory (lost if the tab closes).
const memMeta = new Map<string, SavedRecording>();
const memChunks = new Map<string, Blob[]>();

/** Re-render lists when recordings change (start, stop, download, delete). */
export function onRecordingsChange(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
const changed = () => listeners.forEach((fn) => fn());

let dbPromise: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        d.createObjectStore("recs", { keyPath: "id" });
        d.createObjectStore("chunks"); // key: [id, seq]
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx<T>(d: IDBDatabase, stores: string[], mode: IDBTransactionMode, run: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const t = d.transaction(stores, mode);
    let result: T | undefined;
    const req = run(t);
    if (req) req.onsuccess = () => (result = req.result);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function saveMeta(meta: SavedRecording) {
  const d = memMeta.has(meta.id) ? null : await db();
  let stored = false;
  if (d) {
    try {
      await tx(d, ["recs"], "readwrite", (t) => t.objectStore("recs").put(meta));
      stored = true;
    } catch {
      // full or blocked: keep it in memory below
    }
  }
  if (!stored) memMeta.set(meta.id, meta);
  changed();
}

/** Store one piece: on the device if possible, else in memory. */
export async function saveChunk(id: string, seq: number, blob: Blob) {
  const d = memChunks.has(id) ? null : await db();
  if (d) {
    try {
      await tx(d, ["chunks"], "readwrite", (t) => t.objectStore("chunks").put(blob, [id, seq]));
      return true;
    } catch {
      // full or blocked
    }
  }
  const list = memChunks.get(id) ?? [];
  list[seq] = blob;
  memChunks.set(id, list);
  return false;
}

export async function listRecordings(code?: string): Promise<SavedRecording[]> {
  const out: SavedRecording[] = [...memMeta.values()];
  const d = await db();
  if (d) {
    try {
      const rows = (await tx<SavedRecording[]>(d, ["recs"], "readonly", (t) => t.objectStore("recs").getAll() as IDBRequest<SavedRecording[]>)) ?? [];
      out.push(...rows.filter((r) => !memMeta.has(r.id)));
    } catch {
      // nothing stored
    }
  }
  return out.filter((r) => !code || r.code === code).sort((a, b) => b.startedAt - a.startedAt);
}

async function chunksOf(id: string): Promise<Blob[]> {
  const bySeq = new Map<number, Blob>();
  const d = await db();
  if (d) {
    try {
      const range = IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]);
      const keys = (await tx<IDBValidKey[]>(d, ["chunks"], "readonly", (t) => t.objectStore("chunks").getAllKeys(range))) ?? [];
      const values = (await tx<Blob[]>(d, ["chunks"], "readonly", (t) => t.objectStore("chunks").getAll(range) as IDBRequest<Blob[]>)) ?? [];
      keys.forEach((k, i) => bySeq.set((k as [string, number])[1], values[i]));
    } catch {
      // none stored
    }
  }
  (memChunks.get(id) ?? []).forEach((b, seq) => b && bySeq.set(seq, b));
  return [...bySeq.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b);
}

export async function deleteRecording(id: string) {
  memMeta.delete(id);
  memChunks.delete(id);
  const d = await db();
  if (d) {
    try {
      await tx(d, ["recs", "chunks"], "readwrite", (t) => {
        t.objectStore("recs").delete(id);
        t.objectStore("chunks").delete(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]));
      });
    } catch {
      // already gone
    }
  }
  changed();
}

const ext = (mime: string) => (/mp4/i.test(mime) ? (mime.startsWith("audio") ? "m4a" : "mp4") : mime.startsWith("audio") ? "weba" : "webm");

export function fileName(r: SavedRecording) {
  const d = new Date(r.startedAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  const when = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}`;
  const title = (r.title || `Meeting ${r.code}`).replace(/[\\/:*?"<>|]+/g, "").trim().slice(0, 60);
  return `${title} - ${when}${r.audioOnly ? " (audio)" : ""}.${ext(r.mime)}`;
}

/** Save the recording to the device's Downloads (or the share sheet on iPhone). */
export async function downloadRecording(r: SavedRecording) {
  const parts = await chunksOf(r.id);
  if (!parts.length) throw new Error("This recording is empty.");
  const blob = await fixWebmDuration(parts, r.durationMs || r.lastAt - r.startedAt, r.mime.split(";")[0]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName(r);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  await saveMeta({ ...r, downloadedAt: Date.now() });
}

/** Clear out recordings that were downloaded more than 3 days ago. */
export async function tidyRecordings() {
  const old = (await listRecordings()).filter((r) => r.downloadedAt && Date.now() - r.downloadedAt > 3 * 86_400_000);
  for (const r of old) await deleteRecording(r.id);
}

/** Free space left for recordings on this device (bytes), if the browser says. */
export async function spaceLeft(): Promise<number | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    if (!e?.quota) return null;
    void navigator.storage.persist?.().catch(() => undefined);
    return e.quota - (e.usage ?? 0);
  } catch {
    return null;
  }
}
