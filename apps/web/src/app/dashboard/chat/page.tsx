import { redirect } from "next/navigation";
import type { ChannelRow } from "@/lib/chat";
import { requireMember } from "@/lib/session";

/** /dashboard/chat opens the first unread conversation, or #general. */
export default async function ChatHome() {
  const { supabase } = await requireMember();
  const { data } = await supabase.rpc("my_channels");
  const channels = ((data ?? []) as ChannelRow[]).filter((c) => !c.archived);
  const target = channels.find((c) => c.unread > 0) ?? channels.find((c) => c.kind === "public") ?? channels[0];
  if (target) redirect(`/dashboard/chat/${target.id}`);
  return (
    <div className="card p-8 text-center text-sm text-slate-500">
      Chat isn&apos;t ready yet. Refresh in a moment.
    </div>
  );
}
