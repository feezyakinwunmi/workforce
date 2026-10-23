"use client";

import { createClient } from "@/lib/supabase/client";
import { audioContext } from "./engine";
import { workerTicker } from "./ticker";

/**
 * AI notes (Meet Pro Max), on the device of the person who turned them on: mixes everyone's sound
 * (only what this device already receives, so no extra data), records it small (Opus ~32 kbps) and
 * uploads a piece every 30 seconds to the private bucket "meet-audio". After each piece the
 * database counts the time (meet_notes_chunk) and says how much AI time is left. It also notes who
 * was talking when, so the summary can put names on the voices.
 * Nothing is played back or kept on the device; the server deletes the sound once the notes exist.
 */
const PIECE_MS = 30_000;

function pickMime() {
  if (typeof MediaRecorder === "undefined") return null;
  const list = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return list.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}
const baseMime = (m: string) => (m.startsWith("audio/mp4") ? "audio/mp4" : m.startsWith("audio/ogg") ? "audio/ogg" : "audio/webm");
const extOf = (m: string) => ({ "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/webm": "webm" })[baseMime(m)];

export const canTakeNotes = () => typeof window !== "undefined" && !!pickMime() && typeof AudioContext !== "undefined";

type Piece = { seq: number; blob: Blob; seconds: number; speakers: Array<[number, string]> };

export class NotesRecorder {
  id: string | null = null;
  private rec: MediaRecorder | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private hush: ConstantSourceNode | null = null;
  private sources = new Map<string, MediaStreamAudioSourceNode>();
  private stopSync: (() => void) | null = null;
  private mime = "audio/webm";
  private seq = 0;
  private queue: Piece[] = [];
  private pumping = false;
  private finished = false;
  private t0 = 0;
  private pieceStart = 0;
  private speakers: Array<[number, string]> = [];
  private lastSpeaker = "\u0000";
  private stopped: Promise<void> | null = null;

  constructor(
    private opts: {
      room: string;
      audio: () => MediaStreamTrack[];
      onLeft: (seconds: number) => void;
      /** The server stopped the notes (AI time used up, meeting ended…). */
      onServerStop: (why: string) => void;
    },
  ) {}

  async start() {
    const mime = pickMime();
    if (!mime) throw new Error("This browser can't take AI notes. Try Chrome, Edge or Safari.");
    this.mime = mime;
    const supabase = createClient();
    const { data, error } = await supabase.rpc("meet_notes_start", { p_room: this.opts.room, p_mime: baseMime(mime) });
    if (error || !data) throw new Error(error?.message ?? "Couldn't turn on AI notes.");
    const res = data as { id: string; left: number };
    this.id = res.id;
    this.opts.onLeft(res.left);
    try {
      sessionStorage.setItem(`meet-notes:${this.opts.room}`, res.id);
    } catch {
      // private mode: only the end-screen link is lost
    }

    const ctx = audioContext();
    await ctx.resume().catch(() => undefined);
    this.dest = ctx.createMediaStreamDestination();
    // Keeps the sound running when nobody talks.
    this.hush = ctx.createConstantSource();
    const zero = ctx.createGain();
    zero.gain.value = 0;
    this.hush.connect(zero).connect(this.dest);
    this.hush.start();
    this.sync();
    this.stopSync = workerTicker(2000, () => this.sync());

    this.rec = new MediaRecorder(this.dest.stream, { mimeType: mime, audioBitsPerSecond: 32_000 });
    this.rec.ondataavailable = (e) => {
      if (e.data.size) this.enqueue(e.data);
    };
    this.t0 = this.pieceStart = Date.now();
    this.rec.start(PIECE_MS);
  }

  /** Who is talking right now (called about once a second); "" = nobody. */
  noteSpeaker(name: string) {
    if (!this.t0 || name === this.lastSpeaker) return;
    this.lastSpeaker = name;
    this.speakers.push([Math.round((Date.now() - this.t0) / 1000), name.slice(0, 60)]);
  }

