import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { OPERATOR_NAME } from "@/lib/config";
import { getMeetUser } from "@/lib/meet/server";
import { PADI_NAME } from "@/lib/padi/paths";
import { myBrand, padiRequestBase } from "@/lib/padi/server";
import { PadiShell } from "./shell";

/**
 * Two looks:
 *   signed in   the app: dark sidebar + content (shell.tsx)
 *   signed out  the public site: slim header, landing page, footer
 */
export default async function PadiSiteLayout({ children }: { children: React.ReactNode }) {
  const [{ supabase, user }, base] = await Promise.all([getMeetUser(), padiRequestBase()]);
  const home = base || "/";

  if (user) {
    const brand = await myBrand(supabase);
    return (
      <PadiShell base={base} email={user.email} brand={brand ? { name: brand.name, color: brand.colors.primary } : null}>
        {children}
      </PadiShell>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="sticky top-0 z-30 border-b border-[#ececef] bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href={home} className="flex items-center gap-2 text-lg font-semibold text-[#111113]">
            <LogoMark tile product="padi" className="h-8 w-8" />
            <span>Bizz <span className="text-[#6a4cf5]">Padi</span></span>
          </Link>
          <nav className="flex items-center gap-1 text-sm sm:gap-2">
            <span className="hidden sm:block"><ThemeToggle /></span>
            <Link href={`/login?next=${encodeURIComponent(home)}`} className="rounded-lg px-3 py-1.5 text-[#5c5c66] hover:bg-[#f7f7f8] hover:text-[#111113]">Sign in</Link>
            <Link href={`/signup?next=${encodeURIComponent(`${base}/setup`)}`} className="btn-primary btn-sm">Start free</Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-[#ececef]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-8 text-sm text-[#6b6b75] sm:px-6">
          <span>
            {PADI_NAME} is part of <a className="font-medium text-[#111113] hover:text-[#6a4cf5]" href={process.env.NEXT_PUBLIC_HOME_URL || "/"}>Workbase</a>, with{" "}
            <a className="font-medium text-[#111113] hover:text-[#6a4cf5]" href={process.env.NEXT_PUBLIC_MEET_URL || "/meet"}>Meet</a>,{" "}
            <a className="font-medium text-[#111113] hover:text-[#6a4cf5]" href={process.env.NEXT_PUBLIC_BOOK_URL || "/book"}>Book</a> and{" "}
            <a className="font-medium text-[#111113] hover:text-[#6a4cf5]" href={process.env.NEXT_PUBLIC_FORMS_URL || "/forms"}>Forms</a>.
          </span>
          <Link className="hover:text-[#111113]" href="/privacy">Privacy</Link>
          <Link className="hover:text-[#111113]" href="/terms">Terms</Link>
          <span className="ml-auto">© {new Date().getFullYear()} {OPERATOR_NAME}</span>
        </div>
      </footer>
    </div>
  );
}
