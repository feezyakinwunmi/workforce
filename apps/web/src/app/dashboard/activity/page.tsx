import type { Metadata } from "next";
import Link from "next/link";
import { FREE_HISTORY_DAYS, hasStandard, historyLimit } from "@/lib/billing";
import { getBilling } from "@/lib/billing-server";
import { requireMember } from "@/lib/session";
import {
  addDays,
  formatClock,
  formatDay,
  formatHours,
  isValidDate,
  localDateIn,
  percent,
  zonedMidnight,
} from "@/lib/time";
import { displayName, loadPeople, visibleMembers } from "@/lib/tracking";
import { STATUS_LABEL as TASK_STATUS_LABEL, type TaskStatus } from "@/lib/tasks";
import { isAdminRole } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BarList, StackedColumns, type Column } from "@/components/charts";
import { DayNav } from "@/components/day-nav";
import { Icon } from "@/components/icons";
import { Avatar, EmptyState, Notice, PageHeader, Panel, StatStrip } from "@/components/ui";
import { ConfirmSubmit } from "../team/forms";
import { disconnectDevice } from "./actions";

export const metadata: Metadata = { title: "Activity" };

type Block = { block_start: string; active_seconds: number; idle_seconds: number; excluded_seconds: number };
type Session = { id: string; started_at: string; ended_at: string | null; end_reason: string | null; device_id: string | null };
type Idle = { id: string; started_at: string; ended_at: string | null; decision: string; reason: string | null };
type AppRow = { app_name: string; window_title: string; seconds: number };
type Device = { id: string; name: string; os: string; agent_version: string; last_seen_at: string | null; revoked_at: string | null; clock_offset_seconds: number };

