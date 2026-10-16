"use client";

import { useActionState, useEffect, useRef } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import { addNote, extendTrial } from "@/app/admin/actions";

export function ExtendTrialForm({ org, defaultDate }: { org: string; defaultDate: string }) {
  const [state, action] = useActionState(extendTrial, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="org" value={org} />
      <label className="label" htmlFor="until">Free trial ends on</label>
      <div className="flex gap-2">
        <input id="until" name="until" type="date" defaultValue={defaultDate} className="input max-w-44" required />
        <SubmitButton className="btn-secondary" pendingText="Saving…">Set</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function NoteForm({ org }: { org: string }) {
  const [state, action] = useActionState(addNote, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.success) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-2">
      <input type="hidden" name="org" value={org} />
      <label className="sr-only" htmlFor="body">Note</label>
      <textarea id="body" name="body" rows={3} maxLength={2000} className="input" placeholder="What they asked, what you did, what to check next" required />
      <div className="flex items-center justify-between gap-3">
        <FormMessage state={state} />
        <SubmitButton className="btn-secondary ml-auto" pendingText="Saving…">Add note</SubmitButton>
      </div>
    </form>
  );
}
