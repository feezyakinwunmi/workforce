import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { Avatar, InfoTip, Notice, PageHeader, Panel, StatStrip } from "@/components/ui";
import { naira, paymentLabel } from "@/lib/billing";
import { requireAdmin } from "@/lib/admin/server";
import { ago, day, TIER_BADGE, TIER_TEXT, when, type CompanyDetail, type Member } from "@/lib/admin/types";
import { formatHours } from "@/lib/time";
import { cn } from "@/lib/utils";
import { ExtendTrialForm, NoteForm } from "./forms";

export const metadata = { title: "Company" };
export const dynamic = "force-dynamic";

const ROLE: Record<Member["role"], string> = { owner: "Owner", admin: "Admin", manager: "Manager", worker: "Worker" };
const END_REASON: Record<string, string> = {
  clock_out: "Clocked out",
  idle_timeout: "Away 60 min",
  agent_restart: "App restarted",
  agent_lost: "App stopped reporting",
  superseded: "Clocked in elsewhere",
  admin: "Ended by admin",
};

/** "0.7.0" < "0.8.1" */
const older = (a: string, b: string) => {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0);
  return false;
};

function warnings(d: CompanyDetail) {
  const out: Array<{ tone: "warning" | "error" | "info"; text: string }> = [];
  const active = d.members.filter((m) => m.status === "active");
  const never = active.filter((m) => !m.last_clock_in);
  if (never.length) out.push({ tone: "warning", text: `Never clocked in: ${never.map((m) => m.name).join(", ")}.` });
  const silent = active.filter((m) => m.open_session?.source === "desktop" && m.open_session.last_heartbeat_at && Date.now() - Date.parse(m.open_session.last_heartbeat_at) > 3 * 60_000);
  if (silent.length) out.push({ tone: "warning", text: `Clocked in but the app isn't reporting: ${silent.map((m) => m.name).join(", ")}. Their PC may be asleep, offline, or the app closed.` });
  if (d.latest_agent) {
    const old = active.filter((m) => m.devices.some((x) => /^\d+\.\d+\.\d+$/.test(x.version) && older(x.version, d.latest_agent!)));
    if (old.length) out.push({ tone: "info", text: `Old desktop app (newest is ${d.latest_agent}): ${old.map((m) => m.name).join(", ")}. It updates itself after they clock out and reopen it.` });
  }
  const lost = active.filter((m) => m.lost_7d > 0);
  if (lost.length) out.push({ tone: "info", text: `App stopped reporting mid-session this week: ${lost.map((m) => `${m.name} (${m.lost_7d}×)`).join(", ")}. Usually sleep, shutdown or no internet.` });
  const blocked = active.filter((m) => !m.can_track);
  if (blocked.length) out.push({ tone: "warning", text: `Can't clock in (not covered by the plan): ${blocked.map((m) => m.name).join(", ")}.` });
  const failed = d.payments.filter((p) => p.status === "failed" && Date.now() - Date.parse(p.created_at) < 14 * 86_400_000);
  if (failed.length) out.push({ tone: "error", text: `Failed payment${failed.length > 1 ? "s" : ""} in the last 2 weeks: ${failed.map((p) => p.failure_reason || naira(p.amount_kobo)).join("; ")}.` });
  if (d.company.tier === "trial" && Date.parse(d.company.trial_ends_at) - Date.now() < 3 * 86_400_000) out.push({ tone: "info", text: `Trial ends ${day(d.company.trial_ends_at)}.` });
  const expired = d.invites.filter((i) => Date.parse(i.expires_at) < Date.now());
  if (expired.length) out.push({ tone: "info", text: `Expired invitations (send again from Team): ${expired.map((i) => i.email).join(", ")}.` });
  if (d.company.closing_at) out.push({ tone: "error", text: `The owner closed this company on ${day(d.company.closing_at)}. Data is deleted ${day(d.company.purge_after)} unless they reopen it.` });
  return out;
}

