"use client";

/**
 * Small motion helpers for the public pages (no animation library: plain CSS + a few observers).
 *
 *   <Reveal>        content rises out of a mask the first time it scrolls into view
 *   <RotatingWord>  one word that swaps through a list with a mask slide
 *   <Tilt>          a card that leans toward the pointer (mouse/trackpad only)
 *
 * Everything respects "reduce motion": the CSS in globals.css turns the effects off, and the
 * timers below don't start.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";

/** True when the visitor asked their device for less motion. */
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ------------------------------------------------------------------------------------------------
 * Reveal
 * ------------------------------------------------------------------------------------------------
 * A wrapper that rises into view as it scrolls onto the screen. The animation is pure CSS
 * (scroll-driven, see "Reveal" in globals.css), so the content is always rendered visible and
 * nothing depends on JavaScript. `delay` is kept for callers but no longer needed.
 */
export function Reveal({
  children,
  className = "",
  as: Tag = "div",
  variant = "rise",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "li" | "section" | "h2" | "p" | "span" | "article" | "figure";
  /** rise = slide up; scale = grow from slightly smaller; fade = opacity only. */
  variant?: "rise" | "scale" | "fade";
}) {
  return <Tag className={`reveal-${variant} ${className}`}>{children}</Tag>;
}

/* ------------------------------------------------------------------------------------------------
 * RotatingWord
 * ------------------------------------------------------------------------------------------------
 * Every `every` ms the current word slides up out of a clipped box and the next slides in.
 * The box is sized to the longest word (an invisible copy) so the line never jumps.
 * Screen readers get the whole list once instead of a word that keeps changing.
 */
export function RotatingWord({ words, every = 2600, className = "" }: { words: string[]; every?: number; className?: string }) {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (reducedMotion() || words.length < 2) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % words.length), every);
    return () => window.clearInterval(t);
  }, [words.length, every]);

  const longest = words.reduce((a, b) => (b.length > a.length ? b : a), "");

  return (
    <span className={`rotating-word ${className}`}>
      <span className="sr-only">{words.join(", ")}</span>
      <span aria-hidden className="rotating-word-box">
        {/* Holds the width of the longest word. */}
        <span className="invisible">{longest}</span>
        {words.map((w, n) => (
          <span key={w} className="rotating-word-item" data-state={n === i ? "in" : n === (i - 1 + words.length) % words.length ? "out" : "wait"}>
            {w}
          </span>
        ))}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Tilt
 * ------------------------------------------------------------------------------------------------
 * Leans the card up to `max` degrees toward the pointer and moves a soft highlight with it.
 * Writes straight to CSS variables in one requestAnimationFrame per move (no React re-render).
 * Touch screens and reduced motion get a still card.
 */
export function Tilt({ children, className = "", max = 6 }: { children: ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion() || !window.matchMedia("(pointer: fine)").matches) return;
    let frame = 0;

    const move = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5; // -0.5 … 0.5
        const y = (e.clientY - r.top) / r.height - 0.5;
        el.style.setProperty("--tilt-x", `${(-y * max).toFixed(2)}deg`);
        el.style.setProperty("--tilt-y", `${(x * max).toFixed(2)}deg`);
        el.style.setProperty("--glow-x", `${((x + 0.5) * 100).toFixed(1)}%`);
        el.style.setProperty("--glow-y", `${((y + 0.5) * 100).toFixed(1)}%`);
      });
    };
    const leave = () => {
      cancelAnimationFrame(frame);
      el.style.setProperty("--tilt-x", "0deg");
      el.style.setProperty("--tilt-y", "0deg");
    };

    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, [max]);

  return (
    <div ref={ref} className={`tilt ${className}`}>
      {children}
    </div>
  );
}
