"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Icon } from "@/components/icons";

export type TourStep = { target?: string; title: string; body: string };

const START_EVENT = "workbase:tour";
const PAD = 6;
const CARD_W = 320;

/** Button that (re)starts the walkthrough. */
export function TourButton({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(START_EVENT))}>
      {children ?? "Take the tour"}
    </button>
  );
}

function findTarget(name?: string): HTMLElement | null {
  if (!name) return null;
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`));
  return all.find((el) => el.getClientRects().length > 0 && el.offsetParent !== null) ?? null;
}

/**
 * First-visit walkthrough: highlights one part of the screen at a time with a short tip.
 * Starts by itself once per person on this device; restart with <TourButton />.
 */
export function Tour({ steps, storageKey }: { steps: TourStep[]; storageKey: string }) {
  const [index, setIndex] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });

  const finish = useCallback(() => {
    setIndex(null);
    try {
      localStorage.setItem(storageKey, new Date().toISOString());
    } catch {}
  }, [storageKey]);

  // Start once for new people, and whenever a TourButton is pressed.
  useEffect(() => {
    let seen = true;
    try {
      seen = !!localStorage.getItem(storageKey);
    } catch {}
    const timer = seen ? null : setTimeout(() => setIndex(0), 600);
    const start = () => setIndex(0);
    window.addEventListener(START_EVENT, start);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener(START_EVENT, start);
    };
  }, [storageKey]);

  const step = index === null ? null : steps[index];

  const measure = useCallback(() => {
    setViewport({ w: window.innerWidth, h: window.innerHeight });
    const el = findTarget(step?.target);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step]);

  useLayoutEffect(() => {
    if (!step) return;
    findTarget(step.target)?.scrollIntoView({ block: "nearest" });
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step, measure]);

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight") setIndex((i) => (i === null ? i : Math.min(steps.length - 1, i + 1)));
      if (e.key === "ArrowLeft") setIndex((i) => (i === null ? i : Math.max(0, i - 1)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, steps.length, finish]);

  if (index === null || !step) return null;
  const last = index === steps.length - 1;

  // Card beside the highlighted element (right of it if there is room, else below), or centred.
  let cardStyle: React.CSSProperties;
  if (rect && viewport.w) {
    const right = rect.right + 16 + CARD_W < viewport.w;
    const left = right ? rect.right + 16 : Math.min(Math.max(12, rect.left), viewport.w - CARD_W - 12);
    const top = right
      ? Math.min(Math.max(12, rect.top + rect.height / 2 - 70), viewport.h - 220)
      : Math.min(rect.bottom + 12, viewport.h - 220);
    cardStyle = { left, top, width: Math.min(CARD_W, viewport.w - 24) };
  } else {
    cardStyle = { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: Math.min(CARD_W + 40, viewport.w - 24 || CARD_W) };
  }

  return (
    <div className="fixed inset-0 z-[60] print:hidden" aria-live="polite">
      {rect ? (
        <div
          className="pointer-events-none fixed rounded-xl ring-2 ring-brand-500 transition-all duration-200"
          style={{
            left: rect.left - PAD,
            top: rect.top - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(14, 12, 34, 0.55)",
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-slate-950/55 dark:bg-black/60" />
      )}
      <div className="fixed inset-0" aria-hidden />


      <div
        key={index}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        className="tour-pop fixed rounded-2xl border border-slate-200 bg-raised p-5 shadow-2xl"
        style={cardStyle}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-brand-700 tabular-nums">
            {index + 1} of {steps.length}
          </span>
          <button type="button" onClick={finish} className="text-slate-400 hover:text-slate-700" aria-label="Close tour">
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>
        <h2 id="tour-title" className="font-display text-lg font-semibold tracking-tight text-slate-900">{step.title}</h2>
        <p className="mt-1.5 text-sm leading-6 text-slate-600">{step.body}</p>
        <div className="mt-4 flex items-center gap-1.5" aria-hidden>
          {steps.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-brand-600" : "w-1.5 bg-slate-200"}`} />
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" onClick={finish} className="text-sm text-slate-500 hover:text-slate-800">
            {last ? "" : "Skip tour"}
          </button>
          <div className="flex gap-2">
            {index > 0 && (
              <button type="button" className="btn-secondary btn-sm px-3 py-1.5 text-sm" onClick={() => setIndex(index - 1)}>
                Back
              </button>
            )}
            <button
              type="button"
              autoFocus
              className="btn-primary btn-sm px-3 py-1.5 text-sm"
              onClick={() => (last ? finish() : setIndex(index + 1))}
            >
              {last ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
