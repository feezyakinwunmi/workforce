import { NextResponse, type NextRequest } from "next/server";
import { recordSuccess, verifyTransaction } from "@/lib/paystack";

/** Paystack sends the payer back here. We ask Paystack directly whether it was paid. */
export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get("reference") ?? request.nextUrl.searchParams.get("trxref");
  const back = new URL("/dashboard/billing", request.url);
  if (!reference) return NextResponse.redirect(back);

  try {
    const tx = await verifyTransaction(reference);
    if (!tx) {
      back.searchParams.set("payment", "pending");
    } else if (tx.status === "success") {
      const result = await recordSuccess(tx);
      back.searchParams.set("payment", result.ok ? "success" : "problem");
      // For the ad "Purchase" event on the billing page: amount in naira + reference (counted once).
      if (result.ok) {
        back.searchParams.set("paid", String(Math.round(tx.amount / 100)));
        back.searchParams.set("ref", tx.reference);
      }
    } else {
      back.searchParams.set("payment", tx.status === "abandoned" ? "cancelled" : "failed");
    }
  } catch {
    back.searchParams.set("payment", "pending");
  }
  return NextResponse.redirect(back);
}
