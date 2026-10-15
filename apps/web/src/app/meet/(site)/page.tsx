import type { Metadata } from "next";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { SubmitButton } from "@/components/form";
import { InfoTip, Notice } from "@/components/ui";
import { meetingLink } from "@/lib/meet/paths";
import { getMeetUser, requestBase, requestOrigin } from "@/lib/meet/server";
import type { MeetPlan, MyMeeting } from "@/lib/meet/types";
import { newMeeting } from "./actions";
import { CopyLink, JoinForm } from "./join-form";

export const metadata: Metadata = { title: { absolute: "Workbase Meet: free video meetings" } };

const FEATURES: Array<[IconName, string, string]> = [
  ["zap", "Data saver", "Audio-first, light video, and a live meter of the MB you've used."],
  ["globe", "Nothing to install", "Join from any browser or phone. Guests just type their name."],
  ["screenShare", "Share, react, chat", "Share your screen, react with 👍 ❤️ 😂 👏, raise your hand, chat beside the call."],
  ["sparkle", "Backgrounds", "Blur the room behind you or pick a picture. Done on your device."],
  ["trash", "Nothing kept", "Chat is deleted when the meeting ends; the meeting itself after 7 days. No recordings."],
  ["shield", "You're in control", "Waiting room, mute everyone, remove, lock the meeting."],
];

