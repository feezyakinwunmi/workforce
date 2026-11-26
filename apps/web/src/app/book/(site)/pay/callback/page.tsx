import { redirect } from "next/navigation";
import { bookRequestBase } from "@/lib/book/server";
import { paystackConfigured, recordSuccess, verifyTransaction } from "@/lib/paystack";

/** Paystack sends the payer back here (bookings and Book Pro). */
export default async function BookPayCallback({ searchParams }: { searchParams: Promise<{ reference?: string; trxref?: string; t?: string }> }) {
  const sp = await searchParams;
  const base = await bookRequestBase();
  const reference = sp.reference ?? sp.trxref ?? "";
  let ok = false;
  let naira = 0; // for the ad "Purchase" event on the settings page
  if (paystackConfigured() && /^(book|bookpro)_[0-9a-f]{32}$/.test(reference)) {
    const tx = await verifyTransaction(reference);
    if (tx) ok = (await recordSuccess(tx)).ok;
    if (tx && ok) naira = Math.round(tx.amount / 100);
  }
  if (reference.startsWith("bookpro_")) redirect(`${base}/settings?${ok ? `paid=${naira || 1}&ref=${reference}` : "payment=failed"}#plan`);
  if (sp.t && /^[0-9a-f]{64}$/.test(sp.t)) redirect(`${base}/b/${sp.t}${ok ? "?paid=1" : ""}`);
  redirect(base || "/");
}
