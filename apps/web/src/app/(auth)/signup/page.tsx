import type { Metadata } from "next";
import { safeNext } from "@/lib/utils";
import { SignupForm } from "../forms";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string }>;
}) {
  const { next, email } = await searchParams;
  return <SignupForm next={safeNext(next)} email={email} />;
}
