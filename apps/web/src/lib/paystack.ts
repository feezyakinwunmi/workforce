import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/** Paystack (server only). Secret key in the Vercel env var PAYSTACK_SECRET_KEY. */
// PAYSTACK_BASE is only for local testing against a stand-in.
const API = process.env.PAYSTACK_BASE || "https://api.paystack.co";

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
  /** Split payment (Workbase Book): the host's subaccount gets the money minus `transactionCharge`. */
  subaccount?: string;
  transactionCharge?: number;
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
      ...(input.subaccount
        ? { subaccount: input.subaccount, transaction_charge: input.transactionCharge ?? 0, bearer: "subaccount" }
        : {}),
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

type Bank = { name: string; code: string };
let banksCache: { at: number; banks: Bank[] } | null = null;

/** Nigerian banks (for the host's payout account). Cached for a day. */
export async function listBanks(): Promise<Bank[]> {
  if (banksCache && Date.now() - banksCache.at < 86_400_000) return banksCache.banks;
  const res = await fetch(`${API}/bank?country=nigeria&currency=NGN&perPage=200`, {
    headers: { Authorization: `Bearer ${secret()}` },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as { status?: boolean; data?: Array<Bank & { active?: boolean; is_deleted?: boolean }> } | null;
  if (!res.ok || !json?.status || !json.data) throw new Error("Couldn't load the list of banks. Try again.");
  const banks = json.data
    .filter((b) => b.active !== false && !b.is_deleted)
    .map((b) => ({ name: b.name, code: b.code }))
    .sort((a, b) => a.name.localeCompare(b.name));
  banksCache = { at: Date.now(), banks };
  return banks;
}

/** The name on a bank account, or null if it doesn't exist. */
export async function resolveAccount(accountNumber: string, bankCode: string) {
  const res = await fetch(`${API}/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`, {
    headers: { Authorization: `Bearer ${secret()}` },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as { status?: boolean; data?: { account_name: string } } | null;
  return res.ok && json?.status && json.data?.account_name ? json.data.account_name : null;
}

/** A Paystack subaccount: payments for this host settle straight into their bank account. */
export async function createSubaccount(input: { businessName: string; bankCode: string; accountNumber: string }) {
  const attempt = async (percentage: number) => {
    const res = await fetch(`${API}/subaccount`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        business_name: input.businessName.slice(0, 100),
        bank_code: input.bankCode,
        settlement_bank: input.bankCode,
        account_number: input.accountNumber,
        // Workbase's fee is set per payment (transaction_charge), so the default split is 0.
        percentage_charge: percentage,
      }),
      cache: "no-store",
    });
    return { res, json: (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: { subaccount_code: string } } | null };
  };
  let { res, json } = await attempt(0);
  if ((!res.ok || !json?.status) && /percentage/i.test(json?.message ?? "")) ({ res, json } = await attempt(0.1));
  if (!res.ok || !json?.status || !json.data?.subaccount_code) throw new Error(json?.message || "Paystack didn't accept this bank account.");
  return json.data.subaccount_code;
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
  // Workbase Book: Pro plans ("bookpro_") and paid bookings ("book_").
  if (tx.reference.startsWith("bookpro_") || tx.reference.startsWith("book_")) {
    if (tx.currency !== "NGN") return { ok: false, error: "unexpected currency" };
    const fn = tx.reference.startsWith("bookpro_") ? "book_confirm_plan" : "book_confirm_payment";
    const { data, error } = await admin.rpc(fn, { p_reference: tx.reference, p_amount_kobo: tx.amount });
    if (error) return { ok: false, error: error.message };
    if (fn === "book_confirm_payment") {
      // Confirmation emails go out at once (the 5-minute job is only the safety net).
      const { processBookMail } = await import("@/lib/book/mail");
      await processBookMail().catch(() => undefined);
    }
    return data ? { ok: true } : { ok: false, error: "amount or reference didn't match" };
  }
  // Workbase Forms: paid answers ("form_").
  if (tx.reference.startsWith("form_")) {
    if (tx.currency !== "NGN") return { ok: false, error: "unexpected currency" };
    const { data, error } = await admin.rpc("form_confirm_payment", { p_reference: tx.reference, p_amount_kobo: tx.amount });
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "amount or reference didn't match" };
    const [{ notifyMaker }, { siteUrl }] = await Promise.all([import("@/lib/forms/mail"), import("@/lib/utils")]);
    await notifyMaker(data as string, siteUrl());
    return { ok: true, responseId: data as string };
  }
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
