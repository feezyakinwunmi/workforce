import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { createClient } from "./server";

/**
 * Client for the sign-in / sign-up / code / reset calls in app/(auth)/actions.ts ONLY.
 *
 * Those calls run on our server, so without help Supabase sees Vercel's address for every visitor
 * and its per-address limits (e.g. 30 sign-ins per 5 minutes) would apply to everyone at once.
 * When SUPABASE_SECRET_KEY (an `sb_secret_…` key, Vercel server env only) is set and "IP address
 * forwarding" is on in Supabase → Authentication → Rate Limits, we send each visitor's real
 * address in `sb-forwarded-for`, so the limits apply per person again.
 *
 * Never use this client for database reads or writes: the secret key bypasses row-level security.
 * Without the key it is simply the normal client.
 */
export async function createAuthClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret?.startsWith("sb_secret_")) return createClient();

  const h = await headers();
  const ip = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, {
    global: ip ? { headers: { "sb-forwarded-for": ip } } : undefined,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // read-only context: the proxy refreshes the session instead
        }
      },
    },
  });
}
