import { LandingFx } from "@/components/landing/fx";
import { LandingSprite } from "@/components/landing/sprite";

/**
 * Workbase Book landing page for signed-out visitors (signed-in hosts get their bookings in
 * page.tsx). Same design system as the parent site and Meet (approved 26 Nov 2026): "lp-"
 * classes in globals.css, the shared icon sprite, behaviour in components/landing/fx.tsx.
 *
 *   Hero          copy + "your page" address + buttons; a live booking page on the right
 *                 (a time slot being picked, deposit, reminder and payment alerts)
 *   Who it's for  photo cards: barbers and salons, consultants, tutors and coaches
 *   How           three steps beside a WhatsApp share card
 *   Features      eight cards whose icons move on hover
 *   Pricing       Free (3% per payment) and Pro (₦2,000 a month, also covers Forms)
 *   Call to action
 *
 * The header and footer come from the Book layout.
 */

const U = "https://images.unsplash.com/";
const img = (id: string, w: number, h: number) => `${U}${id}?w=${w}&h=${h}&fit=crop&auto=format`;

const FEATURES: Array<[string, string, string]> = [
  ["i-wallet", "Deposits or full payment", "Paystack card, transfer or USSD. The money goes to your bank."],
  ["i-bell", "Reminders that work", "Email reminders a day and an hour before every booking."],
  ["i-video", "Video calls built in", "Online sessions get a Workbase Meet link by themselves."],
  ["i-calendar", "Your hours, your rules", "Opening hours, days off, buffers and a daily limit."],
  ["i-globe", "Any time zone", "Customers abroad see times in their own clock."],
  ["i-link", "Easy to cancel or move", "Customers manage their booking from a link."],
  ["i-whatsapp", "Share anywhere", "WhatsApp, Instagram bio, a QR code on your counter."],
  ["i-users", "No account for customers", "They book with a name, email and phone number."],
];

const WHO = [
  { t: "Barbers and salons", d: "Fill the chair and stop no-shows with a small deposit.", p: "photo-1512864084360-7c0c4d0a0845" },
  { t: "Consultants", d: "Paid strategy calls, with the video link sent for you.", p: "photo-1638514351607-585e69bbbb7e" },
  { t: "Tutors and coaches", d: "Weekly sessions booked and paid before they start.", p: "photo-1604933762021-54a5858c9832" },
];

