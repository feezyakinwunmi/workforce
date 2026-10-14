import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { OPERATOR_NAME } from "@/lib/config";

/** Header for public pages (download, legal). */
export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="border-b border-slate-200 bg-surface/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" aria-label="Home"><Logo /></Link>
        <div className="flex items-center gap-2">
          <span className="hidden sm:block"><ThemeToggle /></span>
          <Link href={signedIn ? "/dashboard" : "/login"} className="btn-secondary">{signedIn ? "Dashboard" : "Log in"}</Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-8 text-sm text-slate-500 sm:px-6">
        <Link className="hover:text-slate-900" href="/download">Download</Link>
        <Link className="hover:text-slate-900" href="/what-we-track">What we track</Link>
        <Link className="hover:text-slate-900" href="/privacy">Privacy</Link>
        <Link className="hover:text-slate-900" href="/terms">Terms</Link>
        <span className="ml-auto">© {new Date().getFullYear()} {OPERATOR_NAME}</span>
      </div>
    </footer>
  );
}
