"use client";

/**
 * Meta Pixel + Google tag, loaded only where they belong (26 Nov 2026).
 *
 * WHERE THE TAGS LOAD
 *   - Our own public marketing pages (home pages, pricing, sign-up, login, download, legal pages,
 *     onboarding) on every Workbase address: page views are counted there.
 *   - Any other page ONLY when there's a conversion waiting to be reported (a sign-up, a new
 *     company, a payment). Then the tag loads, reports that one event, and nothing else.
 *   - Never: inside the dashboard, meetings, or our customers' own booking pages and forms
 *     (those visitors are our customers' customers, not people we advertise to).
 *
 * Nothing at all happens until the IDs are set on Vercel:
 *   NEXT_PUBLIC_META_PIXEL_ID  (a number from Meta Events Manager)
 *   NEXT_PUBLIC_GOOGLE_TAG_ID  (G-XXXXXXX from Google Analytics, or AW-XXXXXXX from Google Ads)
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";
const GTAG_ID = process.env.NEXT_PUBLIC_GOOGLE_TAG_ID ?? "";
const COOKIE = "wb_ad_evt";

/**
 * Pages where a normal page view is counted, as the visitor sees the address.
 * On meet./book./forms. the landing page is "/" too, and their pricing pages are listed here.
 * Customer pages (book.…/<handle>, forms.…/f/<slug>) are deliberately NOT in this list.
 */
const PUBLIC_PATHS = new Set([
  "/", "/home", "/pricing", "/plan", "/signup", "/login", "/download",
  "/what-we-track", "/privacy", "/terms", "/onboarding",
  "/meet", "/meet/pricing", "/book", "/book/pricing", "/forms", "/forms/plan",
]);

type Win = Window & {
  fbq?: ((...args: unknown[]) => void) & { callMethod?: unknown; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown };
  _fbq?: unknown;
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};

/** Google's names for the same events. */
const GOOGLE_NAME: Record<string, string> = {
  CompleteRegistration: "sign_up",
  StartTrial: "start_trial",
  Purchase: "purchase",
};

let loaded = false;

/** Inject both scripts once. `pageView` = also count this page as a view. */
function load(pageView: boolean) {
  const w = window as Win;
  if (loaded) return;
  loaded = true;

  if (PIXEL_ID) {
    // Meta's standard loader, written out instead of pasted as a minified blob.
    if (!w.fbq) {
      const fbq = function (...args: unknown[]) {
        if (fbq.callMethod) (fbq.callMethod as (...a: unknown[]) => void)(...args);
        else fbq.queue!.push(args);
      } as NonNullable<Win["fbq"]>;
      fbq.push = fbq;
      fbq.loaded = true;
      fbq.version = "2.0";
      fbq.queue = [];
      w.fbq = fbq;
      w._fbq = fbq;
      const s = document.createElement("script");
      s.async = true;
      s.src = "https://connect.facebook.net/en_US/fbevents.js";
      document.head.appendChild(s);
    }
    w.fbq!("init", PIXEL_ID);
    if (pageView) w.fbq!("track", "PageView");
  }

  if (GTAG_ID) {
    w.dataLayer = w.dataLayer || [];
    w.gtag = function (...args: unknown[]) { w.dataLayer!.push(args); };
    w.gtag("js", new Date());
    // send_page_view off when we're only here to report one event.
    w.gtag("config", GTAG_ID, { send_page_view: pageView });
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GTAG_ID)}`;
    document.head.appendChild(s);
  }
}

/** Report one conversion to both platforms (value in naira, for payments). */
export function sendAdEvent(name: string, value?: number) {
  if (!PIXEL_ID && !GTAG_ID) return;
  load(false);
  const w = window as Win;
  const money = value ? { value, currency: "NGN" } : {};
  w.fbq?.("track", name, money);
  w.gtag?.("event", GOOGLE_NAME[name] ?? name, money);
}

/** Read and clear the events a server action left behind. */
function takeQueuedEvents(): string[] {
  const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]*)`));
  if (!m) return [];
  document.cookie = `${COOKIE}=; path=/; max-age=0; samesite=lax; secure`;
  return decodeURIComponent(m[1]).split(",").filter(Boolean);
}

/** Rendered once in the root layout. */
export function AdTags() {
  const pathname = usePathname();

  useEffect(() => {
    if (!PIXEL_ID && !GTAG_ID) return;
    // On product hosts Next rewrites "/" to "/meet" etc., so check the real address bar path.
    const path = window.location.pathname.replace(/\/$/, "") || "/";
    if (PUBLIC_PATHS.has(path)) {
      if (!loaded) load(true);
      else {
        // Client-side navigation between public pages: count the new view.
        const w = window as Win;
        w.fbq?.("track", "PageView");
        if (GTAG_ID) w.gtag?.("event", "page_view", { page_path: path });
      }
    }
    for (const name of takeQueuedEvents()) sendAdEvent(name);
  }, [pathname]);

  return null;
}

/**
 * Drop on a "payment succeeded" page: reports the purchase once per payment reference
 * (sessionStorage stops a refresh from counting it twice).
 */
export function AdEvent({ name, value, once }: { name: string; value?: number; once: string }) {
  useEffect(() => {
    const key = `wb-ad:${once}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Private mode: report anyway.
    }
    sendAdEvent(name, value);
  }, [name, value, once]);
  return null;
}
