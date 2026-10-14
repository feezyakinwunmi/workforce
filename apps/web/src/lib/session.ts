import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole, type Membership, type Organization, type Profile } from "@/lib/types";

/**
 * Who is signed in, and which company they belong to.
 * Cached per request, so layouts and pages can both call it for free.
 */
export const getSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, user: null, profile: null, member: null, org: null };

  const [{ data: profile }, { data: member }] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, avatar_url").eq("id", user.id).maybeSingle(),
    supabase
      .from("memberships")
      .select("*")
      .eq("user_id", user.id)
      .neq("status", "removed")
      .maybeSingle(),
  ]);

  let org: Organization | null = null;
  if (member?.status === "active") {
    const { data } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", member.organization_id)
      .single();
    org = data as Organization | null;
  }

  return {
    supabase,
    user,
    profile: profile as Profile | null,
    member: member as Membership | null,
    org,
  };
});

/** For pages inside the dashboard: signed in AND an active member of a company. */
export async function requireMember() {
  const session = await getSession();
  if (!session.user) redirect("/login");
  if (!session.member) redirect("/onboarding");
  if (session.member.status !== "active" || !session.org) redirect("/suspended");
  return {
    ...session,
    user: session.user,
    member: session.member,
    org: session.org,
  };
}

/** For admin-only pages and actions (owner or admin). */
export async function requireAdmin() {
  const session = await requireMember();
  if (!isAdminRole(session.member.role)) redirect("/dashboard");
  return session;
}
