import {
  ACTIVE_IF_IDLE_UNDER,
  AUTO_CLOCK_OUT_IDLE_MINUTES,
  BLOCK_SECONDS,
  MAX_TICK_GAP_SECONDS,
  RESUME_SESSION_WITHIN_MINUTES,
} from "./config";
import type { ActiveWindow } from "./activeWindow";
import { blockStart, localDate, readJson, uuid, writeFileAtomic } from "./util";

export type Settings = {
  idle_timeout_minutes: number;
  track_apps: boolean;
  track_urls: boolean;
  screenshots_enabled?: boolean;
};

export type Account = {
  userId: string;
  email: string;
  fullName: string;
  orgId: string;
  orgName: string;
  role: string;
  deviceId: string;
  timezone: string;
};

type Versioned = { v: number; sent: number };
type SessionRec = Versioned & { id: string; started_at: string; ended_at: string | null; end_reason: string | null };
type BlockRec = Versioned & {
  session_id: string;
  block_start: string;
  active: number;
  idle: number;
  discarded: number;
  apps: Record<string, number>; // "app\u0000title" -> seconds
};
type IdleRec = Versioned & {
  id: string;
  session_id: string;
  started_at: string;
  ended_at: string | null;
  decision: "pending" | "kept" | "discarded";
  reason: string | null;
  seconds: Record<string, number>; // block_start -> idle seconds inside this period
};

export type TrackerState = {
  installId: string;
  account: Account | null;
  dataOwner: string | null; // user id the saved tracking data belongs to
  settings: Settings;
  consent: { orgId: string; trackApps: boolean; at: string } | null;
  currentSessionId: string | null;
  sessions: Record<string, SessionRec>;
  blocks: Record<string, BlockRec>;
  idle: Record<string, IdleRec>;
  idleRun: { startedAt: number; seconds: Record<string, number> } | null;
  activeIdleId: string | null;
  lastTickAt: number | null;
  today: { date: string; tracked: number; active: number };
  clockOffsetMs: number;
  lastSyncAt: number | null;
  notice: string | null;
};

export type Payload = {
  batch_id: string;
  device_id: string;
  sent_at: string;
  sessions: Array<{ id: string; started_at: string; ended_at: string | null; end_reason: string | null }>;
  blocks: Array<{ session_id: string; block_start: string; active: number; idle: number; discarded: number }>;
  apps: Array<{ session_id: string; block_start: string; app: string; title: string; seconds: number }>;
  idle_periods: Array<{
    id: string;
    session_id: string;
    started_at: string;
    ended_at: string | null;
    decision: string;
    reason: string | null;
  }>;
};

type Snapshot = { sessions: Record<string, number>; blocks: Record<string, number>; idle: Record<string, number> };

const DEFAULT_SETTINGS: Settings = { idle_timeout_minutes: 5, track_apps: true, track_urls: false };
const MAX_APPS_PER_BLOCK = 30;
const iso = (ms: number) => new Date(ms).toISOString();
const blockKey = (sessionId: string, start: string) => `${sessionId}|${start}`;

/**
 * All tracking logic, kept free of Electron so it is easy to reason about.
 * State is saved to disk after every change, so nothing is lost if the
 * internet, the app or the computer goes down.
 */
export class Tracker {
  state: TrackerState;
  currentApp: string | null = null;

  constructor(private file: string) {
    const fresh: TrackerState = {
      installId: `inst-${uuid()}`,
      account: null,
      dataOwner: null,
      settings: DEFAULT_SETTINGS,
      consent: null,
      currentSessionId: null,
      sessions: {},
      blocks: {},
      idle: {},
      idleRun: null,
      activeIdleId: null,
      lastTickAt: null,
      today: { date: "", tracked: 0, active: 0 },
      clockOffsetMs: 0,
      lastSyncAt: null,
      notice: null,
    };
    this.state = { ...fresh, ...readJson<Partial<TrackerState>>(file, {}) };
    this.save();
  }

