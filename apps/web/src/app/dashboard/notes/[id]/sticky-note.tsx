"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { NOTE_COLORS, PAPER, type Note, type NoteColor } from "@/lib/notes";
import { cn } from "@/lib/utils";
import { deleteNote, saveNote } from "../actions";

const HAND = '"Segoe Print", "Bradley Hand", "Chalkboard SE", "Comic Sans MS", "Comic Neue", cursive';
const INK = "#2b2620";
const LINE = 34; // px between ruled lines

/** The pushpin at the top of the note. */
function Pin() {
  return (
    <svg viewBox="0 0 48 56" className="absolute -top-6 left-1/2 h-14 w-12 -translate-x-1/2 drop-shadow-[0_4px_3px_rgba(0,0,0,0.25)]" aria-hidden>
      <defs>
        <radialGradient id="pin-head" cx="38%" cy="32%" r="65%">
          <stop offset="0" stopColor="#ff8a8a" />
          <stop offset="0.55" stopColor="#e5383b" />
          <stop offset="1" stopColor="#a4161a" />
        </radialGradient>
      </defs>
      <path d="M24 30 L25.5 54 L22.5 54 Z" fill="#9ca3af" />
      <ellipse cx="24" cy="31" rx="9" ry="3.5" fill="#a4161a" />
      <circle cx="24" cy="18" r="15" fill="url(#pin-head)" />
      <ellipse cx="19" cy="12" rx="5" ry="3.2" fill="#fff" opacity="0.55" />
    </svg>
  );
}

export function StickyNote({ note }: { note: Note }) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [color, setColor] = useState<NoteColor>(note.color);
  const [pinned, setPinned] = useState(note.pinned);
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ title?: string; body?: string }>({});

  async function flush() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const patch = pending.current;
    pending.current = {};
    if (!Object.keys(patch).length) return;
    setStatus("saving");
    const res = await saveNote(note.id, patch);
    setStatus(res.ok ? "saved" : "error");
  }

  function queue(patch: { title?: string; body?: string }) {
    pending.current = { ...pending.current, ...patch };
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 700);
  }

  // Save anything still typed when leaving the page.
  useEffect(() => {
    const onHide = () => void flush();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      void flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function change(patch: { color?: NoteColor; pinned?: boolean }) {
    if (patch.color) setColor(patch.color);
    if (patch.pinned !== undefined) setPinned(patch.pinned);
    setStatus("saving");
    const res = await saveNote(note.id, patch);
    setStatus(res.ok ? "saved" : "error");
  }

  const paper = PAPER[color];

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div className="flex items-center justify-between gap-3">
        <Link href="/dashboard/notes" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900" onClick={() => void flush()}>
          <Icon name="chevronLeft" className="h-4 w-4" />
          Notes
        </Link>
        <span className={cn("text-xs", status === "error" ? "text-red-600" : "text-slate-400")} aria-live="polite">
          {status === "saving" ? "Saving…" : status === "error" ? "Not saved. Check your connection." : "Saved"}
        </span>
      </div>

      {/* The note itself */}
      <div className="px-2 pt-6 sm:px-6">
        <div
          className="relative -rotate-[1.2deg] rounded-[2px] transition-colors duration-300"
          style={{
            background: `linear-gradient(180deg, ${paper.paper} 0%, ${paper.paper} 85%, color-mix(in srgb, ${paper.paper} 88%, #000) 100%)`,
            boxShadow: "0 1px 1px rgba(0,0,0,0.08), 0 12px 24px -10px rgba(0,0,0,0.35), 0 30px 40px -30px rgba(0,0,0,0.3)",
            color: INK,
          }}
        >
          <Pin />
          <div className="px-7 pt-10 pb-8 sm:px-10">
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                queue({ title: e.target.value });
              }}
              onBlur={() => void flush()}
              maxLength={120}
              placeholder="Title"
              aria-label="Title"
              className="w-full border-0 bg-transparent p-0 text-2xl font-bold placeholder:opacity-40 focus:ring-0 focus:outline-none focus-visible:outline-none"
              style={{ fontFamily: HAND, color: INK }}
            />
            <textarea
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                queue({ body: e.target.value });
              }}
              onBlur={() => void flush()}
              maxLength={5000}
              placeholder="Write something…"
              aria-label="Note"
              rows={Math.max(9, body.split("\n").length + 2)}
              className="mt-3 block w-full resize-none border-0 bg-transparent p-0 text-lg placeholder:opacity-40 focus:ring-0 focus:outline-none focus-visible:outline-none"
              style={{
                fontFamily: HAND,
                color: INK,
                lineHeight: `${LINE}px`,
                backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${LINE - 1}px, rgba(43,38,32,0.12) ${LINE - 1}px, rgba(43,38,32,0.12) ${LINE}px)`,
                backgroundAttachment: "local",
              }}
            />
          </div>
          {/* Folded corner */}
          <span
            className="absolute right-0 bottom-0 h-10 w-10"
            style={{ background: `linear-gradient(135deg, ${paper.paper} 50%, ${paper.edge} 50%)`, boxShadow: "-2px -2px 4px rgba(0,0,0,0.08)" }}
            aria-hidden
          />
        </div>
      </div>

      {/* Colour, pin, delete */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2" role="radiogroup" aria-label="Paper colour">
          {NOTE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={PAPER[c].label}
              title={PAPER[c].label}
              onClick={() => void change({ color: c })}
              className={cn("h-8 w-8 rounded-full border-2 transition", color === c ? "scale-110 border-slate-900 dark:border-slate-800" : "border-transparent hover:scale-105")}
              style={{ background: PAPER[c].paper, boxShadow: `inset 0 -3px 0 ${PAPER[c].edge}` }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className={cn("btn-secondary btn-sm", pinned && "border-marigold-400 text-marigold-700")} onClick={() => void change({ pinned: !pinned })} aria-pressed={pinned}>
            <Icon name="pin" className="h-3.5 w-3.5" />
            {pinned ? "Pinned" : "Pin to top"}
          </button>
          <form action={deleteNote} onSubmit={(e) => { if (!confirmDelete()) e.preventDefault(); }}>
            <input type="hidden" name="id" value={note.id} />
            <button className="btn-ghost btn-sm text-slate-500 hover:text-red-600" title="Delete note">
              <Icon name="trash" className="h-4 w-4" />
              <span className="sr-only">Delete note</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function confirmDelete() {
  return window.confirm("Delete this note?");
}
