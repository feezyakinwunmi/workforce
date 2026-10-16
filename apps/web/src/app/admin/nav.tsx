"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function AdminNav({ base, newFeedback = 0 }: { base: string; newFeedback?: number }) {
  const path = usePathname();
  const items = [
    ["", "Overview"],
    ["/workbase", "Workbase"],
    ["/meet", "Meet"],
    ["/book", "Book"],
    ["/money", "Money"],
    ["/companies", "Companies"],
    ["/accounts", "Accounts"],
    ["/feedback", "Feedback"],
  ] as const;
  const here = (p: string) => {
    const full = `${base}${p}` || "/";
    return p === "" ? path === full || path === `${full}/` : path.startsWith(full);
  };
  return (
    <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 sm:px-5">
      {items.map(([p, label]) => (
        <Link
          key={p}
          href={`${base}${p}` || "/"}
          className={cn(
            "border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition",
            here(p) ? "border-brand-600 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900",
          )}
        >
          {label}
          {p === "/feedback" && newFeedback > 0 && (
            <span className="ml-1.5 rounded-full bg-brand-600 px-1.5 py-0.5 text-[11px] font-semibold text-white tabular-nums">{newFeedback > 99 ? "99+" : newFeedback}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}
