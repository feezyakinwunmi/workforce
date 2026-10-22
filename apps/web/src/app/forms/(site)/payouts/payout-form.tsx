"use client";

import { useActionState, useState, useTransition } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import { checkAccount, copyBookPayout, savePayout } from "../actions";

export function PayoutForm({ banks, hasAccount }: { banks: Array<{ name: string; code: string }>; hasAccount: boolean }) {
  const [state, action] = useActionState(savePayout, undefined);
  const [bank, setBank] = useState("");
  const [account, setAccount] = useState("");
  const [check, setCheck] = useState<{ name?: string; error?: string } | null>(null);
  const [checking, start] = useTransition();

  const lookup = (b: string, a: string) => {
    setCheck(null);
    if (b && /^\d{10}$/.test(a)) start(async () => setCheck(await checkAccount(b, a)));
  };

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Bank</span>
          <select name="bank" required value={bank} onChange={(e) => { setBank(e.target.value); lookup(e.target.value, account); }} className="input">
            <option value="">Choose your bank</option>
            {banks.map((b) => <option key={`${b.code}-${b.name}`} value={b.code}>{b.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Account number</span>
          <input
            name="account"
            required
            inputMode="numeric"
            maxLength={10}
            value={account}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 10);
              setAccount(v);
              lookup(bank, v);
            }}
            placeholder="10 digits"
            className="input"
          />
        </label>
      </div>
      {checking && <p className="text-sm text-slate-500">Checking the account…</p>}
      {check?.name && <p className="text-sm font-medium text-emerald-700">✓ {check.name}</p>}
      {check?.error && <p className="text-sm text-red-700">{check.error}</p>}
      <FormMessage state={state} />
      <SubmitButton pendingText="Saving…">{hasAccount ? "Change bank account" : "Save bank account"}</SubmitButton>
    </form>
  );
}

export function CopyBookPayout({ label }: { label: string }) {
  const [state, action] = useActionState(copyBookPayout, undefined);
  return (
    <form action={action} className="space-y-2">
      <SubmitButton className="btn-secondary" pendingText="Saving…">{label}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
