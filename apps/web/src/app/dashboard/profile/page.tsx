import type { Metadata } from "next";
import { NewPasswordForm } from "@/components/password-form";
import { Avatar, PageHeader } from "@/components/ui";
import { requireMember } from "@/lib/session";
import { EMAIL_KINDS, emailEnabled } from "@/lib/email";
import { isAdminRole, ROLE_LABELS } from "@/lib/types";
import { changePassword } from "./actions";
import { PushToggle } from "@/components/push-toggle";
import { EmailPrefsForm, ProfileForm, ScheduleForm } from "./form";

export const metadata: Metadata = { title: "My profile" };

export default async function ProfilePage() {
  const { supabase, user, profile, member, org } = await requireMember();
  const { data: prefs } = await supabase.from("profiles").select("email_opt_out").eq("id", user.id).maybeSingle();
  const kinds = Object.entries(EMAIL_KINDS)
    .filter(([k]) => k !== "billing" || isAdminRole(member.role))
    .map(([key, label]) => ({ key, label }));
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="My profile" />
      <section className="card flex items-center gap-4 p-5">
        <Avatar name={profile?.full_name} email={user.email} size="lg" />
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-semibold text-slate-900">{profile?.full_name || user.email}</p>
          <p className="truncate text-sm text-slate-500">{ROLE_LABELS[member.role]} at {org.name} · {user.email}</p>
        </div>
      </section>
      <section className="card p-5">
        <h2 className="section-title mb-4 text-base">Details</h2>
        <ProfileForm fullName={profile?.full_name ?? ""} timezone={member.timezone} />
      </section>
      <section className="card p-5">
        <h2 className="section-title mb-4 text-base">Work hours and reminders</h2>
        <ScheduleForm
          start={member.work_start ?? null}
          end={member.work_end ?? null}
          reminders={member.reminders !== false}
          companyStart={org.settings.work_start ?? "09:00"}
          companyEnd={org.settings.work_end ?? "17:00"}
        />
        <div className="mt-5 border-t border-slate-100 pt-5">
          <PushToggle />
        </div>
      </section>
      <section className="card p-5">
        <h2 className="section-title mb-2 text-base">Emails</h2>
        <EmailPrefsForm kinds={kinds} off={(prefs as { email_opt_out: string[] } | null)?.email_opt_out ?? []} enabled={emailEnabled()} />
      </section>
      <section className="card p-5">
        <h2 className="section-title mb-4 text-base">Password</h2>
        <NewPasswordForm action={changePassword} submitLabel="Change password" />
      </section>
      <form action="/auth/signout" method="post">
        <button className="btn-secondary">Sign out</button>
      </form>
    </div>
  );
}
