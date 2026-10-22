import { formsRequestBase, myForm, myPayout } from "@/lib/forms/server";
import { Builder } from "./builder";

export const metadata = { title: "Build" };

export default async function BuildPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ supabase, form }, base] = await Promise.all([myForm(id), formsRequestBase()]);
  const payout = await myPayout(supabase);
  return (
    <div className="pt-4">
      <Builder
        id={form.id}
        initial={{ title: form.title, description: form.description, fields: form.fields, settings: form.settings }}
        hasPayout={Boolean(payout)}
        payoutsHref={`${base}/payouts`}
      />
    </div>
  );
}
