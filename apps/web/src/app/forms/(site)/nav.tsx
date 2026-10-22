"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function FormsNav({ base }: { base: string }) {
  const path = usePathname();
  const items = [
    [base || "/", "My forms", (p: string) => p === (base || "/") || p.startsWith(`${base}/build`)],
    [`${base}/payouts`, "Payouts", (p: string) => p.startsWith(`${base}/payouts`)],
    [`${base}/plan`, "Plan", (p: string) => p.startsWith(`${base}/plan`)],
  ] as const;
  return (
    <>
      {items.map(([href, label, on]) => (
        <Link key={href} href={href}
          className={cn("rounded-lg px-2.5 py-1.5", on(path) ? "bg-slate-100 font-medium text-slate-900" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900")}>
          {label}
        </Link>
      ))}
    </>
  );
}
