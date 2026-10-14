import type { Metadata } from "next";
import Link from "next/link";
import { NIGERIA_HOLIDAYS, type LeaveType } from "@/lib/leave";
import { requireAdmin } from "@/lib/session";
import { PROJECT_COLORS, PROJECT_DOT } from "@/lib/tasks";
import { formatDay, localDateIn } from "@/lib/time";
import { cn } from "@/lib/utils";
import { ConfirmSubmit } from "../../team/forms";
import { addPresetHolidays, archiveLeaveType, removeHoliday, updateLeaveType } from "../actions";
import { AddHolidayForm, AddLeaveTypeForm } from "./forms";
import { Notice, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Leave settings" };

export default async function LeaveSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { supabase, member: me, org } = await requireAdmin();
  const year = Number(localDateIn(me.timezone).slice(0, 4));
  const [{ data: typeRows }, { data: holidayRows }] = await Promise.all([
    supabase.from("leave_types").select("id, name, color, days_per_year, paid, archived_at").order("created_at"),
    supabase.from("holidays").select("id, day, name").gte("day", `${year - 1}-01-01`).order("day"),
  ]);
  const types = (typeRows ?? []) as LeaveType[];
  const holidays = (holidayRows ?? []) as Array<{ id: string; day: string; name: string }>;
  const presetYears = Object.keys(NIGERIA_HOLIDAYS).map(Number).filter((y) => y >= year);

  return (
    <div className="space-y-8">
      <PageHeader title="Leave types and holidays" back={{ href: "/dashboard/leave", label: "Leave" }} />

      {error && <Notice tone="error">{error}</Notice>}

      <section className="card overflow-hidden">
        <h2 className="panel-head section-title text-base">Leave types</h2>
        <ul className="divide-y divide-slate-100">
          {types.map((t) => (
            <li key={t.id} className={cn("px-5 py-3", t.archived_at && "bg-slate-50")}>
              <form action={updateLeaveType} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="id" value={t.id} />
                <div className="w-48">
                  <label className="label text-xs" htmlFor={`name-${t.id}`}>Name</label>
                  <input className="input" id={`name-${t.id}`} name="name" defaultValue={t.name} maxLength={40} required />
                </div>
                <div className="w-32">
                  <label className="label text-xs" htmlFor={`days-${t.id}`}>Days per year</label>
                  <input className="input" id={`days-${t.id}`} name="days_per_year" type="number" min="0" max="365" step="0.5"
                         defaultValue={t.days_per_year ?? ""} placeholder="No limit" />
                </div>
                <div className="w-32">
                  <label className="label text-xs" htmlFor={`color-${t.id}`}>Colour</label>
                  <select className="input" id={`color-${t.id}`} name="color" defaultValue={t.color}>
                    {PROJECT_COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <input type="checkbox" name="paid" defaultChecked={t.paid} /> Paid
                </label>
                <span className={cn("mb-3 h-2.5 w-2.5 rounded-full", PROJECT_DOT[t.color as keyof typeof PROJECT_DOT])} aria-hidden />
                <button className="btn-secondary btn-sm mb-1">Save</button>
              </form>
              <form action={archiveLeaveType} className="mt-2">
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="restore" value={t.archived_at ? "1" : "0"} />
                <button className="text-xs text-slate-500 hover:text-slate-800">
                  {t.archived_at ? "Archived: restore it" : "Archive (hide from new requests)"}
                </button>
              </form>
            </li>
          ))}
        </ul>
        <div className="border-t border-slate-200 bg-slate-50 px-5 py-4">
          <AddLeaveTypeForm />
        </div>
      </section>

      <section className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="section-title text-base">Public holidays</h2>
            <p className="text-sm text-slate-500">Nobody needs leave on these days, and timesheets mark them.</p>
          </div>
          {org.country_code === "NG" && presetYears.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {presetYears.map((y) => (
                <form key={y} action={addPresetHolidays}>
                  <input type="hidden" name="year" value={y} />
                  <button className="btn-secondary btn-sm">Add Nigerian holidays {y}</button>
                </form>
              ))}
            </div>
          )}
        </div>
        {org.country_code === "NG" && (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Eid and Maulud dates depend on the moon and are announced by the Federal Government shortly before. The
            list marks them &ldquo;estimated&rdquo;: change the date here when the official day is announced.
          </p>
        )}
        {holidays.length === 0 ? (
          <p className="mb-4 text-sm text-slate-500">No holidays yet.</p>
        ) : (
          <ul className="mb-4 divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
            {holidays.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span>
                  <span className="inline-block w-32 text-slate-500">{formatDay(h.day, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
                  {h.name}
                </span>
                <form action={removeHoliday}>
                  <input type="hidden" name="id" value={h.id} />
                  <ConfirmSubmit message={`Remove ${h.name}?`} className="text-xs text-slate-400 hover:text-red-600">Remove</ConfirmSubmit>
                </form>
              </li>
            ))}
          </ul>
        )}
        <AddHolidayForm />
      </section>
    </div>
  );
}
