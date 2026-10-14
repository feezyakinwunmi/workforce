import Link from "next/link";
import { APP_NAME, OPERATOR_NAME } from "@/lib/config";

/** Public pages anyone can read without logging in: what we track, privacy policy, terms. */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-10 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 font-bold text-white">{APP_NAME[0]}</span>
          <span className="font-semibold">{APP_NAME}</span>
        </Link>
        <Link className="text-sm font-medium text-brand-700 hover:underline" href="/login">Log in</Link>
      </header>
      <main className="legal">{children}</main>
      <footer className="mt-16 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-200 pt-6 text-sm text-slate-500">
        <Link className="hover:text-slate-800" href="/what-we-track">What we track</Link>
        <Link className="hover:text-slate-800" href="/privacy">Privacy policy</Link>
        <Link className="hover:text-slate-800" href="/terms">Terms of service</Link>
        <Link className="hover:text-slate-800" href="/download">Download the app</Link>
        <span className="ml-auto">© {new Date().getFullYear()} {OPERATOR_NAME}</span>
      </footer>
    </div>
  );
}
