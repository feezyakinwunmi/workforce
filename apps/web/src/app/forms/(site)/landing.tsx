import { LandingFx } from "@/components/landing/fx";
import { LandingSprite } from "@/components/landing/sprite";

/**
 * Workbase Forms landing page for signed-out visitors (signed-in makers get their forms in
 * page.tsx). Same design system as the parent site and Meet (approved 26 Nov 2026): "lp-"
 * classes in globals.css, the shared icon sprite, behaviour in components/landing/fx.tsx.
 *
 *   Hero             copy + buttons; a live paid form (options toggle, total follows) with
 *                    answers arriving in a sheet beside it
 *   What you build   five tabs (tickets, orders, job applications, feedback, donations), each
 *                    showing a small form; they switch by themselves ([data-lp-tabs])
 *   On your website  embed code beside a website showing the form
 *   Features         eight cards whose icons move on hover
 *   Pricing          Free (3% per payment) and Pro (₦2,000 a month, shared with Book)
 *   Call to action
 *
 * The header and footer come from the Forms layout.
 */

const U = "https://images.unsplash.com/";
const img = (id: string, w: number, h: number) => `${U}${id}?w=${w}&h=${h}&fit=crop&auto=format`;

const FEATURES: Array<[string, string, string]> = [
  ["i-wallet", "Payments on any form", "Fixed prices, prices per option, or let people type an amount."],
  ["i-file", "File uploads", "CVs, receipts and photos, up to 10 MB each."],
  ["i-list", "Steps and logic", "Split long forms into pages and show questions only when needed."],
  ["i-sheet", "Google Sheets", "Every answer added to your sheet as it arrives (Pro)."],
  ["i-mail", "Answers by email", "A note in your inbox for every answer, and a CSV any time."],
  ["i-code", "Embed anywhere", "WordPress, Wix, Shopify, Squarespace, Webflow, plain HTML."],
  ["i-link", "Edit after sending", "Let people fix their answers later from a private link."],
  ["i-whatsapp", "Share a short link", "WhatsApp, Instagram bio, or a QR code on a flyer."],
];

/* Five kinds of form for the "What you can build" tabs. */
const KINDS: Array<{ icon: string; t: string; d: string; title: string; fields: Array<[string, string]>; pay?: string }> = [
  { icon: "i-star", t: "Event tickets", d: "Sell Regular and VIP, collect names.", title: "Tech & Tides 2027", fields: [["Full name", "Ngozi Adebayo"], ["Ticket", "VIP · ₦12,000"]], pay: "₦12,000" },
  { icon: "i-receipt", t: "Orders", d: "Menus and products with a running total.", title: "Mama Put Friday orders", fields: [["Jollof rice x2", "₦6,000"], ["Chicken", "₦3,500"]], pay: "₦9,500" },
  { icon: "i-file", t: "Job applications", d: "Questions that change by role, CV upload.", title: "Join Adeyemi & Co", fields: [["Role", "Product designer"], ["CV", "ngozi-cv.pdf · 420 KB"]] },
  { icon: "i-heart", t: "Feedback", d: "Ratings and comments, no account needed.", title: "How was your visit?", fields: [["Rating", "5 of 5"], ["Comment", "Fast service, lovely staff"]] },
  { icon: "i-wallet", t: "Donations", d: "Let people choose how much to give.", title: "Back-to-school fund", fields: [["Amount", "₦20,000"], ["Name on the wall", "The Okafor family"]], pay: "₦20,000" },
];

