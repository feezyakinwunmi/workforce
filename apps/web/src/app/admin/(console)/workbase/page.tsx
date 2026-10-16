import Link from "next/link";
import { BarList, StackedColumns } from "@/components/charts";
import { InfoTip, Notice, PageHeader, Panel, StatStrip } from "@/components/ui";
import { naira } from "@/lib/billing";
import { requireAdmin } from "@/lib/admin/server";
import { ago, day, TIER_BADGE, TIER_TEXT, type WorkbaseReport } from "@/lib/admin/types";
import { cn } from "@/lib/utils";
import { dayColumns, daysParam, n, pct, plural, RangeSwitch, Table, td, whole } from "../_parts";

export const metadata = { title: "Workbase" };
export const dynamic = "force-dynamic";

const FEATURES: Array<[keyof WorkbaseReport["features"], string]> = [
  ["clock_in", "Clocked in"],
  ["tasks", "Tasks"],
  ["chat", "Chat"],
  ["leave", "Leave requests"],
  ["phone_clock_in", "Phone clock-in"],
  ["payslips", "Payslips issued"],
  ["expenses", "Expense claims"],
  ["reviews", "Reviews"],
  ["clock_reminders", "Clock reminders set"],
  ["screenshots_on", "Screenshots on (Pro)"],
];

