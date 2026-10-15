"use server";

import { revalidatePath } from "next/cache";
import { setNewPassword } from "@/lib/password";
import { requireMember } from "@/lib/session";
import { EMAIL_KINDS, type EmailKind } from "@/lib/email";
import type { FormState } from "@/lib/types";

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user, member } = await requireMember();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "");

  if (fullName.length < 2) return { error: "Enter your full name." };

  const { error: nameError } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", user.id);
  if (nameError) return { error: nameError.message };

  if (timezone && timezone !== member.timezone) {
    const { error } = await supabase.rpc("update_my_timezone", { p_timezone: timezone });
    if (error) return { error: error.message };
  }

  revalidatePath("/dashboard", "layout");
  return { success: "Profile saved." };
}

/** Which emails this person gets (unticked kinds go into profiles.email_opt_out). */
export async function updateEmailPrefs(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await requireMember();
  const shown = String(formData.get("kinds") ?? "").split(",").filter((k): k is EmailKind => k in EMAIL_KINDS);
  const { data: me } = await supabase.from("profiles").select("email_opt_out").eq("id", user.id).single();
  const kept = ((me as { email_opt_out: string[] } | null)?.email_opt_out ?? []).filter((k) => !shown.includes(k as EmailKind));
  const off = [...kept, ...shown.filter((k) => formData.get(k) !== "on")];
  const { error } = await supabase.from("profiles").update({ email_opt_out: off }).eq("id", user.id);
  if (error) return { error: error.message };
  return { success: "Email settings saved." };
}

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireMember();
  const error = await setNewPassword(
    supabase,
    String(formData.get("password") ?? ""),
    String(formData.get("confirm") ?? ""),
  );
  if (error) return { error };
  return { success: "Password changed." };
}
