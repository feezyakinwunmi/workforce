import Link from "next/link";
import { Icon } from "@/components/icons";
import { Logo, LogoMark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

/** Sign-in pages: the form on one side, a quiet brand panel on the other (hidden on phones). */
export function AuthShell({ children, wide = false, aside = true }: { children: React.ReactNode; wide?: boolean; aside?: boolean }) {
  return (
    <div className={aside ? "min-h-screen lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]" : "min-h-screen"}>
      <div className="flex min-h-screen flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Link href="/" aria-label="Home"><Logo /></Link>
          <ThemeToggle />
        </div>
        <main className={`mx-auto flex w-full flex-1 flex-col justify-center py-10 ${wide ? "max-w-xl" : "max-w-sm"}`}>{children}</main>
        <p className="text-center text-xs text-slate-400">
          <Link href="/privacy" className="hover:text-slate-700">Privacy</Link>
          <span className="mx-2">·</span>
          <Link href="/terms" className="hover:text-slate-700">Terms</Link>
          <span className="mx-2">·</span>
          <Link href="/what-we-track" className="hover:text-slate-700">What we track</Link>
        </p>
      </div>
      {aside && (
        <aside className="relative hidden overflow-hidden bg-[#15123a] p-12 text-white lg:flex lg:flex-col lg:justify-between dark:bg-raised" aria-hidden>
          <LogoMark className="absolute -right-24 -bottom-20 h-[34rem] w-[34rem] opacity-[0.07] [&_path]:fill-white [&_rect]:fill-white" />
          <div className="relative max-w-md">
            <p className="font-display text-4xl leading-tight font-bold tracking-tight">Your team&apos;s working day, in one view.</p>
            <p className="mt-4 text-[#c9c3e6]">Hours, activity, tasks, chat, leave and payroll for teams in Lagos, London or anywhere between.</p>
          </div>
          <div className="relative grid max-w-md grid-cols-2 gap-3">
            {[
              { icon: "zap" as const, k: "Working now", v: "12 of 15" },
              { icon: "clock" as const, k: "Hours today", v: "68h 20m" },
              { icon: "activity" as const, k: "Activity", v: "74%" },
              { icon: "tasks" as const, k: "Tasks done", v: "23" },
            ].map((s) => (
              <div key={s.k} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <Icon name={s.icon} className="h-4 w-4 text-marigold-300" />
                <p className="mt-3 text-xs text-[#c9c3e6]">{s.k}</p>
                <p className="font-display text-2xl font-semibold tabular-nums">{s.v}</p>
              </div>
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}

/** Heading block used on every sign-in step. */
export function AuthHeading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-7">
      <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
      {children && <p className="mt-2 text-slate-500">{children}</p>}
    </div>
  );
}
