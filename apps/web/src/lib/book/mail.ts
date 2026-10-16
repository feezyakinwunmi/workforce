// Server only: Book emails (confirmation, cancellation, reminders). Claimed from the database
// queue with the service role, each once; sent straight after a booking and by a 5-minute job.
import { sendEmail, emailEnabled } from "@/lib/email";
import { meetingLink } from "@/lib/meet/paths";
import { createAdminClient } from "@/lib/supabase/admin";
import { bookLink } from "./paths";
import { LOCATION_LABEL, naira, type BookLocation } from "./types";

type Job = {
  kind: "confirmed" | "cancelled" | "reminder_24h" | "reminder_1h";
  id: string;
  token: string;
  service_title: string;
  location: BookLocation;
  location_detail: string;
  duration_min: number;
  starts_at: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  notes: string;
  pay_now_kobo: number;
  price_kobo: number;
  paid: boolean;
  meet_code: string | null;
  cancelled_by: "customer" | "host" | "system" | null;
  cancel_reason: string;
  page_name: string;
  handle: string;
  timezone: string;
  host_email: string;
  host_name: string;
};

const siteOrigin = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://phantomire-workforce.vercel.app").replace(/\/$/, "");

function when(iso: string, tz: string) {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz, timeZoneName: "short" }).format(d);
  return `${day}, ${time}`;
}

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => `\\${c}`);

