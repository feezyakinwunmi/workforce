import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { lastQuarter } from "@/lib/reviews";
import { requireMember } from "@/lib/session";
import { localDateIn } from "@/lib/time";
import { displayName, loadPeople, visibleMembers } from "@/lib/tracking";
import { SubmitButton } from "@/components/form";
import { Notice, PageHeader } from "@/components/ui";
import { startReview } from "../actions";

export const metadata: Metadata = { title: "Start a review" };

export default async function NewReviewPage({ searchParams }: { searchParams: Promise<{ user?: string; error?: string }> }) {
  const params = await searchParams;
  const { supabase, user, member } = await requireMember();
  if (member.role === "worker") redirect("/dashboard/reviews");
  const { members, teams, profiles } = await loadPeople(supabase);
  const team = visibleMembers(member, members.filter((m) => m.status === "active"), teams).filter((m) => m.user_id !== user.id);
  const q = lastQuarter(localDateIn(member.timezone));

  return (
    <div className="max-w-xl space-y-6">
      <PageHeader title="Start a review" back={{ href: "/dashboard/reviews", label: "Goals and reviews" }} />
      {params.error && <Notice tone="error">{params.error}</Notice>}
      {team.length === 0 ? (
        <Notice tone="info">There's nobody in your team to review yet.</Notice>
      ) : (
        <form action={startReview} className="card space-y-5 p-5">
          <input type="hidden" name="back" value="/dashboard/reviews/new" />
          <div>
            <label className="label" htmlFor="user_id">Person</label>
            <select id="user_id" name="user_id" className="input" defaultValue={params.user ?? team[0].user_id}>
              {team.map((m) => <option key={m.user_id} value={m.user_id}>{displayName(profiles.get(m.user_id))}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="title">Title</label>
            <input id="title" name="title" className="input" defaultValue={q.label} required minLength={2} maxLength={120} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="from">From</label>
              <input id="from" name="from" type="date" className="input" defaultValue={q.from} required />
            </div>
            <div>
              <label className="label" htmlFor="to">To</label>
              <input id="to" name="to" type="date" className="input" defaultValue={q.to} required />
            </div>
          </div>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="self" defaultChecked className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-brand-600" />
            <span>
              <span className="font-medium text-slate-900">Ask for a self-assessment first</span>
              <span className="block text-xs text-slate-500">They write how the period went before you write your feedback.</span>
            </span>
          </label>
          <SubmitButton pendingText="Starting…">Start review</SubmitButton>
        </form>
      )}
    </div>
  );
}
