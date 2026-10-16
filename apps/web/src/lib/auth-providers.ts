// Server only: which sign-in providers are switched on in Supabase (Authentication → Sign In / Providers).
// Read from Supabase's public settings and cached for 5 minutes, so the Google button appears by itself
// once Google is set up, and never shows while it would fail.
export async function googleSignInEnabled(): Promise<boolean> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
      next: { revalidate: 300 },
    });
    if (!res.ok) return false;
    const s = (await res.json()) as { external?: Record<string, boolean> };
    return Boolean(s.external?.google);
  } catch {
    return false;
  }
}
