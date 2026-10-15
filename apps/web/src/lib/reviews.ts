import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "@/lib/time";
import { loadDayStats } from "@/lib/tracking";

export type Goal = {
  id: string;
  user_id: string;
  title: string;
  details: string | null;
  due_on: string | null;
  progress: number;
  status: "active" | "done" | "dropped";
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
export const GOAL_COLUMNS = "id, user_id, title, details, due_on, progress, status, created_by, created_at, updated_at";

export type ReviewStatus = "self_review" | "manager_review" | "shared" | "acknowledged";
export type Review = {
  id: string;
  user_id: string;
  reviewer_id: string | null;
  title: string;
  period_start: string;
  period_end: string;
  status: ReviewStatus;
  self_assessment: string | null;
  self_submitted_at: string | null;
  stats: Partial<PeriodStats>;
  shared_at: string | null;
  acknowledged_at: string | null;
  acknowledgement: string | null;
  created_at: string;
};
export const REVIEW_COLUMNS =
  "id, user_id, reviewer_id, title, period_start, period_end, status, self_assessment, self_submitted_at, stats, shared_at, acknowledged_at, acknowledgement, created_at";

export type Feedback = { rating: number | null; strengths: string | null; improvements: string | null; summary: string | null; updated_at: string };

export const REVIEW_STATUS: Record<ReviewStatus, { label: string; style: string }> = {
  self_review: { label: "Self-assessment", style: "bg-sky-50 text-sky-700" },
  manager_review: { label: "Being written", style: "bg-amber-100 text-amber-800" },
  shared: { label: "Shared", style: "bg-brand-100 text-brand-700" },
  acknowledged: { label: "Done", style: "bg-emerald-100 text-emerald-800" },
};

export const RATING_LABEL = ["", "Below expectations", "Partly meets", "Meets expectations", "Exceeds", "Outstanding"];

/** What the app already knows about a period: the facts a review starts from. */
export type PeriodStats = {
  hours: number;
  days_worked: number;
  activity_pct: number | null;
  tasks_done: number;
  tasks_on_time: number;
  tasks_with_due: number;
  leave_days: number;
  goals_done: number;
  goals_total: number;
};

export async function periodStats(supabase: SupabaseClient, userId: string, from: string, to: string): Promise<PeriodStats> {
  const [stats, { data: tasks }, { data: leave }, { data: goals }] = await Promise.all([
    loadDayStats(supabase, from, to),
    supabase
      .from("tasks")
      .select("completed_at, due_date")
      .eq("assignee_id", userId)
      .eq("status", "done")
      .gte("completed_at", `${from}T00:00:00Z`)
      .lt("completed_at", `${addDays(to, 1)}T00:00:00Z`),
    supabase.from("leave_requests").select("start_date, end_date, days").eq("user_id", userId).eq("status", "approved").lte("start_date", to).gte("end_date", from),
    supabase.from("goals").select("status, due_on, updated_at").eq("user_id", userId).neq("status", "dropped"),
  ]);
  let tracked = 0;
  let active = 0;
  let phone = 0;
  let days = 0;
  for (const [key, s] of stats) {
    if (!key.startsWith(`${userId}|`)) continue;
    tracked += s.tracked_seconds;
    active += s.active_seconds;
    phone += s.phone_seconds;
    if (s.tracked_seconds > 0) days++;
  }
  const done = (tasks ?? []) as Array<{ completed_at: string; due_date: string | null }>;
  const withDue = done.filter((t) => t.due_date);
  const g = (goals ?? []) as Array<{ status: string; due_on: string | null }>;
  const inPeriod = g.filter((x) => !x.due_on || (x.due_on >= from && x.due_on <= to) || x.status === "done");
  return {
    hours: Math.round((tracked / 3600) * 10) / 10,
    days_worked: days,
    activity_pct: tracked - phone > 0 ? Math.round((active / (tracked - phone)) * 100) : null,
    tasks_done: done.length,
    tasks_on_time: withDue.filter((t) => t.completed_at.slice(0, 10) <= t.due_date!).length,
    tasks_with_due: withDue.length,
    leave_days: ((leave ?? []) as Array<{ days: number }>).reduce((s, l) => s + Number(l.days), 0),
    goals_done: inPeriod.filter((x) => x.status === "done").length,
    goals_total: inPeriod.length,
  };
}

/** The last full quarter before a date, e.g. 1 Jul – 30 Sep. */
export function lastQuarter(today: string) {
  const [y, m] = today.split("-").map(Number);
  const q = Math.floor((m - 1) / 3); // current quarter 0..3
  const startMonth = q === 0 ? 10 : (q - 1) * 3 + 1;
  const year = q === 0 ? y - 1 : y;
  const from = `${year}-${String(startMonth).padStart(2, "0")}-01`;
  const end = new Date(Date.UTC(year, startMonth - 1 + 3, 0)).toISOString().slice(0, 10);
  return { from, to: end, label: `Q${q === 0 ? 4 : q} ${year} review` };
}
