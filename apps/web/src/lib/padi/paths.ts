/**
 * Bizz Padi: where it lives (26 Nov 2026).
 *
 * Bizz Padi is a Workbase-family product (same accounts and database as Workbase, Meet, Book and
 * Forms) with its own web address later. It is served by this same app, exactly like Forms:
 *   - On its own address (NEXT_PUBLIC_PADI_URL, e.g. https://bizzpadi.com) the proxy rewrites
 *     every page to /padi/*, so visitors see bizzpadi.com/setup, not /padi/setup.
 *   - On the app address the same pages live under /padi (app.workbasecore.com/padi).
 *
 * The product name sits in PADI_NAME only, so renaming later is a one-line change.
 */
export const PADI_NAME = "Bizz Padi";

/** The configured address, cleaned up. A broken value is ignored so it can never take the site down. */
const padiUrl = () => cleanUrl(process.env.NEXT_PUBLIC_PADI_URL);
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

/** Is this request host the Bizz Padi address? (Also anything starting with "padi." or "bizzpadi".) */
export function isPadiHost(host: string | null | undefined) {
  if (!host) return false;
  const h = host.toLowerCase().split(":")[0];
  const configured = padiUrl() ? new URL(padiUrl()).hostname.toLowerCase() : "";
  return Boolean((configured && (h === configured || h === `www.${configured}`)) || h.startsWith("padi.") || h.startsWith("bizzpadi"));
}

/** Path prefix for Padi pages on this host: "" on the Padi address, "/padi" elsewhere. */
export const padiBase = (host: string | null | undefined) => (isPadiHost(host) ? "" : "/padi");

/** Paths that stay as they are on the Padi address (login, APIs, shared pages, other products). */
export const PADI_PASSTHROUGH =
  /^\/(padi(\/|$)|forms(\/|$)|book(\/|$)|meet(\/|$)|api\/|auth\/|login|signup|forgot-password|reset-password|_next\/|manifest|sw\.js|icon|apple-icon|favicon|privacy|terms|what-we-track)/;
