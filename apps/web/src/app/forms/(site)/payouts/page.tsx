import { Notice } from "@/components/ui";
import { myPayout, requireMaker } from "@/lib/forms/server";
import { banks } from "../actions";
import { CopyBookPayout, PayoutForm } from "./payout-form";

export const metadata = { title: "Payouts" };

export default async function PayoutsPage() {
  const { supabase, user } = await requireMaker();
  const [payout, list, { data: book }] = await Promise.all([
    myPayout(supabase),
    banks(),
    supabase.from("book_pages").select("subaccount_code, bank_name, account_last4").eq("owner_id", user.id).maybeSingle(),
  ]);
  const bookPayout = book as { subaccount_code: string | null; bank_name: string; account_last4: string } | null;
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-2xl font-bold text-slate-900">Payouts</h1>
      <p className="mt-1 text-sm text-slate-600">Money from your forms goes straight to this bank account through Paystack, usually the next working day. We keep 3%.</p>
      {payout && (
        <Notice tone="success" className="mt-6">
          Payments go to <b>{payout.account_name}</b> ({payout.bank_name} ••••{payout.account_last4}).
        </Notice>
      )}
      {bookPayout?.subaccount_code && bookPayout.account_last4 !== payout?.account_last4 && (
        <div className="card mt-6 p-5">
          <p className="mb-3 text-sm text-slate-700">You already get paid for Workbase Book at {bookPayout.bank_name} ••••{bookPayout.account_last4}.</p>
          <CopyBookPayout label="Use the same account" />
        </div>
      )}
      <div className="card mt-6 p-5 sm:p-6">
        {list.length === 0 ? (
          <p className="text-sm text-slate-600">Payments aren&apos;t set up on this site yet.</p>
        ) : (
          <PayoutForm banks={list} hasAccount={Boolean(payout)} />
        )}
      </div>
    </div>
  );
}
