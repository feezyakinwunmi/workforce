import type { Metadata } from "next";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { FREE_HISTORY_DAYS, FREE_SEATS, PRO_PRICE_NAIRA, SEAT_PRICE_NAIRA } from "@/lib/billing";
import { APP_NAME, OPERATOR_NAME } from "@/lib/config";
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

const FEATURES: Array<{ icon: IconName; title: string; body: string }> = [
  { icon: "clock", title: "Clock in, clock out", body: "A small desktop app. You see who started, when, and their hours so far." },
  { icon: "activity", title: "Active or just online", body: "Keyboard and mouse use, checked every 10 seconds. Long breaks get a question: was that work?" },
  { icon: "tasks", title: "Tasks and daily reports", body: "Assign work with due dates. Time is logged to the task, and people say what they got done." },
  { icon: "globe", title: "Everyone in their own time zone", body: "Lagos, London and Toronto each get their own working day and timesheet." },
  { icon: "zap", title: "Made for patchy internet", body: "Time is saved on the computer and uploads when the connection comes back." },
  { icon: "chat", title: "Chat and announcements", body: "Groups, direct messages, files and company news next to the work." },
  { icon: "leave", title: "Leave and holidays", body: "Requests, approvals and balances, with Nigerian public holidays built in." },
  { icon: "wallet", title: "Nigerian payroll and payslips", body: "Pay from hours and leave, with PAYE, pension and NHF worked out, and a PDF payslip emailed to each person." },
  { icon: "phone", title: "Clock in from a phone", body: "For people on the road: one tap, with their location at clock-in if you want it." },
  { icon: "receipt", title: "Expense claims", body: "Snap the receipt, a manager approves, and it's paid back with the next payslip." },
  { icon: "briefcase", title: "Staff records", body: "Contracts, IDs, bank and pension details, and a checklist for every new hire." },
  { icon: "sparkle", title: "Goals and reviews", body: "Reviews that start from the hours, tasks and leave the app already knows." },
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

  return (
    <div className="min-h-screen bg-surface text-slate-900">
      <header className="sticky top-0 z-40 bg-surface/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" aria-label={`${APP_NAME} home`}><Logo /></Link>
          <nav className="flex items-center gap-1 text-sm" aria-label="Site">
            <a href="#features" className="btn-ghost hidden md:inline-flex">Features</a>
            <a href="#pricing" className="btn-ghost hidden md:inline-flex">Pricing</a>
            <a href="#privacy" className="btn-ghost hidden md:inline-flex">Privacy</a>
            <span className="mx-1 hidden sm:block"><ThemeToggle /></span>
            {!user && <Link href="/login" className="btn-ghost">Log in</Link>}
            <Link href={primary.href} className="btn-primary whitespace-nowrap">{user ? "Dashboard" : "Start free"}</Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-[560px] bg-[radial-gradient(60%_50%_at_75%_20%,rgba(106,76,245,0.14),transparent_70%)] dark:bg-[radial-gradient(60%_50%_at_75%_20%,rgba(143,123,255,0.18),transparent_70%)]"
            aria-hidden
          />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-4 pt-10 pb-20 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center lg:pt-16 lg:pb-24">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-surface px-3 py-1 text-xs font-medium text-slate-600">
                <span className="h-1.5 w-1.5 rounded-full bg-marigold-400" aria-hidden />
                Built in Lagos for teams everywhere
              </p>
              <h1 className="mt-5 font-display text-[2.6rem] leading-[1.04] font-bold tracking-[-0.035em] sm:text-[3.5rem] lg:text-[3.6rem] xl:text-[4rem]">
                Know your team is working, wherever they are.
              </h1>
              <p className="mt-5 max-w-[32rem] text-lg leading-relaxed text-slate-600">
                Hours, real activity and finished tasks for remote teams, with chat, leave and payroll in the same place. Priced in naira.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href={primary.href} className="btn-primary px-6 py-3 text-base">
                  {primary.label}
                  <Icon name="arrowRight" className="h-4 w-4" />
                </Link>
                <Link href="/download" className="btn-secondary px-6 py-3 text-base">
                  <Icon name="windows" className="h-4 w-4" />
                  Windows app
                </Link>
              </div>
              <p className="mt-4 text-sm text-slate-500">14 days free, no card. Free for up to {FREE_SEATS} people after.</p>
            </div>
            <HeroProduct />
          </div>
        </section>

        {/* Facts strip */}
        <section className="border-y border-slate-200 bg-slate-50">
          <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 sm:px-6 lg:grid-cols-4">
            {[
              ["10 s", "between activity checks"],
              ["0", "keystrokes recorded"],
              ["Offline", "time kept until you're back online"],
              [`${FREE_SEATS}`, "people free, for as long as you like"],
            ].map(([k, v]) => (
              <div key={v}>
                <dt className="font-display text-3xl font-bold tracking-tight text-slate-900">{k}</dt>
                <dd className="mt-1 text-sm text-slate-500">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
          <h2 className="max-w-xl font-display text-3xl font-bold tracking-tight sm:text-4xl">Up and running in an afternoon</h2>
          <ol className="mt-12 grid gap-10 md:grid-cols-3">
            {[
              ["Invite your people", "Send invite links by email or WhatsApp."],
              ["They clock in from the app", "They see what's tracked, agree, and press Clock in."],
              ["Watch the day unfold", "Who's working, hours, activity, tasks and timesheets."],
            ].map(([title, body], i) => (
              <li key={title} className="relative pl-14">
                <span className="absolute top-0 left-0 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 font-display text-lg font-bold text-white">
                  {i + 1}
                </span>
                <h3 className="font-display text-lg font-semibold">{title}</h3>
                <p className="mt-1 text-slate-600">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 bg-slate-50">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
            <h2 className="max-w-2xl font-display text-3xl font-bold tracking-tight sm:text-4xl">One place for the whole working day</h2>
            <dl className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((f) => (
                <div key={f.title}>
                  <dt>
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-surface text-brand-600 dark:text-brand-700">
                      <Icon name={f.icon} className="h-5 w-5" />
                    </span>
                    <span className="mt-4 block font-semibold text-slate-900">{f.title}</span>
                  </dt>
                  <dd className="mt-1.5 text-sm leading-6 text-slate-600">{f.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Privacy */}
        <section id="privacy" className="scroll-mt-20 bg-[#15123a] text-white dark:bg-raised">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-24">
            <div>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-marigold-300">
                <Icon name="shield" className="h-6 w-6" />
              </span>
              <h2 className="mt-6 font-display text-3xl font-bold tracking-tight sm:text-4xl">Trust works both ways</h2>
              <p className="mt-4 max-w-md leading-relaxed text-[#c9c3e6]">
                Good people don&apos;t mind showing their work. They mind being spied on. Workbase records only what shows work is happening,
                tells people exactly what that is, and lets them see all of it.
              </p>
              <Link href="/what-we-track" className="mt-6 inline-flex items-center gap-1.5 font-semibold text-white underline decoration-marigold-400 decoration-2 underline-offset-4">
                What we track
                <Icon name="arrowRight" className="h-4 w-4" />
              </Link>
            </div>
            <div>
              <p className="font-semibold">It never records</p>
              <ul className="mt-5 divide-y divide-white/10 border-y border-white/10">
                {NEVER.map((n) => (
                  <li key={n.text} className="flex items-center gap-4 py-4 text-[#e4e0f5]">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-[#b8aaff]">
                      <Icon name={n.icon} className="h-[1.1rem] w-[1.1rem]" />
                    </span>
                    {n.text}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 lg:py-24">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Simple pricing, in naira</h2>
          <p className="mt-3 max-w-xl text-slate-600">Per person, per month. Pay ahead for 1, 3 or 12 months; 12 months costs the same as 10.</p>
          <div className="mt-12 grid gap-5 lg:grid-cols-3 lg:items-start">
            <Plan
              name="Free"
              price="₦0"
              note={`Up to ${FREE_SEATS} people`}
              items={["Clock in/out and idle check", "Activity and app names", "Tasks, chat and leave", `Last ${FREE_HISTORY_DAYS} days of history`]}
              cta={{ href: primary.href, label: user ? "Open dashboard" : "Start free" }}
            />
            <Plan
              name="Standard"
              price={naira(SEAT_PRICE_NAIRA)}
              note="As many people as you need"
              featured
              items={["Everything in Free", "Which document or website was open", "Hour-by-hour day timeline", "Full history and spreadsheet downloads", "Monthly payroll"]}
              cta={{ href: user ? "/dashboard/billing" : "/signup", label: user ? "See your plan" : "Start 14-day trial" }}
            />
            <Plan
              name="Pro"
              price={naira(PRO_PRICE_NAIRA)}
              note="For teams that need proof of work"
              items={["Everything in Standard", "Optional screenshots, off until you switch them on", "Blur, and how often", "Workers agree first and see their own"]}
              cta={{ href: user ? "/dashboard/billing" : "/signup", label: user ? "See your plan" : "Start free" }}
            />
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-slate-200 bg-slate-50">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_2fr] lg:py-24">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Questions</h2>
            <div className="divide-y divide-slate-200 border-y border-slate-200">
              {FAQ.map((f) => (
                <details key={f.q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <Icon name="plus" className="h-4 w-4 text-slate-400 transition group-open:rotate-45" />
                  </summary>
                  <p className="mt-3 max-w-2xl leading-relaxed text-slate-600">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Closing call to action */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl bg-brand-600 px-6 py-14 text-center text-white sm:px-12">
            <div className="pointer-events-none absolute -right-10 -bottom-16 h-56 w-56 rounded-full bg-marigold-400/30 blur-2xl" aria-hidden />
            <h2 className="relative font-display text-3xl font-bold tracking-tight sm:text-4xl">Start with your team today</h2>
            <p className="relative mx-auto mt-3 max-w-md text-[#e0d9ff]">14 days of Standard, free. No card needed.</p>
            <Link href={primary.href} className="relative mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-semibold text-[#2e1f7a] hover:bg-[#f3f0ff]">
              {primary.label}
              <Icon name="arrowRight" className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <Logo size="sm" />
            <span>© {new Date().getFullYear()} {OPERATOR_NAME}</span>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Footer">
            <Link href="/download" className="hover:text-slate-900">Download</Link>
            <Link href="/what-we-track" className="hover:text-slate-900">What we track</Link>
            <Link href="/privacy" className="hover:text-slate-900">Privacy</Link>
            <Link href="/terms" className="hover:text-slate-900">Terms</Link>
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
    <div className={featured ? "rounded-3xl bg-brand-600 p-1 shadow-xl shadow-brand-600/20" : "rounded-3xl"}>
      <div className={`flex h-full flex-col rounded-[1.25rem] border bg-surface p-7 ${featured ? "border-transparent" : "border-slate-200"}`}>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xl font-semibold">{name}</h3>
          {featured && <span className="badge bg-marigold-100 text-marigold-700">Recommended</span>}
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
