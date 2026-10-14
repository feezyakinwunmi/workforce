"use client";

import { useActionState } from "react";
import Link from "next/link";
import { FormMessage, SubmitButton, TimezoneSelect } from "@/components/form";
import type { Organization } from "@/lib/types";
import { updateCompanySettings } from "./actions";

function Toggle({ name, label, hint, defaultChecked, disabled }: {
  name: string;
  label: string;
  hint: string;
  defaultChecked: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-3 py-3">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-brand-600"
      />
      <span>
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
    </label>
  );
}

export function SettingsForm({ org, pro }: { org: Organization; pro: boolean }) {
  const [state, action] = useActionState(updateCompanySettings, undefined);
  const s = org.settings;

  return (
    <form action={action} className="space-y-6">
      <section className="card space-y-4 p-5">
        <h2 className="font-semibold">Company</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="name">Company name</label>
            <input className="input" id="name" name="name" defaultValue={org.name} required minLength={2} maxLength={120} />
          </div>
          <div>
            <label className="label" htmlFor="timezone">Default time zone</label>
            <TimezoneSelect id="timezone" defaultValue={org.timezone} />
          </div>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">Tracking policy</h2>
        <p className="mb-3 text-sm text-slate-600">
          Applies to every worker&apos;s desktop app. Workers see exactly what is tracked before they start.
        </p>
        <div className="max-w-xs">
          <label className="label" htmlFor="idle">Mark as idle after (minutes)</label>
          <input className="input" id="idle" name="idle_timeout_minutes" type="number" min={1} max={60}
                 defaultValue={s.idle_timeout_minutes} required />
          <p className="mt-1 text-xs text-slate-500">No keyboard or mouse use for this long counts as idle.</p>
        </div>
        <div className="mt-2 divide-y divide-slate-100">
          <Toggle name="track_apps" label="Track apps and websites used" defaultChecked={s.track_apps}
                  hint="App names and website domains while clocked in (e.g. VS Code, figma.com)." />
          <Toggle name="track_urls" label="Record full web addresses" defaultChecked={s.track_urls}
                  hint="Off by default. Full URLs can contain private information." />
        </div>
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Screenshots</h2>
          {!pro && <Link href="/dashboard/billing" className="badge bg-brand-100 text-brand-700 hover:bg-brand-200">Pro plan</Link>}
        </div>
        <p className="mb-2 mt-1 text-sm text-slate-600">
          Off unless you switch them on. Taken only while someone is clocked in, at a random moment in each interval, of the
          screen they are using. Everyone is notified, and the desktop app asks each worker to agree before it takes any.
          Workers see their own and may delete them. Kept for 90 days.
        </p>
        {!pro && !s.screenshots_enabled && (
          <p className="mb-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Screenshots are part of the Pro plan. <Link href="/dashboard/billing" className="font-medium text-brand-700 hover:underline">Upgrade</Link> to switch them on.
          </p>
        )}
        {(pro || s.screenshots_enabled) && <input type="hidden" name="screenshot_form" value="1" />}
        <div className="divide-y divide-slate-100">
          <Toggle name="screenshots_enabled" label="Take screenshots" defaultChecked={s.screenshots_enabled}
                  disabled={!pro && !s.screenshots_enabled}
                  hint="Changing this or the options below asks every worker to agree again." />
          <Toggle name="blur_screenshots" label="Blur screenshots" defaultChecked={s.blur_screenshots}
                  disabled={!pro && !s.screenshots_enabled}
                  hint="Blurred on the worker's computer before upload: you see what kind of work it is, not the details." />
        </div>
        <div className="mt-3 max-w-xs">
          <label className="label" htmlFor="shot-interval">About one every</label>
          <select id="shot-interval" name="screenshot_interval_minutes" className="input" defaultValue={String(s.screenshot_interval_minutes ?? 10)}
                  disabled={!pro && !s.screenshots_enabled}>
            {[5, 10, 15, 20, 30, 60].map((m) => (
              <option key={m} value={m}>{m === 60 ? "hour" : `${m} minutes`}</option>
            ))}
          </select>
        </div>
      </section>

      <FormMessage state={state} />
      <SubmitButton pendingText="Saving…">Save settings</SubmitButton>
    </form>
  );
}
