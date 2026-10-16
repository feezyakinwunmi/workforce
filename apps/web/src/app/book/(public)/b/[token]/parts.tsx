"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cancelBooking } from "../../actions";

/** A time in the host's zone, switched to the viewer's own zone once the page is in the browser. */
export function LocalTime({ iso, tz, timeOnly }: { iso: string; tz: string; timeOnly?: boolean }) {
  const fmt = (zone: string) =>
    new Intl.DateTimeFormat("en-GB", {
      ...(timeOnly ? {} : { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
      hour: "2-digit",
      minute: "2-digit",
      timeZone: zone,
      timeZoneName: "short",
    }).format(new Date(iso));
  const [text, setText] = useState(() => fmt(tz));
  useEffect(() => {
    try {
      setText(fmt(Intl.DateTimeFormat().resolvedOptions().timeZone || tz));
    } catch {
      // keep the host's time
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso, tz]);
  return <span suppressHydrationWarning>{text}</span>;
}

export function CancelBooking({ token, pending, paid }: { token: string; pending: boolean; paid: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-red-700 hover:underline">
        {pending ? "Cancel and release this time" : "Cancel booking"}
      </button>
    );
  }
  return (
    <form
      className="space-y-3 rounded-xl border border-red-200 bg-red-50/60 p-4"
      action={async (f) => {
        setBusy(true);
        const res = await cancelBooking(token, String(f.get("reason") ?? ""));
        setBusy(false);
        if (res.error) setError(res.error);
        else router.refresh();
      }}
    >
      <p className="text-sm font-medium text-slate-900">Cancel this booking?</p>
      {paid && <p className="text-sm text-slate-600">You paid for this booking. Any refund is between you and the host.</p>}
      <label className="block">
        <span className="label">Reason (optional, the host will see it)</span>
        <input name="reason" maxLength={300} className="input" />
      </label>
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      <div className="flex gap-2">
        <button disabled={busy} className="btn-danger">{busy ? "Cancelling…" : "Yes, cancel"}</button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Keep it</button>
      </div>
    </form>
  );
}
