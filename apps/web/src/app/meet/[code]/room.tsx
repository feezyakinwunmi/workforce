"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { blackVideoTrack, connectMedia, readStats, signalScore, silentAudioTrack, watchLevel, type Publisher, type RemoteRef, type Source, type Subscriber } from "@/lib/meet/engine";
import { meetingLink } from "@/lib/meet/paths";
import { REACTIONS, type JoinResult, type MeetEvent, type Participant, type RoomInfo } from "@/lib/meet/types";
import { leaveOnUnload, useRoom } from "@/lib/meet/use-room";
import { cn } from "@/lib/utils";
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

  const { people, waiting, room, chat, reactions, me, update, send, moderate } = useRoom(roomId, meId, onCommand);
  const myRole = me?.role ?? join.role;
  const isMod = myRole === "host" || myRole === "cohost";
  const endsAt = me?.ends_at ?? room?.ends_at ?? join.ends_at;

  // ----- media connection -------------------------------------------------
  const pub = useRef<Publisher | null>(null);
  const sub = useRef<Subscriber | null>(null);
  const black = useMemo(() => (typeof document === "undefined" ? null : blackVideoTrack()), []);
  const silence = useRef<MediaStreamTrack | null>(null);
  const pulled = useRef(new Map<string, RemoteRef>());
  const [remote, setRemote] = useState<RemoteMedia>({});
  const [connected, setConnected] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setConnectError(null);
        const micTrack = media.mic ?? (silence.current ??= silentAudioTrack());
        const camTrack = (media.camOn && media.camOut) || black!;
        const { pub: p, sub: s } = await connectMedia(roomId, micTrack, camTrack, media.dataSaver);
        if (cancelled) {
          p.close();
          s.close();
          return;
        }
        pub.current = p;
        sub.current = s;
        pulled.current.clear();
        setRemote({});
        s.onTrack = (ref, track) => setRemote((r) => ({ ...r, [ref.participantId]: { ...r[ref.participantId], [ref.trackName]: track } }));
        s.onRemoved = (ref) =>
          setRemote((r) => {
            const cur = { ...r[ref.participantId] };
            delete cur[ref.trackName];
            return { ...r, [ref.participantId]: cur };
          });
        const watch = () => {
          const bad = [p.pc.connectionState, s.pc.connectionState].some((st) => st === "failed");
          if (bad && !cancelled) {
            toast("Connection lost. Reconnecting…", "warn");
            p.close();
            s.close();
            setConnected(false);
            setAttempt((a) => a + 1);
          }
        };
        p.pc.addEventListener("connectionstatechange", watch);
        s.pc.addEventListener("connectionstatechange", watch);
        setConnected(true);
        update({ sfu_session: p.session, tracks: [{ name: "mic", kind: "audio" }, { name: "camera", kind: "video" }], audio_on: media.micOn && !!media.mic, video_on: media.camOn });
      } catch (e) {
        if (!cancelled) setConnectError(e instanceof Error ? e.message : "Couldn't connect to the meeting.");
      }
    })();
    return () => {
      cancelled = true;
      pub.current?.close();
      sub.current?.close();
      pub.current = null;
      sub.current = null;
      setConnected(false);
    };
    // Reconnect only on retry; device and mute changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, attempt]);

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
    for (const p of people) {
      if (p.id === meId || !p.sfu_session) continue;
      const names = new Set((p.tracks ?? []).map((t) => t.name));
      const add = (trackName: Source) => want.set(`${p.sfu_session}/${trackName}`, { participantId: p.id, sessionId: p.sfu_session!, trackName });
      if (names.has("mic")) add("mic");
      if (names.has("camera") && !media.dataSaver) add("camera");
      if (names.has("screen") && p.screen_on) add("screen");
    }
    const drop = [...pulled.current.entries()].filter(([k]) => !want.has(k)).map(([, r]) => r);
    const fresh = [...want.entries()].filter(([k]) => !pulled.current.has(k)).map(([, r]) => r);
    for (const r of drop) pulled.current.delete(`${r.sessionId}/${r.trackName}`);
    for (const r of fresh) pulled.current.set(`${r.sessionId}/${r.trackName}`, r);
    if (drop.length) void s.drop(drop).catch(() => undefined);
    if (fresh.length) {
      void s.pull(fresh).catch(() => {
        for (const r of fresh) pulled.current.delete(`${r.sessionId}/${r.trackName}`);
      });
    }
  }, [connected, people, meId, media.dataSaver]);

  // ----- screen sharing -----------------------------------------------------
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
      update({ screen_on: true, tracks: [{ name: "mic", kind: "audio" }, { name: "camera", kind: "video" }, { name: "screen", kind: "video" }] });
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
  useEffect(() => {
    const t = setInterval(async () => {
      if (!pub.current || !sub.current) return;
      const s = await readStats([pub.current.pc, sub.current.pc]);
      const dl = s.lost - lastStats.current.lost;
      const dp = s.packets - lastStats.current.packets;
      lastStats.current = { lost: s.lost, packets: s.packets };
      const ok = pub.current.pc.connectionState === "connected";
      setNet({ mb: s.bytes / 1_000_000, score: signalScore(s.rtt, dp > 0 ? dl / dp : 0, ok) });
    }, 3000);
    return () => clearInterval(t);
  }, [connected]);

  // ----- time limit ---------------------------------------------------------
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
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
  const [layout, setLayout] = useState<"auto" | "speaker">("auto");
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
  const focusId = screenOwner ? null : pinned ?? (layout === "speaker" && others.length ? loudest ?? others[0].id : null);

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
    />
  );

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0f0d26] text-white">
      <style>{`@keyframes meet-float{0%{transform:translateY(0) scale(.6);opacity:0}10%{opacity:1;transform:translateY(-20px) scale(1.1)}100%{transform:translateY(-55vh) scale(1);opacity:0}}`}</style>

      {/* Header */}
      <header className="flex items-center justify-between gap-3 px-3 py-2 sm:px-5">
        <div className="min-w-0">
          <p className="truncate font-display text-base font-bold sm:text-lg">{info.title || `${info.host_name}'s meeting`}</p>
          <p className="flex items-center gap-2 text-xs text-white/55">
            <span className="font-mono">{info.code}</span>
            {room?.locked && <span className="inline-flex items-center gap-1 text-[#f2a93b]"><Icon name="lock" className="h-3 w-3" />Locked</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs sm:gap-3 sm:text-sm">
          {remaining !== null && info.host_tier === "free" && (
            <span className={cn("rounded-full px-2.5 py-1 tabular-nums", remaining < 5 * 60_000 ? "bg-red-500/25 text-red-100" : "bg-white/10 text-white/80", "whitespace-nowrap")} title="Free meetings last up to 1 hour">
              {mmss(remaining)} left
            </span>
          )}
          <span className="hidden rounded-full bg-white/10 px-2.5 py-1 tabular-nums text-white/80 sm:inline" title="Data used by this meeting on this device">
            {net.mb < 10 ? net.mb.toFixed(1) : Math.round(net.mb)} MB
          </span>
          <SignalBars score={connected ? net.score : 0} />
          <button onClick={() => void copyLink()} className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 hover:bg-white/15" title="Copy the meeting link">
            <Icon name={copied ? "check" : "copy"} className="h-4 w-4" />
            <span className="hidden sm:inline">{copied ? "Copied" : "Invite"}</span>
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 gap-3 px-2 pb-2 sm:px-4">
        {/* Stage */}
        <div className="relative min-w-0 flex-1">
          {connectError && (
            <div className="absolute inset-x-0 top-2 z-20 mx-auto w-fit rounded-xl bg-red-500/90 px-4 py-2 text-sm">
              {connectError}{" "}
              <button className="ml-2 underline" onClick={() => setAttempt((a) => a + 1)}>Try again</button>
            </div>
          )}
          {screenOwner || focusId ? (
            <div className="flex h-full flex-col gap-2 lg:flex-row">
              <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-black">
                {screenOwner ? (
                  <>
                    <VideoView track={screenOwner === meId ? sharing : remote[screenOwner]?.screen} contain />
                    <span className="absolute top-3 left-3 rounded-full bg-black/60 px-3 py-1 text-xs">
                      {screenOwner === meId ? "You're sharing your screen" : `${nameOf(screenOwner)} is sharing`}
                    </span>
                  </>
                ) : (
                  people.filter((p) => p.id === focusId).map((p) => tileFor(p, true))
                )}
              </div>
              <div className="flex shrink-0 gap-2 overflow-auto lg:w-56 lg:flex-col">
                {ordered.filter((p) => p.id !== focusId).map((p) => (
                  <div key={p.id} className="aspect-video w-40 shrink-0 lg:w-full">{tileFor(p)}</div>
                ))}
              </div>
            </div>
          ) : (
            <div className={cn("grid h-full content-center gap-2", gridClass(ordered.length))}>
              {ordered.map((p) => (
                <div key={p.id} className={cn("min-h-0", ordered.length <= 2 ? "aspect-video max-h-full" : "aspect-video")}>{tileFor(p)}</div>
              ))}
            </div>
          )}

          {/* Floating reactions */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {reactions.map((r, i) => (
              <span
                key={r.id}
                className="absolute bottom-6 flex flex-col items-center"
                style={{ left: `${8 + ((r.id * 37 + i * 13) % 70)}%`, animation: "meet-float 3.6s ease-out forwards" }}
              >
                <span className="text-4xl">{r.body}</span>
                <span className="mt-1 rounded-full bg-black/50 px-2 text-[11px]">{r.sender_id === meId ? "You" : nameOf(r.sender_id)}</span>
              </span>
            ))}
          </div>

          {/* Toasts */}
          <div className="absolute top-2 left-1/2 z-30 flex w-[min(92%,420px)] -translate-x-1/2 flex-col gap-2">
            {toasts.map((t) => (
              <div key={t.id} role="status" className={cn("rounded-xl px-4 py-2.5 text-sm shadow-lg backdrop-blur", t.tone === "warn" ? "bg-[#f2a93b] text-[#15123a]" : "bg-[#1f1b4d]/95")}>
                {t.text}
              </div>
            ))}
            {isMod && waiting.length > 0 && panel !== "people" && (
              <button onClick={() => setPanel("people")} className="rounded-xl bg-[#6a4cf5] px-4 py-2.5 text-left text-sm font-medium shadow-lg">
                {waiting.length === 1 ? `${waiting[0].display_name} is waiting to join` : `${waiting.length} people are waiting to join`} · Review
              </button>
            )}
          </div>
        </div>

        {/* Side panel */}
        {panel && (
          <aside className="absolute inset-0 z-40 flex flex-col rounded-2xl bg-[#1a1740] sm:static sm:z-auto sm:w-80 sm:shrink-0">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <h2 className="font-semibold">{panel === "chat" ? "Chat" : panel === "people" ? `People (${people.length})` : "Settings"}</h2>
              <button onClick={() => setPanel(null)} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Close panel"><Icon name="x" className="h-5 w-5" /></button>
            </div>
            {panel === "chat" && <ChatPanel chat={chat} meId={meId} nameOf={nameOf} onSend={(b) => send("chat", b)} />}
            {panel === "people" && (
              <PeoplePanel people={ordered} waiting={waiting} meId={meId} isMod={isMod} isHost={myRole === "host"} locked={!!room?.locked} waitingRoom={room?.waiting_room ?? true} moderate={async (a, t) => {
                const err = await moderate(a, t);
                if (err) toast(err, "warn");
              }} />
            )}
            {panel === "settings" && (
              <div className="flex-1 space-y-5 overflow-y-auto p-4">
                <DeviceSettings media={media} />
                <div>
                  <p className="mb-2 text-xs text-white/60">Layout</p>
                  <div className="flex gap-2">
                    {(["auto", "speaker"] as const).map((l) => (
                      <button key={l} onClick={() => setLayout(l)} className={cn("rounded-lg px-3 py-2 text-sm", layout === l ? "bg-[#6a4cf5]" : "bg-white/10 hover:bg-white/15")}>
                        {l === "auto" ? "Grid" : "Speaker"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Remote audio */}
      {Object.entries(remote).map(([pid, t]) => (t.mic ? <AudioOut key={pid} track={t.mic} sinkId={media.speakerId} /> : null))}

      {/* Controls */}
      <footer className="relative flex items-center justify-center gap-1.5 px-2 pt-1 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:gap-3">
        <Control icon={media.micOn ? "mic" : "micOff"} label={media.micOn ? "Mute" : "Unmute"} off={!media.micOn} disabled={!media.mic} onClick={() => media.setMicOn(!media.micOn)} />
        <Control icon={media.camOn ? "video" : "videoOff"} label={media.camOn ? "Stop video" : "Start video"} off={!media.camOn} onClick={() => void media.toggleCam()} />
        <Control icon="screenShare" label={sharing ? "Stop sharing" : "Share screen"} active={!!sharing} onClick={() => (sharing ? stopShare() : void startShare())} className="hidden sm:flex" />
        <div className="relative">
          <Control icon="smile" label="React" active={showReactions} onClick={() => setShowReactions((v) => !v)} />
          {showReactions && (
            <div className="fixed bottom-20 left-1/2 z-40 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-2xl bg-[#1f1b4d] p-2 shadow-xl sm:absolute sm:bottom-14 sm:flex-nowrap">
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
        <Control icon="chat" label="Chat" active={panel === "chat"} badge={unreadChat} onClick={() => setPanel((p) => (p === "chat" ? null : "chat"))} />
        <Control icon="users" label="People" active={panel === "people"} badge={isMod ? waiting.length : 0} onClick={() => setPanel((p) => (p === "people" ? null : "people"))} />
        <Control icon="settings" label="Settings" active={panel === "settings"} onClick={() => setPanel((p) => (p === "settings" ? null : "settings"))} />
        <button
          onClick={() => (myRole === "host" ? setConfirmLeave(true) : void leave())}
          className="ml-1 flex h-11 items-center gap-2 rounded-full bg-red-600 px-3.5 font-medium hover:bg-red-500 sm:h-12 sm:px-5"
          aria-label="Leave the meeting"
        >
          <Icon name="hangUp" className="h-5 w-5" />
          <span className="hidden sm:inline">Leave</span>
        </button>
        {confirmLeave && (
          <div className="absolute bottom-20 left-1/2 z-50 w-72 -translate-x-1/2 space-y-2 rounded-2xl bg-[#1f1b4d] p-4 shadow-2xl">
            <p className="text-sm text-white/80">Leave, or end the meeting for everyone?</p>
            <button className="w-full rounded-xl bg-red-600 py-2.5 font-medium hover:bg-red-500" onClick={() => void leave(true)}>End for everyone</button>
            <button className="w-full rounded-xl bg-white/10 py-2.5 font-medium hover:bg-white/15" onClick={() => void leave()}>Just leave</button>
            <button className="w-full py-1.5 text-sm text-white/60 hover:text-white" onClick={() => setConfirmLeave(false)}>Cancel</button>
          </div>
        )}
      </footer>
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
        "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition disabled:opacity-40 sm:h-12 sm:w-12",
        off ? "bg-red-500 hover:bg-red-400" : active ? "bg-[#6a4cf5] hover:bg-[#5b3fe0]" : "bg-white/10 hover:bg-white/20",
        className,
      )}
    >
      <Icon name={icon} className="h-5 w-5" />
      {!!badge && badge > 0 && (
        <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#f2a93b] px-1 text-[11px] font-bold text-[#15123a]">{badge > 9 ? "9+" : badge}</span>
      )}
    </button>
  );
}

function Tile({ p, me, track, speaking, micOn, pinned, onPin, big }: { p: Participant; me: boolean; track: MediaStreamTrack | null | undefined; speaking: boolean; micOn: boolean; pinned: boolean; onPin: () => void; big?: boolean }) {
  return (
    <div className={cn("group relative h-full w-full overflow-hidden rounded-2xl bg-[#1b1842] ring-2 transition", speaking ? "ring-emerald-400" : "ring-transparent")}>
      {track ? (
        <VideoView track={track} mirror={me} />
      ) : (
        <div className="flex h-full items-center justify-center">
          <span className={cn("flex items-center justify-center rounded-full font-display font-bold", big ? "h-28 w-28 text-4xl" : "h-14 w-14 text-xl")} style={{ background: avatarColour(p.user_id) }}>
            {initialsOf(p.display_name)}
          </span>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-3 pt-6 pb-2 text-sm">
        {!micOn && <Icon name="micOff" className="h-4 w-4 text-red-300" title="Muted" />}
        <span className="truncate font-medium">{me ? `${p.display_name} (you)` : p.display_name}</span>
        {p.role !== "member" && <span className="rounded bg-white/15 px-1.5 text-[10px] uppercase tracking-wide">{p.role === "host" ? "Host" : "Co-host"}</span>}
        {p.is_guest && <span className="rounded bg-white/10 px-1.5 text-[10px] text-white/70">Guest</span>}
      </div>
      {p.hand_raised_at && <span className="absolute top-2 left-2 rounded-full bg-[#f2a93b] px-2 py-1 text-lg leading-none" title="Hand raised">✋</span>}
      <button
        onClick={onPin}
        className={cn("absolute top-2 right-2 rounded-full bg-black/50 p-2 transition", pinned ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100")}
        aria-label={pinned ? "Unpin" : `Pin ${p.display_name}`}
        title={pinned ? "Unpin" : "Pin"}
      >
        <Icon name="pin" className="h-4 w-4" />
      </button>
    </div>
  );
}

function AudioOut({ track, sinkId }: { track: MediaStreamTrack; sinkId: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    a.srcObject = new MediaStream([track]);
    void a.play().catch(() => undefined);
  }, [track]);
  useEffect(() => {
    const a = ref.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (a?.setSinkId && sinkId) void a.setSinkId(sinkId).catch(() => undefined);
  }, [sinkId]);
  return <audio ref={ref} autoPlay />;
}

function ChatPanel({ chat, meId, nameOf, onSend }: { chat: MeetEvent[]; meId: string; nameOf: (id: string | null) => string; onSend: (b: string) => Promise<string | null> }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [chat.length]);
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
        {chat.length === 0 && <p className="text-center text-sm text-white/45">Messages here are seen by everyone in the meeting.</p>}
        {chat.map((m, i) => {
          const mine = m.sender_id === meId;
          const joins = i > 0 && chat[i - 1].sender_id === m.sender_id;
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

function PeoplePanel({ people, waiting, meId, isMod, isHost, locked, waitingRoom, moderate }: { people: Participant[]; waiting: Participant[]; meId: string; isMod: boolean; isHost: boolean; locked: boolean; waitingRoom: boolean; moderate: (a: string, t?: string) => Promise<void> }) {
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
            <li key={p.id} className="relative flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-white/5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: avatarColour(p.user_id) }}>{initialsOf(p.display_name)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{p.display_name}{p.id === meId && " (you)"}</span>
                <span className="block text-xs text-white/45">{p.role === "host" ? "Host" : p.role === "cohost" ? "Co-host" : p.is_guest ? "Guest" : "Member"}</span>
              </span>
              {p.hand_raised_at && <span title="Hand raised">✋</span>}
              <Icon name={p.audio_on ? "mic" : "micOff"} className={cn("h-4 w-4", p.audio_on ? "text-white/70" : "text-red-300")} />
              <Icon name={p.video_on ? "video" : "videoOff"} className={cn("h-4 w-4", p.video_on ? "text-white/70" : "text-white/35")} />
              {isMod && p.id !== meId && p.role !== "host" && (
                <button className="rounded-lg p-1 hover:bg-white/10" aria-label={`Options for ${p.display_name}`} onClick={() => setMenu((m) => (m === p.id ? null : p.id))}>
                  <Icon name="dots" className="h-4 w-4" />
                </button>
              )}
              {menu === p.id && (
                <div className="absolute top-10 right-2 z-10 w-44 overflow-hidden rounded-xl bg-[#26225a] text-sm shadow-xl">
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

