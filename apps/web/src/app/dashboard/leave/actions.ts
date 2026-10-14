"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { NIGERIA_HOLIDAYS } from "@/lib/leave";
import { requireAdmin, requireMember } from "@/lib/session";
import type { FormState } from "@/lib/types";

const PATH = "/dashboard/leave";

function fail(to: string, message: string): never {
  redirect(`${to}?error=${encodeURIComponent(message)}`);
}

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function requestLeave(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireMember();
  const leaveTypeId = String(formData.get("leave_type_id") ?? "");
  const start = String(formData.get("start_date") ?? "");
  const end = String(formData.get("end_date") ?? "") || start;
  const reason = String(formData.get("reason") ?? "").trim();
  if (!leaveTypeId) return { error: "Pick a type of leave." };
  if (!isDate(start) || !isDate(end)) return { error: "Pick the first and last day." };
  if (reason.length > 500) return { error: "Keep the reason under 500 characters." };
  const { data, error } = await supabase
    .from("leave_requests")
    .insert({ leave_type_id: leaveTypeId, start_date: start, end_date: end, reason: reason || null })
    .select("days")
    .single();
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: `Request sent for ${Number(data.days)} ${Number(data.days) === 1 ? "day" : "days"}. Your manager has been told.` };
}

export async function cancelLeave(formData: FormData) {
  const { supabase } = await requireMember();
  const { error } = await supabase.rpc("cancel_leave", { p_id: String(formData.get("id") ?? "") });
  if (error) fail(PATH, error.message);
  revalidatePath(PATH);
}

export async function decideLeave(formData: FormData) {
  const { supabase } = await requireMember();
  const { error } = await supabase.rpc("decide_leave", {
    p_id: String(formData.get("id") ?? ""),
    p_approve: formData.get("decision") === "approve",
    p_note: String(formData.get("note") ?? "").trim() || null,
  });
  if (error) fail(PATH, error.message);
  revalidatePath(PATH);
  revalidatePath("/dashboard/timesheets");
}

// ----- Settings (owner/admin) -----
const SETTINGS = `${PATH}/settings`;
const COLORS = ["violet", "blue", "green", "amber", "red", "pink", "slate"];

function readType(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const daysRaw = String(formData.get("days_per_year") ?? "").trim();
  const color = String(formData.get("color") ?? "violet");
  const days = daysRaw === "" ? null : Number(daysRaw);
  if (!name || name.length > 40) return { error: "Give the leave type a name (up to 40 characters)." } as const;
  if (days !== null && (!Number.isFinite(days) || days < 0 || days > 365)) return { error: "Days per year must be between 0 and 365, or empty for no limit." } as const;
  return { values: { name, days_per_year: days, paid: formData.get("paid") === "on", color: COLORS.includes(color) ? color : "violet" } } as const;
}

export async function addLeaveType(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const parsed = readType(formData);
  if ("error" in parsed) return { error: parsed.error };
  const { error } = await supabase.from("leave_types").insert(parsed.values);
  if (error) return { error: error.code === "23505" ? "A leave type with that name already exists." : error.message };
  revalidatePath(SETTINGS);
  return { success: `"${parsed.values.name}" added.` };
}

export async function updateLeaveType(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const parsed = readType(formData);
  if ("error" in parsed) fail(SETTINGS, parsed.error ?? "Check the form.");
  const { data, error } = await supabase.from("leave_types").update(parsed.values).eq("id", id).select("id");
  if (error) fail(SETTINGS, error.code === "23505" ? "A leave type with that name already exists." : error.message);
  if (!data?.length) fail(SETTINGS, "You don't have permission to change leave types.");
  revalidatePath(SETTINGS);
  revalidatePath(PATH);
}

export async function archiveLeaveType(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const restore = formData.get("restore") === "1";
  const { error } = await supabase
    .from("leave_types")
    .update({ archived_at: restore ? null : new Date().toISOString() })
    .eq("id", id);
  if (error) fail(SETTINGS, error.message);
  revalidatePath(SETTINGS);
  revalidatePath(PATH);
}

export async function addHoliday(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const day = String(formData.get("day") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!isDate(day)) return { error: "Pick the date." };
  if (!name || name.length > 80) return { error: "Give the holiday a name." };
  const { error } = await supabase.from("holidays").insert({ day, name });
  if (error) return { error: error.code === "23505" ? "There's already a holiday on that date." : error.message };
  revalidatePath(SETTINGS);
  return { success: `${name} added.` };
}

export async function addPresetHolidays(formData: FormData) {
  const { supabase } = await requireAdmin();
  const year = Number(formData.get("year"));
  const preset = NIGERIA_HOLIDAYS[year];
  if (!preset) fail(SETTINGS, "No holiday list for that year.");
  const { data: existing } = await supabase.from("holidays").select("day").gte("day", `${year}-01-01`).lte("day", `${year}-12-31`);
  const taken = new Set(((existing ?? []) as Array<{ day: string }>).map((h) => h.day));
  const rows = preset.filter((h) => !taken.has(h.day));
  if (rows.length) {
    const { error } = await supabase.from("holidays").insert(rows);
    if (error) fail(SETTINGS, error.message);
  }
  revalidatePath(SETTINGS);
}

export async function removeHoliday(formData: FormData) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("holidays").delete().eq("id", String(formData.get("id") ?? ""));
  if (error) fail(SETTINGS, error.message);
  revalidatePath(SETTINGS);
}
