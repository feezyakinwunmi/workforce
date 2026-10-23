import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/icons";
import { getMeetUser, requestBase } from "@/lib/meet/server";
import type { MeetNote } from "@/lib/meet/types";
import { STATUS_TEXT } from "./status";

export const metadata: Metadata = { title: "AI notes" };

export default async function NotesPage() {
  const [{ supabase, user }, base] = await Promise.all([getMeetUser(), requestBase()]);
  if (!user) redirect(`/login?next=${encodeURIComponent(`${base}/notes`)}`);
  const { data } = await supabase
    .from("meet_notes")
    .select("id, title, status, started_at, seconds, summary")
    .order("created_at", { ascending: false })
    .limit(100);
  const notes = (data ?? []) as Array<Pick<MeetNote, "id" | "title" | "status" | "started_at" | "seconds" | "summary">>;
  const fmt = (iso: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">AI notes</h1>
      {notes.length === 0 ? (
        <div className="card p-8 text-center text-slate-500">
          <Icon name="sparkle" className="mx-auto mb-3 h-8 w-8 text-brand-600" />
          No notes yet. In a meeting, the host or a co-host on Meet Pro Max turns on <span className="font-medium text-slate-700">AI notes</span>; the summary appears here afterwards.
        </div>
      ) : (
        <ul className="card divide-y divide-slate-100">
          {notes.map((n) => (
            <li key={n.id}>
              <Link href={`${base}/notes/${n.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 hover:bg-slate-50">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-900">{n.summary?.title || n.title || "Meeting notes"}</span>
                  <span className="text-xs text-slate-500">{fmt(n.started_at)} · {Math.max(1, Math.round(n.seconds / 60))} min</span>
                </span>
                <span className={`badge ${n.status === "ready" ? "bg-emerald-50 text-emerald-700" : n.status === "failed" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}>
                  {STATUS_TEXT[n.status]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="text-center text-xs text-slate-400">Notes are kept for 90 days. The meeting&apos;s sound is deleted as soon as the notes are written.</p>
    </div>
  );
}
