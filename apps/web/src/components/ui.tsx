import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { cn, initials } from "@/lib/utils";

/** Page title row: title on the left (optional one-line context under it), actions on the right. */
export function PageHeader({
  title,
  meta,
  actions,
  back,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="space-y-3">
      {back && (
        <Link href={back.href} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
          <Icon name="chevronLeft" className="h-4 w-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="page-title">{title}</h1>
          {meta && <p className="mt-1 text-sm text-slate-500">{meta}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export type Stat = { label: string; value: React.ReactNode; icon?: IconName; hint?: React.ReactNode; tone?: "brand" | "green" | "amber" | "slate" };

const TONE: Record<NonNullable<Stat["tone"]>, string> = {
  brand: "bg-brand-50 text-brand-600 dark:text-brand-700",
  green: "bg-emerald-50 text-emerald-600",
  amber: "bg-marigold-50 text-marigold-500 dark:text-marigold-700",
  slate: "bg-slate-100 text-slate-500",
};

/** Key numbers in one panel, divided into cells. */
export function StatStrip({ stats, className }: { stats: Stat[]; className?: string }) {
  return (
    <section
      className={cn(
        "card grid grid-cols-2 gap-px overflow-hidden bg-slate-200",
        stats.length === 3 ? "lg:grid-cols-3" : stats.length >= 4 ? "lg:grid-cols-4" : "",
        stats.length === 5 && "xl:grid-cols-5",
        stats.length % 2 === 1 && "[&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1",
        className,
      )}
    >
      {stats.map((s) => (
        <div key={s.label} className="flex items-start gap-3 bg-surface p-4 sm:p-5">
          {s.icon && (
            <span className={cn("hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:flex", TONE[s.tone ?? "brand"])}>
              <Icon name={s.icon} className="h-[1.1rem] w-[1.1rem]" />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm text-slate-500">{s.label}</p>
            <p className="stat-value mt-0.5 truncate">{s.value}</p>
            {s.hint && <p className="mt-0.5 text-xs text-slate-500">{s.hint}</p>}
          </div>
        </div>
      ))}
    </section>
  );
}

const DOT: Record<string, string> = {
  working: "bg-emerald-500",
  phone: "bg-emerald-500",
  idle: "bg-amber-500",
  offline: "bg-slate-400",
};

/** Initials avatar, optionally with a status dot. */
export function Avatar({
  name,
  email,
  status,
  size = "md",
}: {
  name?: string | null;
  email?: string | null;
  status?: string;
  size?: "sm" | "md" | "lg";
}) {
  const box = size === "lg" ? "h-11 w-11 text-sm" : size === "sm" ? "h-7 w-7 text-[11px]" : "h-9 w-9 text-xs";
  // A stable soft colour per person.
  const hues = ["bg-brand-100 text-brand-700", "bg-marigold-100 text-marigold-700", "bg-emerald-100 text-emerald-700", "bg-sky-50 text-sky-700", "bg-slate-200 text-slate-700"];
  const key = (email || name || "?").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold", box, hues[key % hues.length])}>
      {initials(name ?? "", email ?? "")}
      {status && DOT[status] && (
        <span className={cn("absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-surface", DOT[status])} aria-hidden />
      )}
    </span>
  );
}

/** Message box for errors, successes and notes. */
export function Notice({
  tone = "info",
  children,
  action,
  className,
}: {
  tone?: "info" | "success" | "warning" | "error";
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const style = {
    info: "border-brand-200 bg-brand-50 text-brand-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    error: "border-red-200 bg-red-50 text-red-700",
  }[tone];
  const icon: IconName = tone === "success" ? "check" : tone === "info" ? "info" : "alert";
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm", style, className)}
    >
      <span className="flex min-w-0 items-start gap-2">
        <Icon name={icon} className="mt-0.5 h-4 w-4" />
        <span>{children}</span>
      </span>
      {action}
    </div>
  );
}

/** What to show when a list is empty: an icon, one line, and the next action. */
export function EmptyState({ icon, title, action, className }: { icon: IconName; title: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-12 text-center", className)}>
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <p className="text-sm text-slate-500">{title}</p>
      {action}
    </div>
  );
}

/** A panel with a title row. */
export function Panel({
  title,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("card overflow-hidden", className)}>
      {(title || actions) && (
        <div className="panel-head">
          {title && <h2 className="section-title text-base">{title}</h2>}
          {actions}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** A small "i" that shows a short explanation on hover or keyboard focus. */
export function InfoTip({ children, label = "More information", align = "left" }: { children: React.ReactNode; label?: string; align?: "left" | "right" }) {
  return (
    <span className="group/tip relative inline-flex align-middle">
      <button type="button" className="rounded-full text-slate-400 hover:text-slate-700 focus-visible:text-slate-700" aria-label={label}>
        <Icon name="info" className="h-4 w-4" />
      </button>
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none invisible absolute top-full z-30 mt-2 w-72 rounded-xl border border-slate-200 bg-raised p-3 text-left text-xs leading-5 font-normal text-slate-600 opacity-0 shadow-xl transition group-focus-within/tip:visible group-focus-within/tip:opacity-100 group-hover/tip:visible group-hover/tip:opacity-100",
          align === "right" ? "right-0" : "left-0",
        )}
      >
        {children}
      </span>
    </span>
  );
}
