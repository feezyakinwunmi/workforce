"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/session";
import { isManagerOrAdmin, PROJECT_COLORS, type ProjectColor } from "@/lib/tasks";
import type { FormState } from "@/lib/types";

const PATH = "/dashboard/projects";

async function requireManager() {
  const session = await requireMember();
  if (!isManagerOrAdmin(session.member)) redirect("/dashboard/tasks");
  return session;
}

function readProject(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const color = String(formData.get("color") ?? "violet") as ProjectColor;
  if (!name) return { error: "Give the project a name." } as const;
  if (name.length > 80) return { error: "Keep the name under 80 characters." } as const;
  if (description.length > 1000) return { error: "Keep the description under 1,000 characters." } as const;
  if (!PROJECT_COLORS.includes(color)) return { error: "Pick a colour." } as const;
  return { values: { name, description: description || null, color } } as const;
}

const duplicate = (code?: string) => code === "23505";

export async function createProject(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireManager();
  const parsed = readProject(formData);
  if ("error" in parsed) return { error: parsed.error };
  const { error } = await supabase.from("projects").insert(parsed.values);
  if (error) return { error: duplicate(error.code) ? "A project with that name already exists." : error.message };
  revalidatePath(PATH);
  revalidatePath("/dashboard/tasks");
  return { success: `Project "${parsed.values.name}" created.` };
}

export async function updateProject(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireManager();
  const id = String(formData.get("id") ?? "");
  const parsed = readProject(formData);
  if ("error" in parsed) return { error: parsed.error };
  const { data, error } = await supabase.from("projects").update(parsed.values).eq("id", id).select("id");
  if (error) return { error: duplicate(error.code) ? "A project with that name already exists." : error.message };
  if (!data?.length) return { error: "You don't have permission to change this project." };
  revalidatePath(PATH);
  revalidatePath("/dashboard/tasks");
  return { success: "Saved." };
}

/** Archive hides a project from pickers but keeps its tasks and time. */
export async function setProjectArchived(formData: FormData) {
  const { supabase } = await requireManager();
  const id = String(formData.get("id") ?? "");
  const archive = formData.get("archive") === "1";
  const { data, error } = await supabase
    .from("projects")
    .update({ archived_at: archive ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) {
    redirect(`${PATH}?error=${encodeURIComponent(error?.message ?? "You don't have permission to change this project.")}`);
  }
  revalidatePath(PATH);
  revalidatePath("/dashboard/tasks");
}
