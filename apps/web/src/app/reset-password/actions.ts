"use server";

import { redirect } from "next/navigation";
import { setNewPassword } from "@/lib/password";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/types";

export async function resetPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your reset link has expired. Request a new one." };

  const error = await setNewPassword(
    supabase,
    String(formData.get("password") ?? ""),
    String(formData.get("confirm") ?? ""),
  );
  if (error) return { error };

  redirect("/dashboard?password=updated");
}
