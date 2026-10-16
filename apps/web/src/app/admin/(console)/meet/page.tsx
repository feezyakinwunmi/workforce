import Link from "next/link";
import { StackedColumns } from "@/components/charts";
import { InfoTip, Notice, PageHeader, Panel, StatStrip } from "@/components/ui";
import { naira } from "@/lib/billing";
import { requireAdmin } from "@/lib/admin/server";
import { ago, day, when, type MeetReport } from "@/lib/admin/types";
import { cn } from "@/lib/utils";
import { dayColumns, daysParam, n, pct, plural, RangeSwitch, Table, td, whole } from "../_parts";

export const metadata = { title: "Meet" };
export const dynamic = "force-dynamic";

const PlanBadge = ({ tier }: { tier: "free" | "pro" }) => (
  <span className={cn("badge", tier === "pro" ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-600")}>{tier === "pro" ? "Pro" : "Free"}</span>
);

export default async function MeetTab({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { db, base } = await requireAdmin();
  const days = daysParam((await searchParams).days);
  const { data, error } = await db.rpc("admin_meet", { p_days: days });
  if (error || !data) return <Notice tone="error">Couldn&apos;t load Meet: {error?.message ?? "no data"}. Has migration 0039 been run?</Notice>;
  const m = data as MeetReport;
  const t = m.totals;
  const pro = m.subscribers.filter((s) => s.plan === "pro");
  const business = m.subscribers.filter((s) => s.plan === "business");
  const liveGuests = m.live.reduce((a, r) => a + r.guests, 0);
  const livePeople = m.live.reduce((a, r) => a + r.people, 0);

  return (
    <>
      <PageHeader
        title="Meet"
        meta="Video meetings · only daily counts are kept after a meeting is deleted (7 days)"
        actions={<RangeSwitch href={`${base}/meet`} days={days} />}
      />

      <StatStrip
        stats={[
          { label: "Live now", value: n(m.live.length), icon: "video", tone: "green", hint: m.live.length ? `${plural(livePeople, "person", "people")} · ${n(liveGuests)} guests` : undefined },
          { label: `Meetings, ${days} days`, value: n(t.meetings), icon: "video", hint: `${n(m.upcoming)} scheduled ahead` },
          { label: "Minutes", value: n(t.minutes), icon: "clock", hint: t.meetings ? `${Math.round(t.minutes / t.meetings)} min per meeting` : undefined },
          { label: "Guests", value: pct(t.guests, t.people), icon: "users", hint: `of ${plural(t.people, "attendee")}` },
        ]}
      />
      <StatStrip
        stats={[
          { label: "Meet Pro hosts", value: n(pro.length), icon: "card", tone: "amber" },
          { label: "Meet Business", value: n(business.length), icon: "briefcase", tone: "amber", hint: "companies" },
          { label: "Money in, 30 days", value: naira(m.revenue.last_30_days), icon: "wallet", tone: "amber", hint: `${naira(m.revenue.all_time)} all time` },
          { label: "Hosts this week", value: n(m.hosts_7d), icon: "user", hint: `+${plural(m.workbase_included, "paid Workbase company", "paid Workbase companies")} with Pro included` },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Meetings per day" bodyClassName="p-5">
          <StackedColumns dense caption="Meetings per day" series={["Meetings"]} format={whole}
            columns={dayColumns(m.daily, (d) => d.meetings, (d, v) => `${plural(v, "meeting")} · ${plural(d.people, "person", "people")} (${n(d.guests)} guests)`)} />
        </Panel>
        <Panel title="Minutes per day" bodyClassName="p-5">
          <StackedColumns dense caption="Meeting minutes per day" series={["Minutes"]} format={whole}
            columns={dayColumns(m.daily, (d) => d.minutes, (d, v) => `${n(v)} minutes · ${plural(d.meetings, "meeting")}`)} />
        </Panel>
      </div>

      <Panel title="Live now">
        <Table head={["Host", "Plan", "Started", "People", "Guests", "Time limit"]} empty="No meeting is running.">
          {m.live.map((r, i) => (
            <tr key={i}>
              <td className={cn(td, "font-medium text-slate-800")}>{r.host}</td>
              <td className={td}><PlanBadge tier={r.tier} /></td>
              <td className={cn(td, "text-slate-600")}>{ago(r.started_at)}</td>
              <td className={cn(td, "tabular-nums")}>{r.people}</td>
              <td className={cn(td, "tabular-nums")}>{r.guests}</td>
              <td className={cn(td, "text-slate-600")}>{r.ends_at ? `ends ${when(r.ends_at)}` : "—"}</td>
            </tr>
          ))}
        </Table>
      </Panel>

      <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel
          title={
            <span className="flex items-center gap-1.5">
              Last 7 days
              <InfoTip>Meeting titles and codes aren&apos;t shown. Meetings are deleted 7 days after they end.</InfoTip>
            </span>
          }
        >
          <Table head={["Started", "Host", "Length", "People", "Guests"]} empty="No meetings in the last 7 days.">
            {m.recent.map((r, i) => (
              <tr key={i}>
                <td className={cn(td, "whitespace-nowrap text-slate-600")}>{when(r.started_at)}{r.scheduled && <span className="badge ml-1.5 bg-slate-100 text-slate-600">Planned</span>}</td>
                <td className={td}>{r.host} <PlanBadge tier={r.tier} /></td>
                <td className={cn(td, "tabular-nums")}>{r.ended_at ? `${r.minutes} min` : <span className="text-emerald-700">live</span>}</td>
                <td className={cn(td, "tabular-nums")}>{r.people}</td>
                <td className={cn(td, "tabular-nums")}>{r.guests}</td>
              </tr>
            ))}
          </Table>
        </Panel>
        <Panel title="Paying for Meet">
          <Table head={["Who", "Plan", "Until"]} empty="Nobody has bought Meet Pro or Business yet.">
            {m.subscribers.map((s, i) => (
              <tr key={i}>
                <td className={td}>
                  {s.organization_id ? <Link className="font-medium text-brand-700 hover:underline" href={`${base}/companies/${s.organization_id}`}>{s.company}</Link> : <span className="font-medium text-slate-800">{s.who}</span>}
                  {s.email && s.email !== s.who && <span className="block text-xs text-slate-500">{s.email}</span>}
                </td>
                <td className={td}>{s.plan === "business" ? "Business" : "Pro"}<span className="block text-xs text-slate-500">{naira(s.amount_kobo)} · {s.months} mo</span></td>
                <td className={cn(td, "whitespace-nowrap text-slate-600")}>{day(s.period_end)}</td>
              </tr>
            ))}
          </Table>
        </Panel>
      </div>
    </>
  );
}
