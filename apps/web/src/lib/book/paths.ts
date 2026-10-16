/**
 * Workbase Book has its own web address (e.g. workbase-book.vercel.app, later book.<domain>),
 * served by this same app: the proxy rewrites that host's pages to /book/*. On the main
 * dashboard address the same pages live under /book.
 *
 * NEXT_PUBLIC_BOOK_URL = the public Book address (no trailing slash). Without it, Book links
 * use the dashboard address + /book.
 */
export const BOOK_NAME = "Workbase Book";

/**
 * The configured address, cleaned up: "workbase-x.vercel.app", " https://…/ " and similar typos
 * all become "https://workbase-x.vercel.app". A value that still isn't an address is ignored, so a
 * typo in Vercel can never take the whole site down.
 */
const bookUrl = () => cleanUrl(process.env.NEXT_PUBLIC_BOOK_URL);
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

/** Is this request host the Book address? (Also anything starting with "book." or "workbase-book".) */
export function isBookHost(host: string | null | undefined) {
  if (!host) return false;
  const h = host.toLowerCase().split(":")[0];
  const configured = bookUrl() ? new URL(bookUrl()).hostname.toLowerCase() : "";
  return (configured && h === configured) || h.startsWith("book.") || h.startsWith("workbase-book");
}

/** Path prefix for Book pages on this host: "" on the Book address, "/book" elsewhere. */
export const bookBase = (host: string | null | undefined) => (isBookHost(host) ? "" : "/book");

/** Full public link to a Book path ("/femi", "/b/<token>"). */
export function bookLink(path: string, origin?: string, base = "/book") {
  if (bookUrl()) return `${bookUrl()}${path}`;
  return `${(origin ?? "").replace(/\/$/, "")}${base}${path}`;
}

/** Paths that stay as they are on the Book address (login, APIs, files). */
export const BOOK_PASSTHROUGH = /^\/(book(\/|$)|meet(\/|$)|api\/|auth\/|login|signup|forgot-password|reset-password|_next\/|manifest|sw\.js|icon|apple-icon|favicon|privacy|terms|what-we-track)/;
