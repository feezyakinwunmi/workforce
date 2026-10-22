import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { Answers, PublicForm } from "@/lib/forms/schema";
import { createAdminClient } from "@/lib/supabase/admin";
import { formsLinkFor } from "@/lib/forms/server";
import { createClient } from "@/lib/supabase/server";
import { LiveForm } from "./live-form";

type Params = Promise<{ slug: string }>;
type SP = Promise<{ embed?: string; theme?: string; paid?: string; edit?: string }>;

const load = cache(async (slug: string) => {
  if (!/^[a-z0-9]{8}$/.test(slug)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("form_public", { p_slug: slug });
  return (data as PublicForm | null) ?? null;
});

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: SP }): Promise<Metadata> {
  const [form, sp] = await Promise.all([load((await params).slug), searchParams]);
  if (!form) return { title: "Form not found" };
  return {
    title: { absolute: form.title },
    description: form.description.slice(0, 160) || undefined,
    // Edit links are private: never indexed, never sent on to other sites.
    ...(sp.edit ? { robots: { index: false, follow: false }, referrer: "no-referrer" as const } : {}),
  };
}

export default async function PublicFormPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const form = await load(slug);
  if (!form) notFound();
  const embed = sp.embed === "1";
  const homeUrl = await formsLinkFor("");
  // Changing an earlier answer through its private link.
  let edit: { token: string; answers: Answers } | undefined;
  if (sp.edit) {
    const ok = /^[0-9a-f]{64}$/.test(sp.edit) && form.settings.allow_edit;
    const { data } = ok ? await createAdminClient().rpc("form_edit_get", { p_slug: slug, p_token: sp.edit }) : { data: null };
    if (!data) {
      return (
        <div className="min-h-dvh bg-canvas px-3 py-14 sm:px-4">
          <div className="card mx-auto max-w-lg px-6 py-12 text-center">
            <h1 className="font-display text-2xl font-bold text-slate-900">This edit link can&apos;t be used</h1>
            <p className="mt-2 text-slate-600">The form may be closed, or its owner stopped allowing changes. Contact them if you need to change your answer.</p>
          </div>
        </div>
      );
    }
    edit = { token: sp.edit, answers: (data as { answers: Answers }).answers };
  }

  if (embed) {
    // Embedded forms are light unless the website asks for dark (data-theme on the embed box).
    const theme = sp.theme === "dark" ? "dark" : sp.theme === "auto" ? "auto" : "light";
    const script =
      theme === "auto"
        ? `document.documentElement.classList.toggle("dark",matchMedia("(prefers-color-scheme: dark)").matches)`
        : `document.documentElement.classList.toggle("dark",${theme === "dark"})`;
    return (
      <>
        <script dangerouslySetInnerHTML={{ __html: script }} />
        <style>{`html,body{background:transparent!important}`}</style>
        <div className="p-1">
          <LiveForm form={form} embed homeUrl={homeUrl} edit={edit} />
        </div>
      </>
    );
  }

  return (
    <div className="min-h-dvh bg-canvas px-3 py-8 sm:px-4 sm:py-14">
      <div className="mx-auto max-w-2xl">
        <LiveForm form={form} embed={false} homeUrl={homeUrl} edit={edit} />
      </div>
    </div>
  );
}
