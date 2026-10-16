"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { LogoMark } from "@/components/logo";
import { BackgroundProcessor, type BackgroundMode } from "@/lib/meet/background";
import { watchLevel } from "@/lib/meet/engine";
import { MEET_NAME } from "@/lib/meet/paths";
import type { JoinResult, PingResult, RoomInfo } from "@/lib/meet/types";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { AttendanceButton } from "../attendance";
import { Room } from "./room";

// ---------------------------------------------------------------------------
// My camera and microphone (kept from the lobby into the meeting)
// ---------------------------------------------------------------------------
export type LocalMedia = ReturnType<typeof useLocalMedia>;

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    // private mode: fine
  }
};

export function useLocalMedia() {
  const [mic, setMic] = useState<MediaStreamTrack | null>(null);
  const [camRaw, setCamRaw] = useState<MediaStreamTrack | null>(null);
  const [camOut, setCamOut] = useState<MediaStreamTrack | null>(null); // what others see (raw or with background)
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [micId, setMicId] = useState<string>(() => read("meet-mic") ?? "");
  const [camId, setCamId] = useState<string>(() => read("meet-cam") ?? "");
  const [speakerId, setSpeakerId] = useState<string>(() => read("meet-speaker") ?? "");
  const [background, setBackgroundState] = useState<BackgroundMode>({ kind: "none" });
  const [dataSaver, setDataSaver] = useState(() => read("meet-data-saver") === "1");
  const [problem, setProblem] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const processor = useRef<BackgroundProcessor | null>(null);

  const refreshDevices = useCallback(async () => {
    try {
      setDevices(await navigator.mediaDevices.enumerateDevices());
    } catch {
      // no device list: fine
    }
  }, []);

  const openMic = useCallback(async (deviceId?: string) => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      return s.getAudioTracks()[0];
    } catch {
      return null;
    }
  }, []);

  const openCam = useCallback(async (deviceId?: string, low = false) => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          width: { ideal: low ? 320 : 640 },
          height: { ideal: low ? 180 : 360 },
          frameRate: { ideal: low ? 15 : 24 },
        },
      });
      return s.getVideoTracks()[0];
    } catch {
      return null;
    }
  }, []);

  // First open: ask for both at once (one permission prompt).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setProblem("This browser can't use a camera or microphone. Try Chrome, Edge, Safari or Firefox.");
        return;
      }
      let a: MediaStreamTrack | null = null;
      let v: MediaStreamTrack | null = null;
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: micId ? { ideal: micId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: { deviceId: camId ? { ideal: camId } : undefined, width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 } },
        });
        a = s.getAudioTracks()[0] ?? null;
        v = s.getVideoTracks()[0] ?? null;
      } catch {
        // Try each on its own (no camera, or camera in use by another app).
        a = await openMic(micId || undefined);
        v = await openCam(camId || undefined);
      }
      if (cancelled) {
        a?.stop();
        v?.stop();
        return;
      }
      if (!a && !v) setProblem("Your browser blocked the camera and microphone. Allow them in the address bar, then reload. You can still join and listen.");
      else if (!a) setProblem("No microphone found or allowed. Others won't hear you.");
      setMic(a);
      setCamRaw(v);
      setCamOut(v);
      if (!v) setCamOn(false);
      if (!a) setMicOn(false);
      void refreshDevices();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
  }, [refreshDevices]);

  // Mute = the track keeps running but sends silence.
  useEffect(() => {
    if (mic) mic.enabled = micOn;
  }, [mic, micOn]);

  useEffect(() => {
    if (!mic) return;
    return watchLevel(mic, (l) => setLevel(micOn ? l : 0));
  }, [mic, micOn]);

  const applyBackground = useCallback(async (raw: MediaStreamTrack | null, mode: BackgroundMode) => {
    processor.current?.stop();
    processor.current = null;
    if (!raw || mode.kind === "none") {
      setCamOut(raw);
      return;
    }
    const p = new BackgroundProcessor(raw);
    p.onError = (m) => {
      setProblem(m);
      setBackgroundState({ kind: "none" });
      p.stop();
      processor.current = null;
      setCamOut(raw);
    };
    processor.current = p;
    await p.setMode(mode);
    if (processor.current === p) setCamOut(p.track);
  }, []);

  const toggleCam = useCallback(async () => {
    if (camOn) {
      // Camera light off: stop the device; others get a black frame.
      processor.current?.stop();
      processor.current = null;
      camRaw?.stop();
      setCamRaw(null);
      setCamOut(null);
      setCamOn(false);
      return;
    }
    const v = await openCam(camId || undefined, dataSaver);
    if (!v) {
      setProblem("Couldn't start the camera. Is another app using it?");
      return;
    }
    setCamRaw(v);
    setCamOn(true);
    await applyBackground(v, background);
  }, [camOn, camRaw, camId, dataSaver, background, openCam, applyBackground]);

  const chooseMic = useCallback(
    async (id: string) => {
      setMicId(id);
      write("meet-mic", id);
      const t = await openMic(id);
      if (!t) return;
      t.enabled = micOn;
      mic?.stop();
      setMic(t);
    },
    [mic, micOn, openMic],
  );

  const chooseCam = useCallback(
    async (id: string) => {
      setCamId(id);
      write("meet-cam", id);
      if (!camOn) return;
      const v = await openCam(id, dataSaver);
      if (!v) return;
      processor.current?.stop();
      processor.current = null;
      camRaw?.stop();
      setCamRaw(v);
      await applyBackground(v, background);
    },
    [camOn, camRaw, dataSaver, background, openCam, applyBackground],
  );

  const chooseSpeaker = useCallback((id: string) => {
    setSpeakerId(id);
    write("meet-speaker", id);
  }, []);

  const setBackground = useCallback(
    async (mode: BackgroundMode) => {
      setBackgroundState(mode);
      await applyBackground(camRaw, mode);
    },
    [camRaw, applyBackground],
  );

  const toggleDataSaver = useCallback(() => {
    setDataSaver((d) => {
      write("meet-data-saver", d ? "0" : "1");
      return !d;
    });
  }, []);

  const stopAll = useCallback(() => {
    processor.current?.stop();
    mic?.stop();
    camRaw?.stop();
  }, [mic, camRaw]);

  return {
    mic, camRaw, camOut, micOn, camOn, setMicOn, toggleCam, devices, micId, camId, speakerId,
    chooseMic, chooseCam, chooseSpeaker, background, setBackground, dataSaver, toggleDataSaver,
    problem, setProblem, level, stopAll,
  };
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------
export function VideoView({ track, mirror, className, contain }: { track: MediaStreamTrack | null | undefined; mirror?: boolean; className?: string; contain?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.srcObject = track ? new MediaStream([track]) : null;
    if (track) void v.play().catch(() => undefined);
  }, [track]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className={cn("h-full w-full", contain ? "object-contain" : "object-cover", mirror && "-scale-x-100", className)}
    />
  );
}

