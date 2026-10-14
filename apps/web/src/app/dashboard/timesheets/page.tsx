import type { Metadata } from "next";
import Link from "next/link";
import { FREE_HISTORY_DAYS, hasStandard, historyLimit } from "@/lib/billing";
import { getBilling } from "@/lib/billing-server";
import { requireMember } from "@/lib/session";
import { isAdminRole } from "@/lib/types";
import { addDays, formatDay, formatHours, localDateIn, percent } from "@/lib/time";
import { buildTimesheet } from "@/lib/timesheet";
import { StackedColumns, type Column } from "@/components/charts";
import { Icon } from "@/components/icons";
import { Avatar, EmptyState, Notice, PageHeader, Panel, StatStrip } from "@/components/ui";
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
  const dayActive = days.map((_, i) => rows.reduce((s, r) => s + r.days[i].active, 0));
  const columns: Column[] = days.map((d, i) => ({
    key: d,
    label: formatDay(d, { weekday: "short", day: "numeric" }),
    values: [dayActive[i] / 3600, Math.max(0, dayTotals[i] - dayActive[i]) / 3600],
    tooltip: `${formatDay(d, { weekday: "long", day: "numeric", month: "short" })}${holidays.has(d) ? ` · ${holidays.get(d)}` : ""}\n${formatHours(dayTotals[i])} · ${percent(dayActive[i], dayTotals[i])} active`,
    highlight: d === today,
    muted: holidays.has(d),
  }));
  const maxCell = Math.max(1, ...rows.flatMap((r) => r.days.map((c) => c.tracked)));
  const peopleWorked = rows.filter((r) => r.total > 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Timesheets"
        meta={`${formatDay(days[0], { day: "numeric", month: "short" })} – ${formatDay(days[6], { day: "numeric", month: "short", year: "numeric" })}`}
        actions={
          <>
            <div className="flex items-center rounded-lg border border-slate-300 bg-surface">
              <Link className="flex h-9 w-9 items-center justify-center text-slate-500 hover:text-slate-900" href={`/dashboard/timesheets?week=${addDays(week, -7)}`} aria-label="Previous week">
                <Icon name="chevronLeft" className="h-4 w-4" />
              </Link>
              <Link
                className={cn("border-x border-slate-200 px-3 py-1.5 text-sm font-medium", isCurrentWeek ? "text-slate-400" : "text-slate-700 hover:text-slate-900")}
                href="/dashboard/timesheets"
                aria-disabled={isCurrentWeek}
              >
                This week
              </Link>
              <Link className="flex h-9 w-9 items-center justify-center text-slate-500 hover:text-slate-900" href={`/dashboard/timesheets?week=${addDays(week, 7)}`} aria-label="Next week">
                <Icon name="chevronRight" className="h-4 w-4" />
              </Link>
            </div>
            {standard ? (
              <a className="btn-primary" href={`/dashboard/timesheets/export?week=${week}`}>
                <Icon name="download" className="h-4 w-4" />
                Download CSV
              </a>
            ) : (
              <span className="btn-secondary cursor-not-allowed opacity-60" title="Spreadsheet downloads are on the Standard plan">
                <Icon name="lock" className="h-4 w-4" />
                Download CSV
              </span>
            )}
          </>
        }
      />

      {locked ? (
        <Notice tone="info" action={isAdminRole(me.role) ? <Link href="/dashboard/billing" className="btn-primary btn-sm">See plans</Link> : undefined}>
          The Free plan shows the last {FREE_HISTORY_DAYS} days. Older weeks come back on Standard.
        </Notice>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
            <StatStrip
              className="lg:grid-cols-1! lg:[&>*:last-child]:col-span-1"
              stats={[
                { label: "Hours this week", value: formatHours(grand), icon: "clock", tone: "brand" },
                { label: "Activity", value: percent(grandActive, grand), icon: "activity", tone: "green" },
                { label: "People who worked", value: `${peopleWorked} of ${rows.length}`, icon: "users", tone: "slate" },
              ]}
            />
            <Panel title="Hours per day" bodyClassName="p-5">
              <StackedColumns
                columns={columns}
                series={["Active", "Idle"]}
                format={(v) => `${Math.round(v)}h`}
                height={150}
                caption="Hours per day this week"
              />
            </Panel>
          </div>

          <Panel>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-5 py-3 font-medium">Person</th>
                    {days.map((d) => (
                      <th key={d} className={cn("px-2 py-3 text-center font-medium", d === today && "text-brand-700")}>
                        {formatDay(d, { weekday: "short", day: "numeric" })}
                        {holidays.has(d) && (
                          <span className="block text-[10px] font-normal text-emerald-700" title={holidays.get(d)}>Holiday</span>
                        )}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right font-medium">Total</th>
                    <th className="px-5 py-3 text-right font-medium">Activity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={10}><EmptyState icon="users" title="No one to show." /></td>
                    </tr>
                  )}
                  {rows.map((r) => (
                    <tr key={r.userId}>
                      <td className="px-5 py-2.5">
                        <Link className="group flex items-center gap-3" href={`/dashboard/activity?user=${r.userId}`}>
                          <Avatar name={r.name} size="sm" />
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-slate-900 group-hover:text-brand-700">{r.name}</span>
                            <span className="block text-xs text-slate-500">{r.timezone.replaceAll("_", " ")}</span>
                          </span>
                        </Link>
                      </td>
                      {r.days.map((c) => {
                        const share = c.tracked / maxCell;
                        return (
                          <td key={c.date} className="px-1 py-1.5 text-center tabular-nums">
                            {c.tracked ? (
                              <Link
                                href={`/dashboard/activity?user=${r.userId}&date=${c.date}`}
                                className={cn(
                                  "block rounded-md px-1.5 py-2 text-xs font-medium transition hover:ring-2 hover:ring-brand-300",
                                  "text-brand-900",
                                  share > 0.85 ? "bg-brand-300" : share > 0.6 ? "bg-brand-200" : share > 0.35 ? "bg-brand-100" : "bg-brand-50",
                                )}
                              >
                                {formatHours(c.tracked)}
                              </Link>
                            ) : c.leave ? (
                              <span className="block rounded-md bg-sky-50 px-1.5 py-2 text-xs font-medium text-sky-700" title={c.leave}>Leave</span>
                            ) : (
                              <span className="block py-2 text-slate-300">–</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap text-slate-900 tabular-nums">{formatHours(r.total)}</td>
                      <td className="px-5 py-2.5 text-right text-slate-600 tabular-nums">{percent(r.active, r.total)}</td>
                    </tr>
                  ))}
                </tbody>
                {rows.length > 1 && (
                  <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold">
                    <tr>
                      <td className="px-5 py-3 text-slate-700">Everyone</td>
                      {dayTotals.map((t, i) => (
                        <td key={days[i]} className="px-2 py-3 text-center text-xs whitespace-nowrap tabular-nums">{t ? formatHours(t) : "–"}</td>
                      ))}
                      <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">{formatHours(grand)}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{percent(grandActive, grand)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
