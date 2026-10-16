import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { hasPro } from "@/lib/billing";
import { getBilling } from "@/lib/billing-server";
import { requireAdmin } from "@/lib/session";
import { CloseCompany } from "./close-company";
import { SettingsForm } from "./form";
import { SupportAccess } from "./support-access";

export const metadata: Metadata = { title: "Company settings" };

export default async function SettingsPage() {
  const [{ org, member, supabase }, billing] = await Promise.all([requireAdmin(), getBilling()]);
  // Support access (RLS: this company's owner/admins only). Missing tables (migration not run yet) just hide the section.
  const [{ data: access, error: accessError }, { data: looks }] = await Promise.all([
    supabase.from("support_access").select("expires_at").maybeSingle(),
    supabase.from("support_views").select("viewer, created_at").order("created_at", { ascending: false }).limit(10),
  ]);
  const until = access && Date.parse(access.expires_at) > Date.now() ? (access.expires_at as string) : null;
  return (
    <div className="space-y-4">
      <PageHeader title="Company settings" meta={<>Workspace <span className="font-medium text-slate-700">{org.slug}</span></>} />
      <SettingsForm org={org} pro={hasPro(billing)} />
      {!accessError && (
        <section id="support" className="grid gap-4 border-t border-slate-200 py-8 md:grid-cols-[240px_minmax(0,1fr)] md:gap-10">
          <h2 className="section-title text-base">Support access</h2>
          <div className="card px-5 py-2">
            <SupportAccess until={until} looks={(looks as Array<{ viewer: string; created_at: string }> | null) ?? []} />
          </div>
        </section>
      )}
      {member.role === "owner" && !org.closing_at && (
        <section className="grid gap-4 border-t border-slate-200 py-8 md:grid-cols-[240px_minmax(0,1fr)] md:gap-10">
          <h2 className="section-title text-base text-red-700">Close the company</h2>
          <div className="card border-red-200 px-5 py-2">
            <CloseCompany name={org.name} />
          </div>
        </section>
      )}
    </div>
  );
}
