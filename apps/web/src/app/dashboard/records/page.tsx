import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { completeness, EMPLOYMENT, PROFILE_COLUMNS, type OnboardingTask, type StaffDocument, type StaffProfile } from "@/lib/staff";
import { formatDay } from "@/lib/time";
import { displayName, loadPeople } from "@/lib/tracking";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Avatar, InfoTip, Notice, PageHeader, Panel } from "@/components/ui";
import { addTemplateItem, removeTemplateItem } from "./actions";

export const metadata: Metadata = { title: "Staff records" };

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn("inline-flex h-6 w-6 items-center justify-center rounded-full", ok ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-300")} title={`${label}: ${ok ? "done" : "missing"}`}>
      <Icon name={ok ? "check" : "x"} className="h-3.5 w-3.5" />
      <span className="sr-only">{label}: {ok ? "done" : "missing"}</span>
    </span>
  );
}

export default async function RecordsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { supabase } = await requireAdmin();
  const [{ members, profiles }, { data: recs }, { data: docs }, { data: tasks }, { data: template }] = await Promise.all([
    loadPeople(supabase),
    supabase.from("staff_profiles").select(PROFILE_COLUMNS),
    supabase.from("staff_documents").select("id, user_id, kind, expires_on"),
    supabase.from("onboarding_tasks").select("id, user_id, done_at"),
    supabase.from("onboarding_template").select("id, title, position").order("position"),
  ]);
  const byUser = new Map(((recs ?? []) as StaffProfile[]).map((r) => [r.user_id, r]));
  const documents = (docs ?? []) as StaffDocument[];
  const checklist = (tasks ?? []) as Pick<OnboardingTask, "id" | "user_id" | "done_at">[];
  const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const expiring = documents.filter((d) => d.expires_on && d.expires_on <= in30);
  const people = members.filter((m) => m.status === "active").sort((a, b) => displayName(profiles.get(a.user_id)).localeCompare(displayName(profiles.get(b.user_id))));

  return (
    <div className="space-y-6">
      <PageHeader title="Staff records" />
      {error && <Notice tone="error">{error}</Notice>}
      {expiring.length > 0 && (
        <Notice tone="warning">
          {expiring.length === 1 ? "An ID document expires" : `${expiring.length} ID documents expire`} within 30 days:{" "}
          {expiring.map((d, i) => (
            <span key={d.id}>
              {i > 0 && ", "}
              <Link href={`/dashboard/records/${d.user_id}`} className="font-medium underline">{displayName(profiles.get(d.user_id))}</Link>
            </span>
          ))}
        </Notice>
      )}

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="table-head border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-medium">Person</th>
                  <th className="px-3 py-3 font-medium">Started</th>
                  <th className="px-2 py-3 text-center font-medium">Contract</th>
                  <th className="px-2 py-3 text-center font-medium">ID</th>
                  <th className="px-2 py-3 text-center font-medium">Bank</th>
                  <th className="px-2 py-3 text-center font-medium">Pension</th>
                  <th className="px-2 py-3 text-center font-medium">Emergency</th>
                  <th className="px-4 py-3 font-medium">Checklist</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {people.map((m) => {
                  const p = profiles.get(m.user_id);
                  const rec = byUser.get(m.user_id);
                  const c = completeness(rec, documents.filter((d) => d.user_id === m.user_id));
                  const mine = checklist.filter((t) => t.user_id === m.user_id);
                  const done = mine.filter((t) => t.done_at).length;
                  return (
                    <tr key={m.user_id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <Link href={`/dashboard/records/${m.user_id}`} className="group flex items-center gap-3">
                          <Avatar name={p?.full_name} email={p?.email} size="sm" />
                          <span className="min-w-0">
                            <span className="block font-medium text-slate-900 group-hover:text-brand-700">{displayName(p)}</span>
                            <span className="block truncate text-xs text-slate-500">{m.job_title || p?.email}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-slate-600">
                        {rec?.start_date ? formatDay(rec.start_date, { day: "numeric", month: "short", year: "numeric" }) : "–"}
                        {rec?.employment_type && <span className="block text-xs text-slate-400">{EMPLOYMENT[rec.employment_type]}</span>}
                      </td>
                      <td className="px-2 py-3 text-center"><Check ok={c.contract} label="Contract" /></td>
                      <td className="px-2 py-3 text-center"><Check ok={c.id} label="ID document" /></td>
                      <td className="px-2 py-3 text-center"><Check ok={c.bank} label="Bank details" /></td>
                      <td className="px-2 py-3 text-center"><Check ok={c.pension} label="Pension details" /></td>
                      <td className="px-2 py-3 text-center"><Check ok={c.emergency} label="Emergency contact" /></td>
                      <td className="px-4 py-3">
                        {mine.length ? (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(done / mine.length) * 100}%` }} />
                            </div>
                            <span className="text-xs text-slate-600 tabular-nums">{done}/{mine.length}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">–</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <Panel
          title={
            <span className="flex items-center gap-2">
              New-hire checklist
              <InfoTip align="right">Everyone who joins gets these items. You and they can tick them off on their record.</InfoTip>
            </span>
          }
          className="self-start 2xl:max-w-none max-w-xl"
        >
          <ol className="divide-y divide-slate-100 text-sm">
            {((template ?? []) as Array<{ id: string; title: string }>).map((t, i) => (
              <li key={t.id} className="group flex items-center gap-3 px-5 py-2.5">
                <span className="w-4 text-xs text-slate-400 tabular-nums">{i + 1}</span>
                <span className="flex-1 text-slate-700">{t.title}</span>
                <form action={removeTemplateItem}>
                  <input type="hidden" name="id" value={t.id} />
                  <button className="text-slate-300 hover:text-red-600" title="Remove"><Icon name="x" className="h-4 w-4" /><span className="sr-only">Remove {t.title}</span></button>
                </form>
              </li>
            ))}
          </ol>
          <form action={addTemplateItem} className="flex gap-2 border-t border-slate-100 p-4">
            <input name="title" className="input py-1.5 text-sm" placeholder="Add an item" minLength={2} maxLength={200} required />
            <button className="btn-secondary btn-sm" title="Add"><Icon name="plus" className="h-4 w-4" /><span className="sr-only">Add</span></button>
          </form>
        </Panel>
      </div>
    </div>
  );
}
