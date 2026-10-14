"use client";

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ALLOWED_FILE_TYPES,
  CHAT_BUCKET,
  FILE_ACCEPT,
  fileSize,
  isImage,
  MAX_FILE_BYTES,
  MAX_FILES,
  MESSAGE_COLUMNS,
  PAGE_SIZE,
  storageName,
  type Attachment,
  type ChatMessage,
} from "@/lib/chat";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type Person = { name: string; initials: string };
type Mentionable = { id: string; name: string };

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
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Rows from Realtime may miss the new columns for a moment; fill them in. */
const normalize = (m: ChatMessage): ChatMessage => ({ ...m, attachments: m.attachments ?? [], mentions: m.mentions ?? [] });

/** Messages of one channel, live (Supabase Realtime), with a box to write, files and @mentions. */
export function ChatRoom({
  channelId,
  orgId,
  meId,
  mentionable,
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
  orgId: string;
  meId: string;
  mentionable: Mentionable[];
  initial: ChatMessage[];
  hasMore: boolean;
  people: Record<string, Person>;
  canPost: boolean;
  canModerate: boolean;
  timezone: string;
  placeholder: string;
  cannotPostReason: string;
}) {
  const [messages, setMessages] = useState(() => initial.map(normalize));
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [picked, setPicked] = useState<Mentionable[]>([]); // people chosen from the @ list
  const [suggest, setSuggest] = useState<{ query: string; start: number; index: number } | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const listRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stick = useRef(true); // keep scrolled to the bottom unless the reader scrolled up
  const readTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const asked = useRef(new Set<string>());

  const upsert = useCallback((raw: ChatMessage) => {
    const m = normalize(raw);
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
    setMessages(initial.map(normalize));
    const supabase = createClient();
    const sub = supabase
      .channel(`room-${channelId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` },
        (payload: RealtimePostgresChangesPayload<ChatMessage>) => {
          upsert(payload.new as ChatMessage);
          markRead();
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` },
        (payload: RealtimePostgresChangesPayload<ChatMessage>) => upsert(payload.new as ChatMessage))
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

  // Short-lived download links for files in view (Storage checks you can read the chat).
  useEffect(() => {
    const missing = [...new Set(messages.flatMap((m) => m.attachments.map((a) => a.path)))].filter((p) => !asked.current.has(p));
    if (!missing.length) return;
    missing.forEach((p) => asked.current.add(p));
    void createClient()
      .storage.from(CHAT_BUCKET)
      .createSignedUrls(missing, 60 * 60)
      .then(({ data }) => {
        if (!data) return;
        setUrls((prev) => {
          const next = { ...prev };
          for (const d of data) if (d.path && d.signedUrl) next[d.path] = d.signedUrl;
          return next;
        });
      });
  }, [messages]);

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
    const older = ((data ?? []) as ChatMessage[]).map(normalize).reverse();
    setHasMore(older.length === PAGE_SIZE);
    stick.current = false;
    setMessages((prev) => [...older.filter((o) => !prev.some((p) => p.id === o.id)), ...prev]);
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - before;
    });
  }

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list);
    const bad = incoming.find((f) => !ALLOWED_FILE_TYPES.includes(f.type));
    const big = incoming.find((f) => f.size > MAX_FILE_BYTES);
    if (bad) return setError(`${bad.name}: this kind of file can't be shared. Use images, PDF, Office, text, CSV or zip files.`);
    if (big) return setError(`${big.name} is larger than ${fileSize(MAX_FILE_BYTES)}.`);
    setError(files.length + incoming.length > MAX_FILES ? `Up to ${MAX_FILES} files per message.` : null);
    setFiles((prev) => [...prev, ...incoming].slice(0, MAX_FILES));
  }

  async function send() {
    const body = draft.trim();
    if ((!body && !files.length) || sending) return;
    setSending(true);
    setError(null);
    const supabase = createClient();
    const uploaded: Array<{ path: string; name: string }> = [];
    try {
      for (const f of files) {
        const path = `${orgId}/${channelId}/${crypto.randomUUID()}/${storageName(f.name)}`;
        const { error: upErr } = await supabase.storage.from(CHAT_BUCKET).upload(path, f, { contentType: f.type, upsert: false });
        if (upErr) throw new Error(/row-level security|unauthori[sz]ed/i.test(upErr.message) ? cannotPostReason : `${f.name}: ${upErr.message}`);
        uploaded.push({ path, name: f.name });
      }
      const mentions = picked.filter((p) => body.includes(`@${p.name}`)).map((p) => p.id);
      const { data, error: err } = await supabase
        .from("messages")
        .insert({ channel_id: channelId, body, attachments: uploaded, mentions })
        .select(MESSAGE_COLUMNS)
        .single();
      if (err) throw new Error(/row-level security/i.test(err.message) ? cannotPostReason : err.message);
      setDraft("");
      setFiles([]);
      setPicked([]);
      setSuggest(null);
      stick.current = true;
      upsert(data as ChatMessage);
    } catch (e) {
      if (uploaded.length) void supabase.storage.from(CHAT_BUCKET).remove(uploaded.map((u) => u.path));
      setError(e instanceof Error ? e.message : "Could not send the message.");
    } finally {
      setSending(false);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const body = editing.body.trim();
    const original = messages.find((m) => m.id === editing.id);
    if (!body && !original?.attachments.length) return;
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

  async function remove(m: ChatMessage) {
    if (!window.confirm("Delete this message? This can't be undone.")) return;
    const supabase = createClient();
    const { data, error: err } = await supabase
      .from("messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", m.id)
      .select(MESSAGE_COLUMNS)
      .single();
    if (err) return setError(err.message);
    upsert(data as ChatMessage);
    // The files go too (uploader or company admin; anything left is harmless and unreachable).
    if (m.attachments.length) void supabase.storage.from(CHAT_BUCKET).remove(m.attachments.map((a) => a.path));
  }

  // ---- @mentions -------------------------------------------------------
  const matches = useMemo(() => {
    if (!suggest) return [];
    const q = suggest.query.toLowerCase();
    return mentionable
      .filter((p) => p.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)) || p.name.toLowerCase().startsWith(q))
      .slice(0, 6);
  }, [suggest, mentionable]);

  function onDraftChange(value: string, caret: number) {
    setDraft(value);
    if (!mentionable.length) return;
    const before = value.slice(0, caret);
    const m = /(^|\s)@([^\s@]{0,30})$/.exec(before);
    setSuggest(m ? { query: m[2], start: caret - m[2].length - 1, index: 0 } : null);
  }

  function pickMention(p: Mentionable) {
    if (!suggest) return;
    const box = boxRef.current;
    const caret = box?.selectionStart ?? draft.length;
    const insert = `@${p.name} `;
    const next = draft.slice(0, suggest.start) + insert + draft.slice(caret);
    setDraft(next);
    setPicked((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]));
    setSuggest(null);
    requestAnimationFrame(() => {
      if (!box) return;
      box.focus();
      const pos = suggest.start + insert.length;
      box.setSelectionRange(pos, pos);
    });
  }

  /** Message text with mentions highlighted (yours stronger). */
  function renderBody(m: ChatMessage) {
    const named = m.mentions
      .map((id) => ({ id, name: people[id]?.name }))
      .filter((x): x is { id: string; name: string } => Boolean(x.name))
      .sort((a, b) => b.name.length - a.name.length);
    if (!named.length) return m.body;
    const re = new RegExp(`(@(?:${named.map((n) => escapeRegExp(n.name)).join("|")}))`, "g");
    return m.body.split(re).map((part, i) => {
      const who = part.startsWith("@") ? named.find((n) => `@${n.name}` === part) : undefined;
      if (!who) return <Fragment key={i}>{part}</Fragment>;
      return (
        <span key={i} className={cn("rounded px-0.5 font-medium", who.id === meId ? "bg-amber-100 text-amber-900" : "bg-brand-50 text-brand-700")}>
          {part}
        </span>
      );
    });
  }

  function renderFiles(list: Attachment[]) {
    if (!list.length) return null;
    return (
      <div className="mt-1.5 flex flex-wrap gap-2">
        {list.map((a) => {
          const url = urls[a.path];
          if (isImage(a)) {
            return (
              <a key={a.path} href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-slate-200 bg-slate-50" title={a.name}>
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={a.name} className="max-h-60 max-w-[280px] object-contain" loading="lazy" />
                ) : (
                  <span className="flex h-24 w-40 items-center justify-center text-xs text-slate-400">Loading image…</span>
                )}
              </a>
            );
          }
          return (
            <a
              key={a.path}
              href={url ? `${url}&download=${encodeURIComponent(a.name)}` : undefined}
              className="flex max-w-xs items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:border-brand-300"
            >
              <span aria-hidden>📄</span>
              <span className="min-w-0">
                <span className="block truncate font-medium text-slate-800">{a.name}</span>
                <span className="block text-xs text-slate-500">{fileSize(a.size)} · Download</span>
              </span>
            </a>
          );
        })}
      </div>
    );
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
            const mentionsMe = m.mentions.includes(meId);
            return (
              <li key={m.id}>
                {newDay && (
                  <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
                    <span className="h-px flex-1 bg-slate-200" />
                    {dayLabel(m.created_at, timezone)}
                    <span className="h-px flex-1 bg-slate-200" />
                  </div>
                )}
                <div className={cn("group flex gap-3 rounded-lg px-2 py-0.5 hover:bg-slate-50", !grouped && "mt-2", mentionsMe && !m.deleted_at && "bg-amber-50/60")}>
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
                      <>
                        {(m.body || m.edited_at) && (
                          <p className="whitespace-pre-wrap break-words text-sm text-slate-800">
                            {renderBody(m)}
                            {m.edited_at && <span className="ml-1 text-xs text-slate-400">(edited)</span>}
                          </p>
                        )}
                        {renderFiles(m.attachments)}
                      </>
                    )}
                  </div>
                  {!m.deleted_at && editing?.id !== m.id && (mine || canModerate) && (
                    <div className="flex shrink-0 items-start gap-2 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                      {mine && (
                        <button className="text-xs text-slate-400 hover:text-slate-700" onClick={() => setEditing({ id: m.id, body: m.body })}>Edit</button>
                      )}
                      <button className="text-xs text-slate-400 hover:text-red-600" onClick={() => void remove(m)}>Delete</button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <div
        className="border-t border-slate-200 p-3"
        onDragOver={(e) => canPost && e.dataTransfer.types.includes("Files") && e.preventDefault()}
        onDrop={(e) => {
          if (!canPost || !e.dataTransfer.files.length) return;
          e.preventDefault();
          addFiles(e.dataTransfer.files);
        }}
      >
        {error && <p role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-1.5 text-sm text-red-700">{error}</p>}
        {canPost ? (
          <>
            {files.length > 0 && (
              <ul className="mb-2 flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs">
                    <span aria-hidden>{f.type.startsWith("image/") ? "🖼️" : "📄"}</span>
                    <span className="max-w-[180px] truncate">{f.name}</span>
                    <span className="text-slate-400">{fileSize(f.size)}</span>
                    <button
                      type="button"
                      className="text-slate-400 hover:text-red-600"
                      aria-label={`Remove ${f.name}`}
                      onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form
              className="relative flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              {suggest && matches.length > 0 && (
                <ul role="listbox" aria-label="People to mention" className="absolute bottom-full left-10 z-20 mb-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg">
                  {matches.map((p, i) => (
                    <li key={p.id} role="option" aria-selected={i === suggest.index}>
                      <button
                        type="button"
                        className={cn("block w-full truncate px-3 py-1.5 text-left", i === suggest.index ? "bg-brand-50 text-brand-800" : "hover:bg-slate-50")}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          pickMention(p);
                        }}
                      >
                        @{p.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <input
                ref={fileRef}
                type="file"
                multiple
                accept={FILE_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                className="btn-secondary h-10 px-3"
                title={`Attach files (up to ${MAX_FILES}, ${fileSize(MAX_FILE_BYTES)} each)`}
                aria-label="Attach files"
                onClick={() => fileRef.current?.click()}
              >
                📎
              </button>
              <label htmlFor="chat-box" className="sr-only">Message</label>
              <textarea
                ref={boxRef}
                id="chat-box"
                className="input max-h-40 min-h-10 flex-1 resize-none"
                rows={1}
                maxLength={4000}
                placeholder={placeholder}
                value={draft}
                onChange={(e) => onDraftChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
                onPaste={(e) => {
                  if (e.clipboardData.files.length) {
                    e.preventDefault();
                    addFiles(e.clipboardData.files);
                  }
                }}
                onBlur={() => setTimeout(() => setSuggest(null), 150)}
                onKeyDown={(e) => {
                  if (suggest && matches.length) {
                    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                      e.preventDefault();
                      const step = e.key === "ArrowDown" ? 1 : -1;
                      setSuggest({ ...suggest, index: (suggest.index + step + matches.length) % matches.length });
                      return;
                    }
                    if (e.key === "Enter" || e.key === "Tab") {
                      e.preventDefault();
                      pickMention(matches[suggest.index] ?? matches[0]);
                      return;
                    }
                    if (e.key === "Escape") {
                      setSuggest(null);
                      return;
                    }
                  }
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <button className="btn-primary" disabled={sending || (!draft.trim() && !files.length)}>
                {sending ? (files.length ? "Uploading…" : "Sending…") : "Send"}
              </button>
            </form>
          </>
        ) : (
          <p className="px-2 py-1 text-sm text-slate-500">{cannotPostReason}</p>
        )}
        {canPost && (
          <p className="mt-1 px-1 text-[11px] text-slate-400">
            Enter to send · Shift + Enter for a new line{mentionable.length > 0 && " · @ to mention someone"} · drop or paste files to attach
          </p>
        )}
      </div>
    </>
  );
}
