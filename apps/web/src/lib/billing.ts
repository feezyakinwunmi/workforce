import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Plans. The database (migration 0008) decides who is on which plan and sets every price;
 * the numbers here are only for display and must match it.
 */
export type Tier = "free" | "trial" | "standard";

export type Billing = {
  tier: Tier;
  seat_limit: number | null; // null = no limit (trial)
  paid_seats: number;
  paid_until: string | null;
  trial_ends_at: string;
  active_members: number;
  can_track: boolean;
  tracked_member_ids: string[];
  seat_price_kobo: number;
  free_seats: number;
};

export const SEAT_PRICE_NAIRA = 2500;
export const FREE_SEATS = 3;
export const FREE_HISTORY_DAYS = 30;
export const MONTH_OPTIONS = [
  { months: 1, label: "1 month", billable: 1 },
  { months: 3, label: "3 months", billable: 3 },
  { months: 12, label: "12 months (2 months free)", billable: 10 },
] as const;

export const TIER_LABEL: Record<Tier, string> = {
  free: "Free",
  trial: "Standard trial",
  standard: "Standard",
};

/** Standard features: window titles, full-day timeline, unlimited history, CSV export. */
export const hasStandard = (b: Pick<Billing, "tier">) => b.tier !== "free";

export function naira(kobo: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(kobo / 100);
}

export function daysLeft(iso: string | null) {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000));
}

/** The current company's plan (cached per request). */
export const getBilling = cache(async (): Promise<Billing> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_billing");
  if (error || !data) {
    // Never lock people out because of a billing hiccup: fall back to the trial view.
    return {
      tier: "trial", seat_limit: null, paid_seats: 0, paid_until: null, trial_ends_at: new Date().toISOString(),
      active_members: 0, can_track: true, tracked_member_ids: [], seat_price_kobo: SEAT_PRICE_NAIRA * 100, free_seats: FREE_SEATS,
    };
  }
  return data as Billing;
});

/** Oldest date a Free company may look at (YYYY-MM-DD), or null when history is unlimited. */
export function historyLimit(b: Billing, today: string) {
  if (hasStandard(b)) return null;
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (FREE_HISTORY_DAYS - 1));
  return d.toISOString().slice(0, 10);
}
