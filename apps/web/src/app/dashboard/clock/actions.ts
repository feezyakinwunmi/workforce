"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";

export type ClockResult = { ok?: boolean; error?: string };

const num = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null);

/**
 * Clock out from the phone like the desktop app: an optional "what I got done" report and
 * the tasks finished, then clock out (one database call: public.phone_clock_out).
 */
export async function phoneClockOut(
  report: { summary: string; doneTaskIds: string[] },
  place: { lat: number; lng: number; accuracy: number } | null,
): Promise<ClockResult> {
  const { supabase } = await requireMember();
  const ids = (Array.isArray(report.doneTaskIds) ? report.doneTaskIds : []).filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 50);
  const { error } = await supabase.rpc("phone_clock_out", {
    p_summary: String(report.summary ?? "").slice(0, 5000),
    p_done_tasks: ids,
    p_lat: num(place?.lat, -90, 90),
    p_lng: num(place?.lng, -180, 180),
    p_accuracy: num(place?.accuracy, 0, 100000),
  });
  if (error) return { error: error.message.endsWith(".") ? error.message : `${error.message}.` };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

/** Clock in or out from the phone. The database checks the plan, open sessions and the company's location rule. */
export async function phoneClock(action: "in" | "out", place: { lat: number; lng: number; accuracy: number } | null): Promise<ClockResult> {
  const { supabase } = await requireMember();
  if (action !== "in" && action !== "out") return { error: "Unknown action." };
  const { error } = await supabase.rpc("phone_clock", {
    p_action: action,
    p_lat: num(place?.lat, -90, 90),
    p_lng: num(place?.lng, -180, 180),
    p_accuracy: num(place?.accuracy, 0, 100000),
  });
  if (error) return { error: error.message.endsWith(".") ? error.message : `${error.message}.` };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}
