"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import { countLeaveDays } from "@/lib/leave";
import { requestLeave } from "./actions";

export function RequestLeaveForm({ types, holidays }: { types: Array<{ id: string; name: string }>; holidays: string[] }) {
  const [state, action] = useActionState(requestLeave, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const holidaySet = useMemo(() => new Set(holidays), [holidays]);
  const days = countLeaveDays(start, end || start, holidaySet);

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
      setStart("");
      setEnd("");
    }
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="leave-type">Type</label>
          <select className="input" id="leave-type" name="leave_type_id" required defaultValue={types[0]?.id}>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="leave-start">First day off</label>
          <input className="input" id="leave-start" name="start_date" type="date" required value={start}
                 onChange={(e) => { setStart(e.target.value); if (!end || end < e.target.value) setEnd(e.target.value); }} />
        </div>
        <div>
          <label className="label" htmlFor="leave-end">Last day off</label>
          <input className="input" id="leave-end" name="end_date" type="date" required min={start || undefined} value={end}
                 onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="leave-reason">Note for your manager <span className="font-normal text-slate-400">(optional)</span></label>
        <input className="input" id="leave-reason" name="reason" maxLength={500} placeholder="e.g. family wedding in Ibadan" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingText="Sending…">Request leave</SubmitButton>
        {start && (
          <span className="text-sm text-slate-600">
            {days} working {days === 1 ? "day" : "days"} (weekends and public holidays don&apos;t count)
          </span>
        )}
      </div>
      <FormMessage state={state} />
    </form>
  );
}
