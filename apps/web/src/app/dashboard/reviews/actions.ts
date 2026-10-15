"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { periodStats } from "@/lib/reviews";
import { requireMember } from "@/lib/session";
import { safeNext } from "@/lib/utils";

const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

function done(fd: FormData, fallback: string, error?: string): never {
  const to = safeNext(fd.get("back"), fallback);
  revalidatePath("/dashboard/reviews", "layout");
  redirect(error ? `${to}${to.includes("?") ? "&" : "?"}error=${encodeURIComponent(error)}` : to);
}

export async function addGoal(fd: FormData) {
  const { supabase, user } = await requireMember();
  const title = String(fd.get("title") ?? "").trim();
  if (title.length < 2) done(fd, "/dashboard/reviews", "Write the goal.");
  const due = fd.get("due_on");
  const { error } = await supabase.from("goals").insert({
    user_id: String(fd.get("user_id") || user.id),
    title: title.slice(0, 200),
    details: String(fd.get("details") ?? "").trim().slice(0, 2000) || null,
    due_on: isDay(due) ? due : null,
  });
  done(fd, "/dashboard/reviews", error?.message);
}

export async function updateGoal(fd: FormData) {
  const { supabase } = await requireMember();
  const status = String(fd.get("status") ?? "active");
  const progress = Math.max(0, Math.min(100, Math.round(Number(fd.get("progress") ?? 0))));
  const { data, error } = await supabase
    .from("goals")
    .update({ progress, status: ["active", "done", "dropped"].includes(status) ? status : "active" })
    .eq("id", String(fd.get("id") ?? ""))
    .select("id");
  done(fd, "/dashboard/reviews", error?.message ?? (data?.length ? undefined : "You can't change this goal."));
}

export async function removeGoal(fd: FormData) {
  const { supabase } = await requireMember();
  const { error } = await supabase.from("goals").delete().eq("id", String(fd.get("id") ?? ""));
  done(fd, "/dashboard/reviews", error?.message);
}

/** Start a review: the period's hours, tasks, leave and goals are saved with it. */
export async function startReview(fd: FormData) {
  const { supabase } = await requireMember();
  const userId = String(fd.get("user_id") ?? "");
  const from = fd.get("from");
  const to = fd.get("to");
  const title = String(fd.get("title") ?? "").trim();
  if (!isDay(from) || !isDay(to) || to < from) done(fd, "/dashboard/reviews/new", "Pick the period.");
  if (title.length < 2) done(fd, "/dashboard/reviews/new", "Give the review a title.");
  const stats = await periodStats(supabase, userId, from as string, to as string);
  const { data, error } = await supabase.rpc("create_review", {
    p_user: userId,
    p_title: title,
    p_from: from,
    p_to: to,
    p_self: fd.get("self") === "on",
    p_stats: stats,
  });
  if (error) done(fd, "/dashboard/reviews/new", error.message);
  revalidatePath("/dashboard/reviews", "layout");
  redirect(`/dashboard/reviews/${data as string}`);
}

export async function saveSelfReview(fd: FormData) {
  const { supabase } = await requireMember();
  const id = String(fd.get("id") ?? "");
  const { error } = await supabase.rpc("submit_self_review", {
    p_id: id,
    p_text: String(fd.get("text") ?? ""),
    p_final: fd.get("intent") === "send",
  });
  done(fd, `/dashboard/reviews/${id}`, error?.message);
}

export async function saveFeedback(fd: FormData) {
  const { supabase } = await requireMember();
  const id = String(fd.get("id") ?? "");
  const rating = Number(fd.get("rating"));
  const { error } = await supabase.rpc("save_review_feedback", {
    p_id: id,
    p_rating: rating >= 1 && rating <= 5 ? rating : null,
    p_strengths: String(fd.get("strengths") ?? ""),
    p_improvements: String(fd.get("improvements") ?? ""),
    p_summary: String(fd.get("summary") ?? ""),
    p_share: fd.get("intent") === "share",
  });
  done(fd, `/dashboard/reviews/${id}`, error?.message);
}

export async function acknowledgeReview(fd: FormData) {
  const { supabase } = await requireMember();
  const id = String(fd.get("id") ?? "");
  const { error } = await supabase.rpc("acknowledge_review", { p_id: id, p_comment: String(fd.get("comment") ?? "") });
  done(fd, `/dashboard/reviews/${id}`, error?.message);
}
