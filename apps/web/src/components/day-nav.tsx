"use client";

import Link from "next/link";
import { useRef } from "react";
import { Icon } from "@/components/icons";

/** Person + day picker for day views. Changing either one loads it straight away. */
export function DayNav({
  action,
  people,
  user,
  date,
  max,
  prevHref,
  nextHref,
  dateName = "date",
  dateType = "date",
}: {
  action: string;
  people: Array<{ id: string; name: string }>;
  user: string;
  date: string;
  max: string;
  prevHref: string;
  nextHref: string | null;
  dateName?: string;
  dateType?: "date" | "month";
}) {
  const form = useRef<HTMLFormElement>(null);
  const submit = () => form.current?.requestSubmit();
  return (
    <form ref={form} action={action} className="flex flex-wrap items-center gap-2">
      {people.length > 1 ? (
        <label className="relative">
          <span className="sr-only">Person</span>
          <select name="user" defaultValue={user} onChange={submit} className="input w-auto appearance-none py-1.5 pr-8 font-medium">
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <Icon name="chevronDown" className="pointer-events-none absolute top-1/2 right-2.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
        </label>
      ) : (
        user && <input type="hidden" name="user" value={user} />
      )}
      <div className="flex items-center rounded-lg border border-slate-300 bg-surface">
        <Link href={prevHref} className="flex h-8 w-8 items-center justify-center text-slate-500 hover:text-slate-900" aria-label="Previous">
          <Icon name="chevronLeft" className="h-4 w-4" />
        </Link>
        <input
          type={dateType}
          name={dateName}
          defaultValue={date}
          max={max}
          onChange={submit}
          aria-label="Date"
          className="h-8 border-x border-slate-200 bg-transparent px-2 text-sm text-slate-800 focus:outline-none"
        />
        {nextHref ? (
          <Link href={nextHref} className="flex h-8 w-8 items-center justify-center text-slate-500 hover:text-slate-900" aria-label="Next">
            <Icon name="chevronRight" className="h-4 w-4" />
          </Link>
        ) : (
          <span className="flex h-8 w-8 items-center justify-center text-slate-300" aria-hidden>
            <Icon name="chevronRight" className="h-4 w-4" />
          </span>
        )}
      </div>
      <noscript><button className="btn-secondary">Show</button></noscript>
    </form>
  );
}
