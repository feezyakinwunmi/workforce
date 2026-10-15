import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireMember } from "@/lib/session";
import { DOC_KIND, DOCS_BUCKET, PROFILE_COLUMNS, type OnboardingTask, type StaffDocument, type StaffProfile } from "@/lib/staff";
import { formatDay, localDateIn } from "@/lib/time";
import { displayName, loadPeople } from "@/lib/tracking";
import { isAdminRole, ROLE_LABELS } from "@/lib/types";
import { fileSize } from "@/lib/chat";
import { cn, formatDate } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Avatar, EmptyState, Notice, PageHeader, Panel } from "@/components/ui";
import { addTask, removeDocument, removeTask, startOnboarding, toggleTask } from "../actions";
import { DocumentUpload, RecordForm } from "../forms";

export const metadata: Metadata = { title: "Staff record" };

export default async function RecordPage({ params, searchParams }: { params: Promise<{ userId: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ userId: raw }, { error }] = await Promise.all([params, searchParams]);
  const { supabase, user, member, org } = await requireMember();
  const admin = isAdminRole(member.role);
  const userId = raw === "me" ? user.id : raw;
  if (!/^[0-9a-f-]{36}$/i.test(userId)) notFound();
  if (userId !== user.id && !admin) redirect("/dashboard/records/me");
  const here = `/dashboard/records/${raw}`;

  const [{ members, profiles, teams }, { data: rec }, { data: docRows }, { data: taskRows }] = await Promise.all([
    loadPeople(supabase, { includeRemoved: true }),
    supabase.from("staff_profiles").select(PROFILE_COLUMNS).eq("user_id", userId).maybeSingle(),
    supabase.from("staff_documents").select("id, user_id, kind, title, file, expires_on, uploaded_by, created_at").eq("user_id", userId).order("created_at", { ascending: false }),
    supabase.from("onboarding_tasks").select("id, user_id, title, position, done_at, done_by").eq("user_id", userId).order("position").order("created_at"),
  ]);
  const m = members.find((x) => x.user_id === userId);
  if (!m) notFound();
  const p = profiles.get(userId);
  const docs = (docRows ?? []) as StaffDocument[];
  const tasks = (taskRows ?? []) as OnboardingTask[];
  const urls = new Map<string, string>();
  if (docs.length) {
    const { data: signed } = await supabase.storage.from(DOCS_BUCKET).createSignedUrls(docs.map((d) => d.file.path), 3600);
    for (const s of (signed ?? []) as Array<{ path: string | null; signedUrl: string | null }>) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  const team = teams.find((t) => t.id === m.team_id);
  const today = localDateIn(member.timezone);
  const done = tasks.filter((t) => t.done_at).length;

  return (
    <div className="space-y-6">
      <PageHeader
        back={admin ? { href: "/dashboard/records", label: "Staff records" } : undefined}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={p?.full_name} email={p?.email} size="lg" />
            {userId === user.id ? "My records" : displayName(p)}
          </span>
        }
        meta={[m.job_title, team?.name, ROLE_LABELS[m.role]].filter(Boolean).join(" · ")}
      />
      {error && <Notice tone="error">{error}</Notice>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Panel title="Details" bodyClassName="p-5" className="self-start">
          <RecordForm userId={userId} profile={(rec as StaffProfile | null) ?? null} admin={admin} />
          {rec && (
            <p className="mt-4 text-xs text-slate-400">Last changed {formatDate((rec as StaffProfile).updated_at, org.timezone)}. Only {userId === user.id ? "you" : "this person"} and the company&apos;s admins can see this page.</p>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title={<span className="flex items-center gap-2">New-hire checklist {tasks.length > 0 && <span className="text-sm font-normal text-slate-500 tabular-nums">{done}/{tasks.length}</span>}</span>}>
            {tasks.length ? (
              <ul className="divide-y divide-slate-100 text-sm">
                {tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-5 py-2.5">
                    <form action={toggleTask}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="done" value={t.done_at ? "0" : "1"} />
                      <input type="hidden" name="back" value={here} />
                      <button
                        className={cn("flex h-5 w-5 items-center justify-center rounded-md border transition", t.done_at ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 hover:border-brand-500")}
                        aria-label={t.done_at ? `Mark "${t.title}" as not done` : `Mark "${t.title}" as done`}
                      >
                        {t.done_at && <Icon name="check" className="h-3.5 w-3.5" />}
                      </button>
                    </form>
                    <span className={cn("flex-1", t.done_at ? "text-slate-400 line-through" : "text-slate-800")}>{t.title}</span>
                    {admin && (
                      <form action={removeTask}>
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="back" value={here} />
                        <button className="text-slate-300 hover:text-red-600" title="Remove"><Icon name="x" className="h-4 w-4" /><span className="sr-only">Remove</span></button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon="tasks"
                title="No checklist."
                className="py-6"
                action={admin ? (
                  <form action={startOnboarding}>
                    <input type="hidden" name="user_id" value={userId} />
                    <input type="hidden" name="back" value={here} />
                    <button className="btn-secondary btn-sm">Start the new-hire checklist</button>
                  </form>
                ) : undefined}
              />
            )}
            {admin && tasks.length > 0 && (
              <form action={addTask} className="flex gap-2 border-t border-slate-100 p-4">
                <input type="hidden" name="user_id" value={userId} />
                <input type="hidden" name="back" value={here} />
                <input name="title" className="input py-1.5 text-sm" placeholder="Add an item for this person" minLength={2} maxLength={200} required />
                <button className="btn-secondary btn-sm" title="Add"><Icon name="plus" className="h-4 w-4" /><span className="sr-only">Add</span></button>
              </form>
            )}
          </Panel>

          <Panel title="Documents" bodyClassName="divide-y divide-slate-100">
            {docs.length ? (
              <ul className="divide-y divide-slate-100 text-sm">
                {docs.map((d) => {
                  const expired = d.expires_on && d.expires_on < today;
                  return (
                    <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                        <Icon name={d.kind === "id" ? "user" : d.kind === "contract" ? "pencil" : "receipt"} className="h-4 w-4" />
                      </span>
                      <a href={urls.get(d.file.path)} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-slate-900 hover:text-brand-700">{d.title}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {DOC_KIND[d.kind]} · {fileSize(d.file.size)} · {formatDate(d.created_at, org.timezone)}
                          {d.expires_on && (
                            <span className={expired ? "text-red-600" : undefined}> · {expired ? "expired" : "expires"} {formatDay(d.expires_on, { day: "numeric", month: "short", year: "numeric" })}</span>
                          )}
                        </span>
                      </a>
                      {(admin || d.uploaded_by === user.id) && (
                        <form action={removeDocument}>
                          <input type="hidden" name="id" value={d.id} />
                          <input type="hidden" name="back" value={here} />
                          <button className="text-slate-300 hover:text-red-600" title="Remove"><Icon name="trash" className="h-4 w-4" /><span className="sr-only">Remove {d.title}</span></button>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState icon="folder" title="No documents yet." className="py-6" />
            )}
            <div className="p-5">
              <DocumentUpload orgId={org.id} userId={userId} />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
