"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient, realtimeClient } from "@/lib/supabase/client";
import { PARTICIPANT_COLUMNS, ROOM_COLUMNS, type MeetEvent, type Participant, type PingResult, type RoomRow } from "./types";

/**
 * Live state of one meeting: people (admitted + waiting), the room, chat/reactions and host
 * commands. Supabase Realtime pushes changes; a regular check fills gaps (every 2 s while
 * Realtime is down, every 12 s otherwise). A heartbeat every 8 s keeps me "in the meeting".
 */
export function useRoom(roomId: string, meId: string, onCommand: (e: MeetEvent) => void) {
  const [people, setPeople] = useState<Participant[]>([]);
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [chat, setChat] = useState<MeetEvent[]>([]);
  const [reactions, setReactions] = useState<Array<MeetEvent & { at: number }>>([]);
  const [seen, setSeen] = useState<Record<string, number>>({}); // participant -> last seen (ms)
  const [me, setMe] = useState<PingResult | null>(null);
  const lastEvent = useRef<number | null>(null); // events after this id are new
  const commandRef = useRef(onCommand);
  commandRef.current = onCommand;
  const patch = useRef<Record<string, unknown>>({});
  const pingNow = useRef<() => void>(() => {});

  const loadPeople = useCallback(async () => {
    const supabase = createClient();
    const [{ data: ps }, { data: pres }, { data: r }] = await Promise.all([
      supabase.from("meet_participants").select(PARTICIPANT_COLUMNS).eq("room_id", roomId).in("status", ["admitted", "waiting"]),
      supabase.from("meet_presence").select("participant_id, last_seen_at").eq("room_id", roomId),
      supabase.from("meet_rooms").select(ROOM_COLUMNS).eq("id", roomId).maybeSingle(),
    ]);
    if (ps) setPeople(ps as Participant[]);
    if (pres) setSeen(Object.fromEntries((pres as Array<{ participant_id: string; last_seen_at: string }>).map((p) => [p.participant_id, Date.parse(p.last_seen_at)])));
    if (r) setRoom(r as RoomRow);
  }, [roomId]);

  const handleEvents = useCallback((rows: MeetEvent[], initial: boolean) => {
    if (!rows.length) return;
    const fresh = rows.filter((e) => lastEvent.current === null || e.id > lastEvent.current);
    lastEvent.current = Math.max(lastEvent.current ?? 0, ...rows.map((e) => e.id));
    const chats = fresh.filter((e) => e.kind === "chat");
    if (chats.length) setChat((prev) => [...prev, ...chats.filter((c) => !prev.some((p) => p.id === c.id))].slice(-300));
    if (initial) return; // old reactions and commands don't replay
    const now = Date.now();
    const rx = fresh.filter((e) => e.kind === "reaction");
    if (rx.length) setReactions((prev) => [...prev.filter((r) => now - r.at < 4000), ...rx.map((r) => ({ ...r, at: now }))]);
    for (const e of fresh) if (!["chat", "reaction"].includes(e.kind)) commandRef.current(e);
  }, []);

  const loadEvents = useCallback(
    async (initial = false) => {
      const supabase = createClient();
      let q = supabase.from("meet_events").select("*").eq("room_id", roomId).order("id", { ascending: true }).limit(300);
      if (lastEvent.current !== null) q = q.gt("id", lastEvent.current);
      const { data } = await q;
      handleEvents((data ?? []) as MeetEvent[], initial);
    },
    [roomId, handleEvents],
  );

  useEffect(() => {
    let stopped = false;
    let live = false;
    let channel: RealtimeChannel | null = null;
    let ticks = 0;
    void loadPeople();
    void loadEvents(true);

    void realtimeClient().then((supabase) => {
      if (stopped) return;
      channel = supabase
        .channel(`meet-${roomId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "meet_participants", filter: `room_id=eq.${roomId}` }, () => void loadPeople())
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "meet_rooms", filter: `id=eq.${roomId}` }, (p: { new: RoomRow }) => setRoom((r) => ({ ...(r ?? p.new), ...p.new })))
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "meet_events", filter: `room_id=eq.${roomId}` }, (p: { new: MeetEvent }) => handleEvents([p.new], false))
        .subscribe((status: string) => {
          live = status === "SUBSCRIBED";
          if (live) {
            void loadPeople();
            void loadEvents();
          }
        });
    });

    const poll = setInterval(() => {
      if (stopped || document.visibilityState !== "visible") return;
      ticks++;
      if (!live || ticks % 6 === 0) {
        void loadEvents();
        void loadPeople();
      }
    }, 2000);

    // Heartbeat (+ any pending state changes).
    const ping = async () => {
      const p = patch.current;
      patch.current = {};
      const { data, error } = await createClient().rpc("meet_ping", { p_room: roomId, p_patch: p });
      if (error) {
        patch.current = { ...p, ...patch.current };
        return;
      }
      if (data) setMe(data as PingResult);
    };
    pingNow.current = () => void ping();
    void ping();
    const beat = setInterval(() => void ping(), 8000);

    return () => {
      stopped = true;
      clearInterval(poll);
      clearInterval(beat);
      if (channel) void createClient().removeChannel(channel);
    };
  }, [roomId, loadPeople, loadEvents, handleEvents]);

  /** Change my state (mic, camera, hand, tracks…); sent at once. */
  const update = useCallback((p: Record<string, unknown>) => {
    patch.current = { ...patch.current, ...p };
    pingNow.current();
  }, []);

  const send = useCallback(
    async (kind: "chat" | "reaction", body: string) => {
      const { error } = await createClient().rpc("meet_send", { p_room: roomId, p_kind: kind, p_body: body });
      if (!error) void loadEvents();
      return error?.message ?? null;
    },
    [roomId, loadEvents],
  );

  const moderate = useCallback(
    async (action: string, target?: string) => {
      const { error } = await createClient().rpc("meet_moderate", { p_room: roomId, p_action: action, p_target: target ?? null });
      void loadPeople();
      void loadEvents();
      return error?.message ?? null;
    },
    [roomId, loadPeople, loadEvents],
  );

  // Someone admitted but silent for 30 s has probably dropped: hide them until they're back.
  const now = Date.now();
  const inRoom = people.filter((p) => p.status === "admitted" && (p.id === meId || !seen[p.id] || now - seen[p.id] < 30_000));
  const waiting = people.filter((p) => p.status === "waiting" && (!seen[p.id] || now - seen[p.id] < 30_000));

  return { people: inRoom, waiting, room, chat, reactions, me, update, send, moderate, refresh: loadPeople };
}

/** Leave even when the tab is closing (keepalive request). */
export async function leaveOnUnload(roomId: string) {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return;
  void fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/meet_leave`, {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ p_room: roomId }),
  });
}
