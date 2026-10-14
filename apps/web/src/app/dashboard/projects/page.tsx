import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/session";
import { isManagerOrAdmin, loadTaskTime, PROJECT_DOT, type Project, type TaskStatus } from "@/lib/tasks";
import { formatHours } from "@/lib/time";
import { cn } from "@/lib/utils";
import { setProjectArchived } from "./actions";
import { ProjectForm } from "./forms";
import { Notice, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { supabase, member: me } = await requireMember();
  if (!isManagerOrAdmin(me)) redirect("/dashboard/tasks");

  const [{ data: projectRows }, { data: taskRows }] = await Promise.all([
    supabase.from("projects").select("id, name, description, color, archived_at, created_at").order("name"),
    supabase.from("tasks").select("id, project_id, status").not("project_id", "is", null).limit(5000),
  ]);
  const projects = (projectRows ?? []) as Project[];
  const tasks = (taskRows ?? []) as Array<{ id: string; project_id: string; status: TaskStatus }>;
  const { perTask } = await loadTaskTime(supabase, tasks.map((t) => t.id));

  const stats = new Map<string, { open: number; done: number; seconds: number }>();
  for (const t of tasks) {
    const s = stats.get(t.project_id) ?? { open: 0, done: 0, seconds: 0 };
    if (t.status === "done") s.done += 1;
    else s.open += 1;
    s.seconds += perTask.get(t.id) ?? 0;
    stats.set(t.project_id, s);
  }

  const current = projects.filter((p) => !p.archived_at);
  const archived = projects.filter((p) => p.archived_at);

  return (
    <div className="space-y-6">
      <PageHeader title="Projects" back={{ href: "/dashboard/tasks", label: "Tasks" }} />

      {error && <Notice tone="error">{error}</Notice>}

      <section className="card p-5">
        <h2 className="section-title mb-3 text-base">New project</h2>
        <ProjectForm />
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="section-title text-base">Active projects</h2>
        </div>
        {current.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">No projects yet. Tasks work fine without one.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {current.map((p) => (
              <ProjectRow key={p.id} project={p} stats={stats.get(p.id)} />
            ))}
          </ul>
        )}
      </section>

      {archived.length > 0 && (
        <section className="card overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3">
            <h2 className="font-semibold text-slate-600">Archived</h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {archived.map((p) => (
              <ProjectRow key={p.id} project={p} stats={stats.get(p.id)} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ProjectRow({ project: p, stats }: { project: Project; stats?: { open: number; done: number; seconds: number } }) {
  return (
    <li className="px-5 py-3 text-sm">
      <details>
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1">
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", PROJECT_DOT[p.color])} aria-hidden />
            <span className="truncate font-medium">{p.name}</span>
            {p.description && <span className="hidden truncate text-slate-500 sm:inline">· {p.description}</span>}
          </span>
          <Link href={`/dashboard/tasks?view=all&project=${p.id}`} className="text-slate-600 hover:text-brand-700">
            {stats?.open ?? 0} open · {stats?.done ?? 0} done
          </Link>
          <span className="w-20 text-right tabular-nums text-slate-600">{formatHours(stats?.seconds ?? 0)}</span>
          <span className="text-xs text-brand-700">Edit</span>
        </summary>
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          <ProjectForm project={p} />
          <form action={setProjectArchived}>
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="archive" value={p.archived_at ? "0" : "1"} />
            <button className="btn-secondary btn-sm">{p.archived_at ? "Restore project" : "Archive project"}</button>
            {!p.archived_at && (
              <span className="ml-2 text-xs text-slate-500">Hides it from task forms. Its tasks and time are kept.</span>
            )}
          </form>
        </div>
      </details>
    </li>
  );
}
