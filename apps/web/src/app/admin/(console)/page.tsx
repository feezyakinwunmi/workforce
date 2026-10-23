import Link from "next/link";
import { BarList, StackedColumns } from "@/components/charts";
import { Icon, type IconName } from "@/components/icons";
import { Notice, PageHeader, Panel, StatStrip } from "@/components/ui";
import { naira } from "@/lib/billing";
import { requireAdmin } from "@/lib/admin/server";
import { productLabel, when, type FormsReport, type Overview } from "@/lib/admin/types";
import { cn } from "@/lib/utils";
import { dayColumns, daysParam, n, nairaShort, plural, RangeSwitch, sum, Table, td, whole } from "./_parts";

export const metadata = { title: { absolute: "Overview · Workbase Console" } };
export const dynamic = "force-dynamic";

/** One product's headline numbers, linking to its tab. */
function ProductCard({ href, icon, title, money, rows }: { href: string; icon: IconName; title: string; money: number; rows: Array<[string, React.ReactNode]> }) {
  return (
    <Link href={href} className="card group block p-5 transition hover:border-brand-300">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:text-brand-700"><Icon name={icon} className="h-[1.1rem] w-[1.1rem]" /></span>
          <span className="section-title text-base">{title}</span>
        </span>
        <Icon name="arrowRight" className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
      </div>
      <p className="mt-4 text-xs text-slate-500">Money in this month</p>
      <p className="stat-value">{naira(money)}</p>
      <dl className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-slate-500">{k}</dt>
            <dd className="font-medium text-slate-800 tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </Link>
  );
}

