"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import {
  deleteRecording, downloadRecording, listRecordings, onRecordingsChange, tidyRecordings, type SavedRecording,
} from "@/lib/meet/recordings-store";
import { cn } from "@/lib/utils";

const mb = (b: number) => (b < 1_000_000 ? `${Math.max(1, Math.round(b / 1000))} KB` : `${(b / 1_000_000).toFixed(b < 10_000_000 ? 1 : 0)} MB`);
const length = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${m} min` : m ? `${m} min ${s % 60} s` : `${s} s`;
};
const when = (t: number) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(t));

/**
 * Recordings saved on this device (never uploaded). On the end screen: this meeting's. On the
 * Meet home page: any not yet downloaded, e.g. after the tab closed mid-recording.
 */
export function SavedRecordings({ code, dark = false, onlyPending = false }: { code?: string; dark?: boolean; onlyPending?: boolean }) {
  const [list, setList] = useState<SavedRecording[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => void listRecordings(code).then((r) => alive && setList(r));
    void tidyRecordings().finally(load);
    const off = onRecordingsChange(load);
    return () => {
      alive = false;
      off();
    };
  }, [code]);

  const rows = (list ?? []).filter((r) => !onlyPending || !r.downloadedAt);
  if (!rows.length) return null;

  const save = async (r: SavedRecording) => {
    setBusy(r.id);
    setError(null);
    try {
      await downloadRecording(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the recording.");
    } finally {
      setBusy(null);
    }
  };

  const muted = dark ? "text-white/60" : "text-slate-500";
  return (
    <section className={cn("rounded-2xl border p-4 text-left", dark ? "border-white/10 bg-white/5" : "card")} aria-label="Your recordings">
      <h2 className={cn("flex items-center gap-2 font-medium", dark ? "text-white" : "text-slate-900")}>
        <span className="h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden />
        {code ? "Your recording" + (rows.length > 1 ? "s" : "") : "Recordings on this device"}
      </h2>
      <p className={cn("mt-0.5 text-xs", muted)}>Saved only on this device. Download to keep them.</p>
      <ul className="mt-3 space-y-2">
        {rows.map((r) => (
          <li key={r.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-3 py-2.5", dark ? "bg-white/5" : "bg-slate-50")}>
            <div className="min-w-0 flex-1">
              <p className={cn("truncate text-sm font-medium", dark ? "text-white" : "text-slate-900")}>
                {r.title || "Meeting"} {r.audioOnly && <span className={cn("ml-1 text-xs font-normal", muted)}>sound only</span>}
              </p>
              <p className={cn("text-xs", muted)}>
                {when(r.startedAt)} · {length(r.durationMs || r.lastAt - r.startedAt)} · {mb(r.bytes)}
                {!r.done && " · saved up to when the tab closed"}
                {r.downloadedAt && " · downloaded"}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => void save(r)}
                disabled={busy === r.id}
                className="flex items-center gap-1.5 rounded-xl bg-[#6a4cf5] px-3 py-2 text-sm font-medium text-white hover:bg-[#5b3fe0] disabled:opacity-50"
              >
                <Icon name="download" className="h-4 w-4" />
                {busy === r.id ? "Preparing…" : r.downloadedAt ? "Download again" : "Download"}
              </button>
              <button
                onClick={() => {
                  if (r.downloadedAt || confirm("Delete this recording from this device? It hasn't been downloaded.")) void deleteRecording(r.id);
                }}
                className={cn("rounded-xl p-2", dark ? "text-white/60 hover:bg-white/10 hover:text-white" : "text-slate-500 hover:bg-slate-200 hover:text-slate-900")}
                aria-label="Delete from this device"
                title="Delete from this device"
              >
                <Icon name="trash" className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error && <p className={cn("mt-2 text-sm", dark ? "text-red-300" : "text-red-700")}>{error}</p>}
    </section>
  );
}
