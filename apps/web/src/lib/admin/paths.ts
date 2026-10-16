/**
 * The owner console has its own web address (e.g. workbase-admin.vercel.app, later admin.<domain>),
 * served by this same app: the proxy rewrites that host's pages to /admin/*. In production the
 * console opens only on that address (see app/admin/layout.tsx); locally it also works at /admin.
 *
 * ADMIN_URL = the console address (server only, not NEXT_PUBLIC_: it never needs to reach a browser).
 */
function cleanHost(raw: string | undefined) {
  const v = (raw || "").trim().replace(/\/+$/, "");
  if (!v) return "";
  try {
    return new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** Is this request host the console address? (Also anything starting with "admin." or "workbase-admin".) */
export function isAdminHost(host: string | null | undefined) {
  if (!host) return false;
  const h = host.toLowerCase().split(":")[0];
  const configured = cleanHost(process.env.ADMIN_URL);
  return (configured && h === configured) || h.startsWith("admin.") || h.startsWith("workbase-admin");
}

/** Path prefix for console pages on this host: "" on the console address, "/admin" elsewhere. */
export const adminBase = (host: string | null | undefined) => (isAdminHost(host) ? "" : "/admin");

/** Paths that stay as they are on the console address (sign-in, APIs, files). */
export const ADMIN_PASSTHROUGH = /^\/(admin(\/|$)|api\/|auth\/|login|forgot-password|reset-password|_next\/|icon|apple-icon|favicon)/;
