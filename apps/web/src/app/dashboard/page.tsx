import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import { requireMember } from "@/lib/session";
import { formatClock, formatHours, localDateIn, percent } from "@/lib/time";
import {
  displayName,
  liveStatus,
  loadOpenSessions,
  loadPeople,
  loadToday,
  STATUS_LABEL,
  STATUS_STYLE,
  visibleMembers,
  type LiveStatus,
} from "@/lib/tracking";
import { isAdminRole } from "@/lib/types";
import { cn, initials } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview" };

const ORDER: Record<LiveStatus, number> = { working: 0, idle: 1, offline: 2, not_working: 3 };

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ password?: string }>;
}) {
  const { password } = await searchParams;
  const { supabase, org, member: me, profile } = await requireMember();
  const admin = isAdminRole(me.role);

  const [{ members, teams, profiles }, open, deviceCount, inviteCount] = await Promise.all([
    loadPeople(supabase),
    loadOpenSessions(supabase),
    supabase.from("devices").select("id", { count: "exact", head: true }).then((r) => r.count ?? 0),
    admin
      ? supabase
          .from("invitations")
          .select("id", { count: "exact", head: true })
          .is("accepted_at", null)
          .is("revoked_at", null)
          .gt("expires_at", new Date().toISOString())
          .then((r) => r.count ?? 0)
      : Promise.resolve(0),
  ]);

  const people = visibleMembers(me, members.filter((m) => m.status === "active"), teams);
  const [today, { data: doneRows }] = await Promise.all([
    loadToday(supabase, people),
    // Finished in the last 36 h; counted below per person's own "today".
    supabase
      .from("tasks")
      .select("assignee_id, completed_at")
      .eq("status", "done")
      .gte("completed_at", new Date(Date.now() - 36 * 3600_000).toISOString())
      .not("assignee_id", "is", null)
      .limit(2000),
  ]);
  const tz = new Map(people.map((m) => [m.user_id, m.timezone]));
  const doneToday = new Map<string, number>();
  for (const t of (doneRows ?? []) as Array<{ assignee_id: string; completed_at: string }>) {
    const zone = tz.get(t.assignee_id);
    if (zone && localDateIn(zone, new Date(t.completed_at)) === localDateIn(zone)) {
      doneToday.set(t.assignee_id, (doneToday.get(t.assignee_id) ?? 0) + 1);
    }
  }

  const rows = people
    .map((m) => {
      const session = open.get(m.user_id);
      return { m, session, status: liveStatus(session), stat: today.get(m.user_id) };
    })
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || (b.stat?.tracked_seconds ?? 0) - (a.stat?.tracked_seconds ?? 0));

  const counts = {
    working: rows.filter((r) => r.status === "working").length,
    idle: rows.filter((r) => r.status === "idle").length,
    total: rows.length,
    tracked: rows.reduce((s, r) => s + (r.stat?.tracked_seconds ?? 0), 0),
    active: rows.reduce((s, r) => s + (r.stat?.active_seconds ?? 0), 0),
    done: rows.reduce((s, r) => s + (doneToday.get(r.m.user_id) ?? 0), 0),
  };
  const firstName = profile?.full_name?.split(" ")[0];
  const memberCount = members.filter((m) => m.status === "active").length;

  const steps = [
    { done: true, label: "Create your company", href: null },
    { done: memberCount > 1 || inviteCount > 0, label: "Invite your team", href: "/dashboard/team" },
    { done: memberCount > 1, label: "First worker joins", href: "/dashboard/team" },
    { done: deviceCount > 0, label: "Someone installs the desktop app and logs in", href: "/download" },
  ];
  const showSetup = admin && steps.some((s) => !s.done);

  return (
    <div className="space-y-8">
      <AutoRefresh seconds={30} />
      <header>
        <h1 className="text-2xl font-semibold">Welcome{firstName ? `, ${firstName}` : ""}</h1>
        <p className="mt-1 text-slate-600">
          {admin || me.role === "manager" ? `Who is working at ${org.name} right now.` : "Your work today."}
        </p>
      </header>

      {password === "updated" && (
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Your password was changed.
        </p>
      )}

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {(admin || me.role === "manager"
          ? [
              { label: "Working now", value: `${counts.working} of ${counts.total}` },
              { label: "Idle now", value: counts.idle },
              { label: "Hours today", value: formatHours(counts.tracked) },
              { label: "Activity today", value: percent(counts.active, counts.tracked) },
              { label: "Tasks done today", value: counts.done },
            ]
          : [
              { label: "Status", value: STATUS_LABEL[rows[0]?.status ?? "not_working"] },
              { label: "Hours today", value: formatHours(counts.tracked) },
              { label: "Activity today", value: percent(counts.active, counts.tracked) },
              { label: "Clocked in at", value: rows[0]?.session ? formatClock(rows[0].session.started_at, me.timezone) : "–" },
              { label: "Tasks done today", value: counts.done },
            ]
        ).map((s) => (
          <div key={s.label} className="card p-4">
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold">{s.value}</p>
          </div>
        ))}
      </section>

      {!admin && deviceCount === 0 && (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-brand-200 bg-brand-50 p-5">
          <div>
            <p className="font-semibold text-brand-900">Install the desktop app to start tracking your time</p>
            <p className="text-sm text-brand-900/80">Clock in and out from your computer. It takes a minute to set up.</p>
          </div>
          <Link href="/download" className="btn-primary">Download the app</Link>
        </section>
      )}

      {showSetup && (
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Getting started</h2>
          <ol className="space-y-2">
            {steps.map((step) => (
              <li key={step.label} className="flex items-center gap-3 text-sm">
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs",
                    step.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-transparent",
                  )}
                  aria-hidden
                >
                  ✓
                </span>
                {step.href && !step.done ? (
                  <Link href={step.href} className="font-medium text-brand-700 hover:underline">{step.label}</Link>
                ) : (
                  <span className={cn(step.done ? "text-slate-500 line-through" : "text-slate-700")}>{step.label}</span>
                )}
                <span className="sr-only">{step.done ? "(done)" : "(to do)"}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="font-semibold">{admin || me.role === "manager" ? "Team today" : "Today"}</h2>
          <span className="text-xs text-slate-400">Updates every 30 seconds</span>
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">No one to show yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Member</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium">Since</th>
                  <th className="px-5 py-2.5 font-medium">Today</th>
                  <th className="px-5 py-2.5 font-medium">Activity</th>
                  <th className="px-5 py-2.5 font-medium">Tasks done</th>
                  <th className="px-5 py-2.5 font-medium">Now using</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(({ m, session, status, stat }) => {
                  const p = profiles.get(m.user_id);
                  return (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <Link href={`/dashboard/activity?user=${m.user_id}`} className="flex items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
                            {initials(p?.full_name ?? "", p?.email ?? "")}
                          </span>
                          <span className="font-medium hover:text-brand-700">{displayName(p)}</span>
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        <span className={cn("badge", STATUS_STYLE[status])}>{STATUS_LABEL[status]}</span>
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {session ? `${formatClock(session.started_at, m.timezone)} their time` : "–"}
                      </td>
                      <td className="px-5 py-3 font-medium">{formatHours(stat?.tracked_seconds ?? 0)}</td>
                      <td className="px-5 py-3">
                        <ActivityMeter active={stat?.active_seconds ?? 0} tracked={stat?.tracked_seconds ?? 0} />
                      </td>
                      <td className="px-5 py-3 tabular-nums text-slate-600">{doneToday.get(m.user_id) || "–"}</td>
                      <td className="max-w-48 truncate px-5 py-3 text-slate-600">
                        {status === "working" || status === "idle" ? (session?.current_app ?? "–") : "–"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function ActivityMeter({ active, tracked }: { active: number; tracked: number }) {
  if (!tracked) return <span className="text-slate-400">–</span>;
  const pct = Math.round((active / tracked) * 100);
  const color = pct >= 60 ? "bg-emerald-500" : pct >= 30 ? "bg-amber-500" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular-nums text-slate-600">{pct}%</span>
    </div>
  );
}
