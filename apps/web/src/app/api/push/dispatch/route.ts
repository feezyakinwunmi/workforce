import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVapid, sendPush } from "@/lib/webpush";

/**
 * Sends waiting notifications to people's phones and browsers (Web Push).
 * Called every minute by the database (pg_cron + pg_net, private.request_push_dispatch) only
 * when something is waiting. No secret is needed: it only sends what is due, and each
 * notification is claimed once (public.claim_push_notifications, service role only).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Claimed = { id: string; user_id: string; kind: string; title: string; body: string | null; link: string | null };
type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };

async function dispatch() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ skipped: "no service role key" });
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_push_notifications");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const items = (data ?? []) as Claimed[];
  if (!items.length) return NextResponse.json({ sent: 0 });

  const vapid = await getVapid(admin);
  const { data: subRows } = await admin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", [...new Set(items.map((i) => i.user_id))]);
  const subs = (subRows ?? []) as Sub[];

  let sent = 0;
  const gone: string[] = [];
  await Promise.all(
    items.flatMap((n) =>
      subs
        .filter((s) => s.user_id === n.user_id)
        .map(async (s) => {
          const res = await sendPush(
            s,
            { id: n.id, kind: n.kind, title: n.title, body: n.body ?? "", link: n.link && n.link.startsWith("/dashboard") ? n.link : "/dashboard/notifications" },
            vapid,
            n.kind === "clock_reminder",
          );
          if (res.ok) sent++;
          if (res.gone) gone.push(s.id);
        }),
    ),
  );
  if (gone.length) await admin.from("push_subscriptions").delete().in("id", gone);
  return NextResponse.json({ notifications: items.length, sent, removed: gone.length });
}

export const POST = dispatch;
export const GET = dispatch;
