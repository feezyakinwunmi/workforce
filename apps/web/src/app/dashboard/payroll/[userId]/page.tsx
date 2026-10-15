import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildPayroll, isMonth, monthLabel } from "@/lib/payroll";
import { requireAdmin } from "@/lib/session";
import { localDateIn } from "@/lib/time";
import { Icon } from "@/components/icons";
import { PayslipView } from "@/components/payslip-view";
import { Avatar, EmptyState, PageHeader, Panel } from "@/components/ui";
import { PersonForm } from "../forms";

export const metadata: Metadata = { title: "Pay details" };

export default async function PersonPayPage({ params, searchParams }: { params: Promise<{ userId: string }>; searchParams: Promise<{ month?: string }> }) {
  const [{ userId }, { month: m }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(userId)) notFound();
  const { supabase, member: me } = await requireAdmin();
  const thisMonth = localDateIn(me.timezone).slice(0, 7);
  const month = isMonth(m) && m <= thisMonth ? m : thisMonth;
  const { rows } = await buildPayroll(supabase, me, month);
  const r = rows.find((x) => x.userId === userId);
  if (!r) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: `/dashboard/payroll?month=${month}`, label: "Payroll" }}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={r.name} email={r.email} size="lg" />
            {r.name}
          </span>
        }
        meta={r.jobTitle || r.email}
        actions={
          r.issued ? (
            <Link href={`/dashboard/payslips/${r.issued.id}`} className="btn-secondary">
              <Icon name="receipt" className="h-4 w-4" />
              {monthLabel(month).split(" ")[0]} payslip
            </Link>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Panel title="Pay and tax details" bodyClassName="p-5" className="self-start">
          <PersonForm userId={r.userId} pay={r.pay} />
        </Panel>

        <div className="space-y-6">
          <Panel
            title={monthLabel(month)}
            actions={
              <span className="text-xs text-slate-500">
                {r.hours.toFixed(1)} h · {r.paidLeaveDays + r.unpaidLeaveDays} leave {r.paidLeaveDays + r.unpaidLeaveDays === 1 ? "day" : "days"}
                {r.unpaidLeaveDays > 0 && ` (${r.unpaidLeaveDays} unpaid)`}
              </span>
            }
          >
            {r.slip ? (
              <PayslipView slip={r.slip} className="p-5" />
            ) : (
              <EmptyState icon="wallet" title="Set a pay rate to see the breakdown." />
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
