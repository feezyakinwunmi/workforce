import { NextResponse } from "next/server";
import { AMOUNT_KEY, answerText, type Answers, type Field } from "@/lib/forms/schema";
import { getMeetUser } from "@/lib/meet/server";

/** Spreadsheet-safe cell: quotes, and a leading ' so a value can't run as a formula. */
function cell(value: string) {
  const v = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${v.replace(/"/g, '""')}"`;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getMeetUser();
  if (!user || !/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const { data: form } = await supabase.from("forms").select("title, fields").eq("id", id).maybeSingle();
  if (!form) return new NextResponse("Not found", { status: 404 });
  const fields = ((form as { fields: Field[] }).fields ?? []).filter((f) => f.type !== "heading");

  const rows: Array<{ answers: Answers; amount_kobo: number; status: string; created_at: string; email: string | null; page: string }> = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from("form_responses")
      .select("answers, amount_kobo, status, created_at, email, page")
      .eq("form_id", id)
      .order("created_at", { ascending: true })
      .range(from, from + 999);
    rows.push(...((data ?? []) as typeof rows));
    if (!data || data.length < 1000) break;
  }

  const header = ["Sent (Lagos time)", ...fields.map((f) => f.label), "Amount typed (NGN)", "Amount (NGN)", "Payment", "Website"];
  const lines = rows.map((r) =>
    [
      new Date(r.created_at).toLocaleString("en-GB", { timeZone: "Africa/Lagos" }),
      ...fields.map((f) => answerText(r.answers[f.id], f.type)),
      r.answers[AMOUNT_KEY] ? String(Number(r.answers[AMOUNT_KEY]) / 100) : "",
      r.amount_kobo ? String(r.amount_kobo / 100) : "",
      r.amount_kobo === 0 ? "" : r.status === "paid" ? "Paid" : "Not paid",
      r.page,
    ].map(cell).join(","),
  );
  const csv = "﻿" + [header.map(cell).join(","), ...lines].join("\r\n");
  const name = (form as { title: string }).title.replace(/[^\w -]+/g, "").trim().slice(0, 60) || "form";
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name} answers.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
