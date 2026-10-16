import Link from "next/link";
import { Icon } from "@/components/icons";
import { InfoTip, Notice, PageHeader, Panel, StatStrip } from "@/components/ui";
import { requireAdmin } from "@/lib/admin/server";
import { ago, day, type AccountsReport } from "@/lib/admin/types";
import { cn } from "@/lib/utils";
import { n, pct, Table, td } from "../_parts";

export const metadata = { title: "Accounts" };
export const dynamic = "force-dynamic";

const FILTERS = [
  ["", "Everyone"],
  ["no_company", "No company yet"],
  ["unconfirmed", "Email not confirmed"],
] as const;

export default async function AccountsTab({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string }> }) {
  const { db, base } = await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const filter = FILTERS.some(([k]) => k === sp.filter) ? sp.filter! : "";
  const { data, error } = await db.rpc("admin_accounts", { p_q: q, p_filter: filter, p_limit: 200 });
  if (error || !data) return <Notice tone="error">Couldn&apos;t load accounts: {error?.message ?? "no data"}. Has migration 0039 been run?</Notice>;
  const a = data as AccountsReport;
  const t = a.totals;
  const href = (f: string) => {
    const p = new URLSearchParams({ ...(q ? { q } : {}), ...(f ? { filter: f } : {}) }).toString();
    return `${base}/accounts${p ? `?${p}` : ""}`;
  };

  return (
    <>
      <PageHeader title="Accounts" meta="Everyone who signed up, across Workbase, Meet and Book (Meet guests not included)" />
      <StatStrip
        stats={[
          { label: "Accounts", value: n(t.accounts), icon: "users", hint: `+${n(t.new_7d)} this week` },
          { label: "Email confirmed", value: pct(t.confirmed, t.accounts), icon: "mail", hint: `${n(t.accounts - t.confirmed)} not yet` },
          { label: "In a company", value: n(t.in_company), icon: "briefcase", hint: `${n(t.accounts - t.in_company)} without one` },
          { label: "Signed in this week", value: n(t.active_7d), icon: "activity", tone: "green" },
        ]}
      />

      <div className="flex flex-wrap items-center gap-3">
        <form className="flex w-full gap-2 sm:w-auto" action={`${base}/accounts`}>
          {filter && <input type="hidden" name="filter" value={filter} />}
          <label className="sr-only" htmlFor="q">Search</label>
          <input id="q" name="q" defaultValue={q} className="input min-w-0 flex-1 sm:w-72" placeholder="Name or email" />
          <button className="btn-primary"><Icon name="search" className="h-4 w-4" />Search</button>
        </form>
        <div className="flex flex-wrap gap-1 text-xs">
          {FILTERS.map(([k, label]) => (
            <Link key={k} href={href(k)} className={cn("rounded-full px-2.5 py-1", filter === k ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:text-slate-900")}>{label}</Link>
          ))}
        </div>
      </div>

      <Panel
        title={
          <span className="flex items-center gap-1.5">
            {n(a.rows.length)} {a.rows.length === 1 ? "account" : "accounts"}
            <InfoTip>&quot;No company yet&quot; is your follow-up list: people who signed up but never created or joined a company. Some only use Meet or Book, which is fine.</InfoTip>
          </span>
        }
      >
        <Table head={["Person", "Joined", "Last sign-in", "Workbase", "Meet", "Book"]} empty="Nobody matches.">
          {a.rows.map((r) => (
            <tr key={r.id}>
              <td className={td}>
                <span className="block font-medium text-slate-900">{r.name || r.email}</span>
                <span className="block text-xs text-slate-500">
                  {r.email}
                  {!r.confirmed && <span className="badge ml-1.5 bg-amber-50 text-amber-700">not confirmed</span>}
                  {r.provider !== "email" && <span className="badge ml-1.5 bg-slate-100 text-slate-600">{r.provider}</span>}
                </span>
              </td>
              <td className={cn(td, "whitespace-nowrap text-slate-600")}>{day(r.created_at)}</td>
              <td className={cn(td, "whitespace-nowrap text-slate-600")}>{ago(r.last_sign_in_at)}</td>
              <td className={td}>
                {r.organization_id ? (
                  <>
                    <Link className="text-brand-700 hover:underline" href={`${base}/companies/${r.organization_id}`}>{r.company}</Link>
                    <span className="block text-xs text-slate-500 capitalize">{r.company_role}</span>
                  </>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className={td}>
                <span className={cn("badge", r.meet_tier === "pro" ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-600")}>{r.meet_tier === "pro" ? "Pro" : "Free"}</span>
                {r.meetings_7d > 0 && <span className="block text-xs text-slate-500">{r.meetings_7d} hosted (7 days)</span>}
              </td>
              <td className={cn(td, r.book_handle ? "text-slate-700" : "text-slate-400")}>{r.book_handle ? `@${r.book_handle}` : "—"}</td>
            </tr>
          ))}
        </Table>
      </Panel>
    </>
  );
}
