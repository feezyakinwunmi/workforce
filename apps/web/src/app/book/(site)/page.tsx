import type { Metadata } from "next";
import Link from "next/link";
import { CopyButton } from "@/components/form";
import { Icon, type IconName } from "@/components/icons";
import { Notice } from "@/components/ui";
import { bookLinkFor, bookRequestBase, getBookHost } from "@/lib/book/server";
import { LOCATION_SHORT, naira, STATUS_LABEL, whatsappLink, type HostBooking, type HostPage } from "@/lib/book/types";
import { meetingLink } from "@/lib/meet/paths";
import { cn } from "@/lib/utils";
import { BookingActions } from "./booking-actions";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: { absolute: "Workbase Book: booking pages that get paid" } };

type SP = Promise<{ view?: string; welcome?: string }>;

export default async function BookHome({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const [{ supabase, user, name, page }, base] = await Promise.all([getBookHost(), bookRequestBase()]);
  if (!user) return <Landing base={base} />;
  if (!page) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
        <h1 className="font-display text-3xl font-bold text-slate-900">Create your booking page</h1>
        <div className="card mt-6 p-6">
          <SetupForm suggestedName={name ?? ""} base={base} />
        </div>
      </div>
    );
  }
  return <Dashboard supabase={supabase} page={page} base={base} view={sp.view} welcome={!!sp.welcome} />;
}

// ---------------------------------------------------------------- host dashboard