export default async function AdminOverview({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { db, base } = await requireAdmin();
  const days = daysParam((await searchParams).days);
  const [{ data, error }, { data: formsData }] = await Promise.all([
    db.rpc("admin_overview", { p_days: days }),
    db.rpc("admin_forms", { p_days: 7 }),
  ]);
  const fm = formsData as FormsReport | null;
  if (error || !data) return <Notice tone="error">Couldn&apos;t load the numbers: {error?.message ?? "no data"}. Has migration 0038 been run?</Notice>;
  const o = data as Overview;
  const t = o.totals;
  const m = o.money.this_month;
  const periodSignups = o.daily.reduce((a, d) => a + d.signups, 0);
  const periodMoney = o.daily.reduce((a, d) => a + sum(d.revenue), 0);

  return (
    <>
      <PageHeader title="Overview" meta={`All products · Lagos time · updated ${when(o.generated_at)}`} actions={<RangeSwitch href={base} days={days} />} />

      {(t.failed_payments_7d > 0 || o.trials_ending.length > 0) && (
        <div className="space-y-2">
          {t.failed_payments_7d > 0 && (
            <Notice tone="warning" action={<Link href={`${base}/money?status=failed`} className="btn-secondary btn-sm">See them</Link>}>
              {plural(t.failed_payments_7d, "failed payment")} this week.
            </Notice>
          )}
          {o.trials_ending.length > 0 && (
            <Notice tone="info" action={<Link href={`${base}/workbase`} className="btn-secondary btn-sm">Who</Link>}>
              {plural(o.trials_ending.length, "Workbase trial")} end{o.trials_ending.length === 1 ? "s" : ""} in the next 7 days: a good moment to call.
            </Notice>
          )}
        </div>
      )}

      <StatStrip
        stats={[
          { label: "Accounts", value: n(t.accounts), icon: "users", hint: `+${n(t.accounts_7d)} this week` },
          { label: "Money in this month", value: naira(sum(m)), icon: "wallet", tone: "amber" },
          { label: "Last 30 days", value: naira(sum(o.money.last_30_days)), icon: "chart", tone: "amber" },
          { label: "All time", value: naira(sum(o.money.all_time)), icon: "cash", tone: "amber" },
        ]}
      />

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <ProductCard
          href={`${base}/workbase`}
          icon="clock"
          title="Workbase"
          money={(m.workbase_standard ?? 0) + (m.workbase_pro ?? 0)}
          rows={[
            ["Paying companies", n(t.paying_companies)],
            ["On trial", n(t.trial_companies)],
            ["Clocked in this week", plural(t.active_companies_7d, "company", "companies")],
            ["Working right now", n(t.working_now)],
          ]}
        />
        <ProductCard
          href={`${base}/meet`}
          icon="video"
          title="Meet"
          money={(m.meet_pro ?? 0) + (m.meet_business ?? 0) + (m.meet_topup ?? 0)}
          rows={[
            ["Live now", n(t.meet_live)],
            ["Meetings, 7 days", n(t.meet_meetings_7d)],
            ["Minutes, 7 days", n(t.meet_minutes_7d)],
            ["Meet Pro hosts", n(t.meet_paid_hosts)],
          ]}
        />
        <ProductCard
          href={`${base}/book`}
          icon="calendar"
          title="Book"
          money={(m.book_pro ?? 0) + (m.book_fees ?? 0)}
          rows={[
            ["Booking pages", n(t.book_pages)],
            ["Taking payments", n(t.book_pages_payouts)],
            ["Bookings, 7 days", n(t.book_bookings_7d)],
            ["Book Pro", n(t.book_pro)],
          ]}
        />
        <ProductCard
          href={`${base}/forms`}
          icon="note"
          title="Forms"
          money={m.forms_fees ?? 0}
          rows={[
            ["Forms", n(fm?.forms.total ?? 0)],
            ["Live", n(fm?.forms.live ?? 0)],
            ["Answers, 7 days", n(fm?.answers.received ?? 0)],
            ["Taking payments", n(fm?.forms.paid_forms ?? 0)],
          ]}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={`Sign-ups per day · ${n(periodSignups)} in ${days} days`} bodyClassName="p-5">
          <StackedColumns dense caption="Sign-ups per day" series={["Sign-ups"]} format={whole}
            columns={dayColumns(o.daily, (d) => d.signups, (d, v) => `${plural(v, "sign-up")} · ${plural(d.companies, "company", "companies")} created`)} />
        </Panel>
        <Panel title={`Money in per day · ${naira(periodMoney)} in ${days} days`} bodyClassName="p-5">
          <StackedColumns dense caption="Money in per day, all products" series={["Money in"]} format={nairaShort}
            columns={dayColumns(o.daily, (d) => sum(d.revenue), (d) =>
              Object.keys(d.revenue).length ? Object.entries(d.revenue).map(([p, k]) => `${productLabel(p)}: ${naira(k)}`).join("\n") : "Nothing")} />
        </Panel>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.6fr]">
        <Panel title="Money by product" bodyClassName="p-5">
          {Object.keys(o.money.all_time).length ? (
            <BarList
              format={(v) => naira(v)}
              rows={Object.entries(o.money.all_time).sort((a, b) => b[1] - a[1]).map(([p, v]) => ({ key: p, label: productLabel(p), value: v, hint: `This month ${naira(m[p] ?? 0)}` }))}
            />
          ) : (
            <p className="text-sm text-slate-500">No payments yet.</p>
          )}
          <p className="mt-4 text-xs text-slate-500">All time. <Link className="text-brand-700 hover:underline" href={`${base}/money`}>Month by month</Link></p>
        </Panel>
        <Panel title="Recent payments" actions={<Link href={`${base}/money`} className="text-sm text-brand-700 hover:underline">All payments</Link>}>
          <Table head={["When", "Who", "What", "Amount"]} empty="No payments yet.">
            {o.recent_payments.map((p, i) => (
              <tr key={i}>
                <td className={cn(td, "whitespace-nowrap text-slate-600")}>{when(p.at)}</td>
                <td className={td}>{p.organization_id ? <Link className="text-brand-700 hover:underline" href={`${base}/companies/${p.organization_id}`}>{p.who}</Link> : p.who ?? "—"}</td>
                <td className={cn(td, "text-slate-600")}>
                  {productLabel(p.product)}
                  {p.status === "failed" && <span className="badge ml-2 bg-red-50 text-red-700" title={p.failure_reason ?? undefined}>Failed</span>}
                </td>
                <td className={cn(td, "text-right tabular-nums", p.status === "failed" ? "text-slate-400 line-through" : "text-slate-900")}>{naira(p.amount_kobo)}</td>
              </tr>
            ))}
          </Table>
        </Panel>
      </div>
    </>
  );
}
