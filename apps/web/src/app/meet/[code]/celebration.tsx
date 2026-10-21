"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { playCelebration, type CelebrationStyle } from "@/lib/meet/celebration-sound";
import type { Participant, Shoutout } from "@/lib/meet/types";
import { cn } from "@/lib/utils";
import { avatarColour, initialsOf, VideoView } from "./meeting";

export const STYLES: Array<{ id: CelebrationStyle; icon: IconName; label: string; heading: string; hint: string }> = [
  { id: "shoutout", icon: "megaphone", label: "Shout-out", heading: "Shout-out to", hint: "For being amazing today" },
  { id: "birthday", icon: "cake", label: "Birthday", heading: "Happy birthday", hint: "Many happy returns!" },
  { id: "welldone", icon: "trophy", label: "Well done", heading: "Well done", hint: "Closed the deal this week" },
  { id: "welcome", icon: "userPlus", label: "Welcome", heading: "Welcome to the team", hint: "So glad you're here" },
];
const SHOW_MS = 7000;
const COLOURS = ["#6a4cf5", "#8f7bff", "#f2a93b", "#ffd166", "#ff6b9a", "#34d399", "#38bdf8", "#ffffff"];

/** Confetti on a canvas: bursts from both bottom corners, then rains down. */
function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = (c.width = window.innerWidth * dpr);
    const H = (c.height = window.innerHeight * dpr);
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const n = calm ? 40 : window.innerWidth < 640 ? 110 : 200;
    const parts = Array.from({ length: n }, (_, i) => {
      const left = i % 2 === 0;
      const rain = i > n * 0.6;
      return {
        x: rain ? Math.random() * W : left ? -10 : W + 10,
        y: rain ? -Math.random() * H * 0.6 : H * (0.75 + Math.random() * 0.2),
        vx: rain ? (Math.random() - 0.5) * 2 * dpr : (left ? 1 : -1) * (6 + Math.random() * 9) * dpr,
        vy: rain ? (2 + Math.random() * 2) * dpr : -(12 + Math.random() * 10) * dpr,
        r: (4 + Math.random() * 6) * dpr,
        a: Math.random() * Math.PI,
        va: (Math.random() - 0.5) * 0.3,
        colour: COLOURS[i % COLOURS.length],
        round: Math.random() < 0.3,
      };
    });
    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      const t = now - start;
      g.clearRect(0, 0, W, H);
      g.globalAlpha = t > SHOW_MS - 1200 ? Math.max(0, (SHOW_MS - t) / 1200) : 1;
      for (const p of parts) {
        p.vy += 0.28 * dpr;
        p.vx *= 0.985;
        p.vy = Math.min(p.vy, 5 * dpr);
        p.x += p.vx + Math.sin((t + p.r * 50) / 300) * 0.6 * dpr;
        p.y += p.vy;
        p.a += p.va;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.a);
        g.fillStyle = p.colour;
        if (p.round) {
          g.beginPath();
          g.arc(0, 0, p.r * 0.5, 0, Math.PI * 2);
          g.fill();
        } else g.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2 + Math.abs(Math.sin(p.a)) * p.r * 0.6);
        g.restore();
      }
      if (t < SHOW_MS) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 h-full w-full" aria-hidden />;
}

/**
 * The celebration everyone sees: confetti, the person's live camera (or initials) in a glowing
 * ring, their name, and claps + cheering. Doesn't block the meeting (clicks pass through).
 */
