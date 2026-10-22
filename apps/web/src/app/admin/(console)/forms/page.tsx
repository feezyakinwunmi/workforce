import { StackedColumns } from "@/components/charts";
import { InfoTip, Notice, PageHeader, Panel, StatStrip } from "@/components/ui";
import { naira } from "@/lib/billing";
import { formsLink } from "@/lib/forms/paths";
import { requireAdmin } from "@/lib/admin/server";
import { ago, day, type FormsReport } from "@/lib/admin/types";
import { cn, siteUrl } from "@/lib/utils";
import { dayColumns, daysParam, n, nairaShort, pct, plural, RangeSwitch, Table, td, whole } from "../_parts";

export const metadata = { title: "Forms" };
export const dynamic = "force-dynamic";

const mb = (b: number) => (b >= 1073741824 ? `${(b / 1073741824).toFixed(2)} GB` : `${(b / 1048576).toFixed(1)} MB`);

export default async function FormsTab({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { db, base } = await requireAdmin();
  const days = daysParam((await searchParams).days);
  const { data, error } = await db.rpc("admin_forms", { p_days: days });
  if (error || !data) return <Notice tone="error">Couldn&apos;t load Forms: {error?.message ?? "no data"}. Has migration 0048 been run?</Notice>;
  const f = data as FormsReport;

  return (
    <>
      <PageHeader title="Forms" meta="Form builder with payments · answers, emails and files are never shown here" actions={<RangeSwitch href={`${base}/forms`} days={days} />} />

      <StatStrip
        stats={[
          { label: "Forms", value: n(f.forms.total), icon: "note", hint: `${n(f.forms.live)} live · ${n(f.forms.drafts)} drafts · ${plural(f.forms.makers, "maker")}` },
          { label: "Take payments", value: n(f.forms.paid_forms), icon: "cash", hint: `${n(f.payouts)} makers added a bank account` },
          { label: `New forms, ${days} days`, value: n(f.forms.new), icon: "plus", tone: "green" },
          { label: "Files stored", value: n(f.files.count), icon: "paperclip", hint: mb(f.files.bytes) },
        ]}
      />
      <StatStrip
        stats={[
          { label: `Answers, ${days} days`, value: n(f.answers.received), icon: "check", hint: `${pct(f.answers.embedded, f.answers.received)} from websites (embedded)` },
          { label: "Paid answers", value: n(f.answers.paid), icon: "card", hint: `${n(f.answers.unpaid)} left without paying` },
          { label: "Paid to makers", value: naira(f.money.paid_kobo), icon: "cash", tone: "green" },
          { label: "Your 3% fees", value: naira(f.money.fees_kobo), icon: "wallet", tone: "amber", hint: `${naira(f.money.fees_all_time_kobo)} all time` },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Answers per day" bodyClassName="p-5">
          <StackedColumns dense caption="Answers received per day" series={["Answers"]} format={whole}
            columns={dayColumns(f.daily, (d) => d.answers, (d, v) => plural(v, "answer"))} />
        </Panel>
        <Panel title="Paid through forms per day" bodyClassName="p-5">
          <StackedColumns dense caption="Money paid through forms per day" series={["Paid"]} format={nairaShort}
            columns={dayColumns(f.daily, (d) => d.paid_kobo, (d, v) => `${naira(v)} paid · ${naira(d.fees_kobo)} your fee`)} />
        </Panel>
      </div>

      <Panel
        title={
          <span className="flex items-center gap-1.5">
            Forms
            <InfoTip>Busiest in the last {days} days first. Only counts and money; never what people answered.</InfoTip>
          </span>
        }
      >
        <Table head={["Form", "Owner", "Status", "Payments", "Answers", "Paid", "Last answer"]} empty="Nobody has made a form yet.">
          {f.form_list.map((x) => (
            <tr key={x.id} className={x.published ? undefined : "opacity-60"}>
              <td className={td}>
                {x.published ? (
                  <a className="font-medium text-brand-700 hover:underline" href={formsLink(`/f/${x.slug}`, siteUrl())} target="_blank" rel="noreferrer">{x.title}</a>
                ) : (
                  <span className="font-medium text-slate-800">{x.title}</span>
                )}
                <span className="block text-xs text-slate-500">{n(x.answers_total)} answers in all</span>
              </td>
              <td className={td}>{x.owner}<span className="block text-xs text-slate-500">{x.owner_email}</span></td>
              <td className={td}>
                <span className={cn("badge", !x.published ? "bg-slate-100 text-slate-600" : x.accepting ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
                  {!x.published ? "Draft" : x.accepting ? "Live" : "Closed"}
                </span>
              </td>
              <td className={cn(td, x.takes_payments && !x.payouts ? "text-amber-700" : "text-slate-700")}>
                {!x.takes_payments ? "None" : x.payouts ? "Bank added" : "No bank yet"}
              </td>
              <td className={cn(td, "tabular-nums")}>{x.answers_period}</td>
              <td className={cn(td, "tabular-nums")}>{naira(x.paid_period_kobo)}</td>
              <td className={cn(td, "whitespace-nowrap text-slate-600")}>{x.last_answer ? ago(x.last_answer) : `made ${day(x.created_at)}`}</td>
            </tr>
          ))}
        </Table>
      </Panel>
    </>
  );
}
