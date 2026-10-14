import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoSubmitSelect } from "@/components/form";
import { requireMember } from "@/lib/session";
import {
  isOverdue,
  loadTaskTime,
  PRIORITY_LABEL,
  PRIORITY_STYLE,
  PROJECT_DOT,
  STATUS_LABEL,
  STATUS_STYLE,
  STATUSES,
  TASK_COLUMNS,
  taskPermissions,
  type Project,
  type Task,
  type TaskComment,
} from "@/lib/tasks";
import { formatClock, formatDay, formatHours, localDateIn } from "@/lib/time";
import { displayName, loadPeople } from "@/lib/tracking";
import { isAdminRole } from "@/lib/types";
import { cn, initials } from "@/lib/utils";
import { ConfirmSubmit } from "../../team/forms";
import { deleteComment, deleteTask, setTaskStatus } from "../actions";
import { CommentForm, TaskForm } from "../forms";
import { Icon } from "@/components/icons";
import { Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Task" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const { supabase, member: me } = await requireMember();

  const { data: taskRow } = await supabase.from("tasks").select(TASK_COLUMNS).eq("id", id).maybeSingle();
  if (!taskRow) notFound();
  const task = taskRow as Task;

  const [{ data: projectRows }, { data: commentRows }, { members, profiles }, time] = await Promise.all([
    supabase.from("projects").select("id, name, description, color, archived_at, created_at").order("name"),
    supabase.from("task_comments").select("id, task_id, author_id, body, created_at").eq("task_id", id).order("created_at").limit(500),
    loadPeople(supabase, { includeRemoved: true }),
    loadTaskTime(supabase, [id]),
  ]);
  const projects = (projectRows ?? []) as Project[];
  const comments = (commentRows ?? []) as TaskComment[];
  const project = projects.find((p) => p.id === task.project_id);
  const can = taskPermissions(me, task);
  const tz = me.timezone;
  const today = localDateIn(tz);
  const here = `/dashboard/tasks/${id}`;
  const logged = time.perTask.get(id) ?? 0;
  const perPerson = [...(time.perTaskUser.get(id) ?? new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]);

  // Assignee choices: managers pick anyone active; creators only themselves (plus whoever has it now).
  const active = members.filter((m) => m.status === "active");
  const pickable = can.assignOthers
    ? active
    : active.filter((m) => m.user_id === me.user_id || m.user_id === task.assignee_id);
  const people = pickable.map((m) => ({
    value: m.user_id,
    label: `${displayName(profiles.get(m.user_id))}${m.user_id === me.user_id ? " (me)" : ""}`,
  }));
  const projectOptions = projects
    .filter((p) => !p.archived_at || p.id === task.project_id)
    .map((p) => ({ value: p.id, label: p.name }));

  const when = (iso: string) =>
    `${formatDay(localDateIn(tz, new Date(iso)), { day: "numeric", month: "short" })}, ${formatClock(iso, tz)}`;

  return (
    <div className="space-y-6">
      <Link href="/dashboard/tasks" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <Icon name="chevronLeft" className="h-4 w-4" />
        Tasks
      </Link>

      {error && <Notice tone="error">{error}</Notice>}

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="page-title break-words">{task.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span className={cn("badge", STATUS_STYLE[task.status])}>{STATUS_LABEL[task.status]}</span>
            <span className={cn("badge", PRIORITY_STYLE[task.priority])}>{PRIORITY_LABEL[task.priority]} priority</span>
            {project && (
              <Link href={`/dashboard/tasks?view=all&project=${project.id}`} className="flex items-center gap-1.5 hover:text-brand-700">
                <span className={cn("h-2 w-2 rounded-full", PROJECT_DOT[project.color])} aria-hidden />
                {project.name}
              </Link>
            )}
          </div>
        </div>
        {can.changeStatus && (
          <form action={setTaskStatus} className="w-40">
            <input type="hidden" name="id" value={task.id} />
            <input type="hidden" name="back" value={here} />
            <p className="label">Status</p>
            <AutoSubmitSelect
              name="status"
              ariaLabel="Status"
              defaultValue={task.status}
              options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
            />
          </form>
        )}
      </header>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Assigned to", value: task.assignee_id ? displayName(profiles.get(task.assignee_id)) : "Nobody yet" },
          {
            label: "Due",
            value: task.due_date ? formatDay(task.due_date, { weekday: "short", day: "numeric", month: "short" }) : "–",
            warn: isOverdue(task, today),
          },
          { label: "Time logged", value: formatHours(logged) },
          {
            label: "Estimate",
            value: task.estimate_minutes != null ? formatHours(task.estimate_minutes * 60) : "–",
            warn: task.estimate_minutes != null && task.estimate_minutes > 0 && logged > task.estimate_minutes * 60,
          },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className={cn("mt-1 truncate text-lg font-semibold", s.warn && "text-red-600")}>{s.value}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="section-title mb-2 text-base">Details</h2>
            {task.description ? (
              <p className="whitespace-pre-wrap text-sm text-slate-700">{task.description}</p>
            ) : (
              <p className="text-sm text-slate-400">No details added.</p>
            )}
          </section>

          <section className="card p-5">
            <h2 className="section-title mb-3 text-base">Comments</h2>
            {comments.length === 0 ? (
              <p className="mb-4 text-sm text-slate-500">No comments yet.</p>
            ) : (
              <ul className="mb-4 space-y-4">
                {comments.map((c) => {
                  const author = c.author_id ? profiles.get(c.author_id) : undefined;
                  const mayDelete = c.author_id === me.user_id || isAdminRole(me.role);
                  return (
                    <li key={c.id} className="flex gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
                        {initials(author?.full_name ?? "", author?.email ?? "")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                          <span className="font-medium">{displayName(author)}</span>
                          <span className="text-xs text-slate-400">{when(c.created_at)}</span>
                          {mayDelete && (
                            <form action={deleteComment} className="ml-auto">
                              <input type="hidden" name="id" value={c.id} />
                              <input type="hidden" name="back" value={here} />
                              <ConfirmSubmit message="Delete this comment?" className="text-xs text-slate-400 hover:text-red-600">
                                Delete
                              </ConfirmSubmit>
                            </form>
                          )}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{c.body}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <CommentForm taskId={task.id} />
          </section>

          {can.editAll && (
            <section className="card p-5">
              <h2 className="section-title mb-3 text-base">Edit task</h2>
              <TaskForm task={task} projects={projectOptions} people={people} />
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <section className="card p-5">
            <h2 className="section-title mb-3 text-base">Time by person</h2>
            {perPerson.length === 0 ? (
              <p className="text-sm text-slate-500">
                No time yet. Time is logged when someone picks this task in the desktop app while clocked in.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {perPerson.map(([userId, secs]) => (
                  <li key={userId} className="flex justify-between gap-3">
                    <Link href={`/dashboard/activity?user=${userId}`} className="truncate hover:text-brand-700">
                      {displayName(profiles.get(userId))}
                    </Link>
                    <span className="shrink-0 tabular-nums text-slate-600">{formatHours(secs)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card space-y-1 p-5 text-sm text-slate-600">
            <p>Created by {task.created_by ? displayName(profiles.get(task.created_by)) : "someone"}</p>
            <p>on {when(task.created_at)}</p>
            {task.completed_at && <p>Finished {when(task.completed_at)}</p>}
          </section>

          {can.remove && (
            <form action={deleteTask}>
              <input type="hidden" name="id" value={task.id} />
              <ConfirmSubmit message="Delete this task? Its comments and logged time are deleted too." className="btn-danger w-full">
                Delete task
              </ConfirmSubmit>
            </form>
          )}
        </aside>
      </div>
    </div>
  );
}
