import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@/components/ui";
import { getMeetUser } from "@/lib/meet/server";
import { padiAiReady } from "@/lib/padi/ai";
import { myBrand, padiRequestBase, type PadiPost } from "@/lib/padi/server";
import { Chat, type ChatMessage } from "./chat";
import { PadiLanding } from "./landing";
import { PlanWeekButton } from "./plan-week";

export const metadata: Metadata = { title: { absolute: "Bizz Padi: your AI social media manager" } };

const lagosDay = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

/** Signed out: landing page. Signed in without a brand: setup. Otherwise: chat + what's coming up. */
export default async function PadiHome({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const sp = await searchParams;
  const [{ supabase, user }, base] = await Promise.all([getMeetUser(), padiRequestBase()]);
  if (!user) return <PadiLanding base={base} />;

  const brand = await myBrand(supabase);
  if (!brand) redirect(`${base}/setup`);

  // Last 40 messages (newest first from the DB, shown oldest first) and the next planned posts.
  const [{ data: msgRows }, { data: postRows }] = await Promise.all([
    supabase.from("padi_messages").select("id, role, content, post_id, padi_posts(id, topic)").order("created_at", { ascending: false }).limit(40),
    supabase
      .from("padi_posts")
      .select("id, topic, planned_for, status")
      .in("status", ["draft", "approved"])
      .gte("planned_for", new Date(Date.now() - 6 * 3600_000).toISOString())
      .order("planned_for", { ascending: true })
      .limit(6),
  ]);

  type Row = { id: string; role: "user" | "assistant"; content: string; padi_posts: { id: string; topic: string } | null };
  const messages: ChatMessage[] = ((msgRows ?? []) as unknown as Row[])
    .reverse()
    .map((m) => ({ id: m.id, role: m.role, content: m.content, post: m.padi_posts }));
  const upcoming = (postRows ?? []) as Array<Pick<PadiPost, "id" | "topic" | "planned_for" | "status">>;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {sp.welcome && (
        <Notice tone="success" className="mb-4">
          Welcome, {brand.name}! Tell Padi what you want to post, or let it plan your whole week.
        </Notice>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Chat messages={messages} base={base} ready={padiAiReady()} />

        <aside className="space-y-4">
          <div className="card p-5">
            <h2 className="font-semibold text-slate-900">This week</h2>
            <p className="mt-1 text-sm text-slate-500">{brand.posts_per_week} posts a week keeps you consistent.</p>
            <PlanWeekButton count={brand.posts_per_week} />
          </div>
          <div className="card">
            <div className="flex items-center justify-between px-5 pt-4">
              <h2 className="font-semibold text-slate-900">Coming up</h2>
              <Link href={`${base}/posts`} className="text-sm text-brand-700 hover:underline">Calendar</Link>
            </div>
            {upcoming.length === 0 ? (
              <p className="px-5 pb-5 pt-2 text-sm text-slate-500">Nothing planned yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 px-2 pb-2 pt-1">
                {upcoming.map((p) => (
                  <li key={p.id}>
                    <Link href={`${base}/posts/${p.id}`} className="block rounded-lg px-3 py-2.5 hover:bg-slate-50">
                      <span className="block truncate text-sm font-medium text-slate-900">{p.topic}</span>
                      <span className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                        {p.planned_for ? lagosDay(p.planned_for) : "No time set"}
                        <span className={p.status === "approved" ? "text-emerald-700" : "text-amber-700"}>
                          · {p.status === "approved" ? "Approved" : "Needs a look"}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
