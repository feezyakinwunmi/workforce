"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";

/** Disconnect a computer: its desktop app stops tracking and can't upload again. */
export async function disconnectDevice(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("device_id") ?? "");
  const back = String(formData.get("back") ?? "/dashboard/activity");
  const { data, error } = await supabase
    .from("devices")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  const target = back.startsWith("/dashboard/activity") ? back : "/dashboard/activity";
  if (error || !data?.length) {
    redirect(`${target}${target.includes("?") ? "&" : "?"}error=${encodeURIComponent(error?.message ?? "Not allowed")}`);
  }
  revalidatePath("/dashboard/activity");
  redirect(target);
}
