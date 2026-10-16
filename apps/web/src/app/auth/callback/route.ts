import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/utils";

/** Where Google (through Supabase) sends people back after "Continue with Google". */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  // Cancelled on Google's page, or the sign-in expired (it must finish in the same browser).
  const cancelled = searchParams.get("error") === "access_denied";
  const message = cancelled ? "Google sign-in was cancelled." : "Google sign-in didn't finish. Try again, or use your email.";
  return NextResponse.redirect(`${origin}/login?next=${encodeURIComponent(next)}&error=${encodeURIComponent(message)}`);
}
