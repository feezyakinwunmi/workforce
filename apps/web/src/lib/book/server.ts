// Server only: Book helpers for pages and actions.
import { headers } from "next/headers";
import { getMeetUser } from "@/lib/meet/server";
import { bookBase, bookLink } from "./paths";
import type { BookPlan, HostPage } from "./types";

/** Signed-in person (not a Meet guest) and their booking page, if any. */
export async function getBookHost() {
  const { supabase, user, name } = await getMeetUser();
  if (!user) return { supabase, user: null, name: null, page: null as HostPage | null };
  const { data } = await supabase
    .from("book_pages")
    .select("id, handle, name, about, timezone, color, active, subaccount_code, bank_name, account_last4, account_name")
    .eq("owner_id", user.id)
    .maybeSingle();
  return { supabase, user, name, page: (data as HostPage | null) ?? null };
}

export async function getBookPlan(supabase: Awaited<ReturnType<typeof getMeetUser>>["supabase"]) {
  const { data } = await supabase.rpc("book_my_plan");
  return (data as BookPlan | null) ?? { tier: "free", price_kobo: 200000, paid_until: null };
}

export async function bookRequestBase() {
  const h = await headers();
  return bookBase(h.get("x-forwarded-host") ?? h.get("host"));
}

export async function bookOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Full public link for a Book path on the current address. */
export async function bookLinkFor(path: string) {
  return bookLink(path, await bookOrigin(), await bookRequestBase());
}
