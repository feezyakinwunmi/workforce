import { requireAdmin } from "@/lib/admin/server";
import { AdminNav } from "../nav";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { base, db } = await requireAdmin();
  // New feedback count for the tab's badge (one cheap query; 0 if the migration isn't there yet).
  const { count } = await db.from("feedback").select("id", { count: "exact", head: true }).eq("status", "new");
  return (
    <>
      <div className="border-b border-slate-200 bg-surface/80">
        <AdminNav base={base} newFeedback={count ?? 0} />
      </div>
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </>
  );
}
