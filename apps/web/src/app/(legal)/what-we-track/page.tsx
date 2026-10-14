import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME, SUPPORT_EMAIL } from "@/lib/config";

export const metadata: Metadata = {
  title: "What we track",
  description: `Exactly what the ${APP_NAME} desktop app records, when, and who can see it.`,
};

const Yes = () => <span aria-label="Recorded" className="mr-2 font-bold text-emerald-600">✓</span>;
const No = () => <span aria-label="Never recorded" className="mr-2 font-bold text-slate-400">✕</span>;

export default function WhatWeTrackPage() {
  return (
    <article>
      <h1>What we track</h1>
      <p className="mt-3 text-lg text-slate-600">
        Plain answers for workers whose company uses {APP_NAME}. If something here is unclear, ask your company admin or
        write to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <section className="card p-5">
          <h2 className="mt-0 text-base">Recorded, only while you are clocked in</h2>
          <ul className="list-none pl-0 text-sm">
            <li><Yes />When you clock in and out</li>
            <li><Yes />Whether the keyboard or mouse was used in each 10-second check (yes or no, nothing else)</li>
            <li><Yes />Time away from the computer, and your answer when asked if it was work</li>
            <li><Yes />The app in front and its window title, if your company turned this on</li>
            <li><Yes />The task you picked under &ldquo;Working on&rdquo;</li>
            <li><Yes />Your end-of-day report, if you write one</li>
          </ul>
        </section>
        <section className="card p-5">
          <h2 className="mt-0 text-base">Never recorded</h2>
          <ul className="list-none pl-0 text-sm">
            <li><No />Anything at all while you are clocked out</li>
            <li><No />What you type: no keystrokes, passwords or messages</li>
            <li><No />Screenshots or screen recordings</li>
            <li><No />Your webcam or microphone</li>
            <li><No />Your files, emails or browsing history</li>
            <li><No />Your location</li>
          </ul>
        </section>
      </div>

      <h2>How &ldquo;active&rdquo; and &ldquo;idle&rdquo; work</h2>
      <p>
        Every 10 seconds the app asks your computer one question: has the keyboard or mouse been used since the last
        check? If yes, those 10 seconds count as <strong>active</strong>. If not, they count as <strong>idle</strong>,
        and idle time still counts as work, because reading, thinking and calls are work.
      </p>
      <p>
        Only after a longer break (your company sets how long, for example 5 minutes) does the app ask you, when you
        come back, whether that time was work. You choose: <em>Yes, count it</em> (and say what you were doing) or{" "}
        <em>No, remove it</em>. If you never answer, the time is removed when you clock out. After 60 minutes away the
        app clocks you out by itself.
      </p>
      <p>
        Your <strong>activity %</strong> is active time divided by worked time. It is one signal, not a score: the
        dashboard shows it next to the tasks you finished and your report, so your work is judged on output too.
      </p>

      <h2>Who can see your data</h2>
      <ul>
        <li><strong>You</strong> see all of it: open <em>My activity</em> in the dashboard or the desktop app.</li>
        <li><strong>Your manager</strong> sees the people in the teams they manage.</li>
        <li><strong>Your company&apos;s owner and admins</strong> see everyone in the company.</li>
        <li>Nobody from other companies. Every company&apos;s data is kept separate by the database itself.</li>
      </ul>

      <h2>Your choices</h2>
      <ul>
        <li>Clock out whenever you are not working. Nothing is recorded then.</li>
        <li>Remove away-from-computer time that was not work.</li>
        <li>Ask your company admin to see, correct or delete your data, or write to us. See the{" "}
          <Link href="/privacy">privacy policy</Link>.</li>
      </ul>
    </article>
  );
}
