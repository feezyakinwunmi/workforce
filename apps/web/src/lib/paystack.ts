import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/** Paystack (server only). Secret key in the Vercel env var PAYSTACK_SECRET_KEY. */
const API = "https://api.paystack.co";

function secret() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("Payments are not set up yet (PAYSTACK_SECRET_KEY is missing).");
  return key;
}

export const paystackConfigured = () => Boolean(process.env.PAYSTACK_SECRET_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);

type Transaction = {
  status: string;
  reference: string;
  amount: number;
  currency: string;
  id: number;
  channel?: string;
  paid_at?: string | null;
};

/** Start a checkout; returns the Paystack page to send the payer to. */
export async function initializeTransaction(input: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}) {
  const res = await fetch(`${API}/transaction/initialize`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: input.email,
      amount: input.amountKobo,
      currency: "NGN",
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata,
    }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: { authorization_url: string } } | null;
  if (!res.ok || !json?.status || !json.data?.authorization_url) {
    throw new Error(json?.message || "Paystack did not accept the payment request.");
  }
  return json.data.authorization_url;
}

export async function verifyTransaction(reference: string): Promise<Transaction | null> {
  const res = await fetch(`${API}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret()}` },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as { status?: boolean; data?: Transaction } | null;
  return res.ok && json?.status && json.data ? json.data : null;
}

/** Webhook check: Paystack signs the raw body with HMAC-SHA512 using the secret key. */
export function validSignature(rawBody: string, signature: string | null) {
  if (!signature) return false;
  const expected = createHmac("sha512", secret()).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Record a successful Paystack transaction (safe to call more than once). */
export async function recordSuccess(tx: Transaction) {
  if (tx.status !== "success") return { ok: false, error: `payment ${tx.status}` };
  const admin = createAdminClient();
  // Workbase Meet plans (references start with "meet_").
  if (tx.reference.startsWith("meet_")) {
    if (tx.currency !== "NGN") return { ok: false, error: "unexpected currency" };
    const { data, error } = await admin.rpc("meet_confirm_payment", { p_reference: tx.reference, p_amount_kobo: tx.amount });
    if (error) return { ok: false, error: error.message };
    return data ? { ok: true } : { ok: false, error: "amount or reference didn't match" };
  }
  const { data, error } = await admin.rpc("confirm_payment", {
    p_reference: tx.reference,
    p_amount_kobo: tx.amount,
    p_currency: tx.currency,
    p_paystack_id: String(tx.id),
    p_channel: tx.channel ?? null,
    p_paid_at: tx.paid_at ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return data as { ok: boolean; error?: string };
}
