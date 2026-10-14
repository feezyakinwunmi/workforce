import type { Metadata } from "next";
import Link from "next/link";
import { channelTitle, KIND_ICON, type ChannelRow } from "@/lib/chat";
import { requireMember } from "@/lib/session";
import { loadPeople } from "@/lib/tracking";
import { initials } from "@/lib/utils";
import { ChatSidebarLink, LiveRefresh } from "./live";

export const metadata: Metadata = { title: "Chat" };

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const { supabase, member: me } = await requireMember();
  const [{ data }, { profiles }, { data: online }] = await Promise.all([
    supabase.rpc("my_channels"),
    loadPeople(supabase, { includeRemoved: true }),
    supabase.rpc("online_member_ids"),
  ]);
  const channels = ((data ?? []) as ChannelRow[]).filter((c) => !c.archived);
  const onlineIds = new Set((online ?? []) as string[]);
  const groups = channels.filter((c) => c.kind !== "direct");
  const directs = channels.filter((c) => c.kind === "direct");

  return (
    <div className="grid gap-4 md:grid-cols-[230px_1fr]">
      <LiveRefresh />
      <aside className="card h-fit p-3 md:sticky md:top-8">
        <div className="mb-2 flex items-center justify-between px-2">
          <h1 className="font-semibold">Chat</h1>
          <Link href="/dashboard/chat/new" className="btn-secondary btn-sm" title="New message or group">+ New</Link>
        </div>
        <p className="px-2 pt-2 text-xs font-medium uppercase tracking-wide text-slate-400">Channels</p>
        <ul className="mt-1 space-y-0.5">
          {groups.map((c) => (
            <li key={c.id}>
              <ChatSidebarLink href={`/dashboard/chat/${c.id}`} unread={c.unread}>
                <span className="w-4 shrink-0 text-center text-slate-400" aria-hidden>{KIND_ICON[c.kind]}</span>
                <span className="truncate">{channelTitle(c, profiles)}</span>
              </ChatSidebarLink>
            </li>
          ))}
        </ul>
        <p className="px-2 pt-4 text-xs font-medium uppercase tracking-wide text-slate-400">Direct messages</p>
        <ul className="mt-1 space-y-0.5">
          {directs.length === 0 && (
            <li className="px-2 py-1 text-xs text-slate-400">
              <Link className="hover:text-brand-700" href="/dashboard/chat/new">Message someone</Link>
            </li>
          )}
          {directs.map((c) => {
            const p = c.other_user_id ? profiles.get(c.other_user_id) : undefined;
            return (
              <li key={c.id}>
                <ChatSidebarLink href={`/dashboard/chat/${c.id}`} unread={c.unread}>
                  <span className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[9px] font-semibold text-slate-700">
                    {initials(p?.full_name ?? "", p?.email ?? "")}
                    {c.other_user_id && onlineIds.has(c.other_user_id) && (
                      <span className="absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full border border-surface bg-emerald-500" aria-label="Working now" />
                    )}
                  </span>
                  <span className="truncate">{channelTitle(c, profiles)}</span>
                </ChatSidebarLink>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 px-2 text-[11px] leading-4 text-slate-400">
          {me.role === "worker" ? "" : "Admins can't read direct messages or groups they're not in. "}Green dot = working now.
        </p>
      </aside>
      <section className="min-w-0">{children}</section>
    </div>
  );
}
