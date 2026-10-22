import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SubmitButton } from "@/components/form";
import { Icon } from "@/components/icons";
import { InfoTip, Notice } from "@/components/ui";
import { bookRequestBase, getBookHost, getBookPlan } from "@/lib/book/server";
import { naira } from "@/lib/book/types";
import { listBanks, paystackConfigured } from "@/lib/paystack";
import { payPro } from "../actions";
import { PageForm, PayoutForm } from "./forms";

export const metadata: Metadata = { title: "Settings" };

export default async function BookSettings({ searchParams }: { searchParams: Promise<{ paid?: string; payment?: string }> }) {
  const sp = await searchParams;
  const [{ supabase, user, page }, base] = await Promise.all([getBookHost(), bookRequestBase()]);
  if (!user || !page) redirect(base || "/");
  const [plan, banks] = await Promise.all([getBookPlan(supabase), paystackConfigured() ? listBanks().catch(() => []) : Promise.resolve([])]);
  const pro = plan.tier === "pro";
  const until = plan.paid_until ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(plan.paid_until)) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <h1 className="font-display text-2xl font-bold text-slate-900">Settings</h1>
      {sp.paid && <Notice tone="success">Payment received. You're on Pro (Book + Forms).</Notice>}
      {sp.payment && <Notice tone="error">{sp.payment === "failed" ? "The payment didn't go through." : sp.payment}</Notice>}

      <section className="card p-5">
        <h2 className="mb-4 font-semibold text-slate-900">Your page</h2>
        <PageForm page={page} pro={pro} base={base} />
      </section>

      <section id="payouts" className="card scroll-mt-20 p-5">
        <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900">
          <Icon name="bank" className="h-5 w-5" /> Payouts
          <InfoTip>
            Where online payments go. Paystack pays them straight into this account (usually the next working day){pro ? "." : `, minus Workbase's 3% fee on the Free plan.`} Paystack's own fee (currently 1.5% + ₦100, at most ₦2,000) is taken first.
          </InfoTip>
        </h2>
        {page.subaccount_code && (
          <p className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <Icon name="check" className="h-4 w-4" />
            {page.account_name} · {page.bank_name} ••••{page.account_last4}
          </p>
        )}
        {paystackConfigured() ? (
          <PayoutForm banks={banks} hasAccount={!!page.subaccount_code} />
        ) : (
          <p className="text-sm text-slate-500">Online payments aren't switched on for this site yet.</p>
        )}
      </section>

      <section id="plan" className="card scroll-mt-20 p-5">
        <h2 className="font-semibold text-slate-900">Plan</h2>
        {pro ? (
          <p className="mt-2 text-sm text-slate-600">You're on <b>Pro</b>{until ? ` until ${until}` : ""}: no Workbase fee, no badge, your own colour. It covers Workbase Forms too.</p>
        ) : (
          <p className="mt-2 text-sm text-slate-600">You're on <b>Free</b>: Workbase keeps 3% of online payments and shows a small "Powered by Workbase Book" badge.</p>
        )}
        <form action={payPro} className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-700">{pro ? "Add more time:" : `Pro (Book + Forms), ${naira(plan.price_kobo)} a month:`}</span>
          <select name="months" defaultValue="1" className="input w-auto" aria-label="How long">
            <option value="1">1 month</option>
            <option value="3">3 months</option>
            <option value="6">6 months</option>
            <option value="12">12 months (pay 10)</option>
          </select>
          <SubmitButton pendingText="Opening Paystack…">{pro ? "Extend" : "Upgrade"}</SubmitButton>
        </form>
      </section>
    </div>
  );
}
