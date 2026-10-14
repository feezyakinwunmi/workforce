"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; icon: IconName; badge?: number; tour?: string };
export type NavGroup = { title?: string; items: NavItem[] };

function isActive(path: string, href: string) {
  return href === "/dashboard" ? path === href : path === href || path.startsWith(`${href}/`);
}

function Links({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav className="space-y-5" aria-label="Main">
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.title && <p className="mb-1.5 px-3 text-xs font-medium text-slate-400">{g.title}</p>}
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const active = isActive(path, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    data-tour={item.tour}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                      active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                    )}
                  >
                    <Icon
                      name={item.icon}
                      className={cn(active ? "text-brand-600 dark:text-brand-700" : "text-slate-400 group-hover:text-slate-600")}
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge ? (
                      <span className="min-w-5 rounded-full bg-brand-600 px-1.5 py-0.5 text-center text-[11px] leading-none font-semibold text-white tabular-nums">
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Desktop: fixed sidebar. Phone/tablet: top bar with a menu button that opens the same sidebar as a drawer. */
export function AppNav({ groups, header, footer }: { groups: NavGroup[]; header: React.ReactNode; footer: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const panel = (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-5 pb-4">{header}</div>
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        <Links groups={groups} onNavigate={() => setOpen(false)} />
      </div>
      <div className="border-t border-slate-200 p-3">{footer}</div>
    </div>
  );

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-surface/90 px-4 py-3 backdrop-blur lg:hidden print:hidden">
        <Link href="/dashboard" aria-label="Overview"><Logo size="sm" /></Link>
        <button type="button" className="btn-ghost px-2" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open}>
          <Icon name="menu" className="h-5 w-5" />
        </button>
      </div>

      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-surface lg:sticky lg:top-0 lg:block lg:h-screen print:hidden">
        {panel}
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 bg-slate-950/40 dark:bg-black/60" onClick={() => setOpen(false)} aria-label="Close menu" />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-slate-200 bg-surface shadow-xl">
            <button type="button" className="btn-ghost absolute top-4 right-3 px-2" onClick={() => setOpen(false)} aria-label="Close menu">
              <Icon name="x" className="h-5 w-5" />
            </button>
            {panel}
          </div>
        </div>
      )}
    </>
  );
}
