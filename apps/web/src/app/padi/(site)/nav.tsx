"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Signed-in navigation: chat (home), the content calendar, and the brand profile. */
export function PadiNav({ base }: { base: string }) {
  const path = usePathname();
  const home = base || "/";
  const items = [
    [home, "Chat", (p: string) => p === home],
    [`${base}/posts`, "Calendar", (p: string) => p.startsWith(`${base}/posts`)],
    [`${base}/setup`, "My brand", (p: string) => p.startsWith(`${base}/setup`)],
  ] as const;
  return (
    <>
      {items.map(([href, label, on]) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "rounded-lg px-2.5 py-1.5",
            on(path) ? "bg-slate-100 font-medium text-slate-900" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
          )}
        >
          {label}
        </Link>
      ))}
    </>
  );
}
