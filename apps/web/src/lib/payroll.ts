import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, localDateIn } from "@/lib/time";
import { displayName, loadDayStats, loadPeople } from "@/lib/tracking";
import type { Membership } from "@/lib/types";
import { computePayslip, DEFAULT_PAYROLL_SETTINGS, type Payslip, type PayrollSettings, type SlipLine } from "@/lib/payroll-tax";

export type Pay = {
  user_id: string;
  basis: "hourly" | "monthly";
  amount_minor: number;
  currency: "NGN" | "USD";
  statutory: boolean;
  annual_rent_minor: number;
  annual_reliefs_minor: number;
};

export type IssuedSlip = { id: string; user_id: string; net_minor: number; currency: string; issued_at: string; emailed_at: string | null };

/** What a payslip stores besides its totals (a snapshot: later rate changes don't alter it). */
export type PayslipData = {
  person: { name: string; email: string; job_title: string | null };
  company: string;
  period: { month: string; first: string; last: string };
  work: { basis: "hourly" | "monthly"; rate_minor: number; working_days: number; hours: number; paid_leave_days: number; unpaid_leave_days: number };
  earnings: SlipLine[];
  deductions: SlipLine[];
  employer: SlipLine[];
  tax: Payslip["tax"];
};

export type PayrollRow = {
  userId: string;
  name: string;
  email: string;
  jobTitle: string | null;
  removed: boolean;
  pay: Pay | null;
  workingDays: number;
  hours: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  daysWithoutTime: number;
  expectedHoursPerDay: number;
  amountMinor: number | null; // gross pay for the month; null = no rate set
  slip: Payslip | null; // gross → deductions → net
  issued: IssuedSlip | null; // the payslip already issued for this month, if any
};

export const isMonth = (s: unknown): s is string => typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

export function money(minor: number, currency: string) {
  return new Intl.NumberFormat(currency === "USD" ? "en-US" : "en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(minor / 100);
}

function monthDays(month: string) {
  const first = `${month}-01`;
  const days: string[] = [];
  for (let d = first; d.startsWith(month); d = addDays(d, 1)) days.push(d);
  return days;
}

export const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

export async function loadPayrollSettings(supabase: SupabaseClient): Promise<PayrollSettings> {
  const { data } = await supabase
    .from("payroll_settings")
    .select("statutory, pension_employee_pct, pension_employer_pct, nhf, nhf_pct, basic_pct, housing_pct, transport_pct")
    .maybeSingle();
  if (!data) return DEFAULT_PAYROLL_SETTINGS;
  const d = data as Record<string, unknown>;
  return {
    statutory: Boolean(d.statutory),
    nhf: Boolean(d.nhf),
    pension_employee_pct: Number(d.pension_employee_pct),
    pension_employer_pct: Number(d.pension_employer_pct),
    nhf_pct: Number(d.nhf_pct),
    basic_pct: Number(d.basic_pct),
    housing_pct: Number(d.housing_pct),
    transport_pct: Number(d.transport_pct),
  };
}

const weekday = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d !== 0 && d !== 6;
};

/**
 * One month of pay for everyone in the company (owner/admin only).
 * Hourly: (hours worked + paid leave days × expected hours a day) × rate.
 * Monthly: the salary, minus unpaid leave days as a share of the month's working days.
 * Working days = weekdays minus company holidays. Each person's days follow their own time zone.
 * Then Nigerian deductions (lib/payroll-tax.ts) turn gross pay into net pay for naira pay.
 */
