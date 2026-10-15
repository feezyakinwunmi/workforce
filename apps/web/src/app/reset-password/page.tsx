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
          <AuthHeading title="This link has expired">Get a code by email instead. It works on any device.</AuthHeading>
          <Link href="/forgot-password" className="btn-primary w-full py-2.5">Send me a code</Link>
        </>
      )}
    </AuthShell>
  );
}
