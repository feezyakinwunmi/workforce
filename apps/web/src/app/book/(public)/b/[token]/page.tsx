import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { bookRequestBase } from "@/lib/book/server";
import { LOCATION_LABEL, minutes, naira, STATUS_LABEL, type BookingView } from "@/lib/book/types";
import { meetingLink } from "@/lib/meet/paths";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { HostHeader, PoweredBy } from "../../chrome";
import { CancelBooking, LocalTime } from "./parts";

export const metadata: Metadata = { title: "Your booking", robots: { index: false } };

type Params = { params: Promise<{ token: string }>; searchParams: Promise<{ new?: string; paid?: string }> };

export default async function BookingPage({ params, searchParams }: Params) {
  const [{ token }, sp, base] = await Promise.all([params, searchParams, bookRequestBase()]);
  if (!/^[0-9a-f]{64}$/.test(token)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.rpc("book_get", { p_token: token });
  const b = data as BookingView | null;
  if (!b) notFound();
  const color = b.page.color;
  const fresh = (sp.new === "1" || sp.paid === "1") && b.status === "confirmed";
  const meetUrl = b.location === "meet" && b.meet_code ? meetingLink(b.meet_code, "", "/meet") : null;
  const head =
    b.status === "confirmed" ? (fresh ? "You're booked!" : "Your booking is confirmed")
    : b.status === "pending_payment" ? "Waiting for your payment"
    : b.status === "cancelled" ? "This booking was cancelled"
    : b.status === "completed" ? "This booking is done"
    : STATUS_LABEL[b.status];

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:py-16">
      <div className="card overflow-hidden">
        <div className={cn("px-6 py-6 text-white")} style={{ background: b.status === "cancelled" ? "#64748b" : color }}>
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20">
            <Icon name={b.status === "cancelled" ? "x" : b.status === "pending_payment" ? "clock" : "check"} className="h-6 w-6" />
          </span>
          <h1 className="mt-3 font-display text-2xl font-bold">{head}</h1>
          {fresh && <p className="mt-1 text-white/85">We've emailed the details to {b.customer_email}.</p>}
          {b.status === "pending_payment" && (
            <p className="mt-1 text-white/85">
              We're holding this time{b.hold_until ? <> until <LocalTime iso={b.hold_until} tz={b.page.timezone} timeOnly /></> : ""}. If you didn't finish paying, it will be released and you can book again.
            </p>
          )}
          {b.status === "cancelled" && b.cancel_reason && <p className="mt-1 text-white/85">{b.cancel_reason}</p>}
        </div>
        <div className="space-y-5 p-6">
          <HostHeader name={b.page.name} color={color} small href={`${base}/${b.page.handle}`} />
          <div>
            <p className="font-display text-lg font-semibold text-slate-900">{b.service_title}</p>
            <p className="mt-1 text-slate-700"><LocalTime iso={b.starts_at} tz={b.page.timezone} /></p>
            <p className="text-sm text-slate-500">{minutes(b.duration_min)}</p>
          </div>
          <ul className="space-y-2 text-sm text-slate-700">
            <li className="flex items-start gap-2">
              <Icon name={b.location === "meet" ? "video" : b.location === "phone" ? "phone" : "pin"} className="mt-0.5 h-4 w-4" />
              <span>{LOCATION_LABEL[b.location]}{b.location_detail && b.location !== "meet" ? `: ${b.location_detail}` : ""}{b.location === "phone" && !b.location_detail ? ` (${b.page.name} will call you)` : ""}</span>
            </li>
            {b.price_kobo > 0 && (
              <li className="flex items-start gap-2">
                <Icon name="wallet" className="mt-0.5 h-4 w-4" />
                <span>
                  {b.paid ? `Paid ${naira(b.pay_now_kobo)}` : b.pay_now_kobo ? `${naira(b.pay_now_kobo)} to pay now` : `${naira(b.price_kobo)}, paid on the day`}
                  {b.paid && b.price_kobo > b.pay_now_kobo ? ` · ${naira(b.price_kobo - b.pay_now_kobo)} on the day` : ""}
                </span>
              </li>
            )}
          </ul>
          {b.status === "confirmed" && (
            <div className="flex flex-wrap gap-2">
              {meetUrl && (
                <a href={meetUrl} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90" style={{ background: color }}>
                  <Icon name="video" className="h-4 w-4" /> Join the video call
                </a>
              )}
              <a href={`${base}/b/${token}/ics`} className="btn-secondary">
                <Icon name="calendar" className="h-4 w-4" /> Add to calendar
              </a>
            </div>
          )}
          {meetUrl && b.status === "confirmed" && <p className="text-xs text-slate-500">The call opens a few minutes before the time. {b.page.name} lets you in.</p>}
          {b.can_cancel && <CancelBooking token={token} pending={b.status === "pending_payment"} paid={b.paid} />}
          {(b.status === "cancelled" || b.status === "completed") && (
            <Link href={`${base}/${b.page.handle}`} className="btn-secondary">Book another time</Link>
          )}
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-slate-500">Keep this link private: anyone with it can see or cancel this booking.</p>
      <PoweredBy pro={b.page.pro} base={base} />
    </div>
  );
}
