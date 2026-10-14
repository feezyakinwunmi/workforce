/**
 * Plans. The database (migration 0008) decides who is on which plan and sets every price;
 * the numbers here are only for display and must match it.
 */
export type Tier = "free" | "trial" | "standard" | "pro";
export type Plan = "standard" | "pro";

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
  pro_price_kobo?: number; // since migration 0018
  free_seats: number;
};

export const SEAT_PRICE_NAIRA = 2500;
export const PRO_PRICE_NAIRA = 4000;
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
  pro: "Pro",
};

/** Standard features: window titles, full-day timeline, unlimited history, CSV export. */
export const hasStandard = (b: Pick<Billing, "tier">) => b.tier !== "free";
/** Pro features: screenshots. */
export const hasPro = (b: Pick<Billing, "tier">) => b.tier === "pro";
/** A paid plan (Standard or Pro) covers today. */
export const isPaid = (b: Pick<Billing, "tier">) => b.tier === "standard" || b.tier === "pro";
export const proPriceKobo = (b: Pick<Billing, "pro_price_kobo">) => b.pro_price_kobo ?? PRO_PRICE_NAIRA * 100;

export function naira(kobo: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(kobo / 100);
}

export function daysLeft(iso: string | null) {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000));
}

/** Oldest date a Free company may look at (YYYY-MM-DD), or null when history is unlimited. */
export function historyLimit(b: Billing, today: string) {
  if (hasStandard(b)) return null;
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (FREE_HISTORY_DAYS - 1));
  return d.toISOString().slice(0, 10);
}

/** One-line description of a payment, used in the payments table and on receipts. */
export function paymentLabel(p: { kind: string; seats: number; months: number; plan?: string | null }) {
  const plan = p.plan === "pro" ? "Pro" : "Standard";
  const people = `${p.seats} ${p.seats === 1 ? "person" : "people"}`;
  if (p.kind === "add_seats") return `${p.seats} extra ${p.seats === 1 ? "person" : "people"} on ${plan} (rest of current period)`;
  if (p.kind === "upgrade") return `Upgrade to Pro · ${people} (rest of current period)`;
  return `${plan} plan · ${people} · ${p.months} ${p.months === 1 ? "month" : "months"}`;
}
