import { LandingFx } from "@/components/landing/fx";
import { LandingSprite } from "@/components/landing/sprite";

/**
 * Workbase Meet landing page for signed-out visitors (signed-in people get their meetings
 * list in page.tsx instead). Built from the design prototype Femi approved on 26 Nov 2026.
 *
 *   Hero             headline, New meeting button, join-by-code box, and a live call picture
 *   What you can do  five tabs, each with a small working demo (fx.tsx switches them)
 *   Small things     eight cards whose icons move on hover
 *   Bad networks     dark band with a live network meter
 *   Pricing          Free / Pro / Business, in naira
 *   Call to action
 *
 * The header and footer come from the Meet layout. Styling: Tailwind + "lp-" classes in
 * globals.css; behaviour in components/landing/fx.tsx (the page reads fine without it).
 */
export function MeetLanding({ base }: { base: string }) {
  const home = base || "/";
  const start = `/signup?next=${encodeURIComponent(home)}`;
  const signin = `/login?next=${encodeURIComponent(home)}`;
  const pricing = `${base}/pricing`;

  return (
    <div className="lp overflow-x-clip">
      <LandingSprite />
      <div>
      {/* Hero: copy and join box on the left, a live call on the right */}
      <section id="lp-hero" className="relative overflow-hidden">
        <div className="lp-grid-bg pointer-events-none absolute inset-0" aria-hidden="true"></div>
        <div className="lp-spot pointer-events-none absolute inset-0" aria-hidden="true"></div>
        <div className="lp-wrap relative grid items-center gap-12 py-16 lg:grid-cols-[1fr_1.15fr] lg:py-20">
          <div>
            <h1 className="text-[2.35rem] font-semibold leading-[1.1] sm:text-5xl lg:text-[3.25rem]">Video calls that keep going on <span className="text-[#6a4cf5]">Nigerian internet</span></h1>
            <p className="mt-5 max-w-md text-[1.05rem] leading-relaxed text-[#5c5c66]">Meet your team, clients and guests in the browser. Sound stays clear when the network dips, and you see exactly how much data you use.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href={start} className="lp-btn lp-btn-main justify-center"><svg className="lp-i h-4 w-4"><use href="#i-video"/></svg>New meeting</a>
              <form id="lp-joinform" className="flex flex-1 items-center gap-2 rounded-xl bg-white p-1 pl-3 ring-1 ring-[#e4e1f0] focus-within:ring-[#111113] sm:max-w-xs">
                <svg className="lp-i h-4 w-4 shrink-0 text-[#9a97b3]"><use href="#i-list"/></svg>
                <label htmlFor="lp-code" className="sr-only">Meeting code</label>
                <input id="lp-code" className="min-w-0 flex-1 bg-transparent text-[0.92rem] outline-none placeholder:text-[#9a97b3]" placeholder="Enter a code or link" />
                <button className="rounded-lg px-3 py-2 text-[0.88rem] font-semibold text-[#5638d9] hover:bg-[#f4f4f5]">Join</button>
              </form>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[0.88rem] text-[#5c5c66]">
              <span className="flex items-center gap-2"><svg className="lp-i h-4 w-4 text-[#6a4cf5]"><use href="#i-check"/></svg>Free up to 1 hour</span>
              <span className="flex items-center gap-2"><svg className="lp-i h-4 w-4 text-[#6a4cf5]"><use href="#i-check"/></svg>No app to install</span>
              <span className="flex items-center gap-2"><svg className="lp-i h-4 w-4 text-[#6a4cf5]"><use href="#i-check"/></svg>Guests join with a link</span>
            </div>
          </div>

          {/* Live call */}
          <div className="relative">
            <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-[radial-gradient(60%_60%_at_50%_45%,rgba(0,0,0,0.28),transparent_70%)] blur-2xl" aria-hidden="true"></div>
            <div className="overflow-hidden rounded-2xl bg-[#0c0c0e] p-3 text-white shadow-[0_40px_100px_-40px_rgba(21,18,58,0.8)]">
              <div className="flex items-center justify-between px-1 pb-3 text-[0.78rem] text-white/60">
                <b className="text-white">Client review · Kemi &amp; Co</b>
                <span className="flex items-center gap-3"><span className="flex items-center gap-1.5 rounded-md bg-red-500/15 px-2 py-0.5 font-medium text-red-300"><i className="lp-blink h-1.5 w-1.5 rounded-full bg-red-400"></i>Rec <span id="lp-rec">12:08</span></span><span className="lp-bars flex items-end gap-0.5"><i className="h-1.5 w-1 rounded-sm bg-emerald-400"></i><i className="h-2.5 w-1 rounded-sm bg-emerald-400" style={{"animationDelay": ".2s"}}></i><i className="h-3.5 w-1 rounded-sm bg-emerald-400" style={{"animationDelay": ".4s"}}></i></span><span id="lp-mb">18.4 MB</span></span>
              </div>
              <div className="grid grid-cols-2 gap-2" id="lp-tiles">
                <div className="relative aspect-[4/3] overflow-hidden rounded-xl"><img className="h-full w-full object-cover" src="https://images.unsplash.com/photo-1612299273045-362a39972259?w=440&h=330&fit=crop&auto=format" alt="Femi in the call" /><span className="absolute bottom-2 left-2 rounded-md bg-black/50 px-2 py-0.5 text-[0.72rem] backdrop-blur">Femi (host)</span><span className="lp-spk absolute inset-0 rounded-xl ring-2 ring-marigold-400 ring-inset transition-opacity duration-300"></span></div>
                <div className="relative aspect-[4/3] overflow-hidden rounded-xl"><img className="h-full w-full object-cover" src="https://images.unsplash.com/photo-1604933762021-54a5858c9832?w=440&h=330&fit=crop&auto=format" alt="Kemi in the call" /><span className="absolute bottom-2 left-2 rounded-md bg-black/50 px-2 py-0.5 text-[0.72rem] backdrop-blur">Kemi (guest)</span><span className="lp-spk absolute inset-0 rounded-xl opacity-0 ring-2 ring-marigold-400 ring-inset transition-opacity duration-300"></span><span className="lp-float-up absolute bottom-10 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-marigold-400 text-[#111113]"><svg className="lp-i h-5 w-5"><use href="#i-hand"/></svg></span></div>
                <div className="relative aspect-[4/3] overflow-hidden rounded-xl"><img className="h-full w-full object-cover" src="https://images.unsplash.com/photo-1594077810908-9ffd89d704ac?w=440&h=330&fit=crop&auto=format" alt="Ifeanyi in the call" /><span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/50 px-2 py-0.5 text-[0.72rem] backdrop-blur"><svg className="lp-i h-3 w-3 text-red-300"><use href="#i-mic"/></svg>Ifeanyi</span><span className="lp-spk absolute inset-0 rounded-xl opacity-0 ring-2 ring-marigold-400 ring-inset transition-opacity duration-300"></span></div>
                <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-[#2b2466]"><span className="absolute inset-0 m-auto flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-lg font-semibold">GA</span><span className="absolute bottom-2 left-2 rounded-md bg-black/50 px-2 py-0.5 text-[0.72rem] backdrop-blur">Grace · camera off</span><span className="lp-spk absolute inset-0 rounded-xl opacity-0 ring-2 ring-marigold-400 ring-inset transition-opacity duration-300"></span></div>
              </div>
              <div className="mt-3 flex items-center justify-center gap-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20"><svg className="lp-i h-[1.1rem] w-[1.1rem]"><use href="#i-mic"/></svg></span>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20"><svg className="lp-i h-[1.1rem] w-[1.1rem]"><use href="#i-video"/></svg></span>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20"><svg className="lp-i h-[1.1rem] w-[1.1rem]"><use href="#i-share"/></svg></span>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20"><svg className="lp-i h-[1.1rem] w-[1.1rem]"><use href="#i-hand"/></svg></span>
                <span className="flex h-10 w-14 items-center justify-center rounded-full bg-red-500 text-[0.78rem] font-semibold">Leave</span>
              </div>
            </div>
            <div className="lp-float absolute -left-10 -bottom-6 hidden w-60 rounded-2xl bg-white p-3 text-[0.82rem] shadow-[0_20px_50px_-20px_rgba(21,18,58,0.4)] ring-1 ring-[#ececef] sm:block" id="lp-chatcard">
              <span className="flex items-center gap-2"><img className="h-7 w-7 rounded-full object-cover" src="https://images.unsplash.com/photo-1604933762021-54a5858c9832?w=60&h=60&fit=crop&auto=format" alt="" /><b>Kemi</b><span className="text-[#9a97b3]">now</span></span>
              <p className="lp-chat-in mt-1.5 text-[#52525b]" id="lp-chatmsg">Can you share the new designs?</p>
            </div>
            <div className="lp-float absolute -right-4 -top-4 hidden items-center gap-2 rounded-xl bg-white px-3 py-2 text-[0.82rem] font-medium shadow-[0_20px_50px_-20px_rgba(21,18,58,0.4)] ring-1 ring-[#ececef] sm:flex" style={{"animationDelay": "-3s"}}>
              <svg className="lp-i h-4 w-4 text-[#6a4cf5]"><use href="#i-user-plus"/></svg>Bisi is waiting to join <span className="ml-1 rounded-md bg-[#111113] px-2 py-0.5 text-[0.72rem] font-semibold text-white">Admit</span>
            </div>
          </div>
        </div>
      </section>

      {/* What you can do: tabs on the left, a live picture on the right */}
      <section id="can" className="bg-[#f7f7f8] py-20 sm:py-24">
        <div className="lp-wrap">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold sm:text-[2.5rem] sm:leading-[1.15]">What you can do in Meet</h2>
            <p className="mt-4 text-[1.05rem] text-[#5c5c66]">Everything a meeting needs, with nothing to download.</p>
          </div>
          <div className="mt-12 grid gap-6 lg:grid-cols-[22rem_1fr]" id="lp-feat">
            <div role="tablist" aria-label="Meet features" className="flex flex-col gap-1.5">
              <button role="tab" aria-selected="true" className="lp-ftab group relative flex gap-4 overflow-hidden rounded-2xl p-4 text-left transition" data-f="0"><span className="lp-ico flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#6a4cf5] ring-1 ring-[#ececef]"><svg className="lp-i"><use href="#i-link"/></svg></span><span><b className="block text-[0.98rem]">Invite anyone by link</b><span className="block text-[0.86rem] text-[#5c5c66]">Guests type their name and join.</span></span><span className="lp-prog absolute bottom-0 left-4 right-4 h-0.5 bg-[#111113]"></span></button>
              <button role="tab" aria-selected="false" className="lp-ftab group relative flex gap-4 overflow-hidden rounded-2xl p-4 text-left transition" data-f="1"><span className="lp-ico flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#6a4cf5] ring-1 ring-[#ececef]"><svg className="lp-i"><use href="#i-lock"/></svg></span><span><b className="block text-[0.98rem]">Waiting room and co-hosts</b><span className="block text-[0.86rem] text-[#5c5c66]">You decide who comes in.</span></span><span className="lp-prog absolute bottom-0 left-4 right-4 h-0.5 bg-[#111113]"></span></button>
              <button role="tab" aria-selected="false" className="lp-ftab group relative flex gap-4 overflow-hidden rounded-2xl p-4 text-left transition" data-f="2"><span className="lp-ico flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#6a4cf5] ring-1 ring-[#ececef]"><svg className="lp-i"><use href="#i-share"/></svg></span><span><b className="block text-[0.98rem]">Share your screen</b><span className="block text-[0.86rem] text-[#5c5c66]">Slides, designs, a spreadsheet.</span></span><span className="lp-prog absolute bottom-0 left-4 right-4 h-0.5 bg-[#111113]"></span></button>
              <button role="tab" aria-selected="false" className="lp-ftab group relative flex gap-4 overflow-hidden rounded-2xl p-4 text-left transition" data-f="3"><span className="lp-ico flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#6a4cf5] ring-1 ring-[#ececef]"><svg className="lp-i"><use href="#i-rec"/></svg></span><span><b className="block text-[0.98rem]">Record for free</b><span className="block text-[0.86rem] text-[#5c5c66]">Saved on your device, not ours.</span></span><span className="lp-prog absolute bottom-0 left-4 right-4 h-0.5 bg-[#111113]"></span></button>
              <button role="tab" aria-selected="false" className="lp-ftab group relative flex gap-4 overflow-hidden rounded-2xl p-4 text-left transition" data-f="4"><span className="lp-ico flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#6a4cf5] ring-1 ring-[#ececef]"><svg className="lp-i"><use href="#i-party"/></svg></span><span><b className="block text-[0.98rem]">Celebrate your people</b><span className="block text-[0.86rem] text-[#5c5c66]">Birthdays, wins and welcomes.</span></span><span className="lp-prog absolute bottom-0 left-4 right-4 h-0.5 bg-[#111113]"></span></button>
            </div>

            <div className="relative min-h-[24rem] overflow-hidden rounded-3xl bg-[#0c0c0e] p-6 text-white" id="lp-views">
              {/* 0 link */}
              <div className="lp-screen grid h-full place-items-center" data-v="0">
                <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-[#111113]">
                  <b className="text-lg">Join "Client review"</b>
                  <p className="mt-1 text-[0.88rem] text-[#6b6b75]">Femi invited you. No account needed.</p>
                  <label className="mt-5 block text-[0.8rem] font-medium text-[#5c5c66]">Your name</label>
                  <div className="mt-1 flex h-10 items-center rounded-lg border border-[#111113] px-3 text-[0.92rem] ring-4 ring-[#e7e1ff]" id="lp-typed"></div>
                  <span className="mt-4 block rounded-lg bg-[#111113] py-2.5 text-center text-[0.9rem] font-semibold text-white">Ask to join</span>
                </div>
              </div>
              {/* 1 waiting room */}
              <div className="lp-screen h-full" data-v="1" hidden>
                <b>People waiting</b>
                <ul className="mt-4 space-y-2.5">
                  <li className="flex items-center gap-3 rounded-xl bg-white/5 p-3 ring-1 ring-white/10"><img className="h-10 w-10 rounded-full object-cover" src="https://images.unsplash.com/photo-1765648684898-2213d6b11c5d?w=80&h=80&fit=crop&auto=format" alt="" /><span className="flex-1"><b className="block text-[0.9rem]">Bisi Adeyemi</b><span className="text-[0.78rem] text-white/50">Guest</span></span><span className="rounded-lg bg-[#111113] px-3 py-1.5 text-[0.8rem] font-semibold">Admit</span><span className="rounded-lg bg-white/10 px-3 py-1.5 text-[0.8rem]">Deny</span></li>
                  <li className="flex items-center gap-3 rounded-xl bg-white/5 p-3 ring-1 ring-white/10"><img className="h-10 w-10 rounded-full object-cover" src="https://images.unsplash.com/photo-1638514351607-585e69bbbb7e?w=80&h=80&fit=crop&auto=format" alt="" /><span className="flex-1"><b className="block text-[0.9rem]">Tobi Okon</b><span className="text-[0.78rem] text-white/50">Guest</span></span><span className="rounded-lg bg-[#111113] px-3 py-1.5 text-[0.8rem] font-semibold">Admit</span><span className="rounded-lg bg-white/10 px-3 py-1.5 text-[0.8rem]">Deny</span></li>
                </ul>
                <div className="mt-5 grid gap-2 text-[0.85rem] sm:grid-cols-3">
                  <span className="flex items-center gap-2 rounded-xl bg-white/5 p-3"><svg className="lp-i h-4 w-4 text-marigold-400"><use href="#i-lock"/></svg>Lock meeting</span>
                  <span className="flex items-center gap-2 rounded-xl bg-white/5 p-3"><svg className="lp-i h-4 w-4 text-marigold-400"><use href="#i-mic"/></svg>Mute everyone</span>
                  <span className="flex items-center gap-2 rounded-xl bg-white/5 p-3"><svg className="lp-i h-4 w-4 text-marigold-400"><use href="#i-users"/></svg>Make co-host</span>
                </div>
              </div>
              {/* 2 screen share */}
              <div className="lp-screen grid h-full gap-3 sm:grid-cols-[1fr_9rem]" data-v="2" hidden>
                <div className="rounded-xl bg-white p-4 text-[#111113]">
                  <span className="text-[0.75rem] text-[#6b6b75]">Femi is presenting</span>
                  <b className="mt-1 block">Q4 sales by month</b>
                  <div className="mt-4 flex h-40 items-end gap-2">
                    <span className="lp-grow flex-1 rounded-t bg-[#d9d0ff]" style={{"height": "40%"}}></span><span className="lp-grow flex-1 rounded-t bg-[#c2b3ff]" style={{"height": "55%", "animationDelay": ".08s"}}></span><span className="lp-grow flex-1 rounded-t bg-[#a28bff]" style={{"height": "48%", "animationDelay": ".16s"}}></span><span className="lp-grow flex-1 rounded-t bg-[#111113]" style={{"height": "72%", "animationDelay": ".24s"}}></span><span className="lp-grow flex-1 rounded-t bg-[#111113]" style={{"height": "90%", "animationDelay": ".32s"}}></span><span className="lp-grow flex-1 rounded-t bg-marigold-400" style={{"height": "100%", "animationDelay": ".4s"}}></span>
                  </div>
                </div>
                <div className="hidden flex-col gap-2 sm:flex"><img className="aspect-[4/3] w-full rounded-lg object-cover" src="https://images.unsplash.com/photo-1612299273045-362a39972259?w=200&h=150&fit=crop&auto=format" alt="" /><img className="aspect-[4/3] w-full rounded-lg object-cover" src="https://images.unsplash.com/photo-1604933762021-54a5858c9832?w=200&h=150&fit=crop&auto=format" alt="" /><img className="aspect-[4/3] w-full rounded-lg object-cover" src="https://images.unsplash.com/photo-1594077810908-9ffd89d704ac?w=200&h=150&fit=crop&auto=format" alt="" /></div>
              </div>
              {/* 3 recording */}
              <div className="lp-screen grid h-full place-items-center" data-v="3" hidden>
                <div className="w-full max-w-sm">
                  <div className="relative overflow-hidden rounded-xl"><img className="aspect-video w-full object-cover" src="https://images.unsplash.com/photo-1573878414075-be35f08479e5?w=600&h=340&fit=crop&auto=format" alt="" /><span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-md bg-red-500 px-2 py-0.5 text-[0.75rem] font-semibold"><i className="lp-blink h-1.5 w-1.5 rounded-full bg-white"></i>REC 24:16</span></div>
                  <div className="mt-4 flex items-center gap-3 rounded-xl bg-white p-3 text-[#111113]"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600"><svg className="lp-i"><use href="#i-check"/></svg></span><span className="flex-1"><b className="block text-[0.9rem]">Recording saved</b><span className="text-[0.78rem] text-[#6b6b75]">Client-review.webm · 142 MB</span></span><span className="rounded-lg bg-[#111113] px-3 py-1.5 text-[0.8rem] font-semibold text-white">Download</span></div>
                </div>
              </div>
              {/* 4 celebrate */}
              <div className="lp-screen relative grid h-full place-items-center text-center" data-v="4" hidden>
                <canvas id="lp-confetti" className="pointer-events-none absolute inset-0 h-full w-full"></canvas>
                <div className="relative">
                  <div className="mx-auto h-28 w-28 rounded-full bg-[conic-gradient(#f2a93b,#6a4cf5,#f2a93b)] p-1 [animation:lp-spin_6s_linear_infinite]"><img className="h-full w-full rounded-full border-4 border-[#0c0c0e] object-cover" src="https://images.unsplash.com/photo-1573878414075-be35f08479e5?w=240&h=240&fit=crop&auto=format" alt="" /></div>
                  <b className="mt-4 block text-2xl">Happy birthday, Chiamaka</b>
                  <span className="mt-1 block text-white/60">From Femi and the team</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Smaller things, each with an icon that moves on hover */}
      <section className="py-20 sm:py-24">
        <div className="lp-wrap">
          <h2 className="text-3xl font-semibold sm:text-[2.5rem] sm:leading-[1.15]">And the small things that matter</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lp-fcard rounded-2xl border border-[#ececef] bg-white p-5"><span className="lp-ico flex h-11 w-11 items-center justify-center rounded-xl bg-[#f4f4f5] text-[#6a4cf5]"><svg className="lp-i"><use href="#i-wave"/></svg></span><h3 className="mt-4 font-semibold">Noise cancellation</h3><p className="mt-1 text-[0.9rem] text-[#5c5c66]">Generators and traffic fade out between sentences.</p></div>
            <div className="lp-fcard rounded-2xl border border-[#ececef] bg-white p-5"><span className="lp-ico flex h-11 w-11 items-center justify-center rounded-xl bg-[#f4f4f5] text-[#6a4cf5]"><svg className="lp-i"><use href="#i-list"/></svg></span><h3 className="mt-4 font-semibold">Attendance report</h3><p className="mt-1 text-[0.9rem] text-[#5c5c66]">Who joined, when, and for how long, as a spreadsheet.</p></div>
            <div className="lp-fcard rounded-2xl border border-[#ececef] bg-white p-5"><span className="lp-ico flex h-11 w-11 items-center justify-center rounded-xl bg-[#f4f4f5] text-[#6a4cf5]"><svg className="lp-i"><use href="#i-sparkle"/></svg></span><h3 className="mt-4 font-semibold">Blur or change background</h3><p className="mt-1 text-[0.9rem] text-[#5c5c66]">Works on phones too, right in the browser.</p></div>
            <div className="lp-fcard rounded-2xl border border-[#ececef] bg-white p-5"><span className="lp-ico flex h-11 w-11 items-center justify-center rounded-xl bg-[#f4f4f5] text-[#6a4cf5]"><svg className="lp-i"><use href="#i-mail"/></svg></span><h3 className="mt-4 font-semibold">Scheduled invites</h3><p className="mt-1 text-[0.9rem] text-[#5c5c66]">Calendar invites with a reminder 10 minutes before.</p></div>
            <div className="lp-fcard rounded-2xl border border-[#ececef] bg-white p-5"><span className="lp-ico flex h-11 w-11 items-center justify-center rounded-xl bg-[#f4f4f5] text-[#6a4cf5]"><svg className="lp-i"><use href="#i-hand"/></svg></span><h3 className="mt-4 font-semibold">Raise hand and react</h3><p className="mt-1 text-[0.9rem] text-[#5c5c66]">Speak in turn without talking over people.</p></div>
            <div className="lp-fcard rounded-2xl border border-[#ececef] bg-white p-5"><span className="lp-ico flex h-11 w-11 items-center justify-center rounded-xl bg-[#f4f4f5] text-[#6a4cf5]"><svg className="lp-i"><use href="#i-chat"/></svg></span><h3 className="mt-4 font-semibold">Chat during the call</h3><p className="mt-1 text-[0.9rem] text-[#5c5c66]">Share links and notes. Deleted when the meeting ends.</p></div>
            <div className="lp-fcard rounded-2xl border border-[#ececef] bg-white p-5"><span className="lp-ico flex h-11 w-11 items-center justify-center rounded-xl bg-[#f4f4f5] text-[#6a4cf5]"><svg className="lp-i"><use href="#i-browser"/></svg></span><h3 className="mt-4 font-semibold">Any browser, any phone</h3><p className="mt-1 text-[0.9rem] text-[#5c5c66]">Chrome, Safari, Edge. Nothing to install.</p></div>
            <div className="lp-fcard rounded-2xl border border-[#ececef] bg-white p-5"><span className="lp-ico flex h-11 w-11 items-center justify-center rounded-xl bg-[#f4f4f5] text-[#6a4cf5]"><svg className="lp-i"><use href="#i-shield"/></svg></span><h3 className="mt-4 font-semibold">Nothing kept</h3><p className="mt-1 text-[0.9rem] text-[#5c5c66]">Meetings and chat are deleted 7 days after they end.</p></div>
          </div>
        </div>
      </section>

      {/* Bad networks: dark band with a live data meter */}
      <section id="network" className="relative overflow-hidden bg-[#111113] py-20 text-white sm:py-24">
        <div className="lp-wrap grid items-center gap-12 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-semibold sm:text-[2.5rem] sm:leading-[1.15]">Built for the network you actually have</h2>
            <p className="mt-4 max-w-md text-[1.05rem] text-white/70">When the signal drops, Meet lowers video first and keeps your voice. Data saver turns on by itself, and the meter shows every megabyte.</p>
            <div className="mt-8 grid max-w-md grid-cols-3 gap-4">
              <div><b className="block text-3xl font-semibold tabular-nums"><span data-count="55">0</span>%</b><span className="text-[0.82rem] text-white/60">less data in a 5-person call</span></div>
              <div><b className="block text-3xl font-semibold tabular-nums"><span data-count="100">0</span></b><span className="text-[0.82rem] text-white/60">people on Pro</span></div>
              <div><b className="block text-3xl font-semibold tabular-nums"><span data-count="24">0</span>h</b><span className="text-[0.82rem] text-white/60">longest Pro meeting</span></div>
            </div>
          </div>
          <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
            <div className="flex items-center justify-between text-[0.85rem]"><b>Your connection</b><span className="flex items-center gap-2 text-white/60" id="lp-netlabel">Good</span></div>
            <div className="mt-5 flex h-24 items-end gap-1" id="lp-netbars"></div>
            <div className="mt-5 grid grid-cols-3 gap-3 text-[0.82rem]">
              <span className="rounded-xl bg-white/5 p-3"><span className="block text-white/50">Video</span><b id="lp-netq">HD</b></span>
              <span className="rounded-xl bg-white/5 p-3"><span className="block text-white/50">Sound</span><b className="text-emerald-300">Clear</b></span>
              <span className="rounded-xl bg-white/5 p-3"><span className="block text-white/50">Data used</span><b className="tabular-nums" id="lp-netmb">18.4 MB</b></span>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 sm:py-24">
        <div className="lp-wrap">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold sm:text-[2.5rem] sm:leading-[1.15]">Simple prices in naira</h2>
            <p className="mt-4 text-[1.05rem] text-[#5c5c66]">Start free. Upgrade when your meetings run longer.</p>
          </div>
          <div className="mx-auto mt-12 grid max-w-5xl gap-4 md:grid-cols-3">
            <div className="lp-fcard flex flex-col rounded-3xl border border-[#ececef] bg-white p-7"><b>Free</b><b className="mt-3 text-4xl font-semibold">₦0</b><span className="text-[0.85rem] text-[#6b6b75]">forever</span><ul className="mt-6 space-y-2.5 text-[0.9rem] text-[#52525b]"><li className="flex gap-2"><svg className="lp-i h-4 w-4 shrink-0 text-[#6a4cf5]"><use href="#i-check"/></svg>Meetings up to 1 hour</li><li className="flex gap-2"><svg className="lp-i h-4 w-4 shrink-0 text-[#6a4cf5]"><use href="#i-check"/></svg>Up to 25 people</li><li className="flex gap-2"><svg className="lp-i h-4 w-4 shrink-0 text-[#6a4cf5]"><use href="#i-check"/></svg>Recording and screen sharing</li></ul><a href={start} className="lp-btn lp-btn-ghost mt-8 justify-center">Start free</a></div>
            <div className="lp-fcard relative flex flex-col rounded-3xl bg-[#111113] p-7 text-white shadow-[0_30px_70px_-30px_rgba(21,18,58,0.8)]"><b>Pro</b><b className="mt-3 text-4xl font-semibold">₦3,000</b><span className="text-[0.85rem] text-white/60">per host a month</span><ul className="mt-6 space-y-2.5 text-[0.9rem] text-white/85"><li className="flex gap-2"><svg className="lp-i h-4 w-4 shrink-0 text-marigold-400"><use href="#i-check"/></svg>Meetings up to 24 hours</li><li className="flex gap-2"><svg className="lp-i h-4 w-4 shrink-0 text-marigold-400"><use href="#i-check"/></svg>Up to 100 people</li><li className="flex gap-2"><svg className="lp-i h-4 w-4 shrink-0 text-marigold-400"><use href="#i-check"/></svg>Everything in Free</li></ul><a href={pricing} className="lp-btn mt-8 justify-center bg-marigold-400 text-[#111113] hover:bg-marigold-300">Get Pro</a></div>
            <div className="lp-fcard flex flex-col rounded-3xl border border-[#ececef] bg-white p-7"><b>Business</b><b className="mt-3 text-4xl font-semibold">₦30,000</b><span className="text-[0.85rem] text-[#6b6b75]">a month for 10 hosts</span><ul className="mt-6 space-y-2.5 text-[0.9rem] text-[#52525b]"><li className="flex gap-2"><svg className="lp-i h-4 w-4 shrink-0 text-[#6a4cf5]"><use href="#i-check"/></svg>Pro for 10 people</li><li className="flex gap-2"><svg className="lp-i h-4 w-4 shrink-0 text-[#6a4cf5]"><use href="#i-check"/></svg>One bill for the company</li><li className="flex gap-2"><svg className="lp-i h-4 w-4 shrink-0 text-[#6a4cf5]"><use href="#i-check"/></svg>Included with Workbase Standard</li></ul><a href={pricing} className="lp-btn lp-btn-ghost mt-8 justify-center">Choose Business</a></div>
          </div>
        </div>
      </section>

      <section className="pb-20">
        <div className="lp-wrap">
          <div className="relative grid items-center gap-8 overflow-hidden rounded-3xl bg-[#111113] p-8 text-white sm:p-12 lg:grid-cols-[1fr_auto]">
            <div className="lp-grid-bg pointer-events-none absolute inset-0 opacity-40 [filter:invert(1)]" aria-hidden="true"></div>
            <div className="relative"><h2 className="text-3xl font-semibold sm:text-[2.25rem]">Start a meeting in seconds</h2><p className="mt-3 text-[1.05rem] text-white/80">Free up to an hour. Send the link on WhatsApp.</p></div>
            <div className="relative flex flex-wrap gap-3"><a href={start} className="lp-btn bg-white text-[#111113] hover:-translate-y-px"><svg className="lp-i h-4 w-4"><use href="#i-video"/></svg>New meeting</a><a href={signin} className="lp-btn text-white ring-1 ring-white/40 hover:bg-white/10">Sign in</a></div>
          </div>
        </div>
      </section>
      </div>
      <LandingFx kind="meet" meetBase={base} />
    </div>
  );
}