export function BookLanding({ base }: { base: string }) {
  const home = base || "/";
  const start = `/signup?next=${encodeURIComponent(home)}`;
  const signin = `/login?next=${encodeURIComponent(home)}`;
  const pricing = `${base}/pricing`;

  return (
    <div className="lp overflow-x-clip">
      <LandingSprite />

      {/* Hero ================================================================================== */}
      <section id="lp-hero" className="relative overflow-hidden">
        <div className="lp-grid-bg pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="lp-spot pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="lp-wrap relative grid items-center gap-14 py-16 lg:grid-cols-[1fr_1.1fr] lg:py-20">
          <div>
            <h1 className="text-[2.35rem] leading-[1.1] font-semibold sm:text-5xl lg:text-[3.25rem]">
              Get booked. <span className="text-[#6a4cf5]">Get paid.</span> No more no-shows.
            </h1>
            <p className="mt-5 max-w-md text-[1.05rem] leading-relaxed text-[#5d5a78]">
              Your own booking page. Customers pick a time, pay a deposit with Paystack and get reminders. The money goes straight to your bank.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a href={start} className="lp-btn lp-btn-main justify-center">
                Create your free page
                <svg className="lp-i h-4 w-4"><use href="#i-arrow" /></svg>
              </a>
              <span className="flex items-center gap-2 rounded-xl bg-white px-4 py-[0.7rem] text-[0.9rem] text-[#6f6b8a] ring-1 ring-[#e4e1f0]">
                <svg className="lp-i h-4 w-4"><use href="#i-link" /></svg>
                book.workbasecore.com/<b className="text-[#15123a]">your-name</b>
              </span>
            </div>
            <p className="mt-6 text-[0.9rem] text-[#6f6b8a]">
              Already on Workbase or Meet? <a href={signin} className="font-semibold text-[#5638d9] hover:underline">Sign in</a> with the same account.
            </p>
          </div>

          {/* Live booking page */}
          <div className="relative">
            <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-[radial-gradient(60%_60%_at_50%_45%,rgba(106,76,245,0.25),transparent_70%)] blur-2xl" aria-hidden="true" />
            <div className="overflow-hidden rounded-2xl bg-white shadow-[0_40px_100px_-40px_rgba(21,18,58,0.55)] ring-1 ring-[#ecebf3]">
              <div className="relative h-24">
                <img className="h-full w-full object-cover" src={img("photo-1512864084360-7c0c4d0a0845", 760, 200)} alt="Kola's Cuts barbershop" />
                <span className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
              </div>
              <div className="grid gap-5 p-5 sm:grid-cols-[1fr_10rem]">
                <div>
                  <b className="text-lg">Kola&apos;s Cuts</b>
                  <p className="text-[0.82rem] text-[#6f6b8a]">Lekki Phase 1 · Haircut, 45 min · ₦8,000</p>
                  <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[0.72rem]">
                    {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                      <span key={i} className="text-[#9a97b3]">{d}</span>
                    ))}
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                      <span
                        key={d}
                        className={`flex aspect-square items-center justify-center rounded-md ${d === 11 ? "bg-[#6a4cf5] font-semibold text-white" : [3, 4, 5, 9, 10, 12, 16, 17, 18, 19, 23, 24].includes(d) ? "bg-[#f3f0ff] text-[#5638d9]" : "text-[#cbc8dc]"}`}
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 text-[0.82rem]" data-lp-cycle="1300">
                  <span className="mb-1 font-medium text-[#6f6b8a]">Thu 11 Dec</span>
                  {["09:00", "10:30", "12:00", "13:30", "15:00"].map((t, i) => (
                    <span key={t} data-c="" data-on={i === 2 ? "1" : "0"} className="rounded-lg py-1.5 text-center ring-1 ring-[#ecebf3] transition data-[on=1]:bg-[#6a4cf5] data-[on=1]:font-semibold data-[on=1]:text-white data-[on=1]:ring-[#6a4cf5]">
                      {t}
                    </span>
                  ))}
                  <span className="mt-auto rounded-lg bg-marigold-400 py-2 text-center font-semibold text-[#15123a]">Pay ₦4,000 deposit</span>
                </div>
              </div>
            </div>

            <div className="lp-float absolute -top-5 -right-4 hidden items-center gap-3 rounded-2xl bg-white p-3 text-[0.82rem] shadow-[0_20px_50px_-20px_rgba(21,18,58,0.4)] ring-1 ring-[#ecebf3] sm:flex">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><svg className="lp-i"><use href="#i-check" /></svg></span>
              <span><b className="block">Deposit received</b><span className="text-[#6f6b8a]">₦4,000 from Tobi O.</span></span>
            </div>
            <div className="lp-float absolute -bottom-6 -left-8 hidden items-center gap-3 rounded-2xl bg-white p-3 text-[0.82rem] shadow-[0_20px_50px_-20px_rgba(21,18,58,0.4)] ring-1 ring-[#ecebf3] sm:flex" style={{ animationDelay: "-3s" }}>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f3f0ff] text-[#6a4cf5]"><svg className="lp-i"><use href="#i-bell" /></svg></span>
              <span><b className="block">Reminder sent</b><span className="text-[#6f6b8a]">Your haircut is in 1 hour</span></span>
            </div>
          </div>
        </div>
      </section>

      {/* Who it's for ========================================================================== */}
      <section className="bg-[#f7f6fb] py-20 sm:py-24">
        <div className="lp-wrap">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold sm:text-[2.5rem] sm:leading-[1.15]">Made for people who sell their time</h2>
            <p className="mt-4 text-[1.05rem] text-[#5d5a78]">If customers book you, Book gets them to pay first and turn up.</p>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {WHO.map((w) => (
              <a key={w.t} href={start} className="lp-pcard group flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-[#ecebf3]">
                <div className="aspect-[4/3] overflow-hidden">
                  <img className="h-full w-full object-cover" src={img(w.p, 560, 420)} alt={w.t} loading="lazy" />
                </div>
                <div className="flex flex-1 items-start justify-between gap-4 p-5">
                  <span>
                    <b className="block text-[1.05rem]">{w.t}</b>
                    <span className="mt-1 block text-[0.9rem] text-[#5d5a78]">{w.d}</span>
                  </span>
                  <span className="lp-go flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f7f6fb]"><svg className="lp-i h-4 w-4"><use href="#i-arrow" /></svg></span>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* How it works ========================================================================== */}
      <section className="py-20 sm:py-24">
        <div className="lp-wrap grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <h2 className="text-3xl font-semibold sm:text-[2.5rem] sm:leading-[1.15]">Live in five minutes</h2>
            <p className="mt-4 max-w-md text-[1.05rem] text-[#5d5a78]">No website needed. Your page is ready the moment you add a service.</p>
            <ol className="mt-8 space-y-2">
              {[
                ["Make your page", "Add your services, prices and opening hours."],
                ["Share the link", "On WhatsApp, Instagram, your website or business card."],
                ["Get booked and paid", "Customers book and pay. You get an email, they get reminders."],
              ].map(([t, d], i) => (
                <li key={t} className="lp-step flex gap-4 rounded-2xl p-4">
                  <span className="lp-num flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f3f0ff] text-[0.9rem] font-semibold text-[#5638d9]">{i + 1}</span>
                  <span><b className="block">{t}</b><span className="text-[0.92rem] text-[#5d5a78]">{d}</span></span>
                </li>
              ))}
            </ol>
          </div>
          <div className="relative mx-auto w-full max-w-sm">
            <div className="rounded-[2rem] border-[6px] border-[#15123a] bg-[#e9e3d9] p-4 shadow-2xl">
              <div className="space-y-2 text-[0.85rem]">
                <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-[#d9fdd3] px-3 py-2">Book your haircut here, pay ₦4,000 to hold your slot:<br /><span className="font-medium text-[#1f6fd1]">book.workbasecore.com/kolascuts</span></p>
                <p className="w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-white px-3 py-2">Done! Thursday 1:30pm</p>
                <div className="lp-float ml-auto w-fit rounded-2xl bg-white px-3 py-2 shadow-md">
                  <span className="flex items-center gap-2 font-semibold"><svg className="lp-i h-4 w-4 text-emerald-600"><use href="#i-check" /></svg>Booking confirmed</span>
                  <span className="text-[0.78rem] text-[#6f6b8a]">Thu 11 Dec, 13:30 · Paid</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features ============================================================================== */}
      <section className="bg-[#f7f6fb] py-20 sm:py-24">
        <div className="lp-wrap">
          <h2 className="text-3xl font-semibold sm:text-[2.5rem] sm:leading-[1.15]">Everything a booking needs</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(([icon, t, d]) => (
              <div key={t} className="lp-fcard rounded-2xl border border-[#ecebf3] bg-white p-5">
                <span className="lp-ico flex h-11 w-11 items-center justify-center rounded-xl bg-[#f3f0ff] text-[#6a4cf5]"><svg className="lp-i"><use href={`#${icon}`} /></svg></span>
                <h3 className="mt-4 font-semibold">{t}</h3>
                <p className="mt-1 text-[0.9rem] text-[#5d5a78]">{d}</p>
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
            <p className="mt-4 text-[1.05rem] text-[#5d5a78]">Pay only when you get paid, or go Pro and keep every naira.</p>
          </div>
          <div className="mx-auto mt-12 grid max-w-3xl gap-4 md:grid-cols-2">
            <div className="lp-fcard flex flex-col rounded-3xl border border-[#ecebf3] bg-white p-7">
              <b>Free</b>
              <b className="mt-3 text-4xl font-semibold">₦0</b>
              <span className="text-[0.85rem] text-[#6f6b8a]">we keep 3% of each online payment</span>
              <ul className="mt-6 mb-8 space-y-2.5 text-[0.9rem] text-[#4a4766]">
                {["Unlimited services and bookings", "Deposits and reminders", "Meet links for video bookings"].map((x) => (
                  <li key={x} className="flex gap-2"><svg className="lp-i h-4 w-4 shrink-0 text-[#6a4cf5]"><use href="#i-check" /></svg>{x}</li>
                ))}
              </ul>
              <a href={start} className="lp-btn lp-btn-ghost mt-auto justify-center">Create your free page</a>
            </div>
            <div className="lp-fcard flex flex-col rounded-3xl bg-[#15123a] p-7 text-white shadow-[0_30px_70px_-30px_rgba(21,18,58,0.8)]">
              <b>Pro</b>
              <b className="mt-3 text-4xl font-semibold">₦2,000</b>
              <span className="text-[0.85rem] text-white/60">a month, no fees · includes Forms Pro</span>
              <ul className="mt-6 mb-8 space-y-2.5 text-[0.9rem] text-white/85">
                {["No 3% fee on payments", "No \"Powered by\" badge", "Your own brand colour"].map((x) => (
                  <li key={x} className="flex gap-2"><svg className="lp-i h-4 w-4 shrink-0 text-marigold-400"><use href="#i-check" /></svg>{x}</li>
                ))}
              </ul>
              <a href={pricing} className="lp-btn mt-auto justify-center bg-marigold-400 text-[#15123a] hover:bg-marigold-300">See Pro</a>
            </div>
          </div>
        </div>
      </section>

      {/* Call to action ======================================================================== */}
      <section className="pb-20">
        <div className="lp-wrap">
          <div className="relative grid items-center gap-8 overflow-hidden rounded-3xl bg-[#6a4cf5] p-8 text-white sm:p-12 lg:grid-cols-[1fr_auto]">
            <div className="lp-grid-bg pointer-events-none absolute inset-0 opacity-40 [filter:invert(1)]" aria-hidden="true" />
            <div className="relative">
              <h2 className="text-3xl font-semibold sm:text-[2.25rem]">Your booking page, ready today</h2>
              <p className="mt-3 text-[1.05rem] text-white/80">Free to start. Share the link on WhatsApp in five minutes.</p>
            </div>
            <div className="relative flex flex-wrap gap-3">
              <a href={start} className="lp-btn bg-white text-[#15123a] hover:-translate-y-px">Create your free page<svg className="lp-i h-4 w-4"><use href="#i-arrow" /></svg></a>
              <a href={signin} className="lp-btn text-white ring-1 ring-white/40 hover:bg-white/10">Sign in</a>
            </div>
          </div>
        </div>
      </section>

      <LandingFx kind="book" />
    </div>
  );
}
