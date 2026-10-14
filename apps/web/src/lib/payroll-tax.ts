/**
 * Nigerian statutory deductions for one month of pay (pure functions; all amounts in kobo).
 *
 * Rules from 1 January 2026 (Nigeria Tax Act 2025):
 * - PAYE on yearly chargeable income: first ₦800,000 at 0%, next ₦2.2m at 15%, next ₦9m at 18%,
 *   next ₦13m at 21%, next ₦25m at 23%, above ₦50m at 25%.
 * - The consolidated relief allowance (CRA) is gone. Reliefs: the employee's pension and NHF,
 *   rent relief (20% of yearly rent, at most ₦500,000) and other declared reliefs
 *   (health and life insurance premiums, mortgage interest).
 * - Pay at or below the national minimum wage (₦70,000 a month) is not taxed.
 * - Pension (Pension Reform Act 2014): employee 8%, employer 10% of basic + housing + transport.
 * - NHF: 2.5% of basic; voluntary for private companies, so it is off unless the company turns it on.
 *
 * Monthly PAYE = tax on (this month's figures × 12) ÷ 12. If pay changes from month to month
 * (hourly staff) each month is annualised on its own; a year-end adjustment is up to the company.
 */

export type PayrollSettings = {
  statutory: boolean;
  pension_employee_pct: number;
  pension_employer_pct: number;
  nhf: boolean;
  nhf_pct: number;
  basic_pct: number;
  housing_pct: number;
  transport_pct: number;
};

export const DEFAULT_PAYROLL_SETTINGS: PayrollSettings = {
  statutory: true,
  pension_employee_pct: 8,
  pension_employer_pct: 10,
  nhf: false,
  nhf_pct: 2.5,
  basic_pct: 50,
  housing_pct: 25,
  transport_pct: 15,
};

export type PersonTax = { statutory: boolean; annual_rent_minor: number; annual_reliefs_minor: number };

export type SlipLine = { label: string; amount_minor: number; note?: string };

export type TaxWorking = {
  exempt: boolean; // at or below the minimum wage
  annual_gross_minor: number;
  reliefs: SlipLine[];
  chargeable_minor: number;
  annual_tax_minor: number;
  bands: Array<{ label: string; taxed_minor: number; rate: number; tax_minor: number }>;
};

export type Payslip = {
  currency: "NGN" | "USD";
  earnings: SlipLine[];
  deductions: SlipLine[];
  employer: SlipLine[]; // paid by the company on top of pay (not deducted)
  tax: TaxWorking | null;
  gross_minor: number;
  deductions_minor: number;
  net_minor: number;
  employer_pension_minor: number;
};

const NAIRA = 100; // kobo per naira
export const MIN_WAGE_MONTHLY_MINOR = 70_000 * NAIRA;
export const RENT_RELIEF_RATE = 0.2;
export const RENT_RELIEF_CAP_MINOR = 500_000 * NAIRA;

/** Yearly bands: [width of the band, rate]. The last band has no upper limit. */
export const PAYE_BANDS: Array<[number, number]> = [
  [800_000 * NAIRA, 0],
  [2_200_000 * NAIRA, 0.15],
  [9_000_000 * NAIRA, 0.18],
  [13_000_000 * NAIRA, 0.21],
  [25_000_000 * NAIRA, 0.23],
  [Infinity, 0.25],
];

const short = (minor: number) => {
  const n = minor / NAIRA;
  return n >= 1_000_000 ? `₦${n / 1_000_000}m` : `₦${n.toLocaleString("en-NG")}`;
};

/** Tax on a year's chargeable income, band by band. */
export function annualPaye(chargeableMinor: number) {
  let left = Math.max(0, chargeableMinor);
  let tax = 0;
  let start = 0;
  const bands: TaxWorking["bands"] = [];
  for (const [width, rate] of PAYE_BANDS) {
    if (left <= 0) break;
    const taxed = Math.min(left, width);
    const t = taxed * rate;
    bands.push({
      label: width === Infinity ? `Above ${short(start)}` : start === 0 ? `First ${short(width)}` : `Next ${short(width)}`,
      taxed_minor: taxed,
      rate,
      tax_minor: Math.round(t),
    });
    tax += t;
    left -= taxed;
    start += width;
  }
  return { tax_minor: Math.round(tax), bands };
}

const pct = (amount: number, p: number) => Math.round((amount * p) / 100);