/** Calendar file for a booking, with a 1-hour reminder. */
export function bookingIcs(j: Pick<Job, "id" | "service_title" | "page_name" | "starts_at" | "duration_min" | "location" | "location_detail" | "meet_code">, manage: string, cancelled = false) {
  const start = new Date(j.starts_at);
  const end = new Date(start.getTime() + j.duration_min * 60_000);
  const where = j.location === "meet" && j.meet_code ? meetingLink(j.meet_code, siteOrigin()) : j.location === "in_person" ? j.location_detail : LOCATION_LABEL[j.location];
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Phantomire//Workbase Book//EN",
    `METHOD:${cancelled ? "CANCEL" : "REQUEST"}`,
    "BEGIN:VEVENT",
    `UID:${j.id}@workbase-book`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsText(`${j.service_title} · ${j.page_name}`)}`,
    `DESCRIPTION:${icsText(`Manage your booking: ${manage}`)}`,
    `LOCATION:${icsText(where || "")}`,
    `STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsText(j.service_title)} in 1 hour`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function whereLine(j: Job) {
  if (j.location === "meet") return j.meet_code ? `Video call: ${meetingLink(j.meet_code, siteOrigin())}` : "Video call (link on your booking page)";
  if (j.location === "in_person") return `In person${j.location_detail ? `: ${j.location_detail}` : ""}`;
  return `Phone call${j.location_detail ? `: ${j.location_detail}` : ` (${j.page_name} will call you)`}`;
}

async function sendJob(j: Job) {
  const manage = bookLink(`/b/${j.token}`, siteOrigin());
  const at = when(j.starts_at, j.timezone);
  const footer = `Booked with Workbase Book on ${j.page_name}'s page.`;
  const paidLine = j.pay_now_kobo ? `Paid: ${naira(j.pay_now_kobo)}${j.price_kobo > j.pay_now_kobo ? ` (balance ${naira(j.price_kobo - j.pay_now_kobo)} on the day)` : ""}` : j.price_kobo ? `Price: ${naira(j.price_kobo)}, paid on the day` : "";
  const ics = (cancelled = false) => [{ filename: "booking.ics", content: bookingIcs(j, manage, cancelled), contentType: `text/calendar; method=${cancelled ? "CANCEL" : "REQUEST"}` }];

  if (j.kind === "confirmed") {
    await sendEmail([j.customer_email], {
      subject: `Booked: ${j.service_title} with ${j.page_name}, ${at}`,
      heading: `You're booked, ${j.customer_name.split(" ")[0]}!`,
      text: [`${j.service_title} with ${j.page_name}`, at, whereLine(j), paidLine].filter(Boolean).join("\n"),
      link: "", url: manage, button: "See or cancel your booking", footer,
    }, ics());
    await sendEmail([j.host_email], {
      subject: `New booking: ${j.customer_name}, ${at}`,
      heading: `${j.customer_name} booked ${j.service_title}`,
      text: [at, `${j.customer_email}${j.customer_phone ? ` · ${j.customer_phone}` : ""}`, paidLine, j.notes ? `Note: ${j.notes}` : ""].filter(Boolean).join("\n"),
      link: "", url: bookLink("", siteOrigin()), button: "Open your bookings", footer: "Workbase Book",
    }, ics());
  } else if (j.kind === "cancelled") {
    const by = j.cancelled_by === "host" ? j.page_name : j.cancelled_by === "customer" ? j.customer_name : "Workbase Book";
    const reason = j.cancel_reason ? `Reason: ${j.cancel_reason}` : "";
    const refund = j.paid ? `${naira(j.pay_now_kobo)} was paid. ${j.cancelled_by === "customer" ? "Any refund is up to the host." : `${j.page_name} will refund you.`}` : "";
    await sendEmail([j.customer_email], {
      subject: `Cancelled: ${j.service_title}, ${at}`,
      heading: `Your booking was cancelled by ${j.cancelled_by === "customer" ? "you" : by}`,
      text: [`${j.service_title} with ${j.page_name}`, at, reason, refund].filter(Boolean).join("\n"),
      link: "", url: bookLink(`/${j.handle}`, siteOrigin()), button: "Book another time", footer,
    }, ics(true));
    await sendEmail([j.host_email], {
      subject: `Cancelled: ${j.customer_name}, ${at}`,
      heading: `${j.service_title} with ${j.customer_name} was cancelled${j.cancelled_by === "host" ? "" : ` by ${by}`}`,
      text: [at, reason, j.paid ? `They paid ${naira(j.pay_now_kobo)}: refund them directly if needed (for example by bank transfer).` : ""].filter(Boolean).join("\n"),
      link: "", url: bookLink("", siteOrigin()), button: "Open your bookings", footer: "Workbase Book",
    }, ics(true));
  } else {
    const soon = j.kind === "reminder_1h" ? "in 1 hour" : "tomorrow";
    await sendEmail([j.customer_email], {
      subject: `Reminder: ${j.service_title} with ${j.page_name} ${soon}`,
      heading: `See you ${soon}!`,
      text: [`${j.service_title} with ${j.page_name}`, at, whereLine(j)].join("\n"),
      link: "", url: j.location === "meet" && j.meet_code ? meetingLink(j.meet_code, siteOrigin()) : manage,
      button: j.location === "meet" && j.meet_code ? "Join the video call" : "See your booking", footer,
    });
    if (j.kind === "reminder_1h") {
      await sendEmail([j.host_email], {
        subject: `In 1 hour: ${j.customer_name}, ${j.service_title}`,
        heading: `${j.customer_name} is booked in 1 hour`,
        text: [at, whereLine(j), j.customer_phone ? `Phone: ${j.customer_phone}` : ""].filter(Boolean).join("\n"),
        link: "", url: j.location === "meet" && j.meet_code ? meetingLink(j.meet_code, siteOrigin()) : bookLink("", siteOrigin()),
        button: j.location === "meet" && j.meet_code ? "Open the video call" : "Open your bookings", footer: "Workbase Book",
      });
    }
  }
}

/** Send every Book email that is due. Never throws. */
export async function processBookMail() {
  if (!emailEnabled() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return 0;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("book_claim_mail");
    if (error || !Array.isArray(data)) return 0;
    for (const job of data as Job[]) await sendJob(job).catch((e) => console.error("Book email failed:", e));
    return data.length;
  } catch (e) {
    console.error("Book mail:", e);
    return 0;
  }
}
