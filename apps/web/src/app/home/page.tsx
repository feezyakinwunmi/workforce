import type { Metadata } from "next";
import { Icon } from "@/components/icons";
import { Logo, LogoMark, type Product } from "@/components/logo";
import { Reveal, RotatingWord, Tilt } from "@/components/motion";
import { ThemeToggle } from "@/components/theme-toggle";
import { FREE_SEATS, PRO_PRICE_NAIRA, SEAT_PRICE_NAIRA } from "@/lib/billing";
import { OPERATOR_NAME } from "@/lib/config";
import { appUrl } from "@/lib/home/paths";
import { ProductStage, type StageItem } from "./stage";

/**
 * The parent site (workbasecore.com): the front door for the whole Workbase family.
 * The proxy rewrites the bare domain's "/" to this page (see lib/home/paths.ts).
 *
 * Page order:
 *   1. Header                    logo, product links, log in / start free (on the app's address)
 *   2. Hero                      kinetic headline + the product stage (each product shown in turn)
 *   3. Ticker                    an endless strip of what's inside, pauses on hover
 *   4. Why it exists             one plain statement and three facts
 *   5. Products                  one row per product: what it does, price, where to open it
 *   6. Prices at a glance        every product's free and paid plan on one table
 *   7. Closing                   dark panel with the main call to action
 *   8. Footer
 *
 * Design rules for this page: no badge/pill labels above headings, no emojis, no icon grids;
 * real product pictures, real prices, short sentences.
 */

export const metadata: Metadata = {
  title: { absolute: "Workbase: run your team's whole working day" },
  description:
    "Workbase tracks time and work for remote teams. Meet runs video calls, Book takes paid bookings and Forms collects answers and payments. Made in Lagos, priced in naira.",
  openGraph: {
    title: "Workbase: run your team's whole working day",
    description: "Time and work, video calls, paid bookings and forms. One account, priced in naira.",
    type: "website",
  },
};

/* ------------------------------------------------------------------------------------------------
 * Addresses. Each product lives on its own address; when one isn't configured (local
 * development) we fall back to the same app's path so every link still works.
 * ---------------------------------------------------------------------------------------------- */
const app = () => appUrl() || "";
const LINKS: Record<Product, string> = {
  workbase: app() || "/",
  meet: process.env.NEXT_PUBLIC_MEET_URL || "/meet",
  book: process.env.NEXT_PUBLIC_BOOK_URL || "/book",
  forms: process.env.NEXT_PUBLIC_FORMS_URL || "/forms",
};

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

/* Prices that live in the database for Meet, Book and Forms (private.meet_price_kobo,
 * private.book_tier). Keep these in step if they change there. */
const MEET_PRO_NAIRA = 3000;
const BOOK_FORMS_PRO_NAIRA = 2000;

/* ------------------------------------------------------------------------------------------------
 * Content
 * ---------------------------------------------------------------------------------------------- */
const STAGE: StageItem[] = [
  {
    product: "workbase",
    name: "Workbase",
    line: "Time, tasks and payroll",
    href: LINKS.workbase,
    describe: "Workbase: a team spread across Lagos, Accra, Nairobi and Toronto, showing who is working now and how active each person has been.",
  },
  {
    product: "meet",
    name: "Workbase Meet",
    line: "Video calls, guests by link",
    href: LINKS.meet,
    describe: "Workbase Meet: a four-person video call with one guest who joined by link, being recorded.",
  },
  {
    product: "book",
    name: "Workbase Book",
    line: "Bookings that get paid",
    href: LINKS.book,
    describe: "Workbase Book: a booking page where a customer picks a day and time and pays a deposit.",
  },
  {
    product: "forms",
    name: "Workbase Forms",
    line: "Forms that take payment",
    href: LINKS.forms,
    describe: "Workbase Forms: an event ticket form that takes payment and adds each answer to a Google Sheet.",
  },
];

