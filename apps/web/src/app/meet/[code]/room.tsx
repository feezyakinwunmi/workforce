"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { LogoMark } from "@/components/logo";
import { blackVideoTrack, connectMedia, connectPublisher, readStats, signalScore, silentAudioTrack, sourceOf, watchLevel, type Publisher, type RemoteRef, type SendInfo, type Source, type Subscriber } from "@/lib/meet/engine";
import { meetingLink } from "@/lib/meet/paths";
import { canRecord, MeetRecorder, type RecordInputs } from "@/lib/meet/recorder";
import { downloadRecording, spaceLeft, type SavedRecording } from "@/lib/meet/recordings-store";
import { REACTIONS, type JoinResult, type MeetEvent, type Participant, type RoomInfo, type Shoutout } from "@/lib/meet/types";
import { workerTicker } from "@/lib/meet/ticker";
import { leaveOnUnload, useRoom, type PersonLink } from "@/lib/meet/use-room";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Celebration, ShoutoutDialog } from "./celebration";
import { avatarColour, DeviceSettings, initialsOf, VideoView, type LocalMedia } from "./meeting";

type ExitReason = "left" | "ended" | "removed" | "limit";
type RemoteMedia = Record<string, Partial<Record<Source, MediaStreamTrack>>>;
type Panel = "chat" | "people" | "settings" | null;

const clock = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** 00:24:01 — for the recording timer. */
const hhmmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":");
};

