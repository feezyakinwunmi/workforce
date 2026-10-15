import type { ChannelRow } from "@/lib/chat";
import { requireMember } from "@/lib/session";
import { OpenFirst } from "./live";

/**
 * /dashboard/chat: on a phone the layout shows the list of chats; on wider screens this opens
 * the first unread conversation, or #general.
 */
export default async function ChatHome() {
  const { supabase } = await requireMember();
  const { data } = await supabase.rpc("my_channels");
  const channels = ((data ?? []) as ChannelRow[]).filter((c) => !c.archived);
  const target = channels.find((c) => c.unread > 0) ?? channels.find((c) => c.kind === "public") ?? channels[0];
  return (
    <>
      {target && <OpenFirst href={`/dashboard/chat/${target.id}`} />}
      <div className="card p-8 text-center text-sm text-slate-500">
        {target ? "Opening your chats…" : "Chat isn't ready yet. Refresh in a moment."}
      </div>
    </>
  );
}
