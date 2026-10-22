"use server";

import { after } from "next/server";
import type { SubmitResult } from "@/app/forms/form-view";
import { notifyMaker } from "@/lib/forms/mail";
import { checkAnswers, type PublicForm } from "@/lib/forms/schema";
import { formsOrigin, formsRequestBase, visitorIp } from "@/lib/forms/server";
import { initializeTransaction, paystackConfigured } from "@/lib/paystack";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkHuman } from "@/lib/turnstile";

type Submitted = { id: string; status: string; reference: string | null; amount_kobo: number; fee_kobo: number; subaccount: string | null; email: string | null };

/**
 * Someone sends a form. Order: human check → the form as it is now → our own check of every
 * answer and of the amount → stored by the database (service role only) → Paystack if it costs
 * money. Nothing the browser says about prices is trusted.
 */
export async function submitForm(slug: string, raw: Record<string, unknown>, captcha: string | null, page: string): Promise<SubmitResult> {
  if (typeof slug !== "string" || !/^[a-z0-9]{8}$/.test(slug) || !raw || typeof raw !== "object") return { error: "This form doesn't exist." };
  const human = await checkHuman(captcha ?? "");
  if (human) return { error: human };

  const admin = createAdminClient();
  const { data: f } = await admin.rpc("form_public", { p_slug: slug });
  const form = f as PublicForm | null;
  if (!form) return { error: "This form doesn't exist or was taken down." };
  if (!form.accepting) return { error: "This form isn't taking answers any more." };

  const { answers, email, amount, errors } = checkAnswers(form, raw);
  if (Object.keys(errors).length) return { errors };

  const { data, error } = await admin.rpc("form_submit", {
    p_slug: slug,
    p_answers: answers,
    p_email: email,
    p_amount_kobo: amount,
    p_page: typeof page === "string" ? page.slice(0, 300) : "",
    p_ip: await visitorIp(),
  });
  if (error) return { error: error.message };
  const r = data as Submitted;
  const [origin, base] = await Promise.all([formsOrigin(), formsRequestBase()]);

  if (r.status === "received") {
    after(() => notifyMaker(r.id, origin, base));
    return { done: { message: form.settings.success_message || "Thanks! Your answers were sent.", redirect: form.settings.redirect_url } };
  }
  if (!paystackConfigured() || !r.reference || !r.subaccount || !r.email) {
    return { error: "Payments aren't available right now. Please try again later." };
  }
  try {
    const url = await initializeTransaction({
      email: r.email,
      amountKobo: r.amount_kobo,
      reference: r.reference,
      callbackUrl: `${origin}${base}/pay/callback`,
      metadata: { product: "workbase-forms", form: slug, custom_fields: [{ display_name: "Form", variable_name: "form", value: form.title.slice(0, 100) }] },
      subaccount: r.subaccount,
      transactionCharge: r.fee_kobo,
    });
    return { pay: { url, amount: r.amount_kobo } };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't start the payment." };
  }
}
