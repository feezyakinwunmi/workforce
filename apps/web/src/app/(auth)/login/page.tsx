import type { Metadata } from "next";
import { Notice } from "@/components/ui";
import { safeNext } from "@/lib/utils";
import { LoginForm } from "../forms";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string; error?: string }>;
}) {
  const { next, email, error } = await searchParams;
  return (
    <>
      {error && (
        <Notice tone="error" className="mb-6">{error}</Notice>
      )}
      <LoginForm next={safeNext(next)} email={email} />
    </>
  );
}
