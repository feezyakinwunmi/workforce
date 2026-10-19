import { NextResponse, type NextRequest } from "next/server";
import { iceServers, MediaError, sfu, signSession, validTicket, type Sdp } from "@/lib/meet/cloudflare";
import { createClient } from "@/lib/supabase/server";

/**
 * Media for one meeting, through Cloudflare Realtime. Every call first asks the database
 * (as the signed-in person or guest) whether they're admitted to this live meeting.
 *
 *   { op: "ice" }                                            → STUN/TURN servers
 *   { op: "session" }                                        → new media session + ticket
 *   { op: "push", session, ticket, offer, tracks }           → publish my tracks
 *   { op: "pull", session, ticket, remotes }                 → subscribe to others' tracks
 *   { op: "renegotiate", session, ticket, answer }
 *   { op: "close", session, ticket, mids, offer? }
 *   { op: "state", session, ticket }                         → my session's tracks as Cloudflare sees them
 */
const UUID = /^[0-9a-f-]{36}$/i;
// "camera", or "camera.2" after a track was published again.
const NAME = /^(mic|camera|screen|screen-audio)(\.[0-9]{1,4})?$/;

type Check = { ok: boolean; participant_id?: string; sessions?: string[] };

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
const isSdp = (x: unknown, type: Sdp["type"]): x is Sdp =>
  typeof x === "object" && x !== null && (x as Sdp).type === type && typeof (x as Sdp).sdp === "string" && (x as Sdp).sdp.length < 100_000;

export async function POST(request: NextRequest, { params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  if (!UUID.test(room)) return bad("Unknown meeting", 404);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return bad("Bad request");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("meet_media_check", { p_room: room });
  const check = data as Check | null;
  if (error || !check?.ok || !check.participant_id) return bad("You're not in this meeting right now.", 403);
  const me = check.participant_id;

  // New sessions and relay credentials cost money at Cloudflare: cap them per person
  // (150 per 5 minutes is far above what reconnecting on a bad network needs).
  if (body.op === "ice" || body.op === "session") {
    const { error: limited } = await supabase.rpc("rate_check", { p_bucket: "meet_media" });
    if (limited) return bad("Too many connection attempts. Wait a moment and try again.", 429);
  }

  try {
    switch (body.op) {
      case "ice":
        return NextResponse.json({ iceServers: await iceServers() });

      case "session": {
        const session = await sfu.newSession();
        return NextResponse.json({ session, ticket: signSession(me, session) });
      }
    }

    // Everything else acts on one of my own sessions.
    const session = String(body.session ?? "");
    if (!validTicket(me, session, body.ticket)) return bad("That media session isn't yours.", 403);

    switch (body.op) {
      case "push": {
        const tracks = body.tracks as Array<{ mid: string; trackName: string }>;
        if (!isSdp(body.offer, "offer") || !Array.isArray(tracks) || !tracks.length || tracks.length > 4
            || !tracks.every((t) => typeof t?.mid === "string" && NAME.test(String(t?.trackName)))) {
          return bad("Bad publish request");
        }
        return NextResponse.json(await sfu.push(session, body.offer, tracks));
      }
      case "pull": {
        const remotes = body.remotes as Array<{ sessionId: string; trackName: string }>;
        if (!Array.isArray(remotes) || !remotes.length || remotes.length > 60) return bad("Bad subscribe request");
        // Only tracks published by people in this meeting.
        const allowed = new Set(check.sessions ?? []);
        if (!remotes.every((r) => allowed.has(String(r?.sessionId)) && NAME.test(String(r?.trackName)) && r.sessionId !== session)) {
          return bad("That person isn't in this meeting.", 403);
        }
        return NextResponse.json(await sfu.pull(session, remotes));
      }
      case "state": {
        // Only the tracks' names and status go back to the browser.
        const st = await sfu.state(session);
        const tracks = (st.tracks ?? []).map((t) => ({ trackName: t.trackName, location: t.location, status: (t as { status?: string }).status, mid: t.mid }));
        return NextResponse.json({ tracks });
      }
      case "renegotiate":
        if (!isSdp(body.answer, "answer")) return bad("Bad answer");
        return NextResponse.json(await sfu.renegotiate(session, body.answer));
      case "close": {
        const mids = body.mids as string[];
        if (!Array.isArray(mids) || !mids.length || mids.length > 60 || !mids.every((m) => typeof m === "string")) return bad("Bad close request");
        if (body.offer !== undefined && !isSdp(body.offer, "offer")) return bad("Bad offer");
        return NextResponse.json(await sfu.close(session, mids, body.offer as Sdp | undefined));
      }
      default:
        return bad("Unknown request");
    }
  } catch (e) {
    if (e instanceof MediaError) return bad(e.message, e.status);
    return bad("The call service didn't answer. Try again.", 502);
  }
}
