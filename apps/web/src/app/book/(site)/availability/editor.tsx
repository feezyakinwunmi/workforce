"use client";

import { useActionState, useState, useTransition } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import { WEEKDAYS } from "@/lib/book/types";
import type { FormState } from "@/lib/types";
import { addDayOff, saveHours } from "../actions";

type Range = { start: string; end: string };
const toTime = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};
const ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first

export function HoursEditor({ initial }: { initial: Array<{ weekday: number; start_min: number; end_min: number }> }) {
  const [days, setDays] = useState<Record<number, Range[]>>(() => {
    const d: Record<number, Range[]> = {};
    for (const h of initial) (d[h.weekday] ??= []).push({ start: toTime(h.start_min), end: h.end_min === 1440 ? "23:59" : toTime(h.end_min) });
    return d;
  });
  const [state, setState] = useState<FormState>(undefined);
  const [pending, start] = useTransition();

  const set = (wd: number, ranges: Range[]) => setDays((d) => ({ ...d, [wd]: ranges }));

  function save() {
    const hours = Object.entries(days).flatMap(([wd, ranges]) =>
      ranges.map((r) => ({ weekday: Number(wd), start_min: toMin(r.start), end_min: r.end === "23:59" ? 1440 : toMin(r.end) })),
    );
    if (hours.some((h) => h.end_min <= h.start_min)) {
      setState({ error: "Each time range must end after it starts." });
      return;
    }
    start(async () => setState(await saveHours(hours)));
  }

  return (
    <div className="space-y-3">
      {ORDER.map((wd) => {
        const ranges = days[wd] ?? [];
        const on = ranges.length > 0;
        return (
          <div key={wd} className="flex flex-col gap-2 border-b border-slate-100 pb-3 last:border-0 sm:flex-row sm:items-start">
            <label className="flex w-36 shrink-0 items-center gap-2 pt-2 text-sm font-medium text-slate-800">
              <input type="checkbox" checked={on} onChange={(e) => set(wd, e.target.checked ? [{ start: "09:00", end: "17:00" }] : [])} />
              {WEEKDAYS[wd]}
            </label>
            <div className="flex-1 space-y-2">
              {!on && <p className="pt-2 text-sm text-slate-400">Closed</p>}
              {ranges.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="time" step={900} value={r.start} aria-label={`${WEEKDAYS[wd]} from`} className="input w-32" onChange={(e) => set(wd, ranges.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
                  <span className="text-slate-400">–</span>
                  <input type="time" step={900} value={r.end} aria-label={`${WEEKDAYS[wd]} until`} className="input w-32" onChange={(e) => set(wd, ranges.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
                  <button type="button" className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900" aria-label="Remove these hours" onClick={() => set(wd, ranges.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
              {on && (
                <button type="button" className="text-sm font-medium text-brand-700 hover:underline" onClick={() => set(wd, [...ranges, { start: "14:00", end: "17:00" }])}>
                  + Add hours (e.g. after a break)
                </button>
              )}
            </div>
          </div>
        );
      })}
      <FormMessage state={state} />
      <button type="button" className="btn-primary" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save hours"}</button>
    </div>
  );
}

export function DayOffForm({ min }: { min: string }) {
  const [state, action] = useActionState(addDayOff, undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className="block">
        <span className="label">From</span>
        <input type="date" name="from" min={min} required className="input" />
      </label>
      <label className="block">
        <span className="label">Until (optional)</span>
        <input type="date" name="to" min={min} className="input" />
      </label>
      <SubmitButton className="btn-secondary" pendingText="Adding…">Add days off</SubmitButton>
      <div className="w-full"><FormMessage state={state} /></div>
    </form>
  );
}
