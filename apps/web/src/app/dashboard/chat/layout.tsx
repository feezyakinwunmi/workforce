import type { Metadata } from "next";
import Link from "next/link";
import { channelTitle, KIND_ICON, type ChannelRow } from "@/lib/chat";
import { requireMember } from "@/lib/session";
import { loadPeople } from "@/lib/tracking";
import { Icon } from "@/components/icons";
import { Avatar } from "@/components/ui";
import { ChatSidebarLink } from "./live";

export const metadata: Metadata = { title: "Chat" };

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const { supabase } = await requireMember();
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
      <aside className="card h-fit p-3 md:sticky md:top-8">
        <div className="mb-3 flex items-center justify-between px-2 pt-1">
          <h1 className="section-title">Chat</h1>
          <Link href="/dashboard/chat/new" className="btn-primary btn-sm" title="New message or group">
            <Icon name="plus" className="h-3.5 w-3.5" />
            New
          </Link>
        </div>
        <form action="/dashboard/chat/search" role="search" className="relative mb-2 px-1">
          <Icon name="search" className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input name="q" type="search" placeholder="Search messages" aria-label="Search messages" minLength={2} maxLength={100} className="input py-1.5 pl-8 text-sm" />
        </form>
        <p className="px-2 pt-2 text-xs font-medium text-slate-400">Groups</p>
        <ul className="mt-1 space-y-0.5">
          {groups.map((c) => (
            <li key={c.id}>
              <ChatSidebarLink href={`/dashboard/chat/${c.id}`} unread={c.unread}>
                <Icon name={KIND_ICON[c.kind]} className="h-4 w-4 text-slate-400" />
                <span className="truncate">{channelTitle(c, profiles)}</span>
              </ChatSidebarLink>
            </li>
          ))}
        </ul>
        <p className="px-2 pt-4 text-xs font-medium text-slate-400">Direct messages</p>
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
                  <Avatar name={p?.full_name} email={p?.email} size="sm" status={c.other_user_id && onlineIds.has(c.other_user_id) ? "working" : undefined} />
                  <span className="truncate">{channelTitle(c, profiles)}</span>
                </ChatSidebarLink>
              </li>
            );
          })}
        </ul>
      </aside>
      <section className="min-w-0">{children}</section>
    </div>
  );
}
