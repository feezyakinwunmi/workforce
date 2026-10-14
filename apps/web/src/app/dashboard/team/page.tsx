import type { Metadata } from "next";
import Link from "next/link";
import { AutoSubmitSelect, CopyButton } from "@/components/form";
import { requireMember } from "@/lib/session";
import {
  isAdminRole,
  ROLE_LABELS,
  type Invitation,
  type Membership,
  type Profile,
  type Team,
} from "@/lib/types";
import { cn, formatDate, initials, siteUrl } from "@/lib/utils";
import { deleteTeam, revokeInvitation, updateMember } from "./actions";
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
  searchParams: Promise<{ error?: string; welcome?: string }>;
}) {
  const { error, welcome } = await searchParams;
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
  const teams = (teamRows ?? []) as Team[];
  const invites = (invitesResult.data ?? []) as Invitation[];

  const { data: profileRows } = members.length
    ? await supabase.from("profiles").select("id, email, full_name, avatar_url").in("id", members.map((m) => m.user_id))
    : { data: [] };
  const profiles = new Map(((profileRows ?? []) as Profile[]).map((p) => [p.id, p]));
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const teamOptions = [{ value: "", label: "No team" }, ...teams.map((t) => ({ value: t.id, label: t.name }))];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Team</h1>
        <p className="mt-1 text-slate-600">
          {members.filter((m) => m.status === "active").length} active members in {org.name}
        </p>
      </header>

      {welcome && admin && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-900">
          <strong>{org.name} is ready.</strong> Invite your first workers below. Each person gets a link
          to create their account and join your company.
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {admin && (
        <section className="card p-5">
          <h2 className="mb-4 font-semibold">Invite people</h2>
          <InviteForm teams={teams} />
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Member</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Team</th>
                <th className="px-4 py-3 font-medium">Time zone</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                {admin && <th className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((m) => {
                const p = profiles.get(m.user_id);
                const isMe = m.user_id === me.user_id;
                // Owner access and your own row are never edited from here (ownership transfer comes later).
                const editable = admin && !isMe && m.role !== "owner";
                return (
                  <tr key={m.id} className={cn(m.status === "suspended" && "bg-amber-50/50")}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
                          {initials(p?.full_name ?? "", p?.email ?? "")}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {admin ? (
                              <Link className="hover:text-brand-700" href={`/dashboard/activity?user=${m.user_id}`}>
                                {p?.full_name || p?.email}
                              </Link>
                            ) : (
                              p?.full_name || p?.email
                            )}
                            {isMe && <span className="ml-1 text-slate-400">(you)</span>}
                          </p>
                          <p className="truncate text-xs text-slate-500">{p?.email}</p>
                        </div>
                        {m.status === "suspended" && <span className="badge bg-amber-100 text-amber-800">Suspended</span>}
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
                      <p className="text-xs text-slate-400">{localTime(m.timezone)} local</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(m.joined_at, org.timezone)}</td>
                    {admin && (
                      <td className="px-4 py-3">
                        {editable && (
                          <div className="flex justify-end gap-2">
                            <form action={updateMember}>
                              <input type="hidden" name="membership_id" value={m.id} />
                              <input type="hidden" name="status" value={m.status === "suspended" ? "active" : "suspended"} />
                              <button className="btn-secondary btn-sm">
                                {m.status === "suspended" ? "Reactivate" : "Suspend"}
                              </button>
                            </form>
                            <form action={updateMember}>
                              <input type="hidden" name="membership_id" value={m.id} />
                              <input type="hidden" name="status" value="removed" />
                              <ConfirmSubmit message={`Remove ${p?.full_name || p?.email} from ${org.name}? They lose access immediately.`}>
                                Remove
                              </ConfirmSubmit>
                            </form>
                          </div>
                        )}
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
          <h2 className="border-b border-slate-200 px-5 py-3 font-semibold">Pending invitations</h2>
          <ul className="divide-y divide-slate-100">
            {invites.map((inv) => {
              const link = `${siteUrl()}/invite/${inv.token}`;
              return (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div>
                    <p className="font-medium">{inv.email}</p>
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
        <h2 className="mb-1 font-semibold">Teams</h2>
        <p className="mb-4 text-sm text-slate-600">Group people by department or client. Managers will see their team&apos;s time and tasks.</p>
        {teams.length > 0 && (
          <ul className="mb-4 flex flex-wrap gap-2">
            {teams.map((t) => (
              <li key={t.id} className="flex items-center gap-2 rounded-lg border border-slate-200 py-1 pr-1 pl-3 text-sm">
                {t.name}
                <span className="text-xs text-slate-400">
                  {members.filter((m) => m.team_id === t.id).length}
                </span>
                {admin && (
                  <form action={deleteTeam}>
                    <input type="hidden" name="id" value={t.id} />
                    <ConfirmSubmit message={`Delete the team "${t.name}"? Members stay in the company.`} className="rounded px-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600">
                      ×
                    </ConfirmSubmit>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {admin ? <CreateTeamForm /> : teams.length === 0 && <p className="text-sm text-slate-500">No teams yet.</p>}
      </section>
    </div>
  );
}
