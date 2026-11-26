import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/icons";
import { getMeetUser } from "@/lib/meet/server";
import { padiAiReady } from "@/lib/padi/ai";
import { myBrand, padiRequestBase, type PadiPost } from "@/lib/padi/server";
import { Chat, type ChatMessage, type ChatPost } from "./chat";
import { PadiLanding } from "./landing";
import { PlanWeekButton } from "./plan-week";

/** AI calls (chat, plan my week) can take 10–40 seconds. */
export const maxDuration = 60;

export const metadata: Metadata = { title: { absolute: "Bizz Padi: your AI social media manager" } };

const lagos = (iso: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", ...opts }).format(new Date(iso));

/** "Good morning/afternoon/evening" in Lagos time. */
function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Monday 00:00 of this week in Lagos, as ISO UTC. */
function weekStart() {
  const now = new Date(Date.now() + 3600_000); // Lagos wall clock as if UTC
  const day = (now.getUTCDay() + 6) % 7; // Monday = 0
  const monday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day) - 3600_000;
  return new Date(monday).toISOString();
}

/**
 * Signed out: landing page. Signed in without a brand: setup.
 * Otherwise: greeting + week progress, the chat, and a side column with the plan button and
 * what's coming up.
 */
export default async function PadiHome({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const sp = await searchParams;
  const [{ supabase, user }, base] = await Promise.all([getMeetUser(), padiRequestBase()]);
  if (!user) return <PadiLanding base={base} />;

  const brand = await myBrand(supabase);
  if (!brand) redirect(`${base}/setup`);

  const start = weekStart();
  const end = new Date(new Date(start).getTime() + 7 * 86400_000).toISOString();
  const [{ data: msgRows }, { data: upRows }, { data: weekRows }] = await Promise.all([
    supabase.from("padi_messages").select("id, role, content, padi_posts(id, topic, flyer, captions)").order("created_at", { ascending: false }).limit(40),
    supabase
      .from("padi_posts")
      .select("id, topic, planned_for, status")
      .in("status", ["draft", "approved"])
      .gte("planned_for", new Date(Date.now() - 6 * 3600_000).toISOString())
      .order("planned_for", { ascending: true })
      .limit(5),
    supabase.from("padi_posts").select("status").gte("planned_for", start).lt("planned_for", end),
  ]);

  type Row = { id: string; role: "user" | "assistant"; content: string; padi_posts: ChatPost | null };
  const messages: ChatMessage[] = ((msgRows ?? []) as unknown as Row[]).reverse().map((m) => ({ id: m.id, role: m.role, content: m.content, post: m.padi_posts }));
  const upcoming = (upRows ?? []) as Array<Pick<PadiPost, "id" | "topic" | "planned_for" | "status">>;
  const week = (weekRows ?? []) as Array<{ status: PadiPost["status"] }>;
  const ready = week.filter((p) => p.status === "approved" || p.status === "posted").length;
  const target = brand.posts_per_week;
  const pct = Math.min(100, Math.round((ready / target) * 100));

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8">
      {/* Greeting + week stats */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">{greeting()}</p>
          <h1 className="text-2xl font-semibold text-slate-900">{sp.welcome ? `Welcome, ${brand.name}` : brand.name}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            ["Planned this week", `${week.length}`],
            ["Approved", `${ready}/${target}`],
            ["Next post", upcoming[0]?.planned_for ? lagos(upcoming[0].planned_for, { weekday: "short", hour: "numeric", minute: "2-digit" }) : "None yet"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl border border-slate-200 bg-surface px-4 py-2.5">
              <span className="block text-[0.72rem] text-slate-500">{k}</span>
              <b className="text-[0.95rem] text-slate-900 tabular-nums">{v}</b>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_19rem] [&>*]:min-w-0">
        <Chat messages={messages} base={base} ready={padiAiReady()} colors={brand.colors} brandName={brand.name} />

        <aside className="space-y-4">
          {/* Week progress */}
          <div className="relative overflow-hidden rounded-3xl bg-[#111113] p-5 text-white">
            <span className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full bg-[#111113] opacity-40 blur-3xl" aria-hidden="true" />
            <div className="relative flex items-center gap-4">
              <span className="relative h-16 w-16 shrink-0">
                <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3.5" />
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="#f2a93b" strokeWidth="3.5" strokeLinecap="round"
                    strokeDasharray={`${(pct / 100) * 97.4} 97.4`} className="transition-all duration-700" />
                </svg>
                <b className="absolute inset-0 flex items-center justify-center text-sm tabular-nums">{pct}%</b>
              </span>
              <div>
                <b className="block">This week</b>
                <span className="text-sm text-white/60">{ready} of {target} posts ready</span>
              </div>
            </div>
            <div className="relative [&_.btn-primary]:bg-white [&_.btn-primary]:text-[#111113] [&_.btn-primary:hover]:bg-white/90">
              <PlanWeekButton count={target} />
            </div>
          </div>

          {/* Coming up */}
          <div className="rounded-3xl border border-slate-200 bg-surface">
            <div className="flex items-center justify-between px-5 pt-4">
              <b className="text-slate-900">Coming up</b>
              <Link href={`${base}/posts`} className="flex items-center gap-1 text-sm text-brand-700 hover:underline">
                Calendar <Icon name="arrowRight" className="h-3.5 w-3.5" />
              </Link>
            </div>
            {upcoming.length === 0 ? (
              <p className="px-5 pt-2 pb-5 text-sm text-slate-500">Nothing planned yet. Ask Padi or plan your week.</p>
            ) : (
              <ul className="space-y-1 p-2">
                {upcoming.map((p) => (
                  <li key={p.id}>
                    <Link href={`${base}/posts/${p.id}`} className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-slate-50">
                      <span className="flex w-11 shrink-0 flex-col items-center rounded-lg bg-[#f4f4f5] py-1 text-[#6a4cf5]">
                        <b className="text-[0.62rem] uppercase">{p.planned_for ? lagos(p.planned_for, { weekday: "short" }) : "—"}</b>
                        <b className="text-[0.95rem] leading-none tabular-nums">{p.planned_for ? lagos(p.planned_for, { day: "numeric" }) : ""}</b>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.86rem] font-medium text-slate-900">{p.topic}</span>
                        <span className={`text-[0.74rem] ${p.status === "approved" ? "text-emerald-700" : "text-amber-700"}`}>
                          {p.status === "approved" ? "Approved" : "Needs a look"}
                          {p.planned_for ? ` · ${lagos(p.planned_for, { hour: "numeric", minute: "2-digit" })}` : ""}
                        </span>
                      </span>
                      <Icon name="chevronRight" className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
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
