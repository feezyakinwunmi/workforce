import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, Notice } from "@/components/ui";
import { myBrand, padiRequestBase, requirePadiUser, type PadiPost } from "@/lib/padi/server";
import { PlanWeekButton } from "../plan-week";

/** AI calls (chat, plan my week) can take 10–40 seconds. */
export const maxDuration = 60;

export const metadata: Metadata = { title: "Calendar" };

const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date(iso));
const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
const time = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

const STATUS = {
  draft: { label: "Needs a look", cls: "bg-amber-50 text-amber-800" },
  approved: { label: "Approved", cls: "bg-emerald-50 text-emerald-700" },
  posted: { label: "Posted", cls: "bg-brand-50 text-brand-800" },
  skipped: { label: "Skipped", cls: "bg-slate-100 text-slate-500" },
} as const;

/** All upcoming and recent posts, grouped by day (Lagos time); unscheduled ones at the end. */
export default async function PadiCalendar({ searchParams }: { searchParams: Promise<{ planned?: string }> }) {
  const sp = await searchParams;
  const [{ supabase }, base] = await Promise.all([requirePadiUser(), padiRequestBase()]);
  const brand = await myBrand(supabase);

  const { data } = await supabase
    .from("padi_posts")
    .select("id, topic, planned_for, status, created_at")
    .gte("created_at", new Date(Date.now() - 30 * 86400_000).toISOString())
    .order("planned_for", { ascending: true, nullsFirst: false })
    .limit(200);
  const posts = (data ?? []) as Array<Pick<PadiPost, "id" | "topic" | "planned_for" | "status" | "created_at">>;

  // Group by Lagos day.
  const groups = new Map<string, { label: string; items: typeof posts }>();
  for (const p of posts) {
    const k = p.planned_for ? dayKey(p.planned_for) : "zz-unscheduled";
    if (!groups.has(k)) groups.set(k, { label: p.planned_for ? dayLabel(p.planned_for) : "No time set", items: [] });
    groups.get(k)!.items.push(p);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Content calendar</h1>
          <p className="mt-1 text-slate-600">Approve what you like, skip what you don't.</p>
        </div>
        {brand && <div className="w-48"><PlanWeekButton count={brand.posts_per_week} /></div>}
      </div>
      {sp.planned && <Notice tone="success" className="mt-4">Your week is planned. Open each post to check it, download the flyer and approve.</Notice>}

      {posts.length === 0 ? (
        <div className="card mt-6">
          <EmptyState icon="calendar" title="No posts yet. Ask Padi in the chat, or plan your week." action={<Link href={base || "/"} className="btn-secondary btn-sm">Open chat</Link>} />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {[...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, g]) => (
            <section key={k}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{g.label}</h2>
              <ul className="card mt-2 divide-y divide-slate-100">
                {g.items.map((p) => (
                  <li key={p.id}>
                    <Link href={`${base}/posts/${p.id}`} className="flex items-center gap-4 px-4 py-3.5 transition hover:bg-slate-50 sm:px-5">
                      <span className="w-14 shrink-0 text-sm tabular-nums text-slate-500">{p.planned_for ? time(p.planned_for) : "—"}</span>
                      <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{p.topic}</span>
                      <span className={`badge ${STATUS[p.status].cls}`}>{STATUS[p.status].label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
