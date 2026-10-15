"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/session";
import type { FormState } from "@/lib/types";

const PATH = "/dashboard/chat";

function fail(to: string, message: string): never {
  redirect(`${to}?error=${encodeURIComponent(message)}`);
}

/** Start (or reopen) a direct conversation. */
export async function openDirect(formData: FormData) {
  const { supabase } = await requireMember();
  const userId = String(formData.get("user_id") ?? "");
  const { data, error } = await supabase.rpc("open_direct", { p_user: userId });
  if (error || !data) fail(`${PATH}/new`, error?.message ?? "Could not open the conversation.");
  revalidatePath(PATH, "layout");
  redirect(`${PATH}/${data}`);
}

export async function createGroup(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireMember();
  const name = String(formData.get("name") ?? "").trim().replace(/^#/, "");
  const description = String(formData.get("description") ?? "").trim();
  const isPrivate = formData.get("visibility") !== "public";
  const members = formData.getAll("member_ids").map(String).filter(Boolean);
  if (!name) return { error: "Give the group a name." };
  const { data, error } = await supabase.rpc("create_channel", {
    p_name: name,
    p_description: description || null,
    p_private: isPrivate,
    p_member_ids: members,
  });
  if (error || !data) return { error: error?.message ?? "Could not create the group." };
  revalidatePath(PATH, "layout");
  redirect(`${PATH}/${data}`);
}

export async function addMembers(formData: FormData) {
  const { supabase } = await requireMember();
  const channelId = String(formData.get("channel_id") ?? "");
  const members = formData.getAll("member_ids").map(String).filter(Boolean);
  if (!members.length) fail(`${PATH}/${channelId}`, "Pick at least one person.");
  const { error } = await supabase.rpc("add_channel_members", { p_channel: channelId, p_user_ids: members });
  if (error) fail(`${PATH}/${channelId}`, error.message);
  revalidatePath(`${PATH}/${channelId}`);
}

export async function removeMember(formData: FormData) {
  const { supabase, user } = await requireMember();
  const channelId = String(formData.get("channel_id") ?? "");
  const userId = String(formData.get("user_id") ?? "");
  const { error } = await supabase.rpc("remove_channel_member", { p_channel: channelId, p_user: userId });
  if (error) fail(`${PATH}/${channelId}`, error.message);
  revalidatePath(PATH, "layout");
  if (userId === user.id) redirect(PATH);
}

export async function archiveChannel(formData: FormData) {
  const { supabase } = await requireMember();
  const channelId = String(formData.get("channel_id") ?? "");
  const { data, error } = await supabase
    .from("channels")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", channelId)
    .select("id");
  if (error) fail(`${PATH}/${channelId}`, error.message);
  if (!data?.length) fail(`${PATH}/${channelId}`, "Only managers and admins can archive groups.");
  revalidatePath(PATH, "layout");
  redirect(PATH);
}

/** "Start meeting": a Workbase Meet call for this chat, with the link posted in the conversation. */
export async function startChatMeeting(channelId: string, title: string): Promise<{ link?: string; error?: string }> {
  const { supabase } = await requireMember();
  const { linkFor } = await import("@/lib/meet/server");
  const { data, error } = await supabase.rpc("meet_create", {
    p_title: title.slice(0, 120),
    p_waiting_room: false, // people from the chat come straight in
    p_allow_guests: false,
  });
  if (error || !data) return { error: error?.message ?? "Couldn't start a meeting." };
  const link = await linkFor((data as { code: string }).code);
  const { error: msgError } = await supabase.from("messages").insert({ channel_id: channelId, body: `📹 I started a meeting. Join here: ${link}` });
  if (msgError) return { link, error: "The meeting started, but the link couldn't be posted here." };
  return { link };
}
