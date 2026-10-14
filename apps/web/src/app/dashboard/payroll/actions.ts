"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { safeNext } from "@/lib/utils";

/** Set or change one person's pay rate (owner/admin). */
export async function setPay(formData: FormData) {
  const { supabase } = await requireAdmin();
  const back = safeNext(formData.get("back"), "/dashboard/payroll");
  const fail = (m: string): never => redirect(`${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(m)}`);

  const userId = String(formData.get("user_id") ?? "");
  const basis = formData.get("basis") === "hourly" ? "hourly" : "monthly";
  const currency = formData.get("currency") === "USD" ? "USD" : "NGN";
  const amount = Number(String(formData.get("amount") ?? "").replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000) fail("Enter the pay as a number, e.g. 250000.");
  const amount_minor = Math.round(amount * 100);

  const { data: existing } = await supabase.from("member_pay").select("user_id").eq("user_id", userId).maybeSingle();
  const { error } = existing
    ? await supabase.from("member_pay").update({ basis, currency, amount_minor }).eq("user_id", userId)
    : await supabase.from("member_pay").insert({ user_id: userId, basis, currency, amount_minor });
  if (error) fail(error.message);
  revalidatePath("/dashboard/payroll");
  redirect(back);
}
