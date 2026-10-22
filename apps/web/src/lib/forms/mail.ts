// Server only: tell a form's maker about a new answer (once per answer).
import { sendEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { formsLink } from "./paths";
import { AMOUNT_KEY, answerText, naira, type Answers, type Field, type FormSettings } from "./schema";

export async function notifyMaker(responseId: string, origin?: string, base?: string) {
  try {
    const admin = createAdminClient();
    const { data: claimed } = await admin.rpc("form_claim_notify", { p_response: responseId });
    if (!claimed) return;
    const { data: r } = await admin
      .from("form_responses")
      .select("answers, amount_kobo, status, owner_id, form:forms(id, title, fields, settings)")
      .eq("id", responseId)
      .maybeSingle();
    const row = r as {
      answers: Answers;
      amount_kobo: number;
      status: string;
      owner_id: string;
      form: { id: string; title: string; fields: Field[]; settings: FormSettings } | null;
    } | null;
    if (!row?.form || row.form.settings.notify === false) return;
    const { data: owner } = await admin.from("profiles").select("email").eq("id", row.owner_id).maybeSingle();
    const email = (owner as { email: string } | null)?.email;
    if (!email) return;
    const lines = row.form.fields
      .filter((f) => f.type !== "heading" && row.answers[f.id] !== undefined)
      .slice(0, 30)
      .map((f) => `${f.label}: ${answerText(row.answers[f.id], f.type).slice(0, 300)}`);
    if (row.answers[AMOUNT_KEY]) lines.push(`Amount chosen: ${naira(Number(row.answers[AMOUNT_KEY]))}`);
    if (row.amount_kobo) lines.push(`Paid: ${naira(row.amount_kobo)}`);
    await sendEmail([email], {
      subject: `New answer: ${row.form.title}`,
      heading: `New answer to "${row.form.title}"`,
      text: lines.join("\n"),
      link: "",
      button: "See all answers",
      url: formsLink(`/build/${row.form.id}/responses`, origin, base),
      footer: "Sent by Workbase Forms because you made this form. Turn these emails off in the form's settings.",
    });
  } catch (e) {
    console.error("Form notification failed:", e instanceof Error ? e.message : e);
  }
}
