import { LandingFx } from "@/components/landing/fx";
import { LandingSprite } from "@/components/landing/sprite";

/**
 * Bizz Padi landing page for signed-out visitors (signed-in people get the chat in page.tsx).
 *
 * Same design system as the parent site, Workbase, Meet, Book and Forms (approved 26 Nov 2026):
 * "lp-" classes in globals.css, the shared icon sprite, behaviour in components/landing/fx.tsx
 * ([data-lp-tabs] switching tabs, [data-lp-cycle] rotating items, hover light on .lp-fcard).
 * Rules from Femi: no little labels above headings, no emojis, compact sizes, real photos,
 * everything alive (motion + hover), proper alignment.
 *
 *   Hero          copy + buttons; a live chat with Padi beside a flyer that keeps changing style,
 *                 a "posted" toast and a consistency streak card
 *   Strip         scrolling facts
 *   Who it's for  four photo cards
 *   What it does  five tabs (write, flyers, plan the week, timing, consistency) with live screens
 *   Next          the growth tools on the way (replies, customers, ads, influencers)
 *   Pricing       free early access
 *   Call to action
 *
 * The header and footer come from the Padi layout.
 */

const U = "https://images.unsplash.com/";
const img = (id: string, w: number, h: number) => `${U}${id}?w=${w}&h=${h}&fit=crop&auto=format`;

/* Four flyer looks the hero cycles through: [style, background, ink, headline, line, button]. */
const FLYERS: Array<[string, string, string, string, string, string]> = [
  ["bold", "#6a4cf5", "#ffffff", "Fresh wigs just landed", "Bone straight, 24 inches, ready to wear", "Order now"],
  ["promo", "#111113", "#ffffff", "Friday deal", "Knotless braids at a special price this weekend", "Book a slot"],
  ["clean", "#f7f7f8", "#111113", "Your hair, your rules", "Silk press, wigs and braids in Lekki", "Visit us"],
  ["quote", "#fff4e0", "#111113", "Healthy hair starts at night", "Tip: sleep on satin to keep your style longer", "Save this"],
];

const WHO: Array<{ t: string; d: string; p: string }> = [
  { t: "Salons and barbers", d: "Fresh styles, offers and open slots, every week.", p: "photo-1512864084360-7c0c4d0a0845" },
  { t: "Consultants and agencies", d: "Thought-leadership posts for LinkedIn, done for you.", p: "photo-1638514351607-585e69bbbb7e" },
  { t: "Tutors and coaches", d: "Tips, results and enrolment posts that bring students.", p: "photo-1604933762021-54a5858c9832" },
  { t: "Shops and online sellers", d: "New stock, prices and promos without the stress.", p: "photo-1573496800440-5c9c48a8d0f0" },
];

/* "What Padi does" tabs. */
const TABS: Array<{ icon: string; t: string; d: string }> = [
  { icon: "i-chat", t: "Writes your posts", d: "One line from you, captions for every platform." },
  { icon: "i-sparkle", t: "Makes the flyer", d: "In your colours, four styles, download as an image." },
  { icon: "i-calendar", t: "Plans your week", d: "A full week of posts in one tap." },
  { icon: "i-clock", t: "Picks the time", d: "Nigerian peak hours for each platform." },
  { icon: "i-bell", t: "Keeps you consistent", d: "A nudge when a post is ready to approve." },
];

const NEXT: Array<[string, string, string]> = [
  ["i-chat", "Replies to comments", "Answers \"how much?\" and \"where are you?\" in your voice, for you to approve."],
  ["i-users", "Finds customers", "Spots people asking for what you sell and helps you follow up."],
  ["i-zap", "Runs your ads", "Simple ads on Instagram, Facebook and Google with a budget you set."],
  ["i-star", "Books influencers", "Matches you with creators who fit, with payment held until the post goes live."],
];

