import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { InfoTip, Notice } from "@/components/ui";
import { getMeetUser, requestBase } from "@/lib/meet/server";
import { MEET_AI_HOURS, type MeetPlan } from "@/lib/meet/types";
import { UsageMeter } from "../../usage-meter";

export const metadata: Metadata = { title: "Usage" };

const resets = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long" });

export default async function UsagePage() {
  const [{ supabase, user }, base] = await Promise.all([getMeetUser(), requestBase()]);
  if (!user) redirect(`/login?next=${encodeURIComponent(`${base}/usage`)}`);
  const { data } = await supabase.rpc("meet_my_plan");
  const plan = data as MeetPlan | null;
  const usage = plan?.usage;
  const ai = plan?.ai;
  const planName = plan?.promax ? "Meet Pro Max" : plan?.tier === "pro" ? "Meet Pro" : "Free";

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">Usage</h1>
        <p className="mt-1 text-sm text-slate-500">
          {planName}
          {plan?.pool_kind === "company" && plan.company_name ? ` · meeting time shared with everyone at ${plan.company_name}` : ""}
        </p>
      </div>

      {usage && (
        <section className="card p-6">
          <h2 className="mb-4 flex items-center gap-1.5 font-semibold text-slate-900">
            Meeting time this month
            <InfoTip>
              Counted in person-hours: people in your meetings × the time they spend there (2 people for 1 hour = 2). Guests count; people waiting in the lobby don&apos;t.
              {plan?.tier === "pro"
                ? " Your plan has unlimited meetings: this is a fair-use limit that normal use doesn't reach."
                : " Free meetings last up to 1 hour each."}
              {" "}Above it, new meetings start with cameras off (sound and screen sharing still work) until the 1st. A meeting that's running is never cut.
            </InfoTip>
          </h2>
          <UsageMeter used={usage.used} included={usage.included} unit="person-hours" note={`Resets ${resets(usage.resets_at)}.`} />
          {usage.percent >= 80 && usage.left > 0 && (
            <Notice tone="warning" className="mt-4">
              You&apos;ve used most of this month&apos;s meeting time.{" "}
              {plan?.tier === "pro" ? "Contact support if you need more." : <Link className="font-medium underline" href={`${base}/pricing`}>Get Meet Pro</Link>}
            </Notice>
          )}
        </section>
      )}

      <section className="card p-6">
        <h2 className="mb-4 flex items-center gap-1.5 font-semibold text-slate-900">
          AI notes this month
          <InfoTip>Hours of meetings turned into written notes (summary, decisions, action items). Only the time AI notes are on counts.</InfoTip>
        </h2>
        {plan?.promax && ai ? (
          <>
            <UsageMeter used={ai.used} included={ai.included} unit="hours" note={`Resets ${resets(ai.resets_at)}. When it's used up, AI notes can't be turned on until then.`} />
            <Link href={`${base}/notes`} className="btn-secondary btn-sm mt-4 w-fit">See my notes</Link>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">AI notes come with Meet Pro Max: {MEET_AI_HOURS} hours a month.</p>
            <Link href={`${base}/pricing`} className="btn-primary btn-sm">See Pro Max</Link>
          </div>
        )}
      </section>
    </div>
  );
}
