"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DOCS_BUCKET } from "@/lib/staff";
import { requireAdmin, requireMember } from "@/lib/session";
import type { FormState } from "@/lib/types";
import { safeNext } from "@/lib/utils";

const text = (fd: FormData, name: string, max: number) => {
  const v = String(fd.get(name) ?? "").trim();
  return v ? v.slice(0, max) : null;
};
const day = (fd: FormData, name: string) => {
  const v = String(fd.get(name) ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
};

/** Save a staff record (the person, or owner/admins; the database decides which fields stick). */
export async function saveRecord(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireMember();
  const userId = String(fd.get("user_id") ?? "");
  const account = String(fd.get("account_number") ?? "").replace(/\s/g, "");
  if (account && !/^\d{6,20}$/.test(account)) return { error: "The account number should be digits only (10 for Nigerian banks)." };
  const type = String(fd.get("employment_type") ?? "");
  const row = {
    phone: text(fd, "phone", 30),
    address: text(fd, "address", 300),
    date_of_birth: day(fd, "date_of_birth"),
    start_date: day(fd, "start_date"),
    employment_type: ["full_time", "part_time", "contract", "intern"].includes(type) ? type : null,
    bank_name: text(fd, "bank_name", 80),
    account_number: account || null,
    account_name: text(fd, "account_name", 120),
    pension_pfa: text(fd, "pension_pfa", 80),
    pension_pin: text(fd, "pension_pin", 20)?.toUpperCase() ?? null,
    tax_id: text(fd, "tax_id", 20),
    emergency_name: text(fd, "emergency_name", 120),
    emergency_relationship: text(fd, "emergency_relationship", 60),
    emergency_phone: text(fd, "emergency_phone", 30),
  };
  const { data: existing } = await supabase.from("staff_profiles").select("user_id").eq("user_id", userId).maybeSingle();
  const { data, error } = existing
    ? await supabase.from("staff_profiles").update(row).eq("user_id", userId).select("user_id")
    : await supabase.from("staff_profiles").insert({ user_id: userId, ...row }).select("user_id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "You can't change this record." };
  revalidatePath("/dashboard/records", "layout");
  return { success: "Saved." };
}

function back(fd: FormData, error?: string) {
  const to = safeNext(fd.get("back"), "/dashboard/records");
  redirect(error ? `${to}${to.includes("?") ? "&" : "?"}error=${encodeURIComponent(error)}` : to);
}

/** Tick or untick a checklist item (the person or owner/admins). */
export async function toggleTask(fd: FormData) {
  const { supabase } = await requireMember();
  const done = fd.get("done") === "1";
  const { error } = await supabase
    .from("onboarding_tasks")
    .update({ done_at: done ? new Date().toISOString() : null })
    .eq("id", String(fd.get("id") ?? ""));
  revalidatePath("/dashboard/records", "layout");
  back(fd, error?.message);
}

export async function addTask(fd: FormData) {
  const { supabase } = await requireAdmin();
  const title = text(fd, "title", 200);
  if (!title || title.length < 2) return back(fd, "Write the checklist item.");
  const { error } = await supabase.from("onboarding_tasks").insert({ user_id: String(fd.get("user_id") ?? ""), title, position: 100 });
  revalidatePath("/dashboard/records", "layout");
  back(fd, error?.message);
}

export async function removeTask(fd: FormData) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("onboarding_tasks").delete().eq("id", String(fd.get("id") ?? ""));
  revalidatePath("/dashboard/records", "layout");
  back(fd, error?.message);
}

export async function startOnboarding(fd: FormData) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("start_onboarding", { p_user: String(fd.get("user_id") ?? "") });
  revalidatePath("/dashboard/records", "layout");
  back(fd, error?.message);
}

export async function addTemplateItem(fd: FormData) {
  const { supabase } = await requireAdmin();
  const title = text(fd, "title", 200);
  if (!title || title.length < 2) return back(fd, "Write the checklist item.");
  const { count } = await supabase.from("onboarding_template").select("id", { count: "exact", head: true });
  const { error } = await supabase.from("onboarding_template").insert({ title, position: (count ?? 0) + 1 });
  revalidatePath("/dashboard/records", "layout");
  back(fd, error?.message);
}

export async function removeTemplateItem(fd: FormData) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("onboarding_template").delete().eq("id", String(fd.get("id") ?? ""));
  revalidatePath("/dashboard/records", "layout");
  back(fd, error?.message);
}

/** Remove a document and its file (uploader or owner/admins). */
export async function removeDocument(fd: FormData) {
  const { supabase } = await requireMember();
  const id = String(fd.get("id") ?? "");
  const { data } = await supabase.from("staff_documents").select("file").eq("id", id).maybeSingle();
  const { data: gone, error } = await supabase.from("staff_documents").delete().eq("id", id).select("id");
  if (!error && gone?.length) {
    const path = (data as { file: { path: string } } | null)?.file.path;
    if (path) await supabase.storage.from(DOCS_BUCKET).remove([path]);
  }
  revalidatePath("/dashboard/records", "layout");
  back(fd, error?.message ?? (gone?.length ? undefined : "Only the person who added it or an admin can remove it."));
}
