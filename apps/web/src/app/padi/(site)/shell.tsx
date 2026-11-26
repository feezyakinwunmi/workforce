"use client";

/**
 * Bizz Padi app shell for signed-in people (26 Nov 2026).
 *
 *   Desktop (lg+)  a black sidebar fixed on the left. It can be folded down to icons only
 *                  (like WordPress) with the button at the bottom; the choice is remembered in
 *                  this browser (localStorage "padi-sidebar"). Folded, each icon shows its name
 *                  on hover.
 *   Phone/tablet   a slim top bar with a menu button that slides the full sidebar in.
 *
 * The page area never scrolls sideways: it's clipped horizontally and sized to the space left
 * next to the sidebar (min-w-0), so wide content shrinks or wraps instead.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { LogoMark } from "@/components/logo";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: IconName; soon?: boolean };

function Sidebar({
  base,
  brand,
  email,
  folded = false,
  onToggle,
  onNavigate,
}: {
  base: string;
  brand: { name: string; color: string } | null;
  email: string;
  folded?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
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
        { href: "#inbox", label: "Inbox and replies", icon: "mail", soon: true },
        { href: "#customers", label: "Find customers", icon: "users", soon: true },
        { href: "#ads", label: "Ads", icon: "megaphone", soon: true },
        { href: "#influencers", label: "Influencers", icon: "trophy", soon: true },
      ],
    },
  ];

  const active = (href: string) => (href === home ? path === home || path === `${home}/` : path.startsWith(href));

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#111113] text-white">
      {/* Logo */}
      <Link href={home} onClick={onNavigate} title="Bizz Padi" className={cn("flex items-center gap-2.5 pt-5 pb-4", folded ? "justify-center px-0" : "px-5")}>
        <LogoMark tile product="padi" className="h-9 w-9 shrink-0" />
        {!folded && (
          <span className="text-[1.05rem] font-semibold tracking-tight whitespace-nowrap">
            Bizz <span className="text-[#a1a1aa]">Padi</span>
          </span>
        )}
      </Link>

      {/* Brand card */}
      {brand && (
        <Link href={`${base}/setup`} onClick={onNavigate} title={folded ? brand.name : undefined}
          className={cn("group mb-4 flex items-center gap-3 rounded-xl bg-white/[0.06] ring-1 ring-white/10 transition hover:bg-white/[0.1]", folded ? "mx-auto p-1.5" : "mx-3 p-3")}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white" style={{ background: brand.color }}>
            {brand.name.slice(0, 1).toUpperCase()}
          </span>
          {!folded && (
            <>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[0.88rem]">{brand.name}</b>
                <span className="text-[0.72rem] text-white/50">Your brand</span>
              </span>
              <Icon name="chevronRight" className="h-4 w-4 text-white/40 transition group-hover:translate-x-0.5 group-hover:text-white/80" />
            </>
          )}
        </Link>
      )}

      {/* Menu */}
      <nav className={cn("flex-1 space-y-6 overflow-x-hidden overflow-y-auto", folded ? "px-2" : "px-3")} aria-label="Bizz Padi">
        {groups.map((g) => (
          <div key={g.title}>
            {folded ? (
              <span className="mx-auto mb-2 block h-px w-6 bg-white/15" aria-hidden="true" />
            ) : (
              <p className="mb-1.5 px-3 text-[0.68rem] font-semibold tracking-[0.12em] text-white/35 uppercase">{g.title}</p>
            )}
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const on = !it.soon && active(it.href);
                const row = cn(
                  "group relative flex items-center rounded-lg py-2 text-[0.88rem] transition",
                  folded ? "justify-center px-0" : "gap-3 px-3",
                );
                const inner = (
                  <>
                    {on && <span className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full bg-[#8f7bff] shadow-[0_0_12px_#8f7bff]" />}
                    <Icon name={it.icon}
                      className={cn("h-[1.15rem] w-[1.15rem] shrink-0 transition duration-300", !it.soon && "group-hover:-rotate-6 group-hover:scale-110", on ? "text-white" : it.soon ? "" : "text-white/55 group-hover:text-white")} />
                    {!folded && <span className="flex-1 whitespace-nowrap">{it.label}</span>}
                    {!folded && it.soon && <span className="text-[0.62rem] font-semibold tracking-wide text-[#f2a93b]/80 uppercase">Soon</span>}
                    {/* Name bubble when folded */}
                    {folded && (
                      <span className="pointer-events-none absolute left-full z-50 ml-3 rounded-md bg-white px-2 py-1 text-xs font-medium whitespace-nowrap text-[#111113] opacity-0 shadow-lg transition group-hover:opacity-100">
                        {it.label}{it.soon ? " (soon)" : ""}
                      </span>
                    )}
                  </>
                );
                return (
                  <li key={it.href}>
                    {it.soon ? (
                      <span className={cn(row, "cursor-default text-white/35")} aria-disabled="true">{inner}</span>
                    ) : (
                      <Link href={it.href} onClick={onNavigate} aria-current={on ? "page" : undefined} aria-label={folded ? it.label : undefined}
                        className={cn(row, "font-medium", on ? "bg-white/[0.1] text-white" : "text-white/70 hover:bg-white/[0.06] hover:text-white")}>
                        {inner}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Account + fold button */}
      <div className="border-t border-white/10 p-2">
        <div className={cn("flex items-center gap-2 rounded-lg py-1.5", folded ? "flex-col" : "px-2")}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold" title={email}>
            {(email || "?").slice(0, 1).toUpperCase()}
          </span>
          {!folded && <span className="min-w-0 flex-1 truncate text-[0.8rem] text-white/60">{email}</span>}
          <form action="/auth/signout" method="post">
            <button className="rounded-md p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white" aria-label="Log out" title="Log out">
              <Icon name="logout" className="h-4 w-4" />
            </button>
          </form>
        </div>
        {onToggle && (
          <button onClick={onToggle} title={folded ? "Expand menu" : "Fold menu"} aria-label={folded ? "Expand menu" : "Fold menu"}
            className={cn("mt-1 flex w-full items-center gap-2 rounded-lg py-2 text-[0.8rem] text-white/50 transition hover:bg-white/[0.06] hover:text-white", folded ? "justify-center" : "px-3")}>
            <Icon name="chevronRight" className={cn("h-4 w-4 transition duration-300", folded ? "" : "rotate-180")} />
            {!folded && "Fold menu"}
          </button>
        )}
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
  const [folded, setFolded] = useState(false);
  const path = usePathname();

  // Remember the folded/expanded choice in this browser (read after the first paint).
  useEffect(() => {
    try {
      setFolded(localStorage.getItem("padi-sidebar") === "folded");
    } catch {
      /* storage blocked: keep expanded */
    }
  }, []);
  const toggle = () =>
    setFolded((f) => {
      try {
        localStorage.setItem("padi-sidebar", f ? "open" : "folded");
      } catch {
        /* ignore */
      }
      return !f;
    });

  // Close the phone drawer when the page changes or Escape is pressed.
  useEffect(() => {
    setOpen(false);
  }, [path]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-dvh overflow-x-clip bg-[#f7f7f8] dark:bg-canvas">
      {/* Desktop sidebar */}
      <aside className={cn("fixed inset-y-0 left-0 z-30 hidden transition-[width] duration-300 lg:block", folded ? "w-[4.5rem]" : "w-64")}>
        <Sidebar base={base} brand={brand} email={email} folded={folded} onToggle={toggle} />
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
        <div className={cn("absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl transition-transform duration-300", open ? "translate-x-0" : "-translate-x-full")}>
          <Sidebar base={base} brand={brand} email={email} onNavigate={() => setOpen(false)} />
        </div>
      </div>

      {/* Page area: never wider than the space next to the sidebar */}
      <main className={cn("min-w-0 overflow-x-clip transition-[padding] duration-300", folded ? "lg:pl-[4.5rem]" : "lg:pl-64")}>{children}</main>
    </div>
  );
}
