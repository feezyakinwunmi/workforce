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

/**
 * The same client, with Realtime signed in as the current person before any channel joins.
 * Without the login token Realtime connects as "anon", and RLS then hides every row.
 */
let ready: Promise<ReturnType<typeof createBrowserClient>> | null = null;
export function realtimeClient() {
  ready ??= (async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) await supabase.realtime.setAuth(data.session.access_token);
    // Keep Realtime's token fresh when the login is renewed.
    supabase.auth.onAuthStateChange((_event: string, session: { access_token?: string } | null) => {
      if (session?.access_token) void supabase.realtime.setAuth(session.access_token);
    });
    return supabase;
  })();
  return ready;
}
