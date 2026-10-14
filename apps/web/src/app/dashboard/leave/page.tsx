import type { Metadata } from "next";
import Link from "next/link";
import { LEAVE_COLUMNS, LEAVE_STATUS_LABEL, LEAVE_STATUS_STYLE, type Balance, type LeaveRequest, type LeaveType } from "@/lib/leave";
import { requireMember } from "@/lib/session";
import { isManagerOrAdmin, PROJECT_DOT, type ProjectColor } from "@/lib/tasks";
import { addDays, formatDay, localDateIn } from "@/lib/time";
import { displayName, loadPeople } from "@/lib/tracking";
import { isAdminRole } from "@/lib/types";
import { Icon } from "@/components/icons";
import { Avatar, EmptyState, Notice, PageHeader, Panel } from "@/components/ui";
import { cn } from "@/lib/utils";
import { cancelLeave, decideLeave } from "./actions";
import { RequestLeaveForm } from "./forms";

export const metadata: Metadata = { title: "Leave" };

const range = (r: Pick<LeaveRequest, "start_date" | "end_date">) =>
  r.start_date === r.end_date
    ? formatDay(r.start_date, { weekday: "short", day: "numeric", month: "short" })
    : `${formatDay(r.start_date, { day: "numeric", month: "short" })} – ${formatDay(r.end_date, { day: "numeric", month: "short", year: "numeric" })}`;
const daysLabel = (n: number) => `${Number(n)} ${Number(n) === 1 ? "day" : "days"}`;

