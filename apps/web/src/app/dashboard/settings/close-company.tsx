"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/form";
import { closeCompany } from "./actions";

/** Owner only: type the company name to close it. */
export function CloseCompany({ name }: { name: string }) {
  const [state, action] = useActionState(closeCompany, undefined);
  const [typed, setTyped] = useState("");
  const match = typed.trim().toLowerCase() === name.trim().toLowerCase();
  return (
    <form action={action} className="space-y-3 py-3.5">
      <p className="text-sm text-slate-600">
        Clocking in stops at once. 14 days later the company and all its data (time, tasks, chat, files, payroll and
        records) are deleted for good. Until then everyone can still sign in to download what they need, and you can undo
        it. Payments are not refunded.
      </p>
      <label className="label" htmlFor="confirm">Type <strong className="text-slate-900">{name}</strong> to confirm</label>
      <input id="confirm" name="confirm" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-danger" disabled={!match}>Close the company</button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
