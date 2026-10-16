"use client";

import { useState } from "react";
import { updateBooking } from "./actions";

/** Done / didn't show (after the time), or cancel with a reason (before). */
export function BookingActions({ id, status, past, paid }: { id: string; status: string; past: boolean; paid: boolean }) {
  const [cancelling, setCancelling] = useState(false);
  if (status === "cancelled") return null;
  if (past) {
    return (
      <form action={updateBooking} className="flex gap-1">
        <input type="hidden" name="id" value={id} />
        {status !== "completed" && <button name="status" value="completed" className="btn-secondary btn-sm">Done</button>}
        {status !== "no_show" && <button name="status" value="no_show" className="btn-secondary btn-sm">No-show</button>}
      </form>
    );
  }
  if (!cancelling) {
    return <button type="button" className="btn-secondary btn-sm text-red-700" onClick={() => setCancelling(true)}>Cancel</button>;
  }
  return (
    <form action={updateBooking} className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value="cancelled" />
      <input name="reason" maxLength={300} placeholder="Reason (the customer sees it)" className="input w-full py-1.5 text-sm sm:w-56" />
      <button className="btn-danger btn-sm">Cancel booking</button>
      <button type="button" className="btn-sm text-slate-500" onClick={() => setCancelling(false)}>Keep</button>
      {paid && <p className="w-full text-xs text-slate-500">They paid online: refund them directly (for example by bank transfer).</p>}
    </form>
  );
}
