"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { startChatMeeting } from "./actions";

/** Starts a Workbase Meet call for this chat and opens it in a new tab. */
export function MeetButton({ channelId, title }: { channelId: string; title: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        type="button"
        className="btn-secondary btn-sm"
        disabled={busy}
        title="Start a video meeting and post the link here"
        onClick={async () => {
          setBusy(true);
          setError(null);
          // Open the tab now (browsers block tabs opened later), then point it at the meeting.
          const tab = window.open("", "_blank");
          const res = await startChatMeeting(channelId, title);
          setBusy(false);
          if (res.link) {
            if (tab) tab.location.href = res.link;
            else window.location.href = res.link;
          } else tab?.close();
          if (res.error) setError(res.error);
        }}
      >
        <Icon name="video" className="h-3.5 w-3.5" />
        {busy ? "Starting…" : "Meet"}
      </button>
    </span>
  );
}