export default async function WorkbaseTab({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { db, base } = await requireAdmin();
  const days = daysParam((await searchParams).days);
  const { data, error } = await db.rpc("admin_workbase", { p_days: days });
  if (error || !data) return <Notice tone="error">Couldn&apos;t load Workbase: {error?.message ?? "no data"}. Has migration 0039 been run?</Notice>;
  const w = data as WorkbaseReport;
  const paying = w.plans.standard + w.plans.pro;
  const companies = w.plans.free + w.plans.trial + paying;
  const sessions = w.people.desktop_sessions + w.people.phone_sessions;
  const hours = w.daily.reduce((a, d) => a + d.hours, 0);
  const f = w.funnel;

  return (
    <>
      <PageHeader title="Workbase" meta="Time tracking and HR for remote teams" actions={<RangeSwitch href={`${base}/workbase`} days={days} />} />

      <StatStrip
        stats={[
          { label: "Paying companies", value: n(paying), icon: "card", tone: "green", hint: `${n(w.plans.standard)} Standard · ${n(w.plans.pro)} Pro` },
          { label: "On free trial", value: n(w.plans.trial), icon: "clock", tone: "amber", hint: `${n(w.plans.free)} on Free` },
          { label: "Monthly value", value: naira(w.plans.monthly_value_kobo), icon: "wallet", tone: "amber", hint: `${plural(w.plans.paid_seats, "paid seat")} × plan price` },
          { label: "Companies", value: n(companies), icon: "briefcase", hint: w.plans.closing ? `${n(w.plans.closing)} closing` : undefined },
        ]}
      />
      <StatStrip
        stats={[
          { label: "People in companies", value: n(w.people.members), icon: "users", hint: `${plural(w.people.pending_invites, "invitation")} waiting` },
          { label: "Clocked in this week", value: n(w.people.tracking_7d), icon: "clock", tone: "green", hint: `${pct(w.people.tracking_7d, w.people.members)} of people` },
          { label: "Working right now", value: n(w.people.working_now), icon: "activity", tone: "green", hint: w.people.not_reporting ? `${n(w.people.not_reporting)} desktop app${w.people.not_reporting === 1 ? "" : "s"} not reporting` : undefined },
          { label: `Clock-ins, ${days} days`, value: n(sessions), icon: "monitor", hint: `${pct(w.people.phone_sessions, sessions)} by phone · ${n(w.people.lost_sessions)} cut off` },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Companies clocking in per day" bodyClassName="p-5">
          <StackedColumns
            dense
            caption="Companies with at least one clock-in per day"
            series={["Companies"]}
            format={whole}
            columns={dayColumns(w.daily, (d) => d.active_companies, (d, v) => `${plural(v, "company", "companies")} · ${plural(d.people, "person", "people")}\n${plural(d.new_companies, "new company", "new companies")}`)}
          />
        </Panel>
        <Panel title={`Hours tracked per day · ${n(Math.round(hours))} h in ${days} days`} bodyClassName="p-5">
          <StackedColumns
            dense
            caption="Hours tracked per day, all companies"
            series={["Hours"]}
            format={(v) => (Number.isInteger(v) ? `${n(v)} h` : "")}
            columns={dayColumns(w.daily, (d) => d.hours, (d, v) => `${n(v)} hours · ${plural(d.people, "person", "people")}`)}
          />
        </Panel>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Panel
          title={
            <span className="flex items-center gap-1.5">
              What companies use
              <InfoTip>Companies that used each part in the last 30 days (screenshots and reminders: switched on now), out of {n(companies)}.</InfoTip>
            </span>
          }
          bodyClassName="p-5"
        >
          <BarList format={(v) => `${n(v)} · ${pct(v, companies)}`} rows={FEATURES.map(([k, label]) => ({ key: k, label, value: w.features[k] }))} />
        </Panel>
        <Panel
          title={
            <span className="flex items-center gap-1.5">
              New companies: how far they got
              <InfoTip>Companies created in the last {days} days.</InfoTip>
            </span>
          }
          bodyClassName="p-5"
        >
          <BarList
            format={(v) => n(v)}
            rows={[
              { key: "c", label: "Created a company", value: f.created_company },
              { key: "i", label: `Invited their team · ${pct(f.invited_team, f.created_company)}`, value: f.invited_team },
              { key: "k", label: `Someone clocked in · ${pct(f.first_clock_in, f.created_company)}`, value: f.first_clock_in },
              { key: "p", label: `Paid · ${pct(f.paid, f.created_company)}`, value: f.paid },
            ]}
          />
        </Panel>
        <Panel title="Desktop app" bodyClassName="space-y-5 p-5">
          {w.app_versions.length ? (
            <BarList format={(v) => plural(v, "PC")} rows={w.app_versions.map((v) => ({ key: v.version, label: `Version ${v.version}`, value: v.devices }))} />
          ) : (
            <p className="text-sm text-slate-500">No desktop apps seen in the last 14 days.</p>
          )}
          {w.os.length > 0 && <BarList format={(v) => plural(v, "PC")} rows={w.os.map((o) => ({ key: o.os, label: o.os, value: o.devices }))} />}
          <p className="text-xs text-slate-500">Computers seen in the last 14 days.</p>
        </Panel>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Panel title="Busiest companies this week">
          <Table head={["Company", "Plan", "People", "Hours"]} empty="Nobody clocked in this week.">
            {w.top_companies.map((c) => (
              <tr key={c.id}>
                <td className={td}><Link className="font-medium text-brand-700 hover:underline" href={`${base}/companies/${c.id}`}>{c.name}</Link></td>
                <td className={td}><span className={cn("badge", TIER_BADGE[c.tier])}>{TIER_TEXT[c.tier]}</span></td>
                <td className={cn(td, "tabular-nums")}>{c.people_7d} of {c.members}</td>
                <td className={cn(td, "tabular-nums")}>{n(c.hours_7d)} h</td>
              </tr>
            ))}
          </Table>
        </Panel>
        <Panel
          title={
            <span className="flex items-center gap-1.5">
              Quiet this week
              <InfoTip>No clock-ins in the last 7 days. Newest first: a call or WhatsApp now often saves them.</InfoTip>
            </span>
          }
        >
          <Table head={["Company", "Plan", "People", "Last clock-in"]} empty="Every company clocked in this week.">
            {w.quiet_companies.map((c) => (
              <tr key={c.id}>
                <td className={td}>
                  <Link className="font-medium text-brand-700 hover:underline" href={`${base}/companies/${c.id}`}>{c.name}</Link>
                  <span className="block text-xs text-slate-500">joined {day(c.created_at)}</span>
                </td>
                <td className={td}><span className={cn("badge", TIER_BADGE[c.tier])}>{TIER_TEXT[c.tier]}</span></td>
                <td className={cn(td, "tabular-nums")}>{c.members}{c.invited ? <span className="text-xs text-slate-500"> +{c.invited} invited</span> : null}</td>
                <td className={cn(td, c.last_clock_in ? "text-slate-600" : "text-amber-700")}>{ago(c.last_clock_in)}</td>
              </tr>
            ))}
          </Table>
        </Panel>
      </div>

      <Panel title="Trials ending in 7 days">
        <Table head={["Company", "Ends", "People", "Last clock-in"]} empty="None this week.">
          {w.trials_ending.map((c) => (
            <tr key={c.id}>
              <td className={td}><Link className="font-medium text-brand-700 hover:underline" href={`${base}/companies/${c.id}`}>{c.name}</Link></td>
              <td className={cn(td, "text-slate-600")}>{day(c.trial_ends_at)}</td>
              <td className={cn(td, "tabular-nums")}>{c.members}</td>
              <td className={cn(td, "text-slate-600")}>{ago(c.last_clock_in)}</td>
            </tr>
          ))}
        </Table>
      </Panel>
    </>
  );
}
