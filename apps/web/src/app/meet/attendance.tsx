"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Person = {
  name: string;
  guest: boolean;
  role: "host" | "cohost" | "member";
  status: "waiting" | "admitted" | "denied" | "removed" | "left";
  first_joined: string | null;
  last_left: string | null;
  seconds: number;
  visits: number;
};

type Report = {
  title: string;
  code: string;
  host_name: string;
  starts_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  people: Person[];
};

const cell = (v: string | number) => {
  // Guests type their own names: a leading = + - @ would run as a formula in Excel.
  const s = typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? `'${v}` : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The attendance report as a CSV that opens in Excel, Google Sheets or Numbers. Times in the downloader's time zone. */
export function attendanceCsv(r: Report) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const day = (iso: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
  const time = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "");
  const planned = r.starts_at ?? r.started_at;
  const ended = !!r.ended_at;

  const status = (p: Person) => {
    if (!p.first_joined) return p.status === "denied" ? "Not let in" : p.status === "waiting" && !ended ? "Waiting to be let in" : "Didn't get in";
    if (p.status === "admitted") return ended ? "Left" : "In the meeting";
    if (p.status === "removed") return "Removed by host";
    return "Left";
  };
  const late = (p: Person) => {
    if (!p.first_joined || !planned) return "";
    return Math.max(0, Math.round((Date.parse(p.first_joined) - Date.parse(planned)) / 60_000));
  };

  const joined = r.people.filter((p) => p.first_joined);
  const rows: Array<Array<string | number>> = [
    ["Meeting", r.title || "Instant meeting"],
    ["Code", r.code],
    ["Host", r.host_name],
    ["Date", r.started_at ? day(r.started_at) : ""],
    ...(r.starts_at ? [["Planned start", time(r.starts_at)]] : []),
    ["Started", time(r.started_at)],
    ["Ended", ended ? time(r.ended_at) : "Still going"],
    ["Times shown in", tz],
    ["People who joined", joined.length],
    [],
    ["Name", "Guest or team", "Role", "First joined", "Last left", "Minutes in meeting", "Minutes late", "Times joined", "Status"],
    ...r.people.map((p) => [
      p.name,
      p.guest ? "Guest" : "Team",
      p.role === "host" ? "Host" : p.role === "cohost" ? "Co-host" : "",
      time(p.first_joined),
      time(p.last_left),
      p.first_joined ? Math.round(p.seconds / 60) : "",
      late(p),
      p.visits || "",
      status(p),
    ]),
  ];
  // BOM so Excel reads names with accents correctly.
  return "﻿" + rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** Download the attendance CSV now. Returns an error message, or null when it worked. */
export async function downloadAttendance(code: string): Promise<string | null> {
  const { data, error: e } = await createClient().rpc("meet_attendance", { p_code: code });
  if (e || !data) return e?.message ?? "Couldn't get the attendance. Try again.";
  const r = data as Report;
  const date = (r.started_at ?? new Date().toISOString()).slice(0, 10);
  const slug = (r.title || "meeting").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "meeting";
  const url = URL.createObjectURL(new Blob([attendanceCsv(r)], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `attendance-${slug}-${date}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return null;
}

export function AttendanceButton({ code, dark, className }: { code: string; dark?: boolean; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    setError(await downloadAttendance(code));
    setBusy(false);
  }

  return (
    <span className={cn("inline-flex flex-col items-center", className)}>
      <button
        type="button"
        onClick={download}
        disabled={busy}
        className={dark ? "inline-flex items-center gap-2 rounded-xl bg-white/10 px-5 py-2.5 font-medium hover:bg-white/15 disabled:opacity-60" : "btn-secondary btn-sm"}
      >
        <Icon name="download" className="h-4 w-4" />
        {busy ? "Preparing…" : dark ? "Download attendance" : "Attendance"}
      </button>
      {error && <span className={cn("mt-1.5 max-w-60 text-center text-xs", dark ? "text-red-300" : "text-red-600")}>{error}</span>}
    </span>
  );
}