export default async function AdminCompany({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ look?: string }> }) {
  const { db, email, base } = await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const wantDeep = (await searchParams).look === "1";

  let { data, error } = await db.rpc("admin_company", { p_org: id, p_viewer: email, p_deep: wantDeep });
  let deepError: string | null = null;
  if (error && wantDeep) {
    deepError = error.message;
    ({ data, error } = await db.rpc("admin_company", { p_org: id, p_viewer: email, p_deep: false }));
  }
  if (error?.code === "P0002") notFound();
  if (error || !data) return <Notice tone="error">{error?.message ?? "Couldn't load this company."}</Notice>;

  const d = data as CompanyDetail;
  const c = d.company;
  const names = new Map(d.members.map((m) => [m.user_id, m.name]));
  const list = warnings(d);
  // Suggested date: 30 days after they joined (the pilot offer), or 2 weeks from today if that has passed.
  const pilotEnd = Date.parse(c.created_at) + 30 * 86_400_000;
  const defaultTrial = new Date(pilotEnd > Date.now() ? pilotEnd : Date.now() + 14 * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  const s = c.settings as Record<string, unknown>;
  const lastClock = d.members.map((m) => m.last_clock_in).filter(Boolean).sort().at(-1) ?? null;

  return (
    <>
      <PageHeader
        back={{ href: `${base}/companies`, label: "Companies" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {c.name}
            <span className={cn("badge text-sm", TIER_BADGE[c.tier])}>{TIER_TEXT[c.tier]}</span>
          </span>
        }
        meta={`Joined ${day(c.created_at)} · ${c.timezone} · ${c.country_code}${d.meet_business ? " · Meet Business" : ""}`}
      />

      <StatStrip
        stats={[
          {
            label: "Plan",
            value: TIER_TEXT[c.tier],
            icon: "card",
            hint: c.tier === "trial" ? `ends ${day(c.trial_ends_at)}` : c.paid_until ? `${c.paid_seats} paid seats until ${day(c.paid_until)}` : c.tier === "free" ? `${c.seat_limit} people can track` : undefined,
          },
          { label: "People", value: c.active_members, icon: "users", hint: d.invites.length ? `+${d.invites.length} invited` : undefined },
          { label: "Last clock-in", value: ago(lastClock), icon: "clock" },
          { label: "Support access", value: d.support_until ? "On" : "Off", icon: "shield", tone: d.support_until ? "green" : "slate", hint: d.support_until ? `until ${when(d.support_until)}` : "the owner switches it on" },
        ]}
      />

      {list.length > 0 && (
        <Panel title="Things to check" bodyClassName="space-y-2 p-5">
          {list.map((w, i) => (
            <Notice key={i} tone={w.tone}>{w.text}</Notice>
          ))}
        </Panel>
      )}

      <Panel title={`People (${d.members.length})`} bodyClassName="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="table-head">
            <tr>
              <th className="px-5 py-2.5">Person</th>
              <th className="px-5 py-2.5">Role</th>
              <th className="px-5 py-2.5">Last clock-in</th>
              <th className="px-5 py-2.5">Desktop app</th>
              <th className="px-5 py-2.5">Phone alerts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {d.members.map((m) => {
              const dev = m.devices[0];
              return (
                <tr key={m.user_id} className={m.status !== "active" ? "opacity-60" : undefined}>
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-3">
                      <Avatar name={m.name} email={m.email} size="sm" status={m.open_session ? (m.open_session.source === "phone" ? "phone" : "working") : undefined} />
                      <span className="min-w-0">
                        <span className="block font-medium text-slate-900">{m.name}</span>
                        <span className="block text-xs text-slate-500">{m.email} · {m.timezone}</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-700">
                    {ROLE[m.role]}
                    {m.status !== "active" && <span className="badge ml-1 bg-slate-100 text-slate-600">{m.status}</span>}
                    {m.status === "active" && !m.can_track && <span className="badge ml-1 bg-amber-50 text-amber-700">Not on plan</span>}
                  </td>
                  <td className="px-5 py-3 text-slate-700">
                    {m.open_session ? (
                      <span className="text-emerald-700">In since {when(m.open_session.started_at)}{m.open_session.source === "phone" ? " (phone)" : ""}</span>
                    ) : (
                      ago(m.last_clock_in)
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-700">
                    {dev ? (
                      <>
                        <span className={cn(d.latest_agent && /^\d+\.\d+\.\d+$/.test(dev.version) && older(dev.version, d.latest_agent) && "text-amber-700")}>{dev.version || "?"}</span>
                        <span className="block text-xs text-slate-500">{dev.os} · seen {ago(dev.last_seen_at)}{m.devices.length > 1 ? ` · ${m.devices.length} PCs` : ""}</span>
                      </>
                    ) : (
                      <span className="text-slate-400">Not installed</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-700">{m.push ? "On" : <span className="text-slate-400">Off</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {d.invites.length > 0 && (
          <div className="border-t border-slate-200 px-5 py-3 text-sm text-slate-600">
            <span className="font-medium text-slate-700">Invited, not joined: </span>
            {d.invites.map((i) => `${i.email}${Date.parse(i.expires_at) < Date.now() ? " (expired)" : ""}`).join(", ")}
          </div>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Panel title="Payments" bodyClassName="overflow-x-auto">
          {d.payments.length ? (
            <table className="w-full text-left text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-5 py-2.5">Date</th>
                  <th className="px-5 py-2.5">What</th>
                  <th className="px-5 py-2.5">Status</th>
                  <th className="px-5 py-2.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {d.payments.map((p) => (
                  <tr key={p.reference}>
                    <td className="px-5 py-2.5 whitespace-nowrap text-slate-600">{when(p.paid_at ?? p.created_at)}</td>
                    <td className="px-5 py-2.5 text-slate-700">
                      {paymentLabel(p)}
                      <span className="block font-mono text-xs text-slate-400">{p.reference}</span>
                    </td>
                    <td className="px-5 py-2.5">
                      <span className={cn("badge", p.status === "success" ? "bg-emerald-50 text-emerald-700" : p.status === "failed" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600")}>
                        {p.status === "success" ? "Paid" : p.status === "failed" ? "Failed" : "Started"}
                      </span>
                      {p.failure_reason && <span className="block text-xs text-slate-500">{p.failure_reason}</span>}
                    </td>
                    <td className="px-5 py-2.5 text-right text-slate-900 tabular-nums">{naira(p.amount_kobo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-5 py-6 text-sm text-slate-500">No payments yet.</p>
          )}
        </Panel>

        <Panel title="Settings" bodyClassName="p-5">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-500">Work hours</dt>
            <dd className="text-slate-800">{s.work_start && s.work_end ? `${s.work_start}–${s.work_end}` : "Not set"}</dd>
            <dt className="text-slate-500">Clock reminders</dt>
            <dd className="text-slate-800">{s.clock_reminders === false ? "Off" : s.work_start ? "On" : "Off"}</dd>
            <dt className="text-slate-500">Away after</dt>
            <dd className="text-slate-800">{String(s.idle_timeout_minutes ?? 5)} min idle</dd>
            <dt className="text-slate-500">Window titles</dt>
            <dd className="text-slate-800">{s.track_window_titles === false ? "Off" : "On (paid plans)"}</dd>
            <dt className="text-slate-500">Screenshots</dt>
            <dd className="text-slate-800">{s.screenshots_enabled ? "On" : "Off"}</dd>
            <dt className="text-slate-500">Phone clock-in</dt>
            <dd className="text-slate-800">{s.phone_clock === false ? "Off" : `On · location ${String(s.phone_location ?? "off")}`}</dd>
          </dl>
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title={
            <span className="flex items-center gap-1.5">
              Support notes
              <InfoTip>Only people on the console see these. The company never does.</InfoTip>
            </span>
          }
          bodyClassName="space-y-4 p-5"
        >
          <NoteForm org={c.id} />
          {d.notes.length > 0 && (
            <ul className="space-y-3 border-t border-slate-100 pt-4">
              {d.notes.map((n) => (
                <li key={n.id} className="text-sm">
                  <p className="whitespace-pre-wrap text-slate-800">{n.body}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{n.author} · {when(n.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Actions" bodyClassName="space-y-4 p-5">
          {c.tier === "standard" || c.tier === "pro" ? (
            <p className="text-sm text-slate-600">They&apos;re on a paid plan, so the trial date has no effect right now.</p>
          ) : (
            <ExtendTrialForm org={c.id} defaultDate={defaultTrial} />
          )}
          <p className="text-xs text-slate-500">Changes are written to the company&apos;s own activity log.</p>
        </Panel>
      </div>

      <Panel
        title={
          <span className="flex items-center gap-1.5">
            Closer look
            <InfoTip>Hours, sessions, task counts, leave and recent changes in their company. Needs the owner or an admin to switch on support access (Company settings). Each look is logged where they can see it. Chats, notes, screenshots, pay and staff records are never shown here.</InfoTip>
          </span>
        }
        actions={
          d.support_until && !d.deep ? (
            <Link href={`${base}/companies/${c.id}?look=1`} className="btn-primary btn-sm">
              <Icon name="eye" className="h-4 w-4" />
              Open (logged)
            </Link>
          ) : undefined
        }
        bodyClassName="p-5"
      >
        {deepError && <Notice tone="error" className="mb-4">{deepError}</Notice>}
        {d.deep ? (
          <Deep d={d} names={names} />
        ) : d.support_until ? (
          <p className="text-sm text-slate-600">Support access is on until {when(d.support_until)}.</p>
        ) : (
          <p className="text-sm text-slate-600">Support access is off. Ask the owner to open Company settings and click Allow support access.</p>
        )}
        {d.support_views.length > 0 && (
          <p className="mt-4 text-xs text-slate-500">
            Earlier looks: {d.support_views.slice(0, 5).map((v) => `${v.viewer} ${when(v.created_at)}`).join(" · ")}
          </p>
        )}
      </Panel>
    </>
  );
}

function Deep({ d, names }: { d: CompanyDetail; names: Map<string, string> }) {
  const deep = d.deep!;
  const per = new Map<string, { worked: number; active: number; days: number }>();
  for (const h of deep.hours) {
    const p = per.get(h.user_id) ?? { worked: 0, active: 0, days: 0 };
    p.worked += h.worked_seconds;
    p.active += h.active_seconds;
    p.days += h.worked_seconds > 0 ? 1 : 0;
    per.set(h.user_id, p);
  }
  const name = (id: string) => names.get(id) ?? "Someone who left";
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Last 14 days</h3>
          {per.size ? (
            <table className="w-full text-left text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-3 py-2">Person</th>
                  <th className="px-3 py-2 text-right">Worked</th>
                  <th className="px-3 py-2 text-right">Days</th>
                  <th className="px-3 py-2 text-right">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...per.entries()].sort((a, b) => b[1].worked - a[1].worked).map(([u, p]) => (
                  <tr key={u}>
                    <td className="px-3 py-2 text-slate-800">{name(u)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatHours(p.worked)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.days}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.worked ? Math.round((p.active / p.worked) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-slate-500">No tracked time in the last 14 days.</p>
          )}
        </div>
        <div className="space-y-4 text-sm">
          <div>
            <h3 className="mb-1 font-semibold text-slate-900">Tasks</h3>
            <p className="text-slate-700">
              {Object.entries(deep.tasks.by_status).map(([k, v]) => `${v} ${k.replace("_", " ")}`).join(" · ") || "None"}
              {deep.tasks.overdue > 0 && <span className="text-amber-700"> · {deep.tasks.overdue} overdue</span>}
              {" · "}{deep.tasks.projects} projects
            </p>
          </div>
          <div>
            <h3 className="mb-1 font-semibold text-slate-900">Leave (last 30 days and coming)</h3>
            {deep.leave.length ? (
              <ul className="space-y-0.5 text-slate-700">
                {deep.leave.slice(0, 8).map((l, i) => (
                  <li key={i}>{name(l.user_id)}: {l.type}, {l.start_date} to {l.end_date} ({l.days} d, {l.status})</li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-500">None.</p>
            )}
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Recent clock-ins</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-3 py-2">Person</th>
                <th className="px-3 py-2">In</th>
                <th className="px-3 py-2">Out</th>
                <th className="px-3 py-2">How it ended</th>
                <th className="px-3 py-2">From</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {deep.sessions.slice(0, 20).map((x, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 text-slate-800">{name(x.user_id)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">{when(x.started_at)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">{x.ended_at ? when(x.ended_at) : <span className="text-emerald-700">still in · heard {ago(x.last_heartbeat_at)}</span>}</td>
                  <td className={cn("px-3 py-2", x.end_reason === "agent_lost" ? "text-amber-700" : "text-slate-600")}>{x.end_reason ? END_REASON[x.end_reason] ?? x.end_reason : ""}</td>
                  <td className="px-3 py-2 text-slate-600">{x.source === "phone" ? "Phone" : `${x.os ?? "PC"} ${x.agent_version ?? ""}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Recent changes in their company</h3>
        <ul className="space-y-1 text-sm text-slate-700">
          {deep.changes.slice(0, 15).map((x, i) => (
            <li key={i}><span className="text-slate-500">{when(x.at)}</span> · {x.by}: {x.action.replace(/[._]/g, " ")}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
