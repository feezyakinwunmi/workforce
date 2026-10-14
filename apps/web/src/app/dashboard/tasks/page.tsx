import type { Metadata } from "next";
import Link from "next/link";
import { AutoSubmitSelect } from "@/components/form";
import { requireMember } from "@/lib/session";
import {
  isManagerOrAdmin,
  isOverdue,
  loadTaskTime,
  PRIORITY_LABEL,
  PRIORITY_STYLE,
  PROJECT_DOT,
  STATUS_LABEL,
  STATUSES,
  TASK_COLUMNS,
  taskPermissions,
  type Project,
  type Task,
  type TaskStatus,
} from "@/lib/tasks";
import { formatDay, formatHours, localDateIn } from "@/lib/time";
import { displayName, loadPeople } from "@/lib/tracking";
import { cn } from "@/lib/utils";
import { setTaskStatus } from "./actions";
import { TaskForm } from "./forms";

export const metadata: Metadata = { title: "Tasks" };

type Params = { view?: string; project?: string; status?: string; assignee?: string; error?: string };

export default async function TasksPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const { supabase, member: me } = await requireMember();
  const manager = isManagerOrAdmin(me);

  const view = ["mine", "all", "created"].includes(params.view ?? "") ? params.view! : manager ? "all" : "mine";
  const status = ["open", "done", "all", ...STATUSES].includes(params.status ?? "") ? params.status! : "open";

  let query = supabase.from("tasks").select(TASK_COLUMNS).limit(300);
  if (view === "mine") query = query.eq("assignee_id", me.user_id);
  if (view === "created") query = query.eq("created_by", me.user_id);
  if (view === "all" && params.assignee) {
    query = params.assignee === "none" ? query.is("assignee_id", null) : query.eq("assignee_id", params.assignee);
  }
  if (params.project) query = params.project === "none" ? query.is("project_id", null) : query.eq("project_id", params.project);
  if (status === "open") query = query.neq("status", "done");
  else if (status !== "all") query = query.eq("status", status);
  query =
    status === "done"
      ? query.order("completed_at", { ascending: false })
      : query.order("due_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false });

  const [{ data: taskRows }, { data: projectRows }, { members, profiles }] = await Promise.all([
    query,
    supabase.from("projects").select("id, name, description, color, archived_at, created_at").order("name"),
    loadPeople(supabase),
  ]);
  const tasks = (taskRows ?? []) as Task[];
  const projects = (projectRows ?? []) as Project[];
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const active = members.filter((m) => m.status === "active");
  const { perTask } = await loadTaskTime(supabase, tasks.map((t) => t.id));

  const today = localDateIn(me.timezone);
  const here = `/dashboard/tasks?${new URLSearchParams(
    Object.entries({ view, status, project: params.project ?? "", assignee: params.assignee ?? "" }).filter(([, v]) => v),
  )}`;

  const people = (manager ? active : active.filter((m) => m.user_id === me.user_id)).map((m) => ({
    value: m.user_id,
    label: `${displayName(profiles.get(m.user_id))}${m.user_id === me.user_id ? " (me)" : ""}`,
  }));
  const projectOptions = projects.filter((p) => !p.archived_at).map((p) => ({ value: p.id, label: p.name }));

  const groups: Array<{ status: TaskStatus | null; label: string; tasks: Task[] }> =
    status === "open"
      ? (["in_progress", "review", "todo"] as TaskStatus[]).map((s) => ({
          status: s,
          label: STATUS_LABEL[s],
          tasks: tasks.filter((t) => t.status === s),
        }))
      : [{ status: null, label: status === "all" ? "All tasks" : (STATUS_LABEL[status as TaskStatus] ?? "Tasks"), tasks }];

  const tabs = [
    { key: "mine", label: "My tasks" },
    { key: "all", label: "All tasks" },
    { key: "created", label: "Created by me" },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Tasks</h1>
          <p className="mt-1 text-slate-600">
            Pick a task in the desktop app while you work and the time is logged to it automatically.
          </p>
        </div>
        {manager && <Link href="/dashboard/projects" className="btn-secondary">Projects</Link>}
      </header>

      {params.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{params.error}</p>}

      <details className="card group p-5" open={tasks.length === 0 && view !== "created"}>
        <summary className="cursor-pointer list-none font-semibold">
          <span className="text-brand-700">+ New task</span>
          {!manager && <span className="ml-2 text-sm font-normal text-slate-500">for yourself (managers assign tasks to others)</span>}
        </summary>
        <div className="mt-4">
          <TaskForm
            projects={projectOptions}
            people={people}
            defaultAssignee={manager ? "" : me.user_id}
            defaultProject={params.project && params.project !== "none" ? params.project : ""}
          />
        </div>
      </details>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm" aria-label="Which tasks">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`/dashboard/tasks?view=${t.key}&status=${status}${params.project ? `&project=${params.project}` : ""}`}
              className={cn("rounded-md px-3 py-1.5 font-medium", view === t.key ? "bg-surface shadow-sm" : "text-slate-600 hover:text-slate-900")}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <form action="/dashboard/tasks" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="view" value={view} />
          <AutoSubmitSelect
            name="status"
            ariaLabel="Status"
            defaultValue={status}
            options={[
              { value: "open", label: "Open tasks" },
              ...STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
              { value: "all", label: "All statuses" },
            ]}
          />
          <AutoSubmitSelect
            name="project"
            ariaLabel="Project"
            defaultValue={params.project ?? ""}
            options={[
              { value: "", label: "All projects" },
              { value: "none", label: "No project" },
              ...projects.map((p) => ({ value: p.id, label: p.archived_at ? `${p.name} (archived)` : p.name })),
            ]}
          />
          {view === "all" && (
            <AutoSubmitSelect
              name="assignee"
              ariaLabel="Assigned to"
              defaultValue={params.assignee ?? ""}
              options={[
                { value: "", label: "Anyone" },
                { value: "none", label: "Unassigned" },
                ...active.map((m) => ({ value: m.user_id, label: displayName(profiles.get(m.user_id)) })),
              ]}
            />
          )}
          <noscript><button className="btn-secondary btn-sm">Filter</button></noscript>
        </form>
      </div>

      {tasks.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">
          {view === "mine" ? "No tasks assigned to you here." : "No tasks match these filters."}
        </div>
      ) : (
        groups
          .filter((g) => g.tasks.length > 0)
          .map((g) => (
            <section key={g.label} className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
                <h2 className="font-semibold">{g.label}</h2>
                <span className="text-xs text-slate-400">{g.tasks.length}</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {g.tasks.map((t) => {
                  const project = t.project_id ? projectById.get(t.project_id) : undefined;
                  const can = taskPermissions(me, t);
                  const logged = perTask.get(t.id) ?? 0;
                  return (
                    <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 text-sm hover:bg-slate-50">
                      <div className="min-w-0 flex-1 basis-64">
                        <Link href={`/dashboard/tasks/${t.id}`} className="font-medium hover:text-brand-700">
                          {t.title}
                        </Link>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                          {project && (
                            <span className="flex items-center gap-1.5">
                              <span className={cn("h-2 w-2 rounded-full", PROJECT_DOT[project.color])} aria-hidden />
                              {project.name}
                            </span>
                          )}
                          <span className={cn("badge", PRIORITY_STYLE[t.priority])}>{PRIORITY_LABEL[t.priority]}</span>
                          {t.due_date && (
                            <span className={cn(isOverdue(t, today) && "font-medium text-red-600")}>
                              {isOverdue(t, today) ? "Overdue · " : "Due "}
                              {formatDay(t.due_date, { day: "numeric", month: "short" })}
                            </span>
                          )}
                          {logged > 0 && <span>{formatHours(logged)} logged</span>}
                        </div>
                      </div>
                      <span className="w-36 truncate text-slate-600">
                        {t.assignee_id ? displayName(profiles.get(t.assignee_id)) : <span className="text-slate-400">Unassigned</span>}
                      </span>
                      <div className="w-32">
                        {can.changeStatus ? (
                          <form action={setTaskStatus}>
                            <input type="hidden" name="id" value={t.id} />
                            <input type="hidden" name="back" value={here} />
                            <AutoSubmitSelect
                              name="status"
                              ariaLabel={`Status of ${t.title}`}
                              defaultValue={t.status}
                              options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
                            />
                          </form>
                        ) : (
                          <span className="text-slate-500">{STATUS_LABEL[t.status]}</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
      )}
      {tasks.length === 300 && <p className="text-xs text-slate-500">Showing the first 300 tasks. Use the filters to narrow the list.</p>}
    </div>
  );
}
