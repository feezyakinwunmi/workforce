"use server";

import { after } from "next/server";
import { processBookMail } from "@/lib/book/mail";
import { bookOrigin, bookRequestBase } from "@/lib/book/server";
import { initializeTransaction, paystackConfigured } from "@/lib/paystack";
import { createClient } from "@/lib/supabase/server";

type Created = { token: string; status: string; reference: string | null; pay_now_kobo: number; fee_kobo: number; subaccount: string | null; email: string };

/** Book a time. Returns where to go next: Paystack, or the booking's own page. */
export async function createBooking(input: {
  handle: string;
  serviceId: string;
  startsAt: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
}): Promise<{ error?: string; redirect?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("book_create", {
    p_handle: input.handle,
    p_service: input.serviceId,
    p_starts_at: input.startsAt,
    p_name: input.name,
    p_email: input.email,
    p_phone: input.phone,
    p_notes: input.notes,
  });
  if (error) return { error: error.message };
  const b = data as Created;
  const base = await bookRequestBase();
  if (b.status === "confirmed") {
    after(() => processBookMail());
    return { redirect: `${base}/b/${b.token}?new=1` };
  }
  if (!paystackConfigured() || !b.reference || !b.subaccount) {
    return { error: "Payments aren't available right now. Please try again later." };
  }
  try {
    const origin = await bookOrigin();
    const url = await initializeTransaction({
      email: b.email,
      amountKobo: b.pay_now_kobo,
      reference: b.reference,
      callbackUrl: `${origin}${base}/pay/callback?t=${b.token}`,
      metadata: { product: "workbase-book", handle: input.handle },
      subaccount: b.subaccount,
      transactionCharge: b.fee_kobo,
    });
    return { redirect: url };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't start the payment." };
  }
}

/** The customer cancels with their private link. */
export async function cancelBooking(token: string, reason: string): Promise<{ error?: string; ok?: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("book_cancel", { p_token: token, p_reason: reason.slice(0, 300) });
  if (error) return { error: error.message };
  if (!data) return { error: "This booking can't be cancelled any more." };
  after(() => processBookMail());
  return { ok: true };
}
