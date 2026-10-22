import Link from "next/link";
import { FeedbackButton } from "@/components/feedback";
import { LogoMark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { OPERATOR_NAME } from "@/lib/config";
import { FORMS_NAME } from "@/lib/forms/paths";
import { formsRequestBase } from "@/lib/forms/server";
import { getMeetUser } from "@/lib/meet/server";
import { FormsNav } from "./nav";

export default async function FormsSiteLayout({ children }: { children: React.ReactNode }) {
  const [{ user }, base] = await Promise.all([getMeetUser(), formsRequestBase()]);
  const home = base || "/";
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="border-b border-slate-200 bg-surface/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href={home} className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
            <LogoMark tile product="forms" className="h-8 w-8" />
            <span>
              <span className="hidden sm:inline">Workbase </span><span className="text-brand-600 dark:text-brand-700">Forms</span>
            </span>
          </Link>
          <nav className="flex items-center gap-0.5 text-sm sm:gap-2">
            {user && <FormsNav base={base} />}
            {user && (
              <FeedbackButton product="workbase" className="hidden rounded-lg px-2.5 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 sm:block">
                Feedback
              </FeedbackButton>
            )}
            <span className="hidden sm:block"><ThemeToggle /></span>
            {user ? (
              <form action="/auth/signout" method="post">
                <button className="btn-secondary btn-sm">Log out</button>
              </form>
            ) : (
              <>
                <Link href={`/login?next=${encodeURIComponent(home)}`} className="rounded-lg px-2.5 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900">Sign in</Link>
                <Link href={`/signup?next=${encodeURIComponent(home)}`} className="btn-primary btn-sm">Start free</Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-slate-200">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-8 text-sm text-slate-500 sm:px-6">
          <span>
            {FORMS_NAME} is part of <a className="font-medium text-slate-700 hover:text-brand-700" href={process.env.NEXT_PUBLIC_SITE_URL || "/"}>Workbase</a>, with{" "}
            <a className="font-medium text-slate-700 hover:text-brand-700" href={process.env.NEXT_PUBLIC_MEET_URL || "/meet"}>Meet</a> and{" "}
            <a className="font-medium text-slate-700 hover:text-brand-700" href={process.env.NEXT_PUBLIC_BOOK_URL || "/book"}>Book</a>.
          </span>
          <Link className="hover:text-slate-900" href="/privacy">Privacy</Link>
          <Link className="hover:text-slate-900" href="/terms">Terms</Link>
          <span className="ml-auto">© {new Date().getFullYear()} {OPERATOR_NAME}</span>
        </div>
      </footer>
    </div>
  );
}
