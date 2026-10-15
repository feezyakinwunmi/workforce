import type { Metadata } from "next";
import Link from "next/link";
import { PAPER, type Note } from "@/lib/notes";
import { requireMember } from "@/lib/session";
import { formatClock, formatDay, localDateIn } from "@/lib/time";
import { Icon } from "@/components/icons";
import { EmptyState, Notice, PageHeader } from "@/components/ui";
import { createNote } from "./actions";

export const metadata: Metadata = { title: "Notes" };

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { supabase, member } = await requireMember();
  const { data } = await supabase
    .from("notes")
    .select("id, title, body, color, pinned, created_at, updated_at")
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(500);
  const notes = (data ?? []) as Note[];
  const tz = member.timezone;
  const today = localDateIn(tz);

  const when = (iso: string) => {
    const d = localDateIn(tz, new Date(iso));
    return d === today ? formatClock(iso, tz) : formatDay(d, { day: "numeric", month: "short" });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Notes"
        actions={
          <form action={createNote}>
            <button className="btn-primary">
              <Icon name="plus" className="h-4 w-4" />
              New note
            </button>
          </form>
        }
      />
      {error && <Notice tone="error">{error}</Notice>}

      <section className="card overflow-hidden">
        {notes.length ? (
          <ul className="divide-y divide-slate-100">
            {notes.map((n) => {
              const lines = n.body.split("\n").map((l) => l.trim()).filter(Boolean);
              const title = n.title.trim() || lines[0] || "Empty note";
              const rest = n.title.trim() ? lines[0] : lines[1];
              return (
                <li key={n.id}>
                  <Link href={`/dashboard/notes/${n.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50">
                    <span
                      className="h-9 w-9 shrink-0 -rotate-3 rounded-[3px] shadow-sm"
                      style={{ background: PAPER[n.color].paper, boxShadow: `inset 0 -3px 0 ${PAPER[n.color].edge}` }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className={n.title.trim() || lines[0] ? "truncate font-medium text-slate-900" : "truncate text-slate-400 italic"}>{title}</span>
                        {n.pinned && <Icon name="pin" className="h-3.5 w-3.5 shrink-0 text-marigold-500 dark:text-marigold-700" title="Pinned" />}
                      </span>
                      {rest && <span className="block truncate text-sm text-slate-500">{rest}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-slate-400 tabular-nums">{when(n.updated_at)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon="note"
            title="No notes yet. Jot down anything: ideas, to-dos, phone numbers."
            action={
              <form action={createNote}>
                <button className="btn-secondary btn-sm"><Icon name="plus" className="h-3.5 w-3.5" />Write your first note</button>
              </form>
            }
          />
        )}
      </section>
    </div>
  );
}
