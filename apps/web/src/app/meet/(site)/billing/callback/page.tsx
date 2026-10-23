import { redirect } from "next/navigation";
import { recordSuccess, verifyTransaction } from "@/lib/paystack";
import { requestBase } from "@/lib/meet/server";

/** Paystack sends the payer back here; check the payment with Paystack, then record it. */
export default async function MeetPaymentCallback({ searchParams }: { searchParams: Promise<{ reference?: string; trxref?: string }> }) {
  const sp = await searchParams;
  const base = await requestBase();
  const reference = sp.reference ?? sp.trxref;
  if (!reference?.startsWith("meet_")) redirect(`${base}/pricing?error=${encodeURIComponent("We couldn't find that payment.")}`);
  const tx = await verifyTransaction(reference).catch(() => null);
  if (!tx || tx.status !== "success") redirect(`${base}/pricing?error=${encodeURIComponent("The payment didn't go through. You weren't charged, or Paystack will refund you.")}`);
  const page = reference.startsWith("meet_top_") ? "usage" : "pricing";
  const res = await recordSuccess(tx);
  if (!res.ok) redirect(`${base}/${page}?error=${encodeURIComponent("Payment received but not recorded yet. It will update in a few minutes.")}`);
  redirect(`${base}/${page}?paid=1`);
}
