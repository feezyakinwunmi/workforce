import type { Metadata } from "next";
import { requireAdmin } from "@/lib/session";
import { SettingsForm } from "./form";

export const metadata: Metadata = { title: "Company settings" };

export default async function SettingsPage() {
  const { org } = await requireAdmin();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Company settings</h1>
        <p className="mt-1 text-slate-600">Workspace address: <code className="text-sm">{org.slug}</code></p>
      </header>
      <SettingsForm org={org} />
    </div>
  );
}
