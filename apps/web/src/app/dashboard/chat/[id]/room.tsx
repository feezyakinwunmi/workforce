"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MESSAGE_COLUMNS, PAGE_SIZE, type ChatMessage } from "@/lib/chat";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type Person = { name: string; initials: string };

const dayKey = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const clock = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(iso));
const dayLabel = (iso: string, timeZone: string) => {
  const key = dayKey(iso, timeZone);
  const today = dayKey(new Date().toISOString(), timeZone);
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString(), timeZone);
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone }).format(new Date(iso));
};

/** Messages of one channel, live (Supabase Realtime), with a box to write. */
export function ChatRoom({
  channelId,
  meId,
  initial,
  hasMore: initialHasMore,
  people,
  canPost,
  canModerate,
  timezone,
  placeholder,
  cannotPostReason,
}: {
  channelId: string;
  meId: string;
  initial: ChatMessage[];
  hasMore: boolean;
  people: Record<string, Person>;
  canPost: boolean;
  canModerate: boolean;
  timezone: string;
  placeholder: string;
  cannotPostReason: string;
}) {
  const [messages, setMessages] = useState(initial);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true); // keep scrolled to the bottom unless the reader scrolled up
  const readTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const upsert = useCallback((m: ChatMessage) => {
    setMessages((prev) => {
      const i = prev.findIndex((x) => x.id === m.id);
      if (i >= 0) {
        const next = prev.slice();
        next[i] = m;
        return next;
      }
      return [...prev, m].sort((a, b) => a.created_at.localeCompare(b.created_at));
    });
  }, []);

  const markRead = useCallback(() => {
    if (readTimer.current) clearTimeout(readTimer.current);
    readTimer.current = setTimeout(() => {
      if (document.visibilityState === "visible") void createClient().rpc("mark_channel_read", { p_channel: channelId });
    }, 800);
  }, [channelId]);

  // Live updates for this channel.
  useEffect(() => {
    setMessages(initial);
    const supabase = createClient();
    const sub = supabase
      .channel(`room-${channelId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` },
        (payload) => {
          upsert(payload.new as ChatMessage);
          markRead();
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` },
        (payload) => upsert(payload.new as ChatMessage))
      .subscribe();
    const onVisible = () => document.visibilityState === "visible" && markRead();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (readTimer.current) clearTimeout(readTimer.current);
      void supabase.removeChannel(sub);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function loadOlder() {
    const oldest = messages[0];
    if (!oldest) return;
    const el = listRef.current;
    const before = el ? el.scrollHeight - el.scrollTop : 0;
    const { data } = await createClient()
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("channel_id", channelId)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    const older = ((data ?? []) as ChatMessage[]).reverse();
    setHasMore(older.length === PAGE_SIZE);
    stick.current = false;
    setMessages((prev) => [...older.filter((o) => !prev.some((p) => p.id === o.id)), ...prev]);
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - before;
    });
  }

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const { data, error: err } = await createClient()
      .from("messages")
      .insert({ channel_id: channelId, body })
      .select(MESSAGE_COLUMNS)
      .single();
    setSending(false);
    if (err) {
      setError(/row-level security/i.test(err.message) ? cannotPostReason : err.message);
      return;
    }
    setDraft("");
    stick.current = true;
    upsert(data as ChatMessage);
  }

  async function saveEdit() {
    if (!editing) return;
    const body = editing.body.trim();
    if (!body) return;
    const { data, error: err } = await createClient()
      .from("messages")
      .update({ body })
      .eq("id", editing.id)
      .select(MESSAGE_COLUMNS)
      .single();
    if (err) return setError(err.message);
    setEditing(null);
    upsert(data as ChatMessage);
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this message? This can't be undone.")) return;
    const { data, error: err } = await createClient()
      .from("messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .select(MESSAGE_COLUMNS)
      .single();
    if (err) return setError(err.message);
    upsert(data as ChatMessage);
  }

  return (
    <>
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-5 py-4"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {hasMore && (
          <div className="mb-4 text-center">
            <button className="btn-secondary btn-sm" onClick={() => void loadOlder()}>Load earlier messages</button>
          </div>
        )}
        {messages.length === 0 && <p className="py-10 text-center text-sm text-slate-400">No messages yet. Say hello!</p>}
        <ol className="space-y-1">
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const newDay = !prev || dayKey(prev.created_at, timezone) !== dayKey(m.created_at, timezone);
            const grouped =
              !newDay && prev && prev.author_id === m.author_id && !prev.deleted_at &&
              Date.parse(m.created_at) - Date.parse(prev.created_at) < 5 * 60_000;
            const who = m.author_id ? people[m.author_id] : undefined;
            const mine = m.author_id === meId;
            return (
              <li key={m.id}>
                {newDay && (
                  <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
                    <span className="h-px flex-1 bg-slate-200" />
                    {dayLabel(m.created_at, timezone)}
                    <span className="h-px flex-1 bg-slate-200" />
                  </div>
                )}
                <div className={cn("group flex gap-3 rounded-lg px-2 py-0.5 hover:bg-slate-50", !grouped && "mt-2")}>
                  <div className="w-8 shrink-0">
                    {!grouped && (
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
                        {who?.initials ?? "?"}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    {!grouped && (
                      <p className="flex items-baseline gap-2 text-sm">
                        <span className="font-semibold">{who?.name ?? "Someone"}</span>
                        <span className="text-xs text-slate-400">{clock(m.created_at, timezone)}</span>
                      </p>
                    )}
                    {m.deleted_at ? (
                      <p className="text-sm italic text-slate-400">Message deleted</p>
                    ) : editing?.id === m.id ? (
                      <div className="space-y-2 py-1">
                        <textarea
                          className="input min-h-16"
                          value={editing.body}
                          maxLength={4000}
                          autoFocus
                          onChange={(e) => setEditing({ id: m.id, body: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              void saveEdit();
                            }
                            if (e.key === "Escape") setEditing(null);
                          }}
                        />
                        <div className="flex gap-2">
                          <button className="btn-primary btn-sm" onClick={() => void saveEdit()}>Save</button>
                          <button className="btn-secondary btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap break-words text-sm text-slate-800">
                        {m.body}
                        {m.edited_at && <span className="ml-1 text-xs text-slate-400">(edited)</span>}
                      </p>
                    )}
                  </div>
                  {!m.deleted_at && editing?.id !== m.id && (mine || canModerate) && (
                    <div className="flex shrink-0 items-start gap-2 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                      {mine && (
                        <button className="text-xs text-slate-400 hover:text-slate-700" onClick={() => setEditing({ id: m.id, body: m.body })}>Edit</button>
                      )}
                      <button className="text-xs text-slate-400 hover:text-red-600" onClick={() => void remove(m.id)}>Delete</button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="border-t border-slate-200 p-3">
        {error && <p role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-1.5 text-sm text-red-700">{error}</p>}
        {canPost ? (
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label htmlFor="chat-box" className="sr-only">Message</label>
            <textarea
              id="chat-box"
              className="input max-h-40 min-h-10 flex-1 resize-none"
              rows={1}
              maxLength={4000}
              placeholder={placeholder}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button className="btn-primary" disabled={sending || !draft.trim()}>{sending ? "Sending…" : "Send"}</button>
          </form>
        ) : (
          <p className="px-2 py-1 text-sm text-slate-500">{cannotPostReason}</p>
        )}
        {canPost && <p className="mt-1 px-1 text-[11px] text-slate-400">Enter to send · Shift + Enter for a new line</p>}
      </div>
    </>
  );
}
