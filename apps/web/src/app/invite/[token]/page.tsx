import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { ROLE_LABELS, type MemberRole } from "@/lib/types";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { AcceptInvitationForm } from "@/app/onboarding/forms";

export const metadata: Metadata = { title: "Invitation" };

type InvitePreview = {
  organization_name: string;
  email: string;
  role: MemberRole;
  status: "pending" | "accepted" | "expired" | "revoked";
};

const CLOSED: Record<Exclude<InvitePreview["status"], "pending">, string> = {
  accepted: "This invitation has already been used.",
  expired: "This invitation has expired. Ask your admin to send a new one.",
  revoked: "This invitation was cancelled. Ask your admin for a new one.",
};

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { supabase, user, member } = await getSession();
  const { data } = await supabase.rpc("get_invitation", { p_token: token });
  const invite = (data as InvitePreview[] | null)?.[0];
  const here = `/invite/${token}`;

  let body: React.ReactNode;

  if (!invite) {
    body = <p className="text-slate-600">This invitation link is not valid. Check that you copied the whole link.</p>;
  } else if (invite.status !== "pending") {
    body = (
      <>
        <p className="text-slate-600">{CLOSED[invite.status]}</p>
        {user && <Link href="/dashboard" className="btn-secondary mt-4">Go to dashboard</Link>}
      </>
    );
  } else if (!user) {
    body = (
      <>
        <p className="text-slate-600">
          You have been invited to join <strong>{invite.organization_name}</strong> as{" "}
          {ROLE_LABELS[invite.role].toLowerCase()}. Create an account with <strong>{invite.email}</strong> to accept.
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          <Link className="btn-primary" href={`/signup?next=${encodeURIComponent(here)}&email=${encodeURIComponent(invite.email)}`}>
            Create account
          </Link>
          <Link className="btn-secondary" href={`/login?next=${encodeURIComponent(here)}&email=${encodeURIComponent(invite.email)}`}>
            I already have an account
          </Link>
        </div>
      </>
    );
  } else if (user.email?.toLowerCase() !== invite.email) {
    body = (
      <>
        <p className="text-slate-600">
          This invitation is for <strong>{invite.email}</strong>, but you are signed in as{" "}
          <strong>{user.email}</strong>. Sign out and use the invited email.
        </p>
        <form action="/auth/signout" method="post" className="mt-6">
          <button className="btn-secondary w-full">Sign out</button>
        </form>
      </>
    );
  } else if (member) {
    body = (
      <>
        <p className="text-slate-600">
          You already belong to a company. For now an account can be in one company at a time.
        </p>
        <Link href="/dashboard" className="btn-secondary mt-6 w-full">Go to dashboard</Link>
      </>
    );
  } else {
    body = (
      <>
        <p className="mb-6 text-slate-600">
          Join <strong>{invite.organization_name}</strong> as {ROLE_LABELS[invite.role].toLowerCase()}.
        </p>
        <AcceptInvitationForm token={token} label={`Join ${invite.organization_name}`} />
      </>
    );
  }

  return (
    <AuthShell>
      <AuthHeading title={invite?.status === "pending" ? `Join ${invite.organization_name}` : "Invitation"} />
      {body}
    </AuthShell>
  );
}