export function FormsLanding({ base }: { base: string }) {
  const home = base || "/";
  const start = `/signup?next=${encodeURIComponent(home)}`;
  const signin = `/login?next=${encodeURIComponent(home)}`;
  const plan = `${base}/plan`;

  return (
    <div className="lp overflow-x-clip">
      <LandingSprite />

      {/* Hero ================================================================================== */}
      <section id="lp-hero" className="relative overflow-hidden">
        <div className="lp-grid-bg pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="lp-spot pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="lp-wrap relative grid items-center gap-14 py-16 lg:grid-cols-[1fr_1.15fr] lg:py-20">
          <div>
            <h1 className="text-[2.35rem] leading-[1.1] font-semibold sm:text-5xl lg:text-[3.25rem]">
              Forms that <span className="text-[#6a4cf5]">get you paid</span>
            </h1>
            <p className="mt-5 max-w-md text-[1.05rem] leading-relaxed text-[#5c5c66]">
              Build a form in minutes, take payments with Paystack and put it on your website with one line of code.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={start} className="lp-btn lp-btn-main">
                Make a free form
                <svg className="lp-i h-4 w-4"><use href="#i-arrow" /></svg>
              </a>
              <a href={signin} className="lp-btn lp-btn-ghost">Sign in</a>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[0.88rem] text-[#5c5c66]">
              <span className="flex items-center gap-2"><svg className="lp-i h-4 w-4 text-[#6a4cf5]"><use href="#i-check" /></svg>Free to use</span>
              <span className="flex items-center gap-2"><svg className="lp-i h-4 w-4 text-[#6a4cf5]"><use href="#i-check" /></svg>Money goes to your bank</span>
              <span className="flex items-center gap-2"><svg className="lp-i h-4 w-4 text-[#6a4cf5]"><use href="#i-check" /></svg>Google Sheets on Pro</span>
            </div>
          </div>

          {/* Live paid form + answers arriving */}
          <div className="relative grid gap-4 sm:grid-cols-[1fr_14rem]">
            <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-[radial-gradient(60%_60%_at_50%_45%,rgba(0,0,0,0.25),transparent_70%)] blur-2xl" aria-hidden="true" />
            <div className="rounded-2xl bg-white p-5 shadow-[0_40px_100px_-40px_rgba(21,18,58,0.55)] ring-1 ring-[#ececef]">
              <b>Founders&apos; Dinner, Lagos</b>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#ececef]"><span className="block h-full w-2/3 rounded-full bg-[#111113]" /></div>
              <label className="mt-4 block text-[0.78rem] font-medium text-[#5c5c66]">Full name</label>
              <div className="mt-1 flex h-9 items-center rounded-lg border border-[#e4e1f0] px-3 text-[0.9rem]">Ngozi Adebayo<i className="lp-blink ml-px h-4 w-px bg-[#111113]" /></div>
              <span className="mt-3 block text-[0.78rem] font-medium text-[#5c5c66]">Add to your ticket</span>
              <div className="mt-1 space-y-2 text-[0.85rem]" id="lp-opts">
                <span className="lp-opt flex items-center justify-between rounded-lg bg-white px-3 py-2 ring-1 ring-[#ececef] transition">Dinner seat <b>₦5,000</b></span>
                <span className="lp-opt flex items-center justify-between rounded-lg bg-white px-3 py-2 ring-1 ring-[#ececef] transition">After-party <b>₦3,500</b></span>
              </div>
              <span className="mt-4 flex items-center justify-between rounded-lg bg-[#111113] px-3 py-2.5 text-[0.85rem] font-semibold text-white">Pay and send <span id="lp-total">₦0</span></span>
            </div>
            <div className="hidden flex-col rounded-2xl bg-[#0c0c0e] p-4 text-white shadow-[0_40px_100px_-40px_rgba(21,18,58,0.7)] sm:flex">
              <span className="flex items-center gap-2 text-[0.78rem] text-white/60"><svg className="lp-i h-4 w-4 text-emerald-400"><use href="#i-sheet" /></svg>Google Sheet</span>
              <b className="mt-1 text-2xl font-semibold tabular-nums">248</b>
              <span className="text-[0.75rem] text-white/50">answers</span>
              <ul className="mt-4 space-y-2 text-[0.8rem]" data-lp-cycle="1600">
                {[["Ngozi A.", "Paid"], ["Tobi O.", "Paid"], ["Amaka E.", "Waiting"], ["Segun B.", "Paid"], ["Kemi J.", "Paid"]].map(([n, s], i) => (
                  <li key={n} data-c="" data-on={i === 0 ? "1" : "0"} className="flex justify-between rounded-lg px-2 py-1.5 transition data-[on=1]:bg-white/10">
                    <span>{n}</span>
                    <span className={s === "Paid" ? "text-emerald-300" : "text-white/50"}>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="lp-float absolute -bottom-14 left-4 hidden items-center gap-3 rounded-2xl bg-white p-3 text-[0.82rem] shadow-[0_20px_50px_-20px_rgba(21,18,58,0.4)] ring-1 ring-[#ececef] sm:flex">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><svg className="lp-i"><use href="#i-check" /></svg></span>
              <span><b className="block">New paid answer</b><span className="text-[#6b6b75]">₦8,500 · Founders&apos; Dinner</span></span>
            </div>
          </div>
        </div>
      </section>

      {/* What you can build ==================================================================== */}
      <section className="bg-[#f7f7f8] py-20 sm:py-24">
        <div className="lp-wrap">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold sm:text-[2.5rem] sm:leading-[1.15]">What you can build</h2>
            <p className="mt-4 text-[1.05rem] text-[#5c5c66]">Start from a template and change anything.</p>
          </div>
          <div className="mt-12 grid gap-6 lg:grid-cols-[22rem_1fr]" data-lp-tabs="">
            <div role="tablist" aria-label="Kinds of form" className="flex flex-col gap-1.5">
              {KINDS.map((k, i) => (
                <button key={k.t} role="tab" aria-selected={i === 0 ? "true" : "false"} className="lp-ftab group relative flex gap-4 overflow-hidden rounded-2xl p-4 text-left transition">
                  <span className="lp-ico flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#6a4cf5] ring-1 ring-[#ececef]"><svg className="lp-i"><use href={`#${k.icon}`} /></svg></span>
                  <span><b className="block text-[0.98rem]">{k.t}</b><span className="block text-[0.86rem] text-[#5c5c66]">{k.d}</span></span>
                  <span className="lp-prog absolute right-4 bottom-0 left-4 h-0.5 bg-[#111113]" />
                </button>
              ))}
            </div>
            <div className="relative grid min-h-[22rem] place-items-center overflow-hidden rounded-3xl bg-[#0c0c0e] p-6">
              {KINDS.map((k, i) => (
                <div key={k.t} data-v="" hidden={i !== 0} className="lp-screen w-full max-w-sm rounded-2xl bg-white p-6 text-[#111113]">
                  <b className="text-lg">{k.title}</b>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#ececef]"><span className="block h-full w-1/2 rounded-full bg-[#111113]" /></div>
                  {k.fields.map(([label, value]) => (
                    <div key={label} className="mt-4">
                      <span className="block text-[0.78rem] font-medium text-[#5c5c66]">{label}</span>
                      <span className="mt-1 flex h-10 items-center rounded-lg border border-[#e4e1f0] px-3 text-[0.9rem]">{value}</span>
                    </div>
                  ))}
                  <span className="mt-5 flex items-center justify-between rounded-lg bg-[#111113] px-4 py-2.5 text-[0.9rem] font-semibold text-white">
                    {k.pay ? "Pay and send" : "Send"}
                    {k.pay && <span>{k.pay}</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* On your website ======================================================================= */}
      <section className="py-20 sm:py-24">
        <div className="lp-wrap grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <h2 className="text-3xl font-semibold sm:text-[2.5rem] sm:leading-[1.15]">Put it on your website</h2>
            <p className="mt-4 max-w-md text-[1.05rem] text-[#5c5c66]">Paste one line into WordPress, Wix or any page. The form fits itself and payments still work.</p>
            <div className="mt-8 overflow-x-auto rounded-2xl bg-[#0c0c0e] p-5 font-mono text-[0.8rem] leading-relaxed text-white/85">
              <span className="text-[#9a97b3]">{"<!-- paste where the form should appear -->"}</span>
              <br />
              <span className="text-[#c2b3ff]">{"<div"}</span> <span className="text-marigold-300">data-workbase-form</span>=<span className="text-emerald-300">&quot;forms.workbasecore.com/f/x7k2p9qa&quot;</span>
              <span className="text-[#c2b3ff]">{"></div>"}</span>
              <br />
              <span className="text-[#c2b3ff]">{"<script"}</span> <span className="text-marigold-300">src</span>=<span className="text-emerald-300">&quot;forms.workbasecore.com/forms-embed.js&quot;</span>
              <span className="text-[#c2b3ff]">{"></script>"}</span>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl bg-white shadow-[0_30px_80px_-40px_rgba(21,18,58,0.5)] ring-1 ring-[#ececef]">
            <div className="flex items-center gap-1.5 border-b border-[#ececef] px-4 py-3">
              <i className="h-2.5 w-2.5 rounded-full bg-[#ececef]" />
              <i className="h-2.5 w-2.5 rounded-full bg-[#ececef]" />
              <i className="h-2.5 w-2.5 rounded-full bg-[#ececef]" />
              <span className="ml-3 rounded-md bg-[#f7f7f8] px-3 py-1 text-[0.75rem] text-[#6b6b75]">yourchurch.org/harvest</span>
            </div>
            <div className="grid gap-5 p-5 sm:grid-cols-[1fr_1.1fr]">
              <div>
                <img className="aspect-[4/3] w-full rounded-xl object-cover" src={img("photo-1584012961506-b6fc4c9f3105", 400, 300)} alt="Volunteers at an event" loading="lazy" />
                <b className="mt-3 block">Harvest Sunday 2026</b>
                <p className="text-[0.85rem] text-[#6b6b75]">Register and pledge below.</p>
              </div>
              <div className="rounded-xl bg-[#f7f7f8] p-4 text-[0.85rem]">
                <span className="block text-[0.75rem] font-medium text-[#5c5c66]">Pledge</span>
                <div className="mt-1 grid grid-cols-3 gap-2" data-lp-cycle="1400">
                  {["₦5,000", "₦10,000", "₦25,000"].map((a, i) => (
                    <span key={a} data-c="" data-on={i === 1 ? "1" : "0"} className="rounded-lg bg-white py-2 text-center ring-1 ring-[#ececef] transition data-[on=1]:bg-[#111113] data-[on=1]:font-semibold data-[on=1]:text-white">{a}</span>
                  ))}
                </div>
                <span className="mt-4 block rounded-lg bg-[#111113] py-2.5 text-center font-semibold text-white">Pledge and pay</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features ============================================================================== */}
      <section className="bg-[#f7f7f8] py-20 sm:py-24">
        <div className="lp-wrap">
          <h2 className="text-3xl font-semibold sm:text-[2.5rem] sm:leading-[1.15]">Everything a form needs</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(([icon, t, d]) => (
              <div key={t} className="lp-fcard rounded-2xl border border-[#ececef] bg-white p-5">
                <span className="lp-ico flex h-11 w-11 items-center justify-center rounded-xl bg-[#f4f4f5] text-[#6a4cf5]"><svg className="lp-i"><use href={`#${icon}`} /></svg></span>
                <h3 className="mt-4 font-semibold">{t}</h3>
                <p className="mt-1 text-[0.9rem] text-[#5c5c66]">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing =============================================================================== */}
      <section className="py-20 sm:py-24">
        <div className="lp-wrap">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold sm:text-[2.5rem] sm:leading-[1.15]">Free to start</h2>
            <p className="mt-4 text-[1.05rem] text-[#5c5c66]">Pay only when you get paid, or go Pro and keep every naira.</p>
          </div>
          <div className="mx-auto mt-12 grid max-w-3xl gap-4 md:grid-cols-2">
            <div className="lp-fcard flex flex-col rounded-3xl border border-[#ececef] bg-white p-7">
              <b>Free</b>
              <b className="mt-3 text-4xl font-semibold">₦0</b>
              <span className="text-[0.85rem] text-[#6b6b75]">we keep 3% of each online payment</span>
              <ul className="mt-6 mb-8 space-y-2.5 text-[0.9rem] text-[#52525b]">
                {["Unlimited forms and answers", "Payments, uploads and logic", "500 MB of file storage"].map((x) => (
                  <li key={x} className="flex gap-2"><svg className="lp-i h-4 w-4 shrink-0 text-[#6a4cf5]"><use href="#i-check" /></svg>{x}</li>
                ))}
              </ul>
              <a href={start} className="lp-btn lp-btn-ghost mt-auto justify-center">Make a free form</a>
            </div>
            <div className="lp-fcard flex flex-col rounded-3xl bg-[#111113] p-7 text-white shadow-[0_30px_70px_-30px_rgba(21,18,58,0.8)]">
              <b>Pro</b>
              <b className="mt-3 text-4xl font-semibold">₦2,000</b>
              <span className="text-[0.85rem] text-white/60">a month, no fees · includes Book Pro</span>
              <ul className="mt-6 mb-8 space-y-2.5 text-[0.9rem] text-white/85">
                {["No 3% fee on payments", "Google Sheets sync", "10 GB of file storage, no badge"].map((x) => (
                  <li key={x} className="flex gap-2"><svg className="lp-i h-4 w-4 shrink-0 text-marigold-400"><use href="#i-check" /></svg>{x}</li>
                ))}
              </ul>
              <a href={plan} className="lp-btn mt-auto justify-center bg-marigold-400 text-[#111113] hover:bg-marigold-300">See Pro</a>
            </div>
          </div>
        </div>
      </section>

      {/* Call to action ======================================================================== */}
      <section className="pb-20">
        <div className="lp-wrap">
          <div className="relative grid items-center gap-8 overflow-hidden rounded-3xl bg-[#111113] p-8 text-white sm:p-12 lg:grid-cols-[1fr_auto]">
            <div className="lp-grid-bg pointer-events-none absolute inset-0 opacity-40 [filter:invert(1)]" aria-hidden="true" />
            <div className="relative">
              <h2 className="text-3xl font-semibold sm:text-[2.25rem]">Your first form in five minutes</h2>
              <p className="mt-3 text-[1.05rem] text-white/80">Pick a template, add your prices, share the link.</p>
            </div>
            <div className="relative flex flex-wrap gap-3">
              <a href={start} className="lp-btn bg-white text-[#111113] hover:-translate-y-px">Make a free form<svg className="lp-i h-4 w-4"><use href="#i-arrow" /></svg></a>
              <a href={signin} className="lp-btn text-white ring-1 ring-white/40 hover:bg-white/10">Sign in</a>
            </div>
          </div>
        </div>
      </section>

      <LandingFx kind="forms" />
    </div>
  );
}
