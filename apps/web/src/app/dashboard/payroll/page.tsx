import type { Metadata } from "next";
import Link from "next/link";
import { hasStandard } from "@/lib/billing";
import { getBilling } from "@/lib/billing-server";
import { buildPayroll, isMonth, money } from "@/lib/payroll";
import { requireAdmin } from "@/lib/session";
import { formatDay, localDateIn } from "@/lib/time";
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
        <h1 className="text-2xl font-semibold">Payroll</h1>
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-brand-200 bg-brand-50 p-5 text-sm text-brand-900">
          <p>Monthly pay from hours, leave and pay rates is part of the Standard plan.</p>
          <Link href="/dashboard/billing" className="btn-primary btn-sm">See plans</Link>
        </section>
      </div>
    );
  }

  const { rows, totals, workingDays, first } = await buildPayroll(supabase, me, month);
  const label = formatDay(first, { month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Payroll</h1>
          <p className="mt-1 text-slate-600">{label} · {workingDays} working days (weekdays minus public holidays)</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="btn-secondary" href={`/dashboard/payroll?month=${shiftMonth(month, -1)}`}>← Previous</Link>
          {month !== thisMonth && <Link className="btn-secondary" href="/dashboard/payroll">This month</Link>}
          {month < thisMonth && <Link className="btn-secondary" href={`/dashboard/payroll?month=${shiftMonth(month, 1)}`}>Next →</Link>}
          <a className="btn-primary" href={`/dashboard/payroll/export?month=${month}`}>Download CSV</a>
        </div>
      </header>

      {params.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{params.error}</p>}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...totals.entries()].map(([currency, minor]) => (
          <div key={currency} className="card p-4">
            <p className="text-sm text-slate-500">Total to pay ({currency})</p>
            <p className="mt-1 text-2xl font-semibold">{money(minor, currency)}</p>
          </div>
        ))}
        <div className="card p-4">
          <p className="text-sm text-slate-500">People without a pay rate</p>
          <p className="mt-1 text-2xl font-semibold">{rows.filter((r) => !r.pay).length}</p>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
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
                <tr key={r.userId} className="align-top">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/timesheets`} className="font-medium hover:text-brand-700">{r.name}</Link>
                    <p className="text-xs text-slate-400">{r.jobTitle || r.email}{r.removed && " · removed"}</p>
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
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {r.pay && r.amountMinor !== null ? money(r.amountMinor, r.pay.currency) : <span className="font-normal text-slate-400">Set a rate</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="space-y-1 text-xs text-slate-500">
        <p><strong>Hourly:</strong> (hours worked + paid leave days × the person&apos;s expected hours a day) × rate.</p>
        <p><strong>Monthly:</strong> the salary, minus unpaid leave days as a share of the {workingDays} working days.</p>
        <p>&ldquo;No time&rdquo; counts past working days with no tracked time and no approved leave. It isn&apos;t deducted automatically: check it before paying. Pay rates are only visible to the owner and admins (each person can see their own).</p>
      </div>
    </div>
  );
}
