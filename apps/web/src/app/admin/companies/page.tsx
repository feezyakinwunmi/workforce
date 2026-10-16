import Link from "next/link";
import { Icon } from "@/components/icons";
import { EmptyState, Notice, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/admin/server";
import { ago, day, TIER_BADGE, TIER_TEXT, type CompanyRow } from "@/lib/admin/types";
import { cn } from "@/lib/utils";

export const metadata = { title: "Companies" };
export const dynamic = "force-dynamic";

export default async function AdminCompanies({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { db, base } = await requireAdmin();
  const q = ((await searchParams).q ?? "").trim().slice(0, 100);
  const { data, error } = await db.rpc("admin_companies", { p_q: q, p_limit: 100 });
  const rows = (data as CompanyRow[] | null) ?? [];

  return (
    <>
      <PageHeader title="Companies" meta={q ? `${rows.length} matching “${q}”` : `${rows.length} newest first`} />
      <form className="flex gap-2" action={`${base}/companies`}>
        <label className="sr-only" htmlFor="q">Search</label>
        <input id="q" name="q" defaultValue={q} className="input max-w-md" placeholder="Company name or anyone's email" autoFocus />
        <button className="btn-primary"><Icon name="search" className="h-4 w-4" />Search</button>
      </form>
      {error && <Notice tone="error">{error.message}</Notice>}

      <section className="card overflow-x-auto">
        {rows.length ? (
          <table className="w-full text-left text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-5 py-2.5">Company</th>
                <th className="px-5 py-2.5">Owner</th>
                <th className="px-5 py-2.5">Plan</th>
                <th className="px-5 py-2.5">People</th>
                <th className="px-5 py-2.5">Last clock-in</th>
                <th className="px-5 py-2.5">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <Link href={`${base}/companies/${c.id}`} className="font-medium text-slate-900 hover:text-brand-700">{c.name}</Link>
                    <span className="mt-0.5 flex flex-wrap gap-1">
                      {c.closing_at && <span className="badge bg-red-50 text-red-700">Closing</span>}
                      {c.support_until && <span className="badge bg-emerald-50 text-emerald-700">Support access on</span>}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="block text-slate-700">{c.owner ?? "—"}</span>
                    <span className="block text-xs text-slate-500">{c.owner_email}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={cn("badge", TIER_BADGE[c.tier])}>{TIER_TEXT[c.tier]}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {c.tier === "trial" ? `ends ${day(c.trial_ends_at)}` : c.paid_until ? `until ${day(c.paid_until)}` : ""}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-700 tabular-nums">
                    {c.active_members}
                    {c.pending_invites > 0 && <span className="block text-xs text-slate-500">+{c.pending_invites} invited</span>}
                  </td>
                  <td className={cn("px-5 py-3", c.last_clock_in ? "text-slate-700" : "text-amber-700")}>{ago(c.last_clock_in)}</td>
                  <td className="px-5 py-3 whitespace-nowrap text-slate-500">{day(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState icon="briefcase" title={q ? "No company matches that." : "No companies yet."} />
        )}
      </section>
    </>
  );
}
