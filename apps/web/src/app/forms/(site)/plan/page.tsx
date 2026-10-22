import { Icon } from "@/components/icons";
import { SubmitButton } from "@/components/form";
import { Notice } from "@/components/ui";
import { naira } from "@/lib/forms/schema";
import { requireMaker } from "@/lib/forms/server";
import { payPro } from "../actions";

export const metadata = { title: "Plan" };

type Plan = { tier: "free" | "pro"; price_kobo: number; paid_until: string | null };

const gb = (b: number) => (b >= 1073741824 ? `${(b / 1073741824).toFixed(1)} GB` : `${Math.round(b / 1048576)} MB`);

const ROWS: Array<[string, string, string]> = [
  ["Forms and answers", "Unlimited", "Unlimited"],
  ["Payments with Paystack", "3% fee", "No fee"],
  ["Pages, conditions, edit after sending", "Yes", "Yes"],
  ["Put forms on your website", "Yes", "Yes"],
  ["Google Sheets sync", "—", "Yes"],
  ["File uploads stored", "500 MB", "10 GB"],
  ["“Made with Workbase Forms” badge", "Shown", "Removed"],
  ["Workbase Book (booking pages)", "3% fee", "No fee, own colour"],
];

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ paid?: string; payment?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireMaker();
  const [{ data: p }, { data: st }] = await Promise.all([supabase.rpc("book_my_plan"), supabase.rpc("form_my_storage")]);
  const plan = (p as Plan | null) ?? { tier: "free", price_kobo: 200000, paid_until: null };
  const storage = (st as { used: number; limit: number } | null) ?? { used: 0, limit: 524288000 };
  const pct = Math.min(100, Math.round((storage.used / storage.limit) * 100));
  const pro = plan.tier === "pro";

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      {sp.paid && <Notice tone="success">Payment received. You&apos;re on Pro.</Notice>}
      {sp.payment && <Notice tone="error">{sp.payment === "failed" ? "We couldn't confirm the payment. If money left your account, it will show here within a few minutes." : sp.payment}</Notice>}
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Your plan: {pro ? "Pro" : "Free"}</h1>
        {pro && plan.paid_until && <p className="mt-1 text-sm text-slate-600">Paid until {new Date(plan.paid_until).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}. One Pro covers Forms and Book.</p>}
      </div>

      <div className="card p-5">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium text-slate-900">File storage</span>
          <span className="text-slate-600">{gb(storage.used)} of {gb(storage.limit)}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
          <div className={pct > 90 ? "h-full bg-red-500" : "h-full bg-brand-600"} style={{ width: `${Math.max(pct, 1)}%` }} />
        </div>
        {pct > 90 && <p className="mt-2 text-xs text-red-600">Almost full: new uploads will be refused. Delete old answers with files{pro ? "" : ", or move to Pro"}.</p>}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
            <tr><th className="px-4 py-3 font-medium" /><th className="px-4 py-3 font-medium">Free</th><th className="px-4 py-3 font-medium text-brand-700">Pro · {naira(plan.price_kobo)}/month</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {ROWS.map(([k, free, p2]) => (
              <tr key={k}><td className="px-4 py-2.5 text-slate-700">{k}</td><td className="px-4 py-2.5 text-slate-600">{free}</td><td className="px-4 py-2.5 font-medium text-slate-900">{p2}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-5">
        <p className="font-medium text-slate-900">{pro ? "Add more time" : "Get Pro"}</p>
        <p className="mt-0.5 text-sm text-slate-500">Paid ahead with Paystack. No automatic renewal. 12 months = pay for 10.</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 3, 6, 12].map((m) => (
            <form key={m} action={payPro}>
              <input type="hidden" name="months" value={m} />
              <SubmitButton className="btn-secondary w-full flex-col py-3" pendingText="Opening Paystack…">
                <span className="font-semibold">{m} {m === 1 ? "month" : "months"}</span>
                <span className="text-xs text-slate-500">{naira(plan.price_kobo * (m === 12 ? 10 : m))}</span>
              </SubmitButton>
            </form>
          ))}
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500"><Icon name="shield" className="h-3.5 w-3.5" /> The same Pro also removes the fee and badge on your Workbase Book page.</p>
      </div>
    </div>
  );
}
