import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client with the service-role key. SERVER ONLY: used just to confirm
 * Paystack payments (public.confirm_payment is granted to service_role only).
 * The key lives in the Vercel env var SUPABASE_SERVICE_ROLE_KEY, never NEXT_PUBLIC_.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
