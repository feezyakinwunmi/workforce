"use client";

import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import { MONTH_OPTIONS, naira, type Plan } from "@/lib/billing";
import { startCheckout } from "./actions";

/** Choose plan, people and months; the price updates as you type (the server recalculates it). */
export function RenewForm({ minSeats, prices, defaultPlan, label }: {
  minSeats: number;
  prices: Record<Plan, number>;
  defaultPlan: Plan;
  label: string;
}) {
  const [state, action] = useActionState(startCheckout, undefined);
  const [seats, setSeats] = useState(Math.max(1, minSeats));
  const [months, setMonths] = useState(1);
  const [plan, setPlan] = useState<Plan>(defaultPlan);
  const priceKobo = prices[plan];
  const billable = MONTH_OPTIONS.find((m) => m.months === months)?.billable ?? months;
  const total = Math.max(0, seats) * priceKobo * billable;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="kind" value="renew" />
      <fieldset>
        <legend className="label">Plan</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["standard", "pro"] as const).map((p) => (
            <label
              key={p}
              className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${plan === p ? "border-brand-400 bg-brand-50" : "border-slate-200"}`}
            >
              <input type="radio" name="plan" value={p} checked={plan === p} onChange={() => setPlan(p)} className="mt-0.5" />
              <span>
                <span className="block font-medium">{p === "pro" ? "Pro" : "Standard"} · {naira(prices[p])}</span>
                <span className="block text-xs text-slate-500">{p === "pro" ? "Everything in Standard, plus optional screenshots" : "Window titles, timeline, full history, CSV, payroll"}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="seats">People</label>
          <input id="seats" name="seats" type="number" className="input" min={Math.max(1, minSeats)} max={10000}
                 value={seats} onChange={(e) => setSeats(Number(e.target.value))} required />
          <p className="mt-1 text-xs text-slate-500">At least {minSeats}: everyone active in your company now.</p>
        </div>
        <fieldset>
          <legend className="label">How long</legend>
          <div className="space-y-1.5">
            {MONTH_OPTIONS.map((m) => (
              <label key={m.months} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="radio" name="months" value={m.months} checked={months === m.months} onChange={() => setMonths(m.months)} />
                {m.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-4 py-3">
        <div>
          <p className="text-sm text-slate-600">
            {seats} {seats === 1 ? "person" : "people"} × {naira(priceKobo)} × {billable} {billable === 1 ? "month" : "months"}
          </p>
          <p className="text-2xl font-semibold">{naira(total)}</p>
        </div>
        <SubmitButton pendingText="Opening Paystack…">{label}</SubmitButton>
      </div>
      <p className="text-xs text-slate-500">Pay by card, bank transfer or USSD on Paystack. Cards from outside Nigeria are charged in naira; your bank converts it.</p>
      <FormMessage state={state} />
    </form>
  );
}

export function AddSeatsForm({ priceKobo, daysLeft }: { priceKobo: number; daysLeft: number }) {
  const [state, action] = useActionState(startCheckout, undefined);
  const [seats, setSeats] = useState(1);
  const estimate = Math.ceil((Math.max(0, seats) * priceKobo * Math.max(1, daysLeft)) / 30 / 100) * 100;
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="kind" value="add_seats" />
      <div className="w-28">
        <label className="label" htmlFor="extra">Extra people</label>
        <input id="extra" name="seats" type="number" className="input" min={1} max={10000} value={seats}
               onChange={(e) => setSeats(Number(e.target.value))} required />
      </div>
      <p className="pb-2 text-sm text-slate-600">
        {naira(estimate)} for the {daysLeft} {daysLeft === 1 ? "day" : "days"} left in your plan
      </p>
      <SubmitButton className="btn-secondary" pendingText="Opening Paystack…">Add people</SubmitButton>
      <div className="w-full"><FormMessage state={state} /></div>
    </form>
  );
}

/** Standard → Pro for the rest of the paid period (the database prices it). */
export function UpgradeForm({ seats, differenceKobo, daysLeft }: { seats: number; differenceKobo: number; daysLeft: number }) {
  const [state, action] = useActionState(startCheckout, undefined);
  const estimate = Math.ceil((seats * differenceKobo * Math.max(1, daysLeft)) / 30 / 100) * 100;
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="kind" value="upgrade" />
      <input type="hidden" name="plan" value="pro" />
      <p className="pb-2 text-sm text-slate-600">
        {naira(estimate)} for {seats} {seats === 1 ? "person" : "people"} and the {daysLeft} {daysLeft === 1 ? "day" : "days"} left in your plan
      </p>
      <SubmitButton pendingText="Opening Paystack…">Upgrade to Pro</SubmitButton>
      <div className="w-full"><FormMessage state={state} /></div>
    </form>
  );
}