/**
 * Turn one month's gross pay into a payslip. `extras` are untaxed additions such as approved
 * expense refunds; they are paid with the salary but are not part of gross pay for tax or pension.
 */
export function computePayslip(input: {
  grossMinor: number;
  currency: "NGN" | "USD";
  settings: PayrollSettings;
  person: PersonTax | null;
  payLabel: string; // e.g. "Salary" or "Pay for 152.5 hours"
  extras?: SlipLine[];
}): Payslip {
  const { currency, settings, person } = input;
  const gross = Math.max(0, Math.round(input.grossMinor));
  const extras = (input.extras ?? []).filter((e) => e.amount_minor > 0);
  const statutory = currency === "NGN" && settings.statutory && (person?.statutory ?? true);

  if (!statutory) {
    const earnings: SlipLine[] = [{ label: input.payLabel, amount_minor: gross }, ...extras];
    const total = earnings.reduce((s, l) => s + l.amount_minor, 0);
    return {
      currency,
      earnings,
      deductions: [],
      employer: [],
      tax: null,
      gross_minor: total,
      deductions_minor: 0,
      net_minor: total,
      employer_pension_minor: 0,
    };
  }

  // Split gross into basic, housing, transport and the rest.
  const basic = pct(gross, settings.basic_pct);
  const housing = pct(gross, settings.housing_pct);
  const transport = pct(gross, settings.transport_pct);
  const other = gross - basic - housing - transport;
  const earnings: SlipLine[] = [
    { label: "Basic salary", amount_minor: basic },
    { label: "Housing allowance", amount_minor: housing },
    { label: "Transport allowance", amount_minor: transport },
    ...(other > 0 ? [{ label: "Other allowances", amount_minor: other }] : []),
  ].filter((l) => l.amount_minor > 0);
  if (input.payLabel !== "Salary") earnings[0] = { ...earnings[0], note: input.payLabel };

  const pensionBase = basic + housing + transport;
  const pension = pct(pensionBase, settings.pension_employee_pct);
  const employerPension = pct(pensionBase, settings.pension_employer_pct);
  const nhf = settings.nhf ? pct(basic, settings.nhf_pct) : 0;

  const annualGross = gross * 12;
  const exempt = gross <= MIN_WAGE_MONTHLY_MINOR;
  const rentRelief = Math.min(Math.round((person?.annual_rent_minor ?? 0) * RENT_RELIEF_RATE), RENT_RELIEF_CAP_MINOR);
  const reliefs: SlipLine[] = [
    { label: `Pension (${settings.pension_employee_pct}%)`, amount_minor: pension * 12 },
    ...(nhf ? [{ label: `NHF (${settings.nhf_pct}%)`, amount_minor: nhf * 12 }] : []),
    ...(rentRelief ? [{ label: "Rent relief (20% of rent, max ₦500,000)", amount_minor: rentRelief }] : []),
    ...(person?.annual_reliefs_minor ? [{ label: "Other reliefs", amount_minor: person.annual_reliefs_minor }] : []),
  ];
  const chargeable = Math.max(0, annualGross - reliefs.reduce((s, r) => s + r.amount_minor, 0));
  const { tax_minor: annualTax, bands } = exempt ? { tax_minor: 0, bands: [] } : annualPaye(chargeable);
  const paye = Math.round(annualTax / 12);

  const deductions: SlipLine[] = [
    { label: "PAYE tax", amount_minor: paye, note: exempt ? "Minimum wage: not taxed" : undefined },
    { label: `Pension (${settings.pension_employee_pct}%)`, amount_minor: pension },
    ...(nhf ? [{ label: `National Housing Fund (${settings.nhf_pct}%)`, amount_minor: nhf }] : []),
  ];
  const totalDeductions = paye + pension + nhf;
  const allEarnings = [...earnings, ...extras];
  const grossTotal = gross + extras.reduce((s, l) => s + l.amount_minor, 0);

  return {
    currency,
    earnings: allEarnings,
    deductions,
    employer: employerPension ? [{ label: `Employer pension (${settings.pension_employer_pct}%)`, amount_minor: employerPension }] : [],
    tax: { exempt, annual_gross_minor: annualGross, reliefs, chargeable_minor: chargeable, annual_tax_minor: annualTax, bands },
    gross_minor: grossTotal,
    deductions_minor: totalDeductions,
    net_minor: grossTotal - totalDeductions,
    employer_pension_minor: employerPension,
  };
}
