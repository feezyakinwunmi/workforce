import Link from "next/link";
import { Icon } from "@/components/icons";
import { formsRequestBase } from "@/lib/forms/server";
import { naira, type FormSettings } from "@/lib/forms/schema";
import { paystackConfigured, recordSuccess, verifyTransaction } from "@/lib/paystack";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Payment" };

/** Paystack sends the payer back here after paying for a form. */
export default async function FormPayCallback({ searchParams }: { searchParams: Promise<{ reference?: string; trxref?: string }> }) {
  const sp = await searchParams;
  const base = await formsRequestBase();
  const reference = sp.reference ?? sp.trxref ?? "";
  let ok = false;
  let info: { title: string; slug: string; settings: FormSettings; amount: number } | null = null;
  if (paystackConfigured() && /^form_[0-9a-f]{32}$/.test(reference)) {
    const tx = await verifyTransaction(reference);
    if (tx) ok = (await recordSuccess(tx)).ok;
    const { data } = await createAdminClient()
      .from("form_responses")
      .select("amount_kobo, form:forms(title, slug, settings)")
      .eq("pay_reference", reference)
      .maybeSingle();
    const row = data as { amount_kobo: number; form: { title: string; slug: string; settings: FormSettings } | null } | null;
    if (row?.form) info = { ...row.form, amount: row.amount_kobo };
  }
  const accent = info?.settings.color || "#6a4cf5";
  return (
    <div className="min-h-dvh bg-canvas px-3 py-14 sm:px-4">
      <div className="card mx-auto max-w-lg px-6 py-12 text-center shadow-sm" style={{ borderTop: `4px solid ${accent}` }}>
        {ok ? (
          <>
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-white" style={{ background: accent }}>
              <Icon name="check" className="h-7 w-7" />
            </span>
            <h1 className="mt-5 font-display text-2xl font-bold text-slate-900">Payment received</h1>
            {info && <p className="mt-1 text-sm text-slate-500">{naira(info.amount)} · {info.title}</p>}
            <p className="mx-auto mt-3 max-w-md whitespace-pre-wrap text-slate-600">
              {info?.settings.success_message || "Thank you! Your answers and payment were received. Paystack has emailed you a receipt."}
            </p>
            {info?.settings.redirect_url && (
              <a href={info.settings.redirect_url} className="mt-6 inline-flex font-medium underline underline-offset-4" style={{ color: accent }}>Continue</a>
            )}
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl font-bold text-slate-900">We couldn&apos;t confirm the payment yet</h1>
            <p className="mx-auto mt-3 max-w-md text-slate-600">
              If money left your account, it will show up within a few minutes and the form&apos;s owner will see it. Otherwise, please try again.
            </p>
            {info && (
              <Link href={`${base}/f/${info.slug}`} className="btn-primary mt-6">Back to the form</Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}
