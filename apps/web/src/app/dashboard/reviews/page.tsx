import type { Metadata } from "next";
import Link from "next/link";
import { GOAL_COLUMNS, REVIEW_COLUMNS, REVIEW_STATUS, type Goal, type Review } from "@/lib/reviews";
import { requireMember } from "@/lib/session";
import { formatDay, localDateIn } from "@/lib/time";
import { displayName, loadPeople, visibleMembers } from "@/lib/tracking";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Avatar, EmptyState, Notice, PageHeader, Panel } from "@/components/ui";
import { AutoSubmitSelect } from "@/components/form";
import { addGoal, removeGoal, updateGoal } from "./actions";

export const metadata: Metadata = { title: "Goals and reviews" };

const day = (d: string) => formatDay(d, { day: "numeric", month: "short", year: "numeric" });

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ user?: string; error?: string }> }) {
  const params = await searchParams;
  const { supabase, user, member } = await requireMember();
  const manager = member.role !== "worker";
  const { members, teams, profiles } = await loadPeople(supabase);
  const team = manager ? visibleMembers(member, members.filter((m) => m.status === "active"), teams).filter((m) => m.user_id !== user.id) : [];
  const subject = params.user && team.some((m) => m.user_id === params.user) ? params.user : user.id;
  const mine = subject === user.id;
  const here = mine ? "/dashboard/reviews" : `/dashboard/reviews?user=${subject}`;

  const [{ data: goalRows }, { data: reviewRows }] = await Promise.all([
    supabase.from("goals").select(GOAL_COLUMNS).order("status").order("due_on", { ascending: true, nullsFirst: false }).order("created_at"),
    supabase.from("reviews").select(REVIEW_COLUMNS).order("created_at", { ascending: false }).limit(300),
  ]);
  const goals = (goalRows ?? []) as Goal[];
  const reviews = (reviewRows ?? []) as Review[];
  const theirGoals = goals.filter((g) => g.user_id === subject);
  const theirReviews = reviews.filter((r) => r.user_id === subject);
  const today = localDateIn(member.timezone);
  const p = profiles.get(subject);

  return (
    <div className="space-y-6">
      <PageHeader
        title={mine ? "Goals and reviews" : displayName(p)}
        back={mine ? undefined : { href: "/dashboard/reviews", label: "Goals and reviews" }}
        meta={mine ? undefined : members.find((m) => m.user_id === subject)?.job_title ?? undefined}
        actions={
          manager && (
            <Link href={`/dashboard/reviews/new${mine ? "" : `?user=${subject}`}`} className="btn-primary">
              <Icon name="plus" className="h-4 w-4" />
              {mine ? "Start a review" : `Review ${displayName(p).split(" ")[0]}`}
            </Link>
          )
        }
      />
      {params.error && <Notice tone="error">{params.error}</Notice>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="space-y-6">
          <Panel title={mine ? "My goals" : "Goals"}>
            {theirGoals.length ? (
              <ul className="divide-y divide-slate-100">
                {theirGoals.map((g) => {
                  const late = g.status === "active" && g.due_on && g.due_on < today;
                  return (
                    <li key={g.id} className={cn("space-y-2 px-5 py-4", g.status === "dropped" && "opacity-60")}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className={cn("font-medium text-slate-900", g.status === "done" && "text-slate-500 line-through")}>{g.title}</p>
                          <p className="text-xs text-slate-500">
                            {g.due_on ? <span className={late ? "font-medium text-red-600" : undefined}>Due {day(g.due_on)}</span> : "No due date"}
                            {g.created_by && g.created_by !== g.user_id && <> · set by {displayName(profiles.get(g.created_by))}</>}
                          </p>
                          {g.details && <p className="mt-1 text-sm text-slate-600">{g.details}</p>}
                        </div>
                        <form action={removeGoal}>
                          <input type="hidden" name="id" value={g.id} />
                          <input type="hidden" name="back" value={here} />
                          <button className="text-slate-300 hover:text-red-600" title="Remove goal"><Icon name="trash" className="h-4 w-4" /><span className="sr-only">Remove goal</span></button>
                        </form>
                      </div>
                      <form action={updateGoal} className="flex flex-wrap items-center gap-3">
                        <input type="hidden" name="id" value={g.id} />
                        <input type="hidden" name="back" value={here} />
                        <input type="range" name="progress" min={0} max={100} step={5} defaultValue={g.progress} className="h-2 min-w-32 flex-1 accent-brand-600" aria-label="Progress" />
                        <span className="w-10 text-right text-sm font-medium text-slate-700 tabular-nums">{g.progress}%</span>
                        <select name="status" defaultValue={g.status} className="input w-auto py-1 text-xs" aria-label="Status">
                          <option value="active">In progress</option>
                          <option value="done">Done</option>
                          <option value="dropped">Dropped</option>
                        </select>
                        <button className="btn-secondary btn-sm">Save</button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState icon="sparkle" title="No goals yet." className="py-8" />
            )}
            <form action={addGoal} className="grid gap-2 border-t border-slate-100 p-4 sm:grid-cols-[1fr_auto_auto]">
              <input type="hidden" name="user_id" value={subject} />
              <input type="hidden" name="back" value={here} />
              <input name="title" className="input" placeholder={mine ? "A new goal, e.g. Close 5 new clients" : "A goal for them"} minLength={2} maxLength={200} required />
              <input name="due_on" type="date" className="input w-auto" aria-label="Due date" />
              <button className="btn-primary"><Icon name="plus" className="h-4 w-4" />Add</button>
            </form>
          </Panel>

          <Panel title={mine ? "My reviews" : "Reviews"}>
            {theirReviews.length ? (
              <ul className="divide-y divide-slate-100">
                {theirReviews.map((r) => (
                  <li key={r.id}>
                    <Link href={`/dashboard/reviews/${r.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:text-brand-700"><Icon name="sparkle" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-slate-900">{r.title}</span>
                        <span className="block text-xs text-slate-500">{day(r.period_start)} – {day(r.period_end)}{r.reviewer_id && <> · with {displayName(profiles.get(r.reviewer_id))}</>}</span>
                      </span>
                      <span className={cn("badge", REVIEW_STATUS[r.status].style)}>
                        {mine && r.status === "self_review" ? "Your turn" : REVIEW_STATUS[r.status].label}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon="sparkle" title="No reviews yet." className="py-8" />
            )}
          </Panel>
        </div>

        {manager && team.length > 0 && (
          <Panel title="My team" className="self-start">
            <div className="border-b border-slate-100 p-4 lg:hidden">
              <form action="/dashboard/reviews">
                <AutoSubmitSelect
                  name="user"
                  defaultValue={subject}
                  options={[{ value: user.id, label: "Me" }, ...team.map((m) => ({ value: m.user_id, label: displayName(profiles.get(m.user_id)) }))]}
                  ariaLabel="Person"
                />
              </form>
            </div>
            <ul className="hidden divide-y divide-slate-100 lg:block">
              {team.map((m) => {
                const tp = profiles.get(m.user_id);
                const g = goals.filter((x) => x.user_id === m.user_id && x.status === "active");
                const avg = g.length ? Math.round(g.reduce((s, x) => s + x.progress, 0) / g.length) : null;
                const last = reviews.find((r) => r.user_id === m.user_id);
                return (
                  <li key={m.user_id}>
                    <Link href={`/dashboard/reviews?user=${m.user_id}`} className={cn("flex items-center gap-3 px-5 py-3 hover:bg-slate-50", subject === m.user_id && "bg-brand-50/60")}>
                      <Avatar name={tp?.full_name} email={tp?.email} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-900">{displayName(tp)}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {g.length ? `${g.length} ${g.length === 1 ? "goal" : "goals"} · ${avg}%` : "No goals"}
                          {last && <> · {REVIEW_STATUS[last.status].label.toLowerCase()}</>}
                        </span>
                      </span>
                      <Icon name="chevronRight" className="h-4 w-4 text-slate-300" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Panel>
        )}
      </div>
    </div>
  );
}
