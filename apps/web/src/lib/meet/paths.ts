/**
 * Workbase Meet has its own web address (e.g. workbase-meet.vercel.app, later meet.<domain>),
 * served by this same app: the proxy rewrites that host's pages to /meet/*. On the main
 * dashboard address the same pages live under /meet.
 *
 * NEXT_PUBLIC_MEET_URL = the public Meet address (no trailing slash). Without it, Meet links
 * use the dashboard address + /meet.
 */
export const MEET_NAME = "Workbase Meet";

/**
 * The configured address, cleaned up: "workbase-x.vercel.app", " https://…/ " and similar typos
 * all become "https://workbase-x.vercel.app". A value that still isn't an address is ignored, so a
 * typo in Vercel can never take the whole site down.
 */
const meetUrl = () => cleanUrl(process.env.NEXT_PUBLIC_MEET_URL);
function cleanUrl(raw: string | undefined) {
  const v = (raw || "").trim().replace(/\/+$/, "");
  if (!v) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "";
  }
}

/** Is this request host the Meet address? (Also anything starting with "meet." or "workbase-meet".) */
export function isMeetHost(host: string | null | undefined) {
  if (!host) return false;
  const h = host.toLowerCase().split(":")[0];
  const configured = meetUrl() ? new URL(meetUrl()).hostname.toLowerCase() : "";
  return (configured && h === configured) || h.startsWith("meet.") || h.startsWith("workbase-meet");
}

/** Path prefix for Meet pages on this host: "" on the Meet address, "/meet" elsewhere. */
export const meetBase = (host: string | null | undefined) => (isMeetHost(host) ? "" : "/meet");

/** Shareable link for a meeting code. */
export function meetingLink(code: string, origin?: string, base = "/meet") {
  if (meetUrl()) return `${meetUrl()}/${code}`;
  return `${(origin ?? "").replace(/\/$/, "")}${base}/${code}`;
}

/** Full address of a Meet page (e.g. "/notes/<id>"), for emails. */
export function meetPageUrl(path: string, origin: string) {
  if (meetUrl()) return `${meetUrl()}${path}`;
  return `${origin.replace(/\/$/, "")}/meet${path}`;
}

/** Paths that stay as they are on the Meet address (login, APIs, files). */
export const MEET_PASSTHROUGH = /^\/(meet(\/|$)|api\/|auth\/|login|signup|forgot-password|reset-password|_next\/|manifest|sw\.js|icon|apple-icon|favicon|privacy|terms|what-we-track)/;
