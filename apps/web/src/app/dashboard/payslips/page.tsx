import type { Metadata } from "next";
import Link from "next/link";
import { money, monthLabel } from "@/lib/payroll";
import { requireMember } from "@/lib/session";
import { formatDate } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { EmptyState, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Payslips" };

type Row = { id: string; month: string; currency: string; gross_minor: number; net_minor: number; issued_at: string };

export default async function PayslipsPage() {
  const { supabase, user, org } = await requireMember();
  const { data } = await supabase
    .from("payslips")
    .select("id, month, currency, gross_minor, net_minor, issued_at")
    .eq("user_id", user.id)
    .order("month", { ascending: false })
    .limit(120);
  const rows = (data ?? []) as Row[];

  return (
    <div className="space-y-6">
      <PageHeader title="Payslips" />
      <section className="card overflow-hidden">
        {rows.length ? (
          <ul className="divide-y divide-slate-100">
            {rows.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <Icon name="receipt" />
                </span>
                <Link href={`/dashboard/payslips/${p.id}`} className="min-w-0 flex-1">
                  <span className="block font-medium text-slate-900 hover:text-brand-700">{monthLabel(p.month.slice(0, 7))}</span>
                  <span className="block text-xs text-slate-500">Issued {formatDate(p.issued_at, org.timezone)} · gross {money(Number(p.gross_minor), p.currency)}</span>
                </Link>
                <span className="font-display text-lg font-semibold text-slate-900 tabular-nums">{money(Number(p.net_minor), p.currency)}</span>
                <a href={`/dashboard/payslips/${p.id}/pdf`} className="btn-secondary btn-sm" aria-label={`Download ${monthLabel(p.month.slice(0, 7))} payslip as PDF`}>
                  <Icon name="download" className="h-3.5 w-3.5" />
                  PDF
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon="receipt" title="Your payslips will appear here once your company issues them." />
        )}
      </section>
    </div>
  );
}
