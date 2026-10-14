import { NextResponse, type NextRequest } from "next/server";
import { recordSuccess, validSignature, verifyTransaction } from "@/lib/paystack";

/**
 * Paystack webhook (set it in Paystack: Settings -> API Keys & Webhooks -> Webhook URL
 * = https://<your dashboard>/api/paystack/webhook). Catches payments where the payer
 * closed the page before coming back, e.g. slow bank transfers.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get("x-paystack-signature"))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  let event: { event?: string; data?: { reference?: string } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  if (event.event === "charge.success" && event.data?.reference) {
    // Ask Paystack again rather than trusting the body alone.
    const tx = await verifyTransaction(event.data.reference);
    if (tx) await recordSuccess(tx);
  }
  return NextResponse.json({ received: true });
}
