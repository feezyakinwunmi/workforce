"use server";

import { revalidatePath } from "next/cache";
import { hasStandard } from "@/lib/billing";
import { APP_NAME } from "@/lib/config";
import { getBilling } from "@/lib/billing-server";
import { emailEnabled, sendEmail } from "@/lib/email";
import { buildPayroll, isMonth, monthLabel, payslipData, type PayslipData } from "@/lib/payroll";
import { renderPayslipPdf } from "@/lib/payslip-pdf";
import { requireAdmin } from "@/lib/session";
import type { FormState } from "@/lib/types";
import { localDateIn } from "@/lib/time";

const naira = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(/[,\s₦$]/g, "") || 0);
  return Number.isFinite(n) ? n : NaN;
};

/** One person's pay rate and tax details (owner/admin). */
export async function savePerson(_: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const userId = String(formData.get("user_id") ?? "");
  const basis = formData.get("basis") === "hourly" ? "hourly" : "monthly";
  const currency = formData.get("currency") === "USD" ? "USD" : "NGN";
  const amount = naira(formData.get("amount"));
  const rent = naira(formData.get("annual_rent"));
  const reliefs = naira(formData.get("annual_reliefs"));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) return { error: "Enter the pay as a number, e.g. 250000." };
  if (!Number.isFinite(rent) || rent < 0 || rent > 1_000_000_000) return { error: "Enter the yearly rent as a number, or leave it empty." };
  if (!Number.isFinite(reliefs) || reliefs < 0 || reliefs > 1_000_000_000) return { error: "Enter other reliefs as a number, or leave it empty." };

  const row = {
    basis,
    currency,
    amount_minor: Math.round(amount * 100),
    statutory: formData.get("statutory") === "on",
    annual_rent_minor: Math.round(rent * 100),
    annual_reliefs_minor: Math.round(reliefs * 100),
  };
  const { data: existing } = await supabase.from("member_pay").select("user_id").eq("user_id", userId).maybeSingle();
  const { data, error } = existing
    ? await supabase.from("member_pay").update(row).eq("user_id", userId).select("user_id")
    : await supabase.from("member_pay").insert({ user_id: userId, ...row }).select("user_id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "You can't change this person's pay." };
  revalidatePath("/dashboard/payroll", "layout");
  return { success: "Saved." };
}

const pctField = (formData: FormData, name: string, max: number) => {
  const n = Number(String(formData.get(name) ?? "").trim());
  return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) / 100 : NaN;
};

/** Company payroll rules: deductions on/off, rates and how pay splits (owner/admin). */
export async function savePayrollSettings(_: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const row = {
    statutory: formData.get("statutory") === "on",
    nhf: formData.get("nhf") === "on",
    pension_employee_pct: pctField(formData, "pension_employee_pct", 30),
    pension_employer_pct: pctField(formData, "pension_employer_pct", 30),
    nhf_pct: pctField(formData, "nhf_pct", 10),
    basic_pct: pctField(formData, "basic_pct", 100),
    housing_pct: pctField(formData, "housing_pct", 99),
    transport_pct: pctField(formData, "transport_pct", 99),
  };
  if (Object.values(row).some((v) => typeof v === "number" && Number.isNaN(v))) return { error: "Check the percentages." };
  if (row.basic_pct < 1) return { error: "Basic salary must be at least 1% of pay." };
  if (row.basic_pct + row.housing_pct + row.transport_pct > 100) {
    return { error: "Basic, housing and transport together can't be more than 100% of pay." };
  }
  const { data: existing } = await supabase.from("payroll_settings").select("organization_id").maybeSingle();
  const { data, error } = existing
    ? await supabase.from("payroll_settings").update(row).not("organization_id", "is", null).select("organization_id")
    : await supabase.from("payroll_settings").insert(row).select("organization_id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Only the owner and admins can change payroll settings." };
  revalidatePath("/dashboard/payroll", "layout");
  return { success: "Saved." };
}

/**
 * Issue (or re-issue) the month's payslips for everyone with a pay rate, and optionally email
 * each person their PDF. Re-issuing replaces the earlier payslip and tells the person.
 */