export function Celebration({ shout, person, video, from, muted, onMute, onDone }: {
  shout: Shoutout;
  person: Participant | null;
  video: MediaStreamTrack | null;
  from: string;
  muted: boolean;
  onMute: (m: boolean) => void;
  onDone: () => void;
}) {
  const style = STYLES.find((s) => s.id === shout.style) ?? STYLES[0];
  const stopSound = useRef<() => void>(() => {});
  useEffect(() => {
    if (!muted) stopSound.current = playCelebration(style.id);
    const t = setTimeout(onDone, SHOW_MS);
    return () => {
      clearTimeout(t);
      stopSound.current();
    };
    // Once per shout-out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shout.id]);

  const colour = person ? avatarColour(person.user_id) : "#6a4cf5";
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center p-4" role="status" aria-live="polite">
      <style>{`
@keyframes cel-pop{0%{transform:scale(.4) translateY(30px);opacity:0}60%{transform:scale(1.06);opacity:1}100%{transform:scale(1)}}
@keyframes cel-spin{to{transform:rotate(360deg)}}
@keyframes cel-shine{0%{background-position:0% 50%}100%{background-position:200% 50%}}
@keyframes cel-out{to{opacity:0;transform:scale(.92)}}
@media (prefers-reduced-motion: reduce){.cel-anim{animation:none!important}}`}</style>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(106,76,245,.45),rgba(12,10,39,.55)_60%)]" />
      <Confetti />
      <div
        className="cel-anim relative flex max-w-md flex-col items-center text-center"
        style={{ animation: `cel-pop .7s cubic-bezier(.2,1.4,.4,1) both, cel-out .6s ease-in ${SHOW_MS - 600}ms forwards` }}
      >
        <div className="relative mb-5 h-40 w-40 sm:h-48 sm:w-48">
          <div className="cel-anim absolute -inset-2 rounded-full bg-[conic-gradient(#f2a93b,#ff6b9a,#8f7bff,#38bdf8,#34d399,#f2a93b)] blur-[2px]" style={{ animation: "cel-spin 2.4s linear infinite" }} />
          <div className="absolute inset-0 overflow-hidden rounded-full bg-[#1d1a4a] ring-4 ring-[#0c0a27]">
            {video ? (
              <VideoView track={video} className="h-full w-full" />
            ) : (
              <span className="flex h-full w-full items-center justify-center font-display text-5xl font-bold" style={{ background: colour }}>
                {initialsOf(shout.name)}
              </span>
            )}
          </div>
          <span className="absolute -right-1 -bottom-1 flex h-14 w-14 items-center justify-center rounded-full bg-[#f2a93b] text-[#15123a] ring-4 ring-[#0c0a27]">
            <Icon name={style.icon} className="h-7 w-7" />
          </span>
        </div>
        <p className="text-sm font-semibold tracking-[0.2em] text-[#f2c27a] uppercase drop-shadow">{style.heading}</p>
        <p
          className="cel-anim mt-1 bg-[linear-gradient(90deg,#fff,#f2a93b,#ffd166,#fff,#f2a93b)] bg-[length:200%_100%] bg-clip-text font-display text-4xl leading-tight font-bold break-words text-transparent drop-shadow-[0_4px_24px_rgba(242,169,59,.35)] sm:text-6xl"
          style={{ animation: "cel-shine 2s linear infinite" }}
        >
          {shout.name}
        </p>
        {shout.message && <p className="mt-3 max-w-sm rounded-2xl bg-black/35 px-4 py-2 text-base text-white/95 backdrop-blur">“{shout.message}”</p>}
        <p className="mt-3 text-xs text-white/70">from {from}</p>
        <div className="pointer-events-auto mt-4 flex gap-2">
          <button onClick={() => { stopSound.current(); onMute(!muted); }} className="flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-xs text-white/85 backdrop-blur hover:bg-black/60">
            <Icon name={muted ? "speaker" : "micOff"} className="h-3.5 w-3.5" />
            {muted ? "Sound on for celebrations" : "Mute celebrations"}
          </button>
          <button onClick={onDone} className="rounded-full bg-black/40 px-3 py-1.5 text-xs text-white/85 backdrop-blur hover:bg-black/60">Close</button>
        </div>
      </div>
    </div>
  );
}

