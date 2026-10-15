import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RATING_LABEL, REVIEW_COLUMNS, REVIEW_STATUS, type Feedback, type Review } from "@/lib/reviews";
import { requireMember } from "@/lib/session";
import { formatDay } from "@/lib/time";
import { displayName, loadPeople } from "@/lib/tracking";
import { cn, formatDate } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Avatar, Notice, PageHeader, Panel, StatStrip, type Stat } from "@/components/ui";
import { acknowledgeReview, saveFeedback, saveSelfReview } from "../actions";

export const metadata: Metadata = { title: "Review" };

const day = (d: string) => formatDay(d, { day: "numeric", month: "short", year: "numeric" });

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-marigold-400" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} viewBox="0 0 24 24" className={cn("h-5 w-5", n > value && "text-slate-200")} fill="currentColor" aria-hidden>
          <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
        </svg>
      ))}
    </span>
  );
}

function Text({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{title}</h3>
      <div className="mt-1.5 text-sm leading-6 whitespace-pre-wrap text-slate-800">{children}</div>
    </div>
  );
}

export default async function ReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, user, org } = await requireMember();
  const [{ data }, { data: fb }, { profiles }] = await Promise.all([
    supabase.from("reviews").select(REVIEW_COLUMNS).eq("id", id).maybeSingle(),
    supabase.from("review_feedback").select("rating, strengths, improvements, summary, updated_at").eq("review_id", id).maybeSingle(),
    loadPeople(supabase, { includeRemoved: true }),
  ]);
  if (!data) notFound();
  const r = data as Review;
  const f = fb as Feedback | null;
  const isPerson = r.user_id === user.id;
  const canWrite = !isPerson && (r.status === "self_review" || r.status === "manager_review");
  const p = profiles.get(r.user_id);
  const s = r.stats;
  const back = `/dashboard/reviews/${r.id}`;

  const stats: Stat[] = [
    { label: "Hours worked", value: s.hours !== undefined ? `${Math.round(s.hours)}h` : "–", icon: "clock", tone: "brand", hint: s.days_worked ? `${s.days_worked} days` : undefined },
    { label: "Activity", value: s.activity_pct != null ? `${s.activity_pct}%` : "–", icon: "activity", tone: "green" },
    { label: "Tasks done", value: s.tasks_done ?? "–", icon: "tasks", tone: "slate", hint: s.tasks_with_due ? `${s.tasks_on_time} of ${s.tasks_with_due} on time` : undefined },
    { label: "Goals done", value: s.goals_total ? `${s.goals_done}/${s.goals_total}` : "–", icon: "sparkle", tone: "amber", hint: s.leave_days ? `${s.leave_days} leave days` : undefined },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: isPerson ? "/dashboard/reviews" : `/dashboard/reviews?user=${r.user_id}`, label: "Goals and reviews" }}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={p?.full_name} email={p?.email} size="lg" />
            {r.title}
          </span>
        }
        meta={`${displayName(p)} · ${day(r.period_start)} – ${day(r.period_end)}${r.reviewer_id ? ` · reviewer ${displayName(profiles.get(r.reviewer_id))}` : ""}`}
        actions={<span className={cn("badge px-3 py-1 text-sm", REVIEW_STATUS[r.status].style)}>{REVIEW_STATUS[r.status].label}</span>}
      />
      {error && <Notice tone="error">{error}</Notice>}

      <StatStrip stats={stats} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title={isPerson ? "Your self-assessment" : "Self-assessment"} bodyClassName="p-5" className="self-start">
          {isPerson && r.status === "self_review" ? (
            <form action={saveSelfReview} className="space-y-3">
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="back" value={back} />
              <textarea name="text" rows={10} maxLength={5000} className="input" defaultValue={r.self_assessment ?? ""}
                        placeholder="What went well, what was hard, what you'd like to do next, and any help you need." />
              <div className="flex flex-wrap gap-2">
                <button name="intent" value="send" className="btn-primary"><Icon name="send" className="h-4 w-4" />Send to {r.reviewer_id ? displayName(profiles.get(r.reviewer_id)).split(" ")[0] : "reviewer"}</button>
                <button name="intent" value="draft" className="btn-secondary">Save draft</button>
              </div>
            </form>
          ) : r.self_assessment && (r.status !== "self_review" || isPerson) ? (
            <Text title={r.self_submitted_at ? `Sent ${formatDate(r.self_submitted_at, org.timezone)}` : "Draft"}>{r.self_assessment}</Text>
          ) : (
            <p className="text-sm text-slate-500">{r.status === "self_review" ? "Waiting for their self-assessment." : "No self-assessment for this review."}</p>
          )}
        </Panel>

        <Panel title="Feedback" bodyClassName="p-5" className="self-start">
          {canWrite ? (
            <form action={saveFeedback} className="space-y-4">
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="back" value={back} />
              <fieldset>
                <legend className="label">Overall</legend>
                <div className="grid gap-1.5 sm:grid-cols-5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <label key={n} className="cursor-pointer">
                      <input type="radio" name="rating" value={n} defaultChecked={f?.rating === n} className="peer sr-only" />
                      <span className="flex h-full flex-col items-center gap-0.5 rounded-lg border border-slate-200 px-2 py-2 text-center text-xs text-slate-600 transition peer-checked:border-brand-500 peer-checked:bg-brand-50 peer-checked:text-brand-800 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40">
                        <span className="font-display text-lg font-semibold text-slate-900">{n}</span>
                        {RATING_LABEL[n]}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div>
                <label className="label" htmlFor="strengths">What went well</label>
                <textarea id="strengths" name="strengths" rows={4} maxLength={5000} className="input" defaultValue={f?.strengths ?? ""} />
              </div>
              <div>
                <label className="label" htmlFor="improvements">What to work on</label>
                <textarea id="improvements" name="improvements" rows={4} maxLength={5000} className="input" defaultValue={f?.improvements ?? ""} />
              </div>
              <div>
                <label className="label" htmlFor="summary">Summary and next steps</label>
                <textarea id="summary" name="summary" rows={3} maxLength={5000} className="input" defaultValue={f?.summary ?? ""} />
              </div>
              <div className="flex flex-wrap gap-2">
                <button name="intent" value="share" className="btn-primary"><Icon name="send" className="h-4 w-4" />Share with {displayName(p).split(" ")[0]}</button>
                <button name="intent" value="draft" className="btn-secondary">Save draft</button>
              </div>
              <p className="text-xs text-slate-500">They can't see anything here until you share it.</p>
            </form>
          ) : f && (f.rating || f.strengths || f.improvements || f.summary) ? (
            <div className="space-y-5">
              {f.rating && (
                <div className="flex items-center gap-3">
                  <Stars value={f.rating} />
                  <span className="text-sm font-medium text-slate-900">{RATING_LABEL[f.rating]}</span>
                </div>
              )}
              {f.strengths && <Text title="What went well">{f.strengths}</Text>}
              {f.improvements && <Text title="What to work on">{f.improvements}</Text>}
              {f.summary && <Text title="Summary and next steps">{f.summary}</Text>}
            </div>
          ) : (
            <p className="text-sm text-slate-500">{isPerson ? "Your reviewer's feedback will appear here once it's shared." : "No feedback yet."}</p>
          )}

          {r.status === "shared" && isPerson && (
            <form action={acknowledgeReview} className="mt-6 space-y-3 border-t border-slate-100 pt-5">
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="back" value={back} />
              <label className="label" htmlFor="comment">Your response <span className="font-normal text-slate-400">(optional)</span></label>
              <textarea id="comment" name="comment" rows={3} maxLength={2000} className="input" />
              <button className="btn-primary"><Icon name="check" className="h-4 w-4" />I&apos;ve read my review</button>
            </form>
          )}
          {r.status === "acknowledged" && (
            <div className="mt-6 border-t border-slate-100 pt-5">
              <Text title={`Read by ${isPerson ? "you" : displayName(p).split(" ")[0]}${r.acknowledged_at ? ` on ${formatDate(r.acknowledged_at, org.timezone)}` : ""}`}>
                {r.acknowledgement ?? <span className="text-slate-500">No comment.</span>}
              </Text>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
