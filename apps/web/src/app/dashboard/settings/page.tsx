import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { hasPro } from "@/lib/billing";
import { getBilling } from "@/lib/billing-server";
import { requireAdmin } from "@/lib/session";
import { CloseCompany } from "./close-company";
import { SettingsForm } from "./form";

export const metadata: Metadata = { title: "Company settings" };

export default async function SettingsPage() {
  const [{ org, member }, billing] = await Promise.all([requireAdmin(), getBilling()]);
  return (
    <div className="space-y-4">
      <PageHeader title="Company settings" meta={<>Workspace <span className="font-medium text-slate-700">{org.slug}</span></>} />
      <SettingsForm org={org} pro={hasPro(billing)} />
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
