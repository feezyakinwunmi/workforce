"use server";

import { redirect } from "next/navigation";
import { getMeetUser, requestBase } from "@/lib/meet/server";

/** Delete a finished summary (RLS: own notes, finished only). */
export async function deleteNote(formData: FormData) {
  const { supabase, user } = await getMeetUser();
  const base = await requestBase();
  if (!user) redirect(`/login?next=${encodeURIComponent(`${base}/notes`)}`);
  const id = String(formData.get("id") ?? "");
  await supabase.from("meet_notes").delete().eq("id", id);
  redirect(`${base}/notes`);
}
