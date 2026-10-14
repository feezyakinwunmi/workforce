"use server";

import { redirect } from "next/navigation";
import { initializeTransaction, paystackConfigured } from "@/lib/paystack";
import { requireAdmin } from "@/lib/session";
import type { FormState } from "@/lib/types";
import { siteUrl } from "@/lib/utils";

/** Price the order in the database, then send the payer to Paystack. */
export async function startCheckout(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, org } = await requireAdmin();
  if (!paystackConfigured()) return { error: "Online payment isn't switched on yet. Please try again later." };

  const kind = formData.get("kind") === "add_seats" ? "add_seats" : "renew";
  const seats = Math.floor(Number(formData.get("seats")));
  const months = Math.floor(Number(formData.get("months") ?? 1));
  if (!Number.isFinite(seats) || seats < 1) return { error: "Enter how many people to pay for." };

  const { data, error } = await supabase.rpc("start_payment", { p_kind: kind, p_seats: seats, p_months: months });
  if (error || !data) return { error: error?.message ?? "Could not start the payment." };
  const order = data as { reference: string; amount_kobo: number; email: string };
  if (!order.email) return { error: "Your account has no email address." };

  let url: string;
  try {
    url = await initializeTransaction({
      email: order.email,
      amountKobo: order.amount_kobo,
      reference: order.reference,
      callbackUrl: `${siteUrl()}/dashboard/billing/callback`,
      metadata: { organization: org.name, kind, seats, months },
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Paystack is not reachable. Try again in a minute." };
  }
  redirect(url);
}
