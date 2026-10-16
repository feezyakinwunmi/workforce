"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type FeedbackProduct = "workbase" | "meet" | "book";

/** Quick tags: one tap instead of typing. Meet's change with the stars (problems vs. what went well). */
function tagsFor(product: FeedbackProduct, rating: number | null) {
  if (product === "meet") {
    if (rating !== null && rating >= 4) return ["Clear sound", "Good video", "Easy to join", "Stable on my network", "Low data use"];
    return ["Poor sound", "Echo", "Video froze", "Call dropped", "Hard to join", "Used too much data", "Screen share issue"];
  }
  return ["Idea", "Something's broken", "Confusing", "Too slow", "I like it"];
}

/** Browser, system and network type, so problems can be traced (e.g. "Chrome · Android · 3g"). */
function deviceLabel() {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet"
    : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows"
    : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  const net = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType;
  return [browser, os, net].filter(Boolean).join(" · ");
}

const STAR_WORDS = ["", "Bad", "Not great", "Okay", "Good", "Great"];

/**
 * Optional feedback: stars, quick tags and/or a message. Everything is optional except that
 * something has to be picked or written. Only the Workbase team sees it (owner console).
 */
export function FeedbackForm({
  product, room, reason, dark = false, title, onDone, onSkip, autoFocus = false,
}: {
  product: FeedbackProduct;
  room?: string;
  reason?: string;
  dark?: boolean;
  title?: string;
  onDone?: () => void;
  onSkip?: () => void;
  autoFocus?: boolean;
}) {
  const [rating, setRating] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const options = tagsFor(product, rating);
  // Tags from the other star group don't apply any more.
  useEffect(() => setTags((t) => t.filter((x) => options.includes(x))), [rating]); // eslint-disable-line react-hooks/exhaustive-deps

  const empty = rating === null && tags.length === 0 && !message.trim();

  async function send() {
    if (empty) return;
    setBusy(true);
    setError(null);
    const { error: e } = await createClient().rpc("submit_feedback", {
      p_product: product,
      p_rating: rating,
      p_tags: tags,
      p_message: message.trim(),
      p_room: room ?? null,
      p_page: typeof location !== "undefined" ? location.pathname.slice(0, 200) : "",
      p_device: deviceLabel(),
      p_reason: reason ?? null,
    });
    setBusy(false);
    if (e) {
      setError(/sign in/i.test(e.message) ? "Sign in to send feedback." : e.message);
      return;
    }
    setSent(true);
    onDone?.();
  }

  const muted = dark ? "text-white/60" : "text-slate-500";
  if (sent) {
    return (
      <div className={cn("flex items-center gap-2 text-sm", dark ? "text-emerald-300" : "text-emerald-700")} role="status">
        <Icon name="check" className="h-4 w-4" /> Thank you! We read every message.
      </div>
    );
  }

  const shown = hover ?? rating ?? 0;
  return (
    <div className="space-y-4 text-left">
      <div>
        <p className={cn("font-medium", dark ? "text-white" : "text-slate-900")}>
          {title ?? (product === "meet" ? "How was the call?" : "How is it going?")}
        </p>
        <div className="mt-2 flex items-center gap-1" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(null)}>
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={rating === s}
              aria-label={`${s} star${s > 1 ? "s" : ""}: ${STAR_WORDS[s]}`}
              autoFocus={autoFocus && s === 1}
              onMouseEnter={() => setHover(s)}
              onClick={() => setRating(rating === s ? null : s)}
              className="rounded p-0.5 transition hover:scale-110 focus-visible:outline-2 focus-visible:outline-[#6a4cf5]"
            >
              <svg viewBox="0 0 24 24" className="h-8 w-8" aria-hidden="true">
                <path
                  d="M12 3.2l2.6 5.5 6 .8-4.4 4.1 1.1 6L12 16.7l-5.3 2.9 1.1-6L3.4 9.5l6-.8z"
                  strokeLinejoin="round"
                  strokeWidth="1.6"
                  className={s <= shown ? "fill-[#f2a93b] stroke-[#f2a93b]" : dark ? "fill-transparent stroke-white/40" : "fill-transparent stroke-slate-300"}
                />
              </svg>
            </button>
          ))}
          <span className={cn("ml-2 text-sm", muted)}>{STAR_WORDS[shown]}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {options.map((t) => {
          const on = tags.includes(t);
          return (
            <button
              key={t}
              type="button"
              aria-pressed={on}
              onClick={() => setTags((x) => (on ? x.filter((y) => y !== t) : [...x, t]))}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition",
                on
                  ? "border-[#6a4cf5] bg-[#6a4cf5] text-white"
                  : dark
                    ? "border-white/20 text-white/80 hover:border-white/40"
                    : "border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900",
              )}
            >
              {t}
            </button>
          );
        })}
      </div>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value.slice(0, 2000))}
        rows={3}
        placeholder={product === "meet" ? "Anything we should fix or add? (optional)" : "Tell us what to fix, improve or add (optional)"}
        aria-label="Your feedback"
        className={cn(
          "w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#6a4cf5]/50",
          dark ? "border-white/15 bg-white/5 text-white placeholder:text-white/40" : "border-slate-200 bg-surface text-slate-900 placeholder:text-slate-400",
        )}
      />

      {error && <p className={cn("text-sm", dark ? "text-red-300" : "text-red-700")} role="alert">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={send}
          disabled={empty || busy}
          className="rounded-xl bg-[#6a4cf5] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#5b3fe0] disabled:opacity-40"
        >
          {busy ? "Sending…" : "Send feedback"}
        </button>
        {onSkip && (
          <button type="button" onClick={onSkip} className={cn("text-sm hover:underline", muted)}>
            Skip
          </button>
        )}
      </div>
    </div>
  );
}

/** A button that opens the feedback form in a small window (dashboard, Meet and Book headers). */
export function FeedbackButton({ product, className, children }: { product: FeedbackProduct; className?: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} title="Send feedback">
        {children ?? (
          <>
            <Icon name="chat" />
            <span className="sr-only">Send feedback</span>
          </>
        )}
      </button>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl text-left border border-slate-200 bg-surface p-0 text-slate-900 shadow-xl backdrop:bg-slate-950/40"
      >
        {open && (
          <div className="p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold">Feedback and ideas</h2>
                <p className="text-sm text-slate-500">Goes straight to the Workbase team.</p>
              </div>
              <button type="button" className="btn-ghost -mt-1 -mr-2 px-2" onClick={() => setOpen(false)} aria-label="Close">
                <Icon name="x" />
              </button>
            </div>
            <FeedbackForm product={product} title="How do you rate it so far?" onDone={() => setTimeout(() => setOpen(false), 1600)} />
          </div>
        )}
      </dialog>
    </>
  );
}
