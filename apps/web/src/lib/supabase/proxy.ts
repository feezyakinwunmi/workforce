import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_PASSTHROUGH, isAdminHost } from "@/lib/admin/paths";
import { BOOK_PASSTHROUGH, isBookHost } from "@/lib/book/paths";
import { isMeetHost, MEET_PASSTHROUGH } from "@/lib/meet/paths";
import { safeNext } from "@/lib/utils";

const PROTECTED = ["/dashboard", "/onboarding"];
const AUTH_PAGES = ["/login", "/signup", "/forgot-password"];

/** Refreshes the Supabase session cookie on every request and guards private pages. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not put code between createServerClient and getClaims: it keeps the session fresh
  // (an expired token is renewed here and the new cookie is written to the response).
  const { data } = await supabase.auth.getClaims();
  // Meet guests sign in anonymously: they count as signed out for the dashboard and login pages.
  const user = data?.claims?.sub && !data.claims.is_anonymous ? data.claims : null;

  const path = request.nextUrl.pathname;

  if (!user && PROTECTED.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }

  if (user && AUTH_PAGES.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    return NextResponse.redirect(new URL(safeNext(request.nextUrl.searchParams.get("next")), request.url));
  }

  // The Meet address serves the /meet pages at its root (workbase-meet…/abc-defg-hij → /meet/abc-defg-hij).
  if (isMeetHost(request.headers.get("host")) && !MEET_PASSTHROUGH.test(path)) {
    const url = request.nextUrl.clone();
    url.pathname = `/meet${path === "/" ? "" : path}`;
    const rewritten = NextResponse.rewrite(url, { request });
    response.cookies.getAll().forEach((c) => rewritten.cookies.set(c));
    return rewritten;
  }

  // The Book address serves the /book pages at its root (workbase-book…/femi → /book/femi).
  if (isBookHost(request.headers.get("host")) && !BOOK_PASSTHROUGH.test(path)) {
    const url = request.nextUrl.clone();
    url.pathname = `/book${path === "/" ? "" : path}`;
    const rewritten = NextResponse.rewrite(url, { request });
    response.cookies.getAll().forEach((c) => rewritten.cookies.set(c));
    return rewritten;
  }

  // The owner console's address serves the /admin pages at its root (workbase-admin…/companies → /admin/companies).
  if (isAdminHost(request.headers.get("host")) && !ADMIN_PASSTHROUGH.test(path)) {
    const url = request.nextUrl.clone();
    url.pathname = `/admin${path === "/" ? "" : path}`;
    const rewritten = NextResponse.rewrite(url, { request });
    response.cookies.getAll().forEach((c) => rewritten.cookies.set(c));
    return rewritten;
  }

  return response;
}
