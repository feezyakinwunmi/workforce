import type { Metadata } from "next";
import { LandingFx } from "@/components/landing/fx";
import { LandingSprite } from "@/components/landing/sprite";
import { appUrl } from "@/lib/home/paths";

/**
 * The parent site (workbasecore.com): the front door for Workbase, Meet, Book and Forms.
 * The proxy rewrites the bare domain's "/" to this page (see lib/home/paths.ts).
 *
 * Built from the design prototype Femi approved on 26 Nov 2026. Sections, top to bottom:
 *   Header      logo, Products menu (each product opens on its own address), log in / start free
 *   Hero        headline with a rotating word, buttons, then a product window that switches
 *               between the four products every 5 s, alerts popping up around it, and a row of
 *               "Open" links to each product underneath
 *   Works with  slow strip of tools people already use
 *   Features    bento cards with small live pictures; each card opens the product it belongs to
 *   Products    four photo cards, each a link to that product
 *   How         photo + three steps
 *   Numbers     dark band with count-up figures
 *   Prices      one card per product, each a link
 *   Call        violet band with the main call to action
 *   Footer
 *
 * Styling: Tailwind classes plus the "lp-" classes in globals.css (section "Landing pages").
 * Colours are fixed hex values so the page looks the same in light and dark mode.
 * The moving parts live in components/landing/fx.tsx; the page reads fine without them.
 */

export const metadata: Metadata = {
  title: { absolute: "Workbase: one home for your team's work, meetings, bookings and forms" },
  description:
    "Workbase tracks time and work for remote teams. Meet runs video calls, Book takes paid bookings and Forms collects answers and payments. Made in Lagos, priced in naira.",
  openGraph: {
    title: "Workbase: one home for your team's work, meetings, bookings and forms",
    description: "Time and work, video calls, paid bookings and forms. One account, priced in naira.",
    type: "website",
  },
};

