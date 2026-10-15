import type { Metadata } from "next";
import { getBilling } from "@/lib/billing-server";
import { requireMember } from "@/lib/session";
import { formatClock, localDateIn } from "@/lib/time";
import { loadDayStats } from "@/lib/tracking";
import { Notice, PageHeader } from "@/components/ui";
import { ClockPanel, InstallHint } from "./clock-panel";

export const metadata: Metadata = { title: "Clock in" };

export default async function ClockPage() {
  const { supabase, user, member, org } = await requireMember();
  const today = localDateIn(member.timezone);
  const [{ data: open }, stats, billing] = await Promise.all([
    supabase
      .from("work_sessions")
      .select("id, source, started_at, last_heartbeat_at")
      .eq("user_id", user.id)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    loadDayStats(supabase, today, today),
    getBilling(),
  ]);
  const session = open as { id: string; source: "desktop" | "phone"; started_at: string; last_heartbeat_at: string | null } | null;
  const fresh = session && Date.now() - Date.parse(session.last_heartbeat_at ?? session.started_at) < 3 * 60_000;
  const state = session?.source === "phone" ? "phone" : session && fresh ? "desktop" : "out";
  // Day totals already include the running phone session; the panel adds its own live count on top.
  const running = state === "phone" && session ? Math.max(0, Math.floor((Date.now() - Date.parse(session.started_at)) / 1000)) : 0;
  const todaySeconds = Math.max(0, (stats.get(`${user.id}|${today}`)?.tracked_seconds ?? 0) - running);
  // Your open tasks, for "Mark tasks as done" when clocking out.
  const { data: taskRows } = state === "phone" ? await supabase.rpc("my_open_tasks") : { data: [] };
  const s = org.settings;
  const enabled = s.phone_clock !== false;

  return (
    <div className="mx-auto max-w-md space-y-8">
      <PageHeader
        title="Clock in"
        meta={state === "phone" && session ? `Since ${formatClock(session.started_at, member.timezone)}` : new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: member.timezone }).format(new Date())}
      />
      {!enabled ? (
        <Notice tone="info">Your company uses the desktop app for clocking in.</Notice>
      ) : (
        <>
          {!billing.can_track && state !== "phone" && (
            <Notice tone="warning">Your company&apos;s plan doesn&apos;t cover you yet, so you can&apos;t clock in. Ask your company admin.</Notice>
          )}
          <ClockPanel
            state={state}
            startedAt={state === "phone" ? session!.started_at : null}
            todaySeconds={todaySeconds}
            location={s.phone_location ?? "ask"}
            canTrack={billing.can_track}
            tasks={(taskRows ?? []) as Array<{ id: string; title: string; status: string; project_name: string | null; due_date: string | null }>}
          />
          <InstallHint />
        </>
      )}
    </div>
  );
}