const TICKER = [
  "Clock in and out",
  "Active and idle time",
  "Tasks and daily reports",
  "Chat and announcements",
  "Leave and holidays",
  "PAYE, pension and payslips",
  "Video calls with guests",
  "Recording on your device",
  "Booking pages",
  "Deposits through Paystack",
  "Forms with payments",
  "Google Sheets sync",
];

type Row = {
  product: Product;
  name: string;
  headline: string;
  body: string;
  points: string[];
  price: string;
  priceNote: string;
};

const PRODUCTS: Row[] = [
  {
    product: "workbase",
    name: "Workbase",
    headline: "Know the work is happening, wherever your people are.",
    body: "A small desktop app records hours and real activity while someone is clocked in. Managers see the day as it happens, then run payroll from it.",
    points: ["Hours, activity and the apps in use", "Tasks with time logged to each one", "Leave, holidays and Nigerian payroll", "Chat, groups and announcements"],
    price: `From ${naira(SEAT_PRICE_NAIRA)}`,
    priceNote: `per person a month · free for up to ${FREE_SEATS} people`,
  },
  {
    product: "meet",
    name: "Workbase Meet",
    headline: "Calls that hold up on Nigerian internet.",
    body: "Start a meeting, share the link, and let outsiders join with just their name. It turns cameras down before it drops your sound.",
    points: ["Guests join with a link, no account", "Waiting room, co-hosts, screen sharing", "Free recording, kept on your own device", "Attendance report for every meeting"],
    price: `From ${naira(MEET_PRO_NAIRA)}`,
    priceNote: "per host a month · free meetings up to 1 hour",
  },
  {
    product: "book",
    name: "Workbase Book",
    headline: "Let customers book your time and pay for it.",
    body: "Your own booking page with services, hours and days off. Customers pick a time in their time zone and pay a deposit or the full price.",
    points: ["Money goes straight to your bank account", "Reminders a day and an hour before", "Video bookings get a Meet link", "Customers cancel or reschedule from a link"],
    price: "Free",
    priceNote: `3% per payment, or ${naira(BOOK_FORMS_PRO_NAIRA)} a month for no fee`,
  },
  {
    product: "forms",
    name: "Workbase Forms",
    headline: "Forms that collect answers and money together.",
    body: "Build sign-ups, orders, tickets and applications in minutes. Add prices to options, put the form on your website, and watch answers arrive.",
    points: ["Payments and file uploads on any form", "Steps and questions that show only when needed", "Embeds in WordPress, Wix and Shopify", "Every answer copied to a Google Sheet"],
    price: "Free",
    priceNote: `3% per payment, or ${naira(BOOK_FORMS_PRO_NAIRA)} a month for no fee`,
  },
];

const PRICES: Array<{ product: Product; name: string; free: string; paid: string }> = [
  { product: "workbase", name: "Workbase", free: `Up to ${FREE_SEATS} people`, paid: `${naira(SEAT_PRICE_NAIRA)} or ${naira(PRO_PRICE_NAIRA)} per person a month` },
  { product: "meet", name: "Meet", free: "Meetings up to 1 hour, 25 people", paid: `${naira(MEET_PRO_NAIRA)} per host a month` },
  { product: "book", name: "Book", free: "All features, 3% per payment", paid: `${naira(BOOK_FORMS_PRO_NAIRA)} a month, no fee` },
  { product: "forms", name: "Forms", free: "All features, 3% per payment", paid: "Included with Book Pro" },
];

/* ------------------------------------------------------------------------------------------------
 * Page
 * ---------------------------------------------------------------------------------------------- */