/** Host / co-host: choose who to celebrate. */
export function ShoutoutDialog({ people, meId, initial, onSend, onClose }: {
  people: Participant[];
  meId: string;
  initial?: string | null;
  onSend: (v: { target: string | null; name: string; style: CelebrationStyle; message: string }) => Promise<string | null>;
  onClose: () => void;
}) {
  const [target, setTarget] = useState<string | null>(initial ?? null);
  const [typed, setTyped] = useState("");
  const [style, setStyle] = useState<CelebrationStyle>("shoutout");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = target ? people.find((p) => p.id === target)?.display_name ?? "" : typed.trim();
  const hint = STYLES.find((s) => s.id === style)!.hint;

  const send = async () => {
    if (!name) return setError("Pick someone or type a name.");
    setBusy(true);
    setError(null);
    const err = await onSend({ target, name, style, message: message.trim() });
    setBusy(false);
    if (err) setError(err);
    else onClose();
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-[#1a1745] p-5 shadow-2xl ring-1 ring-white/10 sm:rounded-3xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="shout-title">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="shout-title" className="flex items-center gap-2.5 font-display text-xl font-bold">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f2a93b] text-[#15123a]"><Icon name="party" className="h-5 w-5" /></span>
            Celebrate someone
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-white/70 hover:bg-white/10" aria-label="Close"><Icon name="x" className="h-5 w-5" /></button>
        </div>

        <p className="mb-2 text-xs text-white/60">Who?</p>
        <div className="mb-3 flex max-h-40 flex-wrap gap-2 overflow-y-auto">
          {people.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { setTarget(p.id); setTyped(""); }}
              aria-pressed={target === p.id}
              className={cn("flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm transition", target === p.id ? "bg-[#6a4cf5] ring-2 ring-[#f2a93b]" : "bg-white/[0.07] hover:bg-white/[0.12]")}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold" style={{ background: avatarColour(p.user_id) }}>{initialsOf(p.display_name)}</span>
              {p.id === meId ? `${p.display_name} (you)` : p.display_name}
            </button>
          ))}
        </div>
        <input
          className="mb-4 w-full rounded-xl border border-white/15 bg-[#0f0d2e] px-3 py-2.5 text-sm placeholder:text-white/35 focus:border-[#8f7bff] focus:outline-none"
          placeholder="…or type a name (someone not in the call)"
          value={typed}
          maxLength={60}
          onChange={(e) => { setTyped(e.target.value); setTarget(null); }}
        />

        <p className="mb-2 text-xs text-white/60">What for?</p>
        <div className="mb-4 grid grid-cols-2 gap-2">
          {STYLES.map((s) => (
            <button key={s.id} type="button" onClick={() => setStyle(s.id)} aria-pressed={style === s.id}
              className={cn("flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition", style === s.id ? "bg-[#6a4cf5] ring-2 ring-[#f2a93b]" : "bg-white/[0.07] hover:bg-white/[0.12]")}>
              <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", style === s.id ? "bg-white/20" : "bg-white/[0.08] text-[#f2c27a]")}>
                <Icon name={s.icon} className="h-[18px] w-[18px]" />
              </span>
              {s.label}
            </button>
          ))}
        </div>

        <input
          className="mb-4 w-full rounded-xl border border-white/15 bg-[#0f0d2e] px-3 py-2.5 text-sm placeholder:text-white/35 focus:border-[#8f7bff] focus:outline-none"
          placeholder={`A short line (optional), e.g. “${hint}”`}
          value={message}
          maxLength={120}
          onChange={(e) => setMessage(e.target.value)}
        />
        {error && <p className="mb-3 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200" role="alert">{error}</p>}
        <button onClick={() => void send()} disabled={busy || !name} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#f2a93b] py-3 font-semibold text-[#15123a] transition hover:bg-[#ffb94f] disabled:opacity-50">
          <Icon name="party" className="h-5 w-5" />
          {busy ? "Sending…" : name ? `Celebrate ${name}` : "Celebrate"}
        </button>
        <p className="mt-2 text-center text-xs text-white/45">Everyone in the call sees it, with confetti and applause.</p>
      </div>
    </div>
  );
}
