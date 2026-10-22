"use client";

import { useActionState, useState, useTransition } from "react";
import { FormMessage, SubmitButton, TimezoneSelect } from "@/components/form";
import type { HostPage } from "@/lib/book/types";
import { checkAccount, savePage, savePayout } from "../actions";

const COLORS = ["#6a4cf5", "#12968a", "#e5383b", "#cc7a12", "#0f766e", "#2563eb", "#be185d", "#15123a"];

export function PageForm({ page, pro, base }: { page: HostPage; pro: boolean; base: string }) {
  const [state, action] = useActionState(savePage, undefined);
  const [color, setColor] = useState(page.color);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Name</span>
          <input name="name" required maxLength={80} defaultValue={page.name} className="input" />
        </label>
        <label className="block">
          <span className="label">Address</span>
          <div className="flex items-center overflow-hidden rounded-lg border border-slate-300 bg-surface focus-within:ring-2 focus-within:ring-brand-500">
            <span className="shrink-0 border-r border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">{base || "book"}/</span>
            <input name="handle" required minLength={3} maxLength={30} pattern="[a-z0-9][a-z0-9\-]{1,28}[a-z0-9]" defaultValue={page.handle} className="w-full bg-transparent px-3 py-2 text-sm outline-none" />
          </div>
        </label>
      </div>
      <label className="block">
        <span className="label">About (shown on your page)</span>
        <textarea name="about" rows={3} maxLength={500} defaultValue={page.about} placeholder="What you do, where you are, what to expect." className="input" />
      </label>
      <label className="block">
        <span className="label">Time zone</span>
        <TimezoneSelect defaultValue={page.timezone} />
      </label>
      <fieldset>
        <legend className="label">Colour {pro ? "" : <span className="ml-1 text-xs font-normal text-slate-500">(Pro)</span>}</legend>
        <input type="hidden" name="color" value={color} />
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              disabled={!pro && c !== "#6a4cf5"}
              onClick={() => setColor(c)}
              aria-label={`Colour ${c}`}
              aria-pressed={color === c}
              className="h-8 w-8 rounded-full ring-offset-2 transition disabled:opacity-30 aria-pressed:ring-2 aria-pressed:ring-slate-900"
              style={{ background: c }}
            />
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={page.active} />
        Taking bookings (untick to pause your page)
      </label>
      <FormMessage state={state} />
      <SubmitButton pendingText="Saving…">Save</SubmitButton>
    </form>
  );
}

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