export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

const AVATAR_COLOURS = ["#6a4cf5", "#cc7a12", "#12968a", "#3b82f6", "#e5383b", "#8b5cf6", "#0e9f6e", "#d946ef"];
export function avatarColour(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLOURS[h % AVATAR_COLOURS.length];
}

function MeetShell({ children, base }: { children: React.ReactNode; base: string }) {
  return (
    <div className="flex min-h-dvh flex-col bg-[#0f0d26] text-white">
      <header className="flex items-center justify-between px-4 py-3 sm:px-6">
        <Link href={base || "/"} className="flex items-center gap-2 font-display text-lg font-bold">
          <LogoMark tile className="h-8 w-8" />
          {MEET_NAME}
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-6">{children}</main>
    </div>
  );
}

function Notice({ title, children, base, action }: { title: string; children?: React.ReactNode; base: string; action?: React.ReactNode }) {
  return (
    <MeetShell base={base}>
      <div className="max-w-md text-center">
        <h1 className="font-display text-3xl font-bold">{title}</h1>
        {children && <div className="mt-3 text-white/70">{children}</div>}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {action}
          <Link href={base || "/"} className="rounded-xl bg-white/10 px-5 py-2.5 font-medium hover:bg-white/15">
            Start your own free meeting
          </Link>
        </div>
      </div>
    </MeetShell>
  );
}

