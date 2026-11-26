import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Nightly Vercel cron (vercel.json), with the service-role key because files can only be
 * removed through the Storage API:
 * 1. removes screenshots older than 90 days (migration 0019);
 * 2. deletes companies whose owner closed them more than 14 days ago (migration 0028):
 *    first their stored files, then the company row, which cascades to all its data;
 * 3. removes Workbase Forms files nobody needs any more (migration 0049): uploads never sent
 *    with an answer, and files of deleted answers or forms;
 * 4. retries Google Sheets rows that didn't go through (migration 0050);
 * 5. deletes sign-ups that never confirmed their email within 7 days (bots, scanners, typos).
 *    Only real email accounts: Meet guests (anonymous) are cleaned up by meet_housekeeping.
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

  // Closed companies past their 14 days.
  const { data: closing } = await admin.from("organizations").select("id, name").not("purge_after", "is", null).lt("purge_after", new Date().toISOString()).limit(5);
  const deleted: string[] = [];
  for (const org of (closing ?? []) as Array<{ id: string; name: string }>) {
    const { data: files, error: listError } = await admin.rpc("company_files", { p_org: org.id });
    if (listError) return NextResponse.json({ error: listError.message, removed, deleted }, { status: 500 });
    const byBucket = new Map<string, string[]>();
    for (const f of (files ?? []) as Array<{ bucket_id: string; name: string }>) byBucket.set(f.bucket_id, [...(byBucket.get(f.bucket_id) ?? []), f.name]);
    for (const [bucket, names] of byBucket) {
      for (let i = 0; i < names.length; i += 100) {
        const { error: rmError } = await admin.storage.from(bucket).remove(names.slice(i, i + 100));
        if (rmError) return NextResponse.json({ error: rmError.message, removed, deleted }, { status: 500 });
      }
    }
    const { error: orgError } = await admin.from("organizations").delete().eq("id", org.id);
    if (orgError) return NextResponse.json({ error: orgError.message, removed, deleted }, { status: 500 });
    console.log(`Deleted closed company ${org.id}`);
    deleted.push(org.id);
  }
  // Form files nobody needs any more.
  let formFiles = 0;
  for (let round = 0; round < 10; round++) {
    const { data, error } = await admin.rpc("form_stale_uploads", { p_limit: 500 });
    if (error) break; // migration 0049 not there yet: skip quietly
    const paths = (data ?? []) as string[];
    if (!paths.length) break;
    for (let i = 0; i < paths.length; i += 100) {
      const { error: rmError } = await admin.storage.from("form-files").remove(paths.slice(i, i + 100));
      if (rmError) return NextResponse.json({ error: rmError.message, removed, deleted: deleted.length, formFiles }, { status: 500 });
    }
    await admin.from("form_uploads").delete().in("path", paths);
    formFiles += paths.length;
  }
  // Answers that didn't reach their Google Sheet yet.
  let sheetRows = 0;
  const { data: backlog } = await admin.rpc("form_sheet_backlog", { p_limit: 300 });
  if (backlog?.length) {
    const { syncAnswer } = await import("@/lib/forms/google");
    for (const id of backlog as string[]) {
      await syncAnswer(id);
      sheetRows++;
    }
  }
  // Meet AI notes older than 90 days, and sound left over from finished notes.
  const { cleanupNotes } = await import("@/lib/meet/notes");
  const notes = await cleanupNotes(admin).catch(() => ({ removed: 0 }));
  const unconfirmed = await removeUnconfirmed(admin);
  return NextResponse.json({ removed, deleted: deleted.length, formFiles, sheetRows, notes: notes.removed, unconfirmed });
}

/**
 * Deletes accounts that signed up but never confirmed their email within 7 days. They can't
 * log in and own nothing (a company needs a confirmed login), so nothing is lost. Never errors
 * the whole job: problems are counted and the rest of the clean-up still reports normally.
 */
const UNCONFIRMED_DAYS = 7;
async function removeUnconfirmed(admin: ReturnType<typeof createAdminClient>) {
  const cutoff = Date.now() - UNCONFIRMED_DAYS * 86_400_000;
  let removed = 0;
  let failed = 0;
  // Pages of 1,000 users, newest accounts included; stop after 10 pages to stay within time.
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return { removed, failed: failed + 1 };
    const users = data?.users ?? [];
    for (const u of users) {
      const stale =
        !u.is_anonymous && !!u.email && !u.email_confirmed_at && !u.last_sign_in_at && Date.parse(u.created_at) < cutoff;
      if (!stale) continue;
      const { error: delError } = await admin.auth.admin.deleteUser(u.id);
      if (delError) failed++;
      else removed++;
    }
    if (users.length < 1000) break;
  }
  return { removed, failed };
}
