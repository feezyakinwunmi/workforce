import Link from "next/link";
import { LogoMark } from "@/components/logo";

/** Top of a host's public pages: their initials in their colour, name and a line about them. */
export function HostHeader({ name, about, color, href, small }: { name: string; about?: string; color: string; href?: string; small?: boolean }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  const inner = (
    <div className="flex items-center gap-3">
      <span className={small ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold text-white" : "flex h-14 w-14 shrink-0 items-center justify-center rounded-full font-display text-xl font-bold text-white"} style={{ background: color }}>
        {initials || "?"}
      </span>
      <div className="min-w-0">
        <p className={small ? "truncate font-display text-base font-bold text-slate-900" : "truncate font-display text-xl font-bold text-slate-900 sm:text-2xl"}>{name}</p>
        {about && <p className="mt-0.5 text-sm text-slate-600 whitespace-pre-line">{about}</p>}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block hover:opacity-90">{inner}</Link> : inner;
}

/** "Powered by Workbase Book" for hosts on the Free plan. */
export function PoweredBy({ pro, base }: { pro: boolean; base: string }) {
  if (pro) return null;
  return (
    <p className="mt-10 text-center text-xs text-slate-500">
      <LogoMark tile product="book" className="mr-1.5 inline h-4 w-4 align-[-3px]" />
      Powered by <Link href={base || "/"} className="font-medium text-slate-700 hover:text-brand-700">Workbase Book</Link>
      <span className="whitespace-nowrap"> · get your own booking page free</span>
    </p>
  );
}
