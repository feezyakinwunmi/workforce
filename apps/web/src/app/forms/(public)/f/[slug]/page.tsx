import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { PublicForm } from "@/lib/forms/schema";
import { formsLinkFor } from "@/lib/forms/server";
import { createClient } from "@/lib/supabase/server";
import { LiveForm } from "./live-form";

type Params = Promise<{ slug: string }>;
type SP = Promise<{ embed?: string; theme?: string; paid?: string }>;

const load = cache(async (slug: string) => {
  if (!/^[a-z0-9]{8}$/.test(slug)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("form_public", { p_slug: slug });
  return (data as PublicForm | null) ?? null;
});

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const form = await load((await params).slug);
  if (!form) return { title: "Form not found" };
  return { title: { absolute: form.title }, description: form.description.slice(0, 160) || undefined };
}

export default async function PublicFormPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const form = await load(slug);
  if (!form) notFound();
  const embed = sp.embed === "1";
  const homeUrl = await formsLinkFor("");

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
          <LiveForm form={form} embed homeUrl={homeUrl} />
        </div>
      </>
    );
  }

  return (
    <div className="min-h-dvh bg-canvas px-3 py-8 sm:px-4 sm:py-14">
      <div className="mx-auto max-w-2xl">
        <LiveForm form={form} embed={false} homeUrl={homeUrl} />
      </div>
    </div>
  );
}
