"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { phoneClock, phoneClockOut } from "./actions";

type Props = {
  state: "out" | "phone" | "desktop";
  startedAt: string | null;
  todaySeconds: number; // finished time today (not counting the running phone session)
  location: "off" | "ask" | "required";
  canTrack: boolean;
  tasks: Array<{ id: string; title: string; status: string; project_name: string | null; due_date: string | null }>;
};

const two = (n: number) => String(n).padStart(2, "0");
const elapsed = (s: number) => `${Math.floor(s / 3600)}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`;
const hours = (s: number) => `${Math.floor(s / 3600)}h ${two(Math.floor((s % 3600) / 60))}m`;

function position(timeoutMs = 12000): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    ),
  );
}

export function ClockPanel({ state, startedAt, todaySeconds, location, canTrack, tasks }: Props) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [finishing, setFinishing] = useState(false); // the "What did you get done?" step
  const [summary, setSummary] = useState("");
  const [done, setDone] = useState<string[]>([]);
  const running = state === "phone" && startedAt;

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const runningSeconds = running ? Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000)) : 0;

  function go(action: "in" | "out", report?: { summary: string; doneTaskIds: string[] }) {
    setError(null);
    start(async () => {
      let place = null;
      if (location !== "off") {
        setStep("Getting your location…");
        place = await position();
        if (!place && location === "required") {
          setStep(null);
          setError("Your company needs your location. Allow location for this site in your browser settings, then try again.");
          return;
        }
      }
      setStep(action === "in" ? "Clocking in…" : "Clocking out…");
      const res = action === "out" && report ? await phoneClockOut(report, place) : await phoneClock(action, place);
      setStep(null);
      if (res.error) setError(res.error);
      else {
        setFinishing(false);
        setSummary("");
        setDone([]);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div
        className={cn(
          "flex h-56 w-56 flex-col items-center justify-center rounded-full border-8 transition-colors",
          running ? "border-emerald-100 bg-emerald-50" : state === "desktop" ? "border-brand-100 bg-brand-50" : "border-slate-100 bg-surface",
        )}
      >
        {running ? (
          <>
            <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" aria-hidden />
              Clocked in
            </span>
            <span className="mt-1 font-display text-5xl font-semibold tracking-tight text-slate-900 tabular-nums" aria-live="off">
              {elapsed(runningSeconds)}
            </span>
          </>
        ) : state === "desktop" ? (
          <>
            <Icon name="monitor" className="h-8 w-8 text-brand-600" />
            <span className="mt-2 px-6 text-sm font-medium text-slate-700">Clocked in on your computer</span>
          </>
        ) : (
          <>
            <span className="text-sm text-slate-500">Today</span>
            <span className="mt-1 font-display text-4xl font-semibold tracking-tight text-slate-900 tabular-nums">{hours(todaySeconds)}</span>
          </>
        )}
      </div>

      {state === "desktop" ? (
        <p className="max-w-xs text-sm text-slate-500">Clock out in the desktop app to clock in here.</p>
      ) : running && finishing ? (
        <form
          className="card w-full max-w-sm space-y-4 p-4 text-left"
          onSubmit={(e) => {
            e.preventDefault();
            go("out", { summary, doneTaskIds: done });
          }}
        >
          <div>
            <label htmlFor="summary" className="label">What did you get done?</label>
            <textarea
              id="summary"
              rows={4}
              maxLength={5000}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="input"
              placeholder="Visited 3 clients in Ikeja, collected the signed forms…"
              autoFocus
            />
          </div>
          {tasks.length > 0 && (
            <fieldset>
              <legend className="label">Mark tasks as done</legend>
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {tasks.map((t) => (
                  <li key={t.id}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 accent-emerald-600"
                        checked={done.includes(t.id)}
                        onChange={(e) => setDone((d) => (e.target.checked ? [...d, t.id] : d.filter((x) => x !== t.id)))}
                      />
                      <span className="min-w-0 text-sm">
                        <span className={cn("block text-slate-900", done.includes(t.id) && "text-slate-400 line-through")}>{t.title}</span>
                        {(t.project_name || t.status === "in_progress") && (
                          <span className="block text-xs text-slate-500">
                            {[t.project_name, t.status === "in_progress" ? "In progress" : null].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-semibold text-white disabled:opacity-60 dark:bg-brand-600"
            >
              <Icon name="logout" className="h-4 w-4" />
              {pending ? (step ?? "Please wait…") : "Clock out"}
            </button>
            <button type="button" className="btn-secondary h-12" disabled={pending} onClick={() => setFinishing(false)}>
              Keep working
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => (running ? setFinishing(true) : go("in"))}
          disabled={pending || (!running && !canTrack)}
          className={cn(
            "inline-flex h-14 w-full max-w-xs items-center justify-center gap-2 rounded-2xl text-base font-semibold text-white shadow-lg transition disabled:opacity-60",
            running ? "bg-slate-900 shadow-slate-900/20 hover:bg-slate-800 dark:bg-brand-600 dark:hover:bg-[#7a5ffa]" : "bg-brand-600 shadow-brand-600/30 hover:bg-[#5638d9]",
          )}
        >
          <Icon name={running ? "logout" : "play"} className="h-5 w-5" />
          {pending ? (step ?? "Please wait…") : running ? "Clock out" : "Clock in"}
        </button>
      )}

      {running && <p className="text-sm text-slate-500">Today so far: {hours(todaySeconds + runningSeconds)}</p>}

      {error && (
        <p role="alert" className="flex max-w-sm items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left text-sm text-red-700">
          <Icon name="alert" className="mt-0.5 h-4 w-4" />
          {error}
        </p>
      )}

      {location !== "off" && state !== "desktop" && (
        <p className="flex max-w-xs items-start gap-1.5 text-xs text-slate-500">
          <Icon name="pin" className="h-3.5 w-3.5 shrink-0" />
          {location === "required" ? "Your company asks for" : "With your permission, we save"} your location when you clock in and out. Never in between.
        </p>
      )}
    </div>
  );
}

type InstallEvent = Event & { prompt: () => Promise<void> };

/** "Add to home screen": the browser's install prompt where it exists, a tip on iPhone. */
export function InstallHint() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(true);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    // Reading the browser environment once on mount (not available during server render).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInstalled(standalone);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (installed || (!prompt && !ios)) return null;
  return (
    <div className="card flex items-center gap-3 px-4 py-3 text-left text-sm">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:text-brand-700">
        <Icon name="phone" />
      </span>
      {prompt ? (
        <>
          <span className="flex-1 text-slate-600">Put Workbase on your home screen.</span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => prompt.prompt().then(() => setPrompt(null))}>
            Install
          </button>
        </>
      ) : (
        <span className="flex-1 text-slate-600">
          To put Workbase on your home screen, tap <strong className="text-slate-900">Share</strong>, then <strong className="text-slate-900">Add to Home Screen</strong>.
        </span>
      )}
    </div>
  );
}
