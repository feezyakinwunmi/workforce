import type { SupabaseClient } from "@supabase/supabase-js";
import type { Membership } from "@/lib/types";

export type TaskStatus = "todo" | "in_progress" | "review" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type ProjectColor = "violet" | "blue" | "green" | "amber" | "red" | "pink" | "slate";

export type Project = {
  id: string;
  name: string;
  description: string | null;
  color: ProjectColor;
  archived_at: string | null;
  created_at: string;
};

export type Task = {
  id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string | null;
  due_date: string | null;
  estimate_minutes: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type TaskComment = { id: string; task_id: string; author_id: string | null; body: string; created_at: string };

export const TASK_COLUMNS =
  "id, project_id, title, description, status, priority, assignee_id, due_date, estimate_minutes, created_by, created_at, updated_at, completed_at";

export const STATUSES: TaskStatus[] = ["todo", "in_progress", "review", "done"];
export const PRIORITIES: TaskPriority[] = ["urgent", "high", "medium", "low"];
export const PROJECT_COLORS: ProjectColor[] = ["violet", "blue", "green", "amber", "red", "pink", "slate"];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  review: "In review",
  done: "Done",
};

export const STATUS_STYLE: Record<TaskStatus, string> = {
  todo: "bg-slate-100 text-slate-700",
  in_progress: "bg-blue-100 text-blue-800",
  review: "bg-amber-100 text-amber-800",
  done: "bg-emerald-100 text-emerald-800",
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const PRIORITY_STYLE: Record<TaskPriority, string> = {
  urgent: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-slate-100 text-slate-600",
  low: "bg-slate-50 text-slate-400",
};

/** Small coloured dot / badge per project. Full class names so Tailwind keeps them. */
export const PROJECT_DOT: Record<ProjectColor, string> = {
  violet: "bg-violet-500",
  blue: "bg-blue-500",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  pink: "bg-pink-500",
  slate: "bg-slate-500",
};

export const isManagerOrAdmin = (m: Membership) => m.role === "owner" || m.role === "admin" || m.role === "manager";

/**
 * What the current user may do with a task. Mirrors the database trigger
 * (private.guard_task); the database still checks every change.
 */
export function taskPermissions(me: Membership, task: Pick<Task, "created_by" | "assignee_id">) {
  const manager = isManagerOrAdmin(me);
  const creator = task.created_by === me.user_id;
  const assignee = task.assignee_id === me.user_id;
  return {
    editAll: manager || creator, // title, description, project, priority, due date, estimate
    assignOthers: manager, // creators who aren't managers may only assign themselves
    changeStatus: manager || creator || assignee,
    remove: manager || creator,
  };
}

export const isOverdue = (t: Pick<Task, "due_date" | "status">, today: string) =>
  Boolean(t.due_date && t.status !== "done" && t.due_date < today);

/** Seconds logged per task (only time of people the viewer may see). */
export async function loadTaskTime(supabase: SupabaseClient, taskIds: string[]) {
  const perTask = new Map<string, number>();
  const perTaskUser = new Map<string, Map<string, number>>();
  if (!taskIds.length) return { perTask, perTaskUser };
  const { data } = await supabase.rpc("task_time_totals", { p_task_ids: taskIds });
  for (const row of (data ?? []) as Array<{ task_id: string; user_id: string; seconds: number }>) {
    const secs = Number(row.seconds);
    perTask.set(row.task_id, (perTask.get(row.task_id) ?? 0) + secs);
    const users = perTaskUser.get(row.task_id) ?? new Map<string, number>();
    users.set(row.user_id, secs);
    perTaskUser.set(row.task_id, users);
  }
  return { perTask, perTaskUser };
}

/** Read and check the task fields shared by the create and edit forms. */
export function readTaskForm(formData: FormData) {
  const str = (k: string) => String(formData.get(k) ?? "").trim();
  const title = str("title");
  const description = str("description");
  const status = str("status") as TaskStatus;
  const priority = str("priority") as TaskPriority;
  const due = str("due_date");
  const estimateHours = str("estimate_hours");

  if (!title) return { error: "Give the task a title." } as const;
  if (title.length > 200) return { error: "Keep the title under 200 characters." } as const;
  if (description.length > 5000) return { error: "The description is too long (5,000 characters max)." } as const;
  if (status && !STATUSES.includes(status)) return { error: "Unknown status." } as const;
  if (priority && !PRIORITIES.includes(priority)) return { error: "Unknown priority." } as const;
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return { error: "Pick a valid due date." } as const;
  const estimate = estimateHours ? Math.round(Number(estimateHours) * 60) : null;
  if (estimate !== null && (!Number.isFinite(estimate) || estimate < 0 || estimate > 100000)) {
    return { error: "Enter the estimate in hours, e.g. 1.5." } as const;
  }

  return {
    values: {
      title,
      description: description || null,
      project_id: str("project_id") || null,
      assignee_id: str("assignee_id") || null,
      priority: priority || "medium",
      due_date: due || null,
      estimate_minutes: estimate,
      ...(status ? { status } : {}),
    },
  } as const;
}
