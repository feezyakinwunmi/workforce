"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { naira, type PublicService } from "@/lib/book/types";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { createBooking } from "../../actions";
import { Turnstile } from "@/components/turnstile";

const dayKey = (d: Date, tz: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const timeOf = (iso: string, tz: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const longDay = (key: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${key}T12:00:00Z`));
const iso = (d: Date) => d.toISOString().slice(0, 10);
const tzLabel = (tz: string) => tz.replace(/_/g, " ").split("/").pop();

/** Pick a day, a time, then your details (and pay, if the service asks for it). */
export function BookingFlow({ handle, service, color, hostTimezone, canPay }: {
  handle: string;
  service: PublicService;
  color: string;
  hostTimezone: string;
  canPay: boolean;
}) {
  const viewerTz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || hostTimezone;
    } catch {
      return hostTimezone;
    }
  }, [hostTimezone]);
  const [tz, setTz] = useState(viewerTz);
  useEffect(() => setTz(viewerTz), [viewerTz]);

  const today = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(() => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));
  const [slots, setSlots] = useState<string[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    const from = new Date(month.getTime() - 86_400_000);
    const { data, error } = await createClient().rpc("book_slots", { p_handle: handle, p_service: service.id, p_from: iso(from), p_days: 42 });
    if (error) {
      setLoadError("Couldn't load the free times. Check your connection and try again.");
      setSlots([]);
      return;
    }
    setSlots(((data as { slots: string[] } | null)?.slots ?? []).map(String));
  }, [handle, service.id, month]);

  useEffect(() => {
    setSlots(null);
    void load();
  }, [load]);

  // Slots grouped by day in the chosen time zone.
  const byDay = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of slots ?? []) {
      const k = dayKey(new Date(s), tz);
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return m;
  }, [slots, tz]);

  // Pick the first day with free times when the month loads.
  useEffect(() => {
    if (!slots) return;
    const monthKey = iso(month).slice(0, 7);
    const first = [...byDay.keys()].sort().find((k) => k.startsWith(monthKey));
    setDay((d) => (d && byDay.has(d) ? d : first ?? null));
  }, [slots, byDay, month]);

  const lastMonth = useMemo(() => {
    const max = new Date(today.getTime() + service.max_days * 86_400_000);
    return new Date(Date.UTC(max.getUTCFullYear(), max.getUTCMonth(), 1));
  }, [today, service.max_days]);
  const firstMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));

  // Calendar cells (weeks start on Monday).
  const cells = useMemo(() => {
    const y = month.getUTCFullYear();
    const mo = month.getUTCMonth();
    const days = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    const lead = (new Date(Date.UTC(y, mo, 1)).getUTCDay() + 6) % 7;
    return [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => iso(new Date(Date.UTC(y, mo, i + 1))))] as Array<string | null>;
  }, [month]);
  const todayKey = dayKey(today, tz);

  const times = day ? byDay.get(day) ?? [] : [];

  return (
    <div className="card overflow-hidden">
      {!slot ? (
        <div className="grid md:grid-cols-[1fr_14rem]">
          <div className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-slate-900">
                {new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(month)}
              </h2>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                  disabled={month <= firstMonth}
                  onClick={() => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1)))}
                  aria-label="Previous month"
                >
                  <Icon name="arrowLeft" className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                  disabled={month >= lastMonth}
                  onClick={() => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)))}
                  aria-label="Next month"
                >
                  <Icon name="chevronRight" className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <span key={d} className="py-1">{d}</span>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {cells.map((k, i) => {
                if (!k) return <span key={`e${i}`} />;
                const open = byDay.has(k);
                const selected = k === day;
                return (
                  <button
                    key={k}
                    type="button"
                    disabled={!open}
                    onClick={() => setDay(k)}
                    aria-pressed={selected}
                    aria-label={`${longDay(k)}${open ? `, ${byDay.get(k)!.length} times free` : ", nothing free"}`}
                    className={cn(
                      "relative flex aspect-square items-center justify-center rounded-xl text-sm transition",
                      open ? "font-semibold text-slate-900 hover:bg-slate-100" : "text-slate-300",
                      selected && "text-white hover:bg-transparent",
                      k === todayKey && !selected && "ring-1 ring-slate-300",
                    )}
                    style={selected ? { background: color } : undefined}
                  >
                    {Number(k.slice(8))}
                    {open && !selected && <span className="absolute bottom-1.5 h-1 w-1 rounded-full" style={{ background: color }} />}
                  </button>
                );
              })}
            </div>
            {slots === null && <p className="mt-4 text-sm text-slate-500">Finding free times…</p>}
            {loadError && (
              <p className="mt-4 text-sm text-red-700">
                {loadError} <button className="underline" onClick={() => void load()}>Try again</button>
              </p>
            )}
            {slots && !loadError && !byDay.size && (
              <p className="mt-4 text-sm text-slate-600">Nothing free this month. Try the next month.</p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <Icon name="globe" className="h-4 w-4" />
              {viewerTz === hostTimezone ? (
                <span>Times in {tzLabel(tz)} time</span>
              ) : (
                <label className="flex items-center gap-1.5">
                  Times in
                  <select value={tz} onChange={(e) => setTz(e.target.value)} className="rounded-md border border-slate-200 bg-surface px-1.5 py-0.5 text-xs">
                    <option value={viewerTz}>your time ({tzLabel(viewerTz)})</option>
                    <option value={hostTimezone}>their time ({tzLabel(hostTimezone)})</option>
                  </select>
                </label>
              )}
            </div>
          </div>
          <div className="border-t border-slate-100 p-5 md:border-t-0 md:border-l">
            <p className="mb-3 text-sm font-semibold text-slate-900">{day ? longDay(day) : "Pick a day"}</p>
            <div className="grid max-h-[22rem] grid-cols-3 gap-2 overflow-y-auto md:grid-cols-1">
              {times.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setSlot(s);
                    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                  }}
                  className="rounded-xl border border-[var(--c)] px-3 py-2.5 text-sm font-semibold text-[var(--c)] tabular-nums transition hover:bg-[var(--c)] hover:text-white"
                  style={{ "--c": color } as React.CSSProperties}
                >
                  {timeOf(s, tz)}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div ref={formRef}>
          <DetailsForm
            handle={handle}
            service={service}
            color={color}
            slot={slot}
            tz={tz}
            canPay={canPay}
            onBack={() => setSlot(null)}
            onTaken={() => {
              setSlot(null);
              void load();
            }}
          />
        </div>
      )}
    </div>
  );
}

function DetailsForm({ handle, service, color, slot, tz, canPay, onBack, onTaken }: {
  handle: string;
  service: PublicService;
  color: string;
  slot: string;
  tz: string;
  canPay: boolean;
  onBack: () => void;
  onTaken: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const end = new Date(new Date(slot).getTime() + service.duration_min * 60_000).toISOString();
  const pay = service.pay_now_kobo;
  const needsPhone = service.location !== "meet";
  const blocked = pay > 0 && !canPay;

  async function submit(form: FormData) {
    setBusy(true);
    setError(null);
    const res = await createBooking({
      handle,
      serviceId: service.id,
      startsAt: slot,
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      notes: String(form.get("notes") ?? ""),
      captcha: String(form.get("cf-turnstile-response") ?? ""),
    });
    if (res.redirect) {
      window.location.href = res.redirect;
      return;
    }
    setBusy(false);
    setTries((n) => n + 1);
    setError(res.error ?? "Something went wrong. Please try again.");
    if (res.error && /taken/i.test(res.error)) setTimeout(onTaken, 1800);
  }

  return (
    <form action={submit} className="space-y-4 p-5 sm:p-6">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <Icon name="arrowLeft" className="h-4 w-4" /> Change time
      </button>
      <div className="rounded-xl px-4 py-3 text-sm" style={{ background: `${color}14`, border: `1px solid ${color}40` }}>
        <p className="font-semibold text-slate-900">{longDayFromIso(slot, tz)}</p>
        <p className="text-slate-700 tabular-nums">
          {timeOf(slot, tz)} – {timeOf(end, tz)} · {tzLabel(tz)} time
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Your name</span>
          <input name="name" required maxLength={80} autoComplete="name" className="input" />
        </label>
        <label className="block">
          <span className="label">Email</span>
          <input name="email" type="email" required maxLength={200} autoComplete="email" className="input" />
        </label>
        <label className="block sm:col-span-2">
          <span className="label">Phone / WhatsApp{needsPhone ? "" : " (optional)"}</span>
          <input name="phone" type="tel" required={needsPhone} maxLength={30} autoComplete="tel" placeholder="0803 000 0000" className="input" />
        </label>
        <label className="block sm:col-span-2">
          <span className="label">Anything they should know? (optional)</span>
          <textarea name="notes" maxLength={1000} rows={3} className="input" />
        </label>
      </div>
      {pay > 0 && !blocked && (
        <p className="flex items-start gap-2 text-sm text-slate-600">
          <Icon name="wallet" className="mt-0.5 h-4 w-4" />
          You'll pay {naira(pay)} now with Paystack (card, bank transfer or USSD).
          {service.price_kobo > pay ? ` The rest (${naira(service.price_kobo - pay)}) is paid on the day.` : ""}
        </p>
      )}
      {blocked && (
        <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This service needs a payment, but this host can't take payments online yet. Please contact them directly.
        </p>
      )}
      <Turnstile resetKey={tries} />
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <button
        disabled={busy || blocked}
        className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
        style={{ background: color }}
      >
        {busy ? "Booking…" : pay > 0 ? `Pay ${naira(pay)} and book` : "Confirm booking"}
      </button>
      <p className="text-center text-xs text-slate-500">You'll get a confirmation email with a link to see or cancel your booking.</p>
    </form>
  );
}

function longDayFromIso(s: string, tz: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(new Date(s));
}
