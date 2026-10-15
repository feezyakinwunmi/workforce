"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { createClient, realtimeClient } from "@/lib/supabase/client";

/**
 * Keeps the dashboard's badges and lists fresh without pressing refresh:
 * a new chat message refreshes the page data at once (Supabase Realtime), and a light
 * check of unread counts every 20 s catches notifications and anything Realtime missed.
 */
export function LiveUpdates({ meId }: { meId: string }) {
  const router = useRouter();
  const path = usePathname();
  const pathRef = useRef(path);
  pathRef.current = path;

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let hiddenAt = 0;
    let last: string | null = null;
    const refresh = (delay = 700) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => !stopped && router.refresh(), delay);
    };

    let unsubscribe: (() => void) | null = null;
    void realtimeClient().then((supabase) => {
      if (stopped) return;
      const channel = supabase
        .channel(`live-${meId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload: { new: { channel_id?: string } }) => {
          // The open chat room shows its own messages; refresh only for other conversations.
          if (pathRef.current === `/dashboard/chat/${payload.new.channel_id}`) return;
          refresh();
        })
        .subscribe();
      unsubscribe = () => void supabase.removeChannel(channel);
    });

    // Unread counts, compared with the last check: refresh only when something changed.
    async function check() {
      if (document.visibilityState !== "visible" || stopped) return;
      const supabase = createClient();
      const [{ count }, { data }] = await Promise.all([
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", meId).is("read_at", null),
        supabase.rpc("my_channels"),
      ]);
      const chats = ((data ?? []) as Array<{ id: string; unread: number; last_message_at: string | null }>)
        .map((c) => `${c.id}:${c.unread}:${c.last_message_at ?? ""}`)
        .join("|");
      const now = `${count ?? 0}#${chats}`;
      if (last !== null && now !== last) refresh(0);
      last = now;
    }
    void check();
    const poll = setInterval(() => void check(), 20_000);

    // Coming back to the tab after a while: fetch fresh data straight away.
    const onVisible = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 15_000) refresh(0);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      unsubscribe?.();
    };
  }, [meId, router]);

  return null;
}
