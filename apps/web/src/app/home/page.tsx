import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Icon } from "@/components/icons";
import { Logo, LogoMark, type Product } from "@/components/logo";
import { Reveal, RotatingWord, Tilt } from "@/components/motion";
import { Photo } from "@/components/photo";
import { ThemeToggle } from "@/components/theme-toggle";
import { FREE_SEATS, PRO_PRICE_NAIRA, SEAT_PRICE_NAIRA } from "@/lib/billing";
import { OPERATOR_NAME } from "@/lib/config";
import { appUrl } from "@/lib/home/paths";
import { PHOTOS, type Photo as PhotoData } from "@/lib/photos";
import { ProductStage, type StageItem } from "./stage";

/**
 * The parent site (workbasecore.com): the front door for the whole Workbase family.
 * The proxy rewrites the bare domain's "/" to this page (see lib/home/paths.ts).
 *
 * Sections, top to bottom:
 *   1. Hero         dark, drifting colour light, big headline, a photo with live product cards on it
 *   2. Stage        each product's screen shown in turn (stage.tsx)
 *   3. Products     a photo grid: one big card per product, details slide up on hover
 *   4. Lagos band   full-width Lagos photo with three plain statements
 *   5. Prices       every product's free and paid plan on one table
 *   6. Closing      team photo behind the final call to action
 *   7. Footer
 *
 * Design rules (Femi, 26 Nov 2026): no small labels above headings, no tiny captions, no emojis,
 * real photos instead of plain backgrounds, motion and hover everywhere, Inter for headings.
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
 * Addresses. Each product lives on its own address; without one configured (local development)
 * the link falls back to the same app's path, so nothing breaks.
 * ---------------------------------------------------------------------------------------------- */
const app = () => appUrl() || "";
const LINKS: Record<Product, string> = {
  workbase: app() || "/",
  meet: process.env.NEXT_PUBLIC_MEET_URL || "/meet",
  book: process.env.NEXT_PUBLIC_BOOK_URL || "/book",
  forms: process.env.NEXT_PUBLIC_FORMS_URL || "/forms",
};

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

/* Meet, Book and Forms prices live in the database (private.meet_price_kobo, private.book_tier).
 * Keep these two numbers in step if they change there. */
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
    describe: "Workbase: a team across Lagos, Accra, Nairobi and Toronto, showing who is working now and how active each person has been.",
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

type Card = {
  product: Product;
  name: string;
  headline: string;
  points: string[];
  price: string;
  photo: PhotoData;
  /** Grid placement on large screens (the grid is a 6-column bento). */
  span: string;
};

const CARDS: Card[] = [
  {
    product: "workbase",
    name: "Workbase",
    headline: "See the work happening, wherever your people sit.",
    points: ["Hours and real activity", "Tasks, leave and payroll", "Chat and announcements"],
    price: `From ${naira(SEAT_PRICE_NAIRA)} per person`,
    photo: PHOTOS.manPlants,
    span: "lg:col-span-4 lg:row-span-2",
  },
  {
    product: "meet",
    name: "Meet",
    headline: "Calls that survive Nigerian internet.",
    points: ["Guests join with a link", "Free recording on your device"],
    price: `Free, or ${naira(MEET_PRO_NAIRA)} per host`,
    photo: PHOTOS.manSmiling,
    span: "lg:col-span-2",
  },
  {
    product: "book",
    name: "Book",
    headline: "Customers book your time and pay upfront.",
    points: ["Deposits through Paystack", "Reminders before every visit"],
    price: "Free, 3% per payment",
    photo: PHOTOS.barber,
    span: "lg:col-span-2",
  },
  {
    product: "forms",
    name: "Forms",
    headline: "Sign-ups, orders and tickets that collect the money too.",
    points: ["Payments and file uploads", "Put it on any website", "Every answer in Google Sheets"],
    price: "Free, 3% per payment",
    photo: PHOTOS.volunteers,
    span: "lg:col-span-6",
  },
];

const PRICES: Array<{ product: Product; name: string; free: string; paid: string }> = [
  { product: "workbase", name: "Workbase", free: `Up to ${FREE_SEATS} people`, paid: `${naira(SEAT_PRICE_NAIRA)} or ${naira(PRO_PRICE_NAIRA)} per person a month` },
  { product: "meet", name: "Meet", free: "Meetings up to 1 hour, 25 people", paid: `${naira(MEET_PRO_NAIRA)} per host a month` },
  { product: "book", name: "Book", free: "Everything, 3% per payment", paid: `${naira(BOOK_FORMS_PRO_NAIRA)} a month, no fee` },
  { product: "forms", name: "Forms", free: "Everything, 3% per payment", paid: "Included with Book Pro" },
];

