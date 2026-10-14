"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/session";
import { safeNext } from "@/lib/utils";

/** Mark one notification read and go to what it is about. */
export async function openNotification(formData: FormData) {
  const { supabase, user } = await requireMember();
  const id = String(formData.get("id") ?? "");
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id).is("read_at", null);
  revalidatePath("/dashboard", "layout");
  redirect(safeNext(formData.get("link"), "/dashboard/notifications"));
}

export async function markAllRead() {
  const { supabase, user } = await requireMember();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  revalidatePath("/dashboard", "layout");
}
