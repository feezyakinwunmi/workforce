import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, localDateIn } from "@/lib/time";
import type { Membership, Profile, Team } from "@/lib/types";

/** tracked = all worked time (desktop + phone); phone time has no activity measure, so activity % = active ÷ (tracked − phone). */
export type DayStat = { user_id: string; work_date: string; tracked_seconds: number; active_seconds: number; phone_seconds: number };

export type OpenSession = {
  id: string;
  user_id: string;
  started_at: string;
  last_heartbeat_at: string | null;
  last_state: "active" | "idle" | null;
  current_app: string | null;
  source: "desktop" | "phone";
};

export type LiveStatus = "working" | "phone" | "idle" | "offline" | "not_working";

/** A heartbeat older than this means the app stopped reporting (closed, no internet, laptop off). */
const HEARTBEAT_STALE_MS = 3 * 60_000;

/**
 * People whose time the current user can look at. Mirrors the database rule
 * (private.visible_member_ids); the database still enforces it on every query.
 */
export function visibleMembers(me: Membership, members: Membership[], teams: Team[]): Membership[] {
  if (me.role === "owner" || me.role === "admin") return members;
  if (me.role === "manager") {
    const managed = new Set(teams.filter((t) => t.manager_id === me.user_id).map((t) => t.id));
    return members.filter(
      (m) => m.user_id === me.user_id || (m.team_id && (m.team_id === me.team_id || managed.has(m.team_id))),
    );
  }
  return members.filter((m) => m.user_id === me.user_id);
}

export function liveStatus(session: OpenSession | undefined): LiveStatus {
  if (!session) return "not_working";
  if (session.source === "phone") return "phone";
  const beat = session.last_heartbeat_at ? Date.parse(session.last_heartbeat_at) : Date.parse(session.started_at);
  if (Date.now() - beat > HEARTBEAT_STALE_MS) return "offline";
  return session.last_state === "idle" ? "idle" : "working";
}

export const STATUS_LABEL: Record<LiveStatus, string> = {
  working: "Working",
  phone: "On phone",
  idle: "Idle",
  offline: "App not reporting",
  not_working: "Not working",
};

export const STATUS_STYLE: Record<LiveStatus, string> = {
  working: "bg-emerald-100 text-emerald-800",
  phone: "bg-emerald-100 text-emerald-800",
  idle: "bg-amber-100 text-amber-800",
  offline: "bg-slate-200 text-slate-700",
  not_working: "bg-slate-100 text-slate-500",
};

/** Members, profiles and teams of the company, in one go. */
export async function loadPeople(supabase: SupabaseClient, { includeRemoved = false } = {}) {
  const memberQuery = supabase.from("memberships").select("*").order("joined_at");
  const [{ data: memberRows }, { data: teamRows }] = await Promise.all([
    includeRemoved ? memberQuery : memberQuery.neq("status", "removed"),
    supabase.from("teams").select("id, name, manager_id").order("name"),
  ]);
  const members = (memberRows ?? []) as Membership[];
  const { data: profileRows } = members.length
    ? await supabase.from("profiles").select("id, email, full_name, avatar_url").in("id", members.map((m) => m.user_id))
    : { data: [] };
  const profiles = new Map(((profileRows ?? []) as Profile[]).map((p) => [p.id, p]));
  return { members, teams: (teamRows ?? []) as Team[], profiles };
}

/** Day totals keyed "userId|YYYY-MM-DD", each day in that person's own time zone. */
export async function loadDayStats(supabase: SupabaseClient, from: string, to: string) {
  const { data } = await supabase.rpc("member_day_totals", { p_from: from, p_to: to });
  const map = new Map<string, DayStat>();
  for (const row of (data ?? []) as DayStat[]) {
    map.set(`${row.user_id}|${row.work_date}`, {
      ...row,
      tracked_seconds: Number(row.tracked_seconds),
      active_seconds: Number(row.active_seconds),
      phone_seconds: Number(row.phone_seconds ?? 0),
    });
  }
  return map;
}

/** Today's totals for each member, where "today" is their own local date. */
export async function loadToday(supabase: SupabaseClient, members: Membership[]) {
  const utcToday = new Date().toISOString().slice(0, 10);
  const stats = await loadDayStats(supabase, addDays(utcToday, -1), addDays(utcToday, 1));
  const today = new Map<string, DayStat | undefined>();
  for (const m of members) today.set(m.user_id, stats.get(`${m.user_id}|${localDateIn(m.timezone)}`));
  return today;
}

export async function loadOpenSessions(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("work_sessions")
    .select("id, user_id, started_at, last_heartbeat_at, last_state, current_app, source")
    .is("ended_at", null);
  return new Map(((data ?? []) as OpenSession[]).map((s) => [s.user_id, s]));
}

export function displayName(p: Profile | undefined) {
  return p?.full_name || p?.email || "Unknown";
}
