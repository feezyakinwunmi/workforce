import { StackedColumns } from "@/components/charts";
import { InfoTip, Notice, PageHeader, Panel, StatStrip } from "@/components/ui";
import { naira } from "@/lib/billing";
import { bookLink } from "@/lib/book/paths";
import { requireAdmin } from "@/lib/admin/server";
import { ago, day, type BookReport } from "@/lib/admin/types";
import { cn, siteUrl } from "@/lib/utils";
import { dayColumns, daysParam, n, nairaShort, pct, plural, RangeSwitch, Table, td, whole } from "../_parts";

export const metadata = { title: "Book" };
export const dynamic = "force-dynamic";

export default async function BookTab({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { db, base } = await requireAdmin();
  const days = daysParam((await searchParams).days);
  const { data, error } = await db.rpc("admin_book", { p_days: days });
  if (error || !data) return <Notice tone="error">Couldn&apos;t load Book: {error?.message ?? "no data"}. Has migration 0039 been run?</Notice>;
  const b = data as BookReport;
  const k = b.bookings;
  const cancelled = k.cancelled_customer + k.cancelled_host;

  return (
    <>
      <PageHeader title="Book" meta="Booking pages that take payment · customers' details are never shown here" actions={<RangeSwitch href={`${base}/book`} days={days} />} />

      <StatStrip
        stats={[
          { label: "Booking pages", value: n(b.pages.total), icon: "calendar", hint: `${n(b.pages.live)} live · ${plural(b.pages.services, "service")}` },
          { label: "Take payments", value: n(b.pages.payouts), icon: "bank", hint: `${pct(b.pages.payouts, b.pages.total)} added a bank account` },
          { label: "Book Pro", value: n(b.pages.pro), icon: "card", tone: "amber" },
          { label: "Coming up", value: n(k.upcoming), icon: "clock", tone: "green", hint: "confirmed bookings ahead" },
        ]}
      />
      <StatStrip
        stats={[
          { label: `Bookings, ${days} days`, value: n(k.made), icon: "calendar", hint: `${n(k.paid)} paid online · ${n(k.video)} video calls` },
          { label: "Cancelled", value: n(cancelled), icon: "x", hint: `${n(k.cancelled_customer)} by customers · ${n(k.cancelled_host)} by hosts` },
          { label: "No-shows", value: n(k.no_show), icon: "alert", hint: `${n(k.completed)} completed` },
          { label: "Left unpaid", value: n(k.unpaid_released), icon: "clock", hint: `${n(k.waiting_payment)} waiting to pay now` },
        ]}
      />
      <StatStrip
        stats={[
          { label: `Customers paid hosts, ${days} days`, value: naira(b.money.customers_paid_kobo), icon: "cash", tone: "green" },
          { label: "Your 3% fees", value: naira(b.money.fees_kobo), icon: "wallet", tone: "amber", hint: `${naira(b.money.fees_all_time_kobo)} all time` },
          { label: "Book Pro sales", value: naira(b.money.pro_kobo), icon: "card", tone: "amber", hint: `${days} days` },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Bookings per day" bodyClassName="p-5">
          <StackedColumns dense caption="Bookings made per day" series={["Bookings"]} format={whole}
            columns={dayColumns(b.daily, (d) => d.bookings, (d, v) => plural(v, "booking"))} />
        </Panel>
        <Panel title="Paid online per day" bodyClassName="p-5">
          <StackedColumns dense caption="Money customers paid online per day" series={["Paid"]} format={nairaShort}
            columns={dayColumns(b.daily, (d) => d.paid_kobo, (d, v) => `${naira(v)} paid · ${naira(d.fees_kobo)} your fee`)} />
        </Panel>
      </div>

      <Panel
        title={
          <span className="flex items-center gap-1.5">
            Booking pages
            <InfoTip>Busiest in the last {days} days first. Bookings and money count only those made in that time.</InfoTip>
          </span>
        }
      >
        <Table head={["Page", "Owner", "Plan", "Payments", "Services", "Bookings", "Paid online", "Last booking"]} empty="Nobody has made a booking page yet.">
          {b.page_list.map((p) => (
            <tr key={p.id} className={p.active ? undefined : "opacity-60"}>
              <td className={td}>
                <a className="font-medium text-brand-700 hover:underline" href={bookLink(`/${p.handle}`, siteUrl())} target="_blank" rel="noreferrer">@{p.handle}</a>
                <span className="block text-xs text-slate-500">{p.name}{p.active ? "" : " · paused"}</span>
              </td>
              <td className={td}>{p.owner}<span className="block text-xs text-slate-500">{p.owner_email}</span></td>
              <td className={td}><span className={cn("badge", p.tier === "pro" ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-600")}>{p.tier === "pro" ? "Pro" : "Free"}</span></td>
              <td className={cn(td, p.payouts ? "text-slate-700" : "text-amber-700")}>{p.payouts ? p.bank_name ?? "Bank added" : "No bank yet"}</td>
              <td className={cn(td, "tabular-nums")}>{p.services}</td>
              <td className={cn(td, "tabular-nums")}>{p.bookings_period}</td>
              <td className={cn(td, "tabular-nums")}>{naira(p.paid_period_kobo)}</td>
              <td className={cn(td, "whitespace-nowrap text-slate-600")}>{p.last_booking ? ago(p.last_booking) : `made ${day(p.created_at)}`}</td>
            </tr>
          ))}
        </Table>
      </Panel>
    </>
  );
}
