import type { Metadata } from "next";
import Link from "next/link";
import { AutoSubmitSelect, CopyButton, TimezoneSelect } from "@/components/form";
import { getBilling } from "@/lib/billing-server";
import { requireMember } from "@/lib/session";
import {
  isAdminRole,
  ROLE_LABELS,
  type Invitation,
  type Membership,
  type Profile,
  type Team,
} from "@/lib/types";
import { Icon } from "@/components/icons";
import { Avatar, InfoTip, Notice, PageHeader } from "@/components/ui";
import { cn, formatDate, siteUrl } from "@/lib/utils";
import { deleteTeam, revokeInvitation, setTeamManager, transferOwnership, updateMember } from "./actions";
import { ConfirmSubmit, CreateTeamForm, InviteForm } from "./forms";

export const metadata: Metadata = { title: "Team" };

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "worker", label: "Worker" },
];

function localTime(timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date());
  } catch {
    return "";
  }
}

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; welcome?: string; transferred?: string }>;
}) {
  const { error, welcome, transferred } = await searchParams;
  const { supabase, member: me, org } = await requireMember();
  const admin = isAdminRole(me.role);

  const [{ data: memberRows }, { data: teamRows }, invitesResult] = await Promise.all([
    supabase.from("memberships").select("*").neq("status", "removed").order("joined_at"),
    supabase.from("teams").select("id, name, manager_id").order("name"),
    admin
      ? supabase
          .from("invitations")
          .select("id, email, role, team_id, token, expires_at, created_at")
          .is("accepted_at", null)
          .is("revoked_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as Invitation[] }),
  ]);

  const members = (memberRows ?? []) as Membership[];
  const billing = await getBilling();
  const covered = new Set(billing.tracked_member_ids);
  const limited = billing.seat_limit !== null;
  const teams = (teamRows ?? []) as Team[];
  const invites = (invitesResult.data ?? []) as Invitation[];

  const { data: profileRows } = members.length
    ? await supabase.from("profiles").select("id, email, full_name, avatar_url").in("id", members.map((m) => m.user_id))
    : { data: [] };
  const profiles = new Map(((profileRows ?? []) as Profile[]).map((p) => [p.id, p]));
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const teamOptions = [{ value: "", label: "No team" }, ...teams.map((t) => ({ value: t.id, label: t.name }))];
  const nameOf = (userId: string) => {
    const p = profiles.get(userId);
    return p?.full_name || p?.email || "Unknown";
  };
  // Only managers, admins and the owner can manage a team (workers would not see the team's data).
  const managerOptions = [
    { value: "", label: "No manager" },
    ...members
      .filter((m) => m.status === "active" && m.role !== "worker")
      .map((m) => ({ value: m.user_id, label: `${nameOf(m.user_id)} (${ROLE_LABELS[m.role]})` })),
  ];
  const transferTargets = members.filter((m) => m.status === "active" && m.user_id !== me.user_id);

  return (
    <div className="space-y-6">
      <PageHeader title="Team" meta={`${members.filter((m) => m.status === "active").length} active people`} />

      {welcome && admin && (
        <Notice tone="success"><strong>{org.name} is ready.</strong> Invite your first people below.</Notice>
      )}
      {transferred && <Notice tone="success">Ownership transferred. You are now an admin.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      {admin && (
        <section className="card p-5">
          <h2 className="section-title mb-4 flex items-center gap-2 text-base">
            <Icon name="mail" className="h-4 w-4 text-brand-600 dark:text-brand-700" />
            Invite people
          </h2>
          <InviteForm teams={teams} />
        </section>
      )}

      <section className="card">
        <div className="overflow-x-auto lg:overflow-visible">
          <table className="w-full text-left text-sm [&_thead_th:first-child]:rounded-tl-2xl [&_thead_th:last-child]:rounded-tr-2xl">
            <thead className="table-head border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-medium">Person</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Team</th>
                <th className="px-4 py-3 font-medium">Time zone · hours</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                {admin && <th className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((m) => {
                const p = profiles.get(m.user_id);
                const isMe = m.user_id === me.user_id;
                // Role and status of the owner and of yourself are never changed here (see "Transfer ownership").
                const editable = admin && !isMe && m.role !== "owner";
                // Only the owner can change the owner's own details.
                const detailsEditable = admin && (m.role !== "owner" || me.role === "owner");
                return (
                  <tr key={m.id} className={cn(m.status === "suspended" && "bg-amber-50/50")}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={p?.full_name} email={p?.email} />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">
                            {admin ? (
                              <Link className="hover:text-brand-700" href={`/dashboard/activity?user=${m.user_id}`}>
                                {p?.full_name || p?.email}
                              </Link>
                            ) : (
                              p?.full_name || p?.email
                            )}
                            {isMe && <span className="ml-1 text-slate-400">(you)</span>}
                          </p>
                          <p className="truncate text-xs text-slate-500">{m.job_title ? `${m.job_title} · ` : ""}{p?.email}</p>
                        </div>
                        {m.status === "suspended" && <span className="badge bg-amber-100 text-amber-800">Suspended</span>}
                        {limited && m.status === "active" && !covered.has(m.user_id) && (
                          <span className="badge bg-red-100 text-red-700" title="Not covered by the company's plan: the desktop app won't clock them in">Not on plan</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {editable ? (
                        <form action={updateMember}>
                          <input type="hidden" name="membership_id" value={m.id} />
                          <AutoSubmitSelect name="role" defaultValue={m.role} options={ROLE_OPTIONS} ariaLabel="Role" />
                        </form>
                      ) : (
                        <span className={cn("badge", m.role === "owner" ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-700")}>
                          {ROLE_LABELS[m.role]}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {admin ? (
                        <form action={updateMember}>
                          <input type="hidden" name="membership_id" value={m.id} />
                          <AutoSubmitSelect name="team_id" defaultValue={m.team_id ?? ""} options={teamOptions} ariaLabel="Team" />
                        </form>
                      ) : (
                        <span className="text-slate-600">{m.team_id ? teamName.get(m.team_id) : "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <p>{m.timezone.replaceAll("_", " ")}</p>
                      <p className="text-xs text-slate-400">{localTime(m.timezone)} local · {Number(m.expected_hours_per_day)} h/day</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(m.joined_at, org.timezone)}</td>
                    {admin && (
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-start justify-end gap-2">
                        {detailsEditable && (
                          <details className="relative">
                            <summary className="btn-ghost cursor-pointer list-none px-2 [&::-webkit-details-marker]:hidden" title="Edit details">
                              <Icon name="pencil" className="h-4 w-4" />
                              <span className="sr-only">Edit {p?.full_name || p?.email}</span>
                            </summary>
                            <form action={updateMember} className="fixed inset-x-4 top-24 z-40 space-y-3 rounded-xl border border-slate-200 bg-raised p-4 text-left shadow-2xl sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-72">
                              <input type="hidden" name="membership_id" value={m.id} />
                              <div>
                                <label className="label" htmlFor={`title-${m.id}`}>Job title</label>
                                <input className="input" id={`title-${m.id}`} name="job_title" defaultValue={m.job_title ?? ""} maxLength={100} placeholder="e.g. Designer" />
                              </div>
                              <div>
                                <label className="label" htmlFor={`hours-${m.id}`}>Expected hours per day</label>
                                <input className="input" id={`hours-${m.id}`} name="expected_hours_per_day" type="number" min="0" max="24" step="0.5" defaultValue={Number(m.expected_hours_per_day)} />
                              </div>
                              <div>
                                <label className="label" htmlFor={`tz-${m.id}`}>Time zone</label>
                                <TimezoneSelect id={`tz-${m.id}`} defaultValue={m.timezone} />
                              </div>
                              <button className="btn-primary w-full">Save</button>
                            </form>
                          </details>
                        )}
                        {editable && (
                          <div className="flex justify-end gap-1">
                            <form action={updateMember}>
                              <input type="hidden" name="membership_id" value={m.id} />
                              <input type="hidden" name="status" value={m.status === "suspended" ? "active" : "suspended"} />
                              <button className="btn-ghost px-2" title={m.status === "suspended" ? "Reactivate" : "Suspend"}>
                                <Icon name={m.status === "suspended" ? "play" : "lock"} className="h-4 w-4" />
                                <span className="sr-only">{m.status === "suspended" ? "Reactivate" : "Suspend"} {p?.full_name || p?.email}</span>
                              </button>
                            </form>
                            <form action={updateMember}>
                              <input type="hidden" name="membership_id" value={m.id} />
                              <input type="hidden" name="status" value="removed" />
                              <ConfirmSubmit message={`Remove ${p?.full_name || p?.email} from ${org.name}? They lose access immediately.`} className="btn-ghost px-2 hover:text-red-600">
                                <Icon name="trash" className="h-4 w-4" />
                                <span className="sr-only">Remove {p?.full_name || p?.email}</span>
                              </ConfirmSubmit>
                            </form>
                          </div>
                        )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {admin && invites.length > 0 && (
        <section className="card">
          <h2 className="panel-head section-title text-base">Waiting to join</h2>
          <ul className="divide-y divide-slate-100">
            {invites.map((inv) => {
              const link = `${siteUrl()}/invite/${inv.token}`;
              return (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div>
                    <p className="font-medium text-slate-900">{inv.email}</p>
                    <p className="text-xs text-slate-500">
                      {ROLE_LABELS[inv.role]}
                      {inv.team_id && ` · ${teamName.get(inv.team_id) ?? ""}`} · expires {formatDate(inv.expires_at, org.timezone)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <CopyButton text={link} />
                    <form action={revokeInvitation}>
                      <input type="hidden" name="id" value={inv.id} />
                      <button className="btn-danger btn-sm">Cancel</button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="card p-5">
        <h2 className="section-title mb-4 flex items-center gap-2 text-base">
          Teams
          <InfoTip>A manager sees the time, activity and reports of their own team and of the teams they manage. Only Managers and Admins can manage a team.</InfoTip>
        </h2>
        {teams.length > 0 && (
          <ul className="mb-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {teams.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 font-medium text-slate-900">
                  {t.name}{" "}
                  <span className="text-xs font-normal text-slate-400">
                    {members.filter((m) => m.team_id === t.id).length} members
                  </span>
                </span>
                {admin ? (
                  <form action={setTeamManager} className="flex items-center gap-2">
                    <input type="hidden" name="team_id" value={t.id} />
                    <span className="text-xs text-slate-500">Manager</span>
                    <AutoSubmitSelect name="manager_id" defaultValue={t.manager_id ?? ""} options={managerOptions} ariaLabel={`Manager of ${t.name}`} />
                  </form>
                ) : (
                  <span className="text-xs text-slate-500">Manager: {t.manager_id ? nameOf(t.manager_id) : "none"}</span>
                )}
                {admin && (
                  <form action={deleteTeam}>
                    <input type="hidden" name="id" value={t.id} />
                    <ConfirmSubmit message={`Delete the team "${t.name}"? Members stay in the company.`} className="btn-ghost px-2 hover:text-red-600">
                      <Icon name="trash" className="h-4 w-4" />
                      <span className="sr-only">Delete {t.name}</span>
                    </ConfirmSubmit>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {admin ? <CreateTeamForm /> : teams.length === 0 && <p className="text-sm text-slate-500">No teams yet.</p>}
      </section>

      {me.role === "owner" && transferTargets.length > 0 && (
        <section className="card border-red-200 p-5">
          <h2 className="section-title text-base">Transfer ownership</h2>
          <p className="mt-1 mb-4 text-sm text-slate-500">You become an admin and can&apos;t undo this yourself.</p>
          <form action={transferOwnership} className="flex flex-wrap items-center gap-2">
            <select name="user_id" className="input w-auto" defaultValue="" required aria-label="New owner">
              <option value="" disabled>Choose the new owner…</option>
              {transferTargets.map((m) => (
                <option key={m.user_id} value={m.user_id}>{nameOf(m.user_id)} ({ROLE_LABELS[m.role]})</option>
              ))}
            </select>
            <ConfirmSubmit message={`Transfer ownership of ${org.name}? You will become an admin, and only the new owner can give it back.`} className="btn-danger">
              Transfer ownership
            </ConfirmSubmit>
          </form>
        </section>
      )}
    </div>
  );
}