export function PadiLanding({ base }: { base: string }) {
  const home = base || "/";
  const start = `/signup?next=${encodeURIComponent(`${base}/setup`)}`;
  const signin = `/login?next=${encodeURIComponent(home)}`;

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
              Your pages, <span className="text-[#6a4cf5]">never quiet again</span>
            </h1>
            <p className="mt-5 max-w-md text-[1.05rem] leading-relaxed text-[#5c5c66]">
              Bizz Padi is the social media manager that never sleeps. Tell it what&apos;s new, and it writes the
              captions, designs the flyer and plans your week.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={start} className="lp-btn lp-btn-main">
                Start free
                <svg className="lp-i h-4 w-4"><use href="#i-arrow" /></svg>
              </a>
              <a href={signin} className="lp-btn lp-btn-ghost">Sign in</a>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[0.88rem] text-[#5c5c66]">
              {["Speaks Naija", "Flyers in your colours", "You approve every post"].map((x) => (
                <span key={x} className="flex items-center gap-2"><svg className="lp-i h-4 w-4 text-[#6a4cf5]"><use href="#i-check" /></svg>{x}</span>
              ))}
            </div>
          </div>

          {/* Live chat + changing flyer */}
          <div className="relative grid gap-4 sm:grid-cols-[1fr_13.5rem]">
            <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-[radial-gradient(60%_60%_at_50%_45%,rgba(0,0,0,0.25),transparent_70%)] blur-2xl" aria-hidden="true" />

            <div className="flex flex-col rounded-2xl bg-[#0c0c0e] p-4 text-white shadow-[0_40px_100px_-40px_rgba(21,18,58,0.7)]">
              <div className="flex items-center gap-2.5 border-b border-white/10 pb-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#111113]"><svg className="lp-i h-4 w-4"><use href="#i-sparkle" /></svg></span>
                <span><b className="block text-[0.9rem]">Bizz Padi</b><span className="flex items-center gap-1.5 text-[0.72rem] text-white/50"><i className="lp-blink h-1.5 w-1.5 rounded-full bg-emerald-400" />online</span></span>
              </div>
              <div className="mt-3 flex flex-1 flex-col gap-2.5 text-[0.84rem]">
                <p className="lp-chat-in ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-[#111113] px-3.5 py-2">New wigs in stock, ₦45k. Make a post for Friday.</p>
                <p className="lp-chat-in max-w-[88%] rounded-2xl rounded-bl-md bg-white/10 px-3.5 py-2" style={{ animationDelay: "0.9s" }}>
                  Done. Captions for Instagram, Facebook and WhatsApp, flyer attached. Set for Friday, 7:30 pm.
                </p>
                <div className="lp-chat-in grid grid-cols-3 gap-1.5 text-[0.7rem]" style={{ animationDelay: "1.6s" }}>
                  {["Instagram", "Facebook", "WhatsApp"].map((p) => (
                    <span key={p} className="rounded-lg bg-white/[0.06] px-2 py-1.5 ring-1 ring-white/10">
                      <b className="block text-white/90">{p}</b>
                      <i className="mt-1 block h-1 w-11/12 rounded bg-white/15" />
                      <i className="mt-1 block h-1 w-2/3 rounded bg-white/15" />
                    </span>
                  ))}
                </div>
                <p className="lp-chat-in ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-[#111113] px-3.5 py-2" style={{ animationDelay: "2.4s" }}>Plan my whole week too.</p>
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/[0.06] px-3 py-2 text-[0.8rem] text-white/40 ring-1 ring-white/10">
                Tell Padi what&apos;s new<i className="lp-blink ml-px h-4 w-px bg-white/60" />
                <span className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg bg-[#111113] text-white"><svg className="lp-i h-3.5 w-3.5"><use href="#i-arrow" /></svg></span>
              </div>
            </div>

            {/* Flyer that changes style every few seconds */}
            <div className="relative hidden aspect-[4/5] sm:block" data-lp-cycle="2600">
              {FLYERS.map(([style, bg, ink, h, line, cta], i) => (
                <div key={style} data-c="" data-on={i === 0 ? "1" : "0"}
                  className="absolute inset-0 flex flex-col justify-between overflow-hidden rounded-2xl p-4 opacity-0 shadow-[0_30px_70px_-30px_rgba(21,18,58,0.6)] ring-1 ring-black/5 transition duration-700 data-[on=1]:opacity-100"
                  style={{ background: bg, color: ink }}>
                  {style === "bold" && <span className="absolute -top-10 -right-10 h-36 w-36 rounded-full bg-[#f2a93b] opacity-25" aria-hidden="true" />}
                  {style === "promo" && <span className="absolute top-[38%] -left-4 h-10 w-[130%] -rotate-6 bg-[#f2a93b]" aria-hidden="true" />}
                  <b className="relative text-[0.62rem] tracking-[0.14em]">ADA&apos;S HAIR</b>
                  <span className={`relative text-[1.45rem] leading-[1.08] font-semibold ${style === "promo" ? "text-center text-[#111113]" : ""}`}>
                    {style === "quote" && <span className="block text-4xl leading-none text-[#f2a93b]">&ldquo;</span>}
                    {h}
                  </span>
                  <span className="relative text-[0.72rem] opacity-80">{line}</span>
                  <span className="relative w-fit rounded-full px-3 py-1.5 text-[0.7rem] font-semibold"
                    style={{ background: style === "bold" ? "#f2a93b" : "#6a4cf5", color: style === "bold" ? "#111113" : "#fff" }}>
                    {cta}
                  </span>
                </div>
              ))}
            </div>

            {/* Floating cards */}
            <div className="lp-float absolute -bottom-12 left-4 hidden items-center gap-3 rounded-2xl bg-white p-3 text-[0.82rem] shadow-[0_20px_50px_-20px_rgba(21,18,58,0.4)] ring-1 ring-[#ececef] sm:flex">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><svg className="lp-i"><use href="#i-check" /></svg></span>
              <span><b className="block">Approved for Friday</b><span className="text-[#6b6b75]">Instagram · 7:30 pm</span></span>
            </div>
            <div className="lp-float absolute -top-6 right-2 hidden items-center gap-2.5 rounded-2xl bg-white px-3 py-2 text-[0.8rem] shadow-[0_20px_50px_-20px_rgba(21,18,58,0.4)] ring-1 ring-[#ececef] lg:flex" style={{ animationDelay: "-3s" }}>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#fff4e0] text-[#cc7a12]"><svg className="lp-i h-4 w-4"><use href="#i-zap" /></svg></span>
              <span><b>12 days</b> <span className="text-[#6b6b75]">posting streak</span></span>
            </div>
          </div>
        </div>
      </section>

      {/* Strip ================================================================================= */}
      <section className="border-y border-[#ececef] bg-white py-5">
        <div className="lp-marquee overflow-hidden">
          <div className="lp-track gap-12 text-[1.02rem] font-semibold text-[#8c8c96]">
            {[0, 1].flatMap((k) =>
              ["Captions for six platforms", "Flyers in your brand colours", "A week planned in one tap", "Never invents prices or reviews", "Pidgin when you want it", "Built in Lagos"].map((t) => (
                <span key={`${k}${t}`} className="flex items-center gap-12 whitespace-nowrap">
                  {t}
                  <i className="h-1.5 w-1.5 rotate-45 bg-marigold-400" aria-hidden="true" />
                </span>
              )),
            )}
          </div>
        </div>
      </section>

      {/* Who it's for ========================================================================== */}
      <section className="py-20 sm:py-24">
        <div className="lp-wrap">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold sm:text-[2.5rem] sm:leading-[1.15]">For businesses too busy to post</h2>
            <p className="mt-4 text-[1.05rem] text-[#5c5c66]">You run the business. Padi keeps your pages alive.</p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {WHO.map((w) => (
              <div key={w.t} className="lp-fcard group overflow-hidden rounded-2xl border border-[#ececef] bg-white">
                <div className="overflow-hidden">
                  <img className="aspect-[4/3] w-full object-cover transition duration-700 group-hover:scale-105" src={img(w.p, 520, 390)} alt={w.t} loading="lazy" />
                </div>
                <div className="p-5">
                  <h3 className="font-semibold">{w.t}</h3>
                  <p className="mt-1 text-[0.9rem] text-[#5c5c66]">{w.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What Padi does ======================================================================== */}
      <section className="bg-[#f7f7f8] py-20 sm:py-24">
        <div className="lp-wrap">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold sm:text-[2.5rem] sm:leading-[1.15]">A content team in one chat</h2>
            <p className="mt-4 text-[1.05rem] text-[#5c5c66]">Everything a social media manager does, without the salary.</p>
          </div>
          <div className="mt-12 grid gap-6 lg:grid-cols-[22rem_1fr]" data-lp-tabs="">
            <div role="tablist" aria-label="What Padi does" className="flex flex-col gap-1.5">
              {TABS.map((k, i) => (
                <button key={k.t} role="tab" aria-selected={i === 0 ? "true" : "false"} className="lp-ftab group relative flex gap-4 overflow-hidden rounded-2xl p-4 text-left transition">
                  <span className="lp-ico flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#6a4cf5] ring-1 ring-[#ececef]"><svg className="lp-i"><use href={`#${k.icon}`} /></svg></span>
                  <span><b className="block text-[0.98rem]">{k.t}</b><span className="block text-[0.86rem] text-[#5c5c66]">{k.d}</span></span>
                  <span className="lp-prog absolute right-4 bottom-0 left-4 h-0.5 bg-[#111113]" />
                </button>
              ))}
            </div>

            <div className="relative grid min-h-[23rem] place-items-center overflow-hidden rounded-3xl bg-[#0c0c0e] p-6">
              {/* 1. Captions per platform */}
              <div data-v="" className="lp-screen w-full max-w-md space-y-2.5">
                {[["Instagram", "Fresh wigs just landed. Bone straight, 24 inches, ₦45k. Friday only, DM to order."], ["Facebook", "New stock alert for our Lekki ladies. Which length are you picking?"], ["WhatsApp Status", "Wigs don land. ₦45k. Send a message to reserve yours."]].map(([p, c]) => (
                  <div key={p} className="rounded-xl bg-white p-4 text-[#111113]">
                    <b className="text-[0.8rem] text-[#6a4cf5]">{p}</b>
                    <p className="mt-1 text-[0.88rem]">{c}</p>
                  </div>
                ))}
              </div>
              {/* 2. Flyer styles */}
              <div data-v="" hidden className="lp-screen grid w-full max-w-md grid-cols-2 gap-3">
                {FLYERS.map(([style, bg, ink, h, , cta]) => (
                  <div key={style} className="flex aspect-[4/5] flex-col justify-between rounded-xl p-3 transition hover:-translate-y-1" style={{ background: bg, color: ink }}>
                    <b className="text-[0.55rem] tracking-[0.14em]">ADA&apos;S HAIR</b>
                    <span className="text-[0.95rem] leading-tight font-semibold">{h}</span>
                    <span className="w-fit rounded-full bg-[#f2a93b] px-2 py-1 text-[0.6rem] font-semibold text-[#111113]">{cta}</span>
                  </div>
                ))}
              </div>
              {/* 3. Week plan */}
              <div data-v="" hidden className="lp-screen w-full max-w-md rounded-2xl bg-white p-5 text-[#111113]">
                <b>This week</b>
                <ul className="mt-3 space-y-2 text-[0.86rem]">
                  {[["Mon", "Tip: make braids last longer", "Approved"], ["Wed", "Behind the scenes: Saturday rush", "Approved"], ["Fri", "Fresh wigs just landed", "Needs a look"], ["Sat", "Poll: short or long?", "Needs a look"]].map(([d, t, s]) => (
                    <li key={d} className="flex items-center gap-3 rounded-lg px-2 py-2 ring-1 ring-[#ececef]">
                      <b className="w-9 text-[#6a4cf5]">{d}</b>
                      <span className="min-w-0 flex-1 truncate">{t}</span>
                      <span className={`text-[0.72rem] font-medium ${s === "Approved" ? "text-emerald-600" : "text-[#cc7a12]"}`}>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {/* 4. Best times */}
              <div data-v="" hidden className="lp-screen w-full max-w-md rounded-2xl bg-white p-5 text-[#111113]">
                <b>When your customers are online</b>
                <div className="mt-4 flex h-32 items-end gap-1.5">
                  {[18, 46, 70, 42, 30, 58, 36, 28, 40, 66, 92, 74].map((v, i) => (
                    <span key={i} className={`lp-grow flex-1 rounded-t ${v > 60 ? "bg-[#111113]" : "bg-[#d9d2fd]"}`} style={{ height: `${v}%`, animationDelay: `${i * 40}ms` }} />
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-[0.7rem] text-[#6b6b75]"><span>6am</span><span>12pm</span><span>6pm</span><span>10pm</span></div>
                <p className="mt-3 text-[0.85rem] text-[#5c5c66]">Friday post set for <b className="text-[#111113]">7:30 pm</b>, the best slot on Instagram.</p>
              </div>
              {/* 5. Nudge */}
              <div data-v="" hidden className="lp-screen w-full max-w-sm space-y-3">
                <div className="lp-float flex items-center gap-3 rounded-2xl bg-white p-4 text-[#111113]">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#111113] text-white"><svg className="lp-i"><use href="#i-bell" /></svg></span>
                  <span className="text-[0.86rem]"><b className="block">Today&apos;s post is ready</b><span className="text-[#6b6b75]">Tap to approve. It goes out at 7:30 pm.</span></span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-white/[0.06] p-4 text-white ring-1 ring-white/10">
                  <span className="text-[0.86rem]">Posting streak</span>
                  <span className="flex gap-1">
                    {Array.from({ length: 7 }).map((_, i) => <i key={i} className={`h-6 w-3 rounded ${i < 6 ? "bg-[#f2a93b]" : "bg-white/15"}`} />)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Next ================================================================================== */}
      <section className="relative overflow-hidden bg-[#111113] py-20 text-white sm:py-24">
        <div className="lp-grid-bg pointer-events-none absolute inset-0 opacity-30 [filter:invert(1)]" aria-hidden="true" />
        <div className="lp-wrap relative">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold sm:text-[2.5rem] sm:leading-[1.15]">Then it grows your business</h2>
            <p className="mt-4 text-[1.05rem] text-white/70">The growth tools on the way, in the same app.</p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {NEXT.map(([icon, t, d]) => (
              <div key={t} className="lp-fcard rounded-2xl bg-white/[0.05] p-5 ring-1 ring-white/10 transition hover:bg-white/[0.08]">
                <span className="lp-ico flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-marigold-400"><svg className="lp-i"><use href={`#${icon}`} /></svg></span>
                <h3 className="mt-4 font-semibold">{t}</h3>
                <p className="mt-1 text-[0.9rem] text-white/65">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing =============================================================================== */}
      <section className="py-20 sm:py-24">
        <div className="lp-wrap">
          <div className="mx-auto grid max-w-4xl items-center gap-10 lg:grid-cols-[1fr_22rem]">
            <div>
              <h2 className="text-3xl font-semibold sm:text-[2.5rem] sm:leading-[1.15]">Free while we&apos;re in early access</h2>
              <p className="mt-4 max-w-md text-[1.05rem] text-[#5c5c66]">
                Use every feature at no cost while we build. Early users keep a special price when paid plans arrive.
              </p>
            </div>
            <div className="lp-fcard flex flex-col rounded-3xl bg-[#111113] p-7 text-white shadow-[0_30px_70px_-30px_rgba(21,18,58,0.8)]">
              <b>Early access</b>
              <b className="mt-3 text-4xl font-semibold">₦0</b>
              <span className="text-[0.85rem] text-white/60">no card needed</span>
              <ul className="mt-6 mb-8 space-y-2.5 text-[0.9rem] text-white/85">
                {["Unlimited chat and posts", "Flyers in your colours", "Weekly content plans"].map((x) => (
                  <li key={x} className="flex gap-2"><svg className="lp-i h-4 w-4 shrink-0 text-marigold-400"><use href="#i-check" /></svg>{x}</li>
                ))}
              </ul>
              <a href={start} className="lp-btn mt-auto justify-center bg-marigold-400 text-[#111113] hover:bg-marigold-300">Start free</a>
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
              <h2 className="text-3xl font-semibold sm:text-[2.25rem]">Your first post in two minutes</h2>
              <p className="mt-3 text-[1.05rem] text-white/80">Tell Padi about your business, then tell it what&apos;s new.</p>
            </div>
            <div className="relative flex flex-wrap gap-3">
              <a href={start} className="lp-btn bg-white text-[#111113] hover:-translate-y-px">Start free<svg className="lp-i h-4 w-4"><use href="#i-arrow" /></svg></a>
              <a href={signin} className="lp-btn text-white ring-1 ring-white/40 hover:bg-white/10">Sign in</a>
            </div>
          </div>
        </div>
      </section>

      <LandingFx kind="padi" />
    </div>
  );
}
