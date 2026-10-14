import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { ROLE_LABELS, type MemberRole } from "@/lib/types";
import { APP_NAME } from "@/lib/config";
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
    <main className="mx-auto max-w-xl px-4 py-12">
      <div className="mb-8 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-500">{APP_NAME}</p>
        <form action="/auth/signout" method="post">
          <button className="text-sm text-slate-500 hover:text-slate-800">Sign out</button>
        </form>
      </div>

      <h1 className="text-2xl font-semibold">Welcome{firstName ? `, ${firstName}` : ""}</h1>
      <p className="mt-1 text-slate-600">Join your team, or set up a new company.</p>

      {invites.length > 0 && (
        <section className="card mt-6 divide-y divide-slate-100">
          <h2 className="px-5 pt-4 pb-3 text-sm font-semibold text-slate-700">You have been invited</h2>
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

      <section className="card mt-6 p-6">
        <h2 className="mb-1 text-lg font-semibold">Set up a new company</h2>
        <p className="mb-5 text-sm text-slate-600">
          You will be the owner. Your 14-day free trial starts today.
        </p>
        <CreateOrganizationForm />
      </section>

      {invites.length === 0 && (
        <p className="mt-6 text-center text-sm text-slate-500">
          Joining an existing team? Ask your admin to invite {user.email}, then open the link they send you.
        </p>
      )}
    </main>
  );
}
