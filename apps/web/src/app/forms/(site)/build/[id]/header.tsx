"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteForm, duplicateForm, setFormFlags } from "../../actions";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";

export function FormHeader({ id, title, base, link, published, accepting, responses }: {
  id: string; title: string; base: string; link: string; published: boolean; accepting: boolean; responses: number;
}) {
  const path = usePathname();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [menu, setMenu] = useState(false);
  const root = `${base}/build/${id}`;
  const tabs = [
    [root, "Build", path === root],
    [`${root}/share`, "Share", path.startsWith(`${root}/share`)],
    [`${root}/responses`, `Answers${responses ? ` (${responses})` : ""}`, path.startsWith(`${root}/responses`)],
  ] as const;

  const flip = (flags: { published?: boolean; accepting?: boolean }, then?: string) =>
    start(async () => {
      const r = await setFormFlags(id, flags);
      if (r.error) setError(r.error);
      else {
        setError("");
        if (then) router.push(then);
        router.refresh();
      }
    });

  return (
    <div className="border-b border-slate-200 bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-4 sm:px-6">
        <Link href={base || "/"} className="text-sm text-slate-500 hover:text-slate-900">My forms</Link>
        <span className="text-slate-300">/</span>
        <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{title}</span>
        <span className={cn("badge", !published ? "bg-slate-100 text-slate-600" : accepting ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
          {!published ? "Draft" : accepting ? "Live" : "Closed"}
        </span>
        {published && (
          <a href={link} target="_blank" rel="noopener" className="btn-secondary btn-sm"><Icon name="external" className="h-4 w-4" /> Open</a>
        )}
        {!published ? (
          <button className="btn-primary btn-sm" disabled={pending} onClick={() => flip({ published: true, accepting: true }, `${root}/share`)}>Publish</button>
        ) : (
          <button className="btn-secondary btn-sm" disabled={pending} onClick={() => flip({ accepting: !accepting })}>
            {accepting ? "Stop answers" : "Open again"}
          </button>
        )}
        <div className="relative">
          <button className="btn-secondary btn-sm px-2" aria-label="More" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
            <Icon name="dots" className="h-4 w-4" />
          </button>
          {menu && (
            <div className="absolute right-0 z-30 mt-1 w-48 rounded-xl border border-slate-200 bg-surface p-1 text-sm shadow-lg" onMouseLeave={() => setMenu(false)}>
              {published && (
                <button className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-100" onClick={() => flip({ published: false })}>Unpublish</button>
              )}
              <form action={duplicateForm}>
                <input type="hidden" name="id" value={id} />
                <button className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-100">Duplicate</button>
              </form>
              <form action={deleteForm} onSubmit={(e) => {
                if (!confirm("Delete this form and all its answers? This can't be undone.")) e.preventDefault();
              }}>
                <input type="hidden" name="id" value={id} />
                <button className="block w-full rounded-lg px-3 py-2 text-left text-red-600 hover:bg-red-50">Delete form</button>
              </form>
            </div>
          )}
        </div>
      </div>
      {error && <p className="mx-auto max-w-6xl px-4 pt-2 text-sm text-red-600 sm:px-6">{error}</p>}
      <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 pt-2 sm:px-5">
        {tabs.map(([href, label, on]) => (
          <Link key={href} href={href}
            className={cn("whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition", on ? "border-brand-600 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900")}>
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
