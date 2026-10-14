import type { SlipLine, TaxWorking } from "@/lib/payroll-tax";
import { money } from "@/lib/payroll";
import { cn } from "@/lib/utils";

type Slip = {
  currency: string;
  earnings: SlipLine[];
  deductions: SlipLine[];
  employer: SlipLine[];
  tax: TaxWorking | null;
  gross_minor: number;
  deductions_minor: number;
  net_minor: number;
};

function Lines({ title, lines, total, totalLabel, currency }: { title: string; lines: SlipLine[]; total: number; totalLabel: string; currency: string }) {
  return (
    <div>
      <h3 className="border-b border-slate-900 pb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:border-slate-400">{title}</h3>
      <dl className="divide-y divide-slate-100 text-sm">
        {lines.map((l) => (
          <div key={l.label} className="flex items-start justify-between gap-4 py-2.5">
            <dt>
              {l.label}
              {l.note && <span className="block text-xs text-slate-500">{l.note}</span>}
            </dt>
            <dd className="tabular-nums">{money(l.amount_minor, currency)}</dd>
          </div>
        ))}
        {!lines.length && <p className="py-2.5 text-slate-400">None</p>}
        <div className="flex items-center justify-between gap-4 py-2.5 font-semibold text-slate-900">
          <dt>{totalLabel}</dt>
          <dd className="tabular-nums">{money(total, currency)}</dd>
        </div>
      </dl>
    </div>
  );
}

/** Earnings, deductions, net pay and how PAYE was worked out. */
export function PayslipView({ slip, showTax = true, className }: { slip: Slip; showTax?: boolean; className?: string }) {
  const c = slip.currency;
  const t = slip.tax;
  return (
    <div className={cn("space-y-6", className)}>
      <div className="grid gap-6 sm:grid-cols-2">
        <Lines title="Earnings" lines={slip.earnings} total={slip.gross_minor} totalLabel="Total earnings" currency={c} />
        <Lines title="Deductions" lines={slip.deductions} total={slip.deductions_minor} totalLabel="Total deductions" currency={c} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-brand-600 px-5 py-4 text-white print:border print:border-slate-300">
        <span>
          <span className="block text-xs font-semibold tracking-wide text-brand-200 uppercase dark:text-[#d3c9ff]">Net pay</span>
          <span className="text-sm text-white/80">Paid to the person this month</span>
        </span>
        <span className="font-display text-3xl font-semibold tracking-tight tabular-nums">{money(slip.net_minor, c)}</span>
      </div>

      {slip.employer.length > 0 && (
        <p className="text-xs text-slate-500">
          {slip.employer.map((e) => `${e.label}: ${money(e.amount_minor, c)}`).join(" · ")} — paid by the company on top of pay.
        </p>
      )}

      {showTax && t && (
        <div>
          <h3 className="border-b border-slate-900 pb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:border-slate-400">How PAYE was worked out</h3>
          {t.exempt ? (
            <p className="py-3 text-sm text-slate-600">Monthly pay is at or below the national minimum wage (₦70,000), so no PAYE is due.</p>
          ) : (
            <dl className="text-sm">
              <Row label="Yearly gross pay (this month × 12)" value={money(t.annual_gross_minor, c)} />
              {t.reliefs.map((r) => (
                <Row key={r.label} label={`Less ${r.label}`} value={`– ${money(r.amount_minor, c)}`} muted />
              ))}
              <Row label="Chargeable income" value={money(t.chargeable_minor, c)} strong />
              {t.bands.map((b) => (
                <Row key={b.label} label={`${b.label} at ${Math.round(b.rate * 100)}%`} value={money(b.tax_minor, c)} muted />
              ))}
              <Row label="Yearly tax" value={money(t.annual_tax_minor, c)} strong />
              <Row label="PAYE this month (yearly tax ÷ 12)" value={money(Math.round(t.annual_tax_minor / 12), c)} strong />
            </dl>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-4 py-1.5", muted && "pl-3 text-slate-500", strong && "font-semibold text-slate-900")}>
      <dt>{label}</dt>
      <dd className="whitespace-nowrap tabular-nums">{value}</dd>
    </div>
  );
}