export async function buildPayroll(supabase: SupabaseClient, me: Membership, month: string) {
  const days = monthDays(month);
  const first = days[0];
  const last = days[days.length - 1];
  const today = localDateIn(me.timezone);

  const [{ members, profiles }, stats, { data: holidayRows }, { data: leaveRows }, { data: typeRows }, { data: payRows }, settings, { data: slipRows }] = await Promise.all([
    loadPeople(supabase, { includeRemoved: true }),
    loadDayStats(supabase, first, last),
    supabase.from("holidays").select("day").gte("day", first).lte("day", last),
    supabase.from("leave_requests").select("user_id, start_date, end_date, leave_type_id").eq("status", "approved").lte("start_date", last).gte("end_date", first),
    supabase.from("leave_types").select("id, paid"),
    supabase.from("member_pay").select("user_id, basis, amount_minor, currency, statutory, annual_rent_minor, annual_reliefs_minor"),
    loadPayrollSettings(supabase),
    supabase.from("payslips").select("id, user_id, net_minor, currency, issued_at, emailed_at").eq("month", first),
  ]);
  const issued = new Map(((slipRows ?? []) as IssuedSlip[]).map((s) => [s.user_id, { ...s, net_minor: Number(s.net_minor) }]));
  const holidays = new Set(((holidayRows ?? []) as Array<{ day: string }>).map((h) => h.day));
  const paidType = new Map(((typeRows ?? []) as Array<{ id: string; paid: boolean }>).map((t) => [t.id, t.paid]));
  const leave = (leaveRows ?? []) as Array<{ user_id: string; start_date: string; end_date: string; leave_type_id: string }>;
  const pay = new Map(
    ((payRows ?? []) as Pay[]).map((p) => [
      p.user_id,
      { ...p, amount_minor: Number(p.amount_minor), annual_rent_minor: Number(p.annual_rent_minor), annual_reliefs_minor: Number(p.annual_reliefs_minor) },
    ]),
  );
  const workDays = days.filter((d) => weekday(d) && !holidays.has(d));

  const rows: PayrollRow[] = members
    .map((m) => {
      const p = profiles.get(m.user_id);
      const joined = m.joined_at.slice(0, 10);
      let seconds = 0;
      let paidLeave = 0;
      let unpaidLeave = 0;
      let noTime = 0;
      for (const d of days) seconds += stats.get(`${m.user_id}|${d}`)?.tracked_seconds ?? 0;
      for (const d of workDays) {
        const l = leave.find((x) => x.user_id === m.user_id && x.start_date <= d && x.end_date >= d);
        if (l) {
          if (paidType.get(l.leave_type_id) === false) unpaidLeave++;
          else paidLeave++;
        } else if (d >= joined && d < today && !(stats.get(`${m.user_id}|${d}`)?.tracked_seconds)) {
          noTime++;
        }
      }
      const rate = pay.get(m.user_id) ?? null;
      const hours = seconds / 3600;
      const expected = Number(m.expected_hours_per_day) || 8;
      let amountMinor: number | null = null;
      if (rate) {
        amountMinor =
          rate.basis === "hourly"
            ? Math.round((hours + paidLeave * expected) * rate.amount_minor)
            : Math.max(0, Math.round(rate.amount_minor - (workDays.length ? (rate.amount_minor * unpaidLeave) / workDays.length : 0)));
      }
      const slip =
        rate && amountMinor !== null
          ? computePayslip({
              grossMinor: amountMinor,
              currency: rate.currency,
              settings,
              person: rate,
              payLabel: rate.basis === "hourly" ? `Pay for ${(hours + paidLeave * expected).toFixed(1)} hours` : "Salary",
            })
          : null;
      return {
        userId: m.user_id,
        name: displayName(p),
        email: p?.email ?? "",
        jobTitle: m.job_title,
        removed: m.status === "removed",
        pay: rate,
        workingDays: workDays.length,
        hours,
        paidLeaveDays: paidLeave,
        unpaidLeaveDays: unpaidLeave,
        daysWithoutTime: noTime,
        expectedHoursPerDay: expected,
        amountMinor,
        slip,
        issued: issued.get(m.user_id) ?? null,
      };
    })
    .filter((r) => !r.removed || r.hours > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  // Totals per currency: gross, net, and what goes to the tax office and pension funds.
  const totals = new Map<string, { gross: number; net: number; paye: number; pension: number; nhf: number }>();
  for (const r of rows) {
    if (!r.slip) continue;
    const t = totals.get(r.slip.currency) ?? { gross: 0, net: 0, paye: 0, pension: 0, nhf: 0 };
    t.gross += r.slip.gross_minor;
    t.net += r.slip.net_minor;
    for (const d of r.slip.deductions) {
      if (d.label === "PAYE tax") t.paye += d.amount_minor;
      else if (d.label.startsWith("Pension")) t.pension += d.amount_minor;
      else if (d.label.startsWith("National Housing Fund")) t.nhf += d.amount_minor;
    }
    t.pension += r.slip.employer_pension_minor;
    totals.set(r.slip.currency, t);
  }

  return { month, first, last, workingDays: workDays.length, rows, totals, settings };
}

/** The stored snapshot for one person's payslip. */
export function payslipData(r: PayrollRow, period: { month: string; first: string; last: string }, company: string): PayslipData | null {
  if (!r.slip || !r.pay) return null;
  return {
    person: { name: r.name, email: r.email, job_title: r.jobTitle },
    company,
    period,
    work: {
      basis: r.pay.basis,
      rate_minor: r.pay.amount_minor,
      working_days: r.workingDays,
      hours: Math.round(r.hours * 100) / 100,
      paid_leave_days: r.paidLeaveDays,
      unpaid_leave_days: r.unpaidLeaveDays,
    },
    earnings: r.slip.earnings,
    deductions: r.slip.deductions,
    employer: r.slip.employer,
    tax: r.slip.tax,
  };
}
