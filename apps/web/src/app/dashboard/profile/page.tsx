import type { Metadata } from "next";
import { requireMember } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/types";
import { NewPasswordForm } from "@/components/password-form";
import { changePassword } from "./actions";
import { ProfileForm } from "./form";

export const metadata: Metadata = { title: "My profile" };

export default async function ProfilePage() {
  const { user, profile, member, org } = await requireMember();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">My profile</h1>
        <p className="mt-1 text-slate-600">
          {ROLE_LABELS[member.role]} at {org.name} · {user.email}
        </p>
      </header>
      <ProfileForm fullName={profile?.full_name ?? ""} timezone={member.timezone} />
      <section className="card max-w-xl p-5">
        <h2 className="mb-4 font-semibold">Change password</h2>
        <NewPasswordForm action={changePassword} submitLabel="Change password" />
      </section>
      <form action="/auth/signout" method="post">
        <button className="btn-secondary">Sign out</button>
      </form>
    </div>
  );
}
