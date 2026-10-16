import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireAdminAccount } from "@/lib/admin/server";

export const metadata: Metadata = {
  title: { default: "Workbase Console", template: "%s · Workbase Console" },
  robots: { index: false, follow: false },
};

/** Header for every console page. The pages themselves sit in (console), behind the authenticator code. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { email, base } = await requireAdminAccount();
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="border-b border-slate-200 bg-surface/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href={base || "/"} className="flex items-center gap-2 font-display text-lg font-bold whitespace-nowrap text-slate-900">
            <LogoMark tile className="h-8 w-8" />
            <span>
              Workbase <span className="text-brand-600 dark:text-brand-700">Console</span>
            </span>
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden text-slate-500 md:block">{email}</span>
            <span className="hidden sm:block"><ThemeToggle /></span>
            <form action="/auth/signout" method="post">
              <button className="btn-secondary btn-sm">Log out</button>
            </form>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
