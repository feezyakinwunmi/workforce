"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton, TimezoneSelect } from "@/components/form";
import { COUNTRIES } from "@/lib/utils";
import { acceptInvitation, createOrganization } from "./actions";

export function CreateOrganizationForm() {
  const [state, action] = useActionState(createOrganization, undefined);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="name">Company name</label>
        <input className="input" id="name" name="name" placeholder="e.g. Acme Nigeria Ltd" required minLength={2} maxLength={120} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="country">Country</label>
          <select className="input" id="country" name="country" defaultValue="NG">
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="timezone">Company time zone</label>
          <TimezoneSelect id="timezone" />
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Each worker can set their own time zone later, so staff abroad see their own working day.
      </p>
      <FormMessage state={state} />
      <SubmitButton pendingText="Creating…">Create company</SubmitButton>
    </form>
  );
}

export function AcceptInvitationForm({ token, label = "Join" }: { token: string; label?: string }) {
  const [state, action] = useActionState(acceptInvitation, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="token" value={token} />
      <SubmitButton pendingText="Joining…">{label}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
