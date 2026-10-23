import type { MeetNote } from "@/lib/meet/types";

export const STATUS_TEXT: Record<MeetNote["status"], string> = {
  recording: "Recording",
  queued: "Writing…",
  processing: "Writing…",
  transcribing: "Writing…",
  ready: "Ready",
  failed: "Couldn't finish",
  empty: "Nothing to summarise",
};