export default function ParentHome() {
  const login = `${app()}/login`;
  const signup = `${app()}/signup`;

  return (
    <div className="min-h-screen overflow-x-clip bg-canvas text-slate-900">
      {/* 1. Header ---------------------------------------------------------------------------- */}
      <header className="sticky top-0 z-40 border-b border-transparent bg-canvas/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <a href="/" aria-label="Workbase home" className="transition-opacity hover:opacity-80">
            <Logo />
          </a>
          <nav className="flex items-center gap-1 text-sm" aria-label="Site">
            <a href="#products" className="draw-underline hidden px-3 py-2 text-slate-600 hover:text-slate-900 md:inline">Products</a>
            <a href="#prices" className="draw-underline hidden px-3 py-2 text-slate-600 hover:text-slate-900 md:inline">Prices</a>
            <span className="mx-1 hidden sm:block"><ThemeToggle /></span>
            <a href={login} className="btn-ghost">Log in</a>
            <a href={signup} className="btn-primary arrow-link whitespace-nowrap">
              Start free
              <Icon name="arrowRight" className="hidden h-4 w-4 sm:block" />
            </a>
          </nav>
        </div>
      </header>

      <main>
        {/* 2. Hero ------------------------------------------------------------------------------ */}
        <section className="mx-auto max-w-6xl px-4 pt-12 pb-20 sm:px-6 lg:pt-20 lg:pb-28">
          <h1 className="max-w-4xl font-display text-[2.6rem] leading-[1.02] font-bold tracking-[-0.04em] sm:text-6xl lg:text-[5.2rem]">
            <Reveal as="span" className="block">One home for your</Reveal>
            <Reveal as="span" delay={90} className="block">
              team&apos;s <RotatingWord className="text-brand-600 dark:text-brand-700" words={["work.", "meetings.", "bookings.", "forms."]} />
            </Reveal>
          </h1>
          <Reveal delay={200}>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
              Four tools that share one account: track your team&apos;s day, meet anyone by link, take paid bookings and collect forms. Made in Lagos, priced in naira.
            </p>
          </Reveal>
          <Reveal delay={280}>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href={signup} className="btn-primary arrow-link px-6 py-3 text-base">
                Create a free account
                <Icon name="arrowRight" className="h-4 w-4" />
              </a>
              <a href="#products" className="btn-secondary px-6 py-3 text-base">See the products</a>
            </div>
          </Reveal>

          <Reveal delay={360} variant="scale" className="mt-14 lg:mt-20">
            <ProductStage items={STAGE} />
          </Reveal>
        </section>

        {/* 3. Ticker ---------------------------------------------------------------------------- */}
        <section aria-label="What's inside" className="marquee overflow-hidden border-y border-slate-200 bg-surface py-5">
          <div className="marquee-track" aria-hidden>
            {[0, 1].map((copy) => (
              <ul key={copy} className="flex shrink-0 items-center">
                {TICKER.map((t) => (
                  <li key={t} className="flex items-center gap-6 px-6 font-display text-xl font-medium whitespace-nowrap text-slate-700 sm:text-2xl">
                    {t}
                    <span className="h-2 w-2 rotate-45 bg-marigold-400" />
                  </li>
                ))}
              </ul>
            ))}
          </div>
          <p className="sr-only">{TICKER.join(", ")}</p>
        </section>

        {/* 4. Why it exists --------------------------------------------------------------------- */}
        <section className="mx-auto grid max-w-6xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[1.3fr_1fr] lg:gap-20 lg:py-32">
          <Reveal>
            <p className="font-display text-3xl leading-[1.15] font-semibold tracking-tight text-slate-900 sm:text-[2.6rem]">
              Most tools are built for offices with fast internet and dollar cards.{" "}
              <span className="text-slate-400">Workbase is built for teams spread across Lagos, Accra and London, on whatever connection they have.</span>
            </p>
          </Reveal>
          <dl className="divide-y divide-slate-200 border-y border-slate-200">
            {[
              ["Pay in naira", "Card, transfer or USSD through Paystack. Foreign cards pay the naira price."],
              ["Keeps working offline", "Time is saved on the computer and calls drop video before sound."],
              ["One login", "The same account opens Workbase, Meet, Book and Forms."],
            ].map(([k, v], i) => (
              <Reveal key={k} delay={i * 90} className="py-5">
                <dt className="font-display text-lg font-semibold">{k}</dt>
                <dd className="mt-1 text-slate-600">{v}</dd>
              </Reveal>
            ))}
          </dl>
        </section>

        {/* 5. Products ------------------------------------------------------------------------- */}
        <section id="products" className="scroll-mt-20 border-t border-slate-200">
          {PRODUCTS.map((p, i) => (
            <article key={p.product} className="border-b border-slate-200">
              <div className={`mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-24`}>
                <div className={i % 2 ? "lg:order-2" : ""}>
                  <Reveal>
                    <p className="flex items-center gap-3 text-sm text-slate-500">
                      <span className="font-display text-base font-semibold text-slate-400 tabular-nums">0{i + 1}</span>
                      <span className="h-px w-8 bg-slate-300" />
                      {p.name}
                    </p>
                  </Reveal>
                  <Reveal delay={80} as="h2" className="mt-4 font-display text-3xl leading-tight font-bold tracking-tight sm:text-[2.6rem]">
                    {p.headline}
                  </Reveal>
                  <Reveal delay={150}>
                    <p className="mt-4 max-w-lg text-lg leading-relaxed text-slate-600">{p.body}</p>
                  </Reveal>
                  <ul className="mt-7 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                    {p.points.map((pt, n) => (
                      <Reveal as="li" key={pt} delay={200 + n * 60} className="flex items-start gap-2.5 text-[0.95rem] text-slate-700">
                        <Icon name="check" className="mt-1 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-700" />
                        {pt}
                      </Reveal>
                    ))}
                  </ul>
                </div>

                {/* The product card: its mark, price and the way in. Leans toward the pointer. */}
                <Reveal variant="scale" delay={120} className={i % 2 ? "lg:order-1" : ""}>
                  <Tilt className="group grain overflow-hidden rounded-[1.75rem] bg-[#15123a] p-8 text-white sm:p-10 dark:bg-raised">
                    <a href={LINKS[p.product]} className="block focus:outline-none" aria-label={`Open ${p.name}`}>
                      <div className="flex items-start justify-between">
                        <LogoMark tile product={p.product} className="h-16 w-16 transition duration-500 group-hover:scale-105 group-hover:-rotate-3" />
                        <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 transition duration-500 group-hover:border-marigold-400 group-hover:bg-marigold-400 group-hover:text-[#15123a]">
                          <Icon name="arrowRight" className="h-5 w-5 -rotate-45 transition duration-500 group-hover:rotate-0" />
                        </span>
                      </div>
                      <p className="mt-16 font-display text-4xl font-bold tracking-tight sm:text-5xl">{p.price}</p>
                      <p className="mt-2 text-[#c9c3e6]">{p.priceNote}</p>
                      <p className="mt-8 border-t border-white/10 pt-5 text-sm font-medium text-white/80 transition-colors group-hover:text-white">
                        Open {p.name}
                      </p>
                    </a>
                  </Tilt>
                </Reveal>
              </div>
            </article>
          ))}
        </section>

        {/* 6. Prices at a glance --------------------------------------------------------------- */}
        <section id="prices" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6 lg:py-32">
          <Reveal as="h2" className="font-display text-3xl font-bold tracking-tight sm:text-[2.6rem]">Every price, in one place</Reveal>
          <Reveal delay={80}>
            <p className="mt-3 max-w-xl text-slate-600">Start on any free plan. Pay ahead in naira when you need more; 12 months costs the same as 10.</p>
          </Reveal>
          <div className="mt-12 overflow-hidden rounded-2xl border border-slate-200 bg-surface">
            <div className="hidden grid-cols-[1.1fr_1fr_1.2fr] border-b border-slate-200 bg-slate-50 px-6 py-3 text-xs font-medium text-slate-500 sm:grid">
              <span>Product</span>
              <span>Free</span>
              <span>Paid</span>
            </div>
            <ul>
              {PRICES.map((r, i) => (
                <Reveal as="li" key={r.product} delay={i * 70} className="border-b border-slate-100 last:border-0">
                  <a
                    href={LINKS[r.product]}
                    className="group grid gap-2 px-6 py-5 transition-colors duration-300 hover:bg-brand-50/60 sm:grid-cols-[1.1fr_1fr_1.2fr] sm:items-center"
                  >
                    <span className="flex items-center gap-3 font-display text-lg font-semibold">
                      <LogoMark tile product={r.product} className="h-8 w-8 transition duration-300 group-hover:scale-110" />
                      {r.name}
                    </span>
                    <span className="text-slate-600">{r.free}</span>
                    <span className="flex items-center justify-between gap-3 font-medium text-slate-900">
                      {r.paid}
                      <Icon name="arrowRight" className="h-4 w-4 shrink-0 -translate-x-2 text-brand-600 opacity-0 transition duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
                    </span>
                  </a>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* 7. Closing -------------------------------------------------------------------------- */}
        <section className="px-4 pb-20 sm:px-6">
          <Reveal variant="scale" className="mx-auto max-w-6xl">
            <div className="grain relative overflow-hidden rounded-[2rem] bg-[#15123a] px-6 py-16 text-white sm:px-14 sm:py-20 dark:bg-raised">
              {/* A slow ring of the four marks, drifting behind the text. */}
              <div className="pointer-events-none absolute -right-10 -bottom-10 hidden grid-cols-2 gap-4 opacity-90 md:grid" aria-hidden>
                {(["workbase", "meet", "book", "forms"] as const).map((pr, n) => (
                  <span key={pr} className="float-y" style={{ animationDelay: `${n * 0.8}s` }}>
                    <LogoMark tile product={pr} className="h-24 w-24 lg:h-28 lg:w-28" />
                  </span>
                ))}
              </div>
              <h2 className="relative max-w-xl font-display text-4xl leading-[1.05] font-bold tracking-tight sm:text-6xl">
                Bring your team in this afternoon.
              </h2>
              <p className="relative mt-4 max-w-md text-lg text-[#c9c3e6]">One free account opens all four products. No card needed.</p>
              <div className="relative mt-9 flex flex-wrap gap-3">
                <a href={signup} className="arrow-link inline-flex items-center gap-2 rounded-xl bg-marigold-400 px-6 py-3 font-semibold text-[#15123a] transition hover:bg-marigold-300">
                  Create a free account
                  <Icon name="arrowRight" className="h-4 w-4" />
                </a>
                <a href={login} className="inline-flex items-center rounded-xl border border-white/20 px-6 py-3 font-semibold text-white transition hover:border-white/50 hover:bg-white/5">
                  Log in
                </a>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      {/* 8. Footer ---------------------------------------------------------------------------- */}
      <footer className="border-t border-slate-200">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 text-sm sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-slate-500">Tools for teams that work from anywhere. Made in Lagos by {OPERATOR_NAME}.</p>
          </div>
          <nav aria-label="Products" className="flex flex-col gap-2.5">
            <p className="font-semibold text-slate-900">Products</p>
            {STAGE.map((s) => (
              <a key={s.product} href={s.href} className="draw-underline w-fit text-slate-500 hover:text-slate-900">{s.name}</a>
            ))}
          </nav>
          <nav aria-label="Company" className="flex flex-col gap-2.5">
            <p className="font-semibold text-slate-900">Company</p>
            <a href="/what-we-track" className="draw-underline w-fit text-slate-500 hover:text-slate-900">What we track</a>
            <a href="/privacy" className="draw-underline w-fit text-slate-500 hover:text-slate-900">Privacy</a>
            <a href="/terms" className="draw-underline w-fit text-slate-500 hover:text-slate-900">Terms</a>
            <a href={`${app()}/download`} className="draw-underline w-fit text-slate-500 hover:text-slate-900">Desktop app</a>
          </nav>
        </div>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 pb-10 text-xs text-slate-400 sm:px-6">
          <span>© {new Date().getFullYear()} {OPERATOR_NAME}</span>
          <ThemeToggle className="sm:hidden" />
        </div>
      </footer>
    </div>
  );
}
