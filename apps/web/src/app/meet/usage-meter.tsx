import { hours } from "@/lib/meet/types";

/** A usage bar: "62% used · 9.3 of 15 hours". Percent and hours only, never costs. */
export function UsageMeter({ used, included, unit, label, compact = false, note }: { used: number; included: number; unit: string; label?: string; compact?: boolean; note?: string }) {
  const pct = included > 0 ? Math.round((100 * used) / included) : 0;
  const over = included > 0 && used >= included;
  const warn = pct >= 80;
  const bar = over ? "bg-red-500" : warn ? "bg-amber-500" : "bg-brand-600";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className={`font-medium ${over ? "text-red-700" : warn ? "text-amber-700" : "text-slate-900"}`}>
          {label ? `${label} · ` : ""}
          {over ? "Used up" : `${Math.min(pct, 100)}% used`}
        </span>
        <span className="text-slate-500">
          {hours(used)} of {hours(included)} {unit}
        </span>
      </div>
      <div
        className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(pct, 100)}
        aria-label={label ?? "Used this month"}
      >
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      {!compact && note && <p className="mt-2 text-xs text-slate-500">{note}</p>}
    </div>
  );
}
