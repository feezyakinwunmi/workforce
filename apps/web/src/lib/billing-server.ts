import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { FREE_SEATS, SEAT_PRICE_NAIRA, type Billing } from "@/lib/billing";

// Server only (uses cookies). Plan constants and helpers that client components may
// import live in lib/billing.ts.

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

