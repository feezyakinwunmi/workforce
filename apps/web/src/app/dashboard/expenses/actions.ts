"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/session";

const back = (error?: string) => redirect(`/dashboard/expenses${error ? `?error=${encodeURIComponent(error)}` : ""}`);

/** Approve or reject a claim (the person's manager or an admin; the database checks). */
export async function decideExpense(formData: FormData) {
  const { supabase } = await requireMember();
  const { error } = await supabase.rpc("decide_expense", {
    p_id: String(formData.get("id") ?? ""),
    p_approve: formData.get("decision") === "approve",
    p_note: String(formData.get("note") ?? "").trim() || null,
  });
  revalidatePath("/dashboard", "layout");
  back(error?.message);
}

/** Cancel your own claim while it's waiting, and remove its receipt. */
export async function cancelExpense(formData: FormData) {
  const { supabase } = await requireMember();
  const id = String(formData.get("id") ?? "");
  const { data } = await supabase.from("expense_claims").select("receipt").eq("id", id).maybeSingle();
  const { error } = await supabase.rpc("cancel_expense", { p_id: id });
  const path = (data as { receipt: { path: string } | null } | null)?.receipt?.path;
  if (!error && path) await supabase.storage.from("expense-receipts").remove([path]);
  revalidatePath("/dashboard", "layout");
  back(error?.message);
}
