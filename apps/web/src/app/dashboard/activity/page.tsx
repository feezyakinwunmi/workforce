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
  const maxApp = Math.max(1, ...apps.map((a) => a.seconds));

  // Timeline: one bar per 10 minutes over the hours that had work (at least 08:00–18:00).
  const slot = (iso: string) => Math.floor((Date.parse(iso) - dayStart.getTime()) / 600_000);
  const bySlot = new Map(blocks.map((b) => [slot(b.block_start), b]));
  const daySlots = Math.round((dayEnd.getTime() - dayStart.getTime()) / 600_000);
  const used = blocks.map((b) => slot(b.block_start));
  const firstHour = Math.min(8, ...used.map((s) => Math.floor(s / 6)));
  const lastHour = Math.max(18, ...used.map((s) => Math.floor(s / 6) + 1));
  const slots = Array.from({ length: Math.min(daySlots, lastHour * 6) - firstHour * 6 }, (_, i) => firstHour * 6 + i);

  const firstIn = sessions[0]?.started_at;
  const last = sessions[sessions.length - 1];
  const stillWorking = sessions.some((s) => !s.ended_at);
  const here = `/dashboard/activity?user=${target.user_id}&date=${date}`;
  const todayLocal = localDateIn(tz);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{isMe ? "My activity" : displayName(person)}</h1>
          <p className="mt-1 text-slate-600">
            {formatDay(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} ·{" "}
            {tz.replaceAll("_", " ")} time
          </p>
        </div>
        <form className="flex flex-wrap items-center gap-2" action="/dashboard/activity">
          {visible.length > 1 && (
            <select name="user" defaultValue={target.user_id} className="input w-auto" aria-label="Member">
              {visible.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {displayName(profiles.get(m.user_id))}
                  {m.user_id === me.user_id ? " (you)" : ""}
                </option>
              ))}
            </select>
          )}
          {visible.length <= 1 && <input type="hidden" name="user" value={target.user_id} />}
          <input type="date" name="date" defaultValue={date} className="input w-auto" aria-label="Date" />
          <button className="btn-secondary">Show</button>
          <Link className="btn-secondary" href={`/dashboard/activity?user=${target.user_id}&date=${addDays(date, -1)}`} aria-label="Previous day">←</Link>
          {date < todayLocal && (
            <Link className="btn-secondary" href={`/dashboard/activity?user=${target.user_id}&date=${addDays(date, 1)}`} aria-label="Next day">→</Link>
          )}
        </form>
      </header>

      {params.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{params.error}</p>}

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Hours worked", value: formatHours(tracked) },
          { label: "Activity", value: percent(active, tracked) },
          { label: "First clock-in", value: firstIn ? formatClock(firstIn, tz) : "–" },
          {
            label: "Last clock-out",
            value: stillWorking ? "Still working" : last?.ended_at ? formatClock(last.ended_at, tz) : "–",
          },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold">{s.value}</p>
          </div>
        ))}
      </section>

      {(tasksWorked.length > 0 || reports.length > 0) && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card p-5">
            <h2 className="mb-3 font-semibold">Tasks worked on</h2>
            {tasksWorked.length === 0 ? (
              <p className="text-sm text-slate-500">No task was picked in the desktop app on this day.</p>
            ) : (
              <>
                <ul className="divide-y divide-slate-100 text-sm">
                  {tasksWorked.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <Link href={`/dashboard/tasks/${t.id}`} className="block truncate font-medium hover:text-brand-700">{t.title}</Link>
                        {t.finishedToday ? (
                          <span className="text-xs text-emerald-700">Finished this day</span>
                        ) : (
                          <span className="text-xs text-slate-400">{TASK_STATUS_LABEL[t.status]}</span>
                        )}
                      </span>
                      <span className="shrink-0 tabular-nums text-slate-600">{t.seconds ? formatHours(t.seconds) : "–"}</span>
                    </li>
                  ))}
                </ul>
                {tracked > taskTotal + 600 && (
                  <p className="mt-2 text-xs text-slate-500">{formatHours(tracked - taskTotal)} of the day had no task picked.</p>
                )}
              </>
            )}
          </section>

          <section className="card p-5">
            <h2 className="mb-3 font-semibold">{isMe ? "What I got done" : "What they got done"}</h2>
            {reports.length === 0 ? (
              <p className="text-sm text-slate-500">No end-of-day report. It&apos;s written in the desktop app when clocking out.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {reports.map((r) => (
                  <li key={r.id}>
                    <p className="text-xs text-slate-400">At clock-out, {formatClock(r.created_at, tz)}</p>
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-slate-700">{r.summary}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {!standard ? (
        <UpgradeCard admin={admin} text="See the hour-by-hour timeline of every day, and which document or website was open, on the Standard plan." />
      ) : (
      <section className="card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Through the day</h2>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <Legend className="bg-emerald-500" label="60%+ active" />
            <Legend className="bg-amber-400" label="30–60%" />
            <Legend className="bg-red-400" label="under 30%" />
            <Legend className="bg-slate-300" label="idle time removed" />
          </div>
        </div>
        {blocks.length === 0 ? (
          <p className="text-sm text-slate-500">No tracked time on this day.</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              <div className="flex h-24 items-end gap-px rounded-lg bg-slate-50 p-1" role="img" aria-label="Activity per 10 minutes">
                {slots.map((s) => {
                  const b = bySlot.get(s);
                  const worked = b ? b.active_seconds + b.idle_seconds : 0;
                  const pct = worked ? b!.active_seconds / worked : 0;
                  const color = pct >= 0.6 ? "bg-emerald-500" : pct >= 0.3 ? "bg-amber-400" : "bg-red-400";
                  return (
                    <div key={s} className="flex h-full flex-1 flex-col justify-end" title={b ? `${formatClock(b.block_start, tz)} · ${Math.round(worked / 60)} min worked, ${Math.round(pct * 100)}% active` : undefined}>
                      {b && b.excluded_seconds > 0 && (
                        <div className="bg-slate-300" style={{ height: `${Math.round((b.excluded_seconds / 600) * 100)}%` }} />
                      )}
                      {b && worked > 0 && (
                        <div className={cn("rounded-t-sm", color)} style={{ height: `${Math.max(6, Math.round((worked / 600) * 100))}%` }} />
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-1 flex text-[11px] text-slate-400">
                {Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i).map((h) => (
                  <div key={h} className="flex-1">{h % 2 === 0 ? `${String(h).padStart(2, "0")}:00` : ""}</div>
                ))}
              </div>
            </div>
          </div>
        )}
        {removed > 0 && (
          <p className="mt-3 text-xs text-slate-500">{formatHours(removed)} of idle time was removed and is not counted.</p>
        )}
      </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Apps</h2>
          {apps.length === 0 ? (
            <p className="text-sm text-slate-500">No app data for this day (or app tracking is off).</p>
          ) : (
            <ul className="space-y-2.5">
              {apps.map((a) => (
                <li key={a.app_name} className="text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="truncate font-medium">{a.app_name}</span>
                    <span className="shrink-0 tabular-nums text-slate-600">{formatHours(a.seconds)}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.round((a.seconds / maxApp) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Top windows</h2>
          {!standard ? (
            <p className="text-sm text-slate-500">Window titles (which document or website) are part of the Standard plan.</p>
          ) : topTitles.length === 0 ? (
            <p className="text-sm text-slate-500">No window titles for this day.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {topTitles.map((t) => (
                <li key={`${t.app}-${t.title}`} className="flex justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate">{t.title}</span>
                    <span className="text-xs text-slate-400">{t.app}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-slate-600">{formatHours(t.seconds)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Clock-ins</h2>
          {sessions.length === 0 ? (
            <p className="text-sm text-slate-500">No sessions on this day.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {sessions.map((s) => (
                <li key={s.id} className="flex justify-between gap-3 py-2">
                  <span>
                    {formatClock(s.started_at, tz)} – {s.ended_at ? formatClock(s.ended_at, tz) : "now"}
                  </span>
                  <span className="text-slate-500">{s.ended_at ? (END_REASON[s.end_reason ?? ""] ?? "") : "Working"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Away from the computer</h2>
          {idle.length === 0 ? (
            <p className="text-sm text-slate-500">No long idle periods.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {idle.map((i) => (
                <li key={i.id} className="flex justify-between gap-3 py-2">
                  <span>
                    {formatClock(i.started_at, tz)} – {i.ended_at ? formatClock(i.ended_at, tz) : "now"}
                    {i.reason && <span className="block text-xs text-slate-500">“{i.reason}”</span>}
                  </span>
                  <span
                    className={cn(
                      "badge h-fit",
                      i.decision === "kept" ? "bg-emerald-100 text-emerald-800" : i.decision === "discarded" ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-800",
                    )}
                  >
                    {i.decision === "kept" ? "Counted as work" : i.decision === "discarded" ? "Removed" : "No answer yet"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {(admin || isMe) && (
        <section className="card p-5">
          <h2 className="mb-1 font-semibold">Computers</h2>
          <p className="mb-3 text-sm text-slate-500">Where the desktop app is logged in.</p>
          {devices.length === 0 ? (
            <p className="text-sm text-slate-500">The desktop app hasn&apos;t been used yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {devices.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <span>
                    <span className="font-medium">{d.name || "Computer"}</span>{" "}
                    <span className="text-slate-500">· {d.os} · app {d.agent_version}</span>
                    <span className="block text-xs text-slate-400">
                      {d.revoked_at
                        ? "Disconnected"
                        : d.last_seen_at
                          ? `Last seen ${formatDay(localDateIn(tz, new Date(d.last_seen_at)), { day: "numeric", month: "short" })} at ${formatClock(d.last_seen_at, tz)}`
                          : "Never seen"}
                      {Math.abs(d.clock_offset_seconds) > 300 && " · this computer's clock is wrong"}
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
        </section>
      )}
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn("h-2.5 w-2.5 rounded-sm", className)} aria-hidden />
      {label}
    </span>
  );
}

function UpgradeCard({ text, admin }: { text: string; admin: boolean }) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-brand-200 bg-brand-50 p-5">
      <p className="text-sm text-brand-900">{text}</p>
      {admin ? (
        <Link href="/dashboard/billing" className="btn-primary btn-sm">See plans</Link>
      ) : (
        <span className="text-xs text-brand-900/70">Ask your company admin about upgrading.</span>
      )}
    </section>
  );
}
