// Server only: who may open the owner console, and the service-role client it reads with.
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { adminBase, isAdminHost } from "./paths";

/** How long one authenticator code keeps the console open. */
export const CODE_VALID_HOURS = 12;

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
 * Step 1: the right address, signed in, and an email on ADMIN_EMAILS. Anything else → a plain 404,
 * so the console doesn't reveal that it exists. Used by the layout and the code page.
 * `codeAt` = when an authenticator code was last entered in this login (null = not yet).
 */
export const requireAdminAccount = cache(async () => {
  const host = await requestHost();
  if (process.env.NODE_ENV === "production" && !isAdminHost(host)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const c = data?.claims;
  if (!c?.sub || c.is_anonymous) redirect(`/login?next=${encodeURIComponent(adminBase(host) || "/")}`);
  const email = typeof c.email === "string" ? c.email.toLowerCase() : "";
  if (!email || !adminEmails().includes(email)) notFound();

  // The login token says how this session was proven: aal2 + an "totp" entry = a code from the app.
  const amr = Array.isArray(c.amr) ? (c.amr as Array<{ method?: string; timestamp?: number }>) : [];
  const totp = amr.filter((a) => a.method === "totp" && typeof a.timestamp === "number").map((a) => a.timestamp!);
  const codeAt = c.aal === "aal2" && totp.length ? Math.max(...totp) * 1000 : null;
  const fresh = codeAt !== null && Date.now() - codeAt < CODE_VALID_HOURS * 3_600_000;

  return { email, base: adminBase(host), fresh, codeAt };
});

/**
 * Step 2, for every console page and action: also an authenticator code entered in the last
 * CODE_VALID_HOURS hours. Otherwise → the code page. Returns the service-role client (used only
 * after both checks).
 */
export const requireAdmin = cache(async () => {
  const account = await requireAdminAccount();
  if (!account.fresh) redirect(`${account.base}/verify`);
  return { email: account.email, base: account.base, db: createAdminClient() };
});
