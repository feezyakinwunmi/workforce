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
  attachments: Attachment[];
  mentions: string[];
};

/** A file in a message. Size and type are filled in by the database from Storage. */
export type Attachment = { path: string; name: string; size: number; type: string };

export const MESSAGE_COLUMNS = "id, channel_id, author_id, body, created_at, edited_at, deleted_at, attachments, mentions";

// Files: private bucket, path <company>/<chat>/<random>/<file name> (see migration 0016).
export const CHAT_BUCKET = "chat-files";
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES = 5;
export const ALLOWED_FILE_TYPES = [
  "image/png", "image/jpeg", "image/gif", "image/webp",
  "application/pdf", "text/plain", "text/csv", "application/zip",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];
export const FILE_ACCEPT = ".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.csv,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx";

export const isImage = (a: Pick<Attachment, "type">) => a.type.startsWith("image/");

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Storage-safe version of a file name (the original name is kept in the message). */
export function storageName(name: string) {
  const clean = name.normalize("NFKD").replace(/[^\w.\-]+/g, "_").replace(/^[._]+/, "").slice(-100);
  return clean || "file";
}
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
