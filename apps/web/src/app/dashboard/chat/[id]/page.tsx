import Link from "next/link";
import { notFound } from "next/navigation";
import { channelTitle, KIND_ICON, MESSAGE_COLUMNS, PAGE_SIZE, type ChannelKind, type ChatMessage } from "@/lib/chat";
import { requireMember } from "@/lib/session";
import { isManagerOrAdmin } from "@/lib/tasks";
import { displayName, loadPeople } from "@/lib/tracking";
import { isAdminRole } from "@/lib/types";
import { initials } from "@/lib/utils";
import { ConfirmSubmit } from "../../team/forms";
import { addMembers, archiveChannel, removeMember } from "../actions";
import { ChatRoom, type Person } from "./room";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Channel = { id: string; kind: ChannelKind; name: string | null; description: string | null; archived_at: string | null };

export default async function ChannelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const { supabase, member: me } = await requireMember();

  const { data: channelRow } = await supabase
    .from("channels")
    .select("id, kind, name, description, archived_at")
    .eq("id", id)
    .maybeSingle();
  if (!channelRow) notFound();
  const channel = channelRow as Channel;

  const [{ data: messageRows }, { data: memberRows }, { members, profiles }, { data: online }] = await Promise.all([
    supabase.from("messages").select(MESSAGE_COLUMNS).eq("channel_id", id).order("created_at", { ascending: false }).limit(PAGE_SIZE),
    supabase.from("channel_members").select("user_id, role").eq("channel_id", id),
    loadPeople(supabase, { includeRemoved: true }),
    supabase.rpc("online_member_ids"),
    supabase.rpc("mark_channel_read", { p_channel: id }),
  ]);
  const messages = ((messageRows ?? []) as ChatMessage[]).reverse();
  const channelMembers = (memberRows ?? []) as Array<{ user_id: string; role: "member" | "admin" }>;
  const memberIds = new Set(channelMembers.map((m) => m.user_id));
  const onlineIds = new Set((online ?? []) as string[]);

  const manager = isManagerOrAdmin(me);
  const isMember = memberIds.has(me.user_id);
  const groupAdmin = channelMembers.some((m) => m.user_id === me.user_id && m.role === "admin") || (manager && isMember);
  const canPost =
    !channel.archived_at &&
    (channel.kind === "public" || (channel.kind === "announcements" ? manager : isMember));

  const otherId = channel.kind === "direct" ? channelMembers.find((m) => m.user_id !== me.user_id)?.user_id ?? null : null;
  const title = channelTitle({ kind: channel.kind, name: channel.name, other_user_id: otherId }, profiles);

  const people: Record<string, Person> = {};
  for (const [pid, p] of profiles) people[pid] = { name: displayName(p), initials: initials(p.full_name ?? "", p.email ?? "") };
  const active = members.filter((m) => m.status === "active");
  const addable = active.filter((m) => !memberIds.has(m.user_id));

  return (
    <div className="card flex h-[calc(100vh-8rem)] min-h-[480px] flex-col overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 truncate font-semibold">
            {channel.kind !== "direct" && <span className="text-slate-400" aria-hidden>{KIND_ICON[channel.kind]}</span>}
            {title}
            {otherId && onlineIds.has(otherId) && <span className="badge bg-emerald-100 text-emerald-800">Working now</span>}
            {channel.archived_at && <span className="badge bg-slate-100 text-slate-500">Archived</span>}
          </h2>
          {channel.description && <p className="truncate text-xs text-slate-500">{channel.description}</p>}
          {channel.kind === "direct" && <p className="text-xs text-slate-500">Private: only the two of you can read this.</p>}
        </div>
        {(channel.kind === "private" || (manager && channel.kind !== "direct" && channel.kind !== "announcements")) && (
          <details className="relative">
            <summary className="btn-secondary btn-sm cursor-pointer list-none">
              {channel.kind === "private" ? `${channelMembers.length} members` : "Settings"}
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-72 space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-lg">
              {channel.kind === "private" && (
                <ul className="max-h-56 space-y-1.5 overflow-y-auto">
                  {channelMembers.map((m) => (
                    <li key={m.user_id} className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${onlineIds.has(m.user_id) ? "bg-emerald-500" : "bg-slate-200"}`} aria-hidden />
                        <span className="truncate">{people[m.user_id]?.name ?? "Unknown"}</span>
                        {m.role === "admin" && <span className="text-xs text-slate-400">admin</span>}
                      </span>
                      {groupAdmin && m.user_id !== me.user_id && (
                        <form action={removeMember}>
                          <input type="hidden" name="channel_id" value={id} />
                          <input type="hidden" name="user_id" value={m.user_id} />
                          <button className="text-xs text-slate-400 hover:text-red-600">Remove</button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {channel.kind === "private" && groupAdmin && addable.length > 0 && (
                <form action={addMembers} className="space-y-2 border-t border-slate-100 pt-3">
                  <input type="hidden" name="channel_id" value={id} />
                  <p className="font-medium">Add people</p>
                  <div className="max-h-40 space-y-1 overflow-y-auto">
                    {addable.map((m) => (
                      <label key={m.user_id} className="flex items-center gap-2">
                        <input type="checkbox" name="member_ids" value={m.user_id} />
                        {people[m.user_id]?.name ?? "Unknown"}
                      </label>
                    ))}
                  </div>
                  <button className="btn-primary btn-sm">Add</button>
                </form>
              )}
              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                {channel.kind === "private" && isMember && (
                  <form action={removeMember}>
                    <input type="hidden" name="channel_id" value={id} />
                    <input type="hidden" name="user_id" value={me.user_id} />
                    <ConfirmSubmit message={`Leave ${title}? You won't see its messages any more.`} className="btn-secondary btn-sm">Leave group</ConfirmSubmit>
                  </form>
                )}
                {manager && !channel.archived_at && (
                  <form action={archiveChannel}>
                    <input type="hidden" name="channel_id" value={id} />
                    <ConfirmSubmit message={`Archive ${title}? Its messages are kept but nobody can post.`}>Archive</ConfirmSubmit>
                  </form>
                )}
              </div>
            </div>
          </details>
        )}
      </header>

      {error && <p role="alert" className="bg-red-50 px-5 py-2 text-sm text-red-700">{error}</p>}

      <ChatRoom
        key={id}
        channelId={id}
        meId={me.user_id}
        initial={messages}
        hasMore={messages.length === PAGE_SIZE}
        people={people}
        canPost={canPost}
        canModerate={isAdminRole(me.role) && channel.kind !== "direct"}
        timezone={me.timezone}
        cannotPostReason={
          channel.archived_at
            ? "This group is archived."
            : channel.kind === "announcements"
              ? "Only managers and admins post announcements."
              : "You're not a member of this group."
        }
        placeholder={channel.kind === "direct" ? `Message ${title}` : channel.kind === "announcements" ? "Write an announcement for everyone" : `Message #${title}`}
      />
      {channel.kind === "announcements" && (
        <p className="border-t border-slate-100 px-5 py-2 text-xs text-slate-400">
          Everyone in the company gets a notification for each announcement. <Link className="underline" href="/dashboard/notifications">Notifications</Link>
        </p>
      )}
    </div>
  );
}