  save() {
    writeFileAtomic(this.file, JSON.stringify(this.state));
  }

  /** Current time, corrected by the server's clock. */
  now(): number {
    return Date.now() + this.state.clockOffsetMs;
  }

  setServerTime(serverIso: string | undefined) {
    if (!serverIso) return;
    const server = Date.parse(serverIso);
    if (!Number.isNaN(server)) this.state.clockOffsetMs = server - Date.now();
  }

  get clockedIn() {
    return this.state.currentSessionId !== null;
  }

  get session(): SessionRec | null {
    const id = this.state.currentSessionId;
    return id ? (this.state.sessions[id] ?? null) : null;
  }

  /** Tracking of apps is on only if the company allows it AND the worker agreed to it. */
  get appTrackingAllowed() {
    return this.state.settings.track_apps && !!this.state.consent?.trackApps;
  }

  /** The worker must (re)consent when tracking expands beyond what they agreed to. */
  get needsConsent() {
    const c = this.state.consent;
    if (!this.state.account) return false;
    if (!c || c.orgId !== this.state.account.orgId) return true;
    return this.state.settings.track_apps && !c.trackApps;
  }

  giveConsent() {
    if (!this.state.account) return;
    this.state.consent = {
      orgId: this.state.account.orgId,
      trackApps: this.state.settings.track_apps,
      at: iso(this.now()),
    };
    this.save();
  }

  setAccount(account: Account | null) {
    this.state.account = account;
    if (account) this.state.dataOwner = account.userId;
    this.save();
  }

  setSettings(settings: Partial<Settings> | undefined) {
    if (!settings) return;
    this.state.settings = { ...DEFAULT_SETTINGS, ...this.state.settings, ...settings };
    this.save();
  }

  // ------------------------------------------------------------------
  // Clock in / out
  // ------------------------------------------------------------------

  clockIn() {
    if (this.clockedIn) return;
    const now = this.now();
    const id = uuid();
    this.state.sessions[id] = { id, started_at: iso(now), ended_at: null, end_reason: null, v: 1, sent: 0 };
    this.state.currentSessionId = id;
    this.state.lastTickAt = now;
    this.state.idleRun = null;
    this.state.activeIdleId = null;
    this.state.notice = null;
    this.save();
  }

  /** Ends the session. Idle time nobody answered for is not counted. */
  clockOut(reason: string, atMs?: number) {
    const session = this.session;
    if (!session) return;
    const end = Math.max(Date.parse(session.started_at), atMs ?? this.now());

    if (this.state.activeIdleId) this.endIdle(end);
    for (const rec of Object.values(this.state.idle)) {
      if (rec.session_id === session.id && rec.decision === "pending") this.decideIdle(rec.id, false, null);
    }

    session.ended_at = iso(end);
    session.end_reason = reason;
    session.v++;
    this.state.currentSessionId = null;
    this.state.idleRun = null;
    this.state.activeIdleId = null;
    this.currentApp = null;
    this.save();
  }

  /** On app start: continue a session after a quick restart, otherwise close it where it stopped. */
  recoverAfterRestart() {
    const session = this.session;
    if (!session) return;
    const last = this.state.lastTickAt ?? Date.parse(session.started_at);
    if (this.now() - last <= RESUME_SESSION_WITHIN_MINUTES * 60_000) return;
    this.clockOut("agent_restart", last);
    this.state.notice = "You were clocked out because the app was closed. Clock in again to continue.";
    this.save();
  }

  // ------------------------------------------------------------------
  // Sampling (every TICK_SECONDS while clocked in)
  // ------------------------------------------------------------------

