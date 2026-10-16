"use server";

import { redirect } from "next/navigation";
import { saveCompanyLogo } from "@/lib/company-logo-server";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/types";

export async function createOrganization(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  const country = String(formData.get("country") ?? "NG");
  const timezone = String(formData.get("timezone") ?? "Africa/Lagos");

  if (name.length < 2) return { error: "Enter your company name." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_organization", {
    p_name: name,
    p_country_code: country,
    p_timezone: timezone,
  });
  if (error) return { error: error.message };

  // Optional logo: a problem with the picture never stops the company being created (it can be added later in Company settings).
  const logo = formData.get("logo");
  const orgId = (data as { id?: string } | null)?.id;
  if (orgId && logo instanceof File && logo.size > 0) await saveCompanyLogo(supabase, orgId, logo);

  redirect("/dashboard/team?welcome=1");
}

export async function acceptInvitation(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) return { error: error.message };
  redirect("/dashboard");
}
