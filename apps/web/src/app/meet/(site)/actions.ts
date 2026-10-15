"use server";

import { redirect } from "next/navigation";
import { emailEnabled, sendEmail } from "@/lib/email";
import { initializeTransaction, paystackConfigured } from "@/lib/paystack";
import { calendarInvite, getMeetUser, linkFor, requestBase, requestOrigin } from "@/lib/meet/server";
import type { FormState } from "@/lib/types";

/** Start an instant meeting and go straight in. */
export async function newMeeting() {
  const { supabase, user } = await getMeetUser();
  const base = await requestBase();
  if (!user) redirect(`/login?next=${encodeURIComponent(base || "/")}`);
  const { data, error } = await supabase.rpc("meet_create", { p_title: "", p_waiting_room: true, p_allow_guests: true });
  if (error || !data) redirect(`${base || "/"}?error=${encodeURIComponent(error?.message ?? "Couldn't start a meeting")}`);
  redirect(`${base}/${(data as { code: string }).code}`);
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Schedule a meeting; invitees get an email with a calendar invite. */
export async function scheduleMeeting(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user, name } = await getMeetUser();
  if (!user) return { error: "Sign in first." };
  const title = String(formData.get("title") ?? "").trim();
  const startsAt = String(formData.get("starts_at") ?? "");
  const duration = Number(formData.get("duration") ?? 60);
  const invites = [...new Set(String(formData.get("invites") ?? "").split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!title) return { error: "Give the meeting a name." };
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return { error: "Pick a date and time." };
  if (start.getTime() < Date.now() - 5 * 60_000) return { error: "Pick a time in the future." };
  const bad = invites.filter((e) => !EMAIL.test(e));
  if (bad.length) return { error: `Check these email addresses: ${bad.slice(0, 3).join(", ")}` };
  if (invites.length > 50) return { error: "Invite up to 50 people." };

  const { data, error } = await supabase.rpc("meet_create", {
    p_title: title,
    p_starts_at: start.toISOString(),
    p_duration: duration,
    p_waiting_room: formData.get("waiting_room") === "on",
    p_allow_guests: formData.get("allow_guests") === "on",
    p_invites: invites,
  });
  if (error || !data) return { error: error?.message ?? "Couldn't schedule the meeting." };
  const { code, id } = data as { code: string; id: string };
  const link = await linkFor(code);

  let sent = 0;
  if (invites.length && emailEnabled()) {
    const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short", timeZone: String(formData.get("tz") || "Africa/Lagos") }).format(start);
    const ics = calendarInvite({ uid: id, title, start, minutes: duration, link, organizer: name ?? "Workbase Meet", organizerEmail: user.email });
    sent = await sendEmail(
      invites,
      {
        subject: `Invitation: ${title}`,
        heading: `${name ?? "Someone"} invited you to "${title}"`,
        text: `${when}\n\nJoin from your browser or phone, nothing to install:\n${link}`,
        link: "",
        url: link,
        button: "Join the meeting",
        footer: "Sent by Workbase Meet. The calendar file adds this meeting to Google, Outlook or Apple Calendar.",
      },
      [{ filename: "invite.ics", content: ics, contentType: "text/calendar; charset=utf-8; method=REQUEST" }],
    );
  }
  const base = await requestBase();
  redirect(`${base || "/"}?scheduled=${code}${invites.length ? `&sent=${sent}&of=${invites.length}` : ""}`);
}

/** Pay for Meet Pro or Meet Business through Paystack. */
export async function payMeet(formData: FormData) {
  const { supabase, user } = await getMeetUser();
  const base = await requestBase();
  if (!user) redirect(`/login?next=${encodeURIComponent(`${base}/pricing`)}`);
  const back = (msg: string) => redirect(`${base}/pricing?error=${encodeURIComponent(msg)}`);
  if (!paystackConfigured()) back("Payments aren't set up yet.");
  const plan = String(formData.get("plan"));
  const months = Number(formData.get("months") ?? 1);
  const { data, error } = await supabase.rpc("meet_start_payment", { p_plan: plan, p_months: months });
  if (error || !data) back(error?.message ?? "Couldn't start the payment.");
  const p = data as { reference: string; amount_kobo: number; email: string };
  let url = "";
  try {
    url = await initializeTransaction({
      email: p.email || user!.email,
      amountKobo: p.amount_kobo,
      reference: p.reference,
      callbackUrl: `${await requestOrigin()}${base}/billing/callback`,
      metadata: { product: "meet", plan, months },
    });
  } catch (e) {
    back(e instanceof Error ? e.message : "Paystack didn't answer.");
  }
  redirect(url);
}