  /** Returns "auto_clock_out" when long idle ended the session. */
  tick(systemIdleSeconds: number, window: ActiveWindow | null): "ok" | "gap" | "auto_clock_out" | "idle" {
    const now = this.now();
    this.rollToday(now);
    const session = this.session;
    if (!session) return "ok";

    const last = this.state.lastTickAt ?? now;
    const elapsed = (now - last) / 1000;
    this.state.lastTickAt = now;
    if (elapsed <= 0) return "ok";
    if (elapsed > MAX_TICK_GAP_SECONDS) {
      // Computer slept or the app froze: that time is not tracked.
      this.save();
      return "gap";
    }

    const segments = splitIntoBlocks(now - elapsed * 1000, now);
    const timeoutSeconds = Math.max(1, this.state.settings.idle_timeout_minutes) * 60;
    let result: "ok" | "auto_clock_out" | "idle" = "ok";

    if (systemIdleSeconds < ACTIVE_IF_IDLE_UNDER) {
      // Keyboard or mouse used recently.
      if (this.state.activeIdleId) this.endIdle(now - systemIdleSeconds * 1000);
      this.state.idleRun = null;
      for (const seg of segments) {
        const b = this.block(session.id, seg.start);
        b.active += seg.seconds;
        this.addApp(b, window, seg.seconds);
        b.v++;
      }
      this.state.today.active += elapsed;
      this.state.today.tracked += elapsed;
    } else {
      // No input: counts as work (reading, thinking) until the idle timeout.
      for (const seg of segments) {
        const b = this.block(session.id, seg.start);
        b.idle += seg.seconds;
        if (!this.state.activeIdleId) this.addApp(b, window, seg.seconds);
        b.v++;
      }
      this.state.today.tracked += elapsed;

      if (this.state.activeIdleId) {
        const rec = this.state.idle[this.state.activeIdleId];
        for (const seg of segments) rec.seconds[seg.start] = (rec.seconds[seg.start] ?? 0) + seg.seconds;
        if (now - Date.parse(rec.started_at) >= AUTO_CLOCK_OUT_IDLE_MINUTES * 60_000) {
          this.clockOut("idle_timeout", Date.parse(rec.started_at));
          this.state.notice = `You were clocked out after ${AUTO_CLOCK_OUT_IDLE_MINUTES} minutes without activity.`;
          this.save();
          return "auto_clock_out";
        }
        result = "idle";
      } else {
        const run = (this.state.idleRun ??= { startedAt: now - systemIdleSeconds * 1000, seconds: {} });
        for (const seg of segments) run.seconds[seg.start] = (run.seconds[seg.start] ?? 0) + seg.seconds;
        if (systemIdleSeconds >= timeoutSeconds) {
          const id = uuid();
          this.state.idle[id] = {
            id,
            session_id: session.id,
            started_at: iso(Math.max(run.startedAt, Date.parse(session.started_at))),
            ended_at: null,
            decision: "pending",
            reason: null,
            seconds: run.seconds,
            v: 1,
            sent: 0,
          };
          this.state.activeIdleId = id;
          this.state.idleRun = null;
          result = "idle";
        }
      }
    }

    this.currentApp = this.appTrackingAllowed && window ? window.app : null;
    this.save();
    return result;
  }

  // ------------------------------------------------------------------
  // Idle periods
  // ------------------------------------------------------------------

  private endIdle(atMs: number) {
    const id = this.state.activeIdleId;
    if (!id) return;
    const rec = this.state.idle[id];
    rec.ended_at = iso(Math.max(atMs, Date.parse(rec.started_at)));
    rec.v++;
    this.state.activeIdleId = null;
  }

  /** Idle periods that ended and still need an answer from the worker. */
  pendingIdle(): IdleRec[] {
    return Object.values(this.state.idle)
      .filter((r) => r.decision === "pending" && r.ended_at !== null)
      .sort((a, b) => a.started_at.localeCompare(b.started_at));
  }

