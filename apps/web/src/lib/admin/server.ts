// Server only: who may open the owner console, and the service-role client it reads with.
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { adminBase, isAdminHost } from "./paths";

/** ADMIN_EMAILS (server env): comma-separated emails of the people who run Workbase. */
function adminEmails() {
  return (process.env.ADMIN_EMAILS || "")
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

export async function requestHost() {
  const h = await headers();
  return h.get("x-forwarded-host") ?? h.get("host");
}

export async function adminRequestBase() {
  return adminBase(await requestHost());
}

/**
 * The console's gate. Signed out → sign in. Signed in but not on ADMIN_EMAILS, or on the wrong
 * address in production → a plain 404, so the console doesn't reveal that it exists.
 * Returns the admin's email and the service-role client (used only after this check).
 */
export const requireAdmin = cache(async () => {
  const host = await requestHost();
  if (process.env.NODE_ENV === "production" && !isAdminHost(host)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const c = data?.claims;
  if (!c?.sub || c.is_anonymous) redirect(`/login?next=${encodeURIComponent(adminBase(host) || "/")}`);
  const email = typeof c.email === "string" ? c.email.toLowerCase() : "";
  if (!email || !adminEmails().includes(email)) notFound();

  return { email, db: createAdminClient(), base: adminBase(host) };
});
