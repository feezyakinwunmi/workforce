/** simulcast: camera sent in two sizes ("a" sharp, "b" small). name may carry a number ("camera.2"). */
export type MeetTrack = { name: string; kind: "audio" | "video"; simulcast?: boolean };

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

/** A celebration the host or a co-host sent (meet_shoutouts). */
export type Shoutout = {
  id: number;
  room_id: string;
  sender_id: string | null;
  target_id: string | null;
  name: string;
  style: "shoutout" | "birthday" | "welldone" | "welcome";
  message: string | null;
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
  cameras_off?: boolean;
  ai_notes_since?: string | null;
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
  /** Cameras are off in this meeting (the host's meeting time for the month is used up). */
  cameras_off?: boolean;
  /** Only for the host, before starting: % of this month's meeting time used. */
  usage_percent?: number | null;
  /** AI notes are on in this meeting (everyone is told). */
  ai_notes?: boolean;
  /** My own AI notes hours (Pro Max only, else null). */
  my_ai?: AiStatus | null;
};

export type JoinResult = {
  participant_id: string;
  room_id: string;
  status: Participant["status"];
  role: Participant["role"];
  name: string;
  ends_at: string | null;
  cameras_off?: boolean;
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

/** Meeting time is counted in person-hours: people in the meeting × hours (seconds here). */
export type MeetUsage = {
  included: number;
  used: number;
  topup_left: number;
  left: number;
  percent: number;
  resets_at: string;
};

/** AI notes hours (Pro Max), in seconds. */
export type AiStatus = { included: number; used: number; left: number; percent: number; resets_at: string };

/** What AI notes keep: the summary only (no sound, no transcript). */
export type NoteSummary = {
  title: string;
  overview: string;
  key_points: string[];
  decisions: string[];
  action_items: Array<{ task: string; owner: string; due: string }>;
  questions: string[];
  language: string | null;
  people: string[];
  minutes: number;
};

export type MeetNote = {
  id: string;
  room_id: string | null;
  title: string;
  status: "recording" | "queued" | "processing" | "transcribing" | "ready" | "failed" | "empty";
  started_at: string;
  stopped_at: string | null;
  seconds: number;
  summary: NoteSummary | null;
  error: string | null;
  created_at: string;
};

export type MeetPlan = {
  tier: "free" | "pro";
  promax?: boolean;
  promax_price_kobo?: number;
  ai?: AiStatus;
  pro_price_kobo: number;
  business_price_kobo: number;
  topup_price_kobo?: number;
  paid_until: string | null;
  org_id: string | null;
  is_org_admin: boolean;
  pool_kind?: "personal" | "company";
  company_name?: string | null;
  can_top_up?: boolean;
  usage?: MeetUsage;
};

/** Plan facts for the pages (the database decides). */
export const MEET_BUSINESS_HOSTS = 10;
export const MEET_AI_HOURS = 10;

/** "12.5" hours, rounded down to a tenth. */
export const hours = (seconds: number) => {
  const h = Math.floor((seconds / 3600) * 10) / 10;
  return h.toLocaleString("en-GB", { maximumFractionDigits: 1 });
};

export const REACTIONS = ["👍", "❤️", "😂", "👏", "🎉", "😮", "🙏", "🔥"] as const;

export const PARTICIPANT_COLUMNS =
  "id, room_id, user_id, display_name, is_guest, role, status, sfu_session, tracks, audio_on, video_on, screen_on, hand_raised_at, joined_at, recording_since";
export const ROOM_COLUMNS = "id, code, title, host_id, waiting_room, allow_guests, locked, started_at, ends_at, ended_at, cameras_off, ai_notes_since";

export const naira = (kobo: number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(kobo / 100);
