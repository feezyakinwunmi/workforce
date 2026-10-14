"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for the browser (live chat). Uses the same login cookie as the
 * server, and only the public anon key: RLS decides what it can read and write.
 */
let client: ReturnType<typeof createBrowserClient> | null = null;
export function createClient() {
  client ??= createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  return client;
}
