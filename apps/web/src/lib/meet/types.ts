export type MeetTrack = { name: "mic" | "camera" | "screen"; kind: "audio" | "video" };

export type Participant = {
  id: string;
  room_id: string;
  user_id: string;
  display_name: string;
  is_guest: boolean;
  role: "host" | "cohost" | "member";
  status: "waiting" | "admitted" | "denied" | "removed" | "left";
  sfu_session: string | null;
  tracks: MeetTrack[];
  audio_on: boolean;
  video_on: boolean;
  screen_on: boolean;
  hand_raised_at: string | null;
  joined_at: string;
  recording_since: string | null; // recording this meeting on their device (host/co-host)
};

export type MeetEvent = {
  id: number;
  room_id: string;
  sender_id: string | null;
  kind: "chat" | "reaction" | "mute" | "remove" | "end" | "lower_hand" | "stop_screen";
  target_id: string | null;
  body: string | null;
  created_at: string;
};

export type RoomRow = {
  id: string;
  code: string;
  title: string;
  host_id: string;
  waiting_room: boolean;
  allow_guests: boolean;
  locked: boolean;
  started_at: string | null;
  ends_at: string | null;
  ended_at: string | null;
};

export type RoomInfo = {
  id: string;
  code: string;
  title: string;
  host_name: string;
  is_host: boolean;
  starts_at: string | null;
  started: boolean;
  ended: boolean;
  ends_at: string | null;
  locked: boolean;
  allow_guests: boolean;
  waiting_room: boolean;
  host_tier: "free" | "pro";
  limit_minutes: number;
  my_status: Participant["status"] | null;
  my_name: string | null;
  in_meeting: number;
  recording?: boolean;
};

export type JoinResult = {
  participant_id: string;
  room_id: string;
  status: Participant["status"];
  role: Participant["role"];
  name: string;
  ends_at: string | null;
  server_time: string;
};

export type PingResult = {
  status: Participant["status"];
  role: Participant["role"];
  ends_at: string | null;
  ended: boolean;
  locked: boolean;
  waiting_room: boolean;
  server_time: string;
};

export type MyMeeting = {
  id: string;
  code: string;
  title: string;
  starts_at: string | null;
  duration_minutes: number;
  started_at: string | null;
  ended_at: string | null;
  is_host: boolean;
  host_name: string;
  invites: number;
};

export type MeetPlan = {
  tier: "free" | "pro";
  pro_price_kobo: number;
  business_price_kobo: number;
  paid_until: string | null;
  org_id: string | null;
  is_org_admin: boolean;
};

export const REACTIONS = ["👍", "❤️", "😂", "👏", "🎉", "😮", "🙏", "🔥"] as const;

export const PARTICIPANT_COLUMNS =
  "id, room_id, user_id, display_name, is_guest, role, status, sfu_session, tracks, audio_on, video_on, screen_on, hand_raised_at, joined_at, recording_since";
export const ROOM_COLUMNS = "id, code, title, host_id, waiting_room, allow_guests, locked, started_at, ends_at, ended_at";

export const naira = (kobo: number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(kobo / 100);