// ---------------------------------------------------------------------------
// The whole flow: lobby → (waiting) → meeting → end screens
// ---------------------------------------------------------------------------
type Phase = { kind: "lobby" } | { kind: "waiting"; join: JoinResult } | { kind: "room"; join: JoinResult } | { kind: "out"; reason: "left" | "ended" | "removed" | "denied" | "limit" };

export function MeetingApp({ code, base, signedInName }: { code: string; base: string; signedInName: string | null }) {
  const [info, setInfo] = useState<RoomInfo | null | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>({ kind: "lobby" });
  const [name, setName] = useState(signedInName ?? "");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const media = useLocalMedia();

  const loadInfo = useCallback(async () => {
    const { data } = await createClient().rpc("meet_room_info", { p_code: code });
    setInfo((data as RoomInfo | null) ?? null);
    return data as RoomInfo | null;
  }, [code]);

  useEffect(() => {
    void loadInfo();
    if (!signedInName) setName(read("meet-name") ?? "");
  }, [loadInfo, signedInName]);

  // Keep the lobby's "people in the meeting" fresh.
  useEffect(() => {
    if (phase.kind !== "lobby") return;
    const t = setInterval(() => void loadInfo(), 10_000);
    return () => clearInterval(t);
  }, [phase.kind, loadInfo]);

  async function join() {
    setError(null);
    const clean = name.trim().replace(/\s+/g, " ");
    if (!signedInName && clean.length < 2) {
      setError("Type your name so people know who's joining.");
      return;
    }
    setJoining(true);
    try {
      const supabase = createClient();
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) {
        // Guests: a temporary account just for meetings, no email needed.
        const { error: e } = await supabase.auth.signInAnonymously();
        if (e) throw new Error("Guests can't join right now. Ask the host, or sign in.");
      }
      if (!signedInName) write("meet-name", clean);
      const { data, error: e } = await supabase.rpc("meet_join", { p_code: code, p_name: clean });
      if (e) throw new Error(e.message);
      const j = data as JoinResult;
      setPhase(j.status === "admitted" ? { kind: "room", join: j } : { kind: "waiting", join: j });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't join. Try again.");
      void loadInfo();
    } finally {
      setJoining(false);
    }
  }

  // Waiting room: check every 3 s whether the host let me in.
  useEffect(() => {
    if (phase.kind !== "waiting") return;
    const roomId = phase.join.room_id;
    const t = setInterval(async () => {
      const { data } = await createClient().rpc("meet_ping", { p_room: roomId, p_patch: {} });
      const p = data as PingResult | null;
      if (!p) return;
      if (p.ended) setPhase({ kind: "out", reason: "ended" });
      else if (p.status === "admitted") setPhase({ kind: "room", join: { ...phase.join, status: "admitted", ends_at: p.ends_at } });
      else if (p.status === "denied") setPhase({ kind: "out", reason: "denied" });
      else if (p.status === "removed") setPhase({ kind: "out", reason: "removed" });
    }, 3000);
    return () => clearInterval(t);
  }, [phase]);

  const leaveWaiting = async () => {
    if (phase.kind === "waiting") await createClient().rpc("meet_leave", { p_room: phase.join.room_id });
    setPhase({ kind: "lobby" });
  };

  if (info === undefined) {
    return (
      <MeetShell base={base}>
        <p className="text-white/60">Opening the meeting…</p>
      </MeetShell>
    );
  }
  if (info === null) {
    return (
      <Notice title="Meeting not found" base={base}>
        Check the link. Meeting codes look like <span className="font-mono">abc-defg-hij</span>.
      </Notice>
    );
  }

  if (phase.kind === "room") {
    return (
      <Room
        info={info}
        join={phase.join}
        media={media}
        base={base}
        onExit={(reason) => {
          setPhase({ kind: "out", reason });
          void loadInfo();
        }}
      />
    );
  }

  if (phase.kind === "out" || info.ended) {
    const reason = phase.kind === "out" ? phase.reason : "ended";
    const text = {
      left: ["You left the meeting", null],
      ended: ["This meeting has ended", "Thanks for joining."],
      removed: ["The host removed you", "You can't rejoin this meeting."],
      denied: ["The host didn't let you in", null],
      limit: ["The 1-hour free meeting is over", info.is_host ? "Meet Pro keeps meetings going for up to 24 hours, from ₦1,000 a month." : "The host can upgrade to Meet Pro for longer meetings."],
    }[reason];
    return (
      <Notice
        title={text[0]!}
        base={base}
        action={
          <>
            {(reason === "left" || reason === "ended" || reason === "limit") && (info.is_host || info.my_status === "left" || info.my_status === "admitted") && (
              <AttendanceButton code={info.code} dark />
            )}
            {reason === "left" && !info.ended ? (
              <button className="rounded-xl bg-[#6a4cf5] px-5 py-2.5 font-medium hover:bg-[#5b3fe0]" onClick={() => setPhase({ kind: "lobby" })}>
                Rejoin
              </button>
            ) : reason === "limit" && info.is_host ? (
              <Link href={`${base}/pricing`} className="rounded-xl bg-[#f2a93b] px-5 py-2.5 font-semibold text-[#15123a] hover:bg-[#f5b85c]">
                See Meet Pro
              </Link>
            ) : null}
          </>
        }
      >
        {text[1]}
      </Notice>
    );
  }

  const waiting = phase.kind === "waiting";
  const direct = info.is_host || !info.waiting_room;
  return (
    <MeetShell base={base}>
      <div className="grid w-full max-w-5xl items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
        <Preview media={media} />
        <div className="space-y-5">
          {waiting ? (
            <>
              <h1 className="font-display text-3xl font-bold">Asking to join…</h1>
              <p className="text-white/70">
                {info.started ? `${info.host_name} will let you in soon.` : `Waiting for ${info.host_name} to start the meeting.`}
              </p>
              <div className="flex items-center gap-2 text-sm text-white/50">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#f2a93b]" />
                You can test your camera and mic while you wait.
              </div>
              <button className="rounded-xl bg-white/10 px-5 py-2.5 font-medium hover:bg-white/15" onClick={() => void leaveWaiting()}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <div>
                <p className="text-sm font-medium text-[#f2a93b]">{info.is_host ? "Your meeting" : `${info.host_name}'s meeting`}</p>
                <h1 className="mt-1 font-display text-3xl font-bold">{info.title || "Ready to join?"}</h1>
                <p className="mt-2 text-white/60">
                  {info.in_meeting > 0
                    ? `${info.in_meeting} ${info.in_meeting === 1 ? "person is" : "people are"} in the meeting`
                    : info.is_host
                      ? "The meeting starts when you join"
                      : info.started
                        ? "No one else is here yet"
                        : "The meeting hasn't started yet"}
                  {info.host_tier === "free" && " · Free meeting, up to 1 hour"}
                </p>
              </div>
              {!signedInName && (
                <div>
                  <label htmlFor="meet-name" className="mb-1.5 block text-sm font-medium text-white/80">Your name</label>
                  <input
                    id="meet-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void join()}
                    maxLength={60}
                    autoComplete="name"
                    placeholder="e.g. Adaeze Okafor"
                    className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/35 focus:border-[#8f7bff] focus:outline-none"
                  />
                </div>
              )}
              {error && <p role="alert" className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">{error}</p>}
              {info.locked && !info.is_host && <p className="text-sm text-white/60">The host locked this meeting. Only people already let in can join.</p>}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="rounded-xl bg-[#6a4cf5] px-6 py-3 font-semibold hover:bg-[#5b3fe0] disabled:opacity-60"
                  disabled={joining}
                  onClick={() => void join()}
                >
                  {joining ? "Joining…" : direct ? "Join now" : "Ask to join"}
                </button>
                {signedInName ? (
                  <span className="text-sm text-white/50">Joining as {signedInName}</span>
                ) : (
                  <Link href={`/login?next=${encodeURIComponent(`${base}/${code}`)}`} className="text-sm text-white/60 underline-offset-4 hover:underline">
                    Have an account? Sign in
                  </Link>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </MeetShell>
  );
}

function Preview({ media }: { media: LocalMedia }) {
  return (
    <div className="space-y-3">
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-[#1b1842]">
        {media.camOn && media.camOut ? (
          <VideoView track={media.camOut} mirror />
        ) : (
          <div className="flex h-full items-center justify-center text-white/50">
            <span className="flex flex-col items-center gap-2"><Icon name="videoOff" className="h-8 w-8" />Camera is off</span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 bg-gradient-to-t from-black/60 to-transparent p-4">
          <RoundButton on={media.micOn} onClick={() => media.setMicOn(!media.micOn)} disabled={!media.mic} label={media.micOn ? "Mute" : "Unmute"} icon={media.micOn ? "mic" : "micOff"} />
          <RoundButton on={media.camOn} onClick={() => void media.toggleCam()} label={media.camOn ? "Turn camera off" : "Turn camera on"} icon={media.camOn ? "video" : "videoOff"} />
        </div>
        {media.micOn && media.mic && (
          <div className="absolute top-3 left-3 flex items-end gap-0.5 rounded-full bg-black/40 px-2 py-1.5" aria-label="Microphone level">
            {[0.08, 0.2, 0.35, 0.5, 0.7].map((t, i) => (
              <span key={i} className={cn("w-1 rounded-full transition-colors", media.level > t ? "bg-emerald-400" : "bg-white/25")} style={{ height: 4 + i * 3 }} />
            ))}
          </div>
        )}
      </div>
      {media.problem && <p className="rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-100">{media.problem}</p>}
      <details className="group rounded-2xl bg-white/5 open:pb-4">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-white/80">
          <span className="flex items-center gap-2"><Icon name="settings" className="h-4 w-4" />Camera, mic, background and data saver</span>
          <Icon name="chevronDown" className="h-4 w-4 transition group-open:rotate-180" />
        </summary>
        <div className="px-4"><DeviceSettings media={media} compact /></div>
      </details>
    </div>
  );
}

export function RoundButton({ on, onClick, label, icon, disabled, danger }: { on: boolean; onClick: () => void; label: string; icon: Parameters<typeof Icon>[0]["name"]; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={!on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-12 w-12 items-center justify-center rounded-full transition disabled:opacity-40",
        danger ? "bg-red-600 hover:bg-red-500" : on ? "bg-white/15 hover:bg-white/25" : "bg-red-500 hover:bg-red-400",
      )}
    >
      <Icon name={icon} className="h-5 w-5" />
    </button>
  );
}

const BACKGROUNDS: Array<{ label: string; mode: BackgroundMode; swatch: string }> = [
  { label: "None", mode: { kind: "none" }, swatch: "linear-gradient(135deg,#2a2660,#1b1842)" },
  { label: "Light blur", mode: { kind: "blur", strength: "light" }, swatch: "radial-gradient(circle,#8f7bff88,#2a2660)" },
  { label: "Strong blur", mode: { kind: "blur", strength: "strong" }, swatch: "radial-gradient(circle,#8f7bffcc,#4b2fd6)" },
  { label: "Office", mode: { kind: "image", id: "office" }, swatch: "linear-gradient(#e9e4dc 60%,#8b6f55 60%)" },
  { label: "Workbase", mode: { kind: "image", id: "violet" }, swatch: "radial-gradient(circle at 30% 20%,#8f7bff,#4b2fd6 55%,#15123a)" },
  { label: "Sunset", mode: { kind: "image", id: "lagos" }, swatch: "linear-gradient(#ff9a62,#f2a93b 55%,#1d3557 56%)" },
  { label: "Plain", mode: { kind: "image", id: "plain" }, swatch: "#e7e5ef" },
];

const sameMode = (a: BackgroundMode, b: BackgroundMode) => JSON.stringify(a) === JSON.stringify(b);

export function DeviceSettings({ media, compact }: { media: LocalMedia; compact?: boolean }) {
  const mics = media.devices.filter((d) => d.kind === "audioinput");
  const cams = media.devices.filter((d) => d.kind === "videoinput");
  const speakers = media.devices.filter((d) => d.kind === "audiooutput");
  const select = "w-full truncate rounded-lg border border-white/15 bg-[#1b1842] px-3 py-2 text-sm text-white focus:border-[#8f7bff] focus:outline-none";
  return (
    <div className="space-y-4">
      <div className={cn("grid gap-3", compact ? "sm:grid-cols-3" : "")}>
        <label className="block text-xs text-white/60">
          <span className="mb-1 flex items-center gap-1"><Icon name="mic" className="h-3.5 w-3.5" />Microphone</span>
          <select className={select} value={media.micId} onChange={(e) => void media.chooseMic(e.target.value)} disabled={!mics.length}>
            {!media.micId && <option value="">Default</option>}
            {mics.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>)}
          </select>
        </label>
        <label className="block text-xs text-white/60">
          <span className="mb-1 flex items-center gap-1"><Icon name="video" className="h-3.5 w-3.5" />Camera</span>
          <select className={select} value={media.camId} onChange={(e) => void media.chooseCam(e.target.value)} disabled={!cams.length}>
            {!media.camId && <option value="">Default</option>}
            {cams.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>)}
          </select>
        </label>
        {speakers.length > 0 && (
          <label className="block text-xs text-white/60">
            <span className="mb-1 flex items-center gap-1"><Icon name="speaker" className="h-3.5 w-3.5" />Speaker</span>
            <select className={select} value={media.speakerId} onChange={(e) => media.chooseSpeaker(e.target.value)}>
              {!media.speakerId && <option value="">Default</option>}
              {speakers.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Speaker ${i + 1}`}</option>)}
            </select>
          </label>
        )}
      </div>
      <div>
        <p className="mb-2 text-xs text-white/60">Background</p>
        <div className="flex flex-wrap gap-2">
          {BACKGROUNDS.map((b) => (
            <button
              key={b.label}
              type="button"
              title={b.label}
              aria-label={`Background: ${b.label}`}
              aria-pressed={sameMode(media.background, b.mode)}
              disabled={!media.camOn}
              onClick={() => void media.setBackground(b.mode)}
              className={cn(
                "h-11 w-16 rounded-lg border-2 text-[10px] font-semibold text-white/90 transition disabled:opacity-40",
                sameMode(media.background, b.mode) ? "border-[#f2a93b]" : "border-transparent hover:border-white/40",
              )}
              style={{ background: b.swatch }}
            >
              {b.mode.kind === "none" ? "None" : b.mode.kind === "blur" ? (b.mode.strength === "light" ? "Blur" : "Blur+") : ""}
            </button>
          ))}
        </div>
      </div>
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-white/5 px-4 py-3">
        <span>
          <span className="block text-sm font-medium">Data saver</span>
          <span className="block text-xs text-white/55">Low-quality video out, other people&apos;s cameras off. Uses about 10× less data.</span>
        </span>
        <input type="checkbox" className="h-5 w-5 accent-[#f2a93b]" checked={media.dataSaver} onChange={media.toggleDataSaver} />
      </label>
    </div>
  );
}