export default async function LeavePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { supabase, member: me } = await requireMember();
  const manager = isManagerOrAdmin(me);
  const today = localDateIn(me.timezone);
  const year = Number(today.slice(0, 4));

  const [{ data: balanceRows }, { data: typeRows }, { data: mine }, { data: holidayRows }, team, people] = await Promise.all([
    supabase.rpc("leave_balances", { p_user: null, p_year: year }),
    supabase.from("leave_types").select("id, name, color, days_per_year, paid, archived_at").order("created_at"),
    supabase.from("leave_requests").select(LEAVE_COLUMNS).eq("user_id", me.user_id).gte("end_date", `${year - 1}-12-01`).order("start_date", { ascending: false }).limit(50),
    supabase.from("holidays").select("day, name").gte("day", `${year}-01-01`).lte("day", `${year + 1}-12-31`).order("day"),
    manager
      ? (me.role === "owner" // nobody approves the owner's leave but the owner
          ? supabase.from("leave_requests").select(LEAVE_COLUMNS)
          : supabase.from("leave_requests").select(LEAVE_COLUMNS).neq("user_id", me.user_id))
          .in("status", ["pending", "approved"]).gte("end_date", today).order("start_date").limit(200)
      : Promise.resolve({ data: [] as LeaveRequest[] }),
    loadPeople(supabase, { includeRemoved: true }),
  ]);

  const balances = (balanceRows ?? []) as Balance[];
  const types = (typeRows ?? []) as LeaveType[];
  const typeById = new Map(types.map((t) => [t.id, t]));
  const myRequests = (mine ?? []) as LeaveRequest[];
  const holidays = (holidayRows ?? []) as Array<{ day: string; name: string }>;
  const teamRequests = (team.data ?? []) as LeaveRequest[];
  const waiting = teamRequests.filter((r) => r.status === "pending");
  const soonEnd = addDays(today, 30);
  const off = teamRequests.filter((r) => r.status === "approved" && r.start_date <= soonEnd);
  const upcomingHolidays = holidays.filter((h) => h.day >= today).slice(0, 6);
  const name = (id: string) => displayName(people.profiles.get(id));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Leave"
        meta={`Your days off in ${year}`}
        actions={isAdminRole(me.role) ? <Link href="/dashboard/leave/settings" className="btn-secondary"><Icon name="settings" className="h-4 w-4" />Types and holidays</Link> : undefined}
      />

      {error && <Notice tone="error">{error}</Notice>}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {balances.map((b) => {
          const left = b.allowance === null ? null : Number(b.allowance) - Number(b.used);
          const share = b.allowance ? Math.min(1, Number(b.used) / Number(b.allowance)) : 0;
          return (
            <div key={b.leave_type_id} className="card p-5">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <span className={cn("h-2.5 w-2.5 rounded-full", PROJECT_DOT[(b.color as ProjectColor)] ?? "bg-slate-400")} aria-hidden />
                {b.name}
                {!b.paid && <span className="badge bg-slate-100 text-slate-500">Unpaid</span>}
              </p>
              <p className="mt-3 flex items-baseline gap-1.5">
                <span className="stat-value text-3xl">{left === null ? Number(b.used) : left}</span>
                <span className="text-sm text-slate-500">{left === null ? `${Number(b.used) === 1 ? "day" : "days"} taken` : `${left === 1 ? "day" : "days"} left`}</span>
              </p>
              {b.allowance !== null && (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                  <div className="h-full rounded-full bg-chart-1" style={{ width: `${share * 100}%` }} />
                </div>
              )}
              <p className="mt-2 text-xs text-slate-500">
                {b.allowance === null ? "No yearly limit" : `${Number(b.used)} of ${Number(b.allowance)} used`}
                {Number(b.pending) > 0 && ` · ${Number(b.pending)} waiting`}
              </p>
            </div>
          );
        })}
      </section>

      {manager && waiting.length > 0 && (
        <section className="card overflow-hidden border-amber-200">
          <h2 className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-900">
            <Icon name="clock" className="h-4 w-4" />
            Waiting for your decision
            <span className="rounded-full bg-amber-100 px-2 text-xs tabular-nums">{waiting.length}</span>
          </h2>
          <ul className="divide-y divide-slate-100">
            {waiting.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm">
                <div className="flex min-w-0 items-start gap-3">
                  <Avatar name={name(r.user_id)} />
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {name(r.user_id)} <span className="font-normal text-slate-500">· {typeById.get(r.leave_type_id)?.name ?? "Leave"}</span>
                    </p>
                    <p className="text-slate-600">{range(r)} · {daysLabel(r.days)}</p>
                    {r.reason && <p className="mt-1 text-slate-500">“{r.reason}”</p>}
                  </div>
                </div>
                <form action={decideLeave} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <input className="input w-48 py-1.5" name="note" maxLength={300} placeholder="Note (optional)" aria-label="Note" />
                  <button name="decision" value="approve" className="btn-primary btn-sm"><Icon name="check" className="h-3.5 w-3.5" />Approve</button>
                  <button name="decision" value="reject" className="btn-secondary btn-sm">Decline</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-5">
        <h2 className="section-title mb-4">Request time off</h2>
        {types.filter((t) => !t.archived_at).length === 0 ? (
          <p className="text-sm text-slate-500">No leave types yet.</p>
        ) : (
          <RequestLeaveForm
            types={types.filter((t) => !t.archived_at).map((t) => ({ id: t.id, name: t.name }))}
            holidays={holidays.map((h) => h.day)}
          />
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <section className="card overflow-hidden">
          <h2 className="panel-head section-title text-base">My requests</h2>
          {myRequests.length === 0 ? (
            <EmptyState icon="leave" title="No leave requested yet." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {myRequests.map((r) => {
                const canCancel = r.status === "pending" || (r.status === "approved" && r.start_date > today);
                return (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{range(r)}</p>
                      <p className="text-slate-500">
                        {typeById.get(r.leave_type_id)?.name ?? "Leave"} · {daysLabel(r.days)}
                        {r.decision_note && ` · “${r.decision_note}”`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={cn("badge", LEAVE_STATUS_STYLE[r.status])}>{LEAVE_STATUS_LABEL[r.status]}</span>
                      {canCancel && (
                        <form action={cancelLeave}>
                          <input type="hidden" name="id" value={r.id} />
                          <button className="text-xs text-slate-500 hover:text-red-600">Cancel</button>
                        </form>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="space-y-6">
          {manager && (
            <section className="card p-5">
              <h2 className="section-title mb-3 text-base">Off in the next 30 days</h2>
              {off.length === 0 ? (
                <p className="text-sm text-slate-500">Nobody.</p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {off.map((r) => (
                    <li key={r.id} className="flex items-center gap-3">
                      <Avatar name={name(r.user_id)} size="sm" />
                      <span>
                        <span className="block font-medium text-slate-900">{name(r.user_id)}</span>
                        <span className="block text-xs text-slate-500">{range(r)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          <section className="card p-5">
            <h2 className="section-title mb-3 text-base">Public holidays</h2>
            {upcomingHolidays.length === 0 ? (
              <p className="text-sm text-slate-500">
                None added yet.{isAdminRole(me.role) && <> <Link className="text-brand-700 hover:underline" href="/dashboard/leave/settings">Add holidays</Link></>}
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {upcomingHolidays.map((h) => (
                  <li key={h.day} className="flex justify-between gap-3">
                    <span>{h.name}</span>
                    <span className="shrink-0 text-slate-500">{formatDay(h.day, { day: "numeric", month: "short" })}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
