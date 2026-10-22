"use client";

import { FormView } from "@/app/forms/form-view";
import type { PublicForm } from "@/lib/forms/schema";
import { submitForm } from "../../actions";

export function LiveForm({ form, embed, homeUrl }: { form: PublicForm; embed: boolean; homeUrl: string }) {
  return (
    <FormView
      form={form}
      mode="live"
      embed={embed}
      payments={form.payments}
      accepting={form.accepting}
      pro={form.pro}
      homeUrl={homeUrl}
      onSubmit={(raw, captcha) => submitForm(form.slug, raw, captcha, embed ? document.referrer : "")}
    />
  );
}
