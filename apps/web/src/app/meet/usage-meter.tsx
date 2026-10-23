import { hours, type MeetUsage } from "@/lib/meet/types";

/** This month's meeting time as a bar: "62% used · 9.3 of 15 person-hours". Percent and hours only. */
export function UsageMeter({ usage, compact = false }: { usage: MeetUsage; compact?: boolean }) {
  const pct = Math.max(0, usage.percent);
  const over = usage.left <= 0;
  const warn = pct >= 80;
  const bar = over ? "bg-red-500" : warn ? "bg-amber-500" : "bg-brand-600";
  const resets = new Date(usage.resets_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className={`font-medium ${over ? "text-red-700" : warn ? "text-amber-700" : "text-slate-900"}`}>
          {over ? "Meeting time used up" : `${Math.min(pct, 100)}% used`}
        </span>
        <span className="text-slate-500">
          {hours(usage.used)} of {hours(usage.included)} person-hours
        </span>
      </div>
      <div
        className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(pct, 100)}
        aria-label="Meeting time used this month"
      >
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      {!compact && (
        <p className="mt-2 text-xs text-slate-500">
          {usage.topup_left > 0 && `${hours(usage.topup_left)} top-up person-hours left. `}
          {over ? "New meetings start with cameras off (sound and screen sharing still work). " : ""}
          Resets {resets}.
        </p>
      )}
    </div>
  );
}
