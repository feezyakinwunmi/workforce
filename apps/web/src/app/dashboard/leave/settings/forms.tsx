"use client";

import { useActionState, useEffect, useRef } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import { addHoliday, addLeaveType } from "../actions";

export function AddLeaveTypeForm() {
  const [state, action] = useActionState(addLeaveType, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.success) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <label className="label" htmlFor="new-type-name">Name</label>
          <input className="input" id="new-type-name" name="name" maxLength={40} required placeholder="e.g. Maternity leave" />
        </div>
        <div className="w-32">
          <label className="label" htmlFor="new-type-days">Days per year</label>
          <input className="input" id="new-type-days" name="days_per_year" type="number" min="0" max="365" step="0.5" placeholder="No limit" />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="paid" defaultChecked /> Paid
        </label>
        <SubmitButton className="btn-secondary" pendingText="Adding…">Add type</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function AddHolidayForm() {
  const [state, action] = useActionState(addHoliday, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.success) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44">
          <label className="label" htmlFor="holiday-day">Date</label>
          <input className="input" id="holiday-day" name="day" type="date" required />
        </div>
        <div className="w-56">
          <label className="label" htmlFor="holiday-name">Name</label>
          <input className="input" id="holiday-name" name="name" maxLength={80} required placeholder="e.g. Company retreat" />
        </div>
        <SubmitButton className="btn-secondary" pendingText="Adding…">Add holiday</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
