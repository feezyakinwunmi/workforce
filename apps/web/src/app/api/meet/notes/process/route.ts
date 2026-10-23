import { NextResponse } from "next/server";
import { processDueNotes } from "@/lib/meet/notes";

/**
 * Works on AI notes that are waiting (send the sound to be transcribed, check transcripts, write
 * summaries). Called every minute by the database (pg_cron + pg_net, private.request_notes_dispatch)
 * only when something is waiting, and by the meeting page right after notes stop. No secret is
 * needed: it only does work that is due, and each note is leased by public.meet_notes_due.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function run() {
  try {
    return NextResponse.json(await processDueNotes());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
export const POST = run;
export const GET = run;
