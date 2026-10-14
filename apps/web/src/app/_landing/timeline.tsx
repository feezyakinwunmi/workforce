import { Icon } from "@/components/icons";

/**
 * The hero: the product's own "today, by person" view for a team spread across time zones,
 * with the desktop app's clocked-in card beside it. Static demo data; bars grow in once.
 */
type Row = {
  name: string;
  initials: string;
  city: string;
  local: string;
  status: "Working" | "Idle" | "Not started";
  hours: string;
  blocks: number[]; // % active per 10 minutes over the last 3 hours; 0 = not working
};

const ROWS: Row[] = [
  { name: "Adaeze Okafor", initials: "AO", city: "Lagos", local: "11:40", status: "Working", hours: "3h 10m", blocks: [72, 81, 64, 90, 77, 58, 0, 0, 66, 85, 92, 74, 69, 88, 79, 83, 71, 94] },
  { name: "Tunde Bakare", initials: "TB", city: "Accra", local: "10:40", status: "Idle", hours: "2h 40m", blocks: [0, 0, 55, 61, 48, 70, 66, 52, 44, 63, 38, 22, 47, 59, 61, 30, 26, 18] },
  { name: "Chiamaka Eze", initials: "CE", city: "Nairobi", local: "13:40", status: "Working", hours: "2h 30m", blocks: [84, 79, 91, 88, 0, 0, 0, 0, 73, 80, 86, 77, 90, 82, 75, 87, 81, 89] },
  { name: "Kemi Adeyemi", initials: "KA", city: "Toronto", local: "06:40", status: "Not started", hours: "–", blocks: Array(18).fill(0) },
];

const STATUS: Record<Row["status"], string> = {
  Working: "bg-emerald-50 text-emerald-700",
  Idle: "bg-amber-50 text-amber-700",
  "Not started": "bg-slate-100 text-slate-500",
};
const DOT: Record<Row["status"], string> = { Working: "bg-emerald-500", Idle: "bg-amber-500", "Not started": "bg-slate-300" };

export function HeroProduct() {
  return (
    <div className="relative pb-16 sm:pb-12">
      <figure className="rounded-2xl border border-slate-200 bg-surface shadow-[0_30px_80px_-30px_rgba(21,18,58,0.35)] dark:shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]">
        <figcaption className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
          <span className="font-display font-semibold text-slate-900">Team today</span>
          <span className="flex items-center gap-2 text-xs text-slate-500">
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
            2 working · 1 idle
          </span>
        </figcaption>
        <ul className="divide-y divide-slate-100 px-5">
          {ROWS.map((r, rowIndex) => (
            <li key={r.name} className="grid grid-cols-[2.25rem_1fr_auto] items-center gap-x-3 gap-y-2 py-3.5 sm:grid-cols-[2.25rem_9.5rem_1fr_3.5rem]">
              <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                {r.initials}
                <span className={`absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-surface ${DOT[r.status]}`} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{r.name}</p>
                <p className="flex items-center gap-1.5 text-xs text-slate-500">
                  {r.city} {r.local}
                  <span className={`rounded-full px-1.5 text-[10px] leading-4 font-medium whitespace-nowrap ${STATUS[r.status]}`}>{r.status}</span>
                </p>
              </div>
              <span className="text-right text-xs font-medium text-slate-700 tabular-nums sm:order-last">{r.hours}</span>
              <div className="col-span-3 flex h-10 items-end gap-[3px] sm:col-span-1" aria-hidden>
                {r.blocks.map((pct, i) => (
                  <span key={i} className="flex h-full flex-1 items-end rounded-[3px] bg-slate-100">
                    {pct > 0 && (
                      <span
                        className={`timeline-bar block w-full rounded-[3px] ${pct >= 40 ? "bg-chart-1" : "bg-chart-2"}`}
                        style={{ height: `${Math.max(18, pct)}%`, animationDelay: `${rowIndex * 120 + i * 30}ms` }}
                      />
                    )}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-4 border-t border-slate-200 px-5 py-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-chart-1" aria-hidden />Active</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-chart-2" aria-hidden />Mostly idle</span>
          <span className="ml-auto">Each bar is 10 minutes</span>
        </div>
      </figure>

      {/* The desktop app, clocked in */}
      <div className="absolute right-3 bottom-0 w-56 rounded-2xl border border-slate-200 bg-raised p-4 shadow-2xl sm:-right-4 lg:-right-8" aria-hidden>
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-medium text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Working
          </span>
          <span className="text-slate-400">Desktop app</span>
        </div>
        <p className="mt-2 font-display text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">03:12:44</p>
        <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-slate-500">
          <Icon name="tasks" className="h-3.5 w-3.5" />
          Invoice page redesign
        </p>
        <span className="mt-3 flex w-full items-center justify-center rounded-lg bg-slate-900 py-1.5 text-xs font-semibold text-slate-50">Clock out</span>
      </div>
      <p className="sr-only">
        Example: Adaeze in Lagos and Chiamaka in Nairobi are working with high activity, Tunde in Accra is idle, and Kemi in Toronto has not started.
      </p>
    </div>
  );
}
