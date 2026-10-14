import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Daily Vercel cron (vercel.json): removes screenshots older than 90 days
 * (private.screenshot_retention_days in migration 0019). Files must be removed
 * through the Storage API, so this runs here with the service-role key.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RETENTION_DAYS = 90;

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
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();
  let removed = 0;
  for (let round = 0; round < 10; round++) {
    const { data, error } = await admin.from("screenshots").select("id, path").lt("taken_at", cutoff).limit(500);
    if (error) return NextResponse.json({ error: error.message, removed }, { status: 500 });
    const rows = (data ?? []) as Array<{ id: string; path: string }>;
    if (!rows.length) break;
    const { error: storageError } = await admin.storage.from("screenshots").remove(rows.map((r) => r.path));
    if (storageError) return NextResponse.json({ error: storageError.message, removed }, { status: 500 });
    const { error: deleteError } = await admin.from("screenshots").delete().in("id", rows.map((r) => r.id));
    if (deleteError) return NextResponse.json({ error: deleteError.message, removed }, { status: 500 });
    removed += rows.length;
  }
  return NextResponse.json({ removed });
}
