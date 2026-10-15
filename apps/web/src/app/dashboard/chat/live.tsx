"use client";

import Link from "next/link";
import { Icon } from "@/components/icons";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

export function ChatSidebarLink({ href, unread, children }: { href: string; unread: number; children: React.ReactNode }) {
  const path = usePathname();
  const active = path === href;
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2 py-2.5 text-[15px] md:gap-2 md:py-1.5 md:text-sm",
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

/**
 * Chat list + conversation side by side on wider screens. On a phone only one shows at a time:
 * /dashboard/chat is the list, and a conversation (or new message, or search) fills the screen.
 */
export function ChatShell({ list, children }: { list: React.ReactNode; children: React.ReactNode }) {
  const path = usePathname();
  const detail = path !== "/dashboard/chat";
  return (
    <div className="grid gap-4 md:grid-cols-[230px_1fr]">
      <aside className={cn("card h-fit p-3 md:sticky md:top-8", detail && "hidden md:block")}>{list}</aside>
      <section className={cn("min-w-0", !detail && "hidden md:block")}>
        {detail && !/^\/dashboard\/chat\/[0-9a-f-]{36}$/i.test(path) && (
          <Link href="/dashboard/chat" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 md:hidden">
            <Icon name="chevronLeft" className="h-4 w-4" />
            Chats
          </Link>
        )}
        {children}
      </section>
    </div>
  );
}

/** On wider screens, /dashboard/chat jumps straight into a conversation; phones stay on the list. */
export function OpenFirst({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    if (window.matchMedia("(min-width: 768px)").matches) router.replace(href);
  }, [href, router]);
  return null;
}