  decideIdle(id: string, keep: boolean, reason: string | null) {
    const rec = this.state.idle[id];
    if (!rec || rec.decision !== "pending") return;
    rec.decision = keep ? "kept" : "discarded";
    rec.reason = keep ? (reason?.trim().slice(0, 200) || null) : null;
    rec.v++;

    if (!keep) {
      let moved = 0;
      for (const [start, secs] of Object.entries(rec.seconds)) {
        const b = this.state.blocks[blockKey(rec.session_id, start)];
        if (!b) continue;
        const m = Math.min(secs, b.idle);
        b.idle -= m;
        b.discarded += m;
        b.v++;
        moved += m;
      }
      if (localDate(Date.parse(rec.started_at)) === this.state.today.date) {
        this.state.today.tracked = Math.max(0, this.state.today.tracked - moved);
      }
    }
    this.save();
  }

  // ------------------------------------------------------------------
  // Upload
  // ------------------------------------------------------------------

  hasUnsent(): boolean {
    const dirty = (r: Versioned) => r.v > r.sent;
    return (
      Object.values(this.state.sessions).some(dirty) ||
      Object.values(this.state.blocks).some(dirty) ||
      Object.values(this.state.idle).some(dirty)
    );
  }

  pendingCount(): number {
    const dirty = (r: Versioned) => r.v > r.sent;
    return (
      Object.values(this.state.sessions).filter(dirty).length +
      Object.values(this.state.blocks).filter(dirty).length +
      Object.values(this.state.idle).filter(dirty).length
    );
  }

  /** Everything changed since the last successful upload. */
  buildPayload(deviceId: string): { payload: Payload; snapshot: Snapshot } | null {
    if (!this.hasUnsent()) return null;
    const snapshot: Snapshot = { sessions: {}, blocks: {}, idle: {} };
    const payload: Payload = {
      batch_id: uuid(),
      device_id: deviceId,
      sent_at: iso(this.now()),
      sessions: [],
      blocks: [],
      apps: [],
      idle_periods: [],
    };

    const changedBlocks = Object.entries(this.state.blocks).filter(([, b]) => b.v > b.sent);
    const sessionIds = new Set<string>();

    // At most 300 blocks per upload (about 2 days); the sync loop sends the rest next.
    for (const [key, b] of changedBlocks.slice(0, 300)) {
      snapshot.blocks[key] = b.v;
      sessionIds.add(b.session_id);
      payload.blocks.push({
        session_id: b.session_id,
        block_start: b.block_start,
        active: clamp(b.active),
        idle: clamp(b.idle),
        discarded: clamp(b.discarded),
      });
      if (this.appTrackingAllowed) {
        for (const a of topApps(b.apps)) payload.apps.push({ session_id: b.session_id, block_start: b.block_start, ...a });
      }
    }

    const changedIdle = Object.values(this.state.idle).filter((r) => r.v > r.sent);
    for (const r of changedIdle) sessionIds.add(r.session_id);

    for (const s of Object.values(this.state.sessions)) {
      if (s.v > s.sent || sessionIds.has(s.id)) {
        snapshot.sessions[s.id] = s.v;
        payload.sessions.push({ id: s.id, started_at: s.started_at, ended_at: s.ended_at, end_reason: s.end_reason });
      }
    }

    for (const r of changedIdle) {
      snapshot.idle[r.id] = r.v;
      payload.idle_periods.push({
        id: r.id,
        session_id: r.session_id,
        started_at: r.started_at,
        ended_at: r.ended_at,
        decision: r.decision,
        reason: r.reason,
      });
    }

    return { payload, snapshot };
  }

  /** After a successful upload: mark what was sent and forget finished data. */
  markSent(snapshot: Snapshot) {
    for (const [id, v] of Object.entries(snapshot.sessions)) {
      const s = this.state.sessions[id];
      if (s) s.sent = Math.max(s.sent, v);
    }
    for (const [key, v] of Object.entries(snapshot.blocks)) {
      const b = this.state.blocks[key];
      if (b) b.sent = Math.max(b.sent, v);
    }
    for (const [id, v] of Object.entries(snapshot.idle)) {
      const r = this.state.idle[id];
      if (r) r.sent = Math.max(r.sent, v);
    }
    this.state.lastSyncAt = Date.now();
    this.prune();
    this.save();
  }

