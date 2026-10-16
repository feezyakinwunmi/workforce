import Link from "next/link";
import { StackedColumns } from "@/components/charts";
import { Icon } from "@/components/icons";
import { Notice, PageHeader, Panel, StatStrip } from "@/components/ui";
import { naira } from "@/lib/billing";
import { requireAdmin } from "@/lib/admin/server";
import { PRODUCTS, productLabel, when, type MoneyReport } from "@/lib/admin/types";
import { cn } from "@/lib/utils";
import { nairaShort, sum, Table, td } from "../_parts";

export const metadata = { title: "Money" };
export const dynamic = "force-dynamic";

const FILTERS = [
  ["", "All products"],
  ["workbase", "Workbase"],
  ["meet", "Meet"],
  ["book", "Book"],
] as const;
const STATUSES = [
  ["", "Any status"],
  ["success", "Paid"],
  ["failed", "Failed"],
  ["pending", "Started, not paid"],
] as const;

const monthLabel = (m: string) => new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${m}-15T12:00:00Z`));

export default async function MoneyTab({ searchParams }: { searchParams: Promise<{ product?: string; status?: string }> }) {
  const { db, base } = await requireAdmin();
  const sp = await searchParams;
  const product = FILTERS.some(([k]) => k === sp.product) ? sp.product! : "";
  const status = STATUSES.some(([k]) => k === sp.status) ? sp.status! : "";
  const { data, error } = await db.rpc("admin_money", { p_months: 12, p_product: product, p_status: status });
  if (error || !data) return <Notice tone="error">Couldn&apos;t load money: {error?.message ?? "no data"}. Has migration 0039 been run?</Notice>;
  const m = data as MoneyReport;
  const months = [...m.months].reverse();
  const thisMonth = sum(m.months.at(-1)?.by_product);
  const lastMonth = sum(m.months.at(-2)?.by_product);
  const year = m.months.reduce((a, x) => a + sum(x.by_product), 0);
  const failed = m.payments.filter((p) => p.status === "failed").length;
  const used = PRODUCTS.filter((p) => m.months.some((x) => x.by_product[p]));
  const link = (k: string, v: string) => {
    const q = new URLSearchParams({ ...(product ? { product } : {}), ...(status ? { status } : {}), [k]: v });
    if (!v) q.delete(k);
    const s = q.toString();
    return `${base}/money${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader title="Money" meta="Everything paid to Phantomire through Paystack, by product. Paystack's own fees are not taken off." />

      <StatStrip
        stats={[
          { label: "This month", value: naira(thisMonth), icon: "wallet", tone: "amber", hint: lastMonth ? `${naira(lastMonth)} last month` : undefined },
          { label: "Last 12 months", value: naira(year), icon: "chart", tone: "amber" },
          { label: "Failed payments", value: failed, icon: "alert", tone: failed ? "amber" : "slate", hint: "in the list below" },
        ]}
      />

      <Panel title="Money in per month" bodyClassName="p-5">
        <StackedColumns
          caption="Money in per month, all products"
          series={["Money in"]}
          format={nairaShort}
          columns={m.months.map((x, i) => ({
            key: x.month,
            label: monthLabel(x.month),
            values: [sum(x.by_product)],
            tooltip: `${monthLabel(x.month)}\n${Object.entries(x.by_product).map(([p, k]) => `${productLabel(p)}: ${naira(k)}`).join("\n") || "Nothing"}`,
            highlight: i === m.months.length - 1,
          }))}
        />
      </Panel>

      <Panel title="By product">
        <Table head={["Month", ...used.map(productLabel), "Total"]}>
          {months.map((x) => (
            <tr key={x.month}>
              <td className={cn(td, "whitespace-nowrap text-slate-600")}>{monthLabel(x.month)}</td>
              {used.map((p) => (
                <td key={p} className={cn(td, "tabular-nums", x.by_product[p] ? "text-slate-800" : "text-slate-300")}>{x.by_product[p] ? naira(x.by_product[p]) : "—"}</td>
              ))}
              <td className={cn(td, "font-medium tabular-nums text-slate-900")}>{naira(sum(x.by_product))}</td>
            </tr>
          ))}
        </Table>
      </Panel>

      <Panel
        title="Payments"
        actions={
          <div className="flex flex-wrap gap-1 text-xs">
            {FILTERS.map(([k, label]) => (
              <Link key={k} href={link("product", k)} className={cn("rounded-full px-2.5 py-1", product === k ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:text-slate-900")}>{label}</Link>
            ))}
            <span className="mx-1 w-px bg-slate-200" aria-hidden />
            {STATUSES.map(([k, label]) => (
              <Link key={k} href={link("status", k)} className={cn("rounded-full px-2.5 py-1", status === k ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:text-slate-900")}>{label}</Link>
            ))}
          </div>
        }
      >
        <Table head={["When", "Who", "What", "Status", "Amount"]} empty="No payments match.">
          {m.payments.map((p, i) => (
            <tr key={`${p.reference}-${i}`}>
              <td className={cn(td, "whitespace-nowrap text-slate-600")}>{when(p.at)}</td>
              <td className={td}>
                {p.organization_id ? <Link className="text-brand-700 hover:underline" href={`${base}/companies/${p.organization_id}`}>{p.who}</Link> : p.who ?? "—"}
              </td>
              <td className={td}>
                {productLabel(p.product)}
                <span className="block text-xs text-slate-500">{p.detail}{p.reference ? <> · <span className="font-mono">{p.reference}</span></> : null}</span>
              </td>
              <td className={td}>
                <span className={cn("badge", p.status === "success" ? "bg-emerald-50 text-emerald-700" : p.status === "failed" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600")}>
                  {p.status === "success" ? "Paid" : p.status === "failed" ? "Failed" : "Started"}
                </span>
                {p.failure_reason && <span className="block text-xs text-slate-500">{p.failure_reason}</span>}
              </td>
              <td className={cn(td, "text-right tabular-nums", p.status === "success" ? "text-slate-900" : "text-slate-400")}>{naira(p.amount_kobo)}</td>
            </tr>
          ))}
        </Table>
        <p className="flex items-center gap-1.5 border-t border-slate-200 px-5 py-3 text-xs text-slate-500">
          <Icon name="info" className="h-3.5 w-3.5" />
          Latest 300. Refunds made in Paystack aren&apos;t shown here.
        </p>
      </Panel>
    </>
  );
}
