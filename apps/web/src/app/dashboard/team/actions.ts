"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import type { FormState, MemberRole, MemberStatus } from "@/lib/types";
import { siteUrl } from "@/lib/utils";

const PATH = "/dashboard/team";
const ASSIGNABLE_ROLES: MemberRole[] = ["admin", "manager", "worker"];
const STATUSES: MemberStatus[] = ["active", "suspended", "removed"];

function fail(message: string): never {
  redirect(`${PATH}?error=${encodeURIComponent(message)}`);
}

export async function inviteMember(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "worker") as MemberRole;
  const teamId = String(formData.get("team_id") ?? "") || null;

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };
  if (!ASSIGNABLE_ROLES.includes(role)) return { error: "Pick a role." };

  const { data, error } = await supabase
    .from("invitations")
    .insert({ email, role, team_id: teamId })
    .select("token")
    .single();

  if (error) return { error: error.message };

  revalidatePath(PATH);
  return {
    success: `Invitation created. Send this link to ${email}: ${siteUrl()}/invite/${data.token}`,
  };
}

export async function revokeInvitation(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const { error } = await supabase
    .from("invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);
  if (error) fail(error.message);
  revalidatePath(PATH);
}

/** Change one field of a member: role, team or status. */
export async function updateMember(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("membership_id") ?? "");
  const patch: Record<string, string | null> = {};

  if (formData.has("role")) {
    const role = String(formData.get("role")) as MemberRole;
    if (!ASSIGNABLE_ROLES.includes(role)) fail("That role can't be assigned here.");
    patch.role = role;
  }
  if (formData.has("team_id")) {
    patch.team_id = String(formData.get("team_id")) || null;
  }
  if (formData.has("status")) {
    const status = String(formData.get("status")) as MemberStatus;
    if (!STATUSES.includes(status)) fail("Unknown status.");
    patch.status = status;
  }
  if (formData.has("timezone")) {
    patch.timezone = String(formData.get("timezone")); // checked by the database
  }
  if (formData.has("job_title")) {
    const title = String(formData.get("job_title")).trim();
    if (title.length > 100) fail("Keep the job title under 100 characters.");
    patch.job_title = title || null;
  }
  if (formData.has("expected_hours_per_day")) {
    const hours = Number(formData.get("expected_hours_per_day"));
    if (!Number.isFinite(hours) || hours < 0 || hours > 24) fail("Expected hours must be between 0 and 24.");
    patch.expected_hours_per_day = String(hours);
  }

  const { data, error } = await supabase.from("memberships").update(patch).eq("id", id).select("id");
  if (error) fail(/time zone/i.test(error.message) ? "Pick a valid time zone." : error.message);
  if (!data?.length) fail("You don't have permission to change this member.");
  revalidatePath(PATH);
}

export async function createTeam(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Enter a team name." };
  const { error } = await supabase.from("teams").insert({ name });
  if (error) {
    return { error: error.code === "23505" ? "A team with that name already exists." : error.message };
  }
  revalidatePath(PATH);
  return { success: `Team "${name}" created.` };
}

export async function deleteTeam(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const { error } = await supabase.from("teams").delete().eq("id", id);
  if (error) fail(error.message);
  revalidatePath(PATH);
}

/** Who manages a team: they see the team's time, activity and reports. */
export async function setTeamManager(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("team_id") ?? "");
  const managerId = String(formData.get("manager_id") ?? "") || null;
  const { data, error } = await supabase.from("teams").update({ manager_id: managerId }).eq("id", id).select("id");
  if (error) fail(error.message);
  if (!data?.length) fail("You don't have permission to change this team.");
  revalidatePath(PATH);
}

/** The owner hands the company to another member and becomes an admin. */
export async function transferOwnership(formData: FormData) {
  const { supabase, member } = await requireAdmin();
  if (member.role !== "owner") fail("Only the owner can transfer ownership.");
  const newOwner = String(formData.get("user_id") ?? "");
  if (!newOwner) fail("Pick the new owner.");
  const { error } = await supabase.rpc("transfer_ownership", { p_new_owner: newOwner });
  if (error) fail(error.message);
  revalidatePath("/dashboard", "layout");
  redirect(`${PATH}?transferred=1`);
}
