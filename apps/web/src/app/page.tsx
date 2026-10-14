import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import Link from "next/link";
import { FREE_HISTORY_DAYS, FREE_SEATS, SEAT_PRICE_NAIRA } from "@/lib/billing";
import { APP_NAME, OPERATOR_NAME } from "@/lib/config";
import { getSession } from "@/lib/session";
import { HeroTimeline } from "./_landing/timeline";

const display = Bricolage_Grotesque({ subsets: ["latin"], display: "swap", variable: "--font-display" });

export const metadata: Metadata = {
  title: { absolute: `${APP_NAME}: see who's working on your remote team` },
  description:
    "Clock in and out, active and idle time, tasks and daily reports for remote teams in Nigeria and abroad. Free for up to 3 people. Priced in naira.",
  openGraph: {
    title: `${APP_NAME}: see who's working on your remote team`,
    description: "Hours, activity, tasks and chat for remote teams. Free for up to 3 people, priced in naira.",
    type: "website",
  },
};

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

const FEATURES = [
  {
    title: "Clock in, clock out",
    body: "Workers clock in from a small desktop app. You see who's working right now, when they started and their hours for the day.",
  },
  {
    title: "Active or just online",
    body: "Every 10 seconds the app checks one thing: was the keyboard or mouse used? Long breaks get a question when they come back: was that work?",
  },
  {
    title: "Tasks and end-of-day reports",
    body: "Assign tasks with due dates. Workers pick what they're on, so time is logged per task, and say what they got done at clock-out.",
  },
  {
    title: "Each person in their own time zone",
    body: "Staff in Lagos, London and Toronto each get their own working day, so timesheets make sense wherever people are.",
  },
  {
    title: "Works on Nigerian internet",
    body: "No signal? Time is kept on the computer and uploads when the connection comes back. Nothing is lost.",
  },
  {
    title: "Chat and announcements",
    body: "Team groups, direct messages and company announcements, next to the work they're about.",
  },
];

const NEVER = [
  "Anything while someone is clocked out",
  "What people type: no keystrokes, passwords or messages",
  "Screenshots or screen recordings",
  "Webcam or microphone",
  "Files, emails or location",
];

const FAQ = [
  {
    q: "Do my workers need to install anything?",
    a: "Yes, a small Windows app (Mac is coming). They download it from a link, log in once, and it starts with their computer. Managers only need the website.",
  },
  {
    q: "Can workers see their own data?",
    a: "Yes. Everyone can see everything recorded about them, and they're shown exactly what's tracked before the first clock-in.",
  },
  {
    q: "What happens after the 14-day trial?",
    a: `Nothing is locked. Your company moves to the Free plan (up to ${FREE_SEATS} people). Choose Standard whenever you're ready; you pay ahead for 1, 3 or 12 months.`,
  },
  {
    q: "How do we pay?",
    a: "Through Paystack: card, bank transfer or USSD, in naira. Companies abroad pay the same naira price by card.",
  },
  {
    q: "Can a manager read private messages?",
    a: "No. Direct messages and private groups can only be read by the people in them, not by the company owner or admins.",
  },
];

