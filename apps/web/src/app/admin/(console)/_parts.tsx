// Small pieces shared by the console tabs (server components).
import Link from "next/link";
import type { Column } from "@/components/charts";
import { cn } from "@/lib/utils";

export const n = (v: number) => new Intl.NumberFormat("en-NG").format(v);
/** Axis labels for counts: whole numbers only. */
export const whole = (v: number) => (Number.isInteger(v) ? n(v) : "");
export const sum = (o: Record<string, number> | undefined) => Object.values(o ?? {}).reduce((a, b) => a + b, 0);
/** ₦ on chart axes: ₦0, ₦5k, ₦1.2m (from kobo). */
export const nairaShort = (kobo: number) => {
  const v = kobo / 100;
  return v >= 1_000_000 ? `₦${+(v / 1_000_000).toFixed(1)}m` : v >= 1000 ? `₦${+(v / 1000).toFixed(1)}k` : `₦${Math.round(v)}`;
};
export const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "–");
export const plural = (v: number, one: string, many = `${one}s`) => `${n(v)} ${v === 1 ? one : many}`;

const dayLabel = (day: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));

/** One column per day for StackedColumns; a date label every week (every 2 weeks on 90 days). */
export function dayColumns<T extends { day: string }>(daily: T[], pick: (d: T) => number, tip: (d: T, v: number) => string): Column[] {
  const step = daily.length > 45 ? 14 : 7;
  return daily.map((d, i) => {
    const v = pick(d);
    const label = dayLabel(d.day);
    return { key: d.day, label: (daily.length - 1 - i) % step === 0 ? label : "", values: [v], tooltip: `${label}\n${tip(d, v)}`, highlight: i === daily.length - 1 };
  });
}

/** 30 / 90 days switch, kept on the same tab. */
export function RangeSwitch({ href, days, extra = "" }: { href: string; days: number; extra?: string }) {
  return (
    <div className="flex rounded-lg border border-slate-200 bg-surface p-0.5 text-sm">
      {[30, 90].map((d) => (
        <Link
          key={d}
          href={`${href || "/"}${d === 30 ? (extra ? `?${extra}` : "") : `?days=90${extra ? `&${extra}` : ""}`}`}
          className={cn("rounded-md px-3 py-1", days === d ? "bg-brand-600 text-white" : "text-slate-600 hover:text-slate-900")}
        >
          {d} days
        </Link>
      ))}
    </div>
  );
}

export const daysParam = (v: string | undefined) => (v === "90" ? 90 : 30);

/** A plain table inside a Panel. */
export function Table({ head, children, empty }: { head: React.ReactNode[]; children: React.ReactNode; empty?: string }) {
  const rows = Array.isArray(children) ? children.length : children ? 1 : 0;
  if (!rows && empty) return <p className="px-5 py-6 text-sm text-slate-500">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="table-head">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-5 py-2.5 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export const td = "px-5 py-2.5";
