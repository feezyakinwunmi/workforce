import type { Metadata } from "next";
import { money } from "@/lib/payroll";
import { CATEGORY, EXPENSE_COLUMNS, RECEIPT_BUCKET, STATUS, type Expense } from "@/lib/expenses";
import { requireMember } from "@/lib/session";
import { formatDay, localDateIn } from "@/lib/time";
import { displayName, loadPeople } from "@/lib/tracking";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Avatar, EmptyState, Notice, PageHeader, Panel, StatStrip } from "@/components/ui";
import { cancelExpense, decideExpense } from "./actions";
import { ClaimForm } from "./claim-form";

export const metadata: Metadata = { title: "Expenses" };

function sum(list: Expense[]) {
  const by = new Map<string, number>();
  for (const e of list) by.set(e.currency, (by.get(e.currency) ?? 0) + Number(e.amount_minor));
  if (!by.size) return "₦0";
  return [...by.entries()].map(([c, m]) => money(m, c)).join(" + ");
}

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { supabase, user, member, org } = await requireMember();
  const manager = member.role !== "worker";
  const [{ data }, { profiles }] = await Promise.all([
    supabase.from("expense_claims").select(EXPENSE_COLUMNS).order("created_at", { ascending: false }).limit(300),
    loadPeople(supabase, { includeRemoved: true }),
  ]);
  const claims = ((data ?? []) as Expense[]).map((e) => ({ ...e, amount_minor: Number(e.amount_minor) }));
  const mine = claims.filter((c) => c.user_id === user.id);
  const toDecide = claims.filter((c) => c.user_id !== user.id && c.status === "pending");
  const team = claims.filter((c) => c.user_id !== user.id && c.status !== "pending" && c.status !== "cancelled").slice(0, 30);

  const paths = claims.map((c) => c.receipt?.path).filter((p): p is string => Boolean(p));
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrls(paths, 3600);
    for (const s of (signed ?? []) as Array<{ path: string | null; signedUrl: string | null }>) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  const year = localDateIn(member.timezone).slice(0, 4);

  const Receipt = ({ c }: { c: Expense }) => {
    const url = c.receipt ? urls.get(c.receipt.path) : undefined;
    if (!c.receipt) return <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400" title="No receipt"><Icon name={CATEGORY[c.category].icon} /></span>;
    const image = c.receipt.type.startsWith("image/") && c.receipt.type !== "image/heic" && c.receipt.type !== "image/heif";
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50" title="Open the receipt">
        {image && url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`Receipt: ${c.title}`} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-slate-400"><Icon name="receipt" /></span>
        )}
      </a>
    );
  };

  const Line = ({ c, who }: { c: Expense; who?: boolean }) => {
    const p = profiles.get(c.user_id);
    return (
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Receipt c={c} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-slate-900">{c.title}</p>
          <p className="truncate text-xs text-slate-500">
            {who && <>{displayName(p)} · </>}
            {CATEGORY[c.category].label} · {formatDay(c.spent_on, { day: "numeric", month: "short" })}
            {c.status === "paid" && c.paid_month && <> · paid with {formatDay(c.paid_month, { month: "long" })} pay</>}
          </p>
          {c.decision_note && <p className="mt-0.5 text-xs text-slate-600">“{c.decision_note}”</p>}
        </div>
        <div className="text-right">
          <p className="font-semibold text-slate-900 tabular-nums">{money(c.amount_minor, c.currency)}</p>
          <span className={cn("badge mt-0.5", STATUS[c.status].style)}>{STATUS[c.status].label}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Expenses" />
      {error && <Notice tone="error">{error}</Notice>}

      <StatStrip
        stats={[
          { label: "Waiting for approval", value: sum(mine.filter((c) => c.status === "pending")), icon: "clock", tone: "amber" },
          { label: "Approved, to be paid", value: sum(mine.filter((c) => c.status === "approved")), icon: "check", tone: "green" },
          { label: `Paid back in ${year}`, value: sum(mine.filter((c) => c.status === "paid" && (c.paid_month ?? "").startsWith(year))), icon: "wallet", tone: "brand" },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="space-y-6">
          {manager && (
            <Panel title={<span className="flex items-center gap-2">To approve {toDecide.length > 0 && <span className="badge bg-amber-100 text-amber-800">{toDecide.length}</span>}</span>}>
              {toDecide.length ? (
                <ul className="divide-y divide-slate-100">
                  {toDecide.map((c) => (
                    <li key={c.id} className="space-y-3 px-5 py-4">
                      <div className="flex items-start gap-3">
                        <Avatar name={profiles.get(c.user_id)?.full_name} email={profiles.get(c.user_id)?.email} size="sm" />
                        <Line c={c} who />
                      </div>
                      {c.note && <p className="ml-10 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{c.note}</p>}
                      <form action={decideExpense} className="ml-10 flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={c.id} />
                        <input name="note" className="input min-w-40 flex-1 py-1.5 text-sm" placeholder="Note (optional)" maxLength={300} />
                        <button name="decision" value="approve" className="btn-primary btn-sm">
                          <Icon name="check" className="h-3.5 w-3.5" />
                          Approve
                        </button>
                        <button name="decision" value="reject" className="btn-secondary btn-sm">Not approved</button>
                      </form>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon="check" title="Nothing waiting." className="py-8" />
              )}
            </Panel>
          )}

          <Panel title="My claims">
            {mine.length ? (
              <ul className="divide-y divide-slate-100">
                {mine.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-5 py-3.5">
                    <Line c={c} />
                    {c.status === "pending" && (
                      <form action={cancelExpense}>
                        <input type="hidden" name="id" value={c.id} />
                        <button className="btn-ghost px-2 text-slate-400 hover:text-red-600" title="Cancel this claim">
                          <Icon name="x" className="h-4 w-4" />
                          <span className="sr-only">Cancel claim</span>
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon="receipt" title="No claims yet." className="py-8" />
            )}
          </Panel>

          {manager && team.length > 0 && (
            <Panel title="Team claims">
              <ul className="divide-y divide-slate-100">
                {team.map((c) => (
                  <li key={c.id} className="px-5 py-3.5"><Line c={c} who /></li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <Panel title="New claim" bodyClassName="p-5" className="order-first self-start lg:order-none">
          <ClaimForm orgId={org.id} userId={user.id} today={localDateIn(member.timezone)} />
        </Panel>
      </div>
    </div>
  );
}
