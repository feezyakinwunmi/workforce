import type { Metadata } from "next";
import Link from "next/link";
import { SubmitButton } from "@/components/form";
import { Notice } from "@/components/ui";
import { getMeetUser, requestBase } from "@/lib/meet/server";
import { MEET_BUSINESS_HOSTS, naira, type MeetPlan } from "@/lib/meet/types";
import { payMeet } from "../actions";

export const metadata: Metadata = { title: "Pricing" };

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ error?: string; paid?: string }> }) {
  const sp = await searchParams;
  const [{ supabase, user }, base] = await Promise.all([getMeetUser(), requestBase()]);
  const { data } = user ? await supabase.rpc("meet_my_plan") : { data: null };
  const plan = data as MeetPlan | null;
  const pro = plan?.pro_price_kobo ?? 400_000;
  const business = plan?.business_price_kobo ?? 3_000_000;

  const plans = [
    { id: "free", name: "Free", price: "₦0", per: "forever", items: ["Meetings up to 1 hour", "Up to 25 people", "Screen share, chat, reactions", "Record to your device", "Noise cancellation, backgrounds, data saver", "Waiting room and host controls"] },
    { id: "pro", name: "Meet Pro", price: naira(pro), per: "per host / month", items: ["Everything in Free", "Unlimited meetings", "Each meeting up to 24 hours", "Up to 100 people", "AI meeting summaries (coming soon)"], hot: true },
    { id: "business", name: "Meet Business", price: naira(business), per: "per company / month", items: [`Meet Pro for up to ${MEET_BUSINESS_HOSTS} hosts`, "One payment for the whole team", "Included free with Workbase Standard and Pro"] },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <div className="text-center">
        <h1 className="font-display text-4xl font-bold tracking-tight text-slate-900">Simple prices, in naira</h1>
        <p className="mt-3 text-slate-500">Guests and attendees never pay. Pay for 10 months, get 12.</p>
      </div>
      {sp.error && <Notice tone="error" className="mx-auto mt-6 max-w-xl">{sp.error}</Notice>}
      {sp.paid && <Notice tone="success" className="mx-auto mt-6 max-w-xl">Payment received. You&apos;re on Meet Pro.</Notice>}
      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        {plans.map((p) => (
          <div key={p.id} className={p.hot ? "card relative p-6 ring-2 ring-brand-500" : "card p-6"}>
            {p.hot && <span className="absolute -top-3 left-6 rounded-full bg-[#f2a93b] px-3 py-0.5 text-xs font-bold text-[#15123a]">Most popular</span>}
            <h2 className="font-semibold text-slate-900">{p.name}</h2>
            <p className="mt-3"><span className="font-display text-4xl font-bold text-slate-900">{p.price}</span> <span className="text-sm text-slate-500">{p.per}</span></p>
            <ul className="mt-5 space-y-2 text-sm text-slate-600">
              {p.items.map((i) => <li key={i} className="flex gap-2"><span className="text-emerald-600">✓</span>{i}</li>)}
            </ul>
            <div className="mt-6">
              {p.id === "free" ? (
                <Link href={user ? base || "/" : `/signup?next=${encodeURIComponent(base || "/")}`} className="btn-secondary w-full">{user ? "Start a meeting" : "Sign up free"}</Link>
              ) : !user ? (
                <Link href={`/login?next=${encodeURIComponent(`${base}/pricing`)}`} className="btn-primary w-full">Sign in to buy</Link>
              ) : p.id === "pro" && plan?.tier === "pro" && !plan.paid_until ? (
                <p className="text-sm text-emerald-700">Included with your company&apos;s Workbase plan.</p>
              ) : p.id === "business" && !plan?.is_org_admin ? (
                <p className="text-sm text-slate-500">For Workbase company owners and admins.</p>
              ) : (
                <form action={payMeet} className="flex gap-2">
                  <input type="hidden" name="plan" value={p.id} />
                  <select name="months" className="input w-auto" defaultValue="1" aria-label="How long">
                    <option value="1">1 month</option>
                    <option value="3">3 months</option>
                    <option value="6">6 months</option>
                    <option value="12">12 months (pay 10)</option>
                  </select>
                  <SubmitButton className="btn-primary flex-1" pendingText="Opening Paystack…">Pay</SubmitButton>
                </form>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
