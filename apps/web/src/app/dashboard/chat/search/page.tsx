import type { Metadata } from "next";
import Link from "next/link";
import { channelTitle, KIND_ICON, type ChannelRow } from "@/lib/chat";
import { requireMember } from "@/lib/session";
import { formatClock, formatDay, localDateIn } from "@/lib/time";
import { displayName, loadPeople } from "@/lib/tracking";
import { Icon } from "@/components/icons";
import { Avatar, EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Search chat" };

type Hit = { id: string; channel_id: string; author_id: string | null; body: string; created_at: string };

/** Show the matching words in bold (plain text, no HTML from the message). */
function Highlight({ text, words }: { text: string; words: string[] }) {
  if (!words.length) return <>{text}</>;
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return (
    <>
      {text.split(re).map((part, i) =>
        i % 2 === 1 ? <mark key={i} className="rounded bg-marigold-100 px-0.5 text-slate-900 dark:text-marigold-700">{part}</mark> : part,
      )}
    </>
  );
}

export default async function ChatSearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const query = q.trim().slice(0, 100);
  const { supabase, member } = await requireMember();
  const [{ data }, { data: channels }, { profiles }] = await Promise.all([
    query.length >= 2 ? supabase.rpc("search_messages", { p_query: query, p_limit: 50 }) : Promise.resolve({ data: [] }),
    supabase.rpc("my_channels"),
    loadPeople(supabase, { includeRemoved: true }),
  ]);
  const hits = (data ?? []) as Hit[];
  const byId = new Map(((channels ?? []) as ChannelRow[]).map((c) => [c.id, c]));
  const words = query.split(/\s+/).filter((w) => w.length >= 2 && !/^(or|and|-)$/i.test(w)).map((w) => w.replace(/^["-]+|"+$/g, ""));
  const tz = member.timezone;

  return (
    <section className="card overflow-hidden">
      <div className="panel-head">
        <h2 className="section-title text-base">{query ? <>Results for &ldquo;{query}&rdquo;</> : "Search messages"}</h2>
        {query && <span className="text-xs text-slate-500">{hits.length === 50 ? "First 50" : hits.length} found</span>}
      </div>
      {hits.length ? (
        <ul className="divide-y divide-slate-100">
          {hits.map((h) => {
            const c = byId.get(h.channel_id);
            const author = h.author_id ? profiles.get(h.author_id) : undefined;
            return (
              <li key={h.id}>
                <Link href={`/dashboard/chat/${h.channel_id}`} className="flex gap-3 px-5 py-3.5 hover:bg-slate-50">
                  <Avatar name={author?.full_name} email={author?.email} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                      <span className="font-medium text-slate-900">{displayName(author)}</span>
                      {c && (
                        <span className="inline-flex items-center gap-1">
                          <Icon name={KIND_ICON[c.kind]} className="h-3 w-3" />
                          {channelTitle(c, profiles)}
                        </span>
                      )}
                      <span>{formatDay(localDateIn(tz, new Date(h.created_at)), { day: "numeric", month: "short" })} {formatClock(h.created_at, tz)}</span>
                    </span>
                    <span className="mt-0.5 line-clamp-3 block text-sm whitespace-pre-wrap text-slate-700">
                      <Highlight text={h.body} words={words} />
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon="search" title={query.length >= 2 ? "No messages found." : "Type at least two letters to search."} />
      )}
    </section>
  );
}
