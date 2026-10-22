// Server only: never import this from a client component.
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Cloudflare Realtime (server only): the SFU that carries meeting audio/video, and TURN for
 * networks that block direct connections. Env (Vercel, never NEXT_PUBLIC_):
 *   CF_REALTIME_APP_ID, CF_REALTIME_APP_SECRET   Realtime → SFU app
 *   CF_TURN_KEY_ID, CF_TURN_KEY_API_TOKEN        Realtime → TURN key (optional but recommended)
 *   CF_REALTIME_BASE                             only for local testing (defaults to Cloudflare)
 */
const BASE = process.env.CF_REALTIME_BASE || "https://rtc.live.cloudflare.com/v1";

export const meetMediaConfigured = () => Boolean(process.env.CF_REALTIME_APP_ID && process.env.CF_REALTIME_APP_SECRET);

function app() {
  const id = process.env.CF_REALTIME_APP_ID;
  const secret = process.env.CF_REALTIME_APP_SECRET;
  if (!id || !secret) throw new MediaError("Video calls aren't set up yet (Cloudflare keys are missing).", 503);
  return { id, secret };
}

export class MediaError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

export type Sdp = { type: "offer" | "answer"; sdp: string };
export type CfTrack = { location?: "local" | "remote"; mid?: string; trackName?: string; sessionId?: string; errorCode?: string; errorDescription?: string };
type CfResponse = {
  sessionId?: string;
  sessionDescription?: Sdp;
  tracks?: CfTrack[];
  requiresImmediateRenegotiation?: boolean;
  errorCode?: string;
  errorDescription?: string;
};

async function call(path: string, method: "POST" | "PUT" | "GET", body?: unknown): Promise<CfResponse> {
  const { id, secret } = app();
  const res = await fetch(`${BASE}/apps/${id}${path}`, {
    method,
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as CfResponse;
  if (!res.ok || json.errorCode) {
    throw new MediaError(json.errorDescription || json.errorCode || `Cloudflare answered ${res.status}`, res.status >= 500 ? 502 : 400);
  }
  return json;
}

/** Ask for this size; if it isn't there or the line is too slow, take the next one ("a" before "b"). */
const simulcastPick = (rid: string) => ({ preferredRid: rid, priorityOrdering: "asciibetical", ridNotAvailable: "asciibetical" });

export const sfu = {
  newSession: async () => {
    const res = await call("/sessions/new", "POST");
    if (!res.sessionId) throw new MediaError("Cloudflare did not return a session");
    return res.sessionId;
  },
  /** Publish local tracks: our offer in, Cloudflare's answer out. */
  push: (sessionId: string, offer: Sdp, tracks: Array<{ mid: string; trackName: string }>) =>
    call(`/sessions/${encodeURIComponent(sessionId)}/tracks/new`, "POST", {
      sessionDescription: offer,
      tracks: tracks.map((t) => ({ location: "local", mid: t.mid, trackName: t.trackName })),
    }),
  /** Subscribe to other people's tracks: Cloudflare returns an offer when renegotiation is needed. */
  pull: (sessionId: string, remotes: Array<{ sessionId: string; trackName: string; rid?: string }>) =>
    call(`/sessions/${encodeURIComponent(sessionId)}/tracks/new`, "POST", {
      tracks: remotes.map((r) => ({ location: "remote", sessionId: r.sessionId, trackName: r.trackName, ...(r.rid ? { simulcast: simulcastPick(r.rid) } : {}) })),
    }),
  /** Change which size of a two-size (simulcast) camera I receive: "a" = sharp, "b" = small. */
  update: (sessionId: string, tracks: Array<{ mid: string; sessionId: string; trackName: string; rid: string }>) =>
    call(`/sessions/${encodeURIComponent(sessionId)}/tracks/update`, "PUT", {
      tracks: tracks.map((t) => ({ location: "remote", mid: t.mid, sessionId: t.sessionId, trackName: t.trackName, simulcast: simulcastPick(t.rid) })),
    }),
  /** What Cloudflare knows about a session (its tracks and their status). */
  state: (sessionId: string) => call(`/sessions/${encodeURIComponent(sessionId)}`, "GET"),
  renegotiate: (sessionId: string, answer: Sdp) =>
    call(`/sessions/${encodeURIComponent(sessionId)}/renegotiate`, "PUT", { sessionDescription: answer }),
  close: (sessionId: string, mids: string[], offer?: Sdp) =>
    call(`/sessions/${encodeURIComponent(sessionId)}/tracks/close`, "PUT", {
      tracks: mids.map((mid) => ({ mid })),
      ...(offer ? { sessionDescription: offer, force: false } : { force: true }),
    }),
};

/** STUN/TURN servers for the browser. TURN credentials last 12 hours; cached for 1. */
let iceCache: { at: number; servers: RTCIceServer[] } | null = null;
type RTCIceServer = { urls: string | string[]; username?: string; credential?: string };
export async function iceServers(): Promise<RTCIceServer[]> {
  const fallback: RTCIceServer[] = [{ urls: "stun:stun.cloudflare.com:3478" }];
  const keyId = process.env.CF_TURN_KEY_ID;
  const token = process.env.CF_TURN_KEY_API_TOKEN;
  if (!keyId || !token) return fallback;
  if (iceCache && Date.now() - iceCache.at < 60 * 60_000) return iceCache.servers;
  try {
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: 12 * 60 * 60 }),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as { iceServers?: RTCIceServer[] } | null;
    if (!res.ok || !json?.iceServers?.length) return fallback;
    // Port 53 is blocked by browsers and only slows the connection down.
    const servers = json.iceServers.map((s) => ({
      ...s,
      urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => !/:53(\?|$)/.test(u)),
    }));
    iceCache = { at: Date.now(), servers };
    return servers;
  } catch {
    return fallback;
  }
}

/**
 * A media session belongs to the person who created it: the browser gets a signed ticket with
 * it and must show it for every later change, so nobody can push to or close someone else's.
 */
export function signSession(participantId: string, sessionId: string) {
  return createHmac("sha256", app().secret).update(`${participantId}:${sessionId}`).digest("base64url");
}
export function validTicket(participantId: string, sessionId: string, ticket: unknown) {
  if (typeof ticket !== "string" || !sessionId) return false;
  const a = Buffer.from(signSession(participantId, sessionId));
  const b = Buffer.from(ticket);
  return a.length === b.length && timingSafeEqual(a, b);
}
