import { NextResponse, type NextRequest } from "next/server";
import { checkTranscript, notesConfigured, WEBHOOK_HEADER, webhookOk } from "@/lib/meet/notes";
import { createAdminClient } from "@/lib/supabase/admin";

/** AssemblyAI calls this when a transcript is ready (header signed per note with our secret). */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id) || !notesConfigured() || !webhookOk(id, request.headers.get(WEBHOOK_HEADER))) {
    return NextResponse.json({ error: "not allowed" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data: note } = await admin.from("meet_notes").select("id, status, transcript_id").eq("id", id).maybeSingle();
  if (!note?.transcript_id || note.status !== "transcribing") return NextResponse.json({ ok: true });
  try {
    return NextResponse.json({ status: await checkTranscript(admin, id, note.transcript_id) });
  } catch (e) {
    // The every-minute check will try again.
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 200 });
  }
}
