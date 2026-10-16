import { NextResponse, type NextRequest } from "next/server";
import { isAdminHost } from "@/lib/admin/paths";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  // Only this browser: logging out of the website must not log out the desktop app or phone.
  await supabase.auth.signOut({ scope: "local" });
  // On the owner console's address, signing back in should land on the console.
  const to = isAdminHost(request.headers.get("x-forwarded-host") ?? request.headers.get("host")) ? "/login?next=%2F" : "/login";
  return NextResponse.redirect(new URL(to, request.url), { status: 303 });
}
