"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { emailMembers } from "@/lib/email";
import { requireMember } from "@/lib/session";
import { readTaskForm, STATUSES, type TaskStatus } from "@/lib/tasks";
import type { FormState } from "@/lib/types";
import { safeNext } from "@/lib/utils";

const PATH = "/dashboard/tasks";

/** Database errors in words a person understands. */
function friendly(error: { message: string; code?: string }) {
  if (error.code === "42501") return error.message.includes("row-level security") ? "You don't have permission to do that." : error.message;
  if (error.code === "23503") return "That project or person no longer exists. Refresh the page and try again.";
  return error.message;
}

function back(formData: FormData, fallback = PATH) {
  return safeNext(formData.get("back"), fallback);
}

function fail(to: string, message: string): never {
  const sep = to.includes("?") ? "&" : "?";
  redirect(`${to}${sep}error=${encodeURIComponent(message)}`);
}

export async function createTask(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, member } = await requireMember();
  const parsed = readTaskForm(formData);
  if ("error" in parsed) return { error: parsed.error };
  const values = { ...parsed.values };
  // Workers can create tasks for themselves; the database blocks assigning others.
  if (member.role === "worker" && values.assignee_id && values.assignee_id !== member.user_id) {
    return { error: "Only managers and admins can assign tasks to other people." };
  }
  const { data, error } = await supabase.from("tasks").insert(values).select("id").single();
  if (error) return { error: friendly(error) };
  if (values.assignee_id && values.assignee_id !== member.user_id) {
    await emailAssignment(supabase, member.user_id, values.assignee_id, data.id, values.title, values.due_date);
  }
  revalidatePath(PATH);
  return { success: `Task "${values.title}" created.` };
}

export async function updateTask(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, member } = await requireMember();
  const id = String(formData.get("id") ?? "");
  const parsed = readTaskForm(formData);
  if ("error" in parsed) return { error: parsed.error };
  const { data: before } = await supabase.from("tasks").select("assignee_id").eq("id", id).maybeSingle();
  const { data, error } = await supabase.from("tasks").update(parsed.values).eq("id", id).select("id");
  if (error) return { error: friendly(error) };
  if (!data?.length) return { error: "You don't have permission to change this task." };
  const assignee = parsed.values.assignee_id;
  if (assignee && assignee !== member.user_id && assignee !== before?.assignee_id) {
    await emailAssignment(supabase, member.user_id, assignee, id, parsed.values.title, parsed.values.due_date);
  }
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${id}`);
  return { success: "Saved." };
}

/** One-click status change from the list or the task page. */
export async function setTaskStatus(formData: FormData) {
  const { supabase } = await requireMember();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as TaskStatus;
  const to = back(formData);
  if (!STATUSES.includes(status)) fail(to, "Unknown status.");
  const { data, error } = await supabase.from("tasks").update({ status }).eq("id", id).select("id");
  if (error) fail(to, friendly(error));
  if (!data?.length) fail(to, "You don't have permission to change this task.");
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${id}`);
  redirect(to);
}

export async function deleteTask(formData: FormData) {
  const { supabase } = await requireMember();
  const id = String(formData.get("id") ?? "");
  const { data, error } = await supabase.from("tasks").delete().eq("id", id).select("id");
  if (error) fail(`${PATH}/${id}`, friendly(error));
  if (!data?.length) fail(`${PATH}/${id}`, "Only the person who created this task, a manager or an admin can delete it.");
  revalidatePath(PATH);
  redirect(PATH);
}

export async function addComment(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, member, profile, user } = await requireMember();
  const taskId = String(formData.get("task_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Write a comment first." };
  if (body.length > 5000) return { error: "Keep comments under 5,000 characters." };
  const { error } = await supabase.from("task_comments").insert({ task_id: taskId, body });
  if (error) return { error: friendly(error) };
  const { data: task } = await supabase.from("tasks").select("title, assignee_id, created_by").eq("id", taskId).maybeSingle();
  if (task) {
    const who = profile?.full_name || user.email || "Someone";
    await emailMembers(
      supabase,
      [task.assignee_id, task.created_by].filter((id) => id !== member.user_id),
      {
        subject: `${who} commented on "${task.title}"`,
        heading: `${who} commented on "${task.title}"`,
        text: body,
        link: `${PATH}/${taskId}`,
        button: "Reply",
      },
    );
  }
  revalidatePath(`${PATH}/${taskId}`);
  return { success: "Comment added." };
}

export async function deleteComment(formData: FormData) {
  const { supabase } = await requireMember();
  const id = String(formData.get("id") ?? "");
  const to = back(formData);
  const { data, error } = await supabase.from("task_comments").delete().eq("id", id).select("id");
  if (error) fail(to, friendly(error));
  if (!data?.length) fail(to, "You can only delete your own comments.");
  revalidatePath(to.split("?")[0]);
  redirect(to);
}

async function emailAssignment(
  supabase: Awaited<ReturnType<typeof requireMember>>["supabase"],
  actorId: string,
  assigneeId: string,
  taskId: string,
  title: string,
  due: string | null,
) {
  const { data: actor } = await supabase.from("profiles").select("full_name, email").eq("id", actorId).maybeSingle();
  const who = actor?.full_name || actor?.email || "Someone";
  await emailMembers(supabase, [assigneeId], {
    subject: `New task: ${title}`,
    heading: `${who} assigned you a task`,
    text: `${title}${due ? `\nDue ${due}` : ""}\n\nPick it in the desktop app under "Working on" so your time is logged to it.`,
    link: `${PATH}/${taskId}`,
    button: "Open the task",
  });
}
