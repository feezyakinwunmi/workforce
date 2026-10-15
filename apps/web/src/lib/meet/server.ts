// Server only: Meet helpers for pages and actions.
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { meetBase, meetingLink } from "./paths";

/** Signed-in person (not a guest), or null. */
export async function getMeetUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const c = data?.claims;
  if (!c?.sub || c.is_anonymous) return { supabase, user: null, name: null as string | null };
  const { data: profile } = await supabase.from("profiles").select("full_name, email").eq("id", c.sub).maybeSingle();
  const p = profile as { full_name: string; email: string } | null;
  const name = p?.full_name?.trim() || p?.email?.split("@")[0] || null;
  return { supabase, user: { id: c.sub as string, email: (c.email as string | undefined) ?? p?.email ?? "" }, name };
}

export async function requestBase() {
  const h = await headers();
  return meetBase(h.get("x-forwarded-host") ?? h.get("host"));
}

export async function requestOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function linkFor(code: string) {
  return meetingLink(code, await requestOrigin(), await requestBase());
}

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => `\\${c}`);

/** A calendar invite (.ics) with a 10-minute reminder. */
export function calendarInvite(input: { uid: string; title: string; start: Date; minutes: number; link: string; organizer: string; organizerEmail: string }) {
  const end = new Date(input.start.getTime() + input.minutes * 60_000);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Phantomire//Workbase Meet//EN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${input.uid}@workbase-meet`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(input.start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsText(input.title)}`,
    `DESCRIPTION:${icsText(`Join on Workbase Meet: ${input.link}`)}`,
    `LOCATION:${icsText(input.link)}`,
    `URL:${input.link}`,
    input.organizerEmail ? `ORGANIZER;CN=${icsText(input.organizer)}:mailto:${input.organizerEmail}` : "",
    "BEGIN:VALARM",
    "TRIGGER:-PT10M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsText(input.title)} starts in 10 minutes`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}
