import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { APP_NAME } from "@/lib/config";
import { getLatestRelease } from "@/lib/releases";
import { getSession } from "@/lib/session";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Download the desktop app" };

export default async function DownloadPage() {
  const [release, h, { user }] = await Promise.all([getLatestRelease(), headers(), getSession()]);
  const ua = h.get("user-agent") ?? "";
  const onMac = /Macintosh|Mac OS X/i.test(ua) && !/Windows/i.test(ua);

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 font-bold text-white">{APP_NAME[0]}</div>
          <span className="font-semibold">{APP_NAME}</span>
        </div>
        <Link className="text-sm font-medium text-brand-700 hover:underline" href={user ? "/dashboard" : "/login"}>
          {user ? "Back to dashboard" : "Log in"}
        </Link>
      </div>

      <h1 className="text-3xl font-semibold">Get the desktop app</h1>
      <p className="mt-2 text-slate-600">
        Install it once on your work computer, log in, and clock in with one click. It starts with your computer and
        keeps itself up to date.
      </p>

      <section className="card mt-8 p-6">
        {release?.windows ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-semibold">{APP_NAME} for Windows</p>
                <p className="text-sm text-slate-500">
                  Version {release.version} · {release.windows.sizeMb} MB · released {formatDate(release.publishedAt)}
                </p>
              </div>
              <a className="btn-primary px-6 py-3 text-base" href={release.windows.url}>Download for Windows</a>
            </div>
            {onMac && !release.mac && (
              <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                It looks like you&apos;re on a Mac. The Mac version is coming soon. For now the app runs on Windows 10 and 11.
              </p>
            )}
            {release.mac && (
              <a className="btn-secondary mt-4" href={release.mac.url}>Download for Mac ({release.mac.sizeMb} MB)</a>
            )}
          </>
        ) : (
          <div>
            <p className="font-semibold">The desktop app is being prepared</p>
            <p className="mt-1 text-sm text-slate-600">
              The download will appear here as soon as it&apos;s published. Ask your company admin if you need it urgently.
            </p>
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-4 text-lg font-semibold">Setting it up</h2>
        <ol className="space-y-4">
          {[
            ["Open the file you downloaded", "It installs in a few seconds. No admin password needed."],
            [
              "If Windows shows “Windows protected your PC”",
              "Click More info, then Run anyway. This appears for new apps until they're signed by Microsoft; it's safe.",
            ],
            ["Log in", "Use the same email and password as this website. You only do this once."],
            ["Read what's tracked, then click Clock in", "That's it. Clock out when you finish. The app sits next to the clock on your taskbar."],
          ].map(([title, body], i) => (
            <li key={title} className="flex gap-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                {i + 1}
              </span>
              <div>
                <p className="font-medium">{title}</p>
                <p className="text-sm text-slate-600">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <p className="mt-10 rounded-xl bg-slate-100 p-4 text-sm text-slate-600">
        <strong>Your privacy:</strong> the app records only while you are clocked in: your hours, whether the keyboard
        and mouse are in use (never what you type) and, if your company turned it on, which apps you use. No
        screenshots, webcam or microphone. You can see everything it recorded under <em>My activity</em>.{" "}
        <Link className="font-medium text-brand-700 hover:underline" href="/what-we-track">Read exactly what we track</Link>.
      </p>
      <p className="mt-6 flex gap-4 text-sm text-slate-500">
        <Link className="hover:text-slate-800" href="/privacy">Privacy policy</Link>
        <Link className="hover:text-slate-800" href="/terms">Terms of service</Link>
      </p>
    </main>
  );
}
