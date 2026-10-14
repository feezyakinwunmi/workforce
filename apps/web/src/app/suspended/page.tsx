import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Access paused" };

export default async function SuspendedPage() {
  const { user, member } = await getSession();
  if (!user) redirect("/login");
  if (!member) redirect("/onboarding");
  if (member.status === "active") redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card max-w-sm p-6 text-center">
        <h1 className="mb-2 text-xl font-semibold">Your access is paused</h1>
        <p className="text-sm text-slate-600">
          An admin of your company has suspended your account. Contact them to restore access.
        </p>
        <form action="/auth/signout" method="post" className="mt-6">
          <button className="btn-secondary w-full">Sign out</button>
        </form>
      </div>
    </main>
  );
}