  private prune() {
    const done = (r: Versioned) => r.sent >= r.v;
    for (const [id, s] of Object.entries(this.state.sessions)) {
      if (s.ended_at === null || !done(s)) continue;
      const blocksLeft = Object.values(this.state.blocks).some((b) => b.session_id === id && !done(b));
      const idleLeft = Object.values(this.state.idle).some((r) => r.session_id === id && !done(r));
      if (blocksLeft || idleLeft) continue;
      for (const [k, b] of Object.entries(this.state.blocks)) if (b.session_id === id) delete this.state.blocks[k];
      for (const [k, r] of Object.entries(this.state.idle)) if (r.session_id === id) delete this.state.idle[k];
      delete this.state.sessions[id];
    }
  }

  /** Forget everything (log out). */
  reset() {
    const installId = this.state.installId;
    this.state = {
      installId,
      account: null,
      dataOwner: null,
      settings: DEFAULT_SETTINGS,
      consent: null,
      currentSessionId: null,
      sessions: {},
      blocks: {},
      idle: {},
      idleRun: null,
      activeIdleId: null,
      lastTickAt: null,
      today: { date: "", tracked: 0, active: 0 },
      clockOffsetMs: this.state.clockOffsetMs,
      lastSyncAt: null,
      notice: null,
    };
    this.save();
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private block(sessionId: string, start: string): BlockRec {
    const key = blockKey(sessionId, start);
    return (this.state.blocks[key] ??= {
      session_id: sessionId,
      block_start: start,
      active: 0,
      idle: 0,
      discarded: 0,
      apps: {},
      v: 0,
      sent: 0,
    });
  }

  private addApp(b: BlockRec, window: ActiveWindow | null, seconds: number) {
    if (!this.appTrackingAllowed || !window?.app) return;
    const title = window.title.slice(0, 300);
    const key = `${window.app.slice(0, 120)}\u0000${title}`;
    b.apps[key] = (b.apps[key] ?? 0) + seconds;
  }

  private rollToday(now: number) {
    const date = localDate(now);
    if (this.state.today.date !== date) this.state.today = { date, tracked: 0, active: 0 };
  }
}

/** Split [from, to) into pieces that each fall inside one 10-minute block. */
function splitIntoBlocks(from: number, to: number): Array<{ start: string; seconds: number }> {
  const size = BLOCK_SECONDS * 1000;
  const out: Array<{ start: string; seconds: number }> = [];
  let t = from;
  while (t < to) {
    const blockEnd = (Math.floor(t / size) + 1) * size;
    const end = Math.min(blockEnd, to);
    out.push({ start: blockStart(t), seconds: (end - t) / 1000 });
    t = end;
  }
  return out;
}

function clamp(seconds: number) {
  return Math.min(600, Math.max(0, Math.round(seconds)));
}

/** The biggest apps in a block; the rest are merged into "Other". */
function topApps(apps: Record<string, number>) {
  const rows = Object.entries(apps)
    .map(([key, seconds]) => {
      const [app, title = ""] = key.split("\u0000");
      return { app, title, seconds };
    })
    .sort((a, b) => b.seconds - a.seconds);
  const top = rows.slice(0, MAX_APPS_PER_BLOCK).map((r) => ({ ...r, seconds: clamp(r.seconds) }));
  const rest = rows.slice(MAX_APPS_PER_BLOCK).reduce((s, r) => s + r.seconds, 0);
  if (rest > 0) top.push({ app: "Other apps", title: "\u2026", seconds: clamp(rest) });
  return top.filter((r) => r.seconds > 0);
}
