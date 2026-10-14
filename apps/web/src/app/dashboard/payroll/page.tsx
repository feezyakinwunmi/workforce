import type { Metadata } from "next";
import Link from "next/link";
import { hasStandard } from "@/lib/billing";
import { getBilling } from "@/lib/billing-server";
import { buildPayroll, isMonth, money } from "@/lib/payroll";
import { requireAdmin } from "@/lib/session";
import { formatDay, localDateIn } from "@/lib/time";
import { Icon } from "@/components/icons";
import { Avatar, InfoTip, Notice, PageHeader, StatStrip, type Stat } from "@/components/ui";
import { cn } from "@/lib/utils";
import { setPay } from "./actions";

export const metadata: Metadata = { title: "Payroll" };

const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
};

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ month?: string; error?: string }> }) {
  const params = await searchParams;
  const { supabase, member: me } = await requireAdmin();
  const billing = await getBilling();
  const thisMonth = localDateIn(me.timezone).slice(0, 7);
  const month = isMonth(params.month) ? params.month : thisMonth;
  const here = `/dashboard/payroll?month=${month}`;

  if (!hasStandard(billing)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Payroll" />
        <Notice tone="info" action={<Link href="/dashboard/billing" className="btn-primary btn-sm">See plans</Link>}>
          Monthly pay from hours, leave and pay rates is on the Standard plan.
        </Notice>
      </div>
    );
  }

  const { rows, totals, workingDays, first } = await buildPayroll(supabase, me, month);
  const label = formatDay(first, { month: "long", year: "numeric" });

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
              <strong className="text-slate-900">No time:</strong> past working days with no tracked time and no leave. Never deducted automatically: check before paying.
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
            <a className="btn-primary" href={`/dashboard/payroll/export?month=${month}`}>
              <Icon name="download" className="h-4 w-4" />
              Download CSV
            </a>
          </>
        }
      />

      {params.error && <Notice tone="error">{params.error}</Notice>}

      <StatStrip
        stats={[
          ...[...totals.entries()].map(([currency, minor]): Stat => ({ label: `To pay in ${currency}`, value: money(minor, currency), icon: "wallet", tone: currency === "NGN" ? "brand" : "green" })),
          { label: "People without a rate", value: rows.filter((r) => !r.pay).length, icon: "user", tone: rows.some((r) => !r.pay) ? "amber" : "slate" },
          { label: "Hours worked", value: Math.round(rows.reduce((a, r) => a + r.hours, 0)).toLocaleString("en-NG"), icon: "clock", tone: "slate" },
        ]}
      />

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="table-head border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-medium">Person</th>
                <th className="px-4 py-3 font-medium">Pay rate</th>
                <th className="px-3 py-3 text-right font-medium">Hours</th>
                <th className="px-3 py-3 text-right font-medium">Paid leave</th>
                <th className="px-3 py-3 text-right font-medium">Unpaid leave</th>
                <th className="px-3 py-3 text-right font-medium" title="Working days with no time and no leave">No time</th>
                <th className="px-4 py-3 text-right font-medium">Pay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.userId}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={r.name} email={r.email} size="sm" />
                      <div className="min-w-0">
                        <Link href={`/dashboard/activity?user=${r.userId}`} className="font-medium text-slate-900 hover:text-brand-700">{r.name}</Link>
                        <p className="truncate text-xs text-slate-500">{r.jobTitle || r.email}{r.removed && " · removed"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <form action={setPay} className="flex flex-wrap items-center gap-1.5">
                      <input type="hidden" name="user_id" value={r.userId} />
                      <input type="hidden" name="back" value={here} />
                      <select name="currency" defaultValue={r.pay?.currency ?? "NGN"} className="input w-auto py-1 text-xs" aria-label="Currency">
                        <option value="NGN">₦</option>
                        <option value="USD">$</option>
                      </select>
                      <input name="amount" inputMode="decimal" className="input w-28 py-1 text-xs" aria-label="Amount"
                             defaultValue={r.pay ? String(r.pay.amount_minor / 100) : ""} placeholder="Amount" />
                      <select name="basis" defaultValue={r.pay?.basis ?? "monthly"} className="input w-auto py-1 text-xs" aria-label="Per">
                        <option value="monthly">per month</option>
                        <option value="hourly">per hour</option>
                      </select>
                      <button className="btn-secondary btn-sm">Save</button>
                    </form>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{r.hours.toFixed(1)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{r.paidLeaveDays || "–"}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{r.unpaidLeaveDays || "–"}</td>
                  <td className={cn("px-3 py-3 text-right tabular-nums", r.daysWithoutTime > 0 && "text-amber-700")}>{r.daysWithoutTime || "–"}</td>
                  <td className="px-4 py-3 text-right font-semibold whitespace-nowrap text-slate-900 tabular-nums">
                    {r.pay && r.amountMinor !== null ? money(r.amountMinor, r.pay.currency) : <span className="font-normal text-slate-400">Set a rate</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>


    </div>
  );
}
