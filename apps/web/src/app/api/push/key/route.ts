import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVapid } from "@/lib/webpush";

/** The server's public push key, for a signed-in person turning notifications on. */
export async function GET() {
  const { member } = await getSession();
  if (!member || member.status !== "active") return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "Push isn't set up on the server yet." }, { status: 503 });
  const vapid = await getVapid(createAdminClient());
  return NextResponse.json({ publicKey: vapid.publicKey }, { headers: { "Cache-Control": "private, max-age=3600" } });
}
