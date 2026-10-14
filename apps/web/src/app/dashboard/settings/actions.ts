"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import type { FormState } from "@/lib/types";

export async function updateCompanySettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, org } = await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? org.timezone);
  const idle = Number(formData.get("idle_timeout_minutes"));

  if (name.length < 2) return { error: "Enter the company name." };
  if (!Number.isInteger(idle) || idle < 1 || idle > 60) {
    return { error: "Idle timeout must be a whole number of minutes between 1 and 60." };
  }

  const settings = {
    ...org.settings,
    idle_timeout_minutes: idle,
    track_apps: formData.get("track_apps") === "on",
    track_urls: formData.get("track_urls") === "on",
  };

  const { data, error } = await supabase
    .from("organizations")
    .update({ name, timezone, settings })
    .eq("id", org.id)
    .select("id");

  if (error) return { error: error.message };
  if (!data?.length) return { error: "You don't have permission to change company settings." };

  revalidatePath("/dashboard", "layout");
  return { success: "Settings saved." };
}
