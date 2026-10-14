import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { monthLabel, type PayslipData } from "@/lib/payroll";
import { requireMember } from "@/lib/session";
import { isAdminRole } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { PayslipView } from "@/components/payslip-view";
import { PageHeader } from "@/components/ui";
import { PrintButton } from "@/components/print-button";

export const metadata: Metadata = { title: "Payslip" };

type Slip = {
  id: string;
  user_id: string;
  month: string;
  currency: string;
  gross_minor: number;
  deductions_minor: number;
  net_minor: number;
  issued_at: string;
  data: PayslipData;
};

const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function PayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, user, member, org } = await requireMember();
  const { data } = await supabase
    .from("payslips")
    .select("id, user_id, month, currency, gross_minor, deductions_minor, net_minor, issued_at, data")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const p = data as Slip;
  const d = p.data;
  const label = monthLabel(p.month.slice(0, 7));
  const mine = p.user_id === user.id;
  const back = mine || !isAdminRole(member.role)
    ? { href: "/dashboard/payslips", label: "Payslips" }
    : { href: `/dashboard/payroll?month=${p.month.slice(0, 7)}`, label: "Payroll" };

  const facts: Array<[string, string]> = [
    ["Employee", d.person.name],
    ["Job title", d.person.job_title || "–"],
    ["Pay period", `${day(d.period.first)} – ${day(d.period.last)}`],
    ["Hours tracked", `${d.work.hours.toFixed(1)} h in ${d.work.working_days} working days`],
    ["Leave", d.work.paid_leave_days || d.work.unpaid_leave_days ? `${d.work.paid_leave_days} paid · ${d.work.unpaid_leave_days} unpaid` : "None"],
    ["Issued", formatDate(p.issued_at, org.timezone)],
  ];

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <PageHeader
          back={back}
          title={`${label} payslip`}
          meta={mine ? undefined : d.person.name}
          actions={
            <>
              <PrintButton className="btn-secondary" />
              <a className="btn-primary" href={`/dashboard/payslips/${p.id}/pdf`}>
                <Icon name="download" className="h-4 w-4" />
                Download PDF
              </a>
            </>
          }
        />
      </div>

      <article className="card mx-auto max-w-3xl overflow-hidden print:max-w-none print:border-0">
        <div className="h-1.5 bg-brand-600" />
        <div className="space-y-8 p-6 sm:p-8">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-display text-xl font-semibold text-slate-900">{d.company}</p>
              <p className="text-sm text-slate-500">Payslip</p>
            </div>
            <p className="font-display text-xl font-semibold text-slate-900">{label}</p>
          </header>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl bg-slate-50 p-5 text-sm sm:grid-cols-3">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-slate-500">{k}</dt>
                <dd className="mt-0.5 font-medium text-slate-900">{v}</dd>
              </div>
            ))}
          </dl>

          <PayslipView
            slip={{ ...p, gross_minor: Number(p.gross_minor), deductions_minor: Number(p.deductions_minor), net_minor: Number(p.net_minor), earnings: d.earnings, deductions: d.deductions, employer: d.employer, tax: d.tax }}
          />
        </div>
      </article>
    </div>
  );
}
