import { NextResponse, type NextRequest } from "next/server";
import { hasStandard } from "@/lib/billing";
import { getBilling } from "@/lib/billing-server";
import { buildPayroll, isMonth } from "@/lib/payroll";
import { getSession } from "@/lib/session";
import { isAdminRole } from "@/lib/types";

function csvCell(value: string) {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** Month of pay as CSV (owner/admin, Standard plan). */
export async function GET(request: NextRequest) {
  const { supabase, member, org } = await getSession();
  if (!member || member.status !== "active" || !org || !isAdminRole(member.role)) {
    return NextResponse.json({ error: "Only the owner and admins can download payroll." }, { status: 403 });
  }
  if (!hasStandard(await getBilling())) {
    return NextResponse.json({ error: "Payroll is part of the Standard plan." }, { status: 402 });
  }
  const month = request.nextUrl.searchParams.get("month");
  if (!isMonth(month)) return NextResponse.json({ error: "Pick a month." }, { status: 400 });

  const { rows, workingDays } = await buildPayroll(supabase, member, month);
  const header = ["Name", "Email", "Job title", "Rate basis", "Rate", "Currency", "Working days", "Hours worked",
    "Paid leave days", "Unpaid leave days", "Days with no time", "Pay"];
  const lines = rows.map((r) =>
    [
      r.name,
      r.email,
      r.jobTitle ?? "",
      r.pay?.basis ?? "",
      r.pay ? (r.pay.amount_minor / 100).toFixed(2) : "",
      r.pay?.currency ?? "",
      String(workingDays),
      r.hours.toFixed(2),
      String(r.paidLeaveDays),
      String(r.unpaidLeaveDays),
      String(r.daysWithoutTime),
      r.amountMinor !== null ? (r.amountMinor / 100).toFixed(2) : "",
    ].map(csvCell).join(","),
  );
  const csv = "﻿" + [header.map(csvCell).join(","), ...lines].join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payroll-${org.slug}-${month}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