/* ------------------------------------------------------------------------------------------------
 * Page
 * ---------------------------------------------------------------------------------------------- */
export default function ParentHome() {
  const login = `${app()}/login`;
  const signup = `${app()}/signup`;

  return (
    <div className="min-h-screen overflow-x-clip bg-canvas text-slate-900">
      {/* 1. Hero ================================================================================ */}
      <section className="grain relative overflow-hidden bg-[#110e2e] text-white">
        {/* Colour light drifting slowly behind everything. */}
        <span className="orb -top-40 -left-32 h-[34rem] w-[34rem] bg-[#6a4cf5]/45" aria-hidden />
        <span className="orb top-1/3 -right-40 h-[28rem] w-[28rem] bg-[#f2a93b]/25" style={{ animationDelay: "-6s" }} aria-hidden />

        {/* Header sits on the dark hero. */}
        <header className="relative z-20">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
            <a href="/" aria-label="Workbase home" className="transition-opacity hover:opacity-80 [&_span]:text-white">
              <Logo />
            </a>
            <nav className="flex items-center gap-1 text-sm" aria-label="Site">
              <a href="#products" className="draw-underline hidden px-3 py-2 text-white/70 hover:text-white md:inline">Products</a>
              <a href="#prices" className="draw-underline hidden px-3 py-2 text-white/70 hover:text-white md:inline">Prices</a>
              <a href={login} className="px-3 py-2 font-medium text-white/80 transition hover:text-white">Log in</a>
              <a href={signup} className="arrow-link ml-1 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 font-semibold text-[#15123a] transition hover:bg-marigold-300">
                Start free
                <Icon name="arrowRight" className="hidden h-4 w-4 sm:block" />
              </a>
            </nav>
          </div>
        </header>

        <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-14 px-4 pt-10 pb-24 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-16 lg:pb-32">
          <div>
            <h1 className="text-[2.9rem] leading-[0.98] font-extrabold tracking-[-0.045em] sm:text-7xl lg:text-[5.4rem]">
              <span className="rise-in block" style={{ "--d": "0ms" } as CSSProperties}>One home for</span>
              <span className="rise-in block" style={{ "--d": "120ms" } as CSSProperties}>your team&apos;s</span>
              <span className="rise-in block text-marigold-400" style={{ "--d": "240ms" } as CSSProperties}>
                <RotatingWord words={["work.", "meetings.", "bookings.", "forms."]} />
              </span>
            </h1>
            <p className="rise-in mt-7 max-w-lg text-lg leading-relaxed text-white/70 sm:text-xl" style={{ "--d": "380ms" } as CSSProperties}>
              Track your team&apos;s day, meet anyone by link, take paid bookings and collect forms. One account, priced in naira.
            </p>
            <div className="rise-in mt-9 flex flex-wrap gap-3" style={{ "--d": "480ms" } as CSSProperties}>
              <a href={signup} className="arrow-link inline-flex items-center gap-2 rounded-full bg-marigold-400 px-7 py-3.5 text-base font-semibold text-[#15123a] shadow-[0_10px_40px_-10px_rgba(242,169,59,0.7)] transition hover:-translate-y-0.5 hover:bg-marigold-300">
                Create a free account
                <Icon name="arrowRight" className="h-4 w-4" />
              </a>
              <a href="#products" className="inline-flex items-center rounded-full border border-white/20 px-7 py-3.5 text-base font-semibold text-white transition hover:border-white/50 hover:bg-white/5">
                See the products
              </a>
            </div>
          </div>

          {/* Photo with live product moments floating on it. */}
          <div className="rise-in relative mx-auto w-full max-w-md lg:max-w-none" style={{ "--d": "200ms" } as CSSProperties}>
            <div className="relative overflow-hidden rounded-[2rem] rounded-tr-[7rem] shadow-[0_50px_120px_-40px_rgba(0,0,0,0.9)]">
              <Photo p={PHOTOS.braidsLaptop} w={720} h={820} priority className="aspect-[36/41] w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#110e2e]/70 via-transparent to-transparent" aria-hidden />
            </div>

            <div className="float-y absolute -left-4 top-10 w-52 rounded-2xl bg-white p-4 text-slate-900 shadow-2xl sm:-left-10" aria-hidden>
              <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                <span className="soft-blink h-2 w-2 rounded-full bg-emerald-500" />
                Clocked in
              </p>
              <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums">03:12:44</p>
              <div className="mt-2 flex h-6 items-end gap-[3px]">
                {[60, 80, 45, 90, 70, 85, 55, 95, 75, 88].map((v, i) => (
                  <span key={i} className="timeline-bar flex-1 rounded-[2px] bg-[#6a4cf5]" style={{ height: `${v}%`, animationDelay: `${600 + i * 60}ms` }} />
                ))}
              </div>
            </div>

            <div className="float-y absolute -right-3 top-1/2 flex w-56 items-center gap-3 rounded-2xl bg-white p-3.5 text-slate-900 shadow-2xl sm:-right-8" style={{ animationDelay: "-2s" }} aria-hidden>
              <LogoMark tile product="book" className="h-10 w-10 shrink-0" />
              <div>
                <p className="text-sm font-semibold">Deposit paid</p>
                <p className="text-xs text-slate-500">₦5,000 · Strategy call</p>
              </div>
            </div>

            <div className="float-y absolute bottom-8 left-6 flex items-center gap-2 rounded-full bg-[#15123a]/85 py-2 pr-4 pl-2 text-sm font-medium text-white backdrop-blur" style={{ animationDelay: "-4s" }} aria-hidden>
              <span className="flex -space-x-2">
                {["AO", "TB", "CE"].map((i) => (
                  <span key={i} className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#15123a] bg-[#6a4cf5] text-[10px] font-bold">{i}</span>
                ))}
              </span>
              Weekly planning has started
            </div>
          </div>
        </div>
      </section>

      {/* 2. Product stage ======================================================================= */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:py-32">
        <Reveal as="h2" className="max-w-3xl text-4xl leading-[1.05] font-extrabold tracking-[-0.035em] sm:text-6xl">
          Four tools. One login.
        </Reveal>
        <Reveal variant="scale" className="mt-14">
          <ProductStage items={STAGE} />
        </Reveal>
      </section>

      {/* 3. Products: photo bento ================================================================ */}
      <section id="products" className="scroll-mt-6 bg-[#110e2e] py-24 text-white lg:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal as="h2" className="max-w-3xl text-4xl leading-[1.05] font-extrabold tracking-[-0.035em] sm:text-6xl">
            Built for the way you already work.
          </Reveal>

          <div className="mt-14 grid auto-rows-[minmax(20rem,auto)] gap-4 lg:grid-cols-6">
            {CARDS.map((c) => (
              <Reveal key={c.product} variant="scale" className={c.span}>
                <a
                  href={LINKS[c.product]}
                  className="group photo-zoom relative flex h-full min-h-[22rem] flex-col justify-end overflow-hidden rounded-[1.75rem] p-7 sm:p-9"
                >
                  <Photo p={c.photo} w={c.span.includes("col-span-6") ? 1400 : c.span.includes("col-span-4") ? 1000 : 700} className="absolute inset-0 h-full w-full object-cover" />
                  {/* Shade so the white text reads on any photo; deeper on hover. */}
                  <span className="absolute inset-0 bg-gradient-to-t from-[#0b0920] via-[#0b0920]/55 to-[#0b0920]/5 transition-opacity duration-700 group-hover:opacity-95" aria-hidden />

                  <span className="absolute top-6 right-6 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 backdrop-blur transition duration-500 group-hover:rotate-0 group-hover:bg-marigold-400 group-hover:text-[#15123a] sm:top-8 sm:right-8">
                    <Icon name="arrowRight" className="h-5 w-5 -rotate-45 transition duration-500 group-hover:rotate-0" />
                  </span>

                  <span className="relative">
                    <span className="flex items-center gap-3">
                      <LogoMark tile product={c.product} className="h-11 w-11 transition duration-500 group-hover:-rotate-6" />
                      <span className="text-xl font-bold">{c.name}</span>
                    </span>
                    <span className="mt-5 block max-w-xl text-2xl leading-tight font-bold tracking-tight sm:text-3xl">{c.headline}</span>
                    <span className="hover-reveal mt-5 flex flex-wrap gap-x-6 gap-y-2 text-white/85">
                      {c.points.map((pt) => (
                        <span key={pt} className="flex items-center gap-2">
                          <Icon name="check" className="h-4 w-4 text-marigold-400" />
                          {pt}
                        </span>
                      ))}
                    </span>
                    <span className="mt-5 block font-semibold text-marigold-300">{c.price}</span>
                  </span>
                </a>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Lagos band ============================================================================ */}
      <section className="relative overflow-hidden">
        <Photo p={PHOTOS.lekkiBridge} w={1600} h={900} className="absolute inset-0 h-full w-full object-cover" />
        <span className="absolute inset-0 bg-gradient-to-r from-[#110e2e] via-[#110e2e]/85 to-[#110e2e]/30" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 py-28 text-white sm:px-6 lg:py-40">
          <Reveal as="h2" className="max-w-2xl text-4xl leading-[1.05] font-extrabold tracking-[-0.035em] sm:text-6xl">
            Made in Lagos, for teams everywhere.
          </Reveal>
          <ul className="mt-12 grid max-w-4xl gap-8 sm:grid-cols-3">
            {[
              ["Pay in naira.", "Card, transfer or USSD through Paystack."],
              ["Works on bad days.", "Time saves offline. Calls drop video before sound."],
              ["Your data stays yours.", "Workers see everything recorded about them."],
            ].map(([k, v]) => (
              <Reveal as="li" key={k} className="group border-l-2 border-white/25 pl-5 transition-colors duration-500 hover:border-marigold-400">
                <p className="text-xl font-bold">{k}</p>
                <p className="mt-2 text-white/70">{v}</p>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* 5. Prices ================================================================================ */}
      <section id="prices" className="mx-auto max-w-7xl scroll-mt-6 px-4 py-24 sm:px-6 lg:py-32">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
          <div>
            <Reveal as="h2" className="text-4xl leading-[1.05] font-extrabold tracking-[-0.035em] sm:text-6xl">
              Start free. Pay in naira.
            </Reveal>
            <Reveal>
              <p className="mt-5 max-w-sm text-lg text-slate-600">Every product has a free plan. Pay ahead when you need more; a year costs the same as ten months.</p>
            </Reveal>
            <Reveal variant="scale" className="mt-10 hidden lg:block">
              <Tilt className="overflow-hidden rounded-[1.75rem]">
                <Photo p={PHOTOS.officeRed} w={560} h={420} className="aspect-[4/3] w-full object-cover" />
              </Tilt>
            </Reveal>
          </div>

          <ul className="divide-y divide-slate-200 self-center border-y border-slate-200">
            {PRICES.map((r) => (
              <Reveal as="li" key={r.product}>
                <a href={LINKS[r.product]} className="group grid gap-3 py-7 transition-all duration-500 hover:pl-4 sm:grid-cols-[11rem_1fr_auto] sm:items-center">
                  <span className="flex items-center gap-3 text-xl font-bold">
                    <LogoMark tile product={r.product} className="h-10 w-10 transition duration-500 group-hover:scale-110 group-hover:-rotate-6" />
                    {r.name}
                  </span>
                  <span>
                    <span className="block text-slate-900">{r.paid}</span>
                    <span className="block text-slate-500">Free: {r.free}</span>
                  </span>
                  <span className="hidden h-11 w-11 items-center justify-center rounded-full border border-slate-200 transition duration-500 group-hover:border-brand-600 group-hover:bg-brand-600 group-hover:text-white sm:flex">
                    <Icon name="arrowRight" className="h-4 w-4" />
                  </span>
                </a>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* 6. Closing =============================================================================== */}
      <section className="px-4 pb-20 sm:px-6">
        <Reveal variant="scale" className="mx-auto max-w-7xl">
          <div className="group photo-zoom relative overflow-hidden rounded-[2.25rem]">
            <Photo p={PHOTOS.teamOutdoors} w={1400} h={700} className="absolute inset-0 h-full w-full object-cover" />
            <span className="absolute inset-0 bg-gradient-to-r from-[#110e2e]/95 via-[#110e2e]/75 to-[#110e2e]/20" aria-hidden />
            <div className="relative px-7 py-20 text-white sm:px-14 sm:py-28">
              <h2 className="max-w-xl text-4xl leading-[1.02] font-extrabold tracking-[-0.035em] sm:text-6xl">Bring your team in this afternoon.</h2>
              <p className="mt-5 max-w-md text-lg text-white/75">One free account opens all four products. No card needed.</p>
              <div className="mt-10 flex flex-wrap gap-3">
                <a href={signup} className="arrow-link inline-flex items-center gap-2 rounded-full bg-marigold-400 px-7 py-3.5 font-semibold text-[#15123a] transition hover:-translate-y-0.5 hover:bg-marigold-300">
                  Create a free account
                  <Icon name="arrowRight" className="h-4 w-4" />
                </a>
                <a href={login} className="inline-flex items-center rounded-full border border-white/30 px-7 py-3.5 font-semibold text-white transition hover:border-white/60 hover:bg-white/10">
                  Log in
                </a>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* 7. Footer ================================================================================ */}
      <footer className="border-t border-slate-200">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 text-sm sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
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
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 pb-10 text-xs text-slate-400 sm:px-6">
          <span>© {new Date().getFullYear()} {OPERATOR_NAME} · Photos from Unsplash</span>
          <ThemeToggle />
        </div>
      </footer>
    </div>
  );
}