export function Room({ info, join, media, base, onExit }: { info: RoomInfo; join: JoinResult; media: LocalMedia; base: string; onExit: (r: ExitReason) => void }) {
  const roomId = join.room_id;
  const meId = join.participant_id;
  const [toasts, setToasts] = useState<Array<{ id: number; text: string; tone?: "warn" }>>([]);
  const toast = useCallback((text: string, tone?: "warn") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);
  const [hand, setHand] = useState(false);
  const [sharing, setSharing] = useState<MediaStreamTrack | null>(null);
  const exited = useRef(false);

  const exit = useCallback(
    (reason: ExitReason) => {
      if (exited.current) return;
      exited.current = true;
      onExit(reason);
    },
    [onExit],
  );

  const stopShareRef = useRef<() => void>(() => {});
  const onCommand = useCallback(
    (e: MeetEvent) => {
      if (e.sender_id === meId) return;
      if (e.kind === "mute" && (!e.target_id || e.target_id === meId)) {
        if (media.micOn) {
          media.setMicOn(false);
          toast(e.target_id ? "The host muted you." : "The host muted everyone.");
        }
      } else if (e.kind === "remove" && e.target_id === meId) exit("removed");
      else if (e.kind === "end") exit("ended");
      else if (e.kind === "lower_hand" && e.target_id === meId) {
        setHand(false);
        toast("The host lowered your hand.");
      } else if (e.kind === "stop_screen" && e.target_id === meId) {
        stopShareRef.current();
        toast("The host stopped your screen share.");
      }
    },
    [meId, media, toast, exit],
  );

  // Shout-outs: played one after another for everyone.
  const [shoutQueue, setShoutQueue] = useState<Shoutout[]>([]);
  const onShoutout = useCallback((s: Shoutout) => setShoutQueue((q) => (q.some((x) => x.id === s.id) ? q : [...q, s].slice(-5))), []);
  const [celebMuted, setCelebMuted] = useState(false);
  useEffect(() => {
    try {
      setCelebMuted(localStorage.getItem("meet-celebrate-muted") === "1");
    } catch {
      // private mode
    }
  }, []);
  const muteCelebrations = (m: boolean) => {
    setCelebMuted(m);
    try {
      localStorage.setItem("meet-celebrate-muted", m ? "1" : "0");
    } catch {
      // private mode
    }
  };
  const [shoutDialog, setShoutDialog] = useState<{ target: string | null } | null>(null);

  const { people, admitted, waiting, room, chat, reactions, me, update, send, moderate, refresh, links, meOnline, online } = useRoom(roomId, meId, onCommand, onShoutout);
  const myRole = me?.role ?? join.role;
  const isMod = myRole === "host" || myRole === "cohost";
  const endsAt = me?.ends_at ?? room?.ends_at ?? join.ends_at;

  // ----- media connection -------------------------------------------------
  const pub = useRef<Publisher | null>(null);
  const sub = useRef<Subscriber | null>(null);
  const black = useMemo(() => (typeof document === "undefined" ? null : blackVideoTrack()), []);
  const silence = useRef<MediaStreamTrack | null>(null);
  const pulled = useRef(new Map<string, RemoteRef>());
  const [retry, setRetry] = useState(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [remote, setRemote] = useState<RemoteMedia>({});
  const [connected, setConnected] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // My media link: connecting → ok, or reconnecting while it recovers by itself.
  const [mediaLink, setMediaLink] = useState<"connecting" | "ok" | "reconnecting">("connecting");
  const failures = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let retryTimer2: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      try {
        const micTrack = media.mic ?? (silence.current ??= silentAudioTrack());
        const camTrack = (media.camOn && media.camOut) || black!;
        const { pub: p, sub: s } = await connectMedia(roomId, micTrack, camTrack, media.dataSaver);
        if (cancelled) {
          p.close();
          s.close();
          return;
        }
        failures.current = 0;
        setConnectError(null);
        pub.current = p;
        sub.current = s;
        pulled.current.clear();
        setRemote({});
        s.onTrack = (ref, track) => setRemote((r) => ({ ...r, [ref.participantId]: { ...r[ref.participantId], [ref.source]: track } }));
        s.onRemoved = (ref) =>
          setRemote((r) => {
            const cur = { ...r[ref.participantId] };
            delete cur[ref.source];
            return { ...r, [ref.participantId]: cur };
          });
        // A track published again under a new name: tell the others so they receive the new one.
        p.onTracksChanged = () => update({ tracks: p.tracks() });
        s.onReset = () => {
          pulled.current.clear();
          setRetry((n) => n + 1);
        };
        setConnected(true);
        setMediaLink("ok");
        update({ sfu_session: p.session, tracks: p.tracks(), audio_on: media.micOn && !!media.mic, video_on: media.camOn });
      } catch (e) {
        if (cancelled) return;
        // Try again by itself: 1.5 s, 3 s, 6 s, then every 10 s.
        failures.current++;
        setMediaLink("reconnecting");
        if (failures.current >= 4) setConnectError(e instanceof Error ? e.message : "Couldn't connect to the meeting.");
        retryTimer2 = setTimeout(() => setAttempt((a) => a + 1), Math.min(10_000, 1500 * 2 ** Math.min(failures.current - 1, 3)));
      }
    })();
    return () => {
      cancelled = true;
      if (retryTimer2) clearTimeout(retryTimer2);
      pub.current?.close();
      sub.current?.close();
      pub.current = null;
      sub.current = null;
      setConnected(false);
    };
    // Reconnect only on retry; device and mute changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, attempt]);

  // Latest values for the timers below.
  const mediaRef = useRef(media);
  mediaRef.current = media;
  const sharingRef = useRef<MediaStreamTrack | null>(null);
  sharingRef.current = sharing;
  const connectedRef = useRef(connected);
  connectedRef.current = connected;

  // Only my sending side broke: rebuild it alone (receiving keeps playing).
  const rebuildingPub = useRef(false);
  const rebuildPub = useCallback(async () => {
    const old = pub.current;
    if (!old || rebuildingPub.current) return;
    rebuildingPub.current = true;
    try {
      const m = mediaRef.current;
      const np = await connectPublisher(roomId, m.mic ?? (silence.current ??= silentAudioTrack()), (m.camOn && m.camOut) || black!, m.dataSaver);
      if (pub.current !== old) {
        np.close();
        return;
      }
      np.onTracksChanged = () => update({ tracks: np.tracks() });
      pub.current = np;
      old.close();
      if (sharingRef.current) await np.shareScreen(sharingRef.current);
      update({ sfu_session: np.session, tracks: np.tracks() });
    } catch {
      // Still no network: the watchdog tries again.
    } finally {
      rebuildingPub.current = false;
    }
  }, [roomId, black, update]);

  /*
   * Watchdog, every second. Bad networks make connections "disconnected" for a few seconds all
   * the time and they usually recover by themselves, so we wait 15 s before rebuilding — and we
   * only rebuild the side that broke (sending or receiving), so the others barely notice.
   */
  useEffect(() => {
    if (!connected) return;
    let pubDown = 0;
    let subDown = 0;
    let lastPubTry = 0;
    return workerTicker(1000, () => {
      const p = pub.current;
      const s = sub.current;
      if (!p || !s) return;
      const now = Date.now();
      const ps = p.pc.connectionState;
      const ss = s.pc.connectionState;
      const pubBad = ps === "failed" || ps === "closed" || (ps === "disconnected" && (pubDown ||= now) && now - pubDown > 15_000);
      if (ps !== "disconnected") pubDown = 0;
      if (pubBad && now - lastPubTry > 5000) {
        lastPubTry = now;
        void rebuildPub();
      }
      // "new" = nothing to receive yet.
      const subBad = ss === "failed" || ss === "closed" || (ss === "disconnected" && (subDown ||= now) && now - subDown > 15_000);
      if (ss !== "disconnected") subDown = 0;
      if (subBad) {
        subDown = 0;
        void s.rebuild();
      }
      const ok = ps === "connected" && (ss === "connected" || ss === "new" || ss === "connecting");
      setMediaLink(ok ? "ok" : "reconnecting");
    });
  }, [connected, rebuildPub]);

  // Internet back: if we never got connected, try at once instead of waiting for the next try.
  useEffect(() => {
    const back = () => {
      if (!connectedRef.current) setAttempt((a) => a + 1);
    };
    window.addEventListener("online", back);
    return () => window.removeEventListener("online", back);
  }, []);

  // Away too long (no heartbeat for 2 min), the server counts me as gone: join again quietly.
  const rejoining = useRef(false);
  useEffect(() => {
    if (!me || me.status !== "left" || rejoining.current || exited.current) return;
    rejoining.current = true;
    void (async () => {
      const { error } = await createClient().rpc("meet_join", { p_code: info.code, p_name: join.name });
      rejoining.current = false;
      if (!error) setAttempt((a) => a + 1);
    })();
  }, [me, info.code, join.name]);

  // Tell me when my connection drops and when it's back.
  const selfDown = !meOnline || mediaLink === "reconnecting";
  const wasDown = useRef(false);
  useEffect(() => {
    if (selfDown) wasDown.current = true;
    else if (wasDown.current) {
      wasDown.current = false;
      toast("You're back online.");
    }
  }, [selfDown, toast]);

  // Others: say when someone loses their connection and when they're back.
  const prevLinks = useRef<Record<string, PersonLink>>({});
  useEffect(() => {
    if (selfDown) return;
    for (const [id, l] of Object.entries(links)) {
      const before = prevLinks.current[id];
      const name = people.find((p) => p.id === id)?.display_name ?? "Someone";
      if (before === "ok" && l === "reconnecting") toast(`${name} lost connection. Reconnecting…`, "warn");
      if (before === "reconnecting" && l === "ok") toast(`${name} is back.`);
    }
    prevLinks.current = links;
  }, [links, people, selfDown, toast]);

  // My camera: real camera (or background version) when on, a black frame when off.
  useEffect(() => {
    if (!connected) return;
    void pub.current?.replace("camera", media.camOn && media.camOut ? media.camOut : black);
    update({ video_on: media.camOn && !!media.camOut });
  }, [connected, media.camOn, media.camOut, black, update]);

  useEffect(() => {
    if (!connected || !media.mic) return;
    void pub.current?.replace("mic", media.mic);
  }, [connected, media.mic]);

  useEffect(() => {
    if (connected) update({ audio_on: media.micOn && !!media.mic });
  }, [connected, media.micOn, media.mic, update]);

  useEffect(() => {
    if (connected) void pub.current?.setLowData(media.dataSaver);
  }, [connected, media.dataSaver]);

  useEffect(() => {
    if (connected) update({ hand });
  }, [connected, hand, update]);

  // Receive what's needed: everyone's mic, cameras (unless data saver), shared screens.
  useEffect(() => {
    const s = sub.current;
    if (!connected || !s) return;
    const want = new Map<string, RemoteRef>();
    // Everyone the server counts as in the meeting (not only those shown): a late heartbeat on
    // my side must never cut anyone's sound.
    for (const p of admitted) {
      if (p.id === meId || !p.sfu_session) continue;
      for (const t of p.tracks ?? []) {
        const source = sourceOf(t.name);
        if (source === "camera" && media.dataSaver) continue;
        if (source === "screen" && !p.screen_on) continue;
        if (!["mic", "camera", "screen"].includes(source)) continue;
        want.set(`${p.sfu_session}/${t.name}`, { participantId: p.id, sessionId: p.sfu_session!, trackName: t.name, source });
      }
    }
    const drop = [...pulled.current.entries()].filter(([k]) => !want.has(k)).map(([, r]) => r);
    const fresh = [...want.entries()].filter(([k]) => !pulled.current.has(k)).map(([, r]) => r);
    for (const r of drop) pulled.current.delete(`${r.sessionId}/${r.trackName}`);
    for (const r of fresh) pulled.current.set(`${r.sessionId}/${r.trackName}`, r);
    if (drop.length) void s.drop(drop).catch(() => undefined);
    if (fresh.length) {
      // Someone who just joined may still be connecting: try what didn't work again shortly.
      const again = (refs: RemoteRef[]) => {
        if (!refs.length || sub.current !== s) return;
        for (const r of refs) pulled.current.delete(`${r.sessionId}/${r.trackName}`);
        if (!retryTimer.current) retryTimer.current = setTimeout(() => ((retryTimer.current = null), setRetry((n) => n + 1)), 2000);
      };
      void s.pull(fresh).then(again, () => again(fresh));
    }
  }, [connected, admitted, meId, media.dataSaver, retry]);
  useEffect(() => () => void (retryTimer.current && clearTimeout(retryTimer.current)), []);

  // Ask Cloudflare every 10 s whether it still has my tracks; publish again any it lost.
  useEffect(() => {
    if (!connected) return;
    return workerTicker(10_000, () => void pub.current?.checkHealth());
  }, [connected]);

  // Phones stop the camera while the browser is in the background; after 30 s Cloudflare forgets
  // the track. Coming back after that long: publish camera and mic again straight away.
  useEffect(() => {
    if (!connected || !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) return;
    let hiddenAt = 0;
    const onVis = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 25_000) {
        void pub.current?.republish("camera").catch(() => undefined);
        void pub.current?.republish("mic").catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [connected]);

  // ----- screen sharing -----------------------------------------------------
  // Phones and tablets can't share their screen from a browser: hide the button there.
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(!!navigator.mediaDevices?.getDisplayMedia && !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)), []);
  const stopShare = useCallback(() => {
    setSharing((t) => {
      t?.stop();
      return null;
    });
    void pub.current?.shareScreen(null);
    update({ screen_on: false });
  }, [update]);
  stopShareRef.current = stopShare;

  const startShare = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast("Screen sharing isn't available on this device.");
      return;
    }
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 15 } }, audio: false });
      const t = s.getVideoTracks()[0];
      t.contentHint = "detail";
      t.addEventListener("ended", () => stopShareRef.current());
      await pub.current?.shareScreen(t);
      setSharing(t);
      update({ screen_on: true, tracks: pub.current?.tracks() ?? [] });
    } catch {
      // Cancelled the picker: nothing to do.
    }
  }, [toast, update]);

  // ----- speaking, signal and data ------------------------------------------
  const levels = useRef<Record<string, number>>({});
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const [loudest, setLoudest] = useState<string | null>(null);
  useEffect(() => {
    const stops: Array<() => void> = [];
    for (const [pid, tracks] of Object.entries(remote)) if (tracks.mic) stops.push(watchLevel(tracks.mic, (l) => (levels.current[pid] = l)));
    if (media.mic) stops.push(watchLevel(media.mic, (l) => (levels.current[meId] = media.micOn ? l : 0)));
    return () => stops.forEach((s) => s());
  }, [remote, media.mic, media.micOn, meId]);
  useEffect(() => {
    const t = setInterval(() => {
      const now = new Set(Object.entries(levels.current).filter(([, l]) => l > 0.1).map(([id]) => id));
      setSpeaking((prev) => (prev.size === now.size && [...now].every((x) => prev.has(x)) ? prev : now));
      const top = Object.entries(levels.current).filter(([id]) => id !== meId).sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] > 0.15) setLoudest(top[0]);
    }, 300);
    return () => clearInterval(t);
  }, [meId]);

  const [net, setNet] = useState({ mb: 0, score: 3 });
  const lastStats = useRef({ lost: 0, packets: 0 });
  // Per person: when did their data last arrive? Nothing for 8 s = their connection is weak.
  const inbound = useRef<Record<string, { bytes: number; at: number }>>({});
  const [weak, setWeak] = useState<Set<string>>(new Set());
  const remoteRef = useRef(remote);
  remoteRef.current = remote;
  const weakSelf = useRef(0);
  const autoSaver = useRef(false);
  const healed = useRef<Record<string, number>>({});
  const linksRef = useRef(links);
  linksRef.current = links;
  useEffect(() => {
    let busy = false;
    const tick = async () => {
      if (!pub.current || !sub.current) return;
      const s = await readStats([pub.current.pc, sub.current.pc]);
      const dl = s.lost - lastStats.current.lost;
      const dp = s.packets - lastStats.current.packets;
      lastStats.current = { lost: s.lost, packets: s.packets };
      const ok = pub.current.pc.connectionState === "connected";
      const score = signalScore(s.rtt, dp > 0 ? dl / dp : 0, ok);
      setNet({ mb: s.bytes / 1_000_000, score });
      // My own connection weak for ~12 s: switch to data saver once (sound first, video later).
      // Not while I share my screen (sending a screen makes my own line look busy, and turning off
      // everyone's video then helps nothing) or while this tab is hidden.
      weakSelf.current = ok && score <= 1 && !sharingRef.current && document.visibilityState === "visible" ? weakSelf.current + 1 : 0;
      if (weakSelf.current === 4 && !autoSaver.current && !mediaRef.current.dataSaver) {
        autoSaver.current = true;
        mediaRef.current.toggleDataSaver();
        toast("Your connection is weak, so we turned on Data saver to keep the sound clear. You can turn it off in Settings.", "warn");
      }

      const now = Date.now();
      const next = new Set<string>();
      for (const [pid, tracks] of Object.entries(remoteRef.current)) {
        // Sound and camera both keep sending (silence / a black frame) even when muted or off.
        const live = [tracks.mic, tracks.camera].filter((x): x is MediaStreamTrack => !!x && x.readyState === "live");
        if (!live.length || !sub.current) continue;
        let bytes = 0;
        for (const x of live) bytes += (await sub.current.info(x)).bytes;
        const prev = inbound.current[pid];
        if (!prev || bytes > prev.bytes) inbound.current[pid] = { bytes, at: now };
        else if (now - prev.at > 8000) next.add(pid);
        // Nothing from them for 12 s although their own connection is fine (they're still
        // checking in) and mine is up: my copy of their stream is stuck, so receive it again.
        if (prev && now - prev.at > 12_000 && linksRef.current[pid] === "ok" && sub.current.pc.connectionState === "connected"
            && now - (healed.current[pid] ?? 0) > 30_000) {
          healed.current[pid] = now;
          inbound.current[pid] = { bytes, at: now };
          const refs = [...pulled.current.values()].filter((r) => r.participantId === pid);
          for (const r of refs) pulled.current.delete(`${r.sessionId}/${r.trackName}`);
          void sub.current.drop(refs).finally(() => setRetry((n) => n + 1));
        }
      }
      setWeak((w) => (w.size === next.size && [...next].every((x) => w.has(x)) ? w : next));
    };
    return workerTicker(3000, () => {
      if (busy) return;
      busy = true;
      void tick().finally(() => (busy = false));
    });
  }, [connected, toast]);

  // ----- time limit ---------------------------------------------------------
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    return workerTicker(1000, () => setNow(Date.now()));
  }, []);
  const remaining = endsAt ? Date.parse(endsAt) - now : null;
  const warned = useRef(false);
  useEffect(() => {
    if (remaining === null) return;
    if (remaining < 5 * 60_000 && remaining > 0 && !warned.current && info.host_tier === "free") {
      warned.current = true;
      toast("This free meeting ends in 5 minutes.", "warn");
    }
    if (remaining <= 0) exit("limit");
  }, [remaining, info.host_tier, toast, exit]);

  // Camera/mic/background problems found during the meeting.
  useEffect(() => {
    if (!media.problem) return;
    toast(media.problem, "warn");
    media.setProblem(null);
  }, [media, toast]);

  // Status from the heartbeat: removed, ended, or let back to the waiting room.
  useEffect(() => {
    if (!me) return;
    if (me.ended) exit("ended");
    else if (me.status === "removed") exit("removed");
  }, [me, exit]);

  // Host: say when someone is waiting.
  const seenWaiting = useRef(new Set<string>());
  useEffect(() => {
    if (!isMod) return;
    for (const w of waiting) {
      if (seenWaiting.current.has(w.id)) continue;
      seenWaiting.current.add(w.id);
      toast(`${w.display_name} wants to join.`);
    }
  }, [waiting, isMod, toast]);

  // Leaving: the button, closing the tab, or going back.
  useEffect(() => {
    const onHide = () => void leaveOnUnload(roomId);
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [roomId]);
  const leave = useCallback(
    async (endForAll = false) => {
      if (endForAll) await moderate("end");
      else await leaveOnUnload(roomId);
      sharing?.stop();
      exit(endForAll ? "ended" : "left");
    },
    [moderate, roomId, sharing, exit],
  );

  // ----- panels, reactions, layout ------------------------------------------
  const [panel, setPanel] = useState<Panel>(null);
  const [readChat, setReadChat] = useState(0);
  useEffect(() => {
    if (panel === "chat") setReadChat(chat.length);
  }, [panel, chat.length]);
  const unreadChat = panel === "chat" ? 0 : chat.length - readChat;
  const lastChat = chat[chat.length - 1];
  const lastChatSeen = useRef<number | null>(null);
  useEffect(() => {
    if (!lastChat || panel === "chat" || lastChat.sender_id === meId || lastChatSeen.current === lastChat.id) return;
    lastChatSeen.current = lastChat.id;
    const who = people.find((p) => p.id === lastChat.sender_id)?.display_name ?? "Someone";
    toast(`${who}: ${(lastChat.body ?? "").slice(0, 80)}`);
  }, [lastChat, panel, meId, people, toast]);

  const [pinned, setPinned] = useState<string | null>(null);
  const [layout, setLayout] = useState<"speaker" | "grid">("speaker");
  // Big screens show the participants list by default (like the design); others open it when needed.
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const apply = () => setWide(mq.matches);
    apply();
    if (mq.matches) setPanel((p) => p ?? "people");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  const [showReactions, setShowReactions] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [copied, setCopied] = useState(false);

  const link = typeof window !== "undefined" ? meetingLink(info.code, window.location.origin, base) : "";
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast(link);
    }
  };

  const nameOf = (id: string | null) => people.find((p) => p.id === id)?.display_name ?? "Someone";
  const self = people.find((p) => p.id === meId);
  const others = people.filter((p) => p.id !== meId);
  const screenOwner = sharing ? meId : others.find((p) => p.screen_on && remote[p.id]?.screen)?.id ?? null;
  const ordered = [...(self ? [self] : []), ...others];
  // Speaker view: one person big on the stage (pinned, else whoever spoke last, else the first
  // other person; me when alone), everyone else in the strip below. Grid view: everyone the same size.
  const gridMode = layout === "grid" && !screenOwner && !pinned && ordered.length > 1;
  const stageId = screenOwner ? null : pinned && ordered.some((p) => p.id === pinned) ? pinned : others.length ? (loudest && others.some((p) => p.id === loudest) ? loudest : others[0].id) : meId;
  const strip = screenOwner ? ordered : ordered.filter((p) => p.id !== stageId);
  const shownPanel = panel;
  const started = room?.started_at ?? info.starts_at;
  const whenLine = useMemo(() => {
    const d = started ? new Date(started) : new Date();
    return `${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(d)} | ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(d)}`;
  }, [started]);

  const tileFor = (p: Participant, big = false) => (
    <Tile
      key={p.id}
      p={p}
      me={p.id === meId}
      track={p.id === meId ? (media.camOn ? media.camOut : null) : p.video_on && !media.dataSaver ? remote[p.id]?.camera : null}
      speaking={speaking.has(p.id) && (p.id === meId ? media.micOn : p.audio_on)}
      micOn={p.id === meId ? media.micOn && !!media.mic : p.audio_on}
      pinned={pinned === p.id}
      onPin={() => setPinned((x) => (x === p.id ? null : p.id))}
      big={big}
      note={p.id !== meId && p.video_on && media.dataSaver ? "Video paused (data saver)" : p.id !== meId && p.video_on && !remote[p.id]?.camera ? "Connecting video…" : undefined}
      status={
        p.id === meId
          ? selfDown ? "Reconnecting…" : undefined
          : selfDown ? undefined : links[p.id] === "reconnecting" ? "Reconnecting…" : weak.has(p.id) ? "Weak connection" : undefined
      }
    />
  );

  // ----- recording (free; saved only on the recorder's device) ---------------
  const recorder = useRef<MeetRecorder | null>(null);
  const [rec, setRec] = useState<{ since: number; audioOnly: boolean } | null>(null);
  const [recMenu, setRecMenu] = useState(false);
  const [recBusy, setRecBusy] = useState(false);
  const [savedRec, setSavedRec] = useState<SavedRecording | null>(null);
  const [recSupported, setRecSupported] = useState(false);
  useEffect(() => setRecSupported(canRecord()), []);
  const recInputs = useRef<() => RecordInputs>(() => ({ tiles: [], screen: null, audio: [] }));
  recInputs.current = () => {
    const screenTrack = screenOwner ? (screenOwner === meId ? sharing : remote[screenOwner]?.screen) ?? null : null;
    return {
      tiles: ordered.map((p) => {
        const mine = p.id === meId;
        return {
          id: p.id,
          name: p.display_name,
          colour: avatarColour(p.user_id),
          initials: initialsOf(p.display_name),
          video: mine ? (media.camOn ? media.camOut : null) : p.video_on && !media.dataSaver ? remote[p.id]?.camera ?? null : null,
          speaking: speaking.has(p.id) && (mine ? media.micOn : p.audio_on),
          muted: mine ? !(media.micOn && media.mic) : !p.audio_on,
        };
      }),
      screen: screenOwner && screenTrack ? { name: nameOf(screenOwner), track: screenTrack } : null,
      audio: [media.mic, ...Object.values(remote).map((t) => t.mic)].filter((t): t is MediaStreamTrack => !!t),
    };
  };

  const startRecording = async (audioOnly: boolean) => {
    if (recorder.current || recBusy) return;
    setRecMenu(false);
    const r = new MeetRecorder({ code: info.code, title: info.title || `${info.host_name}'s meeting`, audioOnly, inputs: () => recInputs.current() });
    setRecBusy(true);
    try {
      const left = await spaceLeft();
      if (left !== null && left < 60_000_000) {
        void r.stop();
        toast("This device is almost full, so there's no room to record. Free some space and try again.", "warn");
        return;
      }
      const { error } = await createClient().rpc("meet_record", { p_room: roomId, p_on: true });
      if (error) {
        void r.stop();
        toast(error.message, "warn");
        return;
      }
      try {
        await r.start();
      } catch (e) {
        void r.stop();
        void createClient().rpc("meet_record", { p_room: roomId, p_on: false });
        toast(e instanceof Error ? e.message : "Couldn't start recording.", "warn");
        return;
      }
      recorder.current = r;
      setSavedRec(null);
      setRec({ since: Date.now(), audioOnly });
      const perMinute = audioOnly ? 400_000 : 6_500_000;
      if (left !== null && left < perMinute * 90) toast(`Recording. This device has room for about ${Math.max(1, Math.floor(left / perMinute))} minutes.`, "warn");
      else toast("Recording on this device. Everyone can see that you're recording.");
      void refresh();
    } finally {
      setRecBusy(false);
    }
  };

  const stopRecording = useCallback(async (why?: string) => {
    const r = recorder.current;
    if (!r) return;
    recorder.current = null;
    setRec(null);
    void createClient().rpc("meet_record", { p_room: roomId, p_on: false }).then(() => void refresh());
    const saved = await r.stop();
    if (!saved.bytes) return;
    setSavedRec(saved);
    toast(why ?? (r.inMemory ? "Recording stopped. Download it now: this device had no room to keep it." : "Recording saved on this device."));
  }, [roomId, refresh, toast]);

  // The server stopped it (I stopped being a co-host): stop here too.
  const serverRec = self?.recording_since ?? null;
  const sawServerRec = useRef(false);
  useEffect(() => {
    if (!rec) {
      sawServerRec.current = false;
      return;
    }
    if (serverRec) sawServerRec.current = true;
    else if (sawServerRec.current) void stopRecording("Recording stopped: only the host and co-hosts can record.");
  }, [serverRec, rec, stopRecording]);

  // Leaving or closing the tab: keep everything recorded so far.
  useEffect(() => {
    const onHide = () => recorder.current?.flush();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      void recorder.current?.stop();
    };
  }, []);

  // Everyone: who is recording, plus a line in the chat when it starts or stops.
  const recorders = people.filter((p) => p.recording_since);
  const recKey = recorders.map((p) => p.id).sort().join(",");
  const [notes, setNotes] = useState<ChatNote[]>([]);
  const prevRecorders = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    if (!people.length) return; // wait for the first list of people
    const now = new Map(recorders.map((p) => [p.id, p.id === meId ? "You" : p.display_name]));
    const before = prevRecorders.current;
    prevRecorders.current = now;
    const lines: ChatNote[] = [];
    for (const [id, name] of now) {
      if (before?.has(id)) continue;
      lines.push({ id: `rec-${id}-${Date.now()}`, at: Date.now(), text: before ? `${name} started recording` : `${name} ${id === meId ? "are" : "is"} recording this meeting` });
      if (id !== meId) toast(before ? `${name} started recording this meeting.` : `${name} is recording this meeting.`, "warn");
    }
    for (const [id, name] of before ?? []) {
      if (now.has(id)) continue;
      lines.push({ id: `rec-${id}-${Date.now()}-stop`, at: Date.now(), text: `${name} stopped recording` });
      if (id !== meId) toast(`${name} stopped recording.`);
    }
    if (lines.length) setNotes((n) => [...n, ...lines].slice(-50));
  }, [recKey, people.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const recordChoices = (
    <RecordChoices
      dataSaver={media.dataSaver}
      busy={recBusy}
      onPick={(audioOnly) => {
        setPanel(null);
        void startRecording(audioOnly);
      }}
    />
  );

  return (
    <div className="fixed inset-0 flex bg-[#0c0a27] text-white">
      <style>{`@keyframes meet-float{0%{transform:translateY(0) scale(.6);opacity:0}10%{opacity:1;transform:translateY(-20px) scale(1.1)}100%{transform:translateY(-55vh) scale(1);opacity:0}}
.meet-strip{scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.18) transparent}`}</style>
      {/* Soft violet and marigold glow behind everything */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_520px_at_18%_-12%,rgba(106,76,245,.38),transparent_65%),radial-gradient(700px_420px_at_105%_110%,rgba(242,169,59,.16),transparent_60%)]" />

      {/* Left rail (tablets and computers) */}
      <nav aria-label="Meeting" className="relative hidden w-[72px] shrink-0 flex-col items-center gap-2 border-r border-white/[0.06] bg-[#120f35]/70 py-4 backdrop-blur md:flex">
        <LogoMark product="meet" tile className="mb-5 h-10 w-10" />
        <RailButton icon="video" label="Meeting" active={!shownPanel || shownPanel === "people"} onClick={() => setPanel((p) => (p === "settings" || p === "chat" ? (wide ? "people" : null) : p))} />
        <RailButton icon="chat" label="Chat" active={shownPanel === "chat"} badge={unreadChat} onClick={() => setPanel((p) => (p === "chat" ? (wide ? "people" : null) : "chat"))} />
        <RailButton icon="users" label="Participants" active={shownPanel === "people"} badge={isMod ? waiting.length : 0} onClick={() => setPanel((p) => (p === "people" ? null : "people"))} />
        <RailButton icon={copied ? "check" : "link"} label={copied ? "Link copied" : "Copy invite link"} onClick={() => void copyLink()} />
        <span className="flex-1" />
        <RailButton icon="settings" label="Settings" active={shownPanel === "settings"} onClick={() => setPanel((p) => (p === "settings" ? (wide ? "people" : null) : "settings"))} />
      </nav>

      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <LogoMark product="meet" tile className="h-8 w-8 shrink-0 md:hidden" />
            <span className="hidden h-3.5 w-1 rounded-full bg-[#f2a93b] md:block" aria-hidden />
            <span className="hidden text-white/55 sm:inline">Workbase Meet</span>
            <span className="hidden text-white/30 sm:inline">/</span>
            <span className="truncate font-medium text-white/90">Meeting</span>
          </div>
          <div className="flex items-center gap-2 text-xs sm:gap-3 sm:text-sm">
            {remaining !== null && info.host_tier === "free" && (
              <span className={cn("rounded-full px-2.5 py-1 tabular-nums whitespace-nowrap", remaining < 5 * 60_000 ? "bg-red-500/25 text-red-100" : "bg-white/[0.08] text-white/80")} title="Free meetings last up to 1 hour">
                {mmss(remaining)} left
              </span>
            )}
            <span className="hidden items-center gap-1.5 rounded-full bg-white/[0.08] px-2.5 py-1 tabular-nums text-white/80 sm:flex" title="Data used by this meeting on this device">
              <Icon name="zap" className="h-3.5 w-3.5 text-[#f2a93b]" />
              {net.mb < 10 ? net.mb.toFixed(1) : Math.round(net.mb)} MB
            </span>
            {media.dataSaver && <span className="hidden rounded-full bg-[#6a4cf5]/25 px-2.5 py-1 text-[#cfc5ff] lg:inline">Data saver</span>}
            <SignalBars score={connected && !selfDown ? net.score : 0} />
            {self && (
              <span className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ring-2 ring-white/15" style={{ background: avatarColour(self.user_id) }} title={`${self.display_name} (you)`}>
                {initialsOf(self.display_name)}
              </span>
            )}
          </div>
        </header>

        {/* Title row */}
        <div className="flex shrink-0 items-center justify-between gap-3 px-3 pb-3 sm:px-6">
          <div className="min-w-0">
            <h1 className="truncate font-display text-lg font-bold sm:text-xl">{info.title || `${info.host_name}'s meeting`}</h1>
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-white/55">
              <span>{whenLine}</span>
              <span className="text-white/25">·</span>
              <span className="font-mono">{info.code}</span>
              {room?.locked && <span className="inline-flex items-center gap-1 text-[#f2a93b]"><Icon name="lock" className="h-3 w-3" />Locked</span>}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <HeaderButton icon="users" label="Participants" active={shownPanel === "people"} badge={isMod ? waiting.length : 0} onClick={() => setPanel((p) => (p === "people" ? null : "people"))} />
            <HeaderButton icon="chat" label="Chat" active={shownPanel === "chat"} badge={unreadChat} onClick={() => setPanel((p) => (p === "chat" ? (wide ? "people" : null) : "chat"))} />
            <HeaderButton icon="dots" label="More: settings, layout, connection" active={shownPanel === "settings"} onClick={() => setPanel((p) => (p === "settings" ? (wide ? "people" : null) : "settings"))} />
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 gap-4 px-2 pb-2 sm:px-6 sm:pb-5">
          {/* Stage + strip */}
          <div className="relative flex min-w-0 flex-1 flex-col gap-3">
            <div className="relative min-h-0 flex-1 overflow-hidden rounded-[22px] bg-[#17143f] shadow-[0_24px_60px_-24px_rgba(0,0,0,.7)] ring-1 ring-white/[0.06]">
              {gridMode ? (
                <div className={cn("grid h-full content-center gap-2 p-2 pb-20", gridClass(ordered.length))}>
                  {ordered.map((p) => (
                    <div key={p.id} className="aspect-video min-h-0">{tileFor(p)}</div>
                  ))}
                </div>
              ) : screenOwner ? (
                <div className="relative h-full bg-black">
                  <VideoView track={screenOwner === meId ? sharing : remote[screenOwner]?.screen} contain />
                  <span className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-black/55 py-1 pr-1 pl-3 text-xs backdrop-blur">
                    <Icon name="screenShare" className="h-3.5 w-3.5 text-[#f2a93b]" />
                    {screenOwner === meId ? "You're sharing your screen" : `${nameOf(screenOwner)} is sharing`}
                    {screenOwner === meId ? (
                      <button className="rounded-full bg-red-600 px-2.5 py-0.5 font-medium hover:bg-red-500" onClick={stopShare}>Stop</button>
                    ) : <span className="w-2" />}
                  </span>
                </div>
              ) : (
                ordered.filter((p) => p.id === stageId).map((p) => tileFor(p, true))
              )}

              {/* REC pill */}
              {recorders.length > 0 && (
                <button
                  type="button"
                  onClick={() => (rec ? void stopRecording() : setPanel("chat"))}
                  className="absolute top-3 right-3 z-20 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium whitespace-nowrap backdrop-blur"
                  title={rec ? "You're recording. Click to stop." : `Recorded by ${recorders.map((p) => p.display_name).join(", ")}`}
                >
                  <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full ring-1 ring-red-400"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /></span>
                  {rec ? <span className="tabular-nums">{hhmmss(now - rec.since)}</span> : <span>REC</span>}
                </button>
              )}

              {selfDown && (
                <div role="status" className="absolute inset-x-0 top-14 z-20 mx-auto flex w-fit max-w-[calc(100%-1rem)] items-center gap-2 rounded-xl bg-[#f2a93b] px-4 py-2 text-sm font-medium text-[#15123a] shadow-lg">
                  <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-[#15123a] border-t-transparent" aria-hidden />
                  {!online ? "You're offline. We'll reconnect as soon as your internet is back." : "Your connection dropped. Reconnecting…"}
                  {connectError && <button className="ml-1 shrink-0 underline" onClick={() => setAttempt((a) => a + 1)}>Try now</button>}
                </div>
              )}

              {savedRec && (
                <div className="absolute top-14 left-3 z-30 flex max-w-[calc(100%-1.5rem)] items-center gap-3 rounded-2xl bg-[#1f1b4d] px-4 py-3 text-sm shadow-xl">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" aria-hidden />
                  <span className="min-w-0">Recording saved on this device</span>
                  <button
                    className="shrink-0 rounded-xl bg-[#6a4cf5] px-3 py-1.5 font-medium hover:bg-[#5b3fe0]"
                    onClick={() => {
                      const r = savedRec;
                      void downloadRecording(r).then(() => setSavedRec(null)).catch((e) => toast(e instanceof Error ? e.message : "Couldn't save it.", "warn"));
                    }}
                  >
                    Download
                  </button>
                  <button className="shrink-0 rounded-lg p-1 text-white/60 hover:text-white" onClick={() => setSavedRec(null)} aria-label="Later"><Icon name="x" className="h-4 w-4" /></button>
                </div>
              )}

              {/* Floating reactions */}
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                {reactions.map((r, i) => (
                  <span key={r.id} className="absolute bottom-20 flex flex-col items-center" style={{ left: `${8 + ((r.id * 37 + i * 13) % 70)}%`, animation: "meet-float 3.6s ease-out forwards" }}>
                    <span className="text-4xl">{r.body}</span>
                    <span className="mt-1 rounded-full bg-black/50 px-2 text-[11px]">{r.sender_id === meId ? "You" : nameOf(r.sender_id)}</span>
                  </span>
                ))}
              </div>

              {/* Toasts */}
              <div className="absolute top-3 left-1/2 z-30 flex w-[min(92%,420px)] -translate-x-1/2 flex-col gap-2">
                {toasts.map((t) => (
                  <div key={t.id} role="status" className={cn("rounded-xl px-4 py-2.5 text-sm shadow-lg backdrop-blur", t.tone === "warn" ? "bg-[#f2a93b] text-[#15123a]" : "bg-[#1f1b4d]/95")}>
                    {t.text}
                  </div>
                ))}
                {isMod && waiting.length > 0 && shownPanel !== "people" && (
                  <button onClick={() => setPanel("people")} className="rounded-xl bg-[#6a4cf5] px-4 py-2.5 text-left text-sm font-medium shadow-lg">
                    {waiting.length === 1 ? `${waiting[0].display_name} is waiting to join` : `${waiting.length} people are waiting to join`} · Review
                  </button>
                )}
              </div>

              {/* Controls, floating on the stage */}
              <div className="absolute inset-x-0 bottom-3 z-30 flex justify-center px-2 sm:bottom-5">
                <div className="flex items-center gap-1.5 rounded-full bg-[#0c0a27]/35 p-1.5 backdrop-blur-md sm:gap-2.5">
                  <Control icon={media.micOn ? "mic" : "micOff"} label={media.micOn ? "Mute" : "Unmute"} off={!media.micOn} disabled={!media.mic} onClick={() => media.setMicOn(!media.micOn)} />
                  <Control icon={media.camOn ? "video" : "videoOff"} label={media.camOn ? "Stop video" : "Start video"} off={!media.camOn} onClick={() => void media.toggleCam()} />
                  <div className="relative">
                    <button
                      onClick={() => (myRole === "host" ? setConfirmLeave((v) => !v) : void leave())}
                      className="flex h-11 w-11 items-center justify-center rounded-full bg-[#ef3b3b] shadow-[0_6px_20px_-4px_rgba(239,59,59,.6)] transition hover:bg-[#ff4d4d] sm:h-12 sm:w-12"
                      aria-label="Leave the meeting"
                      title="Leave"
                    >
                      <Icon name="hangUp" className="h-5 w-5" />
                    </button>
                    {confirmLeave && (
                      <div className="absolute bottom-16 left-1/2 z-50 w-72 -translate-x-1/2 space-y-2 rounded-2xl bg-[#1f1b4d] p-4 shadow-2xl">
                        <p className="text-sm text-white/80">Leave, or end the meeting for everyone?</p>
                        <button className="w-full rounded-xl bg-red-600 py-2.5 font-medium hover:bg-red-500" onClick={() => void leave(true)}>End for everyone</button>
                        <button className="w-full rounded-xl bg-white/10 py-2.5 font-medium hover:bg-white/15" onClick={() => void leave()}>Just leave</button>
                        <button className="w-full py-1.5 text-sm text-white/60 hover:text-white" onClick={() => setConfirmLeave(false)}>Cancel</button>
                      </div>
                    )}
                  </div>
                  {canShare && <Control icon="screenShare" label={sharing ? "Stop sharing" : "Share screen"} active={!!sharing} onClick={() => (sharing ? stopShare() : void startShare())} className="hidden sm:flex" />}
                  {isMod && recSupported && (
                    <div className="relative hidden sm:block">
                      <Control icon="record" label={rec ? "Stop recording" : "Record"} off={!!rec} active={recMenu} disabled={recBusy} onClick={() => (rec ? void stopRecording() : setRecMenu((v) => !v))} />
                      {recMenu && !rec && (
                        <div className="absolute bottom-16 left-1/2 z-40 w-72 -translate-x-1/2 rounded-2xl bg-[#1f1b4d] p-4 shadow-2xl">
                          <p className="mb-3 font-medium">Record this meeting</p>
                          {recordChoices}
                          <button className="mt-2 w-full py-1 text-sm text-white/60 hover:text-white" onClick={() => setRecMenu(false)}>Cancel</button>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="relative">
                    <Control icon="smile" label="React" active={showReactions} onClick={() => setShowReactions((v) => !v)} />
                    {showReactions && (
                      <div className="fixed bottom-24 left-1/2 z-40 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-2xl bg-[#1f1b4d] p-2 shadow-xl sm:absolute sm:bottom-16 sm:flex-nowrap">
                        {REACTIONS.map((r) => (
                          <button key={r} className="rounded-xl p-1.5 text-2xl hover:bg-white/10" onClick={() => void send("reaction", r)} aria-label={`React ${r}`}>{r}</button>
                        ))}
                        <button
                          className={cn("ml-1 flex items-center gap-1 rounded-xl px-3 py-2 text-sm sm:hidden", hand ? "bg-[#f2a93b] text-[#15123a]" : "bg-white/10")}
                          onClick={() => {
                            setHand((h) => !h);
                            setShowReactions(false);
                          }}
                        >
                          ✋ {hand ? "Lower hand" : "Raise hand"}
                        </button>
                      </div>
                    )}
                  </div>
                  <Control icon="hand" label={hand ? "Lower hand" : "Raise hand"} active={hand} onClick={() => setHand((h) => !h)} className="hidden sm:flex" />
                  {isMod && <Control icon="sparkle" label="Celebrate someone" active={!!shoutDialog} onClick={() => setShoutDialog({ target: null })} />}
                </div>
              </div>
            </div>

            {/* Everyone else, in a strip under the stage */}
            {!gridMode && strip.length > 0 && (
              <div className="meet-strip flex h-[88px] shrink-0 gap-2.5 overflow-x-auto pb-1 sm:h-28 sm:gap-3">
                {strip.map((p) => (
                  <div key={p.id} className="aspect-video h-full shrink-0">{tileFor(p)}</div>
                ))}
              </div>
            )}
          </div>

          {/* Right panel: participants, chat or settings */}
          {shownPanel && (
            <aside className="absolute inset-0 z-40 flex flex-col overflow-hidden bg-[#15123d] md:static md:z-auto md:w-80 md:shrink-0 md:rounded-[22px] md:bg-[#15123d]/85 md:ring-1 md:ring-white/[0.06] md:backdrop-blur">
              <div className="flex items-center justify-between gap-2 border-b border-white/[0.07] px-4 py-3">
                {shownPanel === "settings" ? (
                  <h2 className="font-semibold">Settings</h2>
                ) : (
                  <div className="flex items-center gap-1 rounded-full bg-white/[0.06] p-1 text-sm" role="tablist">
                    {(["people", "chat"] as const).map((k) => (
                      <button
                        key={k}
                        role="tab"
                        aria-selected={shownPanel === k}
                        onClick={() => setPanel(k)}
                        className={cn("relative rounded-full px-3 py-1 font-medium transition", shownPanel === k ? "bg-[#6a4cf5] text-white" : "text-white/60 hover:text-white")}
                      >
                        {k === "people" ? `Participants (${people.length})` : "Chat"}
                        {k === "chat" && unreadChat > 0 && <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-[#f2a93b]" />}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-1">
                  {shownPanel === "people" && (
                    <button onClick={() => void copyLink()} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#6a4cf5] hover:bg-[#5b3fe0]" title={copied ? "Link copied" : "Copy the invite link"} aria-label="Copy the invite link">
                      <Icon name={copied ? "check" : "link"} className="h-4 w-4" />
                    </button>
                  )}
                  <button onClick={() => setPanel(null)} className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white" aria-label="Close panel"><Icon name="x" className="h-5 w-5" /></button>
                </div>
              </div>
              {shownPanel === "chat" && <ChatPanel chat={chat} notes={notes} meId={meId} nameOf={nameOf} onSend={(b) => send("chat", b)} />}
              {shownPanel === "people" && (
                <PeoplePanel people={ordered} waiting={waiting} meId={meId} isMod={isMod} isHost={myRole === "host"} locked={!!room?.locked} waitingRoom={room?.waiting_room ?? true} speaking={speaking} onCelebrate={(id) => setShoutDialog({ target: id })} moderate={async (a, t) => {
                  const err = await moderate(a, t);
                  if (err) toast(err, "warn");
                }} />
              )}
              {shownPanel === "settings" && (
                <div className="flex-1 space-y-5 overflow-y-auto p-4">
                  {isMod && recSupported && (
                    <div>
                      <p className="mb-2 text-xs text-white/60">Recording</p>
                      {rec ? (
                        <button className="w-full rounded-xl bg-red-600 py-2.5 text-sm font-medium hover:bg-red-500" onClick={() => void stopRecording()}>
                          Stop recording ({mmss(now - rec.since)})
                        </button>
                      ) : (
                        recordChoices
                      )}
                    </div>
                  )}
                  <DeviceSettings media={media} />
                  <div>
                    <p className="mb-2 text-xs text-white/60">Layout</p>
                    <div className="flex gap-2">
                      {(["speaker", "grid"] as const).map((l) => (
                        <button key={l} onClick={() => setLayout(l)} className={cn("flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm", layout === l ? "bg-[#6a4cf5]" : "bg-white/10 hover:bg-white/15")}>
                          <Icon name={l === "grid" ? "grid" : "speaker"} className="h-4 w-4" />
                          {l === "grid" ? "Grid" : "Speaker"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <ConnectionDetails pub={pub} sub={sub} people={others} remote={remote} dataSaver={media.dataSaver} />
                </div>
              )}
            </aside>
          )}
        </div>
      </div>

      {shoutQueue[0] && (() => {
        const s = shoutQueue[0];
        const person = s.target_id ? admitted.find((p) => p.id === s.target_id) ?? null : null;
        const video = !person ? null : person.id === meId ? (media.camOn ? media.camOut : null) : person.video_on && !media.dataSaver ? remote[person.id]?.camera ?? null : null;
        const sender = admitted.find((p) => p.id === s.sender_id);
        return (
          <Celebration
            key={s.id}
            shout={s}
            person={person}
            video={video}
            from={sender ? (sender.id === meId ? "you" : `${sender.display_name}${sender.role === "host" ? " (host)" : sender.role === "cohost" ? " (co-host)" : ""}`) : "the host"}
            muted={celebMuted}
            onMute={muteCelebrations}
            onDone={() => setShoutQueue((q) => q.filter((x) => x.id !== s.id))}
          />
        );
      })()}
      {shoutDialog && (
        <ShoutoutDialog
          people={ordered}
          meId={meId}
          initial={shoutDialog.target}
          onClose={() => setShoutDialog(null)}
          onSend={async (v) => {
            const { error } = await createClient().rpc("meet_shoutout", { p_room: roomId, p_name: v.name, p_target: v.target, p_style: v.style, p_message: v.message || null });
            return error?.message ?? null;
          }}
        />
      )}

      {/* Remote audio */}
      {Object.entries(remote).map(([pid, t]) => (t.mic ? <AudioOut key={pid} track={t.mic} sinkId={media.speakerId} /> : null))}
    </div>
  );
}

type RecvRow = { name: string; camera: string; mic: string; screen?: string };

/** Live sending/receiving details, to find out why someone can't be seen or heard. */
function ConnectionDetails({ pub, sub, people, remote, dataSaver }: {
  pub: React.RefObject<Publisher | null>; sub: React.RefObject<Subscriber | null>; people: Participant[]; remote: RemoteMedia; dataSaver: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [send, setSend] = useState<SendInfo[]>([]);
  const [recv, setRecv] = useState<RecvRow[]>([]);
  const [state, setState] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!open) return;
    const read = async () => {
      const p = pub.current, s = sub.current;
      setState(`Sending: ${p?.pc.connectionState ?? "none"} · Receiving: ${s?.pc.connectionState ?? "none"}${s?.lastError ? ` (${s.lastError})` : ""}${dataSaver ? " · Data saver ON (cameras not received)" : ""}`);
      setSend(p ? await p.info() : []);
      const rows: RecvRow[] = [];
      for (const person of people) {
        const describe = async (source: Source) => {
          const t = (person.tracks ?? []).find((x) => sourceOf(x.name) === source);
          if (!t) return "not published";
          const track = remote[person.id]?.[source];
          if (track && s) {
            const i = await s.info(track);
            return `${t.name}: ${i.live ? "live" : "ended"}${i.muted ? ", no data" : ""} · ${(i.bytes / 1e6).toFixed(2)} MB${i.frames !== null ? ` · ${i.frames} frames` : ""}${i.size ? ` · ${i.size}` : ""}${i.codec ? ` · ${i.codec}` : ""}`;
          }
          const why = s?.problems.get(`${person.sfu_session}/${t.name}`);
          return `${t.name}: not received${why ? ` (${why})` : source === "camera" && dataSaver ? " (data saver)" : ""}`;
        };
        rows.push({
          name: `${person.display_name} · camera ${person.video_on ? "on" : "off"} · mic ${person.audio_on ? "on" : "off"}`,
          camera: await describe("camera"),
          mic: await describe("mic"),
          screen: person.screen_on ? await describe("screen") : undefined,
        });
      }
      setRecv(rows);
    };
    void read();
    const t = setInterval(() => void read(), 2000);
    return () => clearInterval(t);
  }, [open, pub, sub, people, remote, dataSaver]);

  const text = () =>
    [state, "Me:", ...send.map((x) => `  ${x.name}: cloudflare ${x.cloudflare} · ${(x.bytes / 1e6).toFixed(2)} MB${x.frames !== null ? ` · ${x.frames} frames` : ""}${x.size ? ` · ${x.size}` : ""}${x.codec ? ` · ${x.codec}` : ""}`),
      ...recv.flatMap((r) => [r.name, `  ${r.camera}`, `  ${r.mic}`, ...(r.screen ? [`  ${r.screen}`] : [])])].join("\n");

  return (
    <div>
      <button className="text-xs text-white/60 underline underline-offset-2 hover:text-white" onClick={() => setOpen((o) => !o)}>
        {open ? "Hide connection details" : "Connection details"}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <pre className="max-h-72 overflow-auto rounded-lg bg-black/40 p-2 text-[11px] leading-relaxed whitespace-pre-wrap text-white/80">{text()}</pre>
          <button
            className="rounded-lg bg-white/10 px-3 py-1.5 text-xs hover:bg-white/15"
            onClick={() => {
              void navigator.clipboard?.writeText(text()).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? "Copied" : "Copy details"}
          </button>
        </div>
      )}
    </div>
  );
}

function gridClass(n: number) {
  if (n <= 1) return "grid-cols-1 mx-auto w-full max-w-4xl";
  if (n === 2) return "grid-cols-1 sm:grid-cols-2";
  if (n <= 4) return "grid-cols-2";
  if (n <= 9) return "grid-cols-2 sm:grid-cols-3";
  return "grid-cols-3 sm:grid-cols-4";
}

function SignalBars({ score }: { score: number }) {
  const label = ["Not connected", "Weak connection", "OK connection", "Good connection"][score];
  return (
    <span className="flex h-5 items-end gap-0.5" title={label} aria-label={label}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={cn("w-1 rounded-sm", score >= i ? (score === 1 ? "bg-red-400" : score === 2 ? "bg-[#f2a93b]" : "bg-emerald-400") : "bg-white/20")} style={{ height: 6 + i * 4 }} />
      ))}
    </span>
  );
}

function Control({ icon, label, onClick, off, active, disabled, badge, className }: { icon: IconName; label: string; onClick: () => void; off?: boolean; active?: boolean; disabled?: boolean; badge?: number; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active || off ? true : undefined}
      className={cn(
        "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full ring-1 transition disabled:opacity-40 sm:h-12 sm:w-12",
        off ? "bg-[#ef3b3b]/90 ring-white/10 hover:bg-[#ff4d4d]" : active ? "bg-[#6a4cf5] ring-white/15 hover:bg-[#5b3fe0]" : "bg-[#0c0a27]/60 ring-white/15 hover:bg-[#0c0a27]/80",
        className,
      )}
    >
      <Icon name={icon} className="h-5 w-5" />
      {!!badge && badge > 0 && <Badge n={badge} />}
    </button>
  );
}
function Badge({ n }: { n: number }) {
  return <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#f2a93b] px-1 text-[11px] font-bold text-[#15123a]">{n > 9 ? "9+" : n}</span>;
}
/** Icon button in the left rail. */
function RailButton({ icon, label, onClick, active, badge }: { icon: IconName; label: string; onClick: () => void; active?: boolean; badge?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active ? true : undefined}
      className={cn("relative flex h-11 w-11 items-center justify-center rounded-2xl transition", active ? "bg-[#6a4cf5] text-white shadow-[0_8px_24px_-8px_rgba(106,76,245,.9)]" : "text-white/50 hover:bg-white/[0.07] hover:text-white")}
    >
      <Icon name={icon} className="h-5 w-5" />
      {!!badge && badge > 0 && <Badge n={badge} />}
    </button>
  );
}
/** Round button next to the meeting title. */
function HeaderButton({ icon, label, onClick, active, badge }: { icon: IconName; label: string; onClick: () => void; active?: boolean; badge?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active ? true : undefined}
      className={cn("relative flex h-10 w-10 items-center justify-center rounded-full transition", active ? "bg-[#6a4cf5] text-white" : "bg-white/[0.08] text-white/80 hover:bg-white/[0.14] hover:text-white")}
    >
      <Icon name={icon} className="h-[18px] w-[18px]" />
      {!!badge && badge > 0 && <Badge n={badge} />}
    </button>
  );
}
function Tile({ p, me, track, speaking, micOn, pinned, onPin, big, note, status }: { p: Participant; me: boolean; track: MediaStreamTrack | null | undefined; speaking: boolean; micOn: boolean; pinned: boolean; onPin: () => void; big?: boolean; note?: string; status?: string }) {
  const reconnecting = status === "Reconnecting…";
  const name = me ? (big ? "You" : `${p.display_name} (you)`) : p.display_name;
  const role = p.role !== "member" ? (p.role === "host" ? "Host" : "Co-host") : p.is_guest ? "Guest" : null;
  return (
    <div className={cn("group relative h-full w-full overflow-hidden bg-[#1d1a4a] ring-2 transition", big ? "rounded-none" : "rounded-2xl", speaking ? "ring-emerald-400" : big ? "ring-transparent" : "ring-white/[0.06]")}>
      {status && (
        <div className={cn("absolute inset-x-0 top-0 z-10 flex items-center justify-center gap-2 py-1.5 text-xs font-medium", reconnecting ? "bg-[#f2a93b] text-[#15123a]" : "bg-black/60 text-[#f2c27a]")}>
          {reconnecting ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#15123a] border-t-transparent" aria-hidden /> : <SignalBars score={1} />}
          {status}
        </div>
      )}
      {reconnecting && <div className="pointer-events-none absolute inset-0 z-[5] bg-[#0f0d26]/50" aria-hidden />}
      {track ? (
        <VideoView track={track} mirror={me} />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 bg-[radial-gradient(circle_at_50%_40%,#2a2466,#1d1a4a_70%)]">
          <span className={cn("flex items-center justify-center rounded-full font-display font-bold ring-4 ring-white/[0.06]", big ? "h-24 w-24 text-3xl sm:h-28 sm:w-28 sm:text-4xl" : "h-10 w-10 text-sm sm:h-12 sm:w-12 sm:text-base")} style={{ background: avatarColour(p.user_id) }}>
            {initialsOf(p.display_name)}
          </span>
          {note && <span className={cn("text-white/55", big ? "text-xs" : "hidden text-[10px] sm:block")}>{note}</span>}
        </div>
      )}
      {big ? (
        <span className={cn("absolute left-3 z-10 flex max-w-[60%] items-center gap-1.5 rounded-full bg-black/45 px-3 py-1 text-xs font-medium backdrop-blur", status ? "top-10" : "top-3")}>
          {!micOn && <Icon name="micOff" className="h-3.5 w-3.5 text-[#ff6b6b]" title="Muted" />}
          <span className="truncate">{name}</span>
          {role && <span className="rounded bg-white/15 px-1.5 text-[10px] uppercase tracking-wide">{role}</span>}
          {pinned && (
            <button onClick={onPin} className="-mr-1 ml-1 rounded-full bg-white/15 px-2 text-[10px] hover:bg-white/25" aria-label={`Unpin ${p.display_name}`}>Unpin</button>
          )}
        </span>
      ) : (
        <>
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/75 to-transparent px-2 pt-5 pb-1.5 text-[11px] sm:text-xs">
            <span className="truncate font-medium">{name}</span>
            {role && <span className="hidden rounded bg-white/15 px-1 text-[9px] uppercase tracking-wide sm:inline">{role}</span>}
          </div>
          {!micOn && (
            <span className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#ef3b3b]" title="Muted">
              <Icon name="micOff" className="h-3 w-3" />
            </span>
          )}
          <button
            onClick={onPin}
            className="absolute inset-0 z-[1] rounded-2xl opacity-0 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[#8f7bff]"
            aria-label={pinned ? `Unpin ${p.display_name}` : `Show ${p.display_name} big`}
            title={pinned ? "Unpin" : "Show big"}
          />
        </>
      )}
      {p.hand_raised_at && <span className={cn("absolute z-10 rounded-full bg-[#f2a93b] px-1.5 py-0.5 leading-none", big ? "top-3 right-24 text-lg" : "top-1.5 left-1.5 text-sm")} title="Hand raised">✋</span>}
    </div>
  );
}

function AudioOut({ track, sinkId }: { track: MediaStreamTrack; sinkId: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    a.srcObject = new MediaStream([track]);
    const play = () => {
      if (a.paused && a.isConnected) void a.play().catch(() => undefined);
    };
    play();
    // Keep the sound going: some browsers pause audio (device change, tab in the background,
    // autoplay rules before the first tap). Start it again whenever that happens.
    a.addEventListener("pause", play);
    document.addEventListener("visibilitychange", play);
    document.addEventListener("pointerdown", play);
    const t = workerTicker(5000, play);
    return () => {
      t();
      a.removeEventListener("pause", play);
      document.removeEventListener("visibilitychange", play);
      document.removeEventListener("pointerdown", play);
    };
  }, [track]);
  useEffect(() => {
    const a = ref.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (a?.setSinkId && sinkId) void a.setSinkId(sinkId).catch(() => undefined);
  }, [sinkId]);
  return <audio ref={ref} autoPlay />;
}

type ChatNote = { id: string; at: number; text: string };

/** Start recording: video + sound, or sound only. Explains where it's saved. */
function RecordChoices({ dataSaver, busy, onPick }: { dataSaver: boolean; busy: boolean; onPick: (audioOnly: boolean) => void }) {
  return (
    <div className="space-y-2">
      <button disabled={busy} onClick={() => onPick(false)} className="flex w-full items-center gap-2 rounded-xl bg-red-600 px-3 py-2.5 text-left text-sm font-medium hover:bg-red-500 disabled:opacity-50">
        <Icon name="record" className="h-4 w-4" /> Video and sound <span className="ml-auto text-xs font-normal text-white/70">~6 MB/min</span>
      </button>
      <button disabled={busy} onClick={() => onPick(true)} className="flex w-full items-center gap-2 rounded-xl bg-white/10 px-3 py-2.5 text-left text-sm font-medium hover:bg-white/15 disabled:opacity-50">
        <Icon name="mic" className="h-4 w-4" /> Sound only <span className="ml-auto text-xs font-normal text-white/60">~0.4 MB/min</span>
      </button>
      <p className="text-xs leading-relaxed text-white/60">
        Saved on this device, never online. Everyone in the meeting sees that you&apos;re recording. Keep this tab open until you stop.
        {dataSaver && " Data saver is on, so other people's cameras won't be in the video."}
      </p>
    </div>
  );
}

function ChatPanel({ chat, notes, meId, nameOf, onSend }: { chat: MeetEvent[]; notes: ChatNote[]; meId: string; nameOf: (id: string | null) => string; onSend: (b: string) => Promise<string | null> }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [chat.length, notes.length]);
  const items = [
    ...chat.map((m) => ({ at: Date.parse(m.created_at), m, note: null as ChatNote | null })),
    ...notes.map((n) => ({ at: n.at, m: null as MeetEvent | null, note: n })),
  ].sort((a, b) => a.at - b.at);
  const submit = async () => {
    const b = text.trim();
    if (!b) return;
    setText("");
    const e = await onSend(b);
    if (e) {
      setErr(e);
      setText(b);
    } else setErr(null);
  };
  return (
    <>
      <div ref={list} className="flex-1 space-y-3 overflow-y-auto p-4">
        {items.length === 0 && <p className="text-center text-sm text-white/45">Messages here are seen by everyone in the meeting.</p>}
        {items.map(({ m, note }, i) => {
          if (note || !m) {
            return (
              <p key={note!.id} className="flex items-center justify-center gap-1.5 text-center text-xs text-white/55">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden />
                {note!.text} · {clock(new Date(note!.at).toISOString())}
              </p>
            );
          }
          const prev = items[i - 1]?.m;
          const mine = m.sender_id === meId;
          const joins = !!prev && prev.sender_id === m.sender_id;
          return (
            <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
              {!joins && <p className="mb-0.5 text-xs text-white/50">{mine ? "You" : nameOf(m.sender_id)} · {clock(m.created_at)}</p>}
              <p className={cn("max-w-[90%] rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap", mine ? "bg-[#6a4cf5]" : "bg-white/10")}>{m.body}</p>
            </div>
          );
        })}
      </div>
      {err && <p className="px-4 text-xs text-red-300">{err}</p>}
      <div className="flex gap-2 border-t border-white/10 p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), void submit())}
          maxLength={2000}
          placeholder="Send a message"
          aria-label="Message"
          className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm placeholder:text-white/35 focus:border-[#8f7bff] focus:outline-none"
        />
        <button onClick={() => void submit()} className="rounded-xl bg-[#6a4cf5] px-3 hover:bg-[#5b3fe0]" aria-label="Send"><Icon name="send" className="h-4 w-4" /></button>
      </div>
    </>
  );
}

function PeoplePanel({ people, waiting, meId, isMod, isHost, locked, waitingRoom, speaking, onCelebrate, moderate }: { people: Participant[]; waiting: Participant[]; meId: string; isMod: boolean; isHost: boolean; locked: boolean; waitingRoom: boolean; speaking: Set<string>; onCelebrate: (id: string | null) => void; moderate: (a: string, t?: string) => Promise<void> }) {
  const [menu, setMenu] = useState<string | null>(null);
  return (
    <div className="flex-1 space-y-5 overflow-y-auto p-4">
      {isMod && waiting.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold tracking-wide text-[#f2a93b] uppercase">Waiting to join ({waiting.length})</h3>
            {waiting.length > 1 && <button className="text-xs font-medium text-white/80 hover:text-white" onClick={() => void moderate("admit_all")}>Admit all</button>}
          </div>
          <ul className="space-y-2">
            {waiting.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2">
                <span className="min-w-0 truncate text-sm">{w.display_name}{w.is_guest && <span className="ml-1 text-xs text-white/50">(guest)</span>}</span>
                <span className="flex shrink-0 gap-1.5">
                  <button className="rounded-lg bg-white/10 px-2.5 py-1 text-xs hover:bg-white/15" onClick={() => void moderate("deny", w.id)}>Deny</button>
                  <button className="rounded-lg bg-[#6a4cf5] px-2.5 py-1 text-xs font-medium hover:bg-[#5b3fe0]" onClick={() => void moderate("admit", w.id)}>Admit</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-white/50 uppercase">In the meeting ({people.length})</h3>
        <ul className="space-y-1">
          {people.map((p) => (
            <li key={p.id} className="relative flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-white/[0.05]">
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-2", speaking.has(p.id) && p.audio_on ? "ring-emerald-400" : "ring-transparent")} style={{ background: avatarColour(p.user_id) }}>{initialsOf(p.display_name)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{p.display_name}{p.id === meId && " (you)"}</span>
                <span className="block text-xs text-white/45">{p.role === "host" ? "Host" : p.role === "cohost" ? "Co-host" : p.is_guest ? "Guest" : "Member"}</span>
              </span>
              {p.hand_raised_at && <span title="Hand raised">✋</span>}
              <Icon name={p.audio_on ? "mic" : "micOff"} className={cn("h-4 w-4", p.audio_on ? "text-white/75" : "text-[#ff5a5f]")} title={p.audio_on ? "Mic on" : "Muted"} />
              <Icon name={p.video_on ? "video" : "videoOff"} className={cn("h-4 w-4", p.video_on ? "text-[#8f7bff]" : "text-white/30")} title={p.video_on ? "Camera on" : "Camera off"} />
              {isMod && p.id !== meId && p.role !== "host" && (
                <button className="rounded-lg p-1 hover:bg-white/10" aria-label={`Options for ${p.display_name}`} onClick={() => setMenu((m) => (m === p.id ? null : p.id))}>
                  <Icon name="dots" className="h-4 w-4" />
                </button>
              )}
              {menu === p.id && (
                <div className="absolute top-10 right-2 z-10 w-44 overflow-hidden rounded-xl bg-[#26225a] text-sm shadow-xl">
                  <button className="block w-full px-3 py-2 text-left hover:bg-white/10" onClick={() => { setMenu(null); onCelebrate(p.id); }}>🎉 Celebrate</button>
                  {[
                    p.audio_on && ["mute", "Mute"],
                    p.hand_raised_at && ["lower_hand", "Lower hand"],
                    p.screen_on && ["stop_screen", "Stop screen share"],
                    isHost && !p.is_guest && (p.role === "cohost" ? ["remove_cohost", "Remove co-host"] : ["make_cohost", "Make co-host"]),
                    ["remove", "Remove from meeting"],
                  ]
                    .filter((x): x is [string, string] => Array.isArray(x))
                    .map(([a, l]) => (
                      <button key={a} className={cn("block w-full px-3 py-2 text-left hover:bg-white/10", a === "remove" && "text-red-300")} onClick={() => { setMenu(null); void moderate(a, p.id); }}>{l}</button>
                    ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
      {isMod && (
        <section className="space-y-2 border-t border-white/10 pt-4">
          <h3 className="text-xs font-semibold tracking-wide text-white/50 uppercase">Host controls</h3>
          <button className="w-full rounded-xl bg-[#f2a93b] px-3 py-2 text-left text-sm font-semibold text-[#15123a] hover:bg-[#ffb94f]" onClick={() => onCelebrate(null)}>🎉 Celebrate someone</button>
          <button className="w-full rounded-xl bg-white/10 px-3 py-2 text-left text-sm hover:bg-white/15" onClick={() => void moderate("mute_all")}>Mute everyone</button>
          <Toggle label="Waiting room" hint="New people wait until you let them in" on={waitingRoom} onChange={(v) => void moderate(v ? "waiting_room_on" : "waiting_room_off")} />
          <Toggle label="Lock meeting" hint="Nobody new can join" on={locked} onChange={(v) => void moderate(v ? "lock" : "unlock")} />
        </section>
      )}
    </div>
  );
}

function Toggle({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2.5">
      <span>
        <span className="block text-sm">{label}</span>
        <span className="block text-xs text-white/50">{hint}</span>
      </span>
      <input type="checkbox" className="h-5 w-5 accent-[#f2a93b]" checked={on} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

