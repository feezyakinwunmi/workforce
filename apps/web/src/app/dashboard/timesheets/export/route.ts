import { NextResponse, type NextRequest } from "next/server";
import { getBilling, hasStandard } from "@/lib/billing";
import { getSession } from "@/lib/session";
import { buildTimesheet } from "@/lib/timesheet";

const hours = (seconds: number) => (seconds / 3600).toFixed(2);

function csvCell(value: string) {
  // Quote everything and neutralise spreadsheet formulas (=, +, -, @).
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** Timesheet as CSV (hours as decimals, ready for payroll or client billing). */
export async function GET(request: NextRequest) {
  const { supabase, member, org } = await getSession();
  if (!member || member.status !== "active" || !org) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  if (!hasStandard(await getBilling())) {
    return NextResponse.json({ error: "CSV downloads are part of the Standard plan." }, { status: 402 });
  }

  const { week, days, rows } = await buildTimesheet(supabase, member, request.nextUrl.searchParams.get("week") ?? undefined);

  const header = ["Name", "Email", "Time zone", ...days, "Total hours", "Active hours", "Activity %"];
  const lines = rows.map((r) =>
    [
      r.name,
      r.email,
      r.timezone,
      ...r.days.map((d) => hours(d.tracked)),
      hours(r.total),
      hours(r.active),
      r.total ? String(Math.round((r.active / r.total) * 100)) : "",
    ].map(csvCell).join(","),
  );
  const csv = "﻿" + [header.map(csvCell).join(","), ...lines].join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="timesheet-${org.slug}-${week}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
