"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton, Switch } from "@/components/form";
import { Icon } from "@/components/icons";
import { InfoTip } from "@/components/ui";
import type { PayrollSettings } from "@/lib/payroll-tax";
import { issuePayslips, savePayrollSettings, savePerson } from "./actions";

export function IssueForm({ month, label, issued, total, emailReady }: { month: string; label: string; issued: number; total: number; emailReady: boolean }) {
  const [state, action] = useActionState(issuePayslips, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <input type="hidden" name="month" value={month} />
      <label className={`flex items-center gap-2 text-sm ${emailReady ? "text-slate-700" : "text-slate-400"}`} title={emailReady ? undefined : "Email isn't set up yet (SMTP settings on the server)"}>
        <input type="checkbox" name="email" defaultChecked={emailReady} disabled={!emailReady} className="h-4 w-4 rounded border-slate-300 accent-brand-600" />
        Email each person their PDF
      </label>
      <SubmitButton pendingText="Issuing…">
        <Icon name="send" className="h-4 w-4" />
        {issued ? `Re-issue ${label} payslips` : `Issue ${label} payslips`}
      </SubmitButton>
      <span className="sr-only">{issued} of {total} issued</span>
      <div className="w-full empty:hidden"><FormMessage state={state} /></div>
    </form>
  );
}

export function PersonForm({
  userId,
  pay,
}: {
  userId: string;
  pay: { basis: string; amount_minor: number; currency: string; statutory: boolean; annual_rent_minor: number; annual_reliefs_minor: number } | null;
}) {
  const [state, action] = useActionState(savePerson, undefined);
  const n = (minor: number | undefined) => (minor ? String(minor / 100) : "");
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="user_id" value={userId} />
      <div>
        <span className="label">Pay rate</span>
        <div className="flex flex-wrap gap-2">
          <select name="currency" defaultValue={pay?.currency ?? "NGN"} className="input w-auto" aria-label="Currency">
            <option value="NGN">₦ Naira</option>
            <option value="USD">$ US dollar</option>
          </select>
          <input name="amount" inputMode="decimal" className="input min-w-32 flex-1" aria-label="Amount" defaultValue={n(pay?.amount_minor)} placeholder="250000" required />
          <select name="basis" defaultValue={pay?.basis ?? "monthly"} className="input w-auto" aria-label="Per">
            <option value="monthly">per month</option>
            <option value="hourly">per hour</option>
          </select>
        </div>
      </div>

      <div className="border-y border-slate-100">
        <Switch
          name="statutory"
          label="Nigerian deductions"
          hint="PAYE, pension and NHF on naira pay. Turn off for contractors."
          defaultChecked={pay?.statutory ?? true}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="annual_rent">Rent paid per year (₦)</label>
          <input id="annual_rent" name="annual_rent" inputMode="decimal" className="input" defaultValue={n(pay?.annual_rent_minor)} placeholder="0" />
          <p className="mt-1 text-xs text-slate-500">20% is tax-free, up to ₦500,000. Keep their receipt or lease.</p>
        </div>
        <div>
          <label className="label" htmlFor="annual_reliefs">Other reliefs per year (₦)</label>
          <input id="annual_reliefs" name="annual_reliefs" inputMode="decimal" className="input" defaultValue={n(pay?.annual_reliefs_minor)} placeholder="0" />
          <p className="mt-1 text-xs text-slate-500">Health or life insurance, mortgage interest.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingText="Saving…">Save</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

function Pct({ name, label, value, max }: { name: string; label: string; value: number; max: number }) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <div className="relative">
        <input id={name} name={name} type="number" step="0.01" min={0} max={max} defaultValue={value} className="input pr-8 text-right tabular-nums" required />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-400">%</span>
      </div>
    </div>
  );
}

export function PayrollSettingsForm({ settings: s }: { settings: PayrollSettings }) {
  const [state, action] = useActionState(savePayrollSettings, undefined);
  return (
    <form action={action} className="space-y-6">
      <section className="card px-5 py-2">
        <Switch name="statutory" label="Nigerian deductions" hint="Work out PAYE and pension for everyone paid in naira" defaultChecked={s.statutory} />
        <div className="grid gap-4 border-t border-slate-100 py-4 sm:grid-cols-2">
          <Pct name="pension_employee_pct" label="Pension: employee" value={s.pension_employee_pct} max={30} />
          <Pct name="pension_employer_pct" label="Pension: company" value={s.pension_employer_pct} max={30} />
        </div>
        <div className="border-t border-slate-100">
          <Switch name="nhf" label="National Housing Fund" hint="Deducted from basic salary. Optional for private companies." defaultChecked={s.nhf} />
        </div>
        <div className="grid gap-4 pb-4 sm:grid-cols-2">
          <Pct name="nhf_pct" label="NHF rate" value={s.nhf_pct} max={10} />
        </div>
      </section>

      <section className="card px-5 py-4">
        <h2 className="section-title flex items-center gap-2 text-base">
          How pay is split
          <InfoTip label="About the split">Anything left over is paid as other allowances. Pension is charged on basic + housing + transport; NHF on basic.</InfoTip>
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Pct name="basic_pct" label="Basic salary" value={s.basic_pct} max={100} />
          <Pct name="housing_pct" label="Housing" value={s.housing_pct} max={99} />
          <Pct name="transport_pct" label="Transport" value={s.transport_pct} max={99} />
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingText="Saving…">Save settings</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
