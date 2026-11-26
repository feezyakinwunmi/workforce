import { Icon } from "@/components/icons";

/**
 * Miniature, made-up screens of each product for the parent site's product stage.
 *
 * They are drawn with ordinary HTML (not screenshots), so they stay sharp, follow light/dark
 * mode and can have small live details: bars growing, a speaker's ring pulsing, a time slot
 * waiting to be picked. All names and numbers are examples.
 * Every screen is aria-hidden; the stage gives screen readers a one-line description instead.
 */

/* ------------------------------------------------------------------------------------------------
 * Workbase: who is working right now, across time zones
 * ---------------------------------------------------------------------------------------------- */
const TEAM = [
  { n: "Adaeze Okafor", i: "AO", where: "Lagos 11:40", state: "Working", bars: [72, 81, 64, 90, 77, 58, 0, 0, 66, 85, 92, 74, 69, 88] },
  { n: "Tunde Bakare", i: "TB", where: "Accra 10:40", state: "Idle", bars: [0, 55, 61, 48, 70, 66, 52, 44, 63, 38, 22, 47, 30, 18] },
  { n: "Chiamaka Eze", i: "CE", where: "Nairobi 13:40", state: "Working", bars: [84, 79, 91, 88, 0, 0, 73, 80, 86, 77, 90, 82, 75, 87] },
  { n: "Kemi Adeyemi", i: "KA", where: "Toronto 06:40", state: "Not started", bars: Array(14).fill(0) },
];
const DOT: Record<string, string> = { Working: "bg-emerald-500", Idle: "bg-amber-500", "Not started": "bg-slate-300" };

