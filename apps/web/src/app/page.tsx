import type { Metadata } from "next";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { Logo } from "@/components/logo";
import { Reveal, Tilt } from "@/components/motion";
import { Photo } from "@/components/photo";
import type { CSSProperties } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { FREE_HISTORY_DAYS, FREE_SEATS, PRO_PRICE_NAIRA, SEAT_PRICE_NAIRA } from "@/lib/billing";
import { APP_NAME, OPERATOR_NAME } from "@/lib/config";
import { homeUrl } from "@/lib/home/paths";
import { PHOTOS } from "@/lib/photos";
import { getSession } from "@/lib/session";
import { HeroProduct } from "./_landing/timeline";

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

/**
 * Everything Workbase does, in three groups. Shown as plain lists (no icon grid) so the
 * section reads like a product sheet rather than a template.
 */
const FEATURE_GROUPS: Array<{ title: string; items: Array<[string, string]> }> = [
  {
    title: "The working day",
    items: [
      ["Clock in, clock out", "A small desktop app shows who started, when, and their hours so far."],
      ["Active or just online", "Keyboard and mouse use, checked every 10 seconds. Long breaks get a question."],
      ["Everyone in their own time zone", "Lagos, London and Toronto each get their own day and timesheet."],
      ["Made for patchy internet", "Time is saved on the computer and uploads when the connection returns."],
      ["Clock in from a phone", "For people on the road: one tap, with location at clock-in if you want it."],
    ],
  },
  {
    title: "The work itself",
    items: [
      ["Tasks and daily reports", "Assign work with due dates; time is logged to the task."],
      ["Chat and announcements", "Groups, direct messages, files and company news next to the work."],
      ["Goals and reviews", "Reviews that start from the hours, tasks and leave already recorded."],
    ],
  },
  {
    title: "People and pay",
    items: [
      ["Leave and holidays", "Requests, approvals and balances, with Nigerian public holidays built in."],
      ["Nigerian payroll", "PAYE, pension and NHF worked out, and a PDF payslip emailed to each person."],
      ["Expense claims", "Snap the receipt, a manager approves, it's repaid with the next payslip."],
      ["Staff records", "Contracts, IDs, bank and pension details, and a checklist for new hires."],
    ],
  },
];

const NEVER: Array<{ icon: IconName; text: string }> = [
  { icon: "clock", text: "Anything while someone is clocked out" },
  { icon: "lock", text: "Keystrokes, passwords or messages" },
  { icon: "eyeOff", text: "Webcam, microphone or location" },
  { icon: "camera", text: "Screenshots, unless you're on Pro, switch them on and each worker agrees" },
];

const FAQ = [
  {
    q: "Do my workers need to install anything?",
    a: "A small Windows app (Mac is coming). They log in once and it starts with their computer. Managers only need the website.",
  },
  {
    q: "Can workers see their own data?",
    a: "Yes. Everyone sees everything recorded about them, and the app shows exactly what's tracked before the first clock-in.",
  },
  {
    q: "Do you take screenshots?",
    a: "Only on Pro, only if you switch them on, and only after each worker agrees. They can be blurred, workers can delete their own, and they're kept for 90 days.",
  },
  {
    q: "What happens after the 14-day trial?",
    a: `Nothing is locked. Your company moves to the Free plan (up to ${FREE_SEATS} people) until you choose a plan.`,
  },
  {
    q: "How do we pay?",
    a: "Through Paystack: card, bank transfer or USSD, in naira. Companies abroad pay the same price by card.",
  },
  {
    q: "Can a manager read private messages?",
    a: "No. Direct messages and private groups are only readable by the people in them.",
  },
];

