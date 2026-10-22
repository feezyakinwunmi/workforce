/**
 * Workbase Forms has its own web address (e.g. workbase-forms.vercel.app, later forms.<domain>),
 * served by this same app: the proxy rewrites that host's pages to /forms/*. On the main
 * dashboard address the same pages live under /forms.
 *
 * NEXT_PUBLIC_FORMS_URL = the public Forms address (no trailing slash). Without it, Forms links
 * use the dashboard address + /forms.
 */
export const FORMS_NAME = "Workbase Forms";

/**
 * The configured address, cleaned up: "workbase-x.vercel.app", " https://…/ " and similar typos
 * all become "https://workbase-x.vercel.app". A value that still isn't an address is ignored, so a
 * typo in Vercel can never take the whole site down.
 */
const formsUrl = () => cleanUrl(process.env.NEXT_PUBLIC_FORMS_URL);
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

/** Is this request host the Forms address? (Also anything starting with "forms." or "workbase-forms".) */
export function isFormsHost(host: string | null | undefined) {
  if (!host) return false;
  const h = host.toLowerCase().split(":")[0];
  const configured = formsUrl() ? new URL(formsUrl()).hostname.toLowerCase() : "";
  return (configured && h === configured) || h.startsWith("forms.") || h.startsWith("workbase-forms");
}

/** Path prefix for Forms pages on this host: "" on the Forms address, "/forms" elsewhere. */
export const formsBase = (host: string | null | undefined) => (isFormsHost(host) ? "" : "/forms");

/** Full public link to a Forms path ("/f/<code>"). */
export function formsLink(path: string, origin?: string, base = "/forms") {
  if (formsUrl()) return `${formsUrl()}${path}`;
  return `${(origin ?? "").replace(/\/$/, "")}${base}${path}`;
}

/** Paths that stay as they are on the Forms address (login, APIs, files). */
export const FORMS_PASSTHROUGH = /^\/(forms(\/|$)|forms-embed\.js|book(\/|$)|meet(\/|$)|api\/|auth\/|login|signup|forgot-password|reset-password|_next\/|manifest|sw\.js|icon|apple-icon|favicon|privacy|terms|what-we-track)/;
