/**
 * Ad conversion events, server side (26 Nov 2026).
 *
 * WHY THIS EXISTS
 *   When an ad brings someone in, Meta (Facebook/Instagram) and Google need to be told when that
 *   person does something worth paying for: signs up, creates a company, pays. That's how the ad
 *   platforms learn which ads work and stop spending on the ones that don't.
 *
 * HOW IT WORKS
 *   Server actions (sign-up code accepted, company created) can't run browser scripts, so they
 *   drop a small, short-lived cookie ("wb_ad_evt") listing the event. The next page the person
 *   lands on loads <AdTags/> (components/ad-tags.tsx), which reads the cookie, sends the event to
 *   Meta/Google, and deletes the cookie. Payment pages use <AdEvent/> directly instead.
 *
 *   Nothing is sent when the ad IDs aren't set on Vercel (NEXT_PUBLIC_META_PIXEL_ID,
 *   NEXT_PUBLIC_GOOGLE_TAG_ID), so this is safe to ship before the ad accounts exist.
 *   No names, emails or company details are ever put in the cookie or sent to the ad platforms:
 *   only the event name and, for payments, the amount in naira.
 */

import { cookies } from "next/headers";

/** The events we report. Names follow Meta's standard events; ad-tags.tsx maps them for Google. */
export type AdEventName = "CompleteRegistration" | "StartTrial" | "Purchase";

export const AD_EVENT_COOKIE = "wb_ad_evt";

/** True when at least one ad platform is configured (otherwise skip the cookie altogether). */
export function adsConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID || process.env.NEXT_PUBLIC_GOOGLE_TAG_ID);
}

/**
 * Remember an event for the next page load. Call it from a Server Action or Route Handler,
 * just before redirecting. Never throws: tracking must never break sign-up.
 */
export async function queueAdEvent(name: AdEventName) {
  if (!adsConfigured()) return;
  try {
    const jar = await cookies();
    const current = (jar.get(AD_EVENT_COOKIE)?.value ?? "").split(",").filter(Boolean);
    if (!current.includes(name)) current.push(name);
    jar.set(AD_EVENT_COOKIE, current.join(","), {
      path: "/",
      maxAge: 10 * 60, // gone after 10 minutes even if no page picks it up
      sameSite: "lax",
      secure: true,
      httpOnly: false, // the browser script has to read it
    });
  } catch {
    // Called somewhere cookies can't be written: just skip the event.
  }
}
