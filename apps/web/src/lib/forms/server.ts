// Server only: Workbase Forms helpers for pages and actions.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getMeetUser } from "@/lib/meet/server";
import { formsBase, formsLink } from "./paths";
import type { Field, FormSettings } from "./schema";

export type MyForm = {
  id: string;
  slug: string;
  title: string;
  description: string;
  fields: Field[];
  settings: FormSettings;
  published: boolean;
  accepting: boolean;
  responses: number;
  created_at: string;
  updated_at: string;
};

export type Payout = { subaccount_code: string; bank_name: string; account_last4: string; account_name: string };

export async function formsRequestBase() {
  const h = await headers();
  return formsBase(h.get("x-forwarded-host") ?? h.get("host"));
}

export async function formsOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Full public link for a Forms path on the current address. */
export async function formsLinkFor(path: string) {
  return formsLink(path, await formsOrigin(), await formsRequestBase());
}

/** Signed-in maker (not a Meet guest), or a redirect to sign in. */
export async function requireMaker() {
  const u = await getMeetUser();
  if (!u.user) redirect(`/login?next=${encodeURIComponent((await formsRequestBase()) || "/")}`);
  return u as typeof u & { user: NonNullable<typeof u.user> };
}

/** One of my forms, or a 404. */
export async function myForm(id: string) {
  const { notFound } = await import("next/navigation");
  const m = await requireMaker();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data } = await m.supabase.from("forms").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  return { ...m, form: data as MyForm };
}

export async function myPayout(supabase: Awaited<ReturnType<typeof getMeetUser>>["supabase"]) {
  const { data } = await supabase.from("form_payouts").select("subaccount_code, bank_name, account_last4, account_name").maybeSingle();
  return (data as Payout | null) ?? null;
}

/** The visitor's IP (for the per-visitor speed limit). */
export async function visitorIp() {
  const h = await headers();
  return h.get("cf-connecting-ip") ?? h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
}