export default async function Home() {
  const { user } = await getSession();
  const primary = user ? { href: "/dashboard", label: "Open dashboard" } : { href: "/signup", label: "Start free trial" };
  // The parent site with every product (workbasecore.com), when it's set up.
  const family = homeUrl();

  return (
    <div className="min-h-screen overflow-x-clip bg-canvas text-slate-900">
      {/* Hero (dark, with the header on it) ------------------------------------------------------ */}
      <section className="grain relative overflow-hidden bg-[#110e2e] text-white">
        <span className="orb -top-40 -left-40 h-[34rem] w-[34rem] bg-[#6a4cf5]/45" aria-hidden />
        <span className="orb -right-32 bottom-0 h-[26rem] w-[26rem] bg-[#f2a93b]/20" style={{ animationDelay: "-7s" }} aria-hidden />

        <header className="relative z-20">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
            <Link href="/" aria-label={`${APP_NAME} home`} className="transition-opacity hover:opacity-80 [&_span]:text-white"><Logo /></Link>
            <nav className="flex items-center gap-1 text-sm" aria-label="Site">
              <a href="#features" className="draw-underline hidden px-3 py-2 text-white/70 hover:text-white md:inline">Features</a>
              <a href="#pricing" className="draw-underline hidden px-3 py-2 text-white/70 hover:text-white md:inline">Pricing</a>
              <a href="#privacy" className="draw-underline hidden px-3 py-2 text-white/70 hover:text-white md:inline">Privacy</a>
              {family && <a href={family} className="draw-underline hidden px-3 py-2 text-white/70 hover:text-white lg:inline">All products</a>}
              {!user && <Link href="/login" className="px-3 py-2 font-medium text-white/80 transition hover:text-white">Log in</Link>}
              <Link href={primary.href} className="ml-1 inline-flex items-center rounded-full bg-white px-4 py-2 font-semibold whitespace-nowrap text-[#15123a] transition hover:bg-marigold-300">
                {user ? "Dashboard" : "Start free"}
              </Link>
            </nav>
          </div>
        </header>

        <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-16 px-4 pt-10 pb-24 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:pt-16 lg:pb-32">
          <div>
            <h1 className="text-[2.8rem] leading-[0.98] font-extrabold tracking-[-0.045em] sm:text-7xl xl:text-[5.2rem]">
              <span className="rise-in block">Know your team</span>
              <span className="rise-in block" style={{ "--d": "120ms" } as CSSProperties}>is working,</span>
              <span className="rise-in block text-marigold-400" style={{ "--d": "240ms" } as CSSProperties}>wherever they are.</span>
            </h1>
            <p className="rise-in mt-7 max-w-[32rem] text-lg leading-relaxed text-white/70 sm:text-xl" style={{ "--d": "360ms" } as CSSProperties}>
              Hours, real activity and finished tasks for remote teams, with chat, leave and payroll in the same place. Priced in naira.
            </p>
            <div className="rise-in mt-9 flex flex-wrap gap-3" style={{ "--d": "460ms" } as CSSProperties}>
              <Link href={primary.href} className="arrow-link inline-flex items-center gap-2 rounded-full bg-marigold-400 px-7 py-3.5 text-base font-semibold text-[#15123a] shadow-[0_10px_40px_-10px_rgba(242,169,59,0.7)] transition hover:-translate-y-0.5 hover:bg-marigold-300">
                {primary.label}
                <Icon name="arrowRight" className="h-4 w-4" />
              </Link>
              <Link href="/download" className="inline-flex items-center gap-2 rounded-full border border-white/20 px-7 py-3.5 text-base font-semibold text-white transition hover:border-white/50 hover:bg-white/5">
                <Icon name="windows" className="h-4 w-4" />
                Windows app
              </Link>
            </div>
            <p className="rise-in mt-5 text-white/55" style={{ "--d": "540ms" } as CSSProperties}>14 days free, no card. Free for up to {FREE_SEATS} people after.</p>
          </div>

          {/* A real photo with the product's own "team today" view resting over it. */}
          <div className="rise-in relative" style={{ "--d": "200ms" } as CSSProperties}>
            <div className="ml-auto w-[78%] overflow-hidden rounded-[2rem] rounded-tl-[6rem] shadow-[0_50px_120px_-40px_rgba(0,0,0,0.9)]">
              <Photo p={PHOTOS.officeRed} w={620} h={700} priority className="aspect-[31/35] w-full object-cover" />
            </div>
            <div className="relative -mt-[58%] w-[92%] text-slate-900 sm:-mt-[52%]">
              <Tilt max={4} className="rounded-2xl">
                <HeroProduct />
              </Tilt>
            </div>
          </div>
        </div>
      </section>

      <main>
        {/* Marquee of plain promises, sliding slowly (pauses on hover). -------------------------- */}
        <section aria-label="Promises" className="marquee overflow-hidden border-b border-slate-200 bg-surface py-6">
          <div className="marquee-track" aria-hidden>
            {[0, 1].map((copy) => (
              <ul key={copy} className="flex shrink-0 items-center">
                {["Activity checked every 10 seconds", "Not a single keystroke recorded", "Time kept when the internet drops", `Free for up to ${FREE_SEATS} people`, "Payslips with PAYE and pension", "Leave with Nigerian holidays built in"].map((t) => (
                  <li key={t} className="flex items-center gap-8 px-8 text-2xl font-bold tracking-tight whitespace-nowrap text-slate-800 sm:text-3xl">
                    {t}
                    <span className="h-2.5 w-2.5 rotate-45 bg-marigold-400" />
                  </li>
                ))}
              </ul>
            ))}
          </div>
          <p className="sr-only">Activity checked every 10 seconds. Not a single keystroke recorded. Time kept when the internet drops. Free for up to {FREE_SEATS} people.</p>
        </section>

        {/* How it works: photo + three steps ------------------------------------------------------ */}
        <section className="mx-auto grid max-w-7xl items-center gap-14 px-4 py-24 sm:px-6 lg:grid-cols-2 lg:gap-20 lg:py-32">
          <Reveal variant="scale" className="relative order-last lg:order-first">
            <div className="group photo-zoom overflow-hidden rounded-[2rem] rounded-br-[6rem]">
              <Photo p={PHOTOS.sofaLaptop} w={680} h={760} className="aspect-[17/19] w-full object-cover" />
            </div>
            {/* The invite, as it lands on WhatsApp. */}
            <div className="float-y absolute -right-2 bottom-10 w-60 rounded-2xl bg-surface p-4 shadow-2xl ring-1 ring-slate-200 sm:-right-8">
              <p className="flex items-center gap-2 font-semibold text-slate-900">
                <Icon name="whatsapp" className="h-5 w-5 text-emerald-600" />
                You&apos;re invited
              </p>
              <p className="mt-1 text-slate-600">Join Adeyemi &amp; Co on Workbase</p>
              <span className="mt-3 block rounded-lg bg-brand-600 py-2 text-center font-semibold text-white">Accept invite</span>
            </div>
          </Reveal>
          <div>
            <Reveal as="h2" className="text-4xl leading-[1.05] font-extrabold tracking-[-0.035em] sm:text-6xl">Up and running in an afternoon.</Reveal>
            <ol className="mt-12 space-y-2">
              {[
                ["Invite your people", "Send invite links by email or WhatsApp."],
                ["They clock in from the app", "They see what's tracked, agree, and press Clock in."],
                ["Watch the day unfold", "Who's working, hours, activity, tasks and timesheets."],
              ].map(([title, body]) => (
                <Reveal as="li" key={title} className="group rounded-2xl p-5 transition duration-500 hover:bg-surface hover:shadow-[0_20px_50px_-30px_rgba(21,18,58,0.4)]">
                  <h3 className="flex items-center justify-between gap-4 text-2xl font-bold tracking-tight">
                    {title}
                    <Icon name="arrowRight" className="h-5 w-5 shrink-0 -translate-x-3 text-brand-600 opacity-0 transition duration-500 group-hover:translate-x-0 group-hover:opacity-100" />
                  </h3>
                  <p className="mt-1.5 text-lg text-slate-600">{body}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* Features: a photo that stays put while three groups scroll past ------------------------- */}
        <section id="features" className="scroll-mt-6 bg-[#110e2e] text-white">
          <div className="mx-auto grid max-w-7xl gap-14 px-4 py-24 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20 lg:py-32">
            <div className="lg:sticky lg:top-10 lg:self-start">
              <Reveal as="h2" className="text-4xl leading-[1.05] font-extrabold tracking-[-0.035em] sm:text-6xl">One place for the whole working day.</Reveal>
              <Reveal variant="scale" className="mt-10 hidden lg:block">
                <div className="group photo-zoom overflow-hidden rounded-[2rem]">
                  <Photo p={PHOTOS.manCafe} w={600} h={460} className="aspect-[30/23] w-full object-cover" />
                </div>
              </Reveal>
            </div>
            <div className="space-y-14">
              {FEATURE_GROUPS.map((g) => (
                <div key={g.title}>
                  <Reveal as="h2" className="text-2xl font-bold text-marigold-400">{g.title}</Reveal>
                  <ul className="mt-4 divide-y divide-white/10 border-y border-white/10">
                    {g.items.map(([t, b]) => (
                      <Reveal as="li" key={t} className="group py-5 transition-all duration-500 hover:pl-3">
                        <p className="flex items-center justify-between gap-3 text-lg font-semibold">
                          {t}
                          <span className="h-2 w-2 shrink-0 rotate-45 bg-white/25 transition duration-500 group-hover:scale-150 group-hover:bg-marigold-400" aria-hidden />
                        </p>
                        <p className="mt-1 text-white/65 transition-colors group-hover:text-white/90">{b}</p>
                      </Reveal>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Privacy ------------------------------------------------------------------------------- */}
        <section id="privacy" className="relative scroll-mt-6 overflow-hidden text-white">
          <Photo p={PHOTOS.cafeDesk} w={1600} h={900} className="absolute inset-0 h-full w-full object-cover" />
          <span className="absolute inset-0 bg-gradient-to-r from-[#110e2e] via-[#110e2e]/90 to-[#110e2e]/60" aria-hidden />
          <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2 lg:py-36">
            <div>
              <Reveal as="h2" className="text-4xl leading-[1.05] font-extrabold tracking-[-0.035em] sm:text-6xl">Trust works both ways.</Reveal>
              <Reveal delay={80}>
                <p className="mt-6 max-w-md text-lg leading-relaxed text-white/75">
                  Good people don&apos;t mind showing their work. They mind being spied on. Workbase records only what shows work is happening,
                  tells people exactly what that is, and lets them see all of it.
                </p>
                <Link href="/what-we-track" className="arrow-link mt-7 inline-flex items-center gap-1.5 font-semibold text-white underline decoration-marigold-400 decoration-2 underline-offset-4">
                  What we track
                  <Icon name="arrowRight" className="h-4 w-4" />
                </Link>
              </Reveal>
            </div>
            <div>
              <Reveal as="h2" className="text-2xl font-bold text-marigold-400">Workbase never records</Reveal>
              <ul className="mt-5 divide-y divide-white/10 border-y border-white/10">
                {NEVER.map((n, i) => (
                  <Reveal as="li" key={n.text} delay={i * 80} className="group flex items-center gap-4 py-5 text-lg text-white/90 transition-all duration-500 hover:pl-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-[#b8aaff] transition duration-300 group-hover:bg-marigold-400 group-hover:text-[#15123a]">
                      <Icon name={n.icon} className="h-[1.1rem] w-[1.1rem]" />
                    </span>
                    {n.text}
                  </Reveal>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Pricing ------------------------------------------------------------------------------- */}
        <section id="pricing" className="mx-auto max-w-7xl scroll-mt-6 px-4 py-24 sm:px-6 lg:py-32">
          <Reveal as="h2" className="text-4xl leading-[1.05] font-extrabold tracking-[-0.035em] sm:text-6xl">Simple pricing, in naira.</Reveal>
          <Reveal delay={80}>
            <p className="mt-5 max-w-xl text-lg text-slate-600">Per person, per month. Pay ahead for 1, 3 or 12 months; 12 months costs the same as 10.</p>
          </Reveal>
          <div className="mt-12 grid gap-5 lg:grid-cols-3 lg:items-stretch">
            <Reveal variant="scale">
              <Plan
                name="Free"
                price="₦0"
                note={`Up to ${FREE_SEATS} people`}
                items={["Clock in/out and idle check", "Activity and app names", "Tasks, chat and leave", `Last ${FREE_HISTORY_DAYS} days of history`]}
                cta={{ href: primary.href, label: user ? "Open dashboard" : "Start free" }}
              />
            </Reveal>
            <Reveal variant="scale" delay={100}>
              <Plan
                name="Standard"
                price={naira(SEAT_PRICE_NAIRA)}
                note="As many people as you need"
                featured
                items={["Everything in Free", "Which document or website was open", "Hour-by-hour day timeline", "Full history and spreadsheet downloads", "Monthly payroll"]}
                cta={{ href: user ? "/dashboard/billing" : "/signup", label: user ? "See your plan" : "Start 14-day trial" }}
              />
            </Reveal>
            <Reveal variant="scale" delay={200}>
              <Plan
                name="Pro"
                price={naira(PRO_PRICE_NAIRA)}
                note="For teams that need proof of work"
                items={["Everything in Standard", "Optional screenshots, off until you switch them on", "Blur, and how often", "Workers agree first and see their own"]}
                cta={{ href: user ? "/dashboard/billing" : "/signup", label: user ? "See your plan" : "Start free" }}
              />
            </Reveal>
          </div>
        </section>

        {/* FAQ ----------------------------------------------------------------------------------- */}
        <section className="border-t border-slate-200 bg-canvas">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-24 sm:px-6 lg:grid-cols-[1fr_2fr] lg:py-32">
            <Reveal as="h2" className="text-4xl leading-[1.05] font-extrabold tracking-[-0.035em] sm:text-6xl">Questions, answered.</Reveal>
            <div className="divide-y divide-slate-200 border-y border-slate-200">
              {FAQ.map((f, i) => (
                <Reveal key={f.q} delay={i * 50}>
                  <details className="group py-5">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold text-slate-900 transition-colors hover:text-brand-700 [&::-webkit-details-marker]:hidden">
                      {f.q}
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 transition duration-300 group-open:rotate-45 group-open:border-brand-600 group-open:bg-brand-600 group-open:text-white">
                        <Icon name="plus" className="h-4 w-4" />
                      </span>
                    </summary>
                    <p className="mt-3 max-w-2xl leading-relaxed text-slate-600">{f.a}</p>
                  </details>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Closing call to action: team photo behind the text ----------------------------------- */}
        <section className="px-4 pb-20 sm:px-6">
          <Reveal variant="scale" className="mx-auto max-w-7xl">
            <div className="group photo-zoom relative overflow-hidden rounded-[2.25rem]">
              <Photo p={PHOTOS.teamOutdoors} w={1400} h={700} className="absolute inset-0 h-full w-full object-cover" />
              <span className="absolute inset-0 bg-gradient-to-r from-[#110e2e]/95 via-[#110e2e]/75 to-[#110e2e]/20" aria-hidden />
              <div className="relative px-7 py-20 text-white sm:px-14 sm:py-28">
                <h2 className="max-w-xl text-4xl leading-[1.02] font-extrabold tracking-[-0.035em] sm:text-6xl">Start with your team today.</h2>
                <p className="mt-5 max-w-md text-lg text-white/75">14 days of Standard, free. No card needed.</p>
                <Link href={primary.href} className="arrow-link mt-10 inline-flex items-center gap-2 rounded-full bg-marigold-400 px-7 py-3.5 font-semibold text-[#15123a] transition hover:-translate-y-0.5 hover:bg-marigold-300">
                  {primary.label}
                  <Icon name="arrowRight" className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-slate-200">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <Logo size="sm" />
            <span>© {new Date().getFullYear()} {OPERATOR_NAME} · Photos from Unsplash</span>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Footer">
            {family && <a href={family} className="draw-underline hover:text-slate-900">All products</a>}
            <Link href="/download" className="draw-underline hover:text-slate-900">Download</Link>
            <Link href="/what-we-track" className="draw-underline hover:text-slate-900">What we track</Link>
            <Link href="/privacy" className="draw-underline hover:text-slate-900">Privacy</Link>
            <Link href="/terms" className="draw-underline hover:text-slate-900">Terms</Link>
            <ThemeToggle />
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Plan({
  name,
  price,
  note,
  items,
  cta,
  featured,
}: {
  name: string;
  price: string;
  note: string;
  items: string[];
  cta: { href: string; label: string };
  featured?: boolean;
}) {
  return (
    <div className={`h-full transition duration-500 hover:-translate-y-1.5 ${featured ? "rounded-3xl bg-brand-600 p-1 shadow-xl shadow-brand-600/20 hover:shadow-2xl hover:shadow-brand-600/30" : "rounded-3xl hover:shadow-[0_24px_60px_-30px_rgba(21,18,58,0.35)]"}`}>
      <div className={`flex h-full flex-col rounded-[1.25rem] border bg-surface p-7 ${featured ? "border-transparent" : "border-slate-200"}`}>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xl font-semibold">{name}</h3>
          {featured && <span className="text-sm font-medium text-brand-700">Most teams pick this</span>}
        </div>
        <p className="mt-4 flex items-baseline gap-1.5">
          <span className="font-display text-4xl font-bold tracking-tight">{price}</span>
          {price !== "₦0" && <span className="text-sm text-slate-500">/ person / month</span>}
        </p>
        <p className="mt-1 text-sm text-slate-500">{note}</p>
        <ul className="mt-6 space-y-3 text-sm">
          {items.map((i) => (
            <li key={i} className="flex items-start gap-2.5 text-slate-700">
              <Icon name="check" className="mt-0.5 h-4 w-4 text-brand-600 dark:text-brand-700" />
              {i}
            </li>
          ))}
        </ul>
        <Link href={cta.href} className={`${featured ? "btn-primary" : "btn-secondary"} mt-8 w-full py-2.5`}>
          {cta.label}
        </Link>
      </div>
    </div>
  );
}
