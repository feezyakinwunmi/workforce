"use client";

/**
 * Bizz Padi app shell for signed-in people (26 Nov 2026, Femi: "make it a sidebar, we'll have
 * lots of menus").
 *
 *   Desktop (lg+)  a dark ink sidebar fixed on the left: logo, brand card, the menu in groups,
 *                  the growth tools that are coming (shown, marked "Soon", not clickable),
 *                  then the account at the bottom.
 *   Phone/tablet   a slim top bar with the logo and a menu button that slides the same
 *                  sidebar in as a drawer (closes on navigation, Escape or tapping outside).
 *
 * Colours are fixed (ink #111113, violet #6a4cf5, marigold #f2a93b) so the sidebar looks the
 * same in light and dark mode. Icons move a little on hover; the active item gets a violet
 * glow bar on the left.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { LogoMark } from "@/components/logo";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: IconName; soon?: boolean };

function Sidebar({ base, brand, email, onNavigate }: { base: string; brand: { name: string; color: string } | null; email: string; onNavigate?: () => void }) {
  const path = usePathname();
  const home = base || "/";

  const groups: Array<{ title: string; items: Item[] }> = [
    {
      title: "Create",
      items: [
        { href: home, label: "Chat with Padi", icon: "chat" },
        { href: `${base}/posts`, label: "Content calendar", icon: "calendar" },
        { href: `${base}/setup`, label: "My brand", icon: "sparkle" },
      ],
    },
    {
      title: "Grow",
      items: [
        { href: "#", label: "Inbox and replies", icon: "mail", soon: true },
        { href: "#", label: "Find customers", icon: "users", soon: true },
        { href: "#", label: "Ads", icon: "megaphone", soon: true },
        { href: "#", label: "Influencers", icon: "trophy", soon: true },
      ],
    },
  ];

  const active = (href: string) => (href === home ? path === home || path === `${home}/` : path.startsWith(href));

  return (
    <div className="flex h-full flex-col bg-[#111113] text-white">
      {/* Logo */}
      <Link href={home} onClick={onNavigate} className="flex items-center gap-2.5 px-5 pt-5 pb-4">
        <LogoMark tile product="padi" className="h-9 w-9" />
        <span className="text-[1.05rem] font-semibold tracking-tight">
          Bizz <span className="text-[#a1a1aa]">Padi</span>
        </span>
      </Link>

      {/* Brand card */}
      {brand && (
        <Link href={`${base}/setup`} onClick={onNavigate}
          className="group mx-3 mb-4 flex items-center gap-3 rounded-xl bg-white/[0.06] p-3 ring-1 ring-white/10 transition hover:bg-white/[0.1]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white shadow-inner" style={{ background: brand.color }}>
            {brand.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <b className="block truncate text-[0.88rem]">{brand.name}</b>
            <span className="text-[0.72rem] text-white/50">Your brand</span>
          </span>
          <Icon name="chevronRight" className="h-4 w-4 text-white/40 transition group-hover:translate-x-0.5 group-hover:text-white/80" />
        </Link>
      )}

      {/* Menu */}
      <nav className="flex-1 space-y-6 overflow-y-auto px-3" aria-label="Bizz Padi">
        {groups.map((g) => (
          <div key={g.title}>
            <p className="mb-1.5 px-3 text-[0.68rem] font-semibold tracking-[0.12em] text-white/35 uppercase">{g.title}</p>
            <ul className="space-y-0.5">
              {g.items.map((it) =>
                it.soon ? (
                  <li key={it.label}>
                    <span className="flex cursor-default items-center gap-3 rounded-lg px-3 py-2 text-[0.88rem] text-white/40" aria-disabled="true">
                      <Icon name={it.icon} className="h-[1.1rem] w-[1.1rem]" />
                      <span className="flex-1">{it.label}</span>
                      <span className="text-[0.62rem] font-semibold tracking-wide text-[#f2a93b]/80 uppercase">Soon</span>
                    </span>
                  </li>
                ) : (
                  <li key={it.href}>
                    <Link href={it.href} onClick={onNavigate} aria-current={active(it.href) ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[0.88rem] font-medium transition",
                        active(it.href) ? "bg-white/[0.1] text-white" : "text-white/70 hover:bg-white/[0.06] hover:text-white",
                      )}>
                      {active(it.href) && <span className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full bg-[#8f7bff] shadow-[0_0_12px_#8f7bff]" />}
                      <Icon name={it.icon}
                        className={cn("h-[1.1rem] w-[1.1rem] transition duration-300 group-hover:-rotate-6 group-hover:scale-110", active(it.href) ? "text-[#a1a1aa]" : "text-white/50 group-hover:text-white")} />
                      <span className="flex-1">{it.label}</span>
                    </Link>
                  </li>
                ),
              )}
            </ul>
          </div>
        ))}
      </nav>

      {/* Account */}
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-semibold">{email.slice(0, 1).toUpperCase()}</span>
          <span className="min-w-0 flex-1 truncate text-[0.8rem] text-white/60">{email}</span>
          <form action="/auth/signout" method="post">
            <button className="rounded-md p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white" aria-label="Log out" title="Log out">
              <Icon name="logout" className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export function PadiShell({
  base,
  brand,
  email,
  children,
}: {
  base: string;
  brand: { name: string; color: string } | null;
  email: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const path = usePathname();

  // Close the drawer when the page changes or Escape is pressed.
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-dvh bg-[#f7f7f8] dark:bg-canvas">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <Sidebar base={base} brand={brand} email={email} />
      </aside>

      {/* Phone top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-[#111113] px-4 py-3 text-white lg:hidden">
        <Link href={base || "/"} className="flex items-center gap-2">
          <LogoMark tile product="padi" className="h-8 w-8" />
          <span className="font-semibold">Bizz <span className="text-[#a1a1aa]">Padi</span></span>
        </Link>
        <button onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-white/10" aria-label="Open menu" aria-expanded={open}>
          <Icon name="menu" className="h-5 w-5" />
        </button>
      </header>

      {/* Phone drawer */}
      <div className={cn("fixed inset-0 z-40 lg:hidden", open ? "" : "pointer-events-none")} aria-hidden={!open}>
        <div className={cn("absolute inset-0 bg-black/50 transition-opacity", open ? "opacity-100" : "opacity-0")} onClick={() => setOpen(false)} />
        <div className={cn("absolute inset-y-0 left-0 w-72 shadow-2xl transition-transform duration-300", open ? "translate-x-0" : "-translate-x-full")}>
          <Sidebar base={base} brand={brand} email={email} onNavigate={() => setOpen(false)} />
        </div>
      </div>

      <main className="lg:pl-64">{children}</main>
    </div>
  );
}
