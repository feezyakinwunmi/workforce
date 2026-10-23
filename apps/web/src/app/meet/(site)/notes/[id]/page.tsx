import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SubmitButton } from "@/components/form";
import { Icon } from "@/components/icons";
import { Notice } from "@/components/ui";
import { getMeetUser, requestBase } from "@/lib/meet/server";
import type { MeetNote, NoteSummary } from "@/lib/meet/types";
import { deleteNote } from "../actions";
import { STATUS_TEXT } from "../status";
import { CopyNotes, RefreshWhileWorking } from "./refresh";

export const metadata: Metadata = { title: "AI notes", robots: { index: false } };

function asText(s: NoteSummary, date: string) {
  const sec = (h: string, items: string[]) => (items.length ? `\n${h}\n${items.map((i) => `• ${i}`).join("\n")}\n` : "");
  return [
    `${s.title}\n${date}\n`,
    s.overview,
    sec("Key points", s.key_points),
    sec("Decisions", s.decisions),
    sec("Action items", s.action_items.map((a) => `${a.task}${a.owner ? ` (${a.owner})` : ""}${a.due ? `, ${a.due}` : ""}`)),
    sec("Open questions", s.questions),
  ].join("\n");
}

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ supabase, user }, base] = await Promise.all([getMeetUser(), requestBase()]);
  if (!user) redirect(`/login?next=${encodeURIComponent(`${base}/notes/${id}`)}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { data } = await supabase.from("meet_notes").select("id, title, status, started_at, seconds, summary, error").eq("id", id).maybeSingle();
  if (!data) notFound();
  const n = data as Pick<MeetNote, "id" | "title" | "status" | "started_at" | "seconds" | "summary" | "error">;
  const s = n.summary;
  const date = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(n.started_at));
  const working = ["recording", "queued", "processing", "transcribing"].includes(n.status);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <Link href={`${base}/notes`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <Icon name="chevronLeft" className="h-4 w-4" />
        AI notes
      </Link>
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">{s?.title || n.title || "Meeting notes"}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {date} · {s?.minutes ?? Math.max(1, Math.round(n.seconds / 60))} min{s?.people.length ? ` · ${s.people.join(", ")}` : ""}
        </p>
      </div>

      {working && (
        <>
          <RefreshWhileWorking />
          <Notice tone="info">{n.status === "recording" ? "AI notes are still on in the meeting." : "Writing your notes… This usually takes a few minutes. You can leave this page; we'll email them to you."}</Notice>
        </>
      )}
      {n.status === "failed" && <Notice tone="error">We couldn&apos;t finish these notes. {n.error ? `(${n.error})` : ""}</Notice>}
      {n.status === "empty" && <Notice tone="info">There wasn&apos;t enough talking to write notes.</Notice>}

      {s && (
        <article className="card space-y-6 p-6 sm:p-8">
          <div className="flex items-start justify-between gap-3">
            <p className="text-slate-700">{s.overview}</p>
            <CopyNotes text={asText(s, date)} />
          </div>
          <Section title="Key points" items={s.key_points} />
          <Section title="Decisions" items={s.decisions} />
          {s.action_items.length > 0 && (
            <div>
              <h2 className="mb-2 font-semibold text-slate-900">Action items</h2>
              <ul className="space-y-2">
                {s.action_items.map((a, i) => (
                  <li key={i} className="flex gap-2 text-slate-700">
                    <span className="mt-1 h-4 w-4 shrink-0 rounded border border-slate-300" aria-hidden />
                    <span>
                      {a.task}
                      {(a.owner || a.due) && <span className="text-slate-500"> · {[a.owner, a.due].filter(Boolean).join(", ")}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Section title="Open questions" items={s.questions} />
          <p className="border-t border-slate-100 pt-4 text-xs text-slate-400">Written by AI from the meeting&apos;s sound. Check names and numbers before acting on them.</p>
        </article>
      )}

      {!working && (
        <form action={deleteNote} className="text-right">
          <input type="hidden" name="id" value={n.id} />
          <SubmitButton className="btn-danger btn-sm" pendingText="Deleting…">Delete these notes</SubmitButton>
        </form>
      )}
      <p className="text-center text-xs text-slate-400">{STATUS_TEXT[n.status]} · kept for 90 days</p>
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h2 className="mb-2 font-semibold text-slate-900">{title}</h2>
      <ul className="list-disc space-y-1 pl-5 text-slate-700">
        {items.map((t, i) => <li key={i}>{t}</li>)}
      </ul>
    </div>
  );
}
