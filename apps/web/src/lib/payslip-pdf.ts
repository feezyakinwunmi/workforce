import { APP_NAME } from "@/lib/config";
import { PdfDoc } from "@/lib/pdf";
import type { PayslipData } from "@/lib/payroll";

export type StoredPayslip = {
  id: string;
  month: string; // YYYY-MM-01
  currency: string;
  gross_minor: number;
  deductions_minor: number;
  net_minor: number;
  employer_pension_minor: number;
  issued_at: string;
  data: PayslipData;
};

const INK = "#15123a";
const MUTED = "#6e6990";
const LINE = "#e3e0ee";
const VIOLET = "#6a4cf5";
const CANVAS = "#f7f6fb";

/** "NGN 250,000.00" — the PDF fonts have no naira sign. */
export function pdfMoney(minor: number, currency: string) {
  const n = (Number(minor) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${currency} ${n}`;
}

const day = (iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) =>
  new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });

/** One payslip as an A4 PDF. */
export function renderPayslipPdf(p: StoredPayslip): Buffer {
  const d = p.data;
  const doc = new PdfDoc();
  const L = 48;
  const R = doc.width - 48;
  const W = R - L;
  const cur = p.currency;
  const money = (m: number) => pdfMoney(m, cur);
  const monthName = day(p.month, { month: "long", year: "numeric" });

  // Header
  doc.rect(0, 0, doc.width, 6, { fill: VIOLET });
  doc.text(L, 58, d.company, { size: 18, bold: true, maxWidth: W * 0.6 });
  doc.text(L, 76, `Issued ${day(p.issued_at)}`, { size: 9, color: MUTED });
  doc.text(R, 50, "PAYSLIP", { size: 9, bold: true, color: VIOLET, align: "right" });
  doc.text(R, 70, monthName, { size: 16, bold: true, align: "right" });
  doc.line(L, 92, R, 92, { color: LINE });

  // Person and period
  const boxY = 108;
  doc.rect(L, boxY, W, 92, { fill: CANVAS, radius: 8 });
  const col = (x: number, y: number, label: string, value: string, width: number) => {
    doc.text(x, y, label, { size: 8, color: MUTED });
    doc.text(x, y + 13, value, { size: 10, bold: true, maxWidth: width });
  };
  const half = W / 2;
  col(L + 16, boxY + 22, "Employee", d.person.name, half - 32);
  col(L + 16, boxY + 56, "Job title", d.person.job_title || "–", half - 32);
  col(L + half, boxY + 22, "Pay period", `${day(d.period.first, { day: "numeric", month: "short" })} – ${day(d.period.last)}`, half / 2 - 8);
  col(
    L + half + half / 2,
    boxY + 22,
    "Pay basis",
    d.work.basis === "hourly" ? `${money(d.work.rate_minor)} / hour` : "Monthly salary",
    half / 2 - 16,
  );
  col(L + half, boxY + 56, "Hours tracked", `${d.work.hours.toFixed(1)} h in ${d.work.working_days} days`, half / 2 - 8);
  col(
    L + half + half / 2,
    boxY + 56,
    "Leave",
    d.work.paid_leave_days || d.work.unpaid_leave_days ? `${d.work.paid_leave_days} paid · ${d.work.unpaid_leave_days} unpaid` : "None",
    half / 2 - 16,
  );

  // Earnings and deductions, side by side
  const top = boxY + 116;
  const gap = 20;
  const colW = (W - gap) / 2;
  const table = (x: number, title: string, lines: PayslipData["earnings"], totalLabel: string, total: number) => {
    let y = top;
    doc.text(x, y, title.toUpperCase(), { size: 8, bold: true, color: MUTED });
    y += 10;
    doc.line(x, y, x + colW, y, { color: INK, width: 1 });
    y += 18;
    for (const l of lines) {
      doc.text(x, y, l.label, { size: 9.5, maxWidth: colW - 110 });
      doc.text(x + colW, y, money(l.amount_minor), { size: 9.5, align: "right" });
      if (l.note) {
        y += 12;
        doc.text(x, y, l.note, { size: 8, color: MUTED, maxWidth: colW - 8 });
      }
      y += 8;
      doc.line(x, y, x + colW, y, { color: LINE });
      y += 15;
    }
    if (!lines.length) {
      doc.text(x, y, "None", { size: 9.5, color: MUTED });
      y += 23;
    }
    doc.text(x, y, totalLabel, { size: 9.5, bold: true });
    doc.text(x + colW, y, money(total), { size: 9.5, bold: true, align: "right" });
    return y;
  };
  const endA = table(L, "Earnings", d.earnings, "Total earnings", p.gross_minor);
  const endB = table(L + colW + gap, "Deductions", d.deductions, "Total deductions", p.deductions_minor);

  // Net pay
  let y = Math.max(endA, endB) + 24;
  doc.rect(L, y, W, 54, { fill: VIOLET, radius: 8 });
  doc.text(L + 18, y + 24, "NET PAY", { size: 8, bold: true, color: "#d3c9ff" });
  doc.text(L + 18, y + 40, "Paid to you this month", { size: 9, color: "#e8e2ff" });
  doc.text(R - 18, y + 35, money(p.net_minor), { size: 20, bold: true, color: "#ffffff", align: "right" });
  y += 54;

  if (d.employer.length) {
    y += 22;
    doc.text(L, y, `${d.employer.map((e) => `${e.label}: ${money(e.amount_minor)}`).join(" · ")} — paid by ${d.company} on top of your pay.`, {
      size: 8.5,
      color: MUTED,
      maxWidth: W,
    });
  }

  // How PAYE was worked out
  const t = d.tax;
  if (t) {
    y += 30;
    doc.text(L, y, "HOW YOUR PAYE WAS WORKED OUT", { size: 8, bold: true, color: MUTED });
    y += 10;
    doc.line(L, y, R, y, { color: INK, width: 1 });
    y += 18;
    const row = (label: string, value: string, o: { bold?: boolean; indent?: boolean } = {}) => {
      doc.text(L + (o.indent ? 12 : 0), y, label, { size: 9, bold: o.bold, color: o.indent ? MUTED : INK, maxWidth: W - 130 });
      doc.text(R, y, value, { size: 9, bold: o.bold, align: "right", color: o.indent ? MUTED : INK });
      y += 15;
    };
    if (t.exempt) {
      row("Monthly pay is at or below the national minimum wage (NGN 70,000), so no PAYE is due.", "", {});
    } else {
      row("Yearly gross pay (this month × 12)", money(t.annual_gross_minor));
      for (const r of t.reliefs) row(`Less ${r.label}`, `– ${money(r.amount_minor)}`, { indent: true });
      row("Chargeable income", money(t.chargeable_minor), { bold: true });
      for (const b of t.bands) {
        row(`${b.label.replace("₦", "NGN ")} at ${Math.round(b.rate * 100)}%`, money(b.tax_minor), { indent: true });
      }
      row("Yearly tax", money(t.annual_tax_minor), { bold: true });
      row("PAYE this month (yearly tax ÷ 12)", money(Math.round(t.annual_tax_minor / 12)), { bold: true });
    }
  }

  // Footer
  doc.line(L, doc.height - 64, R, doc.height - 64, { color: LINE });
  doc.text(L, doc.height - 46, `Prepared by ${d.company} with ${APP_NAME}. Tax rules: Nigeria Tax Act 2025 (from 1 January 2026).`, {
    size: 7.5,
    color: MUTED,
    maxWidth: W,
  });
  doc.text(L, doc.height - 34, "Questions about this payslip? Ask your company's payroll admin.", { size: 7.5, color: MUTED });
  doc.text(R, doc.height - 34, `Ref ${p.id.slice(0, 8).toUpperCase()}`, { size: 7.5, color: MUTED, align: "right" });

  return doc.toBuffer({ title: `Payslip ${monthName} – ${d.person.name}`, author: d.company });
}
