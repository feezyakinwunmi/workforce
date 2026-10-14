"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormMessage, SubmitButton, Switch, TimezoneSelect } from "@/components/form";
import { InfoTip } from "@/components/ui";
import type { Organization } from "@/lib/types";
import { updateCompanySettings } from "./actions";

/** One settings group: what it is on the left, the controls on the right. */
function Section({ title, aside, children }: { title: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-b border-slate-200 py-8 first:pt-2 last:border-0 md:grid-cols-[240px_minmax(0,1fr)] md:gap-10">
      <div>
        <h2 className="section-title flex items-center gap-2 text-base">{title}</h2>
        {aside && <div className="mt-1 text-sm text-slate-500">{aside}</div>}
      </div>
      <div className="card px-5 py-2">{children}</div>
    </section>
  );
}

export function SettingsForm({ org, pro }: { org: Organization; pro: boolean }) {
  const [state, action] = useActionState(updateCompanySettings, undefined);
  const s = org.settings;
  const shotsOpen = pro || s.screenshots_enabled;

  return (
    <form action={action}>
      <Section title="Company">
        <div className="grid gap-4 py-3.5 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="name">Name</label>
            <input className="input" id="name" name="name" defaultValue={org.name} required minLength={2} maxLength={120} />
          </div>
          <div>
            <label className="label" htmlFor="timezone">Default time zone</label>
            <TimezoneSelect id="timezone" defaultValue={org.timezone} />
          </div>
        </div>
      </Section>

      <Section title="Tracking" aside="For every desktop app in the company.">
        <div className="flex items-center justify-between gap-6 border-b border-slate-100 py-3.5">
          <label htmlFor="idle" className="text-sm font-medium text-slate-900">
            Idle after
            <span className="block text-xs font-normal text-slate-500">No keyboard or mouse use for this long</span>
          </label>
          <div className="flex items-center gap-2">
            <input className="input w-20 text-right tabular-nums" id="idle" name="idle_timeout_minutes" type="number" min={1} max={60} defaultValue={s.idle_timeout_minutes} required />
            <span className="text-sm text-slate-500">min</span>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          <Switch name="track_apps" label="Apps and websites" hint="App names and website domains, e.g. VS Code, figma.com" defaultChecked={s.track_apps} />
          <Switch name="track_urls" label="Full web addresses" hint="Can contain private information" defaultChecked={s.track_urls} />
        </div>
      </Section>

      <Section
        title={
          <>
            Screenshots
            <InfoTip>
              Taken only while someone is clocked in, at a random moment in each interval, of the screen they are using. Everyone is told,
              and each worker agrees in the desktop app before any is taken. Workers see their own and may delete them. Kept 90 days.
            </InfoTip>
          </>
        }
        aside={pro ? "Off unless you switch them on." : <><span className="badge bg-brand-100 text-brand-700">Pro</span> <Link href="/dashboard/billing" className="ml-1 font-medium text-brand-700 hover:underline">Upgrade to use</Link></>}
      >
        {shotsOpen && <input type="hidden" name="screenshot_form" value="1" />}
        <div className="divide-y divide-slate-100">
          <Switch name="screenshots_enabled" label="Take screenshots" hint="Changes here ask every worker to agree again" defaultChecked={s.screenshots_enabled} disabled={!shotsOpen} />
          <Switch name="blur_screenshots" label="Blur them" hint="Blurred on the worker's computer before upload" defaultChecked={s.blur_screenshots} disabled={!shotsOpen} />
          <div className="flex items-center justify-between gap-6 py-3.5">
            <label htmlFor="shot-interval" className="text-sm font-medium text-slate-900">About one every</label>
            <select id="shot-interval" name="screenshot_interval_minutes" className="input w-36" defaultValue={String(s.screenshot_interval_minutes ?? 10)} disabled={!shotsOpen}>
              {[5, 10, 15, 20, 30, 60].map((m) => (
                <option key={m} value={m}>{m === 60 ? "hour" : `${m} minutes`}</option>
              ))}
            </select>
          </div>
        </div>
      </Section>

      <div className="sticky bottom-4 z-10 mt-2 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-slate-200 bg-surface/90 px-4 py-3 shadow-lg backdrop-blur">
        <div className="mr-auto min-w-0"><FormMessage state={state} /></div>
        <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
      </div>
    </form>
  );
}
