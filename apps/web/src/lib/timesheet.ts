import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, isValidDate, localDateIn, mondayOf } from "@/lib/time";
import { displayName, loadDayStats, loadPeople, visibleMembers } from "@/lib/tracking";
import type { Membership } from "@/lib/types";

export type TimesheetRow = {
  userId: string;
  name: string;
  email: string;
  timezone: string;
  days: Array<{ date: string; tracked: number; active: number; leave: string | null }>;
  total: number;
  active: number;
  leaveDays: number;
};

/** A Monday-to-Sunday timesheet for everyone the viewer may see. Days follow each person's own time zone. */
export async function buildTimesheet(supabase: SupabaseClient, me: Membership, weekParam?: string) {
  const week = mondayOf(isValidDate(weekParam) ? weekParam : localDateIn(me.timezone));
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));

  const { members, teams, profiles } = await loadPeople(supabase, { includeRemoved: true });
  const people = visibleMembers(me, members, teams);
  const [stats, { data: holidayRows }, { data: leaveRows }, { data: typeRows }] = await Promise.all([
    loadDayStats(supabase, days[0], days[6]),
    supabase.from("holidays").select("day, name").gte("day", days[0]).lte("day", days[6]),
    supabase
      .from("leave_requests")
      .select("user_id, start_date, end_date, leave_type_id")
      .eq("status", "approved")
      .lte("start_date", days[6])
      .gte("end_date", days[0]),
    supabase.from("leave_types").select("id, name"),
  ]);
  const typeName = new Map(((typeRows ?? []) as Array<{ id: string; name: string }>).map((t) => [t.id, t.name]));
  const holidays = new Map(((holidayRows ?? []) as Array<{ day: string; name: string }>).map((h) => [h.day, h.name]));
  const leave = (leaveRows ?? []) as Array<{ user_id: string; start_date: string; end_date: string; leave_type_id: string }>;
  const isWeekday = (date: string) => {
    const d = new Date(`${date}T00:00:00Z`).getUTCDay();
    return d !== 0 && d !== 6;
  };

  const rows: TimesheetRow[] = people
    .map((m) => {
      const p = profiles.get(m.user_id);
      const cells = days.map((date) => {
        const s = stats.get(`${m.user_id}|${date}`);
        const onLeave = isWeekday(date) && !holidays.has(date)
          ? leave.find((l) => l.user_id === m.user_id && l.start_date <= date && l.end_date >= date)
          : undefined;
        return {
          date,
          tracked: s?.tracked_seconds ?? 0,
          active: s?.active_seconds ?? 0,
          leave: onLeave ? (typeName.get(onLeave.leave_type_id) ?? "Leave") : null,
        };
      });
      return {
        userId: m.user_id,
        name: displayName(p),
        email: p?.email ?? "",
        timezone: m.timezone,
        days: cells,
        total: cells.reduce((s, c) => s + c.tracked, 0),
        active: cells.reduce((s, c) => s + c.active, 0),
        leaveDays: cells.filter((c) => c.leave).length,
      };
    })
    // Hide people removed from the company unless they tracked time this week.
    .filter((r) => r.total > 0 || members.find((m) => m.user_id === r.userId)?.status !== "removed")
    .sort((a, b) => a.name.localeCompare(b.name));

  return { week, days, rows, holidays };
}
