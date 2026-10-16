// Server only: save or remove a company's logo with the signed-in admin's own login (RLS + storage
// policies decide; nothing here uses the service-role key).
import type { SupabaseClient } from "@supabase/supabase-js";
import { LOGO_MAX_BYTES, LOGO_TYPES } from "./company-logo";

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** Uploads the file as the company's logo and removes the old one. Returns an error message or null. */
export async function saveCompanyLogo(supabase: SupabaseClient, orgId: string, file: File, oldPath?: string | null): Promise<string | null> {
  if (!LOGO_TYPES.includes(file.type as (typeof LOGO_TYPES)[number])) return "Use a PNG, JPG or WebP picture.";
  if (file.size > LOGO_MAX_BYTES) return "That picture is too big. Use one under 1 MB.";
  const path = `${orgId}/${crypto.randomUUID()}.${EXT[file.type]}`;
  const { error: upErr } = await supabase.storage.from("company-logos").upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
  if (upErr) return /row-level security|unauthori[sz]ed|403/i.test(upErr.message) ? "Only the owner or an admin can change the logo." : upErr.message;
  const { data, error } = await supabase.from("organizations").update({ logo_path: path }).eq("id", orgId).select("id");
  if (error || !data?.length) {
    await supabase.storage.from("company-logos").remove([path]);
    return error?.message ?? "Only the owner or an admin can change the logo.";
  }
  if (oldPath && oldPath !== path) await supabase.storage.from("company-logos").remove([oldPath]);
  return null;
}

/** Removes the company's logo. Returns an error message or null. */
export async function removeCompanyLogo(supabase: SupabaseClient, orgId: string, oldPath: string | null | undefined): Promise<string | null> {
  const { data, error } = await supabase.from("organizations").update({ logo_path: null }).eq("id", orgId).select("id");
  if (error || !data?.length) return error?.message ?? "Only the owner or an admin can change the logo.";
  if (oldPath) await supabase.storage.from("company-logos").remove([oldPath]);
  return null;
}
