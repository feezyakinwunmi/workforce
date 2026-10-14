import { NextResponse, type NextRequest } from "next/server";
import type { PayslipData } from "@/lib/payroll";
import { renderPayslipPdf } from "@/lib/payslip-pdf";
import { getSession } from "@/lib/session";

/** One payslip as a PDF: the person it belongs to, or the owner/admins (RLS decides). */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, member } = await getSession();
  if (!member || member.status !== "active" || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const { data } = await supabase
    .from("payslips")
    .select("id, month, currency, gross_minor, deductions_minor, net_minor, employer_pension_minor, issued_at, data")
    .eq("id", id)
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const p = data as {
    id: string; month: string; currency: string; gross_minor: number; deductions_minor: number; net_minor: number;
    employer_pension_minor: number; issued_at: string; data: PayslipData;
  };
  const pdf = renderPayslipPdf({
    ...p,
    gross_minor: Number(p.gross_minor),
    deductions_minor: Number(p.deductions_minor),
    net_minor: Number(p.net_minor),
    employer_pension_minor: Number(p.employer_pension_minor),
  });
  const who = p.data.person.name.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "payslip";
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="payslip-${p.month.slice(0, 7)}-${who}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
