import type { Metadata } from "next";
import { daysLeft, FREE_HISTORY_DAYS, FREE_SEATS, naira, TIER_LABEL } from "@/lib/billing";
import { getBilling } from "@/lib/billing-server";
import { paystackConfigured } from "@/lib/paystack";
import { requireAdmin } from "@/lib/session";
import { formatDate, cn } from "@/lib/utils";
import { AddSeatsForm, RenewForm } from "./forms";

export const metadata: Metadata = { title: "Plan and billing" };

type Payment = {
  id: string;
  reference: string;
  kind: "renew" | "add_seats" | "manual";
  seats: number;
  months: number;
  amount_kobo: number;
  status: "pending" | "success" | "failed";
  period_start: string | null;
  period_end: string | null;
  channel: string | null;
  paid_at: string | null;
  created_at: string;
};

const PAYMENT_MESSAGE: Record<string, { text: string; ok: boolean }> = {
  success: { text: "Payment received. Thank you! Your plan is active.", ok: true },
  pending: { text: "We're waiting for Paystack to confirm the payment (bank transfers can take a few minutes). Refresh this page shortly.", ok: true },
  cancelled: { text: "The payment was cancelled. Nothing was charged.", ok: false },
  failed: { text: "The payment didn't go through. Nothing was charged; please try again.", ok: false },
  problem: { text: "Paystack took the payment but we couldn't match it to your order. Contact support with the reference below.", ok: false },
};

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const { payment } = await searchParams;
  const { supabase, org } = await requireAdmin();
  const [billing, { data: paymentRows }] = await Promise.all([
    getBilling(),
    supabase
      .from("payments")
      .select("id, reference, kind, seats, months, amount_kobo, status, period_start, period_end, channel, paid_at, created_at")
      .neq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  const payments = (paymentRows ?? []) as Payment[];
  const ready = paystackConfigured();
  const msg = payment ? PAYMENT_MESSAGE[payment] : undefined;
  const uncovered = billing.seat_limit !== null ? Math.max(0, billing.active_members - billing.seat_limit) : 0;
  const paidDays = daysLeft(billing.paid_until);
  const trialDays = daysLeft(billing.trial_ends_at);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Plan and billing</h1>
        <p className="mt-1 text-slate-600">{org.name} · prices per person per month</p>
      </header>

      {msg && (
        <p role="status" className={cn("rounded-lg px-3 py-2 text-sm", msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>
          {msg.text}
        </p>
      )}

      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500">Current plan</p>
            <p className="mt-1 text-2xl font-semibold">{TIER_LABEL[billing.tier]}</p>
            <p className="mt-1 text-sm text-slate-600">
              {billing.tier === "trial" &&
                `All Standard features for everyone until ${formatDate(billing.trial_ends_at, org.timezone)} (${trialDays} ${trialDays === 1 ? "day" : "days"} left). Then the company moves to Free unless you choose a plan.`}
              {billing.tier === "standard" &&
                `${billing.paid_seats} ${billing.paid_seats === 1 ? "person" : "people"} paid until ${formatDate(billing.paid_until!, org.timezone)} (${paidDays} days left).`}
              {billing.tier === "free" && `Up to ${FREE_SEATS} people, app names only, last ${FREE_HISTORY_DAYS} days of history.`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500">Active people</p>
            <p className="mt-1 text-2xl font-semibold">
              {billing.active_members}
              {billing.seat_limit !== null && <span className="text-base font-normal text-slate-500"> / {billing.seat_limit} covered</span>}
            </p>
          </div>
        </div>
        {uncovered > 0 && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {uncovered} {uncovered === 1 ? "person isn't" : "people aren't"} covered by your plan and can&apos;t clock in. You can see who on
            the Team page. {billing.tier === "standard" ? "Add people below." : "Choose a plan below."}
          </p>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <PlanCard
          name="Free"
          price="₦0"
          current={billing.tier === "free"}
          items={[`Up to ${FREE_SEATS} people`, "Clock in/out, hours, idle check", "Activity % and app names", "Tasks, reports, notifications", `Last ${FREE_HISTORY_DAYS} days of history`]}
        />
        <PlanCard
          name="Standard"
          price={`${naira(billing.seat_price_kobo)}`}
          current={billing.tier === "standard" || billing.tier === "trial"}
          highlight
          items={["Any number of people", "Everything in Free", "Window titles (which document or website)", "Hour-by-hour timeline of each day", "Full history and CSV timesheet downloads"]}
        />
        <PlanCard
          name="Pro"
          price="Coming soon"
          items={["Everything in Standard", "Screenshots (optional, blurred)", "Leave requests", "Payroll exports"]}
          muted
        />
      </section>

      <section className="card p-5">
        <h2 className="mb-1 font-semibold">
          {billing.tier === "standard" ? "Renew or extend Standard" : "Choose Standard"}
        </h2>
        <p className="mb-4 text-sm text-slate-600">
          {billing.tier === "standard"
            ? `The new period starts when the current one ends on ${formatDate(billing.paid_until!, org.timezone)}.`
            : "Prepay for the people in your company. No automatic charges: we'll remind you before it ends."}
        </p>
        {ready ? (
          <RenewForm minSeats={billing.active_members} priceKobo={billing.seat_price_kobo} label="Pay with Paystack" />
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Online payment is being set up. Contact us to pay by transfer in the meantime.
          </p>
        )}
      </section>

      {billing.tier === "standard" && ready && (
        <section className="card p-5">
          <h2 className="mb-1 font-semibold">Add people to your current plan</h2>
          <p className="mb-4 text-sm text-slate-600">For new hires. You only pay for the days left in your plan.</p>
          <AddSeatsForm priceKobo={billing.seat_price_kobo} daysLeft={paidDays} />
        </section>
      )}

      <section className="card overflow-hidden">
        <h2 className="border-b border-slate-200 px-5 py-3 font-semibold">Payments</h2>
        {payments.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">No payments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Date</th>
                  <th className="px-5 py-2.5 font-medium">What</th>
                  <th className="px-5 py-2.5 font-medium">Covers</th>
                  <th className="px-5 py-2.5 font-medium">Amount</th>
                  <th className="px-5 py-2.5 font-medium">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-5 py-3 text-slate-600">{formatDate(p.paid_at ?? p.created_at, org.timezone)}</td>
                    <td className="px-5 py-3">
                      {p.kind === "add_seats" ? `${p.seats} extra ${p.seats === 1 ? "person" : "people"}` : `Standard · ${p.seats} people · ${p.months} ${p.months === 1 ? "month" : "months"}`}
                      {p.status === "failed" && <span className="badge ml-2 bg-red-100 text-red-700">Failed</span>}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {p.period_start && p.period_end ? `${formatDate(p.period_start, org.timezone)} – ${formatDate(p.period_end, org.timezone)}` : "–"}
                    </td>
                    <td className="px-5 py-3 font-medium">{naira(p.amount_kobo)}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-500">{p.reference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function PlanCard({ name, price, items, current, highlight, muted }: {
  name: string;
  price: string;
  items: string[];
  current?: boolean;
  highlight?: boolean;
  muted?: boolean;
}) {
  return (
    <div className={cn("card p-5", highlight && "border-brand-200 ring-1 ring-brand-200", muted && "opacity-70")}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{name}</h3>
        {current && <span className="badge bg-brand-100 text-brand-700">Current</span>}
      </div>
      <p className="mt-2 text-2xl font-semibold">
        {price}
        {price.startsWith("₦") && price !== "₦0" && <span className="text-sm font-normal text-slate-500"> / person / month</span>}
      </p>
      <ul className="mt-4 space-y-1.5 text-sm text-slate-700">
        {items.map((i) => (
          <li key={i} className="flex gap-2"><span className="text-emerald-600" aria-hidden>✓</span>{i}</li>
        ))}
      </ul>
    </div>
  );
}
