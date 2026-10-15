"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton, Switch, TimezoneSelect } from "@/components/form";
import { updateEmailPrefs, updateMySchedule, updateProfile } from "./actions";

export function ProfileForm({ fullName, timezone }: { fullName: string; timezone: string }) {
  const [state, action] = useActionState(updateProfile, undefined);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor="full_name">Full name</label>
        <input className="input" id="full_name" name="full_name" defaultValue={fullName} required minLength={2} maxLength={120} />
      </div>
      <div>
        <label className="label" htmlFor="timezone">My time zone</label>
        <TimezoneSelect id="timezone" defaultValue={timezone} />
        <p className="mt-1 text-xs text-slate-500">Your working day and timesheets follow it.</p>
      </div>
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingText="Saving…">Save</SubmitButton>
    </form>
  );
}

export function EmailPrefsForm({ kinds, off, enabled }: { kinds: Array<{ key: string; label: string }>; off: string[]; enabled: boolean }) {
  const [state, action] = useActionState(updateEmailPrefs, undefined);
  return (
    <form action={action}>
      <input type="hidden" name="kinds" value={kinds.map((k) => k.key).join(",")} />
      <div className="divide-y divide-slate-100 border-y border-slate-100">
        {kinds.map((k) => (
          <Switch key={k.key} name={k.key} label={k.label} defaultChecked={!off.includes(k.key)} />
        ))}
      </div>
      {!enabled && <p className="mt-3 text-xs text-slate-500">Your company hasn&apos;t set up email yet, so none are sent for now.</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <SubmitButton pendingText="Saving…" className="btn-secondary">Save email settings</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function ScheduleForm({ start, end, reminders, companyStart, companyEnd }: {
  start: string | null;
  end: string | null;
  reminders: boolean;
  companyStart: string;
  companyEnd: string;
}) {
  const [state, action] = useActionState(updateMySchedule, undefined);
  return (
    <form action={action} className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="work_start">I start at</label>
          <input id="work_start" name="work_start" type="time" defaultValue={start?.slice(0, 5) ?? ""} className="input w-36" />
        </div>
        <div>
          <label className="label" htmlFor="work_end">and finish at</label>
          <input id="work_end" name="work_end" type="time" defaultValue={end?.slice(0, 5) ?? ""} className="input w-36" />
        </div>
        <p className="pb-2 text-xs text-slate-500">Empty = company hours ({companyStart}–{companyEnd})</p>
      </div>
      <div className="border-y border-slate-100">
        <Switch name="reminders" label="Remind me to clock in and out" hint="A pop-up with a sound in the desktop app, and on this phone if notifications are on" defaultChecked={reminders} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingText="Saving…" className="btn-secondary">Save work hours</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