  /** Follow people joining and leaving: one sound source per live track. */
  private sync() {
    if (!this.dest) return;
    const ctx = this.dest.context as AudioContext;
    const want = new Map(this.opts.audio().filter((t) => t.readyState === "live").map((t) => [t.id, t]));
    for (const [id, node] of this.sources) {
      if (!want.has(id)) {
        node.disconnect();
        this.sources.delete(id);
      }
    }
    for (const [id, t] of want) {
      if (this.sources.has(id)) continue;
      try {
        const node = ctx.createMediaStreamSource(new MediaStream([t]));
        node.connect(this.dest);
        this.sources.set(id, node);
      } catch {
        // a track that ended in between
      }
    }
  }

  private enqueue(blob: Blob) {
    const now = Date.now();
    this.queue.push({ seq: ++this.seq, blob, seconds: Math.round((now - this.pieceStart) / 1000), speakers: this.speakers.splice(0) });
    this.pieceStart = now;
    void this.pump();
  }

  /** Upload pieces strictly in order; on a bad network keep trying with a growing pause. */
  private async pump() {
    if (this.pumping || !this.id) return;
    this.pumping = true;
    const supabase = createClient();
    let wait = 2000;
    try {
      while (this.queue.length) {
        const p = this.queue[0];
        const path = `${this.id}/${String(p.seq).padStart(5, "0")}.${extOf(this.mime)}`;
        try {
          const { error: upErr } = await supabase.storage.from("meet-audio").upload(path, p.blob, { contentType: baseMime(this.mime), upsert: false });
          if (upErr && !/exists|duplicate/i.test(upErr.message)) throw new Error(upErr.message);
          const { data, error } = await supabase.rpc("meet_notes_chunk", { p_note: this.id, p_seq: p.seq, p_seconds: p.seconds, p_speakers: p.speakers });
          if (error) throw new Error(error.message);
          this.queue.shift();
          wait = 2000;
          const r = data as { left: number; stopped: boolean };
          this.opts.onLeft(r.left);
          if (r.stopped && !this.finished) {
            this.finished = true;
            this.opts.onServerStop("This month's AI notes time is used up, so AI notes stopped. Your notes so far will still be written.");
            void this.stop();
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (/stopped|row-level security|not found/i.test(msg)) {
            // The server stopped these notes (meeting ended, I left): what's uploaded is kept.
            this.queue = [];
            if (!this.finished) {
              this.finished = true;
              this.opts.onServerStop("AI notes stopped. Your notes are being written.");
              void this.stop();
            }
            return;
          }
          await new Promise((r) => setTimeout(r, wait));
          wait = Math.min(wait * 2, 15_000);
        }
      }
    } finally {
      this.pumping = false;
    }
  }

  /** Stop: last piece, wait (up to 20 s) for uploads, tell the server, ask it to start right away. */
  stop() {
    this.stopped ??= (async () => {
      this.finished = true;
      const rec = this.rec;
      if (rec && rec.state !== "inactive") {
        await new Promise<void>((resolve) => {
          rec.addEventListener("stop", () => resolve(), { once: true });
          rec.stop();
          setTimeout(resolve, 3000);
        });
      }
      this.stopSync?.();
      for (const n of this.sources.values()) n.disconnect();
      this.sources.clear();
      try {
        this.hush?.stop();
      } catch {
        // already stopped
      }
      const until = Date.now() + 20_000;
      while ((this.queue.length || this.pumping) && Date.now() < until) {
        void this.pump();
        await new Promise((r) => setTimeout(r, 300));
      }
      if (this.id) {
        await createClient().rpc("meet_notes_stop", { p_note: this.id }).then(() => undefined, () => undefined);
        void fetch("/api/meet/notes/process", { method: "POST", keepalive: true }).catch(() => undefined);
      }
    })();
    return this.stopped;
  }
}
