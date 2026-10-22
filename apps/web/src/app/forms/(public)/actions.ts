"use server";

import { after } from "next/server";
import type { SubmitResult } from "@/app/forms/form-view";
import { syncAnswer } from "@/lib/forms/google";
import { notifyMaker } from "@/lib/forms/mail";
import { checkAnswers, fileTypesFor, filesIn, MAX_FILE_BYTES, safeFileName, type PublicForm } from "@/lib/forms/schema";
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

  const { answers, email, amount, errors } = checkAnswers(form, raw, { formId: form.id });
  if (Object.keys(errors).length) return { errors };

  // The database checks each file was uploaded for this form, is in Storage and isn't reused.
  const { data, error } = await admin.rpc("form_submit", {
    p_slug: slug,
    p_answers: answers,
    p_email: email,
    p_amount_kobo: amount,
    p_page: typeof page === "string" ? page.slice(0, 300) : "",
    p_ip: await visitorIp(),
    p_files: filesIn(answers).map((f) => f.path),
  });
  if (error) return { error: error.message };
  const r = data as Submitted;
  const [origin, base] = await Promise.all([formsOrigin(), formsRequestBase()]);

  // Private link to change the answer later (only when the form allows it).
  let editUrl: string | undefined;
  if (form.settings.allow_edit) {
    const { data: token } = await admin.rpc("form_issue_edit_token", { p_response: r.id });
    if (token) editUrl = `${origin}${base}/f/${slug}?edit=${token}`;
  }

  if (r.status === "received") {
    after(async () => {
      await notifyMaker(r.id, origin, base);
      await syncAnswer(r.id);
    });
    return { done: { message: form.settings.success_message || "Thanks! Your answers were sent.", redirect: form.settings.redirect_url, editUrl } };
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

/**
 * A one-time upload link for a file question. Visitors have no account, so the file goes
 * straight to private Storage through a signed link that only works for this one path.
 */
export async function startUpload(slug: string, fieldId: string, file: { name: string; size: number; type: string }):
  Promise<{ path?: string; token?: string; error?: string }> {
  if (typeof slug !== "string" || !/^[a-z0-9]{8}$/.test(slug) || typeof fieldId !== "string" || !file) return { error: "This form doesn't exist." };
  const admin = createAdminClient();
  const { data: f } = await admin.rpc("form_public", { p_slug: slug });
  const form = f as PublicForm | null;
  const field = form?.fields.find((x) => x.id === fieldId && x.type === "file");
  if (!form || !field) return { error: "This question doesn't take files." };
  if (!(file.size > 0 && file.size <= MAX_FILE_BYTES)) return { error: "Files can be up to 10 MB." };
  if (!fileTypesFor(field.accept).includes(String(file.type))) return { error: "This kind of file isn't allowed here." };
  const path = `${form.id}/${crypto.randomUUID()}/${safeFileName(String(file.name))}`;
  const { error } = await admin.rpc("form_upload_start", { p_slug: slug, p_field: fieldId, p_path: path, p_ip: await visitorIp(), p_size: file.size });
  if (error) return { error: error.message };
  const { data, error: e2 } = await admin.storage.from("form-files").createSignedUploadUrl(path);
  if (e2 || !data) return { error: "Couldn't start the upload. Try again." };
  return { path: data.path, token: data.token };
}

/** Save changes made through an answer's private edit link (same checks as a new answer). */
export async function updateAnswer(slug: string, token: string, raw: Record<string, unknown>, captcha: string | null): Promise<SubmitResult> {
  if (typeof slug !== "string" || !/^[a-z0-9]{8}$/.test(slug) || typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token) || !raw || typeof raw !== "object") {
    return { error: "This edit link isn't valid." };
  }
  const human = await checkHuman(captcha ?? "");
  if (human) return { error: human };
  const admin = createAdminClient();
  const { data: f } = await admin.rpc("form_public", { p_slug: slug });
  const form = f as PublicForm | null;
  if (!form || !form.settings.allow_edit) return { error: "This answer can't be changed any more." };
  const { answers, email, amount, errors } = checkAnswers(form, raw, { formId: form.id });
  if (Object.keys(errors).length) return { errors };
  const { data: id, error } = await admin.rpc("form_update_response", {
    p_slug: slug,
    p_token: token,
    p_answers: answers,
    p_email: email,
    p_amount_kobo: amount,
    p_files: filesIn(answers).map((x) => x.path),
    p_ip: await visitorIp(),
  });
  if (error) return { error: error.message };
  after(() => syncAnswer(id as string));
  const [origin, base] = await Promise.all([formsOrigin(), formsRequestBase()]);
  return { done: { message: "Your changes were saved.", editUrl: `${origin}${base}/f/${slug}?edit=${token}` } };
}
