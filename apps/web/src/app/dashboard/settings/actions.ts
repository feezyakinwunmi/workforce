"use server";

import { revalidatePath } from "next/cache";
import { removeCompanyLogo, saveCompanyLogo } from "@/lib/company-logo-server";
import { requireAdmin } from "@/lib/session";
import type { FormState } from "@/lib/types";

export async function updateCompanySettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, org } = await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? org.timezone);
  const idle = Number(formData.get("idle_timeout_minutes"));

  if (name.length < 2) return { error: "Enter the company name." };
  if (formData.get("hours_form") === "1" && String(formData.get("work_end")) <= String(formData.get("work_start"))) {
    return { error: "The work day must end after it starts." };
  }
  if (!Number.isInteger(idle) || idle < 1 || idle > 60) {
    return { error: "Idle timeout must be a whole number of minutes between 1 and 60." };
  }

  const settings = {
    ...org.settings,
    idle_timeout_minutes: idle,
    track_apps: formData.get("track_apps") === "on",
    track_urls: formData.get("track_urls") === "on",
    ...(formData.get("hours_form") === "1"
      ? {
          work_start: /^\d{2}:\d{2}$/.test(String(formData.get("work_start"))) ? String(formData.get("work_start")) : "09:00",
          work_end: /^\d{2}:\d{2}$/.test(String(formData.get("work_end"))) ? String(formData.get("work_end")) : "17:00",
          work_days: [1, 2, 3, 4, 5, 6, 7].filter((d) => formData.get(`day_${d}`) === "on"),
          clock_reminders: formData.get("clock_reminders") === "on",
        }
      : {}),
    ...(formData.get("phone_form") === "1"
      ? {
          phone_clock: formData.get("phone_clock") === "on",
          phone_location: (["off", "ask", "required"] as const).find((v) => v === formData.get("phone_location")) ?? "ask",
        }
      : {}),
    ...(formData.get("screenshot_form") === "1"
      ? {
          screenshots_enabled: formData.get("screenshots_enabled") === "on",
          blur_screenshots: formData.get("blur_screenshots") === "on",
          screenshot_interval_minutes: Number(formData.get("screenshot_interval_minutes")) || 10,
        }
      : {}),
  };

  const { data, error } = await supabase
    .from("organizations")
    .update({ name, timezone, settings })
    .eq("id", org.id)
    .select("id");

  // The database refuses screenshots without the Pro plan and tells everyone about changes.
  if (error) return { error: error.message };
  if (!data?.length) return { error: "You don't have permission to change company settings." };

  revalidatePath("/dashboard", "layout");
  return { success: "Settings saved." };
}

/** Owner: close the company. Nothing is deleted for 14 days; clocking in stops at once. */
export async function closeCompany(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("close_company", { p_confirm: String(formData.get("confirm") ?? "") });
  if (error) return { error: error.message.endsWith(".") ? error.message : `${error.message}.` };
  revalidatePath("/dashboard", "layout");
  return { success: "The company is closing. You can undo this for 14 days." };
}

/** Owner: undo closing while the 14 days are not over. */
export async function reopenCompany() {
  const { supabase } = await requireAdmin();
  await supabase.rpc("reopen_company");
  revalidatePath("/dashboard", "layout");
}

/** Owner/admin: let Workbase support take a closer look for 1–7 days (every look is logged). */
export async function allowSupport(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const days = Number(formData.get("days"));
  const { error } = await supabase.rpc("grant_support_access", { p_days: days });
  if (error) return { error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: `Support can look until ${days === 1 ? "this time tomorrow" : `${days} days from now`}.` };
}

/** Owner/admin: switch support access off now. */
export async function stopSupport() {
  const { supabase } = await requireAdmin();
  await supabase.rpc("revoke_support_access");
  revalidatePath("/dashboard/settings");
}

/** Owner/admin: add, replace or remove the company logo. */
export async function saveLogo(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, org } = await requireAdmin();
  const logo = formData.get("logo");
  let error: string | null = null;
  if (formData.get("remove") === "1" && !(logo instanceof File && logo.size > 0)) error = await removeCompanyLogo(supabase, org.id, org.logo_path);
  else if (logo instanceof File && logo.size > 0) error = await saveCompanyLogo(supabase, org.id, logo, org.logo_path);
  else return { error: "Choose a picture first." };
  if (error) return { error };
  revalidatePath("/dashboard", "layout");
  return { success: "Logo saved. Everyone in the company sees it now." };
}
