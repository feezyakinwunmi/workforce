"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient, realtimeClient } from "@/lib/supabase/client";
import { workerTicker } from "./ticker";
import { PARTICIPANT_COLUMNS, ROOM_COLUMNS, type MeetEvent, type Participant, type PingResult, type RoomRow } from "./types";

export type PersonLink = "ok" | "reconnecting";

/**
 * Live state of one meeting: people (admitted + waiting), the room, chat/reactions and host
 * commands. Supabase Realtime pushes changes; a regular check fills gaps (every 2 s while
 * Realtime is down, every 12 s otherwise). A heartbeat every 8 s keeps me "in the meeting";
 * everyone's heartbeats are read every 4 s to show who is reconnecting.
 *
 * Times are compared on the server's clock (phones and laptops are often a minute off), so a
 * wrong device clock never makes people vanish.
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
  const skew = useRef(0); // server clock − this device's clock (ms)
  const [lastPingOk, setLastPingOk] = useState(() => Date.now());
  const [online, setOnline] = useState(true);
  // When I last managed to read everyone's heartbeats. If that's old (my tab was asleep, my
  // network dropped), I can't judge anyone else, so nobody is shown as gone because of it.
  const [presenceAt, setPresenceAt] = useState(0);

  const loadPeople = useCallback(async () => {
    const supabase = createClient();
    const [{ data: ps }, { data: pres }, { data: r }] = await Promise.all([
      supabase.from("meet_participants").select(PARTICIPANT_COLUMNS).eq("room_id", roomId).in("status", ["admitted", "waiting"]),
      supabase.from("meet_presence").select("participant_id, last_seen_at").eq("room_id", roomId),
      supabase.from("meet_rooms").select(ROOM_COLUMNS).eq("id", roomId).maybeSingle(),
    ]);
    if (ps) setPeople(ps as Participant[]);
    if (pres) {
      setSeen(Object.fromEntries((pres as Array<{ participant_id: string; last_seen_at: string }>).map((p) => [p.participant_id, Date.parse(p.last_seen_at)])));
      setPresenceAt(Date.now());
    }
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

  const loadPresence = useCallback(async () => {
    const { data: pres } = await createClient().from("meet_presence").select("participant_id, last_seen_at").eq("room_id", roomId);
    if (pres) {
      setSeen(Object.fromEntries((pres as Array<{ participant_id: string; last_seen_at: string }>).map((p) => [p.participant_id, Date.parse(p.last_seen_at)])));
      setPresenceAt(Date.now());
    }
  }, [roomId]);

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

    // Keeps going while the tab is in the background (someone sharing their screen usually has
    // this tab hidden). It used to pause there, so after 90 s everyone else looked "gone" and
    // their sound and video were dropped until the tab was opened again.
    const stopPoll = workerTicker(2000, () => {
      if (stopped) return;
      ticks++;
      if (!live || ticks % 6 === 0) {
        void loadEvents();
        void loadPeople();
      } else if (ticks % 2 === 0) void loadPresence();
    });

    // Heartbeat (+ any pending state changes).
    const ping = async () => {
      const p = patch.current;
      patch.current = {};
      const sent = Date.now();
      let data: unknown = null;
      let error: unknown = null;
      try {
        ({ data, error } = await createClient().rpc("meet_ping", { p_room: roomId, p_patch: p }));
      } catch (e) {
        error = e;
      }
      if (error) {
        patch.current = { ...p, ...patch.current };
        return;
      }
      const res = data as PingResult | null;
      if (res) {
        const got = Date.now();
        if (res.server_time) skew.current = Date.parse(res.server_time) - (sent + got) / 2;
        setMe(res);
      }
      setLastPingOk(Date.now());
    };
    pingNow.current = () => void ping();
    void ping();
    // Every 8 s; every 3 s while the last heartbeat failed (to notice quickly when we're back).
    let n = 0;
    const stopBeat = workerTicker(3000, () => {
      const failing = Date.now() - lastOk.current > 10_000;
      if (failing || ++n % 3 === 0) void ping();
    });

    // Back online / back to the tab: catch up at once.
    const catchUp = () => {
      setOnline(navigator.onLine);
      if (!navigator.onLine) return;
      void ping();
      void loadPeople();
      void loadEvents();
    };
    window.addEventListener("online", catchUp);
    window.addEventListener("offline", catchUp);
    document.addEventListener("visibilitychange", catchUp);

    return () => {
      stopped = true;
      stopPoll();
      stopBeat();
      window.removeEventListener("online", catchUp);
      window.removeEventListener("offline", catchUp);
      document.removeEventListener("visibilitychange", catchUp);
      if (channel) void createClient().removeChannel(channel);
    };
  }, [roomId, loadPeople, loadEvents, loadPresence, handleEvents]);

  const lastOk = useRef(Date.now());
  lastOk.current = lastPingOk;

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

  // On the server's clock: no heartbeat for 15 s = reconnecting; for 90 s = gone (the server
  // marks them as left after 2 minutes).
  // Only judged while my own reading of the heartbeats is fresh (see presenceAt).
  const fresh = Date.now() - presenceAt < 20_000;
  const now = Date.now() + skew.current;
  const age = (id: string) => (fresh && seen[id] ? now - seen[id] : 0);
  // Everyone the server counts as in the meeting. Media is received from all of them: a person is
  // only dropped when the server says they left, never because of a late heartbeat on my side.
  const admitted = people.filter((p) => p.status === "admitted");
  const inRoom = admitted.filter((p) => p.id === meId || age(p.id) < 90_000);
  const waiting = people.filter((p) => p.status === "waiting" && age(p.id) < 60_000);
  const links: Record<string, PersonLink> = {};
  for (const p of inRoom) links[p.id] = p.id !== meId && age(p.id) > 15_000 ? "reconnecting" : "ok";
  // My own link: heartbeat answered in the last 20 s and the device says it's online.
  const meOnline = online && Date.now() - lastPingOk < 20_000;

  return { people: inRoom, admitted, waiting, room, chat, reactions, me, update, send, moderate, refresh: loadPeople, links, meOnline, online };
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
