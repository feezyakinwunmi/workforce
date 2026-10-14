import type { Metadata } from "next";
import Link from "next/link";
import { NewPasswordForm } from "@/components/password-form";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { createClient } from "@/lib/supabase/server";
import { resetPassword } from "./actions";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <AuthShell>
      {user ? (
        <>
          <AuthHeading title="Choose a new password">For {user.email}</AuthHeading>
          <NewPasswordForm action={resetPassword} submitLabel="Save new password" />
        </>
      ) : (
        <>
          <AuthHeading title="This link has expired">Reset links work once, in the browser where you asked for them.</AuthHeading>
          <Link href="/forgot-password" className="btn-primary w-full py-2.5">Send a new link</Link>
        </>
      )}
    </AuthShell>
  );
}