export default function ParentHome() {
  /* Each product lives on its own address. Without one configured (local development) the
   * link falls back to the same app's path, so every link still works. */
  const app = appUrl() || "";
  const LINKS = {
    workbase: app || "/",
    meet: process.env.NEXT_PUBLIC_MEET_URL || "/meet",
    book: process.env.NEXT_PUBLIC_BOOK_URL || "/book",
    forms: process.env.NEXT_PUBLIC_FORMS_URL || "/forms",
  };
  const login = `${app}/login`;
  const signup = `${app}/signup`;

  return (
    <div className="lp min-h-screen overflow-x-clip">
      <LandingSprite />
      {/* ============================ Header ============================ */}
      <header className="sticky top-0 z-50 border-b border-[#ecebf3] bg-white/80 backdrop-blur-md" style={{"top": "env(safe-area-inset-top, 0px)"}}>
        <div className="lp-wrap flex h-16 items-center justify-between gap-6">
          <a href="/" className="flex items-center gap-2" aria-label="Workbase home">
            <svg className="h-8 w-8" viewBox="0 0 48 48"><path d="M9 29V15.5C9 10.8 12.2 8 16.5 8C27 8 36.5 17 41 29Z" fill="#6A4CF5"/><rect x="4" y="32" width="40" height="8" rx="4" fill="#F2A93B"/></svg>
            <span className="text-[1.2rem] font-bold tracking-tight">Workbase</span>
          </a>
          <nav className="hidden items-center gap-1 text-[0.9rem] font-medium text-[#4a4766] md:flex" aria-label="Main">
            <div className="lp-has-menu relative">
              <button className="flex items-center gap-1 rounded-lg px-3 py-2 hover:bg-[#f7f6fb] hover:text-[#15123a]">Products <svg className="lp-i h-4 w-4"><use href="#i-chev"/></svg></button>
              <div className="lp-menu absolute left-1/2 top-full w-[34rem] -translate-x-1/2 pt-2">
                <div className="grid grid-cols-2 gap-1 rounded-2xl border border-[#ecebf3] bg-white p-2 shadow-[0_24px_60px_-20px_rgba(21,18,58,0.3)]">
                  <a href={LINKS.workbase} className="group flex gap-3 rounded-xl p-3 hover:bg-[#f7f6fb]"><svg className="h-10 w-10 shrink-0 transition duration-500 group-hover:-rotate-6 group-hover:scale-110"><use href="#m-workbase"/></svg><span><span className="block font-semibold text-[#15123a]">Workbase</span><span className="block text-[0.82rem] text-[#6f6b8a]">Time, tasks, leave and payroll</span></span></a>
                  <a href={LINKS.meet} className="group flex gap-3 rounded-xl p-3 hover:bg-[#f7f6fb]"><svg className="h-10 w-10 shrink-0 transition duration-500 group-hover:-rotate-6 group-hover:scale-110"><use href="#m-meet"/></svg><span><span className="block font-semibold text-[#15123a]">Meet</span><span className="block text-[0.82rem] text-[#6f6b8a]">Video calls, guests by link</span></span></a>
                  <a href={LINKS.book} className="group flex gap-3 rounded-xl p-3 hover:bg-[#f7f6fb]"><svg className="h-10 w-10 shrink-0 transition duration-500 group-hover:-rotate-6 group-hover:scale-110"><use href="#m-book"/></svg><span><span className="block font-semibold text-[#15123a]">Book</span><span className="block text-[0.82rem] text-[#6f6b8a]">Booking pages that get paid</span></span></a>
                  <a href={LINKS.forms} className="group flex gap-3 rounded-xl p-3 hover:bg-[#f7f6fb]"><svg className="h-10 w-10 shrink-0 transition duration-500 group-hover:-rotate-6 group-hover:scale-110"><use href="#m-forms"/></svg><span><span className="block font-semibold text-[#15123a]">Forms</span><span className="block text-[0.82rem] text-[#6f6b8a]">Forms that take payment</span></span></a>
                </div>
              </div>
            </div>
            <a href="#features" className="rounded-lg px-3 py-2 hover:bg-[#f7f6fb] hover:text-[#15123a]">Features</a>
            <a href="#how" className="rounded-lg px-3 py-2 hover:bg-[#f7f6fb] hover:text-[#15123a]">How it works</a>
            <a href="#prices" className="rounded-lg px-3 py-2 hover:bg-[#f7f6fb] hover:text-[#15123a]">Pricing</a>
          </nav>
          <div className="flex items-center gap-2">
            <a href={login} className="hidden rounded-lg px-3 py-2 text-[0.9rem] font-medium text-[#4a4766] hover:text-[#15123a] sm:block">Log in</a>
            <a href={signup} className="lp-btn lp-btn-main !py-2 !text-[0.875rem]">Start free</a>
          </div>
        </div>
      </header>

      <main>
      {/* ============================ Hero ============================ */}
      <section id="lp-hero" className="relative overflow-hidden">
        <div className="lp-grid-bg pointer-events-none absolute inset-0" aria-hidden="true"></div>
        <div className="lp-spot pointer-events-none absolute inset-0" aria-hidden="true"></div>

        <div className="lp-wrap relative pt-16 text-center sm:pt-20">
          <h1 className="mx-auto max-w-3xl text-[2.35rem] font-semibold leading-[1.1] sm:text-5xl lg:text-[3.5rem]">
            One home for your team's
            <span className="lp-rot text-[#6a4cf5]" id="lp-rot"><span data-s="in">work</span><span data-s="wait">meetings</span><span data-s="wait">bookings</span><span data-s="wait">forms</span></span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[1.05rem] leading-relaxed text-[#5d5a78] sm:text-lg">
            Track your team's day, meet anyone by link, take paid bookings and collect forms. One account, priced in naira.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href={signup} className="lp-btn lp-btn-main">Create a free account <svg className="lp-i h-4 w-4"><use href="#i-arrow"/></svg></a>
            <a href="#products" className="lp-btn lp-btn-ghost">See the products</a>
          </div>
          <div className="mt-7 flex items-center justify-center gap-3 text-[0.85rem] text-[#6f6b8a]">
            <span className="flex -space-x-2">
              <img className="h-7 w-7 rounded-full border-2 border-white object-cover" src="https://images.unsplash.com/photo-1604933762021-54a5858c9832?w=80&h=80&fit=crop&auto=format" alt="" />
              <img className="h-7 w-7 rounded-full border-2 border-white object-cover" src="https://images.unsplash.com/photo-1594077810908-9ffd89d704ac?w=80&h=80&fit=crop&auto=format" alt="" />
              <img className="h-7 w-7 rounded-full border-2 border-white object-cover" src="https://images.unsplash.com/photo-1573878414075-be35f08479e5?w=80&h=80&fit=crop&auto=format" alt="" />
              <img className="h-7 w-7 rounded-full border-2 border-white object-cover" src="https://images.unsplash.com/photo-1612299273045-362a39972259?w=80&h=80&fit=crop&auto=format" alt="" />
            </span>
            Free for up to 3 people. No card needed.
          </div>
        </div>

        {/* Product stage: a dark app window that cycles through the four products */}
        <div className="lp-wrap relative mt-14 pb-20 sm:pb-24">
          <div id="lp-stage" className="relative mx-auto max-w-5xl">
            {/* Floating toasts around the window */}
            <div className="lp-toast lp-float absolute -left-6 top-24 z-20 hidden w-60 items-center gap-3 rounded-2xl border border-[#ecebf3] bg-white p-3 shadow-[0_20px_50px_-20px_rgba(21,18,58,0.35)] lg:flex" data-on="1" data-t="0">
              <img className="h-9 w-9 rounded-full object-cover" src="https://images.unsplash.com/photo-1604933762021-54a5858c9832?w=80&h=80&fit=crop&auto=format" alt="" />
              <span className="text-left text-[0.82rem] leading-snug"><b className="block text-[#15123a]">Adaeze clocked in</b><span className="text-[#6f6b8a]">Lagos · 8:58 am</span></span>
            </div>
            <div className="lp-toast lp-float absolute -right-8 top-10 z-20 hidden w-60 items-center gap-3 rounded-2xl border border-[#ecebf3] bg-white p-3 shadow-[0_20px_50px_-20px_rgba(21,18,58,0.35)] lg:flex" data-on="0" data-t="1" style={{"animationDelay": "-2s"}}>
              <svg className="h-9 w-9 shrink-0"><use href="#m-book"/></svg>
              <span className="text-left text-[0.82rem] leading-snug"><b className="block text-[#15123a]">Deposit received</b><span className="text-[#6f6b8a]">₦5,000 · Strategy call</span></span>
            </div>
            <div className="lp-toast lp-float absolute -right-6 bottom-24 z-20 hidden w-64 items-center gap-3 rounded-2xl border border-[#ecebf3] bg-white p-3 shadow-[0_20px_50px_-20px_rgba(21,18,58,0.35)] lg:flex" data-on="0" data-t="2" style={{"animationDelay": "-4s"}}>
              <svg className="h-9 w-9 shrink-0"><use href="#m-forms"/></svg>
              <span className="text-left text-[0.82rem] leading-snug"><b className="block text-[#15123a]">New paid sign-up</b><span className="text-[#6f6b8a]">Tech &amp; Tides · VIP ticket</span></span>
            </div>
            <div className="lp-toast lp-float absolute -left-8 bottom-16 z-20 hidden w-64 items-center gap-3 rounded-2xl border border-[#ecebf3] bg-white p-3 shadow-[0_20px_50px_-20px_rgba(21,18,58,0.35)] lg:flex" data-on="0" data-t="3" style={{"animationDelay": "-3s"}}>
              <img className="h-9 w-9 rounded-full object-cover" src="https://images.unsplash.com/photo-1612299273045-362a39972259?w=80&h=80&fit=crop&auto=format" alt="" />
              <span className="text-left text-[0.82rem] leading-snug"><b className="block text-[#15123a]">Femi started a meeting</b><span className="text-[#6f6b8a]">Weekly planning · 4 joined</span></span>
            </div>

            <div className="absolute -inset-x-10 -bottom-10 top-10 -z-10 rounded-[3rem] bg-[radial-gradient(60%_60%_at_50%_40%,rgba(106,76,245,0.25),transparent_70%)] blur-2xl" aria-hidden="true"></div>

            <div className="overflow-hidden rounded-2xl bg-[#100d2b] shadow-[0_40px_100px_-40px_rgba(21,18,58,0.7)] ring-1 ring-black/5">
              {/* Window bar with product tabs */}
              <div className="flex items-center gap-4 border-b border-white/10 px-4">
                <span className="flex gap-1.5 py-4" aria-hidden="true"><i className="h-2.5 w-2.5 rounded-full bg-white/20"></i><i className="h-2.5 w-2.5 rounded-full bg-white/20"></i><i className="h-2.5 w-2.5 rounded-full bg-white/20"></i></span>
                <div role="tablist" aria-label="Products" className="flex gap-1 overflow-x-auto text-[0.85rem] font-medium text-white/50 [scrollbar-width:none]" id="lp-tabs">
                  <button role="tab" className="lp-tab flex items-center gap-2 whitespace-nowrap px-3 py-4 transition hover:text-white" aria-selected="true" data-p="0"><svg className="h-5 w-5"><use href="#m-workbase"/></svg>Workbase<span className="lp-bar"></span></button>
                  <button role="tab" className="lp-tab flex items-center gap-2 whitespace-nowrap px-3 py-4 transition hover:text-white" aria-selected="false" data-p="1"><svg className="h-5 w-5"><use href="#m-meet"/></svg>Meet<span className="lp-bar"></span></button>
                  <button role="tab" className="lp-tab flex items-center gap-2 whitespace-nowrap px-3 py-4 transition hover:text-white" aria-selected="false" data-p="2"><svg className="h-5 w-5"><use href="#m-book"/></svg>Book<span className="lp-bar"></span></button>
                  <button role="tab" className="lp-tab flex items-center gap-2 whitespace-nowrap px-3 py-4 transition hover:text-white" aria-selected="false" data-p="3"><svg className="h-5 w-5"><use href="#m-forms"/></svg>Forms<span className="lp-bar"></span></button>
                </div>
              </div>

              <div className="relative h-[25rem] sm:h-[23rem]" id="lp-screens">
                {/* Workbase */}
                <div className="lp-screen absolute inset-0 grid gap-4 p-5 text-left text-white sm:grid-cols-[1fr_15rem] sm:p-6" data-s="0">
                  <div className="rounded-xl bg-white/[0.04] p-4 ring-1 ring-white/10">
                    <div className="flex items-center justify-between"><b className="text-[0.95rem]">Team today</b><span className="flex items-center gap-1.5 text-[0.75rem] text-white/60"><i className="lp-blink h-1.5 w-1.5 rounded-full bg-emerald-400"></i>3 working now</span></div>
                    <ul className="mt-4 space-y-3" id="lp-team"><li className="grid grid-cols-[2rem_7.5rem_1fr] items-center gap-3"><img className="h-8 w-8 rounded-full object-cover" src="https://images.unsplash.com/photo-1604933762021-54a5858c9832?w=64&h=64&fit=crop&auto=format" alt="" /><span className="min-w-0"><b className="block truncate text-[0.82rem]">Adaeze Okafor</b><span className="text-[0.72rem] text-white/50">Lagos</span></span><span className="flex h-7 items-end gap-[3px]"><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "72%", "animationDelay": "0ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "81%", "animationDelay": "25ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "64%", "animationDelay": "50ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "90%", "animationDelay": "75ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "77%", "animationDelay": "100ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "58%", "animationDelay": "125ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "66%", "animationDelay": "175ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "85%", "animationDelay": "200ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "92%", "animationDelay": "225ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "74%", "animationDelay": "250ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "69%", "animationDelay": "275ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "88%", "animationDelay": "300ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "79%", "animationDelay": "325ms"}}></span></span></span></li><li className="grid grid-cols-[2rem_7.5rem_1fr] items-center gap-3"><img className="h-8 w-8 rounded-full object-cover" src="https://images.unsplash.com/photo-1594077810908-9ffd89d704ac?w=64&h=64&fit=crop&auto=format" alt="" /><span className="min-w-0"><b className="block truncate text-[0.82rem]">Tunde Bakare</b><span className="text-[0.72rem] text-white/50">Accra</span></span><span className="flex h-7 items-end gap-[3px]"><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "55%", "animationDelay": "115ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "61%", "animationDelay": "140ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "48%", "animationDelay": "165ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "70%", "animationDelay": "190ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "66%", "animationDelay": "215ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "52%", "animationDelay": "240ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "44%", "animationDelay": "265ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "63%", "animationDelay": "290ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-marigold-500" style={{"height": "38%", "animationDelay": "315ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-marigold-500" style={{"height": "22%", "animationDelay": "340ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "47%", "animationDelay": "365ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-marigold-500" style={{"height": "30%", "animationDelay": "390ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-marigold-500" style={{"height": "18%", "animationDelay": "415ms"}}></span></span></span></li><li className="grid grid-cols-[2rem_7.5rem_1fr] items-center gap-3"><img className="h-8 w-8 rounded-full object-cover" src="https://images.unsplash.com/photo-1573878414075-be35f08479e5?w=64&h=64&fit=crop&auto=format" alt="" /><span className="min-w-0"><b className="block truncate text-[0.82rem]">Chiamaka Eze</b><span className="text-[0.72rem] text-white/50">Nairobi</span></span><span className="flex h-7 items-end gap-[3px]"><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "84%", "animationDelay": "180ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "79%", "animationDelay": "205ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "91%", "animationDelay": "230ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "88%", "animationDelay": "255ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "73%", "animationDelay": "330ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "80%", "animationDelay": "355ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "86%", "animationDelay": "380ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "77%", "animationDelay": "405ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "90%", "animationDelay": "430ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "82%", "animationDelay": "455ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "75%", "animationDelay": "480ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "87%", "animationDelay": "505ms"}}></span></span></span></li><li className="grid grid-cols-[2rem_7.5rem_1fr] items-center gap-3"><img className="h-8 w-8 rounded-full object-cover" src="https://images.unsplash.com/photo-1612299273045-362a39972259?w=64&h=64&fit=crop&auto=format" alt="" /><span className="min-w-0"><b className="block truncate text-[0.82rem]">Ifeanyi Nwosu</b><span className="text-[0.72rem] text-white/50">London</span></span><span className="flex h-7 items-end gap-[3px]"><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "60%", "animationDelay": "270ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "66%", "animationDelay": "295ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "70%", "animationDelay": "320ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "58%", "animationDelay": "345ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "75%", "animationDelay": "370ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "80%", "animationDelay": "395ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "62%", "animationDelay": "495ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "71%", "animationDelay": "520ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "69%", "animationDelay": "545ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "74%", "animationDelay": "570ms"}}></span></span><span className="flex h-full flex-1 items-end rounded-[2px] bg-white/5"><span className="lp-grow block w-full rounded-[2px] bg-[#7c5cff]" style={{"height": "81%", "animationDelay": "595ms"}}></span></span></span></li></ul>
                  </div>
                  <div className="hidden flex-col gap-4 sm:flex">
                    <div className="rounded-xl bg-white/[0.04] p-4 ring-1 ring-white/10">
                      <span className="text-[0.75rem] text-white/60">Hours this week</span>
                      <b className="mt-1 block text-2xl font-semibold tabular-nums">186h 40m</b>
                      <div className="mt-3 flex h-14 items-end gap-1.5" id="lp-week"><span className="lp-grow flex-1 rounded-t bg-[#7c5cff]/80" style={{"height": "62%", "animationDelay": "0ms"}}></span><span className="lp-grow flex-1 rounded-t bg-[#7c5cff]/80" style={{"height": "80%", "animationDelay": "60ms"}}></span><span className="lp-grow flex-1 rounded-t bg-[#7c5cff]/80" style={{"height": "74%", "animationDelay": "120ms"}}></span><span className="lp-grow flex-1 rounded-t bg-[#7c5cff]/80" style={{"height": "90%", "animationDelay": "180ms"}}></span><span className="lp-grow flex-1 rounded-t bg-[#7c5cff]/80" style={{"height": "68%", "animationDelay": "240ms"}}></span><span className="lp-grow flex-1 rounded-t bg-[#7c5cff]/80" style={{"height": "30%", "animationDelay": "300ms"}}></span><span className="lp-grow flex-1 rounded-t bg-[#7c5cff]/80" style={{"height": "12%", "animationDelay": "360ms"}}></span></div>
                    </div>
                    <div className="flex-1 rounded-xl bg-white/[0.04] p-4 ring-1 ring-white/10">
                      <span className="text-[0.75rem] text-white/60">Tasks done today</span>
                      <ul className="mt-2 space-y-2 text-[0.8rem]">
                        <li className="flex items-center gap-2"><svg className="lp-i h-4 w-4 text-emerald-400"><use href="#i-check"/></svg>Invoice page redesign</li>
                        <li className="flex items-center gap-2"><svg className="lp-i h-4 w-4 text-emerald-400"><use href="#i-check"/></svg>Client onboarding call</li>
                        <li className="flex items-center gap-2 text-white/50"><svg className="lp-i h-4 w-4"><use href="#i-clock"/></svg>Payroll for November</li>
                      </ul>
                    </div>
                  </div>
                </div>
                {/* Meet */}
                <div className="lp-screen absolute inset-0 flex flex-col p-5 text-white sm:p-6" data-s="1" hidden>
                  <div className="flex items-center justify-between text-[0.8rem] text-white/60"><b className="text-white">Weekly planning</b><span className="flex items-center gap-1.5 rounded-md bg-red-500/15 px-2 py-0.5 font-medium text-red-300"><i className="lp-blink h-1.5 w-1.5 rounded-full bg-red-400"></i>Rec 12:08</span></div>
                  <div className="mt-3 grid flex-1 grid-cols-2 gap-2.5 sm:grid-cols-3">
                    <div className="relative col-span-2 row-span-2 overflow-hidden rounded-xl"><img className="h-full w-full object-cover" src="https://images.unsplash.com/photo-1612299273045-362a39972259?w=640&h=420&fit=crop&auto=format" alt="Femi speaking in the meeting" /><span className="absolute bottom-2 left-2 rounded-md bg-black/50 px-2 py-0.5 text-[0.72rem] backdrop-blur">Femi</span><span className="lp-ring absolute inset-0 rounded-xl"></span><span className="lp-rise absolute bottom-10 right-6 text-lg" aria-hidden="true"><svg className="lp-i h-6 w-6 text-marigold-400" style={{"fill": "#f2a93b"}}><use href="#i-check"/></svg></span></div>
                    <div className="relative hidden overflow-hidden rounded-xl sm:block"><img className="h-full w-full object-cover" src="https://images.unsplash.com/photo-1604933762021-54a5858c9832?w=320&h=220&fit=crop&auto=format" alt="Bisi in the meeting" /><span className="absolute bottom-2 left-2 rounded-md bg-black/50 px-2 py-0.5 text-[0.72rem] backdrop-blur">Bisi (guest)</span></div>
                    <div className="relative hidden overflow-hidden rounded-xl sm:block"><img className="h-full w-full object-cover" src="https://images.unsplash.com/photo-1594077810908-9ffd89d704ac?w=320&h=220&fit=crop&auto=format" alt="Ifeanyi in the meeting" /><span className="absolute bottom-2 left-2 rounded-md bg-black/50 px-2 py-0.5 text-[0.72rem] backdrop-blur">Ifeanyi</span></div>
                  </div>
                  <div className="mt-3 flex justify-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10"><svg className="lp-i h-4 w-4"><use href="#i-mic"/></svg></span>
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10"><svg className="lp-i h-4 w-4"><use href="#i-video"/></svg></span>
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10"><svg className="lp-i h-4 w-4"><use href="#i-share"/></svg></span>
                    <span className="flex h-9 w-12 items-center justify-center rounded-full bg-red-500 text-[0.75rem] font-semibold">End</span>
                  </div>
                </div>
                {/* Book */}
                <div className="lp-screen absolute inset-0 grid gap-5 p-5 text-left text-white sm:grid-cols-[13rem_1fr_10rem] sm:p-6" data-s="2" hidden>
                  <div className="hidden sm:block">
                    <img className="h-16 w-16 rounded-2xl object-cover" src="https://images.unsplash.com/photo-1512864084360-7c0c4d0a0845?w=160&h=160&fit=crop&auto=format" alt="Barber at work" />
                    <b className="mt-3 block">Kola's Cuts</b>
                    <span className="text-[0.8rem] text-white/60">Lekki Phase 1</span>
                    <div className="mt-4 space-y-2 text-[0.8rem]">
                      <div className="rounded-lg bg-[#6a4cf5] px-3 py-2">Haircut · 45 min · ₦8,000</div>
                      <div className="rounded-lg bg-white/5 px-3 py-2 text-white/70">Beard trim · 20 min · ₦3,000</div>
                    </div>
                  </div>
                  <div>
                    <b className="text-[0.9rem]">December</b>
                    <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[0.72rem]" id="lp-cal"><span  data-k="h0" className="text-white/40">M</span><span  data-k="h1" className="text-white/40">T</span><span  data-k="h2" className="text-white/40">W</span><span  data-k="h3" className="text-white/40">T</span><span  data-k="h4" className="text-white/40">F</span><span  data-k="h5" className="text-white/40">S</span><span  data-k="h6" className="text-white/40">S</span><span className="flex aspect-square items-center justify-center rounded-md text-white/25">1</span><span className="flex aspect-square items-center justify-center rounded-md text-white/25">2</span><span className="flex aspect-square items-center justify-center rounded-md bg-white/10">3</span><span className="flex aspect-square items-center justify-center rounded-md bg-white/10">4</span><span className="flex aspect-square items-center justify-center rounded-md bg-white/10">5</span><span className="flex aspect-square items-center justify-center rounded-md text-white/25">6</span><span className="flex aspect-square items-center justify-center rounded-md text-white/25">7</span><span className="flex aspect-square items-center justify-center rounded-md text-white/25">8</span><span className="flex aspect-square items-center justify-center rounded-md bg-white/10">9</span><span className="flex aspect-square items-center justify-center rounded-md bg-white/10">10</span><span className="flex aspect-square items-center justify-center rounded-md bg-[#6a4cf5] font-semibold">11</span><span className="flex aspect-square items-center justify-center rounded-md bg-white/10">12</span><span className="flex aspect-square items-center justify-center rounded-md text-white/25">13</span><span className="flex aspect-square items-center justify-center rounded-md text-white/25">14</span><span className="flex aspect-square items-center justify-center rounded-md text-white/25">15</span><span className="flex aspect-square items-center justify-center rounded-md bg-white/10">16</span><span className="flex aspect-square items-center justify-center rounded-md bg-white/10">17</span><span className="flex aspect-square items-center justify-center rounded-md bg-white/10">18</span><span className="flex aspect-square items-center justify-center rounded-md bg-white/10">19</span><span className="flex aspect-square items-center justify-center rounded-md text-white/25">20</span><span className="flex aspect-square items-center justify-center rounded-md text-white/25">21</span><span className="flex aspect-square items-center justify-center rounded-md text-white/25">22</span><span className="flex aspect-square items-center justify-center rounded-md bg-white/10">23</span><span className="flex aspect-square items-center justify-center rounded-md bg-white/10">24</span><span className="flex aspect-square items-center justify-center rounded-md text-white/25">25</span><span className="flex aspect-square items-center justify-center rounded-md text-white/25">26</span><span className="flex aspect-square items-center justify-center rounded-md text-white/25">27</span><span className="flex aspect-square items-center justify-center rounded-md text-white/25">28</span></div>
                  </div>
                  <div className="flex flex-col gap-1.5 text-[0.8rem]">
                    <span className="mb-1 text-white/60">Thu 11 Dec</span>
                    <span className="rounded-lg bg-white/5 px-3 py-1.5 text-center">09:00</span>
                    <span className="rounded-lg bg-white/5 px-3 py-1.5 text-center">10:30</span>
                    <span className="lp-blink rounded-lg bg-[#6a4cf5] px-3 py-1.5 text-center font-semibold">13:00</span>
                    <span className="rounded-lg bg-white/5 px-3 py-1.5 text-center">15:30</span>
                    <span className="mt-auto rounded-lg bg-marigold-400 px-3 py-2 text-center font-semibold text-[#15123a]">Pay ₦4,000 deposit</span>
                  </div>
                </div>
                {/* Forms */}
                <div className="lp-screen absolute inset-0 grid gap-5 p-5 text-left text-white sm:grid-cols-[1fr_16rem] sm:p-6" data-s="3" hidden>
                  <div className="rounded-xl bg-white p-5 text-[#15123a]">
                    <b>Tech &amp; Tides 2027 tickets</b>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#ecebf3]"><span className="block h-full w-2/3 rounded-full bg-[#6a4cf5]"></span></div>
                    <label className="mt-4 block text-[0.78rem] font-medium text-[#5d5a78]">Full name</label>
                    <div className="mt-1 flex h-9 items-center rounded-lg border border-[#e4e1f0] px-3 text-[0.9rem]">Ngozi Adebayo<i className="lp-blink ml-px h-4 w-px bg-[#15123a]"></i></div>
                    <label className="mt-3 block text-[0.78rem] font-medium text-[#5d5a78]">Ticket</label>
                    <div className="mt-1 grid grid-cols-2 gap-2 text-[0.85rem]">
                      <span className="rounded-lg border border-[#e4e1f0] px-3 py-2">Regular · ₦5,000</span>
                      <span className="rounded-lg border border-[#6a4cf5] bg-[#f3f0ff] px-3 py-2 font-medium">VIP · ₦12,000</span>
                    </div>
                    <span className="mt-4 flex items-center justify-between rounded-lg bg-[#15123a] px-3 py-2.5 text-[0.85rem] font-semibold text-white">Pay and send <span>₦12,000</span></span>
                  </div>
                  <div className="hidden rounded-xl bg-white/[0.04] p-4 ring-1 ring-white/10 sm:block">
                    <span className="text-[0.75rem] text-white/60">Answers</span>
                    <b className="mt-1 block text-2xl font-semibold tabular-nums">248</b>
                    <ul className="mt-3 space-y-2 text-[0.8rem]">
                      <li className="flex justify-between"><span>Ngozi A.</span><span className="text-emerald-300">Paid</span></li>
                      <li className="flex justify-between"><span>Tobi O.</span><span className="text-emerald-300">Paid</span></li>
                      <li className="flex justify-between"><span>Amaka E.</span><span className="text-white/50">Waiting</span></li>
                      <li className="flex justify-between"><span>Segun B.</span><span className="text-emerald-300">Paid</span></li>
                    </ul>
                    <span className="mt-4 block text-[0.75rem] text-white/50">Synced to Google Sheets</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-[0.88rem] font-medium">
              <span className="mr-1 text-[#6f6b8a]">Open</span>
              <a href={LINKS.workbase} className="group inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-2 ring-1 ring-[#ecebf3] transition hover:-translate-y-0.5 hover:ring-[#c9c2ec]"><svg className="h-5 w-5 transition duration-500 group-hover:-rotate-6"><use href="#m-workbase"/></svg>Workbase</a>
              <a href={LINKS.meet} className="group inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-2 ring-1 ring-[#ecebf3] transition hover:-translate-y-0.5 hover:ring-[#c9c2ec]"><svg className="h-5 w-5 transition duration-500 group-hover:-rotate-6"><use href="#m-meet"/></svg>Meet</a>
              <a href={LINKS.book} className="group inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-2 ring-1 ring-[#ecebf3] transition hover:-translate-y-0.5 hover:ring-[#c9c2ec]"><svg className="h-5 w-5 transition duration-500 group-hover:-rotate-6"><use href="#m-book"/></svg>Book</a>
              <a href={LINKS.forms} className="group inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-2 ring-1 ring-[#ecebf3] transition hover:-translate-y-0.5 hover:ring-[#c9c2ec]"><svg className="h-5 w-5 transition duration-500 group-hover:-rotate-6"><use href="#m-forms"/></svg>Forms</a>
            </div>
          </div>
        </div>
      </section>

      {/* ============================ Works with ============================ */}
      <section className="border-y border-[#ecebf3] bg-[#f7f6fb] py-6">
        <div className="lp-wrap flex flex-col items-center gap-4 md:flex-row md:gap-10">
          <p className="shrink-0 text-[0.85rem] font-medium text-[#6f6b8a]">Works with the tools you already use</p>
          <div className="lp-marquee w-full overflow-hidden">
            <div className="lp-track gap-12 text-[1.05rem] font-semibold text-[#9a97b3]">
              <span>Paystack</span><span>Google Sheets</span><span>WhatsApp</span><span>WordPress</span><span>Windows</span><span>Google Calendar</span><span>Wix</span><span>Shopify</span><span>Outlook</span>
              <span>Paystack</span><span>Google Sheets</span><span>WhatsApp</span><span>WordPress</span><span>Windows</span><span>Google Calendar</span><span>Wix</span><span>Shopify</span><span>Outlook</span>
            </div>
          </div>
        </div>
      </section>

      {/* ============================ What you can do ============================ */}
      <section id="features" className="py-20 sm:py-24">
        <div className="lp-wrap">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold sm:text-[2.5rem] sm:leading-[1.15]">Everything your team does in a day</h2>
            <p className="mt-4 text-[1.05rem] text-[#5d5a78]">From the first clock-in to the last payslip, without five different apps.</p>
          </div>
          <div className="mt-12 grid gap-4 lg:grid-cols-3" id="lp-fgrid">

            {/* Clock in: live timer on a laptop and a phone */}
            <a href={LINKS.workbase} className="lp-fcard flex flex-col rounded-3xl border border-[#ecebf3] bg-white lg:col-span-2">
              <div className="relative h-44 overflow-hidden rounded-t-3xl bg-gradient-to-br from-[#f3f0ff] to-[#fdf6ea]">
                <div className="absolute left-6 top-6 w-56 rounded-2xl bg-white p-4 shadow-[0_14px_34px_-18px_rgba(21,18,58,0.4)] ring-1 ring-[#ecebf3]">
                  <span className="flex items-center gap-1.5 text-[0.75rem] font-semibold text-emerald-700"><i className="lp-blink h-1.5 w-1.5 rounded-full bg-emerald-500"></i>Clocked in on desktop</span>
                  <b className="mt-1 block text-[1.6rem] font-semibold tabular-nums" id="lp-tick">03:12:44</b>
                  <span className="text-[0.75rem] text-[#6f6b8a]">Working on: Invoice page redesign</span>
                </div>
                <div className="lp-float absolute right-8 top-5 w-36 rounded-[1.4rem] border-4 border-[#15123a] bg-white p-3 shadow-xl" style={{"animationDelay": "-2s"}}>
                  <span className="block text-[0.68rem] text-[#6f6b8a]">Phone clock-in</span>
                  <b className="mt-0.5 block text-[0.95rem]">Site visit, Ikeja</b>
                  <span className="mt-2 block rounded-lg bg-[#6a4cf5] py-1.5 text-center text-[0.72rem] font-semibold text-white">Clock out</span>
                </div>
                <div className="absolute bottom-4 left-6 right-56 hidden h-8 items-end gap-[3px] sm:flex">
                  <span className="lp-grow flex-1 rounded-sm bg-[#7c5cff]" style={{"height": "60%"}}></span><span className="lp-grow flex-1 rounded-sm bg-[#7c5cff]" style={{"height": "85%", "animationDelay": ".05s"}}></span><span className="lp-grow flex-1 rounded-sm bg-[#7c5cff]" style={{"height": "45%", "animationDelay": ".1s"}}></span><span className="lp-grow flex-1 rounded-sm bg-marigold-500" style={{"height": "25%", "animationDelay": ".15s"}}></span><span className="lp-grow flex-1 rounded-sm bg-[#7c5cff]" style={{"height": "90%", "animationDelay": ".2s"}}></span><span className="lp-grow flex-1 rounded-sm bg-[#7c5cff]" style={{"height": "70%", "animationDelay": ".25s"}}></span><span className="lp-grow flex-1 rounded-sm bg-[#7c5cff]" style={{"height": "80%", "animationDelay": ".3s"}}></span><span className="lp-grow flex-1 rounded-sm bg-[#7c5cff]" style={{"height": "65%", "animationDelay": ".35s"}}></span><span className="lp-grow flex-1 rounded-sm bg-marigold-500" style={{"height": "30%", "animationDelay": ".4s"}}></span><span className="lp-grow flex-1 rounded-sm bg-[#7c5cff]" style={{"height": "95%", "animationDelay": ".45s"}}></span><span className="lp-grow flex-1 rounded-sm bg-[#7c5cff]" style={{"height": "75%", "animationDelay": ".5s"}}></span><span className="lp-grow flex-1 rounded-sm bg-[#7c5cff]" style={{"height": "88%", "animationDelay": ".55s"}}></span>
                </div>
              </div>
              <div className="flex items-start gap-4 p-6"><span className="lp-ico flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f3f0ff] text-[#6a4cf5]"><svg className="lp-i"><use href="#i-clock"/></svg></span><div><h3 className="text-[1.05rem] font-semibold">Clock in from a laptop or a phone</h3><p className="mt-1 text-[0.92rem] leading-relaxed text-[#5d5a78]">Hours and real activity while people are clocked in. Saved on the device when the internet drops.</p></div></div>
            </a>

            {/* Tasks: items tick off one by one */}
            <a href={LINKS.workbase} className="lp-fcard flex flex-col rounded-3xl border border-[#ecebf3] bg-white">
              <div className="h-44 overflow-hidden rounded-t-3xl bg-[#f7f6fb] p-5">
                <ul className="space-y-2 text-[0.82rem]" id="lp-todo">
                  <li className="flex items-center gap-2.5 rounded-xl bg-white px-3 py-2 ring-1 ring-[#ecebf3]"><span className="lp-chk flex h-4 w-4 items-center justify-center rounded-[5px] border-2 border-[#cfc9ea]"></span>Send November invoices</li>
                  <li className="flex items-center gap-2.5 rounded-xl bg-white px-3 py-2 ring-1 ring-[#ecebf3]"><span className="lp-chk flex h-4 w-4 items-center justify-center rounded-[5px] border-2 border-[#cfc9ea]"></span>Fix checkout bug</li>
                  <li className="flex items-center gap-2.5 rounded-xl bg-white px-3 py-2 ring-1 ring-[#ecebf3]"><span className="lp-chk flex h-4 w-4 items-center justify-center rounded-[5px] border-2 border-[#cfc9ea]"></span>Call with Zenith team</li>
                </ul>
              </div>
              <div className="flex items-start gap-4 p-6"><span className="lp-ico flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f3f0ff] text-[#6a4cf5]"><svg className="lp-i"><use href="#i-tasks"/></svg></span><div><h3 className="text-[1.05rem] font-semibold">Tasks and daily reports</h3><p className="mt-1 text-[0.92rem] leading-relaxed text-[#5d5a78]">Time logs to each task. People say what got done at clock-out.</p></div></div>
            </a>

            {/* Meet: the speaker ring moves around the call */}
            <a href={LINKS.meet} className="lp-fcard flex flex-col rounded-3xl border border-[#ecebf3] bg-white">
              <div className="grid h-44 grid-cols-2 gap-1.5 overflow-hidden rounded-t-3xl bg-[#100d2b] p-3" id="lp-callgrid">
                <div className="relative overflow-hidden rounded-xl"><img className="h-full w-full object-cover" src="https://images.unsplash.com/photo-1612299273045-362a39972259?w=240&h=150&fit=crop&auto=format" alt="" /><span className="lp-spk absolute inset-0 rounded-xl ring-2 ring-marigold-400 ring-inset transition-opacity duration-300"></span></div>
                <div className="relative overflow-hidden rounded-xl"><img className="h-full w-full object-cover" src="https://images.unsplash.com/photo-1604933762021-54a5858c9832?w=240&h=150&fit=crop&auto=format" alt="" /><span className="lp-spk absolute inset-0 rounded-xl opacity-0 ring-2 ring-marigold-400 ring-inset transition-opacity duration-300"></span></div>
                <div className="relative overflow-hidden rounded-xl"><img className="h-full w-full object-cover" src="https://images.unsplash.com/photo-1594077810908-9ffd89d704ac?w=240&h=150&fit=crop&auto=format" alt="" /><span className="lp-spk absolute inset-0 rounded-xl opacity-0 ring-2 ring-marigold-400 ring-inset transition-opacity duration-300"></span></div>
                <div className="relative overflow-hidden rounded-xl"><img className="h-full w-full object-cover" src="https://images.unsplash.com/photo-1573878414075-be35f08479e5?w=240&h=150&fit=crop&auto=format" alt="" /><span className="lp-spk absolute inset-0 rounded-xl opacity-0 ring-2 ring-marigold-400 ring-inset transition-opacity duration-300"></span></div>
              </div>
              <div className="flex items-start gap-4 p-6"><span className="lp-ico flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f3f0ff] text-[#6a4cf5]"><svg className="lp-i"><use href="#i-video"/></svg></span><div><h3 className="text-[1.05rem] font-semibold">Meet anyone by link</h3><p className="mt-1 text-[0.92rem] leading-relaxed text-[#5d5a78]">Guests join with their name. Free recording, kept on your device.</p></div></div>
            </a>

            {/* Payroll: a payslip whose numbers add up */}
            <a href={LINKS.workbase} className="lp-fcard flex flex-col rounded-3xl border border-[#ecebf3] bg-white lg:col-span-2">
              <div className="relative h-44 overflow-hidden rounded-t-3xl bg-gradient-to-br from-[#fdf6ea] to-[#f3f0ff]">
                <div className="absolute left-6 top-5 w-72 rounded-2xl bg-white p-4 text-[0.8rem] shadow-[0_14px_34px_-18px_rgba(21,18,58,0.4)] ring-1 ring-[#ecebf3]">
                  <div className="flex items-center justify-between"><b>Payslip · November</b><span className="text-[#6f6b8a]">Chiamaka Eze</span></div>
                  <div className="mt-3 space-y-1.5 tabular-nums">
                    <div className="flex justify-between"><span className="text-[#6f6b8a]">Gross pay</span><span>₦<span data-count="450000">450,000</span></span></div>
                    <div className="flex justify-between"><span className="text-[#6f6b8a]">PAYE</span><span className="text-red-600">−₦<span data-count="51200">51,200</span></span></div>
                    <div className="flex justify-between"><span className="text-[#6f6b8a]">Pension 8%</span><span className="text-red-600">−₦<span data-count="27000">27,000</span></span></div>
                    <div className="flex justify-between border-t border-[#ecebf3] pt-1.5 font-semibold"><span>Net pay</span><span className="text-emerald-700">₦<span data-count="371800">371,800</span></span></div>
                  </div>
                </div>
                <div className="lp-float absolute right-8 top-10 hidden w-48 rounded-2xl bg-[#15123a] p-4 text-white shadow-xl sm:block">
                  <span className="text-[0.72rem] text-white/60">Emailed to 12 people</span>
                  <b className="mt-1 block">Payslips sent</b>
                  <span className="mt-2 flex -space-x-2"><img className="h-6 w-6 rounded-full border-2 border-[#15123a] object-cover" src="https://images.unsplash.com/photo-1604933762021-54a5858c9832?w=60&h=60&fit=crop&auto=format" alt="" /><img className="h-6 w-6 rounded-full border-2 border-[#15123a] object-cover" src="https://images.unsplash.com/photo-1594077810908-9ffd89d704ac?w=60&h=60&fit=crop&auto=format" alt="" /><img className="h-6 w-6 rounded-full border-2 border-[#15123a] object-cover" src="https://images.unsplash.com/photo-1573878414075-be35f08479e5?w=60&h=60&fit=crop&auto=format" alt="" /></span>
                </div>
              </div>
              <div className="flex items-start gap-4 p-6"><span className="lp-ico flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f3f0ff] text-[#6a4cf5]"><svg className="lp-i"><use href="#i-wallet"/></svg></span><div><h3 className="text-[1.05rem] font-semibold">Nigerian payroll and payslips</h3><p className="mt-1 text-[0.92rem] leading-relaxed text-[#5d5a78]">PAYE, pension and NHF worked out from hours and leave. A PDF payslip lands in each inbox.</p></div></div>
            </a>

            {/* Bookings: the picked slot moves */}
            <a href={LINKS.book} className="lp-fcard flex flex-col rounded-3xl border border-[#ecebf3] bg-white">
              <div className="h-44 overflow-hidden rounded-t-3xl bg-[#f7f6fb] p-5">
                <span className="text-[0.78rem] font-semibold">Thu 11 Dec · Haircut</span>
                <div className="mt-3 grid grid-cols-3 gap-2 text-[0.8rem]" id="lp-slots">
                  <span className="lp-slot rounded-lg bg-white py-2 text-center ring-1 ring-[#ecebf3] transition">09:00</span><span className="lp-slot rounded-lg bg-white py-2 text-center ring-1 ring-[#ecebf3] transition">10:30</span><span className="lp-slot rounded-lg bg-white py-2 text-center ring-1 ring-[#ecebf3] transition">12:00</span>
                  <span className="lp-slot rounded-lg bg-white py-2 text-center ring-1 ring-[#ecebf3] transition">13:30</span><span className="lp-slot rounded-lg bg-white py-2 text-center ring-1 ring-[#ecebf3] transition">15:00</span><span className="lp-slot rounded-lg bg-white py-2 text-center ring-1 ring-[#ecebf3] transition">16:30</span>
                </div>
                <span className="mt-3 block rounded-lg bg-marigold-400 py-2 text-center text-[0.8rem] font-semibold">Pay ₦4,000 deposit</span>
              </div>
              <div className="flex items-start gap-4 p-6"><span className="lp-ico flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f3f0ff] text-[#6a4cf5]"><svg className="lp-i"><use href="#i-calendar"/></svg></span><div><h3 className="text-[1.05rem] font-semibold">Bookings with deposits</h3><p className="mt-1 text-[0.92rem] leading-relaxed text-[#5d5a78]">Customers pay upfront. Reminders cut the no-shows.</p></div></div>
            </a>

            {/* Forms: the total changes as options are picked */}
            <a href={LINKS.forms} className="lp-fcard flex flex-col rounded-3xl border border-[#ecebf3] bg-white">
              <div className="h-44 overflow-hidden rounded-t-3xl bg-[#f7f6fb] p-5 text-[0.8rem]">
                <div className="space-y-2" id="lp-opts">
                  <span className="lp-opt flex items-center justify-between rounded-lg bg-white px-3 py-2 ring-1 ring-[#ecebf3] transition">T-shirt <b>₦5,000</b></span>
                  <span className="lp-opt flex items-center justify-between rounded-lg bg-white px-3 py-2 ring-1 ring-[#ecebf3] transition">Lunch <b>₦3,500</b></span>
                </div>
                <span className="mt-3 flex items-center justify-between rounded-lg bg-[#15123a] px-3 py-2 font-semibold text-white">Total <span id="lp-total">₦0</span></span>
              </div>
              <div className="flex items-start gap-4 p-6"><span className="lp-ico flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f3f0ff] text-[#6a4cf5]"><svg className="lp-i"><use href="#i-receipt"/></svg></span><div><h3 className="text-[1.05rem] font-semibold">Forms that collect money</h3><p className="mt-1 text-[0.92rem] leading-relaxed text-[#5d5a78]">Prices on any option. Answers go to your inbox and Google Sheets.</p></div></div>
            </a>

            {/* Leave: days off fill in on a strip */}
            <a href={LINKS.workbase} className="lp-fcard flex flex-col rounded-3xl border border-[#ecebf3] bg-white">
              <div className="h-44 overflow-hidden rounded-t-3xl bg-[#f7f6fb] p-5 text-[0.8rem]">
                <div className="flex items-center justify-between"><b>Annual leave</b><span className="text-[#6f6b8a]">14 of 20 days left</span></div>
                <div className="mt-3 grid grid-cols-7 gap-1.5 text-center text-[0.72rem]">
                  <span className="rounded-md bg-white py-1.5 ring-1 ring-[#ecebf3]">22</span><span className="rounded-md bg-white py-1.5 ring-1 ring-[#ecebf3]">23</span><span className="rounded-md bg-[#6a4cf5] py-1.5 font-semibold text-white">24</span><span className="rounded-md bg-marigold-400 py-1.5 font-semibold">25</span><span className="rounded-md bg-marigold-400 py-1.5 font-semibold">26</span><span className="rounded-md bg-[#6a4cf5] py-1.5 font-semibold text-white">27</span><span className="rounded-md bg-white py-1.5 text-[#b5b1cc] ring-1 ring-[#ecebf3]">28</span>
                </div>
                <span className="mt-3 flex items-center gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-[#ecebf3]"><svg className="lp-i h-4 w-4 text-emerald-600"><use href="#i-check"/></svg>Approved by Tunde</span>
              </div>
              <div className="flex items-start gap-4 p-6"><span className="lp-ico flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f3f0ff] text-[#6a4cf5]"><svg className="lp-i"><use href="#i-calendar"/></svg></span><div><h3 className="text-[1.05rem] font-semibold">Leave and holidays</h3><p className="mt-1 text-[0.92rem] leading-relaxed text-[#5d5a78]">Requests, approvals and balances, with Nigerian holidays built in.</p></div></div>
            </a>

          </div>
        </div>
      </section>

      {/* ============================ Products ============================ */}
      <section id="products" className="bg-[#f7f6fb] py-20 sm:py-24">
        <div className="lp-wrap">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div className="max-w-xl">
              <h2 className="text-3xl font-semibold sm:text-[2.5rem] sm:leading-[1.15]">Four products, one login</h2>
              <p className="mt-4 text-[1.05rem] text-[#5d5a78]">Start with the one you need. The rest are a click away when you're ready.</p>
            </div>
            <a href="#prices" className="lp-btn lp-btn-ghost self-start sm:self-auto">Compare prices <svg className="lp-i h-4 w-4"><use href="#i-arrow"/></svg></a>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <a href={LINKS.workbase} className="lp-pcard group flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-[#ecebf3]">
              <div className="relative"><div className="aspect-[4/3] overflow-hidden"><img className="h-full w-full object-cover" src="https://images.unsplash.com/photo-1594077810908-9ffd89d704ac?w=560&h=420&fit=crop&auto=format" alt="A man working on a laptop at his desk" /></div><svg className="lp-mark absolute -bottom-5 left-5 h-11 w-11 drop-shadow-lg"><use href="#m-workbase"/></svg></div>
              <div className="flex flex-1 flex-col p-5 pt-8"><b className="text-[1.05rem]">Workbase</b><p className="mt-1 text-[0.9rem] text-[#5d5a78]">Hours, activity, tasks, leave and payroll for remote teams.</p><span className="mt-auto flex items-center justify-between pt-5 text-[0.85rem] font-semibold"><span className="text-[#5638d9]">From ₦2,500 / person</span><span className="lp-go flex h-8 w-8 items-center justify-center rounded-full bg-[#f7f6fb]"><svg className="lp-i h-4 w-4"><use href="#i-arrow"/></svg></span></span></div>
            </a>
            <a href={LINKS.meet} className="lp-pcard group flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-[#ecebf3]">
              <div className="relative"><div className="aspect-[4/3] overflow-hidden"><img className="h-full w-full object-cover" src="https://images.unsplash.com/photo-1612299273045-362a39972259?w=560&h=420&fit=crop&auto=format" alt="A man smiling on a video call" /></div><svg className="lp-mark absolute -bottom-5 left-5 h-11 w-11 drop-shadow-lg"><use href="#m-meet"/></svg></div>
              <div className="flex flex-1 flex-col p-5 pt-8"><b className="text-[1.05rem]">Meet</b><p className="mt-1 text-[0.9rem] text-[#5d5a78]">Video calls that hold up on Nigerian internet. Guests join by link.</p><span className="mt-auto flex items-center justify-between pt-5 text-[0.85rem] font-semibold"><span className="text-[#5638d9]">Free, Pro ₦3,000</span><span className="lp-go flex h-8 w-8 items-center justify-center rounded-full bg-[#f7f6fb]"><svg className="lp-i h-4 w-4"><use href="#i-arrow"/></svg></span></span></div>
            </a>
            <a href={LINKS.book} className="lp-pcard group flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-[#ecebf3]">
              <div className="relative"><div className="aspect-[4/3] overflow-hidden"><img className="h-full w-full object-cover" src="https://images.unsplash.com/photo-1512864084360-7c0c4d0a0845?w=560&h=420&fit=crop&auto=format" alt="A barber trimming a customer's hair" /></div><svg className="lp-mark absolute -bottom-5 left-5 h-11 w-11 drop-shadow-lg"><use href="#m-book"/></svg></div>
              <div className="flex flex-1 flex-col p-5 pt-8"><b className="text-[1.05rem]">Book</b><p className="mt-1 text-[0.9rem] text-[#5d5a78]">A booking page that takes deposits and sends reminders.</p><span className="mt-auto flex items-center justify-between pt-5 text-[0.85rem] font-semibold"><span className="text-[#5638d9]">Free, 3% per payment</span><span className="lp-go flex h-8 w-8 items-center justify-center rounded-full bg-[#f7f6fb]"><svg className="lp-i h-4 w-4"><use href="#i-arrow"/></svg></span></span></div>
            </a>
            <a href={LINKS.forms} className="lp-pcard group flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-[#ecebf3]">
              <div className="relative"><div className="aspect-[4/3] overflow-hidden"><img className="h-full w-full object-cover" src="https://images.unsplash.com/photo-1584012961506-b6fc4c9f3105?w=560&h=420&fit=crop&auto=format" alt="A group of young people at an event" /></div><svg className="lp-mark absolute -bottom-5 left-5 h-11 w-11 drop-shadow-lg"><use href="#m-forms"/></svg></div>
              <div className="flex flex-1 flex-col p-5 pt-8"><b className="text-[1.05rem]">Forms</b><p className="mt-1 text-[0.9rem] text-[#5d5a78]">Sign-ups, orders and tickets that collect payment too.</p><span className="mt-auto flex items-center justify-between pt-5 text-[0.85rem] font-semibold"><span className="text-[#5638d9]">Free, 3% per payment</span><span className="lp-go flex h-8 w-8 items-center justify-center rounded-full bg-[#f7f6fb]"><svg className="lp-i h-4 w-4"><use href="#i-arrow"/></svg></span></span></div>
            </a>
          </div>
        </div>
      </section>

      {/* ============================ How it works ============================ */}
      <section id="how" className="py-20 sm:py-24">
        <div className="lp-wrap grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div className="overflow-hidden rounded-3xl"><img className="aspect-[5/4] w-full object-cover" src="https://images.unsplash.com/photo-1573878414075-be35f08479e5?w=900&h=720&fit=crop&auto=format" alt="A smiling woman working on her laptop in a bright office" /></div>
            <div className="lp-float absolute -bottom-6 -right-3 w-56 rounded-2xl bg-white p-4 shadow-[0_20px_50px_-20px_rgba(21,18,58,0.4)] ring-1 ring-[#ecebf3] sm:-right-6">
              <span className="text-[0.78rem] text-[#6f6b8a]">Activity today</span>
              <b className="mt-0.5 block text-2xl font-semibold tabular-nums"><span data-count="87">0</span>%</b>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#ecebf3]"><span className="block h-full w-[87%] rounded-full bg-[#6a4cf5]"></span></div>
            </div>
            <div className="lp-float absolute -left-3 top-6 flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-[0.82rem] font-medium shadow-[0_20px_50px_-20px_rgba(21,18,58,0.4)] ring-1 ring-[#ecebf3] sm:-left-6" style={{"animationDelay": "-3s"}}>
              <i className="lp-blink h-2 w-2 rounded-full bg-emerald-500"></i>Clocked in · 03:12:44
            </div>
          </div>
          <div>
            <h2 className="text-3xl font-semibold sm:text-[2.5rem] sm:leading-[1.15]">Set up in an afternoon</h2>
            <p className="mt-4 max-w-md text-[1.05rem] text-[#5d5a78]">No sales calls and no training days. Create a company, send links, and the day starts showing up.</p>
            <ol className="mt-8 space-y-2">
              <li className="lp-step flex gap-4 rounded-2xl p-4"><span className="lp-num flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f3f0ff] text-[0.9rem] font-semibold text-[#5638d9]">1</span><span><b className="block">Create your company</b><span className="text-[0.92rem] text-[#5d5a78]">Name, logo and working hours. Two minutes.</span></span></li>
              <li className="lp-step flex gap-4 rounded-2xl p-4"><span className="lp-num flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f3f0ff] text-[0.9rem] font-semibold text-[#5638d9]">2</span><span><b className="block">Invite your people</b><span className="text-[0.92rem] text-[#5d5a78]">Share links by email or WhatsApp. They join in one tap.</span></span></li>
              <li className="lp-step flex gap-4 rounded-2xl p-4"><span className="lp-num flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f3f0ff] text-[0.9rem] font-semibold text-[#5638d9]">3</span><span><b className="block">Watch the day come in</b><span className="text-[0.92rem] text-[#5d5a78]">Who's working, hours, tasks and timesheets, live.</span></span></li>
            </ol>
          </div>
        </div>
      </section>

      {/* ============================ Numbers ============================ */}
      <section className="bg-[#15123a] py-14 text-white">
        <div className="lp-wrap grid grid-cols-2 gap-8 text-center lg:grid-cols-4">
          <div><b className="block text-4xl font-semibold tabular-nums"><span data-count="10">0</span>s</b><span className="mt-1 block text-[0.9rem] text-white/60">between activity checks</span></div>
          <div><b className="block text-4xl font-semibold tabular-nums"><span data-count="0">0</span></b><span className="mt-1 block text-[0.9rem] text-white/60">keystrokes ever recorded</span></div>
          <div><b className="block text-4xl font-semibold tabular-nums">₦<span data-count="0">0</span></b><span className="mt-1 block text-[0.9rem] text-white/60">to start on any product</span></div>
          <div><b className="block text-4xl font-semibold tabular-nums"><span data-count="4">0</span></b><span className="mt-1 block text-[0.9rem] text-white/60">products, one account</span></div>
        </div>
      </section>

      {/* ============================ Prices ============================ */}
      <section id="prices" className="py-20 sm:py-24">
        <div className="lp-wrap">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold sm:text-[2.5rem] sm:leading-[1.15]">Start free, pay in naira</h2>
            <p className="mt-4 text-[1.05rem] text-[#5d5a78]">Card, transfer or USSD through Paystack. A year costs the same as ten months.</p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <a href={LINKS.workbase} className="lp-fcard block rounded-2xl border border-[#ecebf3] bg-white p-6"><svg className="h-10 w-10"><use href="#m-workbase"/></svg><b className="mt-4 block">Workbase</b><b className="mt-3 block text-3xl font-semibold">₦2,500</b><span className="text-[0.85rem] text-[#6f6b8a]">per person a month</span><p className="mt-4 border-t border-[#ecebf3] pt-4 text-[0.88rem] text-[#5d5a78]">Free for up to 3 people. Pro with screenshots ₦4,000.</p></a>
            <a href={LINKS.meet} className="lp-fcard block rounded-2xl border border-[#ecebf3] bg-white p-6"><svg className="h-10 w-10"><use href="#m-meet"/></svg><b className="mt-4 block">Meet</b><b className="mt-3 block text-3xl font-semibold">₦3,000</b><span className="text-[0.85rem] text-[#6f6b8a]">per host a month</span><p className="mt-4 border-t border-[#ecebf3] pt-4 text-[0.88rem] text-[#5d5a78]">Free meetings up to 1 hour and 25 people.</p></a>
            <a href={LINKS.book} className="lp-fcard block rounded-2xl border border-[#ecebf3] bg-white p-6"><svg className="h-10 w-10"><use href="#m-book"/></svg><b className="mt-4 block">Book</b><b className="mt-3 block text-3xl font-semibold">₦2,000</b><span className="text-[0.85rem] text-[#6f6b8a]">a month, no fees</span><p className="mt-4 border-t border-[#ecebf3] pt-4 text-[0.88rem] text-[#5d5a78]">Or free, and we keep 3% of each payment.</p></a>
            <a href={LINKS.forms} className="lp-fcard block rounded-2xl border border-[#ecebf3] bg-white p-6"><svg className="h-10 w-10"><use href="#m-forms"/></svg><b className="mt-4 block">Forms</b><b className="mt-3 block text-3xl font-semibold">Included</b><span className="text-[0.85rem] text-[#6f6b8a]">with Book Pro</span><p className="mt-4 border-t border-[#ecebf3] pt-4 text-[0.88rem] text-[#5d5a78]">Or free, and we keep 3% of each payment.</p></a>
          </div>
        </div>
      </section>

      {/* ============================ CTA ============================ */}
      <section className="pb-20">
        <div className="lp-wrap">
          <div className="relative overflow-hidden rounded-3xl bg-[#6a4cf5] px-6 py-14 text-center text-white sm:px-12">
            <div className="lp-grid-bg pointer-events-none absolute inset-0 opacity-40 [filter:invert(1)]" aria-hidden="true"></div>
            <div className="relative">
              <h2 className="mx-auto max-w-xl text-3xl font-semibold sm:text-[2.5rem] sm:leading-[1.15]">Bring your team in this afternoon</h2>
              <p className="mx-auto mt-4 max-w-md text-[1.05rem] text-white/80">One free account opens all four products. No card needed.</p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <a href={signup} className="lp-btn bg-white text-[#15123a] hover:-translate-y-px">Create a free account <svg className="lp-i h-4 w-4"><use href="#i-arrow"/></svg></a>
                <a href={login} className="lp-btn text-white ring-1 ring-white/40 hover:bg-white/10">Log in</a>
              </div>
            </div>
          </div>
        </div>
      </section>
      </main>

      <footer className="border-t border-[#ecebf3] py-12 text-[0.9rem]">
        <div className="lp-wrap grid gap-8 sm:grid-cols-[1.5fr_1fr_1fr]">
          <div><span className="flex items-center gap-2"><svg className="h-7 w-7" viewBox="0 0 48 48"><path d="M9 29V15.5C9 10.8 12.2 8 16.5 8C27 8 36.5 17 41 29Z" fill="#6A4CF5"/><rect x="4" y="32" width="40" height="8" rx="4" fill="#F2A93B"/></svg><b className="text-lg">Workbase</b></span><p className="mt-3 max-w-xs text-[#6f6b8a]">Tools for teams that work from anywhere. Made in Lagos by Phantomire. Photos from Unsplash.</p></div>
          <div className="flex flex-col gap-2"><b>Products</b><a className="text-[#6f6b8a] hover:text-[#15123a]" href={LINKS.workbase}>Workbase</a><a className="text-[#6f6b8a] hover:text-[#15123a]" href={LINKS.meet}>Meet</a><a className="text-[#6f6b8a] hover:text-[#15123a]" href={LINKS.book}>Book</a><a className="text-[#6f6b8a] hover:text-[#15123a]" href={LINKS.forms}>Forms</a></div>
          <div className="flex flex-col gap-2"><b>Company</b><a className="text-[#6f6b8a] hover:text-[#15123a]" href="/what-we-track">What we track</a><a className="text-[#6f6b8a] hover:text-[#15123a]" href="/privacy">Privacy</a><a className="text-[#6f6b8a] hover:text-[#15123a]" href="/terms">Terms</a></div>
        </div>
      </footer>

      <LandingFx kind="home" />
    </div>
  );
}
