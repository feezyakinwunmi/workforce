import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { LogoMark } from "@/components/logo";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { EmptyState, Notice } from "@/components/ui";
import { getLatestRelease } from "@/lib/releases";
import { getSession } from "@/lib/session";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Download the desktop app" };

export default async function DownloadPage() {
  const [release, h, { user }] = await Promise.all([getLatestRelease(), headers(), getSession()]);
  const ua = h.get("user-agent") ?? "";
  const onMac = /Macintosh|Mac OS X/i.test(ua) && !/Windows/i.test(ua);

  return (
    <div className="min-h-screen bg-surface">
      <SiteHeader signedIn={Boolean(user)} />
      <main className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start">
          <div>
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50">
              <LogoMark className="h-9 w-9" />
            </span>
            <h1 className="mt-6 font-display text-4xl font-bold tracking-tight sm:text-5xl">Get the desktop app</h1>
            <p className="mt-4 max-w-md text-lg text-slate-600">Install it once, log in, and clock in with one click. It starts with your computer and updates itself.</p>

            <div className="card mt-8 p-6">
              {release?.windows ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                        <Icon name="windows" className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="font-semibold text-slate-900">Windows 10 and 11</p>
                        <p className="text-sm text-slate-500">
                          Version {release.version} · {release.windows.sizeMb} MB · {formatDate(release.publishedAt)}
                        </p>
                      </div>
                    </div>
                    <a className="btn-primary px-5 py-2.5" href={release.windows.url}>
                      <Icon name="download" className="h-4 w-4" />
                      Download
                    </a>
                  </div>
                  {onMac && !release.mac && (
                    <Notice tone="warning" className="mt-5">You&apos;re on a Mac. The Mac version is coming; for now the app runs on Windows.</Notice>
                  )}
                  {release.mac && (
                    <a className="btn-secondary mt-4" href={release.mac.url}>Download for Mac ({release.mac.sizeMb} MB)</a>
                  )}
                </>
              ) : (
                <EmptyState icon="download" title="The download appears here as soon as it's published." className="py-6" />
              )}
            </div>

            <p className="mt-6 flex items-start gap-2 text-sm text-slate-500">
              <Icon name="shield" className="mt-0.5 h-4 w-4 text-emerald-600" />
              <span>
                Records only while you&apos;re clocked in. Never keystrokes, webcam or microphone.{" "}
                <Link className="font-medium text-brand-700 hover:underline" href="/what-we-track">What we track</Link>
              </span>
            </p>
          </div>

          <section className="card p-6 sm:p-8">
            <h2 className="section-title">Setting it up</h2>
            <ol className="mt-6 space-y-6">
              {[
                ["Open the file you downloaded", "It installs in a few seconds. No admin password needed."],
                ["If Windows says “Windows protected your PC”", "Click More info, then Run anyway. It shows for new apps until they're signed."],
                ["Log in", "Same email and password as this website. Only once."],
                ["Agree to what's tracked, then Clock in", "The app sits by the clock on your taskbar. Clock out when you finish."],
              ].map(([title, body], i) => (
                <li key={title} className="relative flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">{i + 1}</span>
                  <div>
                    <p className="font-medium text-slate-900">{title}</p>
                    <p className="mt-0.5 text-sm text-slate-500">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
