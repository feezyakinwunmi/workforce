import type { Profile } from "@/lib/types";
import { displayName } from "@/lib/tracking";

export type ChannelKind = "public" | "private" | "direct" | "announcements";

export type ChannelRow = {
  id: string;
  kind: ChannelKind;
  name: string | null;
  description: string | null;
  other_user_id: string | null;
  last_message_at: string | null;
  unread: number;
  archived: boolean;
  is_member: boolean;
};

export type ChatMessage = {
  id: string;
  channel_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

export const MESSAGE_COLUMNS = "id, channel_id, author_id, body, created_at, edited_at, deleted_at";
export const PAGE_SIZE = 50;

/** "# general", "Announcements", or the other person's name for a direct message. */
export function channelTitle(c: Pick<ChannelRow, "kind" | "name" | "other_user_id">, profiles: Map<string, Profile>) {
  if (c.kind === "direct") return c.other_user_id ? displayName(profiles.get(c.other_user_id)) : "Direct message";
  return c.name ?? "Channel";
}

export const KIND_ICON: Record<ChannelKind, string> = {
  public: "#",
  private: "🔒",
  announcements: "📣",
  direct: "",
};
