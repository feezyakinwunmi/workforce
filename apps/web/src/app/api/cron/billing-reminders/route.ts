import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { emailEnabled, sendEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Daily Vercel cron (vercel.json): emails the plan reminders that the database
 * job wrote this morning. Each reminder is emailed once (claim_billing_emails
 * marks it). Vercel sends "Authorization: Bearer <CRON_SECRET>" automatically.
 */
export const dynamic = "force-dynamic";

function authorized(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Without SMTP, leave the reminders unclaimed: they still show in the
  // dashboard and as desktop pop-ups.
  if (!emailEnabled()) return NextResponse.json({ emailed: 0, skipped: "SMTP not configured" });

  const { data, error } = await createAdminClient().rpc("claim_billing_emails");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as Array<{ email: string | null; full_name: string | null; title: string; body: string | null; link: string | null }>;
  const emails = rows.map((r) => r.email).filter((e): e is string => Boolean(e));
  const { data: prefs } = emails.length
    ? await createAdminClient().from("profiles").select("email, email_opt_out").in("email", emails)
    : { data: [] };
  const optedOut = new Set(((prefs ?? []) as Array<{ email: string; email_opt_out: string[] | null }>).filter((p) => (p.email_opt_out ?? []).includes("billing")).map((p) => p.email));
  let emailed = 0;
  for (const r of rows) {
    if (!r.email || optedOut.has(r.email)) continue;
    emailed += await sendEmail([r.email], {
      subject: r.title,
      heading: r.full_name ? `Hi ${r.full_name.split(" ")[0]}, ${r.title.charAt(0).toLowerCase()}${r.title.slice(1)}.` : `${r.title}.`,
      text: r.body,
      link: r.link || "/dashboard/billing",
      button: "Open plan and billing",
    });
  }
  return NextResponse.json({ claimed: rows.length, emailed });
}