export default async function MeetHome({ searchParams }: { searchParams: Promise<{ scheduled?: string; sent?: string; of?: string; error?: string }> }) {
  const sp = await searchParams;
  const [{ supabase, user, name }, base, origin] = await Promise.all([getMeetUser(), requestBase(), requestOrigin()]);

  if (!user) {
    return (
      <>
        <section className="bg-[#0f0d26] text-white">
          <div className="mx-auto grid max-w-5xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-24">
            <div>
              <p className="mb-4 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-[#f2a93b] uppercase">Free · up to 1 hour · 25 people</p>
              <h1 className="font-display text-4xl leading-[1.05] font-bold tracking-tight sm:text-6xl">
                Video meetings that <span className="text-[#f2a93b]">respect your data.</span>
              </h1>
              <p className="mt-5 max-w-lg text-lg text-white/70">Built for Nigerian internet. Starts with audio, shows the MB you use, and works in any browser.</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-start">
                <Link href={`/signup?next=${encodeURIComponent(base || "/")}`} className="rounded-xl bg-[#6a4cf5] px-6 py-3 text-center font-semibold hover:bg-[#5b3fe0]">Start a free meeting</Link>
                <div className="flex-1 sm:max-w-xs"><JoinForm base={base} dark /></div>
              </div>
              <p className="mt-4 text-sm text-white/50">Already have a Workbase account? <Link className="underline underline-offset-4" href={`/login?next=${encodeURIComponent(base || "/")}`}>Sign in</Link></p>
            </div>
            <MeetingIllustration />
          </div>
        </section>
        <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(([icon, title, body]) => (
              <div key={title} className="card p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:text-brand-700"><Icon name={icon} className="h-5 w-5" /></span>
                <h2 className="mt-4 font-semibold text-slate-900">{title}</h2>
                <p className="mt-1 text-sm text-slate-500">{body}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link href={`${base}/pricing`} className="font-medium text-brand-700 hover:underline">Meet Pro: longer meetings and AI summaries, from ₦1,000 a month →</Link>
          </div>
        </section>
      </>
    );
  }

  const [{ data: meetings }, { data: plan }] = await Promise.all([supabase.rpc("meet_my_meetings"), supabase.rpc("meet_my_plan")]);
  const list = (meetings ?? []) as MyMeeting[];
  const p = plan as MeetPlan | null;
  const now = Date.now();
  const upcoming = list.filter((m) => m.starts_at && !m.ended_at && Date.parse(m.starts_at) + m.duration_minutes * 60_000 > now).sort((a, b) => Date.parse(a.starts_at!) - Date.parse(b.starts_at!));
  const recent = list.filter((m) => !upcoming.includes(m)).slice(0, 8);
  const fmt = (iso: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6">
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      {sp.scheduled && (
        <Notice tone="success">
          Meeting scheduled. {sp.of ? (Number(sp.sent) > 0 ? `Invites sent to ${sp.sent} of ${sp.of} people.` : "Email isn't set up, so share the link yourself.") : "Share the link with the people you want."}
        </Notice>
      )}
      <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="card p-6 sm:p-8">
          <p className="text-sm text-slate-500">Hi {name?.split(" ")[0] ?? "there"} 👋</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-slate-900">Start or join a meeting</h1>
          <div className="mt-6 flex flex-wrap gap-3">
            <form action={newMeeting}>
              <SubmitButton className="btn-primary px-5 py-3" pendingText="Starting…">
                <Icon name="video" className="h-4 w-4" />
                New meeting
              </SubmitButton>
            </form>
            <Link href={`${base}/schedule`} className="btn-secondary px-5 py-3"><Icon name="calendar" className="h-4 w-4" />Schedule</Link>
          </div>
          <div className="mt-6 max-w-md"><JoinForm base={base} /></div>
        </div>
        <div className="card flex flex-col justify-between p-6">
          <div>
            <p className="text-sm font-medium text-slate-500">Your plan</p>
            <p className="mt-1 font-display text-2xl font-bold text-slate-900">{p?.tier === "pro" ? "Meet Pro" : "Free"}</p>
            <p className="mt-1 text-sm text-slate-500">
              {p?.tier === "pro" ? "Meetings up to 24 hours and 50 people." : "Meetings up to 1 hour and 25 people."}
              {p?.paid_until && ` Paid until ${new Date(p.paid_until).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.`}
            </p>
          </div>
          {p?.tier !== "pro" && <Link href={`${base}/pricing`} className="btn-secondary mt-4 w-fit">Get Meet Pro, ₦1,000/month</Link>}
        </div>
      </section>

      <section className="card overflow-hidden">
        <h2 className="border-b border-slate-100 px-5 py-3 font-semibold text-slate-900">Upcoming</h2>
        {upcoming.length ? (
          <ul className="divide-y divide-slate-100">
            {upcoming.map((m) => (
              <MeetingRow key={m.id} m={m} when={fmt(m.starts_at!)} href={`${base}/${m.code}`} link={meetingLink(m.code, origin, base)} />
            ))}
          </ul>
        ) : (
          <p className="px-5 py-6 text-sm text-slate-500">Nothing scheduled. <Link className="font-medium text-brand-700 hover:underline" href={`${base}/schedule`}>Schedule a meeting</Link></p>
        )}
      </section>

      {recent.length > 0 && (
        <section className="card overflow-hidden">
          <h2 className="flex items-center gap-1.5 border-b border-slate-100 px-5 py-3 font-semibold text-slate-900">
            Recent
            <InfoTip>Meetings are cleared 7 days after they end. In-meeting chat is deleted as soon as a meeting ends.</InfoTip>
          </h2>
          <ul className="divide-y divide-slate-100">
            {recent.map((m) => (
              <MeetingRow key={m.id} m={m} when={fmt(m.started_at ?? m.starts_at ?? new Date().toISOString())} href={`${base}/${m.code}`} link={meetingLink(m.code, origin, base)} ended={!!m.ended_at} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function MeetingRow({ m, when, href, link, ended }: { m: MyMeeting; when: string; href: string; link: string; ended?: boolean }) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:text-brand-700"><Icon name="video" className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-slate-900">{m.title || "Instant meeting"}</span>
        <span className="block text-sm text-slate-500">{when}{m.is_host ? "" : ` · ${m.host_name}`}{m.invites ? ` · ${m.invites} invited` : ""}</span>
      </span>
      {ended ? (
        <span className="badge bg-slate-100 text-slate-500">Ended</span>
      ) : (
        <span className="flex gap-2">
          <CopyLink link={link} />
          <Link href={href} className="btn-primary btn-sm">{m.is_host ? "Start" : "Join"}</Link>
        </span>
      )}
    </li>
  );
}

function MeetingIllustration() {
  const people = [
    ["AO", "#6a4cf5", "Adaeze · Lagos"],
    ["TB", "#cc7a12", "Tunde · Accra"],
    ["CE", "#12968a", "Chiamaka · Nairobi"],
    ["KA", "#3b82f6", "Kemi · Toronto"],
  ];
  return (
    <div className="relative rounded-3xl bg-[#1a1740] p-4 shadow-2xl ring-1 ring-white/10" aria-hidden>
      <div className="mb-3 flex items-center justify-between text-xs text-white/60">
        <span className="font-mono">wbx-team-sync</span>
        <span className="rounded-full bg-white/10 px-2 py-0.5">4.2 MB</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {people.map(([i, c, n], k) => (
          <div key={i} className={`relative flex aspect-video items-center justify-center rounded-xl bg-[#26225a] ${k === 0 ? "ring-2 ring-emerald-400" : ""}`}>
            <span className="flex h-12 w-12 items-center justify-center rounded-full font-display text-lg font-bold" style={{ background: c }}>{i}</span>
            <span className="absolute bottom-1.5 left-2 text-[11px] text-white/80">{n}</span>
            {k === 2 && <span className="absolute top-1.5 left-2 rounded-full bg-[#f2a93b] px-1.5 text-sm">✋</span>}
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-center gap-2">
        {["mic", "video", "screenShare", "smile"].map((n) => (
          <span key={n} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10"><Icon name={n as IconName} className="h-4 w-4" /></span>
        ))}
        <span className="flex h-9 items-center rounded-full bg-red-600 px-3"><Icon name="hangUp" className="h-4 w-4" /></span>
      </div>
      <span className="absolute -top-3 -right-3 rounded-2xl bg-white px-3 py-2 text-2xl shadow-lg">👏</span>
    </div>
  );
}
