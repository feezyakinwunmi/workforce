/**
 * The parent site (workbasecore.com).
 *
 * The bare domain is the front door for the whole Workbase family: it shows Workbase, Meet,
 * Book and Forms together and sends people on to each product's own address:
 *
 *   workbasecore.com        -> parent site (this file decides when a request is for it)
 *   app.workbasecore.com    -> Workbase itself (dashboard, sign-up, login), NEXT_PUBLIC_SITE_URL
 *   meet. / book. / forms.  -> the other products (see lib/meet, lib/book, lib/forms)
 *
 * NEXT_PUBLIC_HOME_URL = the parent address (no trailing slash). Without it there is no parent
 * site and the app keeps working exactly as before on every host.
 */

/**
 * Turns a configured address into "https://host" (typos like a missing https:// or a trailing
 * slash are forgiven). Anything that still isn't an address gives "", so a typo in Vercel can
 * never take the site down.
 */
export function cleanUrl(raw: string | undefined) {
  const v = (raw || "").trim().replace(/\/+$/, "");
  if (!v) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "";
  }
}

/** The parent site's address, e.g. "https://workbasecore.com" ("" when not set up). */
export const homeUrl = () => cleanUrl(process.env.NEXT_PUBLIC_HOME_URL);

/** The Workbase app's address, e.g. "https://app.workbasecore.com" ("" when not set up). */
export const appUrl = () => cleanUrl(process.env.NEXT_PUBLIC_SITE_URL);

/** Is this request for the parent site? (The configured host, or the same with "www.") */
export function isHomeHost(host: string | null | undefined) {
  const home = homeUrl();
  if (!host || !home) return false;
  const h = host.toLowerCase().split(":")[0].replace(/^www\./, "");
  const configured = new URL(home).hostname.toLowerCase().replace(/^www\./, "");
  // Never treat the app's own host as the parent, even if someone sets both to the same value.
  const app = appUrl() ? new URL(appUrl()).hostname.toLowerCase() : "";
  return h === configured && h !== app;
}

/**
 * Paths the parent site serves itself. Everything else on the parent address (old links such as
 * /dashboard, /login or /invite/...) is sent on to the same path on the app's address.
 *   /home           the page the parent's "/" is rewritten to
 *   /api, /auth     webhooks and sign-in returns that may still point at the bare domain
 *   legal pages     shared by every product
 */
export const HOME_PASSTHROUGH = /^\/(home(\/|$)|api\/|auth\/|_next\/|manifest|sw\.js|icon|apple-icon|favicon|privacy|terms|what-we-track)/;
