"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/session";

/** A worker deletes one of their own screenshots: the file goes, a "deleted" marker stays. */
export async function deleteScreenshot(formData: FormData) {
  const { supabase } = await requireMember();
  const id = String(formData.get("id") ?? "");
  const back = String(formData.get("back") ?? "/dashboard/screenshots");
  const safeBack = back.startsWith("/dashboard/screenshots") ? back : "/dashboard/screenshots";
  const { data: path, error } = await supabase.rpc("delete_my_screenshot", { p_id: id });
  if (error || typeof path !== "string") {
    redirect(`${safeBack}${safeBack.includes("?") ? "&" : "?"}error=${encodeURIComponent(error?.message ?? "Could not delete it.")}`);
  }
  await supabase.storage.from("screenshots").remove([path]);
  revalidatePath("/dashboard/screenshots");
  redirect(safeBack);
}
