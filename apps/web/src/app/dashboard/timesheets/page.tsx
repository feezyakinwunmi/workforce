import type { Metadata } from "next";
import Link from "next/link";
import { FREE_HISTORY_DAYS, hasStandard, historyLimit } from "@/lib/billing";
import { getBilling } from "@/lib/billing-server";
import { requireMember } from "@/lib/session";
import { isAdminRole } from "@/lib/types";
import { addDays, formatDay, formatHours, localDateIn, percent } from "@/lib/time";
import { buildTimesheet } from "@/lib/timesheet";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Timesheets" };

export default async function TimesheetsPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week: weekParam } = await searchParams;
  const { supabase, member: me } = await requireMember();
  const { week, days, rows, holidays } = await buildTimesheet(supabase, me, weekParam);

  const today = localDateIn(me.timezone);
  const dayTotals = days.map((_, i) => rows.reduce((s, r) => s + r.days[i].tracked, 0));
  const grand = rows.reduce((s, r) => s + r.total, 0);
  const grandActive = rows.reduce((s, r) => s + r.active, 0);
  const isCurrentWeek = days.includes(today);
  const billing = await getBilling();
  const standard = hasStandard(billing);
  const oldest = historyLimit(billing, today);
  const locked = Boolean(oldest && days[6] < oldest);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Timesheets</h1>
          <p className="mt-1 text-slate-600">
            Week of {formatDay(days[0], { day: "numeric", month: "long" })} to{" "}
            {formatDay(days[6], { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="btn-secondary" href={`/dashboard/timesheets?week=${addDays(week, -7)}`}>← Previous</Link>
          {!isCurrentWeek && <Link className="btn-secondary" href="/dashboard/timesheets">This week</Link>}
          <Link className="btn-secondary" href={`/dashboard/timesheets?week=${addDays(week, 7)}`}>Next →</Link>
          {standard ? (
            <a className="btn-primary" href={`/dashboard/timesheets/export?week=${week}`}>Download CSV</a>
          ) : (
            <span className="btn-secondary cursor-not-allowed opacity-60" title="CSV downloads are part of the Standard plan">Download CSV · Standard</span>
          )}
        </div>
      </header>

      {locked ? (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-brand-200 bg-brand-50 p-5 text-sm text-brand-900">
          <p>The Free plan shows the last {FREE_HISTORY_DAYS} days. Older weeks are kept safe and appear again on Standard.</p>
          {isAdminRole(me.role) && <Link href="/dashboard/billing" className="btn-primary btn-sm">See plans</Link>}
        </section>
      ) : (
      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Member</th>
                {days.map((d) => (
                  <th key={d} className={cn("px-3 py-3 text-right font-medium", d === today && "text-brand-700")}>
                    {formatDay(d)}
                    {holidays.has(d) && (
                      <span className="block text-[10px] font-normal normal-case tracking-normal text-emerald-700" title={holidays.get(d)}>
                        Holiday
                      </span>
                    )}
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 text-right font-medium">Activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-slate-500">No one to show.</td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.userId} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link className="font-medium hover:text-brand-700" href={`/dashboard/activity?user=${r.userId}`}>
                      {r.name}
                    </Link>
                    <p className="text-xs text-slate-400">{r.timezone.replaceAll("_", " ")}</p>
                  </td>
                  {r.days.map((c) => (
                    <td key={c.date} className="px-3 py-3 text-right tabular-nums">
                      {c.tracked ? (
                        <Link
                          className="text-slate-700 hover:text-brand-700"
                          href={`/dashboard/activity?user=${r.userId}&date=${c.date}`}
                        >
                          {formatHours(c.tracked)}
                        </Link>
                      ) : c.leave ? (
                        <span className="badge bg-sky-50 text-sky-700" title={c.leave}>Leave</span>
                      ) : (
                        <span className="text-slate-300">–</span>
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatHours(r.total)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">{percent(r.active, r.total)}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 1 && (
              <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold">
                <tr>
                  <td className="px-4 py-3">All</td>
                  {dayTotals.map((t, i) => (
                    <td key={days[i]} className="px-3 py-3 text-right tabular-nums">{t ? formatHours(t) : "–"}</td>
                  ))}
                  <td className="px-4 py-3 text-right tabular-nums">{formatHours(grand)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{percent(grandActive, grand)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
      )}

      <p className="text-xs text-slate-500">
        Hours are time clocked in with the desktop app, minus idle time the worker chose to remove. Each person&apos;s
        days follow their own time zone. Activity is the share of that time with keyboard or mouse use. &ldquo;Leave&rdquo;
        marks approved leave; public holidays are marked in the header.
      </p>
    </div>
  );
}