async function Dashboard({ supabase, page, base, view, welcome }: {
  supabase: Awaited<ReturnType<typeof getBookHost>>["supabase"];
  page: HostPage;
  base: string;
  view?: string;
  welcome: boolean;
}) {
  const tab = view === "past" || view === "cancelled" ? view : "upcoming";
  const nowIso = new Date().toISOString();
  const cols = "id, service_title, location, starts_at, ends_at, duration_min, customer_name, customer_email, customer_phone, notes, status, pay_now_kobo, price_kobo, paid_at, fee_kobo, meet_code, cancelled_by, cancel_reason, created_at";
  let q = supabase.from("book_bookings").select(cols).eq("page_id", page.id).limit(100);
  if (tab === "upcoming") q = q.in("status", ["confirmed", "pending_payment"]).gte("ends_at", nowIso).order("starts_at");
  else if (tab === "past") q = q.in("status", ["confirmed", "completed", "no_show"]).lt("ends_at", nowIso).order("starts_at", { ascending: false });
  else q = q.eq("status", "cancelled").neq("cancel_reason", "Not paid in time").order("starts_at", { ascending: false });

  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const [{ data: rows }, { data: services }, { count: hours }, { data: month }, link] = await Promise.all([
    q,
    supabase.from("book_services").select("id, active, pay_now_kobo").eq("page_id", page.id),
    supabase.from("book_hours").select("id", { count: "exact", head: true }).eq("page_id", page.id),
    supabase.from("book_bookings").select("status, pay_now_kobo, fee_kobo, paid_at").eq("page_id", page.id).gte("starts_at", monthStart),
    bookLinkFor(`/${page.handle}`),
  ]);
  const list = (rows ?? []) as HostBooking[];
  const svc = (services ?? []) as Array<{ id: string; active: boolean; pay_now_kobo: number }>;
  const m = (month ?? []) as Array<{ status: string; pay_now_kobo: number; fee_kobo: number; paid_at: string | null }>;
  const booked = m.filter((b) => ["confirmed", "completed", "no_show"].includes(b.status)).length;
  const earned = m.filter((b) => b.paid_at && b.status !== "cancelled").reduce((s, b) => s + b.pay_now_kobo - b.fee_kobo, 0);
  const needsBank = svc.some((s) => s.active && s.pay_now_kobo > 0) && !page.subaccount_code;

  const day = (iso: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: page.timezone }).format(new Date(iso));
  const time = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: page.timezone }).format(new Date(iso));

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      {welcome && <Notice tone="success">Your page is live. We added weekday hours (9:00–17:00) and a free 30-minute call to start. Change them any time.</Notice>}
      {!page.active && <Notice tone="warning">Your page is paused: nobody can book. Turn it back on in <Link className="underline" href={`${base}/settings`}>Settings</Link>.</Notice>}
      {needsBank && (
        <Notice tone="warning" action={<Link className="btn-secondary btn-sm" href={`${base}/settings#payouts`}>Add bank account</Link>}>
          Some services ask for payment. Add the bank account where you want to receive it, or customers can't book them.
        </Notice>
      )}
      {!hours && <Notice tone="warning" action={<Link className="btn-secondary btn-sm" href={`${base}/availability`}>Set hours</Link>}>You have no opening hours, so nobody can book yet.</Notice>}

      <section className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center" style={{ borderLeft: `4px solid ${page.color}` }}>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-500">Your booking page</p>
          <a href={link} target="_blank" rel="noreferrer" className="block truncate font-display text-lg font-semibold text-slate-900 hover:text-brand-700">{link.replace(/^https?:\/\//, "")}</a>
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyButton text={link} />
          <a href={`https://wa.me/?text=${encodeURIComponent(`Book a time with me: ${link}`)}`} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
            <Icon name="whatsapp" className="h-4 w-4" /> Share
          </a>
          <a href={link} target="_blank" rel="noreferrer" className="btn-secondary btn-sm"><Icon name="link" className="h-4 w-4" /> Open</a>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="Booked this month" value={String(booked)} />
        <Stat label="Paid to you this month" value={naira(earned)} hint="After Workbase's fee; Paystack's own fee is taken before it reaches your bank." />
        <Stat label="Services" value={`${svc.filter((s) => s.active).length} active`} href={`${base}/services`} />
      </section>

      <section className="card overflow-hidden">
        <div className="flex gap-1 border-b border-slate-100 px-3">
          {(["upcoming", "past", "cancelled"] as const).map((t) => (
            <Link
              key={t}
              href={`${base || ""}${t === "upcoming" ? "" : `?view=${t}`}` || "/"}
              className={cn("border-b-2 px-3 py-3 text-sm font-medium capitalize", t === tab ? "border-brand-600 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900")}
            >
              {t}
            </Link>
          ))}
        </div>
        {list.length ? (
          <ul className="divide-y divide-slate-100">
            {list.map((b) => {
              const wa = b.customer_phone ? whatsappLink(b.customer_phone, `Hello ${b.customer_name.split(" ")[0]}, about your booking with ${page.name} on ${day(b.starts_at)} at ${time(b.starts_at)}:`) : null;
              const meet = b.location === "meet" && b.meet_code && b.status === "confirmed" ? meetingLink(b.meet_code, "", "/meet") : null;
              const past = Date.parse(b.ends_at) < Date.now();
              return (
                <li key={b.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                  <div className="w-28 shrink-0">
                    <p className="text-sm font-semibold text-slate-900">{day(b.starts_at)}</p>
                    <p className="text-sm text-slate-500 tabular-nums">{time(b.starts_at)}–{time(b.ends_at)}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">
                      {b.customer_name}
                      <span className="ml-2 text-sm font-normal text-slate-500">{b.service_title} · {LOCATION_SHORT[b.location]}</span>
                    </p>
                    <p className="truncate text-sm text-slate-500">
                      <a className="hover:text-slate-900" href={`mailto:${b.customer_email}`}>{b.customer_email}</a>
                      {b.customer_phone ? ` · ${b.customer_phone}` : ""}
                    </p>
                    {b.notes && <p className="mt-1 line-clamp-2 text-sm text-slate-600">“{b.notes}”</p>}
                    {b.status === "cancelled" && b.cancel_reason && <p className="mt-1 text-sm text-slate-500">Reason: {b.cancel_reason}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={b.status} />
                    {b.paid_at ? <span className="badge bg-emerald-50 text-emerald-700">Paid {naira(b.pay_now_kobo)}</span> : b.price_kobo > 0 && b.status !== "cancelled" ? <span className="badge bg-slate-100 text-slate-600">{naira(b.price_kobo)} on the day</span> : null}
                    {wa && b.status !== "cancelled" && (
                      <a href={wa} target="_blank" rel="noreferrer" className="btn-secondary btn-sm" title="Message on WhatsApp"><Icon name="whatsapp" className="h-4 w-4" /><span className="sr-only">WhatsApp</span></a>
                    )}
                    {meet && !past && <a href={meet} className="btn-primary btn-sm"><Icon name="video" className="h-4 w-4" /> Call</a>}
                    <BookingActions id={b.id} status={b.status} past={past} paid={!!b.paid_at} />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="px-5 py-10 text-center text-sm text-slate-500">
            {tab === "upcoming" ? <>No upcoming bookings yet. Share your link on WhatsApp, Instagram or your website.</> : tab === "past" ? "No past bookings." : "No cancelled bookings."}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, hint, href }: { label: string; value: string; hint?: string; href?: string }) {
  const body = (
    <>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </>
  );
  return href ? <Link href={href} className="card p-4 hover:shadow-md">{body}</Link> : <div className="card p-4">{body}</div>;
}

function StatusBadge({ status }: { status: HostBooking["status"] }) {
  const tone: Record<HostBooking["status"], string> = {
    confirmed: "bg-brand-50 text-brand-700",
    pending_payment: "bg-amber-50 text-amber-800",
    cancelled: "bg-slate-100 text-slate-500",
    completed: "bg-emerald-50 text-emerald-700",
    no_show: "bg-red-50 text-red-700",
  };
  return <span className={cn("badge", tone[status])}>{STATUS_LABEL[status]}</span>;
}

// ---------------------------------------------------------------- landing (signed out)

const FEATURES: Array<[IconName, string, string]> = [
  ["wallet", "Deposits stop no-shows", "Ask for a deposit or the full price. Paid by card, transfer or USSD, straight to your bank."],
  ["video", "Video calls built in", "Online sessions get their own Workbase Meet link. Nothing to install."],
  ["bell", "Reminders that work", "Email reminders a day and an hour before, with a calendar file."],
  ["whatsapp", "WhatsApp in one tap", "Message any customer from your bookings list."],
  ["globe", "Any time zone", "Customers abroad see times in their own zone."],
  ["calendar", "Your hours, your rules", "Opening hours, days off, gaps between sessions and a daily limit."],
];

function Landing({ base }: { base: string }) {
  const start = `/signup?next=${encodeURIComponent(base || "/")}`;
  return (
    <>
      <section className="overflow-hidden">
        <div className="mx-auto grid max-w-5xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-20">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#f2a93b]/15 px-3 py-1 text-xs font-semibold tracking-wide text-[#9a5b06] uppercase dark:text-[#f2c27a]">
              For consultants, clinics, salons, tutors and more
            </p>
            <h1 className="font-display text-4xl leading-[1.05] font-bold tracking-tight text-slate-900 sm:text-6xl">
              Get booked. <span className="text-brand-600 dark:text-brand-700">Get paid.</span> No more no-shows.
            </h1>
            <p className="mt-5 max-w-lg text-lg text-slate-600">
              Your own booking page. Customers pick a time, pay a deposit with Paystack and get reminders. The money goes straight to your bank.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href={start} className="btn-primary px-6 py-3 text-base">Create your free page</Link>
              <span className="rounded-xl border border-dashed border-slate-300 px-4 py-3 font-mono text-sm text-slate-500">book…/<span className="text-slate-900">your-name</span></span>
            </div>
            <p className="mt-4 text-sm text-slate-500">Free to start. Already on Workbase or Meet? <Link className="underline underline-offset-4" href={`/login?next=${encodeURIComponent(base || "/")}`}>Sign in</Link> with the same account.</p>
          </div>
          <BookingIllustration />
        </div>
      </section>

      <section className="border-y border-slate-200 bg-surface">
        <div className="mx-auto grid max-w-5xl gap-6 px-4 py-12 sm:grid-cols-3 sm:px-6">
          {[
            ["1", "Make your page", "Add your services, prices and opening hours. Takes five minutes."],
            ["2", "Share the link", "On WhatsApp, Instagram, your website or business card."],
            ["3", "Get booked and paid", "Customers book and pay. You get an email, they get reminders."],
          ].map(([n, t, d]) => (
            <div key={n}>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 font-display font-bold text-white">{n}</span>
              <h2 className="mt-3 font-semibold text-slate-900">{t}</h2>
              <p className="mt-1 text-sm text-slate-600">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([icon, title, body]) => (
            <div key={title} className="card p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:text-brand-700"><Icon name={icon} className="h-5 w-5" /></span>
              <h2 className="mt-4 font-semibold text-slate-900">{title}</h2>
              <p className="mt-1 text-sm text-slate-500">{body}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 rounded-3xl bg-[#15123a] px-6 py-10 text-center text-white sm:px-10">
          <h2 className="font-display text-2xl font-bold sm:text-3xl">Free to start. ₦2,000 a month for Pro.</h2>
          <p className="mx-auto mt-2 max-w-xl text-white/70">Free takes 3% of online payments. Pro takes nothing, removes our badge and lets you use your own colour, and covers Workbase Forms too.</p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href={start} className="rounded-xl bg-[#6a4cf5] px-6 py-3 font-semibold hover:bg-[#5b3fe0]">Create your free page</Link>
            <Link href={`${base}/pricing`} className="rounded-xl bg-white/10 px-6 py-3 font-semibold hover:bg-white/15">See pricing</Link>
          </div>
        </div>
      </section>
    </>
  );
}

function BookingIllustration() {
  const times = ["09:00", "09:30", "10:30", "11:00", "14:00", "15:30"];
  return (
    <div className="relative mx-auto w-full max-w-sm" aria-hidden>
      <div className="rounded-3xl bg-surface p-5 shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#12968a] font-display font-bold text-white">AO</span>
          <div>
            <p className="font-display font-bold text-slate-900">Dr. Amaka Obi</p>
            <p className="text-xs text-slate-500">Skin consultation · 45 min · Video call</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[11px] text-slate-400">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}
          {Array.from({ length: 14 }, (_, i) => i + 13).map((n) => (
            <span key={n} className={cn("rounded-lg py-1.5 text-xs", n === 21 ? "bg-[#12968a] font-bold text-white" : [14, 15, 16, 20, 22, 23].includes(n) ? "font-semibold text-slate-800" : "text-slate-300")}>{n}</span>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {times.map((t, i) => (
            <span key={t} className={cn("rounded-lg border py-2 text-center text-xs font-semibold", i === 2 ? "border-[#12968a] bg-[#12968a] text-white" : "border-[#12968a]/50 text-[#12968a]")}>{t}</span>
          ))}
        </div>
        <span className="mt-4 block rounded-xl bg-[#12968a] py-3 text-center text-sm font-semibold text-white">Pay ₦5,000 deposit and book</span>
      </div>
      <div className="absolute -right-3 -bottom-6 flex items-center gap-3 rounded-2xl bg-surface px-4 py-3 shadow-xl ring-1 ring-slate-200 sm:-right-8">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Icon name="check" className="h-4 w-4" /></span>
        <div className="text-xs">
          <p className="font-semibold text-slate-900">New booking · Tue 10:30</p>
          <p className="text-slate-500">Tunde paid ₦5,000</p>
        </div>
      </div>
      <span className="absolute -top-4 -left-4 rounded-2xl bg-[#f2a93b] px-3 py-1.5 text-xs font-bold text-[#15123a] shadow-lg">⏰ Reminder sent</span>
    </div>
  );
}
