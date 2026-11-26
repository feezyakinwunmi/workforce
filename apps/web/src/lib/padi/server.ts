/**
 * Bizz Padi: server helpers shared by its pages and actions (26 Nov 2026).
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getMeetUser } from "@/lib/meet/server";
import { padiBase } from "./paths";

export * from "./types";
import type { Brand } from "./types";

/** "" on the Padi address, "/padi" on the app address. */
export async function padiRequestBase() {
  const h = await headers();
  return padiBase(h.get("x-forwarded-host") ?? h.get("host"));
}

/** Signed-in person (never a Meet guest), or a redirect to sign in and come back. */
export async function requirePadiUser() {
  const u = await getMeetUser();
  if (!u.user) redirect(`/login?next=${encodeURIComponent((await padiRequestBase()) || "/")}`);
  return u as typeof u & { user: NonNullable<typeof u.user> };
}

/** My brand profile, or null when I haven't set it up yet. RLS keeps it to my own row. */
export async function myBrand(supabase: Awaited<ReturnType<typeof getMeetUser>>["supabase"]) {
  const { data } = await supabase
    .from("padi_brands")
    .select("id, name, industry, about, audience, location, tone, colors, platforms, contact, posts_per_week")
    .maybeSingle();
  return (data as Brand | null) ?? null;
}
