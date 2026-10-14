"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton, TimezoneSelect } from "@/components/form";
import { updateProfile } from "./actions";

export function ProfileForm({ fullName, timezone }: { fullName: string; timezone: string }) {
  const [state, action] = useActionState(updateProfile, undefined);
  return (
    <form action={action} className="card max-w-xl space-y-4 p-5">
      <div>
        <label className="label" htmlFor="full_name">Full name</label>
        <input className="input" id="full_name" name="full_name" defaultValue={fullName} required minLength={2} maxLength={120} />
      </div>
      <div>
        <label className="label" htmlFor="timezone">My time zone</label>
        <TimezoneSelect id="timezone" defaultValue={timezone} />
        <p className="mt-1 text-xs text-slate-500">
          Your working day and timesheets follow this time zone. Change it if you work from another country.
        </p>
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingText="Saving…">Save</SubmitButton>
    </form>
  );
}
