"use client";

/**
 * The parent site's hero: one stage that shows each product in turn.
 *
 *  - Four tabs (Workbase, Meet, Book, Forms). A thin bar under the active tab fills over
 *    STAGE_MS; when it's full the stage moves to the next product.
 *  - Hovering or focusing the stage pauses it, and so does scrolling it off screen.
 *  - Clicking a tab or using the arrow keys picks a product (proper ARIA tabs).
 *  - The screen for the picked product opens with a short clip/scale animation (.screen-in).
 */

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { LogoMark, type Product } from "@/components/logo";
import { Icon } from "@/components/icons";
import { BookScreen, FormsScreen, MeetScreen, WorkbaseScreen } from "./screens";

const STAGE_MS = 6000;

export type StageItem = {
  product: Product;
  name: string;
  line: string;
  href: string;
  /** What a screen reader hears instead of the picture. */
  describe: string;
};

const SCREENS: Record<Product, () => React.ReactElement> = {
  workbase: WorkbaseScreen,
  meet: MeetScreen,
  book: BookScreen,
  forms: FormsScreen,
};

export function ProductStage({ items }: { items: StageItem[] }) {
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [offscreen, setOffscreen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Pause while the stage is scrolled out of view (no point animating what nobody sees).
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setOffscreen(!e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const paused = hovered || offscreen;
  const next = () => setActive((a) => (a + 1) % items.length);

  // Arrow keys move between tabs (and focus follows), Home/End jump to the ends.
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = items.length - 1;
    let to = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") to = active === last ? 0 : active + 1;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") to = active === 0 ? last : active - 1;
    if (e.key === "Home") to = 0;
    if (e.key === "End") to = last;
    if (to < 0) return;
    e.preventDefault();
    setActive(to);
    tabRefs.current[to]?.focus();
  };

  const item = items[active];
  const Screen = SCREENS[item.product];

  return (
    <div
      ref={rootRef}
      className={`grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-10 ${paused ? "stage-paused" : ""}`}
      style={{ "--stage-ms": `${STAGE_MS}ms` } as CSSProperties}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setHovered(false);
      }}
    >
      {/* Tabs: a row you can swipe on phones, a column on large screens. */}
      <div
        role="tablist"
        aria-label="Workbase products"
        aria-orientation="vertical"
        onKeyDown={onKey}
        className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 lg:flex-col lg:gap-1 lg:overflow-visible"
      >
        {items.map((it, i) => {
          const on = i === active;
          return (
            <button
              key={it.product}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              role="tab"
              id={`stage-tab-${it.product}`}
              aria-selected={on}
              aria-controls="stage-panel"
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(i)}
              className={`group relative flex min-w-[13.5rem] shrink-0 snap-start items-center gap-3 overflow-hidden rounded-2xl px-4 py-3.5 text-left transition-colors duration-300 lg:min-w-0 ${
                on ? "bg-surface shadow-[0_10px_30px_-18px_rgba(21,18,58,0.45)] ring-1 ring-slate-200" : "hover:bg-surface/60"
              }`}
            >
              <LogoMark
                tile
                product={it.product}
                className={`h-10 w-10 shrink-0 transition duration-500 ${on ? "scale-100" : "scale-90 opacity-60 grayscale group-hover:scale-95 group-hover:opacity-90 group-hover:grayscale-0"}`}
              />
              <span className="min-w-0">
                <span className={`block font-display text-[1.05rem] font-semibold transition-colors ${on ? "text-slate-900" : "text-slate-500 group-hover:text-slate-800"}`}>
                  {it.name}
                </span>
                <span className="block truncate text-sm text-slate-500">{it.line}</span>
              </span>
              {/* Fills while this product is on stage; when full, the next one comes on. */}
              {on && (
                <span className="absolute inset-x-4 bottom-0 h-[2px] overflow-hidden rounded-full bg-slate-100">
                  <span key={active} className="stage-progress block h-full bg-brand-600" onAnimationEnd={next} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* The stage itself. key={product} replays the opening animation for each product. */}
      <div id="stage-panel" role="tabpanel" aria-labelledby={`stage-tab-${item.product}`} className="relative">
        <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[2.5rem] bg-[radial-gradient(60%_60%_at_70%_30%,rgba(106,76,245,0.16),transparent_70%)]" aria-hidden />
        <div key={item.product} className="screen-in overflow-visible">
          <div className="relative h-[23rem] overflow-hidden rounded-[1.25rem] border border-slate-200 bg-surface shadow-[0_40px_90px_-40px_rgba(21,18,58,0.5)] sm:h-[22rem] dark:shadow-[0_40px_90px_-40px_rgba(0,0,0,0.9)]">
            <Screen />
          </div>
        </div>
        <p className="sr-only">{item.describe}</p>
        <a href={item.href} className="arrow-link mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          Open {item.name}
          <Icon name="arrowRight" className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}
