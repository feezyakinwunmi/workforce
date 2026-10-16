import Link from "next/link";
import { LogoMark, type Product } from "@/components/logo";
import { EmptyState, InfoTip, Notice, PageHeader, Panel } from "@/components/ui";
import { setFeedbackStatus } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/admin/server";
import { ago, when, type FeedbackItem, type FeedbackReport } from "@/lib/admin/types";
import { cn } from "@/lib/utils";
import { plural } from "../_parts";

export const metadata = { title: "Feedback" };
export const dynamic = "force-dynamic";

const NAME: Record<Product, string> = { workbase: "Workbase", meet: "Meet", book: "Book" };
const PRODUCTS: Product[] = ["meet", "workbase", "book"];
const STATUS_BADGE = { new: "bg-brand-50 text-brand-700", read: "bg-slate-100 text-slate-600", done: "bg-emerald-50 text-emerald-700" } as const;
const STATUS_TEXT = { new: "New", read: "Read", done: "Done" } as const;

type Params = { days?: string; product?: string; status?: string; stars?: string };

function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex", className)} aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <svg key={s} viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path d="M12 3.2l2.6 5.5 6 .8-4.4 4.1 1.1 6L12 16.7l-5.3 2.9 1.1-6L3.4 9.5l6-.8z"
            className={s <= Math.round(value) ? "fill-marigold-400" : "fill-slate-200"} />
        </svg>
      ))}
    </span>
  );
}

function Filter({ label, options, value, href }: { label: string; options: Array<[string, string]>; value: string; href: (v: string) => string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-slate-500">{label}</span>
      <div className="flex flex-wrap rounded-lg border border-slate-200 bg-surface p-0.5 text-sm">
        {options.map(([v, text]) => (
          <Link key={v} href={href(v)} className={cn("rounded-md px-2.5 py-1", value === v ? "bg-brand-600 text-white" : "text-slate-600 hover:text-slate-900")}>
            {text}
          </Link>
        ))}
      </div>
    </div>
  );
}

function StatusButtons({ item }: { item: FeedbackItem }) {
  const next = item.status === "done" ? (["new"] as const) : item.status === "read" ? (["done"] as const) : (["read", "done"] as const);
  return (
    <div className="flex gap-1.5">
      {next.map((s) => (
        <form key={s} action={setFeedbackStatus}>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="status" value={s} />
          <button className="btn-secondary btn-sm">{s === "read" ? "Mark read" : s === "done" ? "Done" : "Reopen"}</button>
        </form>
      ))}
    </div>
  );
}

function meetLine(m: NonNullable<FeedbackItem["meet"]>) {
  const role = m.role === "guest" ? "guest" : m.role === "host" ? "host" : m.role === "cohost" ? "co-host" : "member";
  const why = m.reason === "limit" ? " · hit the time limit" : m.reason === "ended" ? " · meeting ended" : "";
  return `${m.minutes} min call · ${plural(m.people, "person", "people")}${m.guests ? ` (${plural(m.guests, "guest")})` : ""} · ${m.tier === "pro" ? "Pro" : "Free"} plan · sent by the ${role}${why}`;
}

