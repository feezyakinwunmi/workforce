import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { ROLE_LABELS, type MemberRole } from "@/lib/types";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { Icon } from "@/components/icons";
import { AcceptInvitationForm, CreateOrganizationForm } from "./forms";

export const metadata: Metadata = { title: "Get started" };

type PendingInvite = { token: string; organization_name: string; role: MemberRole; expires_at: string };

export default async function OnboardingPage() {
  const { supabase, user, profile, member } = await getSession();
  if (!user) redirect("/login?next=/onboarding");
  if (member) redirect(member.status === "active" ? "/dashboard" : "/suspended");

  const { data } = await supabase.rpc("my_pending_invitations");
  const invites = (data ?? []) as PendingInvite[];
  const firstName = profile?.full_name?.split(" ")[0];

  return (
    <AuthShell wide>
      <AuthHeading title={`Welcome${firstName ? `, ${firstName}` : ""}`}>Join your team, or set up a new company.</AuthHeading>

      {invites.length > 0 && (
        <section className="card mb-6 divide-y divide-slate-100 overflow-hidden">
          <h2 className="flex items-center gap-2 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-700">
            <Icon name="mail" className="h-4 w-4 text-brand-600" />
            You&apos;re invited
          </h2>
          {invites.map((inv) => (
            <div key={inv.token} className="flex items-center justify-between gap-4 px-5 py-4">
              <div>
                <p className="font-medium">{inv.organization_name}</p>
                <p className="text-sm text-slate-500">as {ROLE_LABELS[inv.role]}</p>
              </div>
              <AcceptInvitationForm token={inv.token} />
            </div>
          ))}
        </section>
      )}

      <section className="card p-6">
        <h2 className="section-title">Set up a new company</h2>
        <p className="mt-1 mb-5 text-sm text-slate-500">You&apos;ll be the owner. Your 14-day free trial starts today.</p>
        <CreateOrganizationForm />
      </section>

      {invites.length === 0 && (
        <p className="mt-6 text-center text-sm text-slate-500">
          Joining a team? Ask your admin to invite {user.email}.
        </p>
      )}
      <form action="/auth/signout" method="post" className="mt-4 text-center">
        <button className="text-sm text-slate-500 hover:text-slate-800">Sign out</button>
      </form>
    </AuthShell>
  );
}
