import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { naira, paymentLabel } from "@/lib/billing";
import { APP_NAME, OPERATOR_NAME, SUPPORT_EMAIL } from "@/lib/config";
import { requireAdmin } from "@/lib/session";
import { formatDate } from "@/lib/utils";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Receipt" };

type Payment = {
  id: string;
  reference: string;
  kind: string;
  plan: string | null;
  seats: number;
  months: number;
  amount_kobo: number;
  status: string;
  period_start: string | null;
  period_end: string | null;
  channel: string | null;
  paid_at: string | null;
  created_at: string;
};

const CHANNEL: Record<string, string> = {
  card: "Card",
  bank: "Bank",
  bank_transfer: "Bank transfer",
  ussd: "USSD",
  mobile_money: "Mobile money",
  qr: "QR",
  manual: "Manual",
};

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, org } = await requireAdmin();
  const { data } = await supabase
    .from("payments")
    .select("id, reference, kind, plan, seats, months, amount_kobo, status, period_start, period_end, channel, paid_at, created_at")
    .eq("id", id)
    .eq("status", "success")
    .maybeSingle();
  if (!data) notFound();
  const p = data as Payment;
  const tz = org.timezone;
  const rows: Array<[string, string]> = [
    ["Receipt number", p.reference],
    ["Date paid", formatDate(p.paid_at ?? p.created_at, tz)],
    ["Billed to", org.name],
    ["Description", paymentLabel(p)],
    ["Service period", p.period_start && p.period_end ? `${formatDate(p.period_start, tz)} – ${formatDate(p.period_end, tz)}` : "–"],
    ["Paid with", p.channel ? (CHANNEL[p.channel] ?? p.channel) + (p.kind === "manual" ? "" : " via Paystack") : "Paystack"],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/dashboard/billing" className="text-sm text-slate-600 hover:text-slate-900">← Plan and billing</Link>
        <PrintButton />
      </div>

      <article className="card mx-auto max-w-2xl p-8 print:max-w-none print:border-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <p className="text-lg font-semibold">{APP_NAME}</p>
            <p className="text-sm text-slate-500">{OPERATOR_NAME} · {SUPPORT_EMAIL}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold">Receipt</p>
            <span className="badge mt-1 bg-emerald-100 text-emerald-700">Paid</span>
          </div>
        </header>

        <dl className="divide-y divide-slate-100 py-2 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[150px_1fr] gap-4 py-3">
              <dt className="text-slate-500">{label}</dt>
              <dd className={label === "Receipt number" ? "font-mono text-xs leading-5" : ""}>{value}</dd>
            </div>
          ))}
        </dl>

        <div className="flex items-center justify-between border-t border-slate-200 pt-5">
          <p className="font-semibold">Total paid</p>
          <p className="text-2xl font-semibold">{naira(p.amount_kobo)}</p>
        </div>

        <p className="mt-8 text-xs text-slate-500">
          Prepaid subscription; it does not renew automatically. No VAT was charged on this payment.
          Questions about this receipt: {SUPPORT_EMAIL}, quoting the receipt number.
        </p>
      </article>
    </div>
  );
}
