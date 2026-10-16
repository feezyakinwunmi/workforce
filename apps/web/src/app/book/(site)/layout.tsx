import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { OPERATOR_NAME } from "@/lib/config";
import { BOOK_NAME } from "@/lib/book/paths";
import { bookRequestBase, getBookHost } from "@/lib/book/server";
import { BookNav } from "./nav";

export default async function BookSiteLayout({ children }: { children: React.ReactNode }) {
  const [{ user, page }, base] = await Promise.all([getBookHost(), bookRequestBase()]);
  const home = base || "/";
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="border-b border-slate-200 bg-surface/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href={home} className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
            <LogoMark tile className="h-8 w-8" />
            <span>
              Workbase <span className="text-brand-600 dark:text-brand-700">Book</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1 text-sm sm:gap-2">
            {!user && <Link href={`${base}/pricing`} className="rounded-lg px-2.5 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900">Pricing</Link>}
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
        {user && page && <BookNav base={base} />}
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-slate-200">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-8 text-sm text-slate-500 sm:px-6">
          <span>{BOOK_NAME} is part of <a className="font-medium text-slate-700 hover:text-brand-700" href={process.env.NEXT_PUBLIC_SITE_URL || "/"}>Workbase</a>, with <a className="font-medium text-slate-700 hover:text-brand-700" href={process.env.NEXT_PUBLIC_MEET_URL || "/meet"}>Workbase Meet</a> for video calls.</span>
          <Link className="hover:text-slate-900" href="/privacy">Privacy</Link>
          <Link className="hover:text-slate-900" href="/terms">Terms</Link>
          <span className="ml-auto">© {new Date().getFullYear()} {OPERATOR_NAME}</span>
        </div>
      </footer>
    </div>
  );
}
