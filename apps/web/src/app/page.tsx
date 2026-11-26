import type { Metadata } from "next";
import Link from "next/link";
import { LandingFx } from "@/components/landing/fx";
import { LandingSprite } from "@/components/landing/sprite";
import { FREE_HISTORY_DAYS, FREE_SEATS, PRO_PRICE_NAIRA, SEAT_PRICE_NAIRA } from "@/lib/billing";
import { APP_NAME, OPERATOR_NAME } from "@/lib/config";
import { homeUrl } from "@/lib/home/paths";
import { getSession } from "@/lib/session";

/**
 * Workbase's own landing page (app.workbasecore.com "/"), in the design Femi approved on
 * 26 Nov 2026 (same system as the parent site and Meet: "lp-" classes in globals.css, the shared
 * icon sprite, behaviour in components/landing/fx.tsx; everything reads fine without the script).
 *
 *   Header     logo, Features / How it works / Pricing / Privacy, All products, log in / start
 *   Hero       copy and buttons on the left; a live "Team today" window on the right with alerts
 *   Strip      slow strip of promises
 *   Features   bento cards with small live pictures
 *   How        three steps beside a photo
 *   Privacy    dark band: what Workbase never records
 *   Pricing    Free / Standard / Pro from lib/billing.ts
 *   Questions  FAQ accordion
 *   Call       violet band with the main call to action
 *
 * Signed-in visitors get "Open dashboard" instead of the sign-up buttons.
 */

export const metadata: Metadata = {
  title: { absolute: `${APP_NAME}: see who's working on your remote team` },
  description:
    "Clock in and out, active and idle time, tasks, chat, leave and payroll for remote teams in Nigeria and abroad. Free for up to 3 people. Priced in naira.",
  openGraph: {
    title: `${APP_NAME}: see who's working on your remote team`,
    description: "Hours, activity, tasks, chat, leave and payroll for remote teams. Free for up to 3 people, priced in naira.",
    type: "website",
  },
};

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;
const U = "https://images.unsplash.com/";
const img = (id: string, w: number, h: number) => `${U}${id}?w=${w}&h=${h}&fit=crop&auto=format`;

/* Example team for the hero window (made-up people; photos from Unsplash). */
const TEAM = [
  { n: "Adaeze Okafor", c: "Lagos", p: "photo-1604933762021-54a5858c9832", s: "Working", bars: [72, 81, 64, 90, 77, 58, 0, 66, 85, 92, 74, 69, 88, 79] },
  { n: "Tunde Bakare", c: "Accra", p: "photo-1594077810908-9ffd89d704ac", s: "Idle", bars: [0, 55, 61, 48, 70, 66, 52, 44, 63, 38, 22, 47, 30, 18] },
  { n: "Chiamaka Eze", c: "Nairobi", p: "photo-1573878414075-be35f08479e5", s: "Working", bars: [84, 79, 91, 88, 0, 0, 73, 80, 86, 77, 90, 82, 75, 87] },
  { n: "Ifeanyi Nwosu", c: "London", p: "photo-1612299273045-362a39972259", s: "On phone", bars: [60, 66, 70, 58, 75, 80, 0, 0, 0, 62, 71, 69, 74, 81] },
];
const STATUS: Record<string, string> = { Working: "bg-emerald-400", Idle: "bg-marigold-400", "On phone": "bg-sky-400" };

const NEVER: Array<[string, string]> = [
  ["i-keyboard", "What anyone types"],
  ["i-camoff", "Webcam or microphone"],
  ["i-eye", "Anything while clocked out"],
  ["i-chat", "Private messages, even for admins"],
];

const FAQ = [
  { q: "Do my workers need to install anything?", a: "A small Windows app (Mac is coming). They log in once and it starts with their computer. Managers only need the website." },
  { q: "Can workers see their own data?", a: "Yes. Everyone sees everything recorded about them, and the app shows exactly what's tracked before the first clock-in." },
  { q: "Do you take screenshots?", a: "Only on Pro, only if you switch them on, and only after each worker agrees. They can be blurred, workers can delete their own, and they're kept for 90 days." },
  { q: "What happens after the 14-day trial?", a: `Nothing is locked. Your company moves to the Free plan (up to ${FREE_SEATS} people) until you choose a plan.` },
  { q: "How do we pay?", a: "Through Paystack: card, bank transfer or USSD, in naira. Companies abroad pay the same price by card." },
  { q: "Can a manager read private messages?", a: "No. Direct messages and private groups are only readable by the people in them." },
];

