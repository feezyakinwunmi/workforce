import type { Metadata } from "next";
import Link from "next/link";
import { hasStandard } from "@/lib/billing";
import { getBilling } from "@/lib/billing-server";
import { emailEnabled } from "@/lib/email";
import { buildPayroll, isMonth, money, monthLabel } from "@/lib/payroll";
import { requireAdmin } from "@/lib/session";
import { localDateIn } from "@/lib/time";
import { Icon } from "@/components/icons";
import { Avatar, InfoTip, Notice, PageHeader, StatStrip, type Stat } from "@/components/ui";
import { cn } from "@/lib/utils";
import { IssueForm } from "./forms";

export const metadata: Metadata = { title: "Payroll" };

const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
};

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const params = await searchParams;
  const { supabase, member: me } = await requireAdmin();
  const billing = await getBilling();
  const thisMonth = localDateIn(me.timezone).slice(0, 7);
  const month = isMonth(params.month) && params.month <= thisMonth ? params.month : thisMonth;

  if (!hasStandard(billing)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Payroll" />
        <Notice tone="info" action={<Link href="/dashboard/billing" className="btn-primary btn-sm">See plans</Link>}>
          Payroll, PAYE and payslips are on the Standard plan.
        </Notice>
      </div>
    );
  }

  const { rows, totals, workingDays, settings } = await buildPayroll(supabase, me, month);
  const label = monthLabel(month);
  const ngn = totals.get("NGN");
  const usd = totals.get("USD");
  const issued = rows.filter((r) => r.issued).length;
  const emailed = rows.filter((r) => r.issued?.emailed_at).length;
  const ready = rows.filter((r) => r.slip).length;

  const whole = (minor: number, currency: string) => money(Math.round(minor / 100) * 100, currency);
  const noRate = rows.filter((r) => !r.pay).length;
  const stats: Stat[] = [
    {
      label: "Net pay",
      value: ngn ? whole(ngn.net, "NGN") : usd ? whole(usd.net, "USD") : "–",
      icon: "wallet",
      tone: "brand",
      hint: ngn && usd ? `+ ${whole(usd.net, "USD")} in dollars` : undefined,
    },
    { label: "Gross pay", value: ngn ? whole(ngn.gross, "NGN") : "–", icon: "chart", tone: "slate" },
    ...(settings.statutory
      ? [
          { label: "PAYE to remit", value: ngn ? whole(ngn.paye, "NGN") : "–", icon: "receipt" as const, tone: "amber" as const },
          { label: "Pension to remit", value: ngn ? whole(ngn.pension, "NGN") : "–", icon: "shield" as const, tone: "green" as const },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payroll"
        meta={
          <span className="inline-flex items-center gap-1.5">
            {label} · {workingDays} working days
            <InfoTip label="How pay is worked out">
              <strong className="text-slate-900">Hourly:</strong> (hours worked + paid leave days × expected hours a day) × rate.
              <br />
              <strong className="text-slate-900">Monthly:</strong> the salary, minus unpaid leave days as a share of the {workingDays} working days.
              <br />
              <strong className="text-slate-900">Deductions:</strong> PAYE under the Nigeria Tax Act 2025, pension and NHF, for naira pay.
              <br />
              <strong className="text-slate-900">No time:</strong> past working days with no tracked time and no leave. Never deducted automatically.
            </InfoTip>
          </span>
        }
        actions={
          <>
            <div className="flex items-center rounded-lg border border-slate-300 bg-surface">
              <Link className="flex h-9 w-9 items-center justify-center text-slate-500 hover:text-slate-900" href={`/dashboard/payroll?month=${shiftMonth(month, -1)}`} aria-label="Previous month">
                <Icon name="chevronLeft" className="h-4 w-4" />
              </Link>
              <Link className={cn("border-x border-slate-200 px-3 py-1.5 text-sm font-medium", month === thisMonth ? "text-slate-400" : "text-slate-700")} href="/dashboard/payroll">
                This month
              </Link>
              {month < thisMonth ? (
                <Link className="flex h-9 w-9 items-center justify-center text-slate-500 hover:text-slate-900" href={`/dashboard/payroll?month=${shiftMonth(month, 1)}`} aria-label="Next month">
                  <Icon name="chevronRight" className="h-4 w-4" />
                </Link>
              ) : (
                <span className="flex h-9 w-9 items-center justify-center text-slate-300" aria-hidden><Icon name="chevronRight" className="h-4 w-4" /></span>
              )}
            </div>
            <Link className="btn-secondary px-2.5" href="/dashboard/payroll/settings" title="Payroll settings">
              <Icon name="settings" className="h-4 w-4" />
              <span className="sr-only">Payroll settings</span>
            </Link>
            <a className="btn-secondary" href={`/dashboard/payroll/export?month=${month}`}>
              <Icon name="download" className="h-4 w-4" />
              CSV
            </a>
          </>
        }
      />

      <StatStrip stats={stats} />

      <section className="card flex flex-wrap items-center justify-between gap-4 px-5 py-4" data-tour="payslips">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <Icon name="receipt" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">Payslips</p>
            <p className="text-xs text-slate-500">
              {issued ? `${issued} of ${ready} issued${emailed ? ` · ${emailed} emailed` : ""}` : `${ready} ready to issue`}
              {noRate > 0 && <span className="text-amber-700"> · {noRate} without a pay rate</span>}
            </p>
          </div>
        </div>
        {ready > 0 && <IssueForm month={month} label={label.split(" ")[0]} issued={issued} total={ready} emailReady={emailEnabled()} />}
      </section>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="table-head border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-medium">Person</th>
                <th className="px-3 py-3 font-medium">Rate</th>
                <th className="px-3 py-3 text-right font-medium">Hours</th>
                <th className="px-3 py-3 text-right font-medium">Leave</th>
                <th className="px-3 py-3 text-right font-medium" title="Working days with no time and no leave">No time</th>
                <th className="px-3 py-3 text-right font-medium">Gross</th>
                <th className="px-3 py-3 text-right font-medium">Deductions</th>
                <th className="px-4 py-3 text-right font-medium">Net pay</th>
                <th className="w-10 px-2 py-3"><span className="sr-only">Payslip</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const person = `/dashboard/payroll/${r.userId}?month=${month}`;
                return (
                  <tr key={r.userId} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <Link href={person} className="group flex items-center gap-3">
                        <Avatar name={r.name} email={r.email} size="sm" />
                        <span className="min-w-0">
                          <span className="block font-medium text-slate-900 group-hover:text-brand-700">{r.name}</span>
                          <span className="block truncate text-xs text-slate-500">{r.jobTitle || r.email}{r.removed && " · removed"}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {r.pay ? (
                        <span className="text-slate-700">
                          {money(r.pay.amount_minor, r.pay.currency)}
                          <span className="text-slate-400"> / {r.pay.basis === "hourly" ? "hr" : "mo"}</span>
                        </span>
                      ) : (
                        <Link href={person} className="font-medium text-brand-700 hover:underline">Set rate</Link>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.hours.toFixed(1)}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">
                      {r.paidLeaveDays || r.unpaidLeaveDays ? (
                        <span title={`${r.paidLeaveDays} paid, ${r.unpaidLeaveDays} unpaid`}>
                          {r.paidLeaveDays}
                          {r.unpaidLeaveDays > 0 && <span className="text-xs text-amber-700"> · {r.unpaidLeaveDays} unpaid</span>}
                        </span>
                      ) : "–"}
                    </td>
                    <td className={cn("px-3 py-3 text-right tabular-nums", r.daysWithoutTime > 0 && "text-amber-700")}>{r.daysWithoutTime || "–"}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">{r.slip ? money(r.slip.gross_minor, r.slip.currency) : "–"}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap text-slate-500 tabular-nums">
                      {r.slip ? (r.slip.deductions_minor ? `– ${money(r.slip.deductions_minor, r.slip.currency)}` : "–") : "–"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold whitespace-nowrap text-slate-900 tabular-nums">
                      {r.slip ? money(r.slip.net_minor, r.slip.currency) : <span className="font-normal text-slate-400">–</span>}
                    </td>
                    <td className="px-2 py-3 text-center">
                      {r.issued ? (
                        <Link
                          href={`/dashboard/payslips/${r.issued.id}`}
                          className={cn(
                            "inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-slate-100",
                            r.slip && r.issued.net_minor !== r.slip.net_minor ? "text-amber-600" : "text-emerald-600",
                          )}
                          title={r.slip && r.issued.net_minor !== r.slip.net_minor ? "Issued payslip differs from today's figures: re-issue to update" : "View payslip"}
                        >
                          <Icon name="receipt" className="h-4 w-4" />
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
