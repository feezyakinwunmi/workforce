import type { SupabaseClient } from "@supabase/supabase-js";

/** Checks a new password and its confirmation, then saves it for the signed-in user. Returns an error message or null. */
export async function setNewPassword(
  supabase: SupabaseClient,
  password: string,
  confirm: string,
): Promise<string | null> {
  if (password.length < 8) return "Use a password of at least 8 characters.";
  if (password !== confirm) return "The two passwords don't match.";

  const { error } = await supabase.auth.updateUser({ password });
  if (!error) return null;
  if (error.code === "same_password") return "Choose a password different from your current one.";
  if (error.code === "weak_password") return "That password is too weak. Try a longer one.";
  if (error.code === "reauthentication_needed") return "For security, log out and log in again, then change your password.";
  return error.message;
}