export function WorkbaseScreen() {
  return (
    <div className="relative h-full p-5 sm:p-6" aria-hidden>
      <div className="flex items-center justify-between">
        <p className="font-display text-lg font-semibold text-slate-900">Team today</p>
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <span className="soft-blink h-2 w-2 rounded-full bg-emerald-500" />2 working now
        </p>
      </div>
      <ul className="mt-4 space-y-3.5">
        {TEAM.map((p, row) => (
          <li key={p.n} className="grid grid-cols-[2rem_1fr] items-center gap-x-3 sm:grid-cols-[2rem_8.5rem_1fr]">
            <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-[11px] font-semibold text-brand-700">
              {p.i}
              <span className={`absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface ${DOT[p.state]}`} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-slate-900">{p.n}</p>
              <p className="text-[11px] text-slate-500">{p.where}</p>
            </div>
            <div className="col-span-2 mt-2 flex h-8 items-end gap-[3px] sm:col-span-1 sm:mt-0">
              {p.bars.map((v, i) => (
                <span key={i} className="flex h-full flex-1 items-end rounded-[3px] bg-slate-100">
                  {v > 0 && (
                    <span
                      className={`timeline-bar block w-full rounded-[3px] ${v >= 40 ? "bg-chart-1" : "bg-chart-2"}`}
                      style={{ height: `${Math.max(18, v)}%`, animationDelay: `${row * 110 + i * 28}ms` }}
                    />
                  )}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>

      {/* The desktop app's clock, resting on the corner. */}
      <div className="float-y absolute right-4 bottom-4 w-44 rounded-xl border border-slate-200 bg-raised p-3 shadow-xl sm:right-6">
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Clocked in
        </p>
        <p className="mt-1 font-display text-2xl font-semibold text-slate-900 tabular-nums">03:12:44</p>
        <p className="mt-0.5 truncate text-[11px] text-slate-500">Invoice page redesign</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Meet: a four-person call, one person speaking, a guest who joined by link
 * ---------------------------------------------------------------------------------------------- */
const CALL = [
  { n: "Femi", i: "FA", tone: "bg-[#2b2466]", speaking: true },
  { n: "Bisi (guest)", i: "BO", tone: "bg-[#3a2d14]" },
  { n: "Ifeanyi", i: "IN", tone: "bg-[#173a33]", muted: true },
  { n: "Grace", i: "GA", tone: "bg-[#3b1f33]" },
];

export function MeetScreen() {
  return (
    <div className="flex h-full flex-col bg-[#0f0d24] p-4 text-white sm:p-5" aria-hidden>
      <div className="flex items-center justify-between text-xs text-white/60">
        <span className="font-medium text-white">Weekly planning</span>
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-md bg-red-500/15 px-2 py-0.5 font-medium text-red-300">
            <span className="soft-blink h-1.5 w-1.5 rounded-full bg-red-400" />
            Rec 12:08
          </span>
          abc-defg-hij
        </span>
      </div>

      <div className="mt-3 grid flex-1 grid-cols-2 gap-2.5">
        {CALL.map((p) => (
          <div key={p.n} className={`relative flex items-center justify-center overflow-hidden rounded-xl ${p.tone}`}>
            <span className={`flex h-12 w-12 items-center justify-center rounded-full bg-white/10 font-display text-base font-semibold sm:h-14 sm:w-14 ${p.speaking ? "speak-ring" : ""}`}>
              {p.i}
            </span>
            <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/40 px-1.5 py-0.5 text-[10px] font-medium backdrop-blur">
              {p.muted && <Icon name="micOff" className="h-3 w-3 text-red-300" />}
              {p.n}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-center gap-2.5">
        {(["mic", "video", "screenShare", "hand"] as const).map((n) => (
          <span key={n} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10">
            <Icon name={n} className="h-4 w-4" />
          </span>
        ))}
        <span className="flex h-9 w-12 items-center justify-center rounded-full bg-red-500">
          <Icon name="hangUp" className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Book: a public booking page, a day picked, a time waiting, a deposit to pay
 * ---------------------------------------------------------------------------------------------- */
const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);
const OPEN = new Set([3, 4, 5, 9, 10, 11, 12, 16, 17, 18, 19, 23, 24, 25]);

export function BookScreen() {
  return (
    <div className="grid h-full gap-5 p-5 sm:grid-cols-[1fr_9.5rem] sm:p-6" aria-hidden>
      <div>
        <p className="text-xs text-slate-500">Femi Akinwunmi</p>
        <p className="font-display text-lg font-semibold text-slate-900">Strategy call · 45 min</p>
        <p className="mt-0.5 text-xs text-slate-500">Video call · ₦15,000</p>
        <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[10px] text-slate-400">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
          {DAYS.map((d) => (
            <span
              key={d}
              className={`flex aspect-square items-center justify-center rounded-md text-[11px] ${
                d === 11
                  ? "bg-brand-600 font-semibold text-white"
                  : OPEN.has(d)
                    ? "bg-brand-50 font-medium text-brand-700"
                    : "text-slate-300"
              }`}
            >
              {d}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="mb-1 text-xs font-medium text-slate-500">Thu 11 Dec</p>
        {["09:00", "10:30", "13:00", "15:30"].map((t) => (
          <span
            key={t}
            className={`rounded-lg border px-3 py-1.5 text-center text-xs font-medium ${
              t === "13:00" ? "soft-blink border-brand-600 bg-brand-600 text-white" : "border-slate-200 text-slate-700"
            }`}
          >
            {t}
          </span>
        ))}
        <span className="mt-auto rounded-lg bg-slate-900 px-3 py-2 text-center text-xs font-semibold text-slate-50">Pay ₦5,000 deposit</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Forms: an event form that takes payment, plus a fresh answer arriving
 * ---------------------------------------------------------------------------------------------- */
export function FormsScreen() {
  return (
    <div className="relative h-full p-5 sm:p-6" aria-hidden>
      <p className="font-display text-lg font-semibold text-slate-900">Tech &amp; Tides 2027</p>
      <p className="text-xs text-slate-500">Get your ticket · Step 2 of 3</p>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100">
        <span className="block h-full w-2/3 rounded-full bg-brand-600" />
      </div>

      <p className="mt-4 text-xs font-medium text-slate-700">Full name</p>
      <p className="mt-1 flex h-9 items-center rounded-lg border border-slate-200 px-3 text-sm text-slate-900">
        Ngozi Adebayo<span className="soft-blink ml-px h-4 w-px bg-slate-900" />
      </p>

      <p className="mt-3 text-xs font-medium text-slate-700">Ticket</p>
      <div className="mt-1 space-y-1.5">
        {[
          ["Regular", "₦5,000", false],
          ["VIP", "₦12,000", true],
        ].map(([label, price, on]) => (
          <p
            key={label as string}
            className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm ${on ? "border-brand-600 bg-brand-50" : "border-slate-200"}`}
          >
            <span className={`h-3.5 w-3.5 rounded-full border-2 ${on ? "border-brand-600 bg-brand-600 ring-2 ring-white ring-inset" : "border-slate-300"}`} />
            <span className="text-slate-800">{label}</span>
            <span className="ml-auto text-xs text-slate-500">{price}</span>
          </p>
        ))}
      </div>
      <p className="mt-4 flex items-center justify-between rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-50">
        Pay and send
        <span>₦12,000</span>
      </p>

      {/* A new answer arriving for the person who made the form. */}
      <div className="float-y absolute right-5 top-5 hidden w-44 rounded-xl border border-slate-200 bg-raised p-3 shadow-xl sm:block">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-900">
          <Icon name="check" className="h-3.5 w-3.5 text-emerald-600" />
          New answer, paid
        </p>
        <p className="mt-0.5 text-[11px] text-slate-500">Added to your Google Sheet</p>
      </div>
    </div>
  );
}
