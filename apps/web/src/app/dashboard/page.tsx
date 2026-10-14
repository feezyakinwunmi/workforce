import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import { Ring, StackedColumns, type Column } from "@/components/charts";
import { Icon } from "@/components/icons";
import { Avatar, Notice, PageHeader, Panel, StatStrip, EmptyState } from "@/components/ui";
import { requireMember } from "@/lib/session";
import { addDays, formatClock, formatDay, formatHours, localDateIn, percent } from "@/lib/time";
import {
  displayName,
  liveStatus,
  loadDayStats,
  loadOpenSessions,
  loadPeople,
  STATUS_LABEL,
  STATUS_STYLE,
  visibleMembers,
  type LiveStatus,
} from "@/lib/tracking";
import { isAdminRole } from "@/lib/types";
import { cn } from "@/lib/utils";

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
  const utcToday = new Date().toISOString().slice(0, 10);
  const myToday = localDateIn(me.timezone);
  const week = Array.from({ length: 7 }, (_, i) => addDays(myToday, i - 6));
  const [stats, { data: doneRows }, { data: leaveRows }] = await Promise.all([
    loadDayStats(supabase, addDays(week[0], -1), addDays(myToday, 1)),
    // Finished in the last 36 h; counted below per person's own "today".
    supabase
      .from("tasks")
      .select("assignee_id, completed_at")
      .eq("status", "done")
      .gte("completed_at", new Date(Date.now() - 36 * 3600_000).toISOString())
      .not("assignee_id", "is", null)
      .limit(2000),
    supabase
      .from("leave_requests")
      .select("user_id, start_date, end_date")
      .eq("status", "approved")
      .lte("start_date", addDays(utcToday, 1))
      .gte("end_date", addDays(utcToday, -1)),
  ]);
  // Approved leave covering each person's own "today".
  const onLeave = new Set(
    ((leaveRows ?? []) as Array<{ user_id: string; start_date: string; end_date: string }>)
      .filter((l) => {
        const zone = people.find((m) => m.user_id === l.user_id)?.timezone;
        const d = zone ? localDateIn(zone) : utcToday;
        return l.start_date <= d && l.end_date >= d;
      })
      .map((l) => l.user_id),
  );
  const today = new Map(people.map((m) => [m.user_id, stats.get(`${m.user_id}|${localDateIn(m.timezone)}`)]));
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
  const team = admin || me.role === "manager";

  const steps = [
    { done: true, label: "Create your company", href: null },
    { done: memberCount > 1 || inviteCount > 0, label: "Invite your team", href: "/dashboard/team" },
    { done: memberCount > 1, label: "First person joins", href: "/dashboard/team" },
    { done: deviceCount > 0, label: "Someone installs the desktop app", href: "/download" },
  ];
  const showSetup = admin && steps.some((s) => !s.done);

  // Last 7 days of hours (each person's own dates), active vs idle.
  const columns: Column[] = week.map((d) => {
    let active = 0;
    let tracked = 0;
    for (const m of people) {
      const st = stats.get(`${m.user_id}|${d}`);
      active += st?.active_seconds ?? 0;
      tracked += st?.tracked_seconds ?? 0;
    }
    const weekday = new Date(`${d}T00:00:00Z`).getUTCDay();
    return {
      key: d,
      label: d === myToday ? "Today" : formatDay(d, { weekday: "short" }),
      values: [active / 3600, Math.max(0, tracked - active) / 3600],
      tooltip: `${formatDay(d, { weekday: "long", day: "numeric", month: "short" })}\n${formatHours(tracked)} worked · ${percent(active, tracked)} active`,
      muted: weekday === 0 || weekday === 6,
      highlight: d === myToday,
    };
  });
  const weekTracked = columns.reduce((a, c) => a + (c.values[0] + c.values[1]) * 3600, 0);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: me.timezone }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const mine = rows.find((r) => r.m.user_id === me.user_id) ?? rows[0];

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={30} />
      <PageHeader
        title={`${greeting}${firstName ? `, ${firstName}` : ""}`}
        meta={formatDay(myToday, { weekday: "long", day: "numeric", month: "long" })}
        actions={
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-surface px-3 py-1 text-xs text-slate-500">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Live
          </span>
        }
      />

      {password === "updated" && <Notice tone="success">Your password was changed.</Notice>}

      {!admin && deviceCount === 0 && (
        <Notice tone="info" action={<Link href="/download" className="btn-primary btn-sm"><Icon name="download" className="h-3.5 w-3.5" />Download the app</Link>}>
          Install the desktop app to start tracking your time.
        </Notice>
      )}

      <StatStrip
        stats={
          team
            ? [
                { label: "Working now", value: <>{counts.working}<span className="text-base font-normal text-slate-400"> / {counts.total}</span></>, icon: "zap", tone: "green" },
                { label: "Idle now", value: counts.idle, icon: "clock", tone: "amber" },
                { label: "Hours today", value: formatHours(counts.tracked), icon: "activity", tone: "brand" },
                { label: "Tasks done today", value: counts.done, icon: "tasks", tone: "slate" },
              ]
            : [
                { label: "Status", value: STATUS_LABEL[mine?.status ?? "not_working"], icon: "zap", tone: "green" },
                { label: "Hours today", value: formatHours(counts.tracked), icon: "activity", tone: "brand" },
                { label: "Clocked in at", value: mine?.session ? formatClock(mine.session.started_at, me.timezone) : "–", icon: "clock", tone: "amber" },
                { label: "Tasks done today", value: counts.done, icon: "tasks", tone: "slate" },
              ]
        }
      />

      {showSetup && (
        <Panel
          title="Get set up"
          actions={<span className="text-xs text-slate-500 tabular-nums">{steps.filter((x) => x.done).length} of {steps.length} done</span>}
        >
          <div className="h-1 bg-slate-100">
            <div className="h-full bg-brand-600" style={{ width: `${(steps.filter((x) => x.done).length / steps.length) * 100}%` }} />
          </div>
          <ol className="grid gap-px bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, i) => (
              <li key={step.label} className="flex items-center gap-3 bg-surface px-5 py-4 text-sm">
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    step.done ? "bg-emerald-500 text-white" : "border border-slate-300 text-slate-500",
                  )}
                >
                  {step.done ? <Icon name="check" className="h-3.5 w-3.5" /> : i + 1}
                </span>
                {step.href && !step.done ? (
                  <Link href={step.href} className="font-medium text-brand-700 hover:underline">{step.label}</Link>
                ) : (
                  <span className={step.done ? "text-slate-500" : "text-slate-700"}>{step.label}</span>
                )}
              </li>
            ))}
          </ol>
        </Panel>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Panel
          title={team ? "Team hours, last 7 days" : "Your hours, last 7 days"}
          actions={<span className="text-sm text-slate-500 tabular-nums">{formatHours(weekTracked)}</span>}
          bodyClassName="p-5"
        >
          <StackedColumns
            columns={columns}
            series={["Active", "Idle"]}
            format={(v) => `${Math.round(v * 10) / 10}h`}
            caption={team ? "Team hours for the last 7 days" : "Your hours for the last 7 days"}
          />
        </Panel>
        <Panel title="Activity today" bodyClassName="flex flex-col items-center gap-3 p-5 text-center">
          <Ring value={counts.tracked ? counts.active / counts.tracked : null} size={120} label={`Activity today ${percent(counts.active, counts.tracked)}`} />
          <p className="text-sm text-slate-500">
            {counts.tracked ? <>Keyboard or mouse in use for <span className="font-medium text-slate-900">{formatHours(counts.active)}</span> of {formatHours(counts.tracked)}</> : "No time tracked yet today"}
          </p>
        </Panel>
      </div>

      <Panel title={team ? "Team today" : "Today"} actions={<span className="text-xs text-slate-400">Updates every 30 s</span>}>
        {rows.length === 0 ? (
          <EmptyState icon="users" title="No one to show yet." action={admin ? <Link href="/dashboard/team" className="btn-primary btn-sm">Invite people</Link> : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Person</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium">Since</th>
                  <th className="px-5 py-2.5 text-right font-medium">Today</th>
                  <th className="px-5 py-2.5 font-medium">Activity</th>
                  <th className="px-5 py-2.5 text-right font-medium">Tasks done</th>
                  <th className="px-5 py-2.5 font-medium">Now using</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(({ m, session, status, stat }) => {
                  const p = profiles.get(m.user_id);
                  const leave = status === "not_working" && onLeave.has(m.user_id);
                  return (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <Link href={`/dashboard/activity?user=${m.user_id}`} className="group flex items-center gap-3">
                          <Avatar name={p?.full_name} email={p?.email} status={status} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-slate-900 group-hover:text-brand-700">{displayName(p)}</span>
                            {m.job_title && <span className="block truncate text-xs text-slate-500">{m.job_title}</span>}
                          </span>
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        {leave ? (
                          <span className="badge bg-sky-50 text-sky-700">On leave</span>
                        ) : (
                          <span className={cn("badge", STATUS_STYLE[status])}>{STATUS_LABEL[status]}</span>
                        )}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap text-slate-500 tabular-nums">
                        {session ? formatClock(session.started_at, m.timezone) : "–"}
                      </td>
                      <td className="px-5 py-3 text-right font-medium whitespace-nowrap tabular-nums">{formatHours(stat?.tracked_seconds ?? 0)}</td>
                      <td className="px-5 py-3">
                        <ActivityMeter active={stat?.active_seconds ?? 0} tracked={stat?.tracked_seconds ?? 0} />
                      </td>
                      <td className="px-5 py-3 text-right text-slate-600 tabular-nums">{doneToday.get(m.user_id) || "–"}</td>
                      <td className="max-w-48 truncate px-5 py-3 text-slate-500">
                        {status === "working" || status === "idle" ? (session?.current_app ?? "–") : "–"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function ActivityMeter({ active, tracked }: { active: number; tracked: number }) {
  if (!tracked) return <span className="text-slate-400">–</span>;
  const pct = Math.round((active / tracked) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        <div className="h-full rounded-full bg-chart-1" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-slate-600 tabular-nums">{pct}%</span>
    </div>
  );
}
