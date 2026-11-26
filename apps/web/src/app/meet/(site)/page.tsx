import { MeetLanding } from "./landing";
import type { Metadata } from "next";
import Link from "next/link";
import { SavedRecordings } from "../recordings";
import { Icon, type IconName } from "@/components/icons";
import { SubmitButton } from "@/components/form";
import { InfoTip, Notice } from "@/components/ui";
import { meetingLink } from "@/lib/meet/paths";
import { getMeetUser, requestBase, requestOrigin } from "@/lib/meet/server";
import { naira, type MeetPlan, type MyMeeting } from "@/lib/meet/types";
import { UsageMeter } from "../usage-meter";
import { AttendanceButton } from "../attendance";
import { newMeeting } from "./actions";
import { CopyLink, JoinForm } from "./join-form";

export const metadata: Metadata = { title: { absolute: "Workbase Meet: free video meetings" } };

const FEATURES: Array<[IconName, string, string]> = [
  ["zap", "Data saver", "Audio-first, light video, and a live meter of the MB you've used."],
  ["globe", "Nothing to install", "Join from any browser or phone. Guests just type their name."],
  ["screenShare", "Share, react, chat", "Share your screen, react, raise your hand, chat, and blur the room behind you."],
  ["record", "Free recording", "Hosts record the call to their own device, with a sign everyone can see. Never stored online."],
  ["trash", "Nothing kept", "Chat is deleted when the meeting ends; the meeting itself after 7 days."],
  ["shield", "You're in control", "Waiting room, mute everyone, remove, lock the meeting."],
];

export default async function MeetHome({ searchParams }: { searchParams: Promise<{ scheduled?: string; sent?: string; of?: string; error?: string }> }) {
  const sp = await searchParams;
  const [{ supabase, user, name }, base, origin] = await Promise.all([getMeetUser(), requestBase(), requestOrigin()]);

  // Signed-out visitors get the landing page (approved design, 26 Nov 2026).
  if (!user) return <MeetLanding base={base} />;

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
          <p className="text-sm text-slate-500">Hi {name?.split(" ")[0] ?? "there"}</p>
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
        <div className="card flex flex-col justify-between gap-5 p-6">
          <div>
            <p className="text-sm font-medium text-slate-500">Your plan</p>
            <p className="mt-1 font-display text-2xl font-bold text-slate-900">
              {p?.promax ? "Meet Pro Max" : p?.tier === "pro" ? "Meet Pro" : "Free"}
              {p?.pool_kind === "company" && p.company_name && <span className="ml-2 align-middle text-sm font-normal text-slate-500">with {p.company_name}</span>}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {p?.tier === "pro" ? "Unlimited meetings, each up to 24 hours and 100 people." : "Meetings up to 1 hour and 25 people."}
              {p?.paid_until && ` Paid until ${new Date(p.paid_until).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.`}
            </p>
          </div>
          {p?.usage && (
            <div className="space-y-3">
              <UsageMeter compact label="Meeting time" used={p.usage.used} included={p.usage.included} unit="person-hours" />
              {p.promax && p.ai && <UsageMeter compact label="AI notes" used={p.ai.used} included={p.ai.included} unit="hours" />}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Link href={`${base}/usage`} className="btn-secondary btn-sm">Usage</Link>
            {p?.promax && <Link href={`${base}/notes`} className="btn-secondary btn-sm">AI notes</Link>}
            {p?.tier !== "pro" && <Link href={`${base}/pricing`} className="btn-primary btn-sm">Get Meet Pro, {naira(p?.pro_price_kobo ?? 300_000)}/month</Link>}
            {p?.tier === "pro" && !p.promax && <Link href={`${base}/pricing`} className="btn-primary btn-sm">Add AI notes (Pro Max)</Link>}
          </div>
        </div>
      </section>

      <SavedRecordings onlyPending />

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
            <InfoTip>Download who attended (join and leave times, minutes in the meeting) until a meeting is cleared, 7 days after it ends. In-meeting chat is deleted as soon as a meeting ends.</InfoTip>
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
        <span className="flex items-center gap-2">
          <span className="badge bg-slate-100 text-slate-500">Ended</span>
          <AttendanceButton code={m.code} />
        </span>
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
            {k === 2 && <span className="absolute top-1.5 left-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#f2a93b] text-[#15123a]"><Icon name="hand" className="h-3.5 w-3.5" /></span>}
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-center gap-2">
        {["mic", "video", "screenShare", "smile"].map((n) => (
          <span key={n} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10"><Icon name={n as IconName} className="h-4 w-4" /></span>
        ))}
        <span className="flex h-9 items-center rounded-full bg-red-600 px-3"><Icon name="hangUp" className="h-4 w-4" /></span>
      </div>
      <span className="absolute -top-3 -right-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#6a4cf5] shadow-lg"><Icon name="party" className="h-5 w-5" /></span>
    </div>
  );
}
