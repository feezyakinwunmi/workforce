import type { Metadata } from "next";
import Link from "next/link";
import { NewPasswordForm } from "@/components/password-form";
import { APP_NAME } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { resetPassword } from "./actions";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="card w-full max-w-sm p-6">
        <p className="mb-4 text-sm font-semibold text-slate-500">{APP_NAME}</p>
        {user ? (
          <>
            <h1 className="mb-1 text-xl font-semibold">Choose a new password</h1>
            <p className="mb-5 text-sm text-slate-600">For {user.email}</p>
            <NewPasswordForm action={resetPassword} submitLabel="Save new password" />
          </>
        ) : (
          <>
            <h1 className="mb-2 text-xl font-semibold">Link expired</h1>
            <p className="text-sm text-slate-600">
              This reset link is no longer valid. Links work once, and only in the browser where you asked for them.
            </p>
            <Link href="/forgot-password" className="btn-primary mt-6 w-full">Send a new link</Link>
          </>
        )}
      </div>
    </main>
  );
}