export default async function FeedbackTab({ searchParams }: { searchParams: Promise<Params> }) {
  const { db, base } = await requireAdmin();
  const q = await searchParams;
  const days = q.days === "90" ? 90 : q.days === "365" ? 365 : 30;
  const product = (PRODUCTS as string[]).includes(q.product ?? "") ? (q.product as Product) : null;
  const status = ["new", "read", "done"].includes(q.status ?? "") ? (q.status as FeedbackItem["status"]) : null;
  const stars = /^[1-5]$/.test(q.stars ?? "") ? Number(q.stars) : null;

  const { data, error } = await db.rpc("admin_feedback", { p_days: days, p_product: product, p_status: status, p_rating: stars, p_limit: 300 });
  if (error || !data) return <Notice tone="error">Couldn&apos;t load feedback: {error?.message ?? "no data"}. Has migration 0041 been run?</Notice>;
  const r = data as FeedbackReport;

  const href = (patch: Partial<Record<keyof Params, string | null>>) => {
    const p = new URLSearchParams();
    const merged = { days: days === 30 ? null : String(days), product, status, stars: stars ? String(stars) : null, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return `${base}/feedback${s ? `?${s}` : ""}`;
  };
  const newShown = r.items.filter((i) => i.status === "new");

  return (
    <>
      <PageHeader
        title="Feedback"
        meta={`${r.new ? `${plural(r.new, "new message")} · ` : ""}from people using Workbase, Meet and Book`}
        actions={
          <Filter label="" value={String(days)} href={(v) => href({ days: v === "30" ? null : v })}
            options={[["30", "30 days"], ["90", "90 days"], ["365", "1 year"]]} />
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {PRODUCTS.map((p) => {
          const s = r.products[p];
          const max = Math.max(1, ...s.stars);
          return (
            <Link key={p} href={href({ product: product === p ? null : p })}
              className={cn("card block p-5 transition hover:border-brand-300", product === p && "ring-2 ring-brand-500")}>
              <div className="flex items-center gap-2">
                <LogoMark tile product={p} className="h-7 w-7" />
                <span className="font-display font-bold text-slate-900">{NAME[p]}</span>
                <span className="ml-auto text-sm text-slate-500">{plural(s.count, "reply", "replies")}</span>
              </div>
              <div className="mt-4 flex items-end gap-3">
                <span className="stat-value">{s.average !== null ? Number(s.average).toFixed(1) : "–"}</span>
                {s.average !== null && <Stars value={Number(s.average)} className="mb-1.5" />}
                <span className="mb-1 ml-auto text-xs text-slate-500">{plural(s.rated, "rating")} · {plural(s.messages, "message")}</span>
              </div>
              <div className="mt-3 space-y-1">
                {[5, 4, 3, 2, 1].map((star) => (
                  <div key={star} className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="w-3 tabular-nums">{star}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <span className={cn("block h-full rounded-full", star >= 4 ? "bg-brand-500" : star === 3 ? "bg-slate-400" : "bg-marigold-500")}
                        style={{ width: `${(s.stars[star - 1] / max) * 100}%` }} />
                    </span>
                    <span className="w-6 text-right tabular-nums">{s.stars[star - 1]}</span>
                  </div>
                ))}
              </div>
              {s.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {s.tags.slice(0, 6).map((t) => (
                    <span key={t.tag} className="badge bg-slate-100 text-slate-700">{t.tag} <span className="ml-1 text-slate-500">{t.count}</span></span>
                  ))}
                </div>
              )}
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <Filter label="Product" value={product ?? ""} href={(v) => href({ product: v || null })}
          options={[["", "All"], ["meet", "Meet"], ["workbase", "Workbase"], ["book", "Book"]]} />
        <Filter label="Status" value={status ?? ""} href={(v) => href({ status: v || null })}
          options={[["", "All"], ["new", "New"], ["read", "Read"], ["done", "Done"]]} />
        <Filter label="Stars" value={stars ? String(stars) : ""} href={(v) => href({ stars: v || null })}
          options={[["", "Any"], ["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"]]} />
      </div>

      <Panel
        title={
          <span className="flex items-center gap-1.5">
            Messages
            <InfoTip>Only this console sees feedback. Companies can&apos;t see what their staff sent. Meet feedback keeps the call length, people and plan, never the meeting title or chat.</InfoTip>
          </span>
        }
        actions={
          newShown.length > 0 ? (
            <form action={setFeedbackStatus}>
              {newShown.map((i) => <input key={i.id} type="hidden" name="id" value={i.id} />)}
              <input type="hidden" name="status" value="read" />
              <button className="btn-secondary btn-sm">Mark {newShown.length} as read</button>
            </form>
          ) : null
        }
      >
        {r.items.length === 0 ? (
          <EmptyState icon="chat" title="No feedback here yet" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {r.items.map((i) => (
              <li key={i.id} className={cn("px-5 py-4", i.status === "new" && "bg-brand-50/40")}>
                <div className="flex flex-wrap items-center gap-2">
                  <LogoMark tile product={i.product} className="h-5 w-5" />
                  <span className="text-sm font-medium text-slate-700">{NAME[i.product]}</span>
                  {i.rating !== null && <Stars value={i.rating} />}
                  <span className={cn("badge", STATUS_BADGE[i.status])}>{STATUS_TEXT[i.status]}</span>
                  <span className="ml-auto text-xs text-slate-500" title={when(i.updated_at)}>{ago(i.updated_at)}</span>
                </div>
                {i.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {i.tags.map((t) => <span key={t} className="badge bg-slate-100 text-slate-700">{t}</span>)}
                  </div>
                )}
                {i.message && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-900">{i.message}</p>}
                <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                  <div className="min-w-0 space-y-0.5 text-xs text-slate-500">
                    <p>
                      {(i.name || i.is_guest) && <span className="font-medium text-slate-700">{i.name || "Guest"}</span>}
                      {i.is_guest && " (guest, no email)"}
                      {i.email && <>{i.name ? " · " : ""}<a className="text-brand-700 hover:underline" href={`mailto:${i.email}?subject=${encodeURIComponent(`Your ${NAME[i.product]} feedback`)}`}>{i.email}</a></>}
                      {i.organization_id && i.company && <> · <Link className="text-brand-700 hover:underline" href={`${base}/companies/${i.organization_id}`}>{i.company}</Link></>}
                    </p>
                    {i.meet && <p>{meetLine(i.meet)}</p>}
                    <p>{[i.device, i.page && !i.meet ? i.page : ""].filter(Boolean).join(" · ")}</p>
                  </div>
                  <StatusButtons item={i} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
