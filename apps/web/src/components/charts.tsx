import { cn } from "@/lib/utils";

/*
 * Small charts drawn with plain HTML/SVG (no chart library, nothing extra to download).
 * Colours: chart-1 = active time (violet), chart-2 = idle time (marigold).
 * Every chart has a legend for 2+ series, a hover tooltip and a hidden table for screen readers.
 */

export type Column = {
  key: string;
  label: string; // under the column
  values: number[]; // one per series, stacked from the bottom
  tooltip: string; // shown on hover
  muted?: boolean; // e.g. weekend / holiday
  highlight?: boolean; // e.g. today
};

const SERIES_BG = ["bg-chart-1", "bg-chart-2"];

export function Legend({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className={cn("h-2.5 w-2.5 rounded-sm", i.color)} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** Stacked columns (e.g. active + idle hours per day). `format` labels the y axis. */
export function StackedColumns({
  columns,
  series,
  format,
  height = 180,
  caption,
}: {
  columns: Column[];
  series: string[];
  format: (v: number) => string;
  height?: number;
  caption: string;
}) {
  const max = Math.max(1, ...columns.map((c) => c.values.reduce((a, b) => a + b, 0)));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  return (
    <figure className="space-y-3">
      {series.length > 1 && <Legend items={series.map((s, i) => ({ label: s, color: SERIES_BG[i] }))} />}
      <div className="flex gap-3">
        <div className="relative w-9 shrink-0 text-right text-[11px] text-slate-400 tabular-nums" style={{ height }} aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ bottom: `${(t / top) * 100}%` }}>
              {format(t)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height }}>
            {ticks.map((t) => (
              <div key={t} className="absolute inset-x-0 border-t border-chart-grid" style={{ bottom: `${(t / top) * 100}%` }} aria-hidden />
            ))}
            <div className="absolute inset-0 flex items-end">
              {columns.map((c) => {
                const total = c.values.reduce((a, b) => a + b, 0);
                return (
                  <div key={c.key} className="group relative flex h-full flex-1 items-end justify-center">
                    <div className="flex w-full max-w-6 flex-col-reverse gap-[2px]" style={{ height: `${(total / top) * 100}%` }}>
                      {c.values.map((v, i) =>
                        v > 0 ? (
                          <div
                            key={i}
                            className={cn(SERIES_BG[i], "w-full first:rounded-b-none last:rounded-t-[4px]", c.muted && "opacity-50")}
                            style={{ height: `${(v / total) * 100}%`, minHeight: 2 }}
                          />
                        ) : null,
                      )}
                    </div>
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs whitespace-pre text-slate-50 shadow-lg group-hover:block">
                      {c.tooltip}
                    </div>
                    <div className="absolute inset-0" aria-hidden />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-2 flex">
            {columns.map((c) => (
              <span
                key={c.key}
                className={cn("flex-1 truncate text-center text-[11px]", c.highlight ? "font-semibold text-slate-900" : "text-slate-400")}
              >
                {c.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th>Period</th>
            {series.map((s) => (
              <th key={s}>{s}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {columns.map((c) => (
            <tr key={c.key}>
              <td>{c.label}</td>
              {c.values.map((v, i) => (
                <td key={i}>{format(v)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** A ring showing one share (0–1), e.g. activity %. */
export function Ring({ value, size = 72, label }: { value: number | null; size?: number; label: string }) {
  const r = 15.5;
  const c = 2 * Math.PI * r;
  const v = value === null ? 0 : Math.max(0, Math.min(1, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3.5" className="stroke-slate-100" />
        {value !== null && (
          <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3.5" strokeLinecap="round" className="stroke-chart-1"
                  strokeDasharray={`${v * c} ${c}`} />
        )}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-display text-sm font-semibold text-slate-900 tabular-nums">
        {value === null ? "–" : `${Math.round(v * 100)}%`}
      </span>
    </div>
  );
}

/** Ranked horizontal bars (e.g. time per app). One series, value at the bar end. */
export function BarList({ rows, format }: { rows: Array<{ key: string; label: string; value: number; hint?: string }>; format: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key} className="text-sm">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-slate-700" title={r.hint ?? r.label}>{r.label}</span>
            <span className="shrink-0 text-xs text-slate-500 tabular-nums">{format(r.value)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-chart-1" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** A tiny trend line for stat tiles. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const w = 100;
  const h = 28;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 2 - (v / max) * (h - 4)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn("h-7 w-24", className)} aria-hidden>
      <polyline points={pts} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="stroke-chart-1" />
    </svg>
  );
}

/** Round axis ticks: 0 and 3–4 clean steps covering max. */
function niceTicks(max: number) {
  const rough = max / 3;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? rough;
  const ticks: number[] = [];
  for (let t = 0; t <= max + step * 0.001; t += step) ticks.push(Number(t.toFixed(6)));
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}
