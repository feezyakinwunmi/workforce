import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";

/**
 * Bizz Padi landing page for signed-out visitors (26 Nov 2026, first version).
 * Follows the public-site rules: no pill labels above headings, no emojis, drawn icons only,
 * compact sizes, hover motion. The hero shows the product itself: a chat that turns one line
 * into a finished post with a flyer.
 */
export function PadiLanding({ base }: { base: string }) {
  const home = base || "/";
  const start = `/signup?next=${encodeURIComponent(`${base}/setup`)}`;

  const features: Array<{ icon: IconName; title: string; text: string }> = [
    { icon: "chat", title: "Talk, don't type captions", text: "Tell Padi what's happening in your business in plain words. It writes the post for every platform." },
    { icon: "sparkle", title: "Flyers in your colours", text: "Every post comes with a ready flyer in your brand colours. Change a word and it redraws." },
    { icon: "calendar", title: "A full week, planned", text: "One tap fills your week with posts that mix products, tips, offers and behind the scenes." },
    { icon: "clock", title: "The right time to post", text: "Padi picks Nigerian peak times for each platform, so posts land when your customers are online." },
    { icon: "check", title: "You approve everything", text: "Nothing goes out without your yes. Edit, approve or skip in seconds." },
    { icon: "megaphone", title: "Growth tools next", text: "Comment replies, finding customers, ads and influencers are on the way, in the same app." },
  ];

  return (
    <div>
      {/* Hero ---------------------------------------------------------------- */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:py-20">
        <div>
          <h1 className="font-display text-4xl font-bold leading-tight text-slate-900 sm:text-5xl">
            Your business posts, <span className="text-brand-600">done daily.</span>
          </h1>
          <p className="mt-4 max-w-lg text-lg text-slate-600">
            Bizz Padi is the social media manager that never sleeps. Tell it what's new, it writes the captions,
            makes the flyer and plans your week.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={start} className="btn-primary group">
              Start free <Icon name="arrowRight" className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </Link>
            <Link href={`/login?next=${encodeURIComponent(home)}`} className="btn-secondary">Sign in</Link>
          </div>
          <p className="mt-3 text-sm text-slate-500">Built in Lagos. Works for salons, food vendors, shops, churches, coaches and more.</p>
        </div>

        {/* Product preview: one message in, a finished post out. */}
        <div className="card relative overflow-hidden p-5 shadow-lg transition duration-500 hover:-translate-y-1 hover:shadow-xl">
          <div className="space-y-3 text-sm">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-4 py-2.5 text-white">
              New wigs in stock, ₦45k. Make a post for Friday.
            </p>
            <p className="w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-slate-100 px-4 py-2.5 text-slate-800">
              Done. Instagram, Facebook and WhatsApp captions are ready, flyer attached. I set it for Friday 7:30 pm.
            </p>
          </div>
          <div className="mt-4 grid grid-cols-[9rem_1fr] gap-4">
            {/* Mini flyer */}
            <div className="flex aspect-[4/5] flex-col justify-between rounded-xl bg-brand-600 p-3 text-white">
              <span className="text-[9px] font-bold tracking-wide">ADA'S HAIR</span>
              <span className="font-display text-lg font-bold leading-tight">Fresh wigs just landed</span>
              <span className="w-fit rounded-full bg-[#f2a93b] px-2.5 py-1 text-[10px] font-bold text-[#15123a]">Shop now</span>
            </div>
            <div className="space-y-2 text-xs">
              {["Instagram", "Facebook", "WhatsApp Status"].map((p, i) => (
                <div key={p} className="rounded-lg border border-slate-200 p-2.5 transition hover:border-brand-400" style={{ transitionDelay: `${i * 40}ms` }}>
                  <span className="font-semibold text-slate-900">{p}</span>
                  <span className="mt-1 block h-1.5 w-11/12 rounded bg-slate-200" />
                  <span className="mt-1 block h-1.5 w-2/3 rounded bg-slate-200" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features ------------------------------------------------------------- */}
      <section className="border-y border-slate-200 bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="max-w-xl font-display text-3xl font-bold text-slate-900">Consistency without the stress</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="group rounded-2xl border border-slate-200 p-5 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md">
                <Icon name={f.icon} className="h-6 w-6 text-brand-600 transition group-hover:scale-110 group-hover:rotate-[-6deg]" />
                <h3 className="mt-3 font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works --------------------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="font-display text-3xl font-bold text-slate-900">Three steps</h2>
        <ol className="mt-8 grid gap-6 sm:grid-cols-3">
          {[
            ["Tell Padi about your business", "What you sell, who buys, your colours. Two minutes, once."],
            ["Chat or plan the week", "Ask for one post or let Padi plan a full week for you."],
            ["Approve and post", "Download the flyer, copy the captions, post. Automatic posting is coming."],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-4">
              <span className="font-display text-3xl font-bold text-brand-200">{i + 1}</span>
              <span>
                <span className="block font-semibold text-slate-900">{t}</span>
                <span className="mt-1 block text-sm text-slate-600">{d}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-10 rounded-2xl bg-[#15123a] p-8 text-white sm:flex sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold">Stop going quiet on your pages.</h2>
            <p className="mt-1 text-white/70">Free while we're in early access.</p>
          </div>
          <Link href={start} className="btn-primary mt-5 sm:mt-0">Start free</Link>
        </div>
      </section>
    </div>
  );
}