const END_REASON: Record<string, string> = {
  clock_out: "Clocked out",
  idle_timeout: "Clocked out after long idle",
  agent_restart: "App closed",
  agent_lost: "App stopped reporting",
  superseded: "Clocked in on another computer",
  admin: "Stopped by admin",
};

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; date?: string; error?: string }>;
}) {
  const params = await searchParams;
  const { supabase, member: me } = await requireMember();
  const admin = isAdminRole(me.role);

  const { members, teams, profiles } = await loadPeople(supabase, { includeRemoved: true });
  const visible = visibleMembers(me, members, teams);
  const target = visible.find((m) => m.user_id === (params.user ?? me.user_id));

  if (!target) {
    return (
      <div className="card p-6">
        <h1 className="text-xl font-semibold">Activity</h1>
        <p className="mt-2 text-slate-600">You can only view your own activity{me.role === "manager" ? " and your team's" : ""}.</p>
      </div>
    );
  }

  const tz = target.timezone;
  const date = isValidDate(params.date) ? params.date : localDateIn(tz);
  const billing = await getBilling();
  const standard = hasStandard(billing);
  const oldest = historyLimit(billing, localDateIn(tz));
  if (oldest && date < oldest) {
    return (
      <div className="space-y-4">
        <Link className="text-sm text-slate-500 hover:text-slate-800" href={`/dashboard/activity?user=${target.user_id}`}>← Back to today</Link>
        <UpgradeCard admin={admin} text={`The Free plan shows the last ${FREE_HISTORY_DAYS} days. Your older data is kept safe: upgrade to Standard to see it.`} />
      </div>
    );
  }
  const dayStart = zonedMidnight(date, tz);
  const dayEnd = zonedMidnight(addDays(date, 1), tz);
  const from = dayStart.toISOString();
  const to = dayEnd.toISOString();
  const isMe = target.user_id === me.user_id;
  const person = profiles.get(target.user_id);

  const [blocksRes, sessionsRes, idleRes, appsRes, titlesRes, devicesRes, taskTimeRes, reportsRes, doneRes] = await Promise.all([
    supabase
      .from("activity_blocks")
      .select("block_start, active_seconds, idle_seconds, excluded_seconds")
      .eq("user_id", target.user_id)
      .gte("block_start", from)
      .lt("block_start", to)
      .order("block_start"),
    supabase
      .from("work_sessions")
      .select("id, started_at, ended_at, end_reason, device_id")
      .eq("user_id", target.user_id)
      .lt("started_at", to)
      .or(`ended_at.is.null,ended_at.gt.${from}`)
      .order("started_at"),
    supabase
      .from("idle_periods")
      .select("id, started_at, ended_at, decision, reason")
      .eq("user_id", target.user_id)
      .gte("started_at", from)
      .lt("started_at", to)
      .order("started_at"),
    supabase.rpc("member_top_apps", { p_user: target.user_id, p_from: from, p_to: to, p_limit: 10 }),
    supabase
      .from("app_usage")
      .select("app_name, window_title, seconds")
      .eq("user_id", target.user_id)
      .gte("block_start", from)
      .lt("block_start", to)
      .limit(5000),
    supabase
      .from("devices")
      .select("id, name, os, agent_version, last_seen_at, revoked_at, clock_offset_seconds")
      .eq("user_id", target.user_id)
      .order("last_seen_at", { ascending: false }),
    supabase
      .from("task_time")
      .select("task_id, seconds")
      .eq("user_id", target.user_id)
      .gte("block_start", from)
      .lt("block_start", to)
      .limit(5000),
    supabase
      .from("daily_reports")
      .select("id, summary, created_at")
      .eq("user_id", target.user_id)
      .eq("work_date", date)
      .order("created_at"),
    supabase
      .from("tasks")
      .select("id")
      .eq("assignee_id", target.user_id)
      .gte("completed_at", from)
      .lt("completed_at", to),
  ]);

  const blocks = (blocksRes.data ?? []) as Block[];
  const sessions = (sessionsRes.data ?? []) as Session[];
  const idle = (idleRes.data ?? []) as Idle[];
  const apps = ((appsRes.data ?? []) as Array<{ app_name: string; seconds: number }>).map((a) => ({
    ...a,
    seconds: Number(a.seconds),
  }));
  const devices = (devicesRes.data ?? []) as Device[];
  const reports = (reportsRes.data ?? []) as Array<{ id: string; summary: string; created_at: string }>;

  // Tasks worked on this day: time from the desktop app, plus tasks finished today.
  const taskSeconds = new Map<string, number>();
  for (const r of (taskTimeRes.data ?? []) as Array<{ task_id: string; seconds: number }>) {
    taskSeconds.set(r.task_id, (taskSeconds.get(r.task_id) ?? 0) + r.seconds);
  }
  const doneIds = new Set(((doneRes.data ?? []) as Array<{ id: string }>).map((t) => t.id));
  const taskIds = [...new Set([...taskSeconds.keys(), ...doneIds])];
  const { data: taskInfo } = taskIds.length
    ? await supabase.from("tasks").select("id, title, status").in("id", taskIds)
    : { data: [] };
  const tasksWorked = ((taskInfo ?? []) as Array<{ id: string; title: string; status: TaskStatus }>)
    .map((t) => ({ ...t, seconds: taskSeconds.get(t.id) ?? 0, finishedToday: doneIds.has(t.id) }))
    .sort((a, b) => b.seconds - a.seconds);
  const taskTotal = tasksWorked.reduce((s, t) => s + t.seconds, 0);

  const tracked = blocks.reduce((s, b) => s + b.active_seconds + b.idle_seconds, 0);
  const active = blocks.reduce((s, b) => s + b.active_seconds, 0);
  const removed = blocks.reduce((s, b) => s + b.excluded_seconds, 0);

  // Top window titles (e.g. the website or document in front).
  const titleTotals = new Map<string, { app: string; title: string; seconds: number }>();
  for (const r of (titlesRes.data ?? []) as AppRow[]) {
    if (!r.window_title || r.window_title === "…") continue;
    const key = `${r.app_name}\u0000${r.window_title}`;
    const cur = titleTotals.get(key) ?? { app: r.app_name, title: r.window_title, seconds: 0 };
    cur.seconds += r.seconds;
    titleTotals.set(key, cur);
  }
  const topTitles = [...titleTotals.values()].sort((a, b) => b.seconds - a.seconds).slice(0, 10);

  // Timeline: one column per 10 minutes over the hours that had work (at least 08:00–18:00).
  const slot = (iso: string) => Math.floor((Date.parse(iso) - dayStart.getTime()) / 600_000);
  const bySlot = new Map(blocks.map((b) => [slot(b.block_start), b]));
  const daySlots = Math.round((dayEnd.getTime() - dayStart.getTime()) / 600_000);
  const used = blocks.map((b) => slot(b.block_start));
  const firstHour = Math.min(8, ...used.map((s) => Math.floor(s / 6)));
  const lastHour = Math.max(18, ...used.map((s) => Math.floor(s / 6) + 1));
  const slots = Array.from({ length: Math.min(daySlots, lastHour * 6) - firstHour * 6 }, (_, i) => firstHour * 6 + i);
  const timeline: Column[] = slots.map((s) => {
    const b = bySlot.get(s);
    const hh = String(Math.floor(s / 6)).padStart(2, "0");
    const mm = String((s % 6) * 10).padStart(2, "0");
    return {
      key: String(s),
      label: s % 12 === 0 ? `${hh}:00` : "",
      values: b ? [b.active_seconds / 60, b.idle_seconds / 60] : [0, 0],
      tooltip: b
        ? `${hh}:${mm}\n${Math.round(b.active_seconds / 60)} min active · ${Math.round(b.idle_seconds / 60)} min idle${b.excluded_seconds ? `\n${Math.round(b.excluded_seconds / 60)} min removed` : ""}`
        : `${hh}:${mm}\nNot working`,
    };
  });

  const firstIn = sessions[0]?.started_at;
  const last = sessions[sessions.length - 1];
  const stillWorking = sessions.some((s) => !s.ended_at);
  const here = `/dashboard/activity?user=${target.user_id}&date=${date}`;
  const todayLocal = localDateIn(tz);

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {!isMe && <Avatar name={person?.full_name} email={person?.email} size="lg" />}
            {isMe ? "My activity" : displayName(person)}
          </span>
        }
        meta={`${formatDay(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${tz.replaceAll("_", " ")}`}
        actions={
          <DayNav
            action="/dashboard/activity"
            people={visible.map((m) => ({ id: m.user_id, name: `${displayName(profiles.get(m.user_id))}${m.user_id === me.user_id ? " (you)" : ""}` }))}
            user={target.user_id}
            date={date}
            max={todayLocal}
            prevHref={`/dashboard/activity?user=${target.user_id}&date=${addDays(date, -1)}`}
            nextHref={date < todayLocal ? `/dashboard/activity?user=${target.user_id}&date=${addDays(date, 1)}` : null}
          />
        }
      />

      {params.error && <Notice tone="error">{params.error}</Notice>}

      <StatStrip
        stats={[
          { label: "Hours worked", value: formatHours(tracked), icon: "clock", tone: "brand" },
          { label: "Activity", value: percent(active, tracked), icon: "activity", tone: "green" },
          { label: "First clock-in", value: firstIn ? formatClock(firstIn, tz) : "–", icon: "play", tone: "slate" },
          {
            label: "Last clock-out",
            value: stillWorking ? "Working" : last?.ended_at ? formatClock(last.ended_at, tz) : "–",
            icon: "logout",
            tone: "amber",
          },
        ]}
      />

      {!standard ? (
        <UpgradeCard admin={admin} text="The hour-by-hour timeline and window titles are on the Standard plan." />
      ) : (
        <Panel
          title="Through the day"
          actions={removed > 0 ? <span className="text-xs text-slate-500">{formatHours(removed)} idle removed</span> : undefined}
          bodyClassName="p-5"
        >
          {blocks.length === 0 ? (
            <EmptyState icon="activity" title="No tracked time on this day." className="py-8" />
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[640px]">
                <StackedColumns
                  columns={timeline}
                  series={["Active", "Idle"]}
                  format={(v) => `${Math.round(v)}m`}
                  height={140}
                  dense
                  caption="Minutes active and idle in each 10 minutes"
                />
              </div>
            </div>
          )}
        </Panel>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Tasks" bodyClassName="px-5 pb-4">
          {tasksWorked.length === 0 ? (
            <EmptyState icon="tasks" title="No task picked in the desktop app on this day." className="py-8" />
          ) : (
            <>
              <ul className="divide-y divide-slate-100 text-sm">
                {tasksWorked.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                    <span className="min-w-0">
                      <Link href={`/dashboard/tasks/${t.id}`} className="block truncate font-medium text-slate-900 hover:text-brand-700">{t.title}</Link>
                      {t.finishedToday ? (
                        <span className="flex items-center gap-1 text-xs text-emerald-700"><Icon name="check" className="h-3 w-3" />Finished</span>
                      ) : (
                        <span className="text-xs text-slate-500">{TASK_STATUS_LABEL[t.status]}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-slate-600 tabular-nums">{t.seconds ? formatHours(t.seconds) : "–"}</span>
                  </li>
                ))}
              </ul>
              {tracked > taskTotal + 600 && (
                <p className="pt-2 text-xs text-slate-500">{formatHours(tracked - taskTotal)} with no task picked</p>
              )}
            </>
          )}
        </Panel>

        <Panel title={isMe ? "What I got done" : "What they got done"} bodyClassName="p-5">
          {reports.length === 0 ? (
            <EmptyState icon="pencil" title="No end-of-day report." className="py-6" />
          ) : (
            <ul className="space-y-4 text-sm">
              {reports.map((r) => (
                <li key={r.id} className="border-l-2 border-marigold-400 pl-3">
                  <p className="text-xs text-slate-500">At clock-out, {formatClock(r.created_at, tz)}</p>
                  <p className="mt-1 leading-6 break-words whitespace-pre-wrap text-slate-700">{r.summary}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Apps" bodyClassName="p-5">
          {apps.length === 0 ? (
            <EmptyState icon="monitor" title="No app data for this day." className="py-6" />
          ) : (
            <BarList rows={apps.map((a) => ({ key: a.app_name, label: a.app_name, value: a.seconds }))} format={formatHours} />
          )}
        </Panel>

        <Panel title="Top windows" bodyClassName="px-5 pb-3">
          {!standard ? (
            <p className="py-5 text-sm text-slate-500">Window titles are on the Standard plan.</p>
          ) : topTitles.length === 0 ? (
            <EmptyState icon="monitor" title="No window titles for this day." className="py-6" />
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {topTitles.map((t) => (
                <li key={`${t.app}-${t.title}`} className="flex justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-slate-800">{t.title}</span>
                    <span className="text-xs text-slate-500">{t.app}</span>
                  </span>
                  <span className="shrink-0 text-slate-600 tabular-nums">{formatHours(t.seconds)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Clock-ins" bodyClassName="px-5 pb-3">
          {sessions.length === 0 ? (
            <EmptyState icon="clock" title="No clock-ins on this day." className="py-6" />
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {sessions.map((s) => (
                <li key={s.id} className="flex justify-between gap-3 py-2.5">
                  <span className="text-slate-800 tabular-nums">
                    {formatClock(s.started_at, tz)} – {s.ended_at ? formatClock(s.ended_at, tz) : "now"}
                  </span>
                  <span className="text-slate-500">{s.ended_at ? (END_REASON[s.end_reason ?? ""] ?? "") : "Working"}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Away from the computer" bodyClassName="px-5 pb-3">
          {idle.length === 0 ? (
            <EmptyState icon="leave" title="No long breaks." className="py-6" />
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {idle.map((i) => (
                <li key={i.id} className="flex justify-between gap-3 py-2.5">
                  <span>
                    <span className="text-slate-800 tabular-nums">
                      {formatClock(i.started_at, tz)} – {i.ended_at ? formatClock(i.ended_at, tz) : "now"}
                    </span>
                    {i.reason && <span className="block text-xs text-slate-500">“{i.reason}”</span>}
                  </span>
                  <span
                    className={cn(
                      "badge h-fit",
                      i.decision === "kept" ? "bg-emerald-100 text-emerald-800" : i.decision === "discarded" ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-800",
                    )}
                  >
                    {i.decision === "kept" ? "Counted" : i.decision === "discarded" ? "Removed" : "No answer"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {(admin || isMe) && (
        <Panel title="Computers" bodyClassName="px-5 pb-3">
          {devices.length === 0 ? (
            <EmptyState
              icon="monitor"
              title="The desktop app hasn't been used yet."
              action={isMe ? <Link href="/download" className="btn-primary btn-sm">Download the app</Link> : undefined}
              className="py-6"
            />
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {devices.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                      <Icon name="monitor" className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="font-medium text-slate-900">{d.name || "Computer"}</span>{" "}
                      <span className="text-slate-500">{d.os} · app {d.agent_version}</span>
                      <span className="block text-xs text-slate-500">
                        {d.revoked_at
                          ? "Disconnected"
                          : d.last_seen_at
                            ? `Last seen ${formatDay(localDateIn(tz, new Date(d.last_seen_at)), { day: "numeric", month: "short" })}, ${formatClock(d.last_seen_at, tz)}`
                            : "Never seen"}
                        {Math.abs(d.clock_offset_seconds) > 300 && " · clock is wrong"}
                      </span>
                    </span>
                  </span>
                  {admin && !d.revoked_at && (
                    <form action={disconnectDevice}>
                      <input type="hidden" name="device_id" value={d.id} />
                      <input type="hidden" name="back" value={here} />
                      <ConfirmSubmit message={`Disconnect ${d.name || "this computer"}? The desktop app there stops tracking and logs out.`}>
                        Disconnect
                      </ConfirmSubmit>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
}

function UpgradeCard({ text, admin }: { text: string; admin: boolean }) {
  return (
    <Notice
      tone="info"
      action={admin ? <Link href="/dashboard/billing" className="btn-primary btn-sm">See plans</Link> : <span className="text-xs">Ask your admin about upgrading.</span>}
    >
      {text}
    </Notice>
  );
}
