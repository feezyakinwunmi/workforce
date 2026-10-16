"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/server";
import type { FormState } from "@/lib/types";

const UUID = /^[0-9a-f-]{36}$/i;

/** Move a company's free trial end (e.g. 30 days for a pilot). Lagos end of day. */
export async function extendTrial(_: FormState, form: FormData): Promise<FormState> {
  const { db, email } = await requireAdmin();
  const org = String(form.get("org") ?? "");
  const date = String(form.get("until") ?? "");
  if (!UUID.test(org) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick a date." };
  const until = new Date(`${date}T23:59:00+01:00`);
  const { error } = await db.rpc("admin_extend_trial", { p_org: org, p_until: until.toISOString(), p_by: email });
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout");
  return { success: `Trial now ends ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "Africa/Lagos" }).format(until)}.` };
}

/** A private support note on a company (only the console shows it). */
export async function addNote(_: FormState, form: FormData): Promise<FormState> {
  const { db, email } = await requireAdmin();
  const org = String(form.get("org") ?? "");
  const body = String(form.get("body") ?? "").trim().slice(0, 2000);
  if (!UUID.test(org) || !body) return { error: "Write the note first." };
  const { error } = await db.rpc("admin_add_note", { p_org: org, p_author: email, p_body: body });
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout");
  return { success: "Note saved." };
}
