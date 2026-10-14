import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Access paused" };

export default async function SuspendedPage() {
  const { user, member } = await getSession();
  if (!user) redirect("/login");
  if (!member) redirect("/onboarding");
  if (member.status === "active") redirect("/dashboard");

  return (
    <AuthShell aside={false}>
      <AuthHeading title="Your access is paused">An admin of your company suspended your account. Ask them to restore it.</AuthHeading>
      <form action="/auth/signout" method="post">
        <button className="btn-secondary w-full">Sign out</button>
      </form>
    </AuthShell>
  );
}