export default async function Home() {
  const { user } = await getSession();
  const primary = user ? { href: "/dashboard", label: "Open dashboard" } : { href: "/signup", label: "Start free trial" };
  const family = homeUrl();

  return (
    <div className="lp min-h-screen overflow-x-clip">
      <LandingSprite />

      {/* Header ================================================================================ */}
      <header className="sticky top-0 z-50 border-b border-[#ecebf3] bg-white/80 backdrop-blur-md">
        <div className="lp-wrap flex h-16 items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-2" aria-label="Workbase home">
            <svg className="h-8 w-8" viewBox="0 0 48 48" aria-hidden="true">
              <path d="M9 29V15.5C9 10.8 12.2 8 16.5 8C27 8 36.5 17 41 29Z" fill="#6A4CF5" />
              <rect x="4" y="32" width="40" height="8" rx="4" fill="#F2A93B" />
            </svg>
            <span className="text-[1.2rem] font-bold tracking-tight">Workbase</span>
          </Link>
          <nav className="hidden items-center gap-1 text-[0.9rem] font-medium text-[#4a4766] md:flex" aria-label="Main">
            <a href="#features" className="rounded-lg px-3 py-2 hover:bg-[#f7f6fb] hover:text-[#15123a]">Features</a>
            <a href="#how" className="rounded-lg px-3 py-2 hover:bg-[#f7f6fb] hover:text-[#15123a]">How it works</a>
            <a href="#pricing" className="rounded-lg px-3 py-2 hover:bg-[#f7f6fb] hover:text-[#15123a]">Pricing</a>
            <a href="#privacy" className="rounded-lg px-3 py-2 hover:bg-[#f7f6fb] hover:text-[#15123a]">Privacy</a>
            {family && <a href={family} className="rounded-lg px-3 py-2 hover:bg-[#f7f6fb] hover:text-[#15123a]">All products</a>}
          </nav>
          <div className="flex items-center gap-2">
            {!user && <Link href="/login" className="hidden rounded-lg px-3 py-2 text-[0.9rem] font-medium text-[#4a4766] hover:text-[#15123a] sm:block">Log in</Link>}
            <Link href={primary.href} className="lp-btn lp-btn-main !py-2 !text-[0.875rem]">{user ? "Dashboard" : "Start free"}</Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero ================================================================================ */}
        <section id="lp-hero" className="relative overflow-hidden">
          <div className="lp-grid-bg pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className="lp-spot pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className="lp-wrap relative grid items-center gap-14 py-16 lg:grid-cols-[1fr_1.15fr] lg:py-20">
            <div>
              <h1 className="text-[2.35rem] leading-[1.1] font-semibold sm:text-5xl lg:text-[3.25rem]">
                Know your team is working, <span className="text-[#6a4cf5]">wherever they are</span>
              </h1>
              <p className="mt-5 max-w-md text-[1.05rem] leading-relaxed text-[#5d5a78]">
                Hours, real activity and finished tasks for remote teams, with chat, leave and payroll in the same place. Priced in naira.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href={primary.href} className="lp-btn lp-btn-main">
                  {primary.label}
                  <svg className="lp-i h-4 w-4"><use href="#i-arrow" /></svg>
                </Link>
                <Link href="/download" className="lp-btn lp-btn-ghost">
                  <svg className="lp-i h-4 w-4"><use href="#i-windows" /></svg>
                  Windows app
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[0.88rem] text-[#5d5a78]">
                <span className="flex items-center gap-2"><svg className="lp-i h-4 w-4 text-[#6a4cf5]"><use href="#i-check" /></svg>14 days free, no card</span>
                <span className="flex items-center gap-2"><svg className="lp-i h-4 w-4 text-[#6a4cf5]"><use href="#i-check" /></svg>Free for {FREE_SEATS} people after</span>
                <span className="flex items-center gap-2"><svg className="lp-i h-4 w-4 text-[#6a4cf5]"><use href="#i-check" /></svg>Works offline</span>
              </div>
            </div>

            {/* Live "Team today" window */}
            <div className="relative">
              <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-[radial-gradient(60%_60%_at_50%_45%,rgba(106,76,245,0.28),transparent_70%)] blur-2xl" aria-hidden="true" />
              <div className="overflow-hidden rounded-2xl bg-[#100d2b] p-5 text-white shadow-[0_40px_100px_-40px_rgba(21,18,58,0.8)]">
                <div className="flex items-center justify-between">
                  <b className="text-[0.95rem]">Team today</b>
                  <span className="flex items-center gap-1.5 text-[0.75rem] text-white/60"><i className="lp-blink h-1.5 w-1.5 rounded-full bg-emerald-400" />3 working now</span>
                </div>
                <ul className="mt-4 space-y-3.5">
                  {TEAM.map((t, r) => (
                    <li key={t.n} className="grid grid-cols-[2.25rem_1fr] items-center gap-x-3 sm:grid-cols-[2.25rem_8rem_1fr]">
                      <span className="relative">
                        <img className="h-9 w-9 rounded-full object-cover" src={img(t.p, 72, 72)} alt="" />
                        <i className={`absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#100d2b] ${STATUS[t.s]}`} />
                      </span>
                      <span className="min-w-0">
                        <b className="block truncate text-[0.84rem]">{t.n}</b>
                        <span className="text-[0.72rem] text-white/50">{t.c} · {t.s}</span>
                      </span>
                      <span className="col-span-2 mt-2 flex h-7 items-end gap-[3px] sm:col-span-1 sm:mt-0">
                        {t.bars.map((v, i) => (
                          <span key={i} className="flex h-full flex-1 items-end rounded-[2px] bg-white/5">
                            {v > 0 && (
                              <span
                                className={`lp-grow block w-full rounded-[2px] ${v >= 40 ? "bg-[#7c5cff]" : "bg-marigold-500"}`}
                                style={{ height: `${Math.max(18, v)}%`, animationDelay: `${r * 90 + i * 25}ms` }}
                              />
                            )}
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-5 grid grid-cols-3 gap-2 text-[0.78rem]">
                  <span className="rounded-xl bg-white/5 p-3"><span className="block text-white/50">Hours today</span><b className="text-base">27h 40m</b></span>
                  <span className="rounded-xl bg-white/5 p-3"><span className="block text-white/50">Activity</span><b className="text-base">82%</b></span>
                  <span className="rounded-xl bg-white/5 p-3"><span className="block text-white/50">Tasks done</span><b className="text-base">14</b></span>
                </div>
              </div>

              <div className="lp-float absolute -left-10 -bottom-16 hidden w-60 rounded-2xl bg-white p-4 shadow-[0_20px_50px_-20px_rgba(21,18,58,0.4)] ring-1 ring-[#ecebf3] sm:block">
                <span className="flex items-center gap-1.5 text-[0.75rem] font-semibold text-emerald-700"><i className="lp-blink h-1.5 w-1.5 rounded-full bg-emerald-500" />Clocked in</span>
                <b className="mt-0.5 block text-2xl font-semibold tabular-nums" data-lp-timer="11564">03:12:44</b>
                <span className="text-[0.75rem] text-[#6f6b8a]">Working on: Invoice page redesign</span>
              </div>
              <div className="lp-float absolute -top-5 -right-4 hidden items-center gap-3 rounded-2xl bg-white p-3 text-[0.82rem] shadow-[0_20px_50px_-20px_rgba(21,18,58,0.4)] ring-1 ring-[#ecebf3] sm:flex" style={{ animationDelay: "-3s" }}>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-marigold-400/20 text-marigold-500"><svg className="lp-i"><use href="#i-clock" /></svg></span>
                <span><b className="block">Still working, Tunde?</b><span className="text-[#6f6b8a]">No activity for 10 minutes</span></span>
              </div>
            </div>
          </div>
        </section>

        {/* Strip of promises ===================================================================== */}
        <section className="border-y border-[#ecebf3] bg-[#f7f6fb] py-5">
          <div className="lp-marquee overflow-hidden">
            <div className="lp-track gap-12 text-[1.02rem] font-semibold text-[#8f8ba9]">
              {[0, 1].flatMap((k) =>
                ["Activity checked every 10 seconds", "Not a single keystroke recorded", "Time kept when the internet drops", `Free for up to ${FREE_SEATS} people`, "Payslips with PAYE and pension", "Nigerian holidays built in", "Clock in from a phone"].map((t) => (
                  <span key={`${k}${t}`} className="flex items-center gap-12 whitespace-nowrap">
                    {t}
                    <i className="h-1.5 w-1.5 rotate-45 bg-marigold-400" aria-hidden="true" />
                  </span>
                )),
              )}
            </div>
          </div>
        </section>

        {/* Features: live bento ================================================================== */}
        <section id="features" className="scroll-mt-16 py-20 sm:py-24">
          <div className="lp-wrap">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold sm:text-[2.5rem] sm:leading-[1.15]">One place for the whole working day</h2>
              <p className="mt-4 text-[1.05rem] text-[#5d5a78]">From the first clock-in to the last payslip, without five different apps.</p>
            </div>

            <div className="mt-12 grid gap-4 lg:grid-cols-3">
              {/* Activity */}
              <article className="lp-fcard flex flex-col rounded-3xl border border-[#ecebf3] bg-white lg:col-span-2">
                <div className="relative h-44 overflow-hidden rounded-t-3xl bg-gradient-to-br from-[#f3f0ff] to-[#fdf6ea] p-6">
                  <div className="flex h-full items-end gap-1.5">
                    {[40, 62, 80, 74, 90, 30, 85, 92, 70, 88, 64, 95, 78, 84, 58, 91, 76, 69].map((v, i) => (
                      <span key={i} className={`lp-grow flex-1 rounded-t ${v < 40 ? "bg-marigold-400" : "bg-[#7c5cff]"}`} style={{ height: `${v}%`, animationDelay: `${i * 40}ms` }} />
                    ))}
                  </div>
                  <span className="absolute top-5 left-6 rounded-xl bg-white px-3 py-2 text-[0.8rem] shadow-sm ring-1 ring-[#ecebf3]"><b>Active 6h 12m</b> <span className="text-[#6f6b8a]">· idle 48m</span></span>
                </div>
                <div className="flex items-start gap-4 p-6">
                  <span className="lp-ico flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f3f0ff] text-[#6a4cf5]"><svg className="lp-i"><use href="#i-activity" /></svg></span>
                  <div><h3 className="text-[1.05rem] font-semibold">Active or just online</h3><p className="mt-1 text-[0.92rem] leading-relaxed text-[#5d5a78]">Keyboard and mouse use, checked every 10 seconds. Long breaks get a friendly question, not a penalty.</p></div>
                </div>
              </article>

              {/* Phone clock-in */}
              <article className="lp-fcard flex flex-col rounded-3xl border border-[#ecebf3] bg-white">
                <div className="grid h-44 place-items-center overflow-hidden rounded-t-3xl bg-[#f7f6fb]">
                  <div className="lp-float w-40 rounded-[1.6rem] border-[5px] border-[#15123a] bg-white p-3 shadow-xl">
                    <span className="flex items-center gap-1 text-[0.68rem] text-[#6f6b8a]"><svg className="lp-i h-3 w-3"><use href="#i-pin" /></svg>Ikeja, Lagos</span>
                    <b className="mt-1 block text-lg tabular-nums" data-lp-timer="5420">01:30:20</b>
                    <span className="mt-2 block rounded-lg bg-[#6a4cf5] py-1.5 text-center text-[0.72rem] font-semibold text-white">Clock out</span>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-6">
                  <span className="lp-ico flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f3f0ff] text-[#6a4cf5]"><svg className="lp-i"><use href="#i-phone" /></svg></span>
                  <div><h3 className="text-[1.05rem] font-semibold">Clock in from a phone</h3><p className="mt-1 text-[0.92rem] leading-relaxed text-[#5d5a78]">For people on the road, with location at clock-in if you want it.</p></div>
                </div>
              </article>

              {/* Tasks */}
              <article className="lp-fcard flex flex-col rounded-3xl border border-[#ecebf3] bg-white">
                <div className="h-44 overflow-hidden rounded-t-3xl bg-[#f7f6fb] p-5">
                  <ul className="space-y-2 text-[0.82rem]" id="lp-todo">
                    {["Send November invoices", "Fix checkout bug", "Call with Zenith team"].map((t) => (
                      <li key={t} className="flex items-center gap-2.5 rounded-xl bg-white px-3 py-2 ring-1 ring-[#ecebf3]"><span className="lp-chk flex h-4 w-4 items-center justify-center rounded-[5px] border-2 border-[#cfc9ea]" />{t}</li>
                    ))}
                  </ul>
                </div>
                <div className="flex items-start gap-4 p-6">
                  <span className="lp-ico flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f3f0ff] text-[#6a4cf5]"><svg className="lp-i"><use href="#i-tasks" /></svg></span>
                  <div><h3 className="text-[1.05rem] font-semibold">Tasks and daily reports</h3><p className="mt-1 text-[0.92rem] leading-relaxed text-[#5d5a78]">Time logs to each task. People say what got done at clock-out.</p></div>
                </div>
              </article>

              {/* Payroll */}
              <article className="lp-fcard flex flex-col rounded-3xl border border-[#ecebf3] bg-white lg:col-span-2">
                <div className="relative h-44 overflow-hidden rounded-t-3xl bg-gradient-to-br from-[#fdf6ea] to-[#f3f0ff]">
                  <div className="absolute top-5 left-6 w-72 rounded-2xl bg-white p-4 text-[0.8rem] shadow-[0_14px_34px_-18px_rgba(21,18,58,0.4)] ring-1 ring-[#ecebf3]">
                    <div className="flex items-center justify-between"><b>Payslip · November</b><span className="text-[#6f6b8a]">Chiamaka Eze</span></div>
                    <div className="mt-3 space-y-1.5 tabular-nums">
                      <div className="flex justify-between"><span className="text-[#6f6b8a]">Gross pay</span><span>₦<span data-count="450000">450,000</span></span></div>
                      <div className="flex justify-between"><span className="text-[#6f6b8a]">PAYE</span><span className="text-red-600">−₦<span data-count="51200">51,200</span></span></div>
                      <div className="flex justify-between"><span className="text-[#6f6b8a]">Pension 8%</span><span className="text-red-600">−₦<span data-count="27000">27,000</span></span></div>
                      <div className="flex justify-between border-t border-[#ecebf3] pt-1.5 font-semibold"><span>Net pay</span><span className="text-emerald-700">₦<span data-count="371800">371,800</span></span></div>
                    </div>
                  </div>
                  <div className="lp-float absolute top-10 right-8 hidden w-48 rounded-2xl bg-[#15123a] p-4 text-white shadow-xl sm:block">
                    <span className="text-[0.72rem] text-white/60">Emailed to 12 people</span>
                    <b className="mt-1 block">Payslips sent</b>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-6">
                  <span className="lp-ico flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f3f0ff] text-[#6a4cf5]"><svg className="lp-i"><use href="#i-wallet" /></svg></span>
                  <div><h3 className="text-[1.05rem] font-semibold">Nigerian payroll and payslips</h3><p className="mt-1 text-[0.92rem] leading-relaxed text-[#5d5a78]">PAYE, pension and NHF worked out from hours and leave. A PDF payslip lands in each inbox.</p></div>
                </div>
              </article>

              {/* Leave */}
              <article className="lp-fcard flex flex-col rounded-3xl border border-[#ecebf3] bg-white">
                <div className="h-44 overflow-hidden rounded-t-3xl bg-[#f7f6fb] p-5 text-[0.8rem]">
                  <div className="flex items-center justify-between"><b>Annual leave</b><span className="text-[#6f6b8a]">14 of 20 left</span></div>
                  <div className="mt-3 grid grid-cols-7 gap-1.5 text-center text-[0.72rem]">
                    {[22, 23, 24, 25, 26, 27, 28].map((d) => (
                      <span key={d} className={`rounded-md py-1.5 ${d === 25 || d === 26 ? "bg-marigold-400 font-semibold" : d === 24 || d === 27 ? "bg-[#6a4cf5] font-semibold text-white" : "bg-white ring-1 ring-[#ecebf3]"}`}>{d}</span>
                    ))}
                  </div>
                  <span className="mt-3 flex items-center gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-[#ecebf3]"><svg className="lp-i h-4 w-4 text-emerald-600"><use href="#i-check" /></svg>Approved by Tunde</span>
                </div>
                <div className="flex items-start gap-4 p-6">
                  <span className="lp-ico flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f3f0ff] text-[#6a4cf5]"><svg className="lp-i"><use href="#i-calendar" /></svg></span>
                  <div><h3 className="text-[1.05rem] font-semibold">Leave and holidays</h3><p className="mt-1 text-[0.92rem] leading-relaxed text-[#5d5a78]">Requests, approvals and balances, with Nigerian holidays built in.</p></div>
                </div>
              </article>

              {/* Chat */}
              <article className="lp-fcard flex flex-col rounded-3xl border border-[#ecebf3] bg-white">
                <div className="h-44 space-y-2 overflow-hidden rounded-t-3xl bg-[#f7f6fb] p-5 text-[0.8rem]">
                  <p className="w-fit max-w-[80%] rounded-2xl rounded-bl-md bg-white px-3 py-2 ring-1 ring-[#ecebf3]">Client approved the designs</p>
                  <p className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md bg-[#6a4cf5] px-3 py-2 text-white">Great, shipping today</p>
                  <p className="flex w-fit items-center gap-2 rounded-2xl rounded-bl-md bg-white px-3 py-2 ring-1 ring-[#ecebf3]"><svg className="lp-i h-4 w-4 text-[#6a4cf5]"><use href="#i-file" /></svg>invoice-nov.pdf</p>
                </div>
                <div className="flex items-start gap-4 p-6">
                  <span className="lp-ico flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f3f0ff] text-[#6a4cf5]"><svg className="lp-i"><use href="#i-chat" /></svg></span>
                  <div><h3 className="text-[1.05rem] font-semibold">Chat and announcements</h3><p className="mt-1 text-[0.92rem] leading-relaxed text-[#5d5a78]">Groups, direct messages and files next to the work.</p></div>
                </div>
              </article>

              {/* Expenses */}
              <article className="lp-fcard flex flex-col rounded-3xl border border-[#ecebf3] bg-white">
                <div className="grid h-44 place-items-center overflow-hidden rounded-t-3xl bg-[#f7f6fb] p-5">
                  <div className="w-full max-w-[15rem] rounded-2xl bg-white p-4 text-[0.8rem] ring-1 ring-[#ecebf3]">
                    <div className="flex items-center justify-between"><b>Fuel, client visit</b><span>₦18,500</span></div>
                    <div className="mt-3 flex gap-2">
                      <span className="flex-1 rounded-lg bg-emerald-50 py-1.5 text-center font-semibold text-emerald-700">Approve</span>
                      <span className="flex-1 rounded-lg bg-[#f7f6fb] py-1.5 text-center text-[#6f6b8a]">Decline</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-6">
                  <span className="lp-ico flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f3f0ff] text-[#6a4cf5]"><svg className="lp-i"><use href="#i-receipt" /></svg></span>
                  <div><h3 className="text-[1.05rem] font-semibold">Expense claims</h3><p className="mt-1 text-[0.92rem] leading-relaxed text-[#5d5a78]">Snap the receipt; it&apos;s repaid with the next payslip.</p></div>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* How it works ========================================================================== */}
        <section id="how" className="scroll-mt-16 bg-[#f7f6fb] py-20 sm:py-24">
          <div className="lp-wrap grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div className="relative mx-auto w-full max-w-md lg:max-w-none">
              <div className="overflow-hidden rounded-3xl">
                <img className="aspect-[5/4] w-full object-cover" src={img("photo-1573496800440-5c9c48a8d0f0", 900, 720)} alt="A woman working on a laptop from her sofa" loading="lazy" />
              </div>
              <div className="lp-float absolute -right-3 -bottom-6 w-60 rounded-2xl bg-white p-4 shadow-[0_20px_50px_-20px_rgba(21,18,58,0.4)] ring-1 ring-[#ecebf3] sm:-right-6">
                <p className="flex items-center gap-2 font-semibold"><svg className="lp-i h-5 w-5 text-emerald-600"><use href="#i-whatsapp" /></svg>You&apos;re invited</p>
                <p className="mt-1 text-[0.85rem] text-[#5d5a78]">Join Adeyemi &amp; Co on Workbase</p>
                <span className="mt-3 block rounded-lg bg-[#6a4cf5] py-2 text-center text-[0.85rem] font-semibold text-white">Accept invite</span>
              </div>
            </div>
            <div>
              <h2 className="text-3xl font-semibold sm:text-[2.5rem] sm:leading-[1.15]">Set up in an afternoon</h2>
              <p className="mt-4 max-w-md text-[1.05rem] text-[#5d5a78]">No sales calls and no training days. Create a company, send links, and the day starts showing up.</p>
              <ol className="mt-8 space-y-2">
                {[
                  ["Create your company", "Name, logo and working hours. Two minutes."],
                  ["Invite your people", "Share links by email or WhatsApp. They join in one tap."],
                  ["Watch the day come in", "Who's working, hours, tasks and timesheets, live."],
                ].map(([t, d], i) => (
                  <li key={t} className="lp-step flex gap-4 rounded-2xl p-4">
                    <span className="lp-num flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[0.9rem] font-semibold text-[#5638d9] ring-1 ring-[#ecebf3]">{i + 1}</span>
                    <span><b className="block">{t}</b><span className="text-[0.92rem] text-[#5d5a78]">{d}</span></span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* Privacy ============================================================================== */}
        <section id="privacy" className="scroll-mt-16 bg-[#15123a] py-20 text-white sm:py-24">
          <div className="lp-wrap grid items-center gap-12 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-semibold sm:text-[2.5rem] sm:leading-[1.15]">Trust works both ways</h2>
              <p className="mt-4 max-w-md text-[1.05rem] text-white/70">Good people don&apos;t mind showing their work. They mind being spied on. Workbase records only what shows work is happening, and people see all of it.</p>
              <Link href="/what-we-track" className="lp-btn mt-8 bg-white text-[#15123a] hover:-translate-y-px">
                See exactly what we track
                <svg className="lp-i h-4 w-4"><use href="#i-arrow" /></svg>
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {NEVER.map(([icon, text]) => (
                <div key={text} className="group rounded-2xl bg-white/5 p-5 ring-1 ring-white/10 transition duration-300 hover:-translate-y-1 hover:bg-white/10">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-marigold-400 transition duration-500 group-hover:rotate-[-8deg] group-hover:bg-marigold-400 group-hover:text-[#15123a]">
                    <svg className="lp-i"><use href={`#${icon}`} /></svg>
                  </span>
                  <p className="mt-4 text-[0.82rem] text-white/50">Never recorded</p>
                  <b className="mt-0.5 block">{text}</b>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing ============================================================================== */}
        <section id="pricing" className="scroll-mt-16 py-20 sm:py-24">
          <div className="lp-wrap">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold sm:text-[2.5rem] sm:leading-[1.15]">Simple pricing in naira</h2>
              <p className="mt-4 text-[1.05rem] text-[#5d5a78]">Per person, per month. Pay ahead for 1, 3 or 12 months; a year costs the same as ten months.</p>
            </div>
            <div className="mx-auto mt-12 grid max-w-5xl gap-4 md:grid-cols-3">
              {[
                { name: "Free", price: "₦0", note: `Up to ${FREE_SEATS} people`, items: ["Clock in/out and idle check", "Activity and app names", "Tasks, chat and leave", `Last ${FREE_HISTORY_DAYS} days of history`], cta: user ? "Open dashboard" : "Start free", href: primary.href, dark: false },
                { name: "Standard", price: naira(SEAT_PRICE_NAIRA), note: "per person a month", items: ["Everything in Free", "Which document or website was open", "Hour-by-hour day timeline", "Full history and downloads", "Monthly payroll"], cta: user ? "See your plan" : "Start 14-day trial", href: user ? "/dashboard/billing" : "/signup", dark: true },
                { name: "Pro", price: naira(PRO_PRICE_NAIRA), note: "per person a month", items: ["Everything in Standard", "Optional screenshots, off until you switch them on", "Blur and how often", "Workers agree first and see their own"], cta: user ? "See your plan" : "Start free", href: user ? "/dashboard/billing" : "/signup", dark: false },
              ].map((p) => (
                <div key={p.name} className={`lp-fcard flex flex-col rounded-3xl p-7 ${p.dark ? "bg-[#15123a] text-white shadow-[0_30px_70px_-30px_rgba(21,18,58,0.8)]" : "border border-[#ecebf3] bg-white"}`}>
                  <b>{p.name}</b>
                  <b className="mt-3 text-4xl font-semibold">{p.price}</b>
                  <span className={`text-[0.85rem] ${p.dark ? "text-white/60" : "text-[#6f6b8a]"}`}>{p.note}</span>
                  <ul className={`mt-6 mb-8 space-y-2.5 text-[0.9rem] ${p.dark ? "text-white/85" : "text-[#4a4766]"}`}>
                    {p.items.map((it) => (
                      <li key={it} className="flex gap-2"><svg className={`lp-i h-4 w-4 shrink-0 ${p.dark ? "text-marigold-400" : "text-[#6a4cf5]"}`}><use href="#i-check" /></svg>{it}</li>
                    ))}
                  </ul>
                  <Link href={p.href} className={`lp-btn mt-auto justify-center ${p.dark ? "bg-marigold-400 text-[#15123a] hover:bg-marigold-300" : "lp-btn-ghost"}`}>{p.cta}</Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Questions ============================================================================ */}
        <section className="bg-[#f7f6fb] py-20 sm:py-24">
          <div className="lp-wrap grid gap-10 lg:grid-cols-[1fr_2fr]">
            <h2 className="text-3xl font-semibold sm:text-[2.5rem] sm:leading-[1.15]">Questions, answered</h2>
            <div className="space-y-3">
              {FAQ.map((f) => (
                <details key={f.q} className="group rounded-2xl bg-white p-5 ring-1 ring-[#ecebf3] transition open:shadow-[0_18px_40px_-24px_rgba(21,18,58,0.35)]">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f3f0ff] text-[#6a4cf5] transition duration-300 group-open:rotate-45 group-open:bg-[#6a4cf5] group-open:text-white">
                      <svg className="lp-i h-4 w-4"><use href="#i-plus" /></svg>
                    </span>
                  </summary>
                  <p className="mt-3 text-[0.95rem] leading-relaxed text-[#5d5a78]">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Call to action ======================================================================= */}
        <section className="py-20">
          <div className="lp-wrap">
            <div className="relative grid items-center gap-8 overflow-hidden rounded-3xl bg-[#6a4cf5] p-8 text-white sm:p-12 lg:grid-cols-[1fr_auto]">
              <div className="lp-grid-bg pointer-events-none absolute inset-0 opacity-40 [filter:invert(1)]" aria-hidden="true" />
              <div className="relative">
                <h2 className="text-3xl font-semibold sm:text-[2.25rem]">Start with your team today</h2>
                <p className="mt-3 text-[1.05rem] text-white/80">14 days of Standard, free. No card needed.</p>
              </div>
              <div className="relative flex flex-wrap gap-3">
                <Link href={primary.href} className="lp-btn bg-white text-[#15123a] hover:-translate-y-px">{primary.label}<svg className="lp-i h-4 w-4"><use href="#i-arrow" /></svg></Link>
                <Link href="/download" className="lp-btn text-white ring-1 ring-white/40 hover:bg-white/10">Download the app</Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#ecebf3] py-10 text-[0.9rem] text-[#6f6b8a]">
        <div className="lp-wrap flex flex-wrap items-center justify-between gap-4">
          <span>© {new Date().getFullYear()} {OPERATOR_NAME} · Photos from Unsplash</span>
          <nav className="flex flex-wrap gap-5" aria-label="Footer">
            {family && <a href={family} className="hover:text-[#15123a]">All products</a>}
            <Link href="/download" className="hover:text-[#15123a]">Download</Link>
            <Link href="/what-we-track" className="hover:text-[#15123a]">What we track</Link>
            <Link href="/privacy" className="hover:text-[#15123a]">Privacy</Link>
            <Link href="/terms" className="hover:text-[#15123a]">Terms</Link>
          </nav>
        </div>
      </footer>

      <LandingFx kind="workbase" />
    </div>
  );
}
