"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function ChatSidebarLink({ href, unread, children }: { href: string; unread: number; children: React.ReactNode }) {
  const path = usePathname();
  const active = path === href;
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm",
        active ? "bg-brand-50 font-medium text-brand-700" : "text-slate-700 hover:bg-slate-100",
        !active && unread > 0 && "font-semibold text-slate-900",
      )}
    >
      {children}
      {!active && unread > 0 && (
        <span className="ml-auto rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white">{unread > 99 ? "99+" : unread}</span>
      )}
    </Link>
  );
}
