import type { Metadata } from "next";
import Link from "next/link";
import { bookRequestBase, getBookHost } from "@/lib/book/server";

export const metadata: Metadata = { title: "Pricing" };

export default async function BookPricing() {
  const [{ user }, base] = await Promise.all([getBookHost(), bookRequestBase()]);
  const start = user ? base || "/" : `/signup?next=${encodeURIComponent(base || "/")}`;
  const plans = [
    { name: "Free", price: "₦0", per: "forever", items: ["Your booking page and link", "Unlimited services and bookings", "Deposits and full payments by Paystack", "Workbase keeps 3% of online payments", "Email reminders and calendar files", "Video calls with Workbase Meet"], cta: user ? "Open Book" : "Start free" },
    { name: "Pro", price: "₦2,000", per: "a month", items: ["Everything in Free", "No Workbase fee on payments", "No “Powered by” badge", "Your own colour", "Also covers Workbase Forms: no fee, Google Sheets, 10 GB files"], cta: user ? "Upgrade in Settings" : "Start free, upgrade later", hot: true },
  ];
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <div className="text-center">
        <h1 className="font-display text-4xl font-bold tracking-tight text-slate-900">Simple prices, in naira</h1>
        <p className="mt-3 text-slate-500">Customers never pay extra to book. Pay for 10 months of Pro, get 12.</p>
      </div>
      <div className="mt-10 grid gap-5 md:grid-cols-2">
        {plans.map((p) => (
          <div key={p.name} className={p.hot ? "card relative p-6 ring-2 ring-brand-500" : "card p-6"}>
            {p.hot && <span className="absolute -top-3 left-6 rounded-full bg-[#f2a93b] px-3 py-0.5 text-xs font-bold text-[#15123a]">Pays for itself</span>}
            <h2 className="font-semibold text-slate-900">{p.name}</h2>
            <p className="mt-3"><span className="font-display text-4xl font-bold text-slate-900">{p.price}</span> <span className="text-sm text-slate-500">{p.per}</span></p>
            <ul className="mt-5 space-y-2 text-sm text-slate-600">
              {p.items.map((i) => <li key={i} className="flex gap-2"><span className="text-emerald-600">✓</span>{i}</li>)}
            </ul>
            <Link href={p.hot && user ? `${base}/settings#plan` : start} className={p.hot ? "btn-primary mt-6 w-full" : "btn-secondary mt-6 w-full"}>{p.cta}</Link>
          </div>
        ))}
      </div>
      <p className="mt-8 text-center text-sm text-slate-500">
        Paystack charges its own small fee on each online payment (currently 1.5% + ₦100, at most ₦2,000). With ₦70,000 or more in monthly deposits, Pro costs less than the 3% fee.
      </p>
    </div>
  );
}
