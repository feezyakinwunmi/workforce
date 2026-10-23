import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SubmitButton } from "@/components/form";
import { InfoTip, Notice } from "@/components/ui";
import { getMeetUser, requestBase } from "@/lib/meet/server";
import { MEET_ALLOWANCE, hours, naira, type MeetPlan } from "@/lib/meet/types";
import { topUpMeet } from "../actions";
import { UsageMeter } from "../../usage-meter";

export const metadata: Metadata = { title: "Usage" };

const PACKS = [1, 2, 5, 10];

export default async function UsagePage({ searchParams }: { searchParams: Promise<{ error?: string; paid?: string }> }) {
  const sp = await searchParams;
  const [{ supabase, user }, base] = await Promise.all([getMeetUser(), requestBase()]);
  if (!user) redirect(`/login?next=${encodeURIComponent(`${base}/usage`)}`);
  const { data } = await supabase.rpc("meet_my_plan");
  const plan = data as MeetPlan | null;
  const usage = plan?.usage;
  const price = plan?.topup_price_kobo ?? 100_000;

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-6">
      <div>
        <h1 className="flex items-center gap-1.5 font-display text-3xl font-bold tracking-tight text-slate-900">
          Usage
          <InfoTip>
            Meeting time is counted in person-hours: the number of people in your meetings × the time they spend there. Two people for one hour = 2 person-hours. Guests count too; people waiting in the lobby don&apos;t.
          </InfoTip>
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {plan?.tier === "pro" ? "Meet Pro" : "Free plan"}
          {plan?.pool_kind === "company" && plan.company_name ? ` · shared with everyone at ${plan.company_name}` : ""}
        </p>
      </div>

      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      {sp.paid && <Notice tone="success">Payment received. Your extra meeting time is ready{usage && usage.left > 0 ? ", and cameras are back on in your live meetings" : ""}.</Notice>}

      {usage && (
        <section className="card p-6">
          <h2 className="mb-4 font-semibold text-slate-900">This month</h2>
          <UsageMeter usage={usage} />
          {usage.percent >= 80 && usage.left > 0 && (
            <Notice tone="warning" className="mt-4">You&apos;ve used most of this month&apos;s meeting time. When it runs out, new meetings start with cameras off until you top up or the month resets.</Notice>
          )}
        </section>
      )}

      <section className="card p-6">
        <h2 className="font-semibold text-slate-900">Need more?</h2>
        {plan?.can_top_up ? (
          <>
            <p className="mt-1 text-sm text-slate-500">
              {naira(price)} adds {MEET_ALLOWANCE.topup_hours} person-hours. Used after the monthly allowance and kept for 12 months.
            </p>
            <form action={topUpMeet} className="mt-4 flex flex-wrap items-center gap-2">
              <select name="packs" className="input w-auto" defaultValue="1" aria-label="How much">
                {PACKS.map((n) => (
                  <option key={n} value={n}>
                    {n * MEET_ALLOWANCE.topup_hours} person-hours · {naira(price * n)}
                  </option>
                ))}
              </select>
              <SubmitButton className="btn-primary" pendingText="Opening Paystack…">Top up</SubmitButton>
            </form>
          </>
        ) : (
          <p className="mt-1 text-sm text-slate-500">Your company shares its meeting time. Ask the owner or an admin to top up.</p>
        )}
        {plan?.tier !== "pro" && (
          <p className="mt-4 text-sm text-slate-600">
            Or <Link href={`${base}/pricing`} className="font-medium text-brand-700 hover:underline">get Meet Pro</Link>: {MEET_ALLOWANCE.pro} person-hours a month, meetings up to 24 hours and 100 people.
          </p>
        )}
      </section>

      {usage && usage.topup_left > 0 && (
        <p className="text-center text-xs text-slate-500">{hours(usage.topup_left)} top-up person-hours waiting for you.</p>
      )}
    </div>
  );
}