export default async function Home() {
  const { user } = await getSession();

  return (
    <div
      className={`${display.variable} min-h-screen bg-white text-[#1C1640]`}
      style={{ fontFamily: "var(--font-display), ui-sans-serif, system-ui, sans-serif" }}
    >
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#6D28D9] text-white">{APP_NAME[0]}</span>
          {APP_NAME}
        </Link>
        <nav className="flex items-center gap-1 text-sm sm:gap-2">
          <a href="#pricing" className="hidden rounded-lg px-3 py-2 text-[#5B5876] hover:text-[#1C1640] sm:inline">Pricing</a>
          <a href="#privacy" className="hidden rounded-lg px-3 py-2 text-[#5B5876] hover:text-[#1C1640] sm:inline">Privacy</a>
          {user ? (
            <Link href="/dashboard" className="rounded-lg bg-[#6D28D9] px-4 py-2 font-semibold text-white hover:bg-[#5B21B6]">Open dashboard</Link>
          ) : (
            <>
              <Link href="/login" className="rounded-lg px-3 py-2 text-[#5B5876] hover:text-[#1C1640]">Log in</Link>
              <Link href="/signup" className="rounded-lg bg-[#6D28D9] px-4 py-2 font-semibold text-white hover:bg-[#5B21B6]">Start free</Link>
            </>
          )}
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl gap-10 px-4 pt-8 pb-16 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-center lg:pt-14 lg:pb-24">
          <div>
            <h1 className="text-[2.6rem] leading-[1.02] font-extrabold tracking-[-0.035em] sm:text-6xl">
              See who&apos;s working, wherever they work.
            </h1>
            <p className="mt-5 max-w-[34rem] text-lg leading-relaxed text-[#5B5876]">
              Hours, real activity and finished tasks for your remote team, in Lagos or London. Built for Nigerian companies, priced in naira.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={user ? "/dashboard" : "/signup"} className="rounded-xl bg-[#6D28D9] px-6 py-3.5 text-base font-semibold text-white hover:bg-[#5B21B6]">
                {user ? "Open dashboard" : "Start your 14-day free trial"}
              </Link>
              <Link href="/download" className="rounded-xl border border-[#E6E3F2] px-6 py-3.5 text-base font-semibold hover:border-[#C4B5FD]">
                Get the Windows app
              </Link>
            </div>
            <p className="mt-4 text-sm text-[#5B5876]">No card needed. Free for up to {FREE_SEATS} people after the trial.</p>
          </div>
          <HeroTimeline />
        </section>

        <section className="bg-[#F6F4FC]">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
            <h2 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">Set up in an afternoon</h2>
            <ol className="mt-10 grid gap-8 md:grid-cols-3">
              {[
                ["Create your company and invite people", "Send each person their invite link by email or WhatsApp."],
                ["They install the app and clock in", "They read exactly what's tracked, then press Clock in. That's it."],
                ["You see the day as it happens", "Who's working now, hours, activity, tasks done and timesheets you can download."],
              ].map(([title, body], i) => (
                <li key={title} className="flex gap-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold text-[#6D28D9] ring-1 ring-[#E6E3F2]">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-semibold">{title}</h3>
                    <p className="mt-1 leading-relaxed text-[#5B5876]">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <h2 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">Everything a remote team needs, nothing it doesn&apos;t</h2>
          <dl className="mt-10 grid gap-x-12 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="border-t-2 border-[#1C1640] pt-4">
                <dt className="text-lg font-semibold">{f.title}</dt>
                <dd className="mt-2 leading-relaxed text-[#5B5876]">{f.body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="privacy" className="bg-[#1C1640] text-white">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-20">
            <div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Trust works both ways</h2>
              <p className="mt-4 max-w-md leading-relaxed text-[#C9C3E6]">
                Good people don&apos;t mind showing their work. They mind being spied on. So {APP_NAME} records only what&apos;s needed to see
                that work is happening, tells workers exactly what that is, and lets them see all of it.
              </p>
              <Link href="/what-we-track" className="mt-6 inline-block font-semibold text-white underline decoration-[#A78BFA] decoration-2 underline-offset-4">
                Read exactly what we track
              </Link>
            </div>
            <div>
              <p className="font-semibold">It never records:</p>
              <ul className="mt-4 space-y-3">
                {NEVER.map((n) => (
                  <li key={n} className="flex gap-3 text-[#E4E0F5]">
                    <span aria-hidden className="mt-0.5 text-[#A78BFA]">✕</span>
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Simple pricing, in naira</h2>
          <p className="mt-3 max-w-xl text-[#5B5876]">Every company starts with 14 days of Standard, free. Pay ahead for 1, 3 or 12 months; 12 months costs the same as 10.</p>
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-[#E6E3F2] p-6 sm:p-8">
              <h3 className="text-xl font-bold">Free</h3>
              <p className="mt-2"><span className="text-4xl font-extrabold tracking-tight">₦0</span></p>
              <ul className="mt-6 space-y-2.5 text-[#3F3A5E]">
                <li>Up to {FREE_SEATS} people</li>
                <li>Clock in/out, hours and idle check</li>
                <li>Activity % and the names of apps used</li>
                <li>Tasks, daily reports, chat</li>
                <li>Last {FREE_HISTORY_DAYS} days of history</li>
              </ul>
            </div>
            <div className="rounded-2xl border-2 border-[#6D28D9] p-6 sm:p-8">
              <h3 className="text-xl font-bold">Standard</h3>
              <p className="mt-2">
                <span className="text-4xl font-extrabold tracking-tight">{naira(SEAT_PRICE_NAIRA)}</span>
                <span className="text-[#5B5876]"> per person, per month</span>
              </p>
              <ul className="mt-6 space-y-2.5 text-[#3F3A5E]">
                <li>As many people as you need</li>
                <li>Everything in Free</li>
                <li>Which document or website was open</li>
                <li>Hour-by-hour timeline of each day</li>
                <li>Full history and timesheet downloads</li>
              </ul>
              <Link href={user ? "/dashboard/billing" : "/signup"} className="mt-8 inline-block rounded-xl bg-[#6D28D9] px-6 py-3 font-semibold text-white hover:bg-[#5B21B6]">
                {user ? "See your plan" : "Start free trial"}
              </Link>
            </div>
          </div>
          <p className="mt-6 text-sm text-[#5B5876]">
            For a team of 10, Standard is {naira(SEAT_PRICE_NAIRA * 10)} a month. Pro, with leave requests and payroll exports, is coming.
          </p>
        </section>

        <section className="bg-[#F6F4FC]">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:py-20">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Questions</h2>
            <div className="mt-8 divide-y divide-[#E6E3F2] border-y border-[#E6E3F2]">
              {FAQ.map((f) => (
                <details key={f.q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold">
                    {f.q}
                    <span aria-hidden className="text-2xl leading-none text-[#6D28D9] transition group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 leading-relaxed text-[#5B5876]">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <div className="flex flex-col items-start justify-between gap-6 rounded-3xl bg-[#6D28D9] px-6 py-10 text-white sm:px-10 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Know your team is working</h2>
              <p className="mt-2 text-[#E4DCFF]">14 days of everything, free. No card needed.</p>
            </div>
            <Link href={user ? "/dashboard" : "/signup"} className="rounded-xl bg-white px-6 py-3.5 font-semibold text-[#4C1D95] hover:bg-[#F5F3FF]">
              {user ? "Open dashboard" : "Create your company"}
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#E6E3F2]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-8 text-sm text-[#5B5876] sm:px-6">
          <span>© {new Date().getFullYear()} {OPERATOR_NAME}</span>
          <Link className="hover:text-[#1C1640]" href="/what-we-track">What we track</Link>
          <Link className="hover:text-[#1C1640]" href="/privacy">Privacy</Link>
          <Link className="hover:text-[#1C1640]" href="/terms">Terms</Link>
          <Link className="hover:text-[#1C1640]" href="/download">Download</Link>
        </div>
      </footer>
    </div>
  );
}