export async function issuePayslips(_: FormState, formData: FormData): Promise<FormState> {
  const { supabase, member: me, org } = await requireAdmin();
  if (!hasStandard(await getBilling())) return { error: "Payslips are part of the Standard plan." };
  const month = String(formData.get("month") ?? "");
  if (!isMonth(month)) return { error: "Pick a month." };
  if (month > localDateIn(me.timezone).slice(0, 7)) return { error: "You can't issue payslips for a future month." };
  const wantEmail = formData.get("email") === "on";

  const payroll = await buildPayroll(supabase, me, month);
  const period = { month, first: payroll.first, last: payroll.last };
  const ready = payroll.rows.filter((r) => r.slip && r.pay);
  if (!ready.length) return { error: "Set at least one person's pay rate first." };

  const { data: existingRows } = await supabase.from("payslips").select("id, user_id").eq("month", payroll.first);
  const existing = new Map(((existingRows ?? []) as Array<{ id: string; user_id: string }>).map((e) => [e.user_id, e.id]));

  let issued = 0;
  const failed: string[] = [];
  for (const r of ready) {
    const slip = r.slip!;
    const values = {
      currency: slip.currency,
      gross_minor: slip.gross_minor,
      deductions_minor: slip.deductions_minor,
      net_minor: slip.net_minor,
      employer_pension_minor: slip.employer_pension_minor,
      data: payslipData(r, period, org.name),
    };
    let id = existing.get(r.userId);
    let error;
    if (id) {
      ({ error } = await supabase.from("payslips").update(values).eq("id", id));
    } else {
      const res = await supabase.from("payslips").insert({ user_id: r.userId, month: payroll.first, ...values }).select("id").single();
      error = res.error;
      id = (res.data as { id: string } | null)?.id;
    }
    if (error || !id) {
      failed.push(r.name);
      continue;
    }
    issued++;
    // Mark the claims on this payslip as paid (and release any that were dropped from it).
    const { error: payErr } = await supabase.rpc("pay_expenses", { p_payslip: id, p_claim_ids: r.expenseIds });
    if (payErr) console.error("Expense claims not marked paid:", payErr.message);
  }

  let emailed = 0;
  if (wantEmail && emailEnabled()) {
    const { data: slips } = await supabase
      .from("payslips")
      .select("id, user_id, month, currency, gross_minor, deductions_minor, net_minor, employer_pension_minor, issued_at, emailed_at, data")
      .eq("month", payroll.first)
      .is("emailed_at", null);
    const todo = (slips ?? []) as Array<{
      id: string; user_id: string; month: string; currency: string; gross_minor: number; deductions_minor: number; net_minor: number;
      employer_pension_minor: number; issued_at: string; data: PayslipData;
    }>;
    const label = monthLabel(month);
    // People who turned payslip emails off still get the payslip in the dashboard.
    const { data: prefs } = await supabase.from("profiles").select("id, email_opt_out").in("id", todo.map((s) => s.user_id));
    const optedOut = new Set(((prefs ?? []) as Array<{ id: string; email_opt_out: string[] | null }>).filter((p) => (p.email_opt_out ?? []).includes("payslips")).map((p) => p.id));
    // A few at a time so a big company doesn't open dozens of mail connections at once.
    for (let i = 0; i < todo.length; i += 4) {
      await Promise.all(
        todo.slice(i, i + 4).map(async (s) => {
          if (!s.data.person.email || optedOut.has(s.user_id)) return;
          const pdf = renderPayslipPdf({ ...s, gross_minor: Number(s.gross_minor), deductions_minor: Number(s.deductions_minor), net_minor: Number(s.net_minor), employer_pension_minor: Number(s.employer_pension_minor) });
          const sent = await sendEmail(
            [s.data.person.email],
            {
              subject: `Your payslip for ${label} – ${org.name}`,
              heading: `Your payslip for ${label}`,
              text: `${org.name} has issued your payslip. It's attached as a PDF, and you can find it any time under Payslips in ${APP_NAME}.`,
              link: `/dashboard/payslips/${s.id}`,
              button: "View payslip",
            },
            [{ filename: `payslip-${month}.pdf`, content: pdf, contentType: "application/pdf" }],
          );
          if (sent) {
            await supabase.from("payslips").update({ emailed_at: new Date().toISOString() }).eq("id", s.id);
            emailed++;
          }
        }),
      );
    }
  }

  revalidatePath("/dashboard/payroll", "layout");
  revalidatePath("/dashboard/payslips", "layout");
  revalidatePath("/dashboard/expenses");
  const parts = [`Issued ${issued} ${issued === 1 ? "payslip" : "payslips"}`];
  if (wantEmail) parts.push(emailEnabled() ? `emailed ${emailed}` : "email isn't set up, so none were emailed");
  if (failed.length) return { error: `${parts.join(", ")}. Not issued: ${failed.join(", ")}.` };
  return { success: `${parts.join(", ")}.` };
}
