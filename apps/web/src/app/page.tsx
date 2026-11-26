import type { Metadata } from "next";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { Logo } from "@/components/logo";
import { Reveal, Tilt } from "@/components/motion";
import { ThemeToggle } from "@/components/theme-toggle";
import { FREE_HISTORY_DAYS, FREE_SEATS, PRO_PRICE_NAIRA, SEAT_PRICE_NAIRA } from "@/lib/billing";
import { APP_NAME, OPERATOR_NAME } from "@/lib/config";
import { homeUrl } from "@/lib/home/paths";
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
    <div className="min-h-screen overflow-x-clip bg-surface text-slate-900">
      {/* Header ------------------------------------------------------------------------------- */}
      <header className="sticky top-0 z-40 bg-surface/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" aria-label={`${APP_NAME} home`} className="transition-opacity hover:opacity-80"><Logo /></Link>
          <nav className="flex items-center gap-1 text-sm" aria-label="Site">
            <a href="#features" className="draw-underline hidden px-3 py-2 text-slate-600 hover:text-slate-900 md:inline">Features</a>
            <a href="#pricing" className="draw-underline hidden px-3 py-2 text-slate-600 hover:text-slate-900 md:inline">Pricing</a>
            <a href="#privacy" className="draw-underline hidden px-3 py-2 text-slate-600 hover:text-slate-900 md:inline">Privacy</a>
            {family && <a href={family} className="draw-underline hidden px-3 py-2 text-slate-600 hover:text-slate-900 lg:inline">All products</a>}
            <span className="mx-1 hidden sm:block"><ThemeToggle /></span>
            {!user && <Link href="/login" className="btn-ghost">Log in</Link>}
            <Link href={primary.href} className="btn-primary whitespace-nowrap">{user ? "Dashboard" : "Start free"}</Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero: the headline, and the product's own "team today" view leaning toward the pointer. */}
        <section className="relative">
          <div className="relative mx-auto grid max-w-6xl gap-14 px-4 pt-12 pb-20 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center lg:pt-20 lg:pb-28">
            <div>
              <h1 className="font-display text-[2.6rem] leading-[1.03] font-bold tracking-[-0.04em] sm:text-[3.6rem] xl:text-[4.1rem]">
                <Reveal as="span" className="block">Know your team</Reveal>
                <Reveal as="span" delay={80} className="block">is working,</Reveal>
                <Reveal as="span" delay={160} className="block text-brand-600 dark:text-brand-700">wherever they are.</Reveal>
              </h1>
              <Reveal delay={240}>
                <p className="mt-6 max-w-[32rem] text-lg leading-relaxed text-slate-600">
                  Hours, real activity and finished tasks for remote teams, with chat, leave and payroll in the same place. Priced in naira.
                </p>
              </Reveal>
              <Reveal delay={320}>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link href={primary.href} className="btn-primary arrow-link px-6 py-3 text-base">
                    {primary.label}
                    <Icon name="arrowRight" className="h-4 w-4" />
                  </Link>
                  <Link href="/download" className="btn-secondary px-6 py-3 text-base">
                    <Icon name="windows" className="h-4 w-4" />
                    Windows app
                  </Link>
                </div>
                <p className="mt-4 text-sm text-slate-500">14 days free, no card. Free for up to {FREE_SEATS} people after.</p>
              </Reveal>
            </div>
            <Reveal variant="scale" delay={200}>
              <Tilt max={4} className="rounded-2xl">
                <HeroProduct />
              </Tilt>
            </Reveal>
          </div>
        </section>

        {/* Four numbers -------------------------------------------------------------------------- */}
        <section className="border-y border-slate-200">
          <dl className="mx-auto grid max-w-6xl grid-cols-2 px-4 sm:px-6 lg:grid-cols-4">
            {[
              ["10 s", "between activity checks"],
              ["0", "keystrokes recorded"],
              ["Offline", "time kept until you're back online"],
              [`${FREE_SEATS}`, "people free, for as long as you like"],
            ].map(([k, v], i) => (
              <Reveal key={v} delay={i * 80} className="border-slate-200 py-9 pr-4 lg:border-l lg:pl-8 lg:first:border-l-0 lg:first:pl-0">
                <dt className="font-display text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">{k}</dt>
                <dd className="mt-2 text-sm text-slate-500">{v}</dd>
              </Reveal>
            ))}
          </dl>
        </section>

        {/* How it works: three steps on a ruled line ------------------------------------------- */}
        <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:py-32">
          <Reveal as="h2" className="max-w-xl font-display text-3xl font-bold tracking-tight sm:text-[2.6rem]">Up and running in an afternoon</Reveal>
          <ol className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
            {[
              ["Invite your people", "Send invite links by email or WhatsApp."],
              ["They clock in from the app", "They see what's tracked, agree, and press Clock in."],
              ["Watch the day unfold", "Who's working, hours, activity, tasks and timesheets."],
            ].map(([title, body], i) => (
              <Reveal as="li" key={title} delay={i * 110} className="group border-t-2 border-slate-200 pt-6 transition-colors duration-500 hover:border-brand-600">
                <span className="font-display text-sm font-semibold text-slate-400 tabular-nums transition-colors group-hover:text-brand-600">0{i + 1}</span>
                <h3 className="mt-3 font-display text-xl font-semibold">{title}</h3>
                <p className="mt-2 text-slate-600">{body}</p>
              </Reveal>
            ))}
          </ol>
        </section>

        {/* Features: three groups, each a plain list ------------------------------------------- */}
        <section id="features" className="scroll-mt-20 border-t border-slate-200 bg-canvas">
          <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:py-32">
            <Reveal as="h2" className="max-w-2xl font-display text-3xl font-bold tracking-tight sm:text-[2.6rem]">One place for the whole working day</Reveal>
            <div className="mt-14 grid gap-12 lg:grid-cols-3 lg:gap-10">
              {FEATURE_GROUPS.map((g, gi) => (
                <div key={g.title}>
                  <Reveal delay={gi * 100}>
                    <h3 className="border-b border-slate-300 pb-3 font-display text-lg font-semibold">{g.title}</h3>
                  </Reveal>
                  <ul>
                    {g.items.map(([t, b], n) => (
                      <Reveal as="li" key={t} delay={gi * 100 + n * 60} className="group border-b border-slate-200 py-4">
                        <p className="flex items-center justify-between gap-3 font-medium text-slate-900">
                          {t}
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300 transition duration-300 group-hover:scale-150 group-hover:bg-marigold-400" aria-hidden />
                        </p>
                        <p className="mt-1 text-sm leading-6 text-slate-600 transition-colors group-hover:text-slate-800">{b}</p>
                      </Reveal>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Privacy ------------------------------------------------------------------------------- */}
        <section id="privacy" className="grain scroll-mt-20 bg-[#15123a] text-white dark:bg-raised">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2 lg:py-32">
            <div>
              <Reveal as="h2" className="font-display text-3xl font-bold tracking-tight sm:text-[2.6rem]">Trust works both ways</Reveal>
              <Reveal delay={80}>
                <p className="mt-4 max-w-md text-lg leading-relaxed text-[#c9c3e6]">
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
              <Reveal><p className="font-semibold">It never records</p></Reveal>
              <ul className="mt-5 divide-y divide-white/10 border-y border-white/10">
                {NEVER.map((n, i) => (
                  <Reveal as="li" key={n.text} delay={i * 80} className="group flex items-center gap-4 py-4 text-[#e4e0f5]">
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
        <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6 lg:py-32">
          <Reveal as="h2" className="font-display text-3xl font-bold tracking-tight sm:text-[2.6rem]">Simple pricing, in naira</Reveal>
          <Reveal delay={80}>
            <p className="mt-3 max-w-xl text-slate-600">Per person, per month. Pay ahead for 1, 3 or 12 months; 12 months costs the same as 10.</p>
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
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-24 sm:px-6 lg:grid-cols-[1fr_2fr] lg:py-32">
            <Reveal as="h2" className="font-display text-3xl font-bold tracking-tight sm:text-[2.6rem]">Questions</Reveal>
            <div className="divide-y divide-slate-200 border-y border-slate-200">
              {FAQ.map((f, i) => (
                <Reveal key={f.q} delay={i * 50}>
                  <details className="group py-5">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-slate-900 transition-colors hover:text-brand-700 [&::-webkit-details-marker]:hidden">
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

        {/* Closing call to action ---------------------------------------------------------------- */}
        <section className="px-4 py-20 sm:px-6">
          <Reveal variant="scale" className="mx-auto max-w-6xl">
            <div className="grain relative overflow-hidden rounded-[2rem] bg-[#15123a] px-6 py-16 text-white sm:px-14 sm:py-20 dark:bg-raised">
              <h2 className="max-w-xl font-display text-4xl leading-[1.05] font-bold tracking-tight sm:text-6xl">Start with your team today.</h2>
              <p className="mt-4 max-w-md text-lg text-[#c9c3e6]">14 days of Standard, free. No card needed.</p>
              <Link href={primary.href} className="arrow-link mt-9 inline-flex items-center gap-2 rounded-xl bg-marigold-400 px-6 py-3 font-semibold text-[#15123a] transition hover:bg-marigold-300">
                {primary.label}
                <Icon name="arrowRight" className="h-4 w-4" />
              </Link>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-slate-200">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <Logo size="sm" />
            <span>© {new Date().getFullYear()} {OPERATOR_NAME}</span>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Footer">
            {family && <a href={family} className="draw-underline hover:text-slate-900">All products</a>}
            <Link href="/download" className="draw-underline hover:text-slate-900">Download</Link>
            <Link href="/what-we-track" className="draw-underline hover:text-slate-900">What we track</Link>
            <Link href="/privacy" className="draw-underline hover:text-slate-900">Privacy</Link>
            <Link href="/terms" className="draw-underline hover:text-slate-900">Terms</Link>
            <ThemeToggle className="sm:hidden" />
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
