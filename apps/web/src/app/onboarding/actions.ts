"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/types";

export async function createOrganization(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  const country = String(formData.get("country") ?? "NG");
  const timezone = String(formData.get("timezone") ?? "Africa/Lagos");

  if (name.length < 2) return { error: "Enter your company name." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_organization", {
    p_name: name,
    p_country_code: country,
    p_timezone: timezone,
  });
  if (error) return { error: error.message };

  redirect("/dashboard/team?welcome=1");
}

export async function acceptInvitation(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) return { error: error.message };
  redirect("/dashboard");
}
