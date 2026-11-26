/**
 * Bizz Padi: shared types and lists, safe for browser components (26 Nov 2026).
 * (server.ts re-exports these for server code.)
 */

/** Brand profile as stored in public.padi_brands. */
export type Brand = {
  id: string;
  name: string;
  industry: string;
  about: string;
  audience: string;
  location: string;
  tone: Tone;
  colors: { primary: string; accent: string };
  platforms: Platform[];
  contact: string;
  posts_per_week: number;
};

/** A post Padi wrote (public.padi_posts). */
export type PadiPost = {
  id: string;
  topic: string;
  captions: Partial<Record<Platform, string>>;
  hashtags: string[];
  flyer: Flyer;
  planned_for: string | null;
  status: "draft" | "approved" | "posted" | "skipped";
  created_at: string;
};

/** Text that goes on the flyer image (drawn in the browser, see app/padi/flyer.tsx). */
export type Flyer = { headline?: string; subline?: string; cta?: string; style?: FlyerStyle };

export type Platform = "instagram" | "facebook" | "linkedin" | "x" | "tiktok" | "whatsapp";
export type Tone = "friendly" | "professional" | "playful" | "naija" | "luxury" | "warm";
export type FlyerStyle = "bold" | "clean" | "promo" | "quote";

export const PLATFORMS: Array<{ key: Platform; label: string }> = [
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "x", label: "X (Twitter)" },
  { key: "tiktok", label: "TikTok" },
  { key: "whatsapp", label: "WhatsApp Status" },
];

export const TONES: Array<{ key: Tone; label: string; hint: string }> = [
  { key: "friendly", label: "Friendly", hint: "Warm and simple, like talking to a customer you know" },
  { key: "naija", label: "Naija vibes", hint: "Pidgin and Lagos slang where it fits, very relatable" },
  { key: "playful", label: "Playful", hint: "Jokes, memes, light and fun" },
  { key: "professional", label: "Professional", hint: "Clear and polished, for B2B and services" },
  { key: "luxury", label: "Premium", hint: "Short, elegant, confident" },
  { key: "warm", label: "Caring", hint: "Gentle and reassuring: health, church, education" },
];
