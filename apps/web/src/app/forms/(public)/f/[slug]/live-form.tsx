"use client";

import { FormView, type Uploader } from "@/app/forms/form-view";
import type { PublicForm } from "@/lib/forms/schema";
import { createClient } from "@/lib/supabase/client";
import { startUpload, submitForm } from "../../actions";

export function LiveForm({ form, embed, homeUrl }: { form: PublicForm; embed: boolean; homeUrl: string }) {
  // Our server hands out a one-time link; the file then goes straight from the phone to Storage.
  const upload: Uploader = async (fieldId, file) => {
    const start = await startUpload(form.slug, fieldId, { name: file.name, size: file.size, type: file.type });
    if (start.error || !start.path || !start.token) return { error: start.error ?? "Couldn't start the upload." };
    const { error } = await createClient().storage.from("form-files").uploadToSignedUrl(start.path, start.token, file, { contentType: file.type });
    if (error) return { error: "Upload failed. Check your connection and try again." };
    return { file: { path: start.path, name: file.name, size: file.size, type: file.type } };
  };
  return (
    <FormView
      form={form}
      mode="live"
      embed={embed}
      payments={form.payments}
      accepting={form.accepting}
      pro={form.pro}
      homeUrl={homeUrl}
      upload={upload}
      onSubmit={(raw, captcha) => submitForm(form.slug, raw, captcha, embed ? document.referrer : "")}
    />
  );
}
