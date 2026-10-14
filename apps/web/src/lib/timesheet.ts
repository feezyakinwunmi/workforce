import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, isValidDate, localDateIn, mondayOf } from "@/lib/time";
import { displayName, loadDayStats, loadPeople, visibleMembers } from "@/lib/tracking";
import type { Membership } from "@/lib/types";

export type TimesheetRow = {
  userId: string;
  name: string;
  email: string;
  timezone: string;
  days: Array<{ date: string; tracked: number; active: number }>;
  total: number;
  active: number;
};

/** A Monday-to-Sunday timesheet for everyone the viewer may see. Days follow each person's own time zone. */
export async function buildTimesheet(supabase: SupabaseClient, me: Membership, weekParam?: string) {
  const week = mondayOf(isValidDate(weekParam) ? weekParam : localDateIn(me.timezone));
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));

  const { members, teams, profiles } = await loadPeople(supabase, { includeRemoved: true });
  const people = visibleMembers(me, members, teams);
  const stats = await loadDayStats(supabase, days[0], days[6]);

  const rows: TimesheetRow[] = people
    .map((m) => {
      const p = profiles.get(m.user_id);
      const cells = days.map((date) => {
        const s = stats.get(`${m.user_id}|${date}`);
        return { date, tracked: s?.tracked_seconds ?? 0, active: s?.active_seconds ?? 0 };
      });
      return {
        userId: m.user_id,
        name: displayName(p),
        email: p?.email ?? "",
        timezone: m.timezone,
        days: cells,
        total: cells.reduce((s, c) => s + c.tracked, 0),
        active: cells.reduce((s, c) => s + c.active, 0),
      };
    })
    // Hide people removed from the company unless they tracked time this week.
    .filter((r) => r.total > 0 || members.find((m) => m.user_id === r.userId)?.status !== "removed")
    .sort((a, b) => a.name.localeCompare(b.name));

  return { week, days, rows };
}
