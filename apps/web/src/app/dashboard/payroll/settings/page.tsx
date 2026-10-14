import type { Metadata } from "next";
import { loadPayrollSettings } from "@/lib/payroll";
import { requireAdmin } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { PayrollSettingsForm } from "../forms";

export const metadata: Metadata = { title: "Payroll settings" };

export default async function PayrollSettingsPage() {
  const { supabase } = await requireAdmin();
  const settings = await loadPayrollSettings(supabase);
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Payroll settings" back={{ href: "/dashboard/payroll", label: "Payroll" }} />
      <PayrollSettingsForm settings={settings} />
    </div>
  );
}
