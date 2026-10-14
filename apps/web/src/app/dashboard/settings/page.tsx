import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { hasPro } from "@/lib/billing";
import { getBilling } from "@/lib/billing-server";
import { requireAdmin } from "@/lib/session";
import { SettingsForm } from "./form";

export const metadata: Metadata = { title: "Company settings" };

export default async function SettingsPage() {
  const [{ org }, billing] = await Promise.all([requireAdmin(), getBilling()]);
  return (
    <div className="space-y-4">
      <PageHeader title="Company settings" meta={<>Workspace <span className="font-medium text-slate-700">{org.slug}</span></>} />
      <SettingsForm org={org} pro={hasPro(billing)} />
    </div>
  );
}
