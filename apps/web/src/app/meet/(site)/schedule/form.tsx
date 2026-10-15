"use client";

import { useActionState, useMemo, useState } from "react";
import { FormMessage, SubmitButton, Switch } from "@/components/form";
import { scheduleMeeting } from "../actions";

const pad = (n: number) => String(n).padStart(2, "0");

export function ScheduleForm() {
  const [state, action] = useActionState(scheduleMeeting, undefined);
  // Default: the next half hour, in this device's time zone.
  const initial = useMemo(() => {
    const d = new Date(Date.now() + 30 * 60_000);
    d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
    return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
  }, []);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const startsAt = useMemo(() => {
    const d = new Date(`${date}T${time}`);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString();
  }, [date, time]);
  const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "Africa/Lagos";

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="starts_at" value={startsAt} />
      <input type="hidden" name="tz" value={tz} />
      <div>
        <label className="label" htmlFor="title">Meeting name</label>
        <input className="input" id="title" name="title" maxLength={120} required placeholder="e.g. Weekly team sync" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="date">Date</label>
          <input className="input" id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="time">Time</label>
          <input className="input" id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="label" htmlFor="duration">Length</label>
          <select className="input" id="duration" name="duration" defaultValue="60">
            {[15, 30, 45, 60, 90, 120, 180].map((m) => (
              <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} hour${m > 60 ? "s" : ""}`.replace("1.5 hours", "1½ hours")}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="-mt-2 text-xs text-slate-500">Times are in {tz.replace(/_/g, " ")}. Invitees see it in their own time zone.</p>
      <div>
        <label className="label" htmlFor="invites">Invite by email <span className="font-normal text-slate-400">(optional)</span></label>
        <textarea className="input min-h-24" id="invites" name="invites" placeholder="ada@company.ng, tunde@client.com" />
        <p className="mt-1 text-xs text-slate-500">They get an email with the link and a calendar invite.</p>
      </div>
      <Switch name="waiting_room" label="Waiting room" hint="You let people in yourself" defaultChecked />
      <Switch name="allow_guests" label="Allow guests" hint="People without a Workbase account can join with their name" defaultChecked />
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full py-2.5" pendingText="Scheduling…">Schedule meeting</SubmitButton>
    </form>
  );
}
