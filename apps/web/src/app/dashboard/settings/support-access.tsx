"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import { InfoTip } from "@/components/ui";
import { allowSupport, stopSupport } from "./actions";

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** Owner/admin: let Workbase support see time records, tasks and leave for a few days. */
export function SupportAccess({ until, looks }: { until: string | null; looks: Array<{ viewer: string; created_at: string }> }) {
  const [state, action] = useActionState(allowSupport, undefined);
  return (
    <div className="space-y-4 py-3.5">
      <p className="flex items-center gap-1.5 text-sm text-slate-600">
        Let Workbase support see time records, tasks and leave while they fix a problem.
        <InfoTip>
          Support always sees your plan, payments, who&apos;s on the team and when the apps last checked in. With access on,
          they also see hours, clock-ins, task counts, leave and recent changes. Chats, notes, screenshots, pay and staff
          records stay private either way. Every look is listed here.
        </InfoTip>
      </p>
      {until ? (
        <form action={stopSupport} className="flex flex-wrap items-center gap-3">
          <span className="badge bg-emerald-50 text-sm text-emerald-700">On until {fmt(until)}</span>
          <SubmitButton className="btn-secondary btn-sm" pendingText="Switching off…">Switch off now</SubmitButton>
        </form>
      ) : (
        <form action={action} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label" htmlFor="days">For</label>
            <select id="days" name="days" className="input" defaultValue="3">
              <option value="1">1 day</option>
              <option value="3">3 days</option>
              <option value="7">7 days</option>
            </select>
          </div>
          <SubmitButton className="btn-secondary" pendingText="Saving…">Allow support access</SubmitButton>
          <FormMessage state={state} />
        </form>
      )}
      {looks.length > 0 && (
        <div className="text-sm">
          <p className="font-medium text-slate-700">Support&apos;s looks</p>
          <ul className="mt-1 space-y-0.5 text-slate-600">
            {looks.map((l, i) => (
              <li key={i}>{fmt(l.created_at)} · {l.viewer}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
