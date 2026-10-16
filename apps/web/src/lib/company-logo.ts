// Company logos: public pictures in the "company-logos" bucket (owner/admins upload; see migration 0040).

/** Public address of a company's logo, or null when it has none. */
export function companyLogoUrl(path: string | null | undefined) {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/company-logos/${path}`;
}

export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const LOGO_MAX_BYTES = 1024 * 1024;
