import Link from "next/link";
import { BarList, StackedColumns, type Column } from "@/components/charts";
import { InfoTip, Notice, PageHeader, Panel, StatStrip } from "@/components/ui";
import { naira } from "@/lib/billing";
import { requireAdmin } from "@/lib/admin/server";
import { ago, day, productLabel, when, type Daily, type Overview } from "@/lib/admin/types";
import { cn } from "@/lib/utils";

export const metadata = { title: { absolute: "Overview · Workbase Console" } };
export const dynamic = "force-dynamic";

const n = (v: number) => new Intl.NumberFormat("en-NG").format(v);
/** Axis labels for counts: whole numbers only. */
const whole = (v: number) => (Number.isInteger(v) ? n(v) : "");
const sum = (o: Record<string, number> | undefined) => Object.values(o ?? {}).reduce((a, b) => a + b, 0);
/** ₦ on chart axes: ₦0, ₦5k, ₦1.2m. */
const nairaShort = (kobo: number) => {
  const v = kobo / 100;
  return v >= 1_000_000 ? `₦${+(v / 1_000_000).toFixed(1)}m` : v >= 1000 ? `₦${+(v / 1000).toFixed(1)}k` : `₦${Math.round(v)}`;
};

function columns(daily: Daily[], pick: (d: Daily) => number, tip: (d: Daily, v: number) => string): Column[] {
  const step = daily.length > 45 ? 14 : 7;
  return daily.map((d, i) => {
    const v = pick(d);
    const label = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d.day}T12:00:00Z`));
    return {
      key: d.day,
      label: (daily.length - 1 - i) % step === 0 ? label : "",
      values: [v],
      tooltip: `${label}\n${tip(d, v)}`,
      highlight: i === daily.length - 1,
    };
  });
}

export default async function AdminOverview({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { db, base } = await requireAdmin();
  const days = (await searchParams).days === "90" ? 90 : 30;
  const { data, error } = await db.rpc("admin_overview", { p_days: days });
  if (error || !data) {
    return <Notice tone="error">Couldn&apos;t load the numbers: {error?.message ?? "no data"}. Has migration 0038 been run?</Notice>;
  }
  const o = data as Overview;
  const t = o.totals;
  const monthTotal = sum(o.money.this_month);
  const d30Total = sum(o.money.last_30_days);
  const allTotal = sum(o.money.all_time);
  const periodSignups = o.daily.reduce((a, d) => a + d.signups, 0);
  const periodMoney = o.daily.reduce((a, d) => a + sum(d.revenue), 0);
  const f = o.funnel;
  const funnel = [
    ["signed_up", "Signed up", f.signed_up],
    ["created_company", "Created a company", f.created_company],
    ["invited_team", "Invited their team", f.invited_team],
    ["first_clock_in", "Someone clocked in", f.first_clock_in],
    ["paid", "Paid", f.paid],
  ] as const;

  return (
    <>
      <PageHeader
        title="Overview"
        meta={`Lagos time · updated ${when(o.generated_at)}`}
        actions={
          <div className="flex rounded-lg border border-slate-200 bg-surface p-0.5 text-sm">
            {[30, 90].map((d) => (
              <Link
                key={d}
                href={`${base || "/"}${d === 30 ? "" : "?days=90"}`}
                className={cn("rounded-md px-3 py-1", days === d ? "bg-brand-600 text-white" : "text-slate-600 hover:text-slate-900")}
              >
                {d} days
              </Link>
            ))}
          </div>
        }
      />

      {(t.failed_payments_7d > 0 || o.trials_ending.length > 0) && (
        <div className="space-y-2">
          {t.failed_payments_7d > 0 && <Notice tone="warning">{t.failed_payments_7d} failed payment{t.failed_payments_7d === 1 ? "" : "s"} this week. See Recent payments below.</Notice>}
          {o.trials_ending.length > 0 && <Notice tone="info">{o.trials_ending.length} trial{o.trials_ending.length === 1 ? " ends" : "s end"} in the next 7 days: a good moment to call them.</Notice>}
        </div>
      )}

      <StatStrip
        stats={[
          { label: "Accounts", value: n(t.accounts), icon: "users", hint: `+${n(t.accounts_7d)} this week · guests not counted` },
          { label: "Companies", value: n(t.companies), icon: "briefcase", hint: `+${n(t.companies_7d)} this week` },
          { label: "Clocked in this week", value: n(t.active_companies_7d), icon: "clock", tone: "green", hint: `${t.active_companies_7d === 1 ? "company" : "companies"} · ${n(t.people_tracking_7d)} ${t.people_tracking_7d === 1 ? "person" : "people"}` },
          { label: "Working right now", value: n(t.working_now), icon: "activity", tone: "green" },
        ]}
      />
      <StatStrip
        stats={[
          { label: "Money in this month", value: naira(monthTotal), icon: "wallet", tone: "amber" },
          { label: "Last 30 days", value: naira(d30Total), icon: "chart", tone: "amber" },
          { label: "All time", value: naira(allTotal), icon: "cash", tone: "amber" },
          { label: "Paying companies", value: n(t.paying_companies), icon: "card", hint: `${n(t.trial_companies)} on trial` },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={`Sign-ups per day · ${n(periodSignups)} in ${days} days`} bodyClassName="p-5">
          <StackedColumns
            caption="Sign-ups per day"
            series={["Sign-ups"]}
            dense
            format={whole}
            columns={columns(o.daily, (d) => d.signups, (d, v) => `${v} sign-up${v === 1 ? "" : "s"} · ${d.companies} compan${d.companies === 1 ? "y" : "ies"} created`)}
          />
        </Panel>
        <Panel title="Companies clocking in per day" bodyClassName="p-5">
          <StackedColumns
            caption="Companies with at least one clock-in per day"
            series={["Companies"]}
            dense
            format={whole}
            columns={columns(o.daily, (d) => d.active_companies, (d, v) => `${v} compan${v === 1 ? "y" : "ies"} · ${d.people_tracking} people`)}
          />
        </Panel>
        <Panel title={`Money in per day · ${naira(periodMoney)} in ${days} days`} bodyClassName="p-5">
          <StackedColumns
            caption="Money in per day, all products"
            series={["Money in"]}
            dense
            format={nairaShort}
            columns={columns(o.daily, (d) => sum(d.revenue), (d) =>
              Object.keys(d.revenue).length ? Object.entries(d.revenue).map(([p, k]) => `${productLabel(p)}: ${naira(k)}`).join("\n") : "Nothing",
            )}
          />
        </Panel>
        <Panel title="Meet minutes per day" bodyClassName="p-5">
          <StackedColumns
            caption="Minutes of Workbase Meet meetings per day"
            series={["Minutes"]}
            dense
            format={whole}
            columns={columns(o.daily, (d) => d.meet_minutes, (d, v) => `${n(v)} minutes · ${d.meetings} meeting${d.meetings === 1 ? "" : "s"}`)}
          />
        </Panel>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Panel title="Money by product" bodyClassName="p-5">
          {Object.keys(o.money.all_time).length ? (
            <BarList
              format={(v) => naira(v)}
              rows={Object.entries(o.money.all_time)
                .sort((a, b) => b[1] - a[1])
                .map(([p, v]) => ({ key: p, label: productLabel(p), value: v, hint: `This month ${naira(o.money.this_month[p] ?? 0)}` }))}
            />
          ) : (
            <p className="text-sm text-slate-500">No payments yet.</p>
          )}
          <p className="mt-4 text-xs text-slate-500">All time. Paystack&apos;s own fees are not taken off.</p>
        </Panel>
        <Panel
          title={
            <span className="flex items-center gap-1.5">
              Where people drop off
              <InfoTip>People who signed up in the last {days} days, then the companies created in that time and how far each one got. Invited people sign up too, so not every sign-up should create a company.</InfoTip>
            </span>
          }
          bodyClassName="p-5"
        >
          <BarList
            format={(v) => n(v)}
            rows={funnel.map(([k, label, v], i) => {
              // Sign-ups are people; the later steps are companies, so they're shown as a share of companies created.
              const of = i === 0 ? null : i === 1 ? f.signed_up : f.created_company;
              const share = of ? ` · ${Math.round((v / of) * 100)}% of ${i === 1 ? "sign-ups" : "companies"}` : "";
              return { key: k, label: `${label}${share}`, value: v };
            })}
          />
        </Panel>
        <Panel title="Desktop app versions" bodyClassName="p-5">
          {o.app_versions.length ? (
            <BarList format={(v) => `${v} PC${v === 1 ? "" : "s"}`} rows={o.app_versions.map((v) => ({ key: v.version, label: v.version, value: v.devices }))} />
          ) : (
            <p className="text-sm text-slate-500">No desktop apps seen in the last 14 days.</p>
          )}
          <p className="mt-4 text-xs text-slate-500">Computers seen in the last 14 days.</p>
        </Panel>
      </div>

      <div className="space-y-6">
        <StatStrip
          stats={[
            { label: "Meet: live now", value: n(t.meet_live), icon: "video" },
            { label: "Meetings in 7 days", value: n(t.meet_meetings_7d), hint: `${n(t.meet_minutes_7d)} minutes`, icon: "video" },
            { label: "Meet Pro hosts", value: n(t.meet_paid_hosts), icon: "card" },
          ]}
        />
        <StatStrip
          stats={[
            { label: "Book pages", value: n(t.book_pages), icon: "calendar", hint: `${n(t.book_pages_payouts)} take payments` },
            { label: "Bookings in 7 days", value: n(t.book_bookings_7d), icon: "calendar" },
            { label: "Book Pro", value: n(t.book_pro), icon: "card" },
          ]}
        />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Panel title="Trials ending in 7 days" bodyClassName="overflow-x-auto">
          {o.trials_ending.length ? (
            <table className="w-full text-left text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-5 py-2.5">Company</th>
                  <th className="px-5 py-2.5">Ends</th>
                  <th className="px-5 py-2.5">People</th>
                  <th className="px-5 py-2.5">Last clock-in</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {o.trials_ending.map((c) => (
                  <tr key={c.id}>
                    <td className="px-5 py-2.5"><Link className="font-medium text-brand-700 hover:underline" href={`${base}/companies/${c.id}`}>{c.name}</Link></td>
                    <td className="px-5 py-2.5 text-slate-600">{day(c.trial_ends_at)}</td>
                    <td className="px-5 py-2.5 text-slate-600 tabular-nums">{c.members}</td>
                    <td className="px-5 py-2.5 text-slate-600">{ago(c.last_clock_in)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-5 py-6 text-sm text-slate-500">None this week.</p>
          )}
        </Panel>
        <Panel title="Recent payments" bodyClassName="overflow-x-auto">
          {o.recent_payments.length ? (
            <table className="w-full text-left text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-5 py-2.5">When</th>
                  <th className="px-5 py-2.5">Who</th>
                  <th className="px-5 py-2.5">What</th>
                  <th className="px-5 py-2.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {o.recent_payments.map((p, i) => (
                  <tr key={i}>
                    <td className="px-5 py-2.5 whitespace-nowrap text-slate-600">{when(p.at)}</td>
                    <td className="px-5 py-2.5">
                      {p.organization_id ? <Link className="text-brand-700 hover:underline" href={`${base}/companies/${p.organization_id}`}>{p.who}</Link> : p.who ?? "—"}
                    </td>
                    <td className="px-5 py-2.5 text-slate-600">
                      {productLabel(p.product)}
                      {p.status === "failed" && <span className="badge ml-2 bg-red-50 text-red-700" title={p.failure_reason ?? undefined}>Failed</span>}
                    </td>
                    <td className={cn("px-5 py-2.5 text-right tabular-nums", p.status === "failed" ? "text-slate-400 line-through" : "text-slate-900")}>{naira(p.amount_kobo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-5 py-6 text-sm text-slate-500">No payments yet.</p>
          )}
        </Panel>
      </div>
    </>
  );
}
