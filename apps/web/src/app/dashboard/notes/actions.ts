"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { NOTE_COLORS } from "@/lib/notes";
import { requireMember } from "@/lib/session";

/** A new blank note, then open it. */
export async function createNote(formData: FormData) {
  const { supabase } = await requireMember();
  const color = NOTE_COLORS.find((c) => c === formData.get("color")) ?? NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)];
  const { data, error } = await supabase.from("notes").insert({ color }).select("id").single();
  if (error || !data) redirect(`/dashboard/notes?error=${encodeURIComponent(error?.message ?? "Couldn't create the note.")}`);
  revalidatePath("/dashboard/notes");
  redirect(`/dashboard/notes/${data.id}`);
}

/** Save what changed (autosaved while typing). */
export async function saveNote(id: string, patch: { title?: string; body?: string; color?: string; pinned?: boolean }) {
  const { supabase } = await requireMember();
  const row: Record<string, unknown> = {};
  if (typeof patch.title === "string") row.title = patch.title.slice(0, 120);
  if (typeof patch.body === "string") row.body = patch.body.slice(0, 5000);
  if (typeof patch.color === "string" && (NOTE_COLORS as readonly string[]).includes(patch.color)) row.color = patch.color;
  if (typeof patch.pinned === "boolean") row.pinned = patch.pinned;
  if (!Object.keys(row).length) return { ok: true };
  const { data, error } = await supabase.from("notes").update(row).eq("id", id).select("id, updated_at");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "This note can't be changed." };
  revalidatePath("/dashboard/notes");
  return { ok: true, updatedAt: (data[0] as { updated_at: string }).updated_at };
}

export async function deleteNote(formData: FormData) {
  const { supabase } = await requireMember();
  await supabase.from("notes").delete().eq("id", String(formData.get("id") ?? ""));
  revalidatePath("/dashboard/notes");
  redirect("/dashboard/notes");
}
