import os from "node:os";
import path from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  powerMonitor,
  shell,
  Tray,
} from "electron";
import { ActiveWindowReader } from "./activeWindow";
import { Api, ApiError, type AgentBilling } from "./api";
import { APP_NAME, DASHBOARD_URL, HEARTBEAT_SECONDS, SYNC_SECONDS, TICK_SECONDS } from "./config";
import { Screenshots } from "./screenshots";
import { SecureStore } from "./storage";
import { Tracker } from "./tracker";
import { startAutoUpdates } from "./updater";
import { formatDuration } from "./util";

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let tracker: Tracker;
let api: Api;
let store: SecureStore;
let reader: ActiveWindowReader;
let shots: Screenshots;

let quitting = false;
let online = true;
let syncing = false;
let lastError: string | null = null;
let loginMessage: string | null = null;
let lastPendingIdleCount = 0;
let lastState: "active" | "idle" = "active";
let updater: ReturnType<typeof startAutoUpdates>;
let unreadChat = 0;
let billing: AgentBilling | null = null; // plan limits from the server; null = unknown (allowed)
let askClockOut = false; // the window shows the "what did you get done?" panel
let lastTaskFetch = 0;

const TASK_REFRESH_SECONDS = 5 * 60;

const assets = path.join(__dirname, "..", "assets");
const startHidden = process.argv.includes("--hidden");

// ---------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());
  app.whenReady().then(start);
}

async function start() {
  // Must match the installer's appId (package.json build.appId) so Windows shows our notifications.
  if (process.platform === "win32") app.setAppUserModelId("com.workforce.agent");
  const userData = app.getPath("userData");
  store = new SecureStore(path.join(userData, "auth.bin"));
  tracker = new Tracker(path.join(userData, "state.json"));
  api = new Api(store);
  reader = new ActiveWindowReader(userData);
  shots = new Screenshots(userData);

  tracker.recoverAfterRestart();
  createTray();
  createWindow();

  if (tracker.state.account) {
    const user = await api.currentUser();
    if (!user) {
      tracker.setAccount(null);
    } else {
      await refreshDevice().catch(handleApiError);
      void refreshTasks(true);
    }
  }
  push();

  setInterval(() => void tick(), TICK_SECONDS * 1000);
  setInterval(() => void heartbeat(), HEARTBEAT_SECONDS * 1000);
  setInterval(() => void sync(), SYNC_SECONDS * 1000);
  setInterval(() => void refreshTasks(true), TASK_REFRESH_SECONDS * 1000);
  void heartbeat();
  void sync();

  powerMonitor.on("resume", () => void tick());
  powerMonitor.on("unlock-screen", () => void tick());

  updater = startAutoUpdates({
    // Never restart the app in the middle of someone's work.
    canInstallNow: () => !tracker.clockedIn,
    beforeInstall: async () => {
      quitting = true;
      await Promise.race([sync(), new Promise((r) => setTimeout(r, 5000))]);
      reader.stop();
    },
  });
}

// ---------------------------------------------------------------------
// Window and tray
// ---------------------------------------------------------------------
function createWindow() {
  win = new BrowserWindow({
    width: 380,
    height: 660,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: !startHidden,
    title: APP_NAME,
    icon: path.join(assets, "icon.png"),
    autoHideMenuBar: true,
    backgroundColor: "#f8fafc",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  win.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      win?.hide();
    }
  });
  win.webContents.on("did-finish-load", push);
  // Pick up tasks a manager just assigned when the worker opens the window.
  win.on("focus", () => void refreshTasks());
  // Links open in the normal browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) void shell.openExternal(url);
    return { action: "deny" };
  });
}

function showWindow() {
  if (!win) return;
  win.show();
  win.focus();
}

function createTray() {
  tray = new Tray(trayIcon(false));
  tray.on("click", showWindow);
  updateTray();
}

function trayIcon(on: boolean) {
  return nativeImage.createFromPath(path.join(assets, on ? "tray-on.png" : "tray-off.png"));
}

function updateTray() {
  if (!tray) return;
  const working = tracker.clockedIn;
  tray.setImage(trayIcon(working));
  const status = !tracker.state.account
    ? "Not logged in"
    : working
      ? `Working · ${formatDuration(tracker.state.today.tracked)} today`
      : "Not clocked in";
  tray.setToolTip(`${APP_NAME} — ${status}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: status, enabled: false },
      { type: "separator" },
      ...(tracker.state.account && (!tracker.needsConsent || working)
        ? [
            working
              ? { label: "Clock out…", click: () => requestClockOut() }
              : { label: "Clock in", click: () => clockIn() },
          ]
        : []),
      { label: `Open ${APP_NAME}`, click: showWindow },
      { label: unreadChat ? `Open chat (${unreadChat} unread)` : "Open chat", click: () => void shell.openExternal(`${DASHBOARD_URL}/dashboard/chat`) },
      { label: "Open dashboard", click: () => void shell.openExternal(`${DASHBOARD_URL}/dashboard`) },
      { type: "separator" },
      { label: "Quit", click: () => void quit() },
    ]),
  );
}

// ---------------------------------------------------------------------
// What the window shows
// ---------------------------------------------------------------------
function view() {
  const s = tracker.state;
  const session = tracker.session;
  const pending = tracker.pendingIdle()[0];
  return {
    screen: !s.account ? "login" : tracker.needsConsent ? "consent" : "main",
    appName: APP_NAME,
    account: s.account && {
      name: s.account.fullName || s.account.email,
      email: s.account.email,
      orgName: s.account.orgName,
    },
    settings: s.settings,
    clockedIn: tracker.clockedIn,
    sessionStartedAt: session?.started_at ?? null,
    clockOffsetMs: s.clockOffsetMs,
    todayTracked: Math.round(s.today.tracked),
    todayActive: Math.round(s.today.active),
    currentApp: tracker.currentApp,
    idleNow: s.activeIdleId !== null,
    idlePrompt: pending
      ? {
          id: pending.id,
          startedAt: pending.started_at,
          endedAt: pending.ended_at,
          minutes: Math.max(1, Math.round((Date.parse(pending.ended_at!) - Date.parse(pending.started_at)) / 60000)),
        }
      : null,
    sync: { online, pending: tracker.pendingCount(), lastSyncAt: s.lastSyncAt, error: lastError },
    notice: s.notice,
    loginMessage,
    tasks: s.taskCache ?? [],
    currentTaskId: tracker.currentTask?.id ?? null,
    askClockOut: askClockOut && tracker.clockedIn,
    canTrack: billing ? billing.can_track : true,
    unreadChat,
    planMessage: billing && !billing.can_track ? billing.message : null,
    screenshots: {
      on: !!s.screenshotsOn,
      allowed: tracker.screenshotsAllowed,
      onlyThisChanged: tracker.needsScreenshotConsent && !tracker.needsBaseConsent,
      interval: s.settings.screenshot_interval_minutes ?? 10,
      blur: !!s.settings.blur_screenshots,
      pending: shots.pendingCount(),
    },
  };
}

function push() {
  updateTray();
  if (win && !win.isDestroyed()) win.webContents.send("view", view());
}

// ---------------------------------------------------------------------
// Tracking loop
// ---------------------------------------------------------------------
async function tick() {
  if (!tracker.state.account || tracker.needsBaseConsent || !tracker.clockedIn) {
    shots?.reset();
    return;
  }

  const idleSeconds = powerMonitor.getSystemIdleTime();
  const window = tracker.appTrackingAllowed ? await reader.get().catch(() => null) : null;
  const result = tracker.tick(idleSeconds, window);
  lastState = result === "idle" ? "idle" : "active";

  if (result === "auto_clock_out") {
    notify("Clocked out", tracker.state.notice ?? "You were clocked out after a long time without activity.");
    void sync();
  }

  const pendingCount = tracker.pendingIdle().length;
  if (pendingCount > lastPendingIdleCount) {
    notify("Welcome back", "You were away from the computer. Was that time work?");
    showWindow();
  }
  lastPendingIdleCount = pendingCount;
  maybeScreenshot();
  push();
}

/** Pro plan screenshots: one per interval, only while clocked in, agreed to and not away. */
function maybeScreenshot() {
  const account = tracker.state.account;
  if (!account || !tracker.clockedIn || !tracker.screenshotsAllowed) {
    shots.reset();
    return;
  }
  const settings = tracker.state.settings;
  const now = tracker.now();
  if (!shots.due(now, settings.screenshot_interval_minutes ?? 10)) return;
  shots.done(now);
  if (tracker.state.activeIdleId !== null) return; // away from the computer: nothing to show
  void shots
    .capture({
      userId: account.userId,
      orgId: account.orgId,
      sessionId: tracker.state.currentSessionId,
      takenAt: new Date(now).toISOString(),
      app: tracker.appTrackingAllowed ? tracker.currentApp : null,
      blurred: !!settings.blur_screenshots,
    })
    .then((ok) => ok && shots.upload(api, account.userId, account.orgId))
    .catch(() => undefined);
}

/** Screenshots apply when the company has them on and is on Pro. Workers are told before any is taken. */
function applyScreenshots() {
  if (!billing) return; // plan unknown yet: keep what we knew
  const before = tracker.needsScreenshotConsent;
  tracker.setScreenshotsOn(!!tracker.state.settings.screenshots_enabled && billing.tier === "pro");
  if (tracker.needsScreenshotConsent && !before && !tracker.needsBaseConsent) {
    notify("Screenshots", "Your company switched on screenshots. Open the app to see what that means before any is taken.");
    showWindow();
  }
}

async function heartbeat() {
  const account = tracker.state.account;
  if (!account) return;
  try {
    const res = await api.heartbeat(
      account.deviceId,
      tracker.state.currentSessionId,
      tracker.clockedIn ? lastState : null,
      tracker.currentApp,
    );
    online = true;
    tracker.setServerTime(res.server_time);
    if (!res.active) {
      await blockAccess(
        res.device_revoked
          ? "This computer was disconnected by your company admin."
          : "Your account is no longer active in this company. Contact your admin.",
      );
      return;
    }
    tracker.setSettings(res.settings);
    applyBilling(res.billing);
    applyScreenshots();
    void checkNotifications();
    unreadChat = await api.unreadMessages().catch(() => unreadChat);
  } catch (e) {
    await handleApiError(e);
  }
  push();
}

/** Show new task notifications (assigned, comments, due tomorrow) as Windows pop-ups. */
let checkingNotifications = false;
const shownNotes: Notification[] = []; // keep references so click handlers survive garbage collection
async function checkNotifications() {
  if (!tracker.state.account || tracker.needsBaseConsent || checkingNotifications) return;
  checkingNotifications = true;
  try {
    // First run on this computer: start from now instead of replaying old notifications.
    const since = tracker.state.notifiedUntil ?? new Date(tracker.now()).toISOString();
    if (!tracker.state.notifiedUntil) {
      tracker.state.notifiedUntil = since;
      tracker.save();
      return;
    }
    const items = await api.newNotifications(since);
    if (!items.length) return;
    tracker.state.notifiedUntil = items[items.length - 1].created_at;
    tracker.save();
    for (const n of items.slice(-3)) {
      if (!Notification.isSupported()) break;
      const note = new Notification({ title: n.title, body: n.body ?? "", icon: path.join(assets, "icon.png") });
      const link = n.link && n.link.startsWith("/dashboard") ? n.link : "/dashboard/notifications";
      note.on("click", () => void shell.openExternal(`${DASHBOARD_URL}${link}`));
      note.show();
      shownNotes.push(note);
      if (shownNotes.length > 10) shownNotes.shift();
    }
    if (items.some((n) => n.kind === "task_assigned" || n.kind === "task_due")) void refreshTasks(true);
  } catch {
    // Not important enough to show an error; the next heartbeat tries again.
  } finally {
    checkingNotifications = false;
  }
}

async function sync() {
  const account = tracker.state.account;
  if (!account || syncing) return;
  syncing = true;
  let reRegistered = false;
  try {
    for (let i = 0; i < 10; i++) {
      const built = tracker.buildPayload(tracker.state.account!.deviceId);
      if (!built) break;
      try {
        const res = await api.ingest(built.payload);
        tracker.markSent(built.snapshot);
        tracker.setServerTime(res.server_time);
        online = true;
        lastError = null;
      } catch (e) {
        if (e instanceof ApiError && e.kind === "not_registered" && !reRegistered) {
          reRegistered = true;
          await refreshDevice();
          continue;
        }
        throw e;
      }
    }
    const acc = tracker.state.account;
    if (acc) await shots.upload(api, acc.userId, acc.orgId);
  } catch (e) {
    await handleApiError(e);
  } finally {
    syncing = false;
    push();
  }
}

async function handleApiError(e: unknown) {
  if (!(e instanceof ApiError)) {
    lastError = e instanceof Error ? e.message : String(e);
    return;
  }
  switch (e.kind) {
    case "offline":
      online = false; // data stays saved on this computer and uploads later
      break;
    case "revoked":
    case "inactive":
      await blockAccess(e.message);
      break;
    case "auth":
      await blockAccess("Your login expired. Please log in again.", true);
      break;
    default:
      lastError = e.message;
  }
}

/**
 * Stop tracking and return to the login screen with a message.
 * With keepData, unsent time stays on this computer and uploads after the
 * same person logs in again (used when only the login expired).
 */
async function blockAccess(message: string, keepData = false) {
  if (tracker.clockedIn) tracker.clockOut(keepData ? "clock_out" : "admin");
  await api.signOut();
  store.clear();
  if (keepData) tracker.setAccount(null);
  else {
    tracker.reset();
    shots.clear();
  }
  loginMessage = message;
  push();
}

// ---------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------
async function refreshDevice() {
  const user = await api.currentUser();
  if (!user) throw new ApiError("Please log in.", "auth");
  // Saved data from a different person can never be uploaded by this one.
  if (tracker.state.dataOwner && tracker.state.dataOwner !== user.id) {
    tracker.reset();
    shots.clear();
  }
  const osName = process.platform === "win32" ? "Windows" : process.platform === "darwin" ? "macOS" : process.platform;
  const info = await api.registerDevice(
    tracker.state.installId,
    os.hostname(),
    `${osName} ${os.release()}`,
    app.getVersion(),
  );
  tracker.setServerTime(info.server_time);
  tracker.setSettings(info.settings);
  applyBilling(info.billing);
  tracker.setAccount({
    userId: user.id,
    email: user.email ?? "",
    fullName: info.full_name,
    orgId: info.organization_id,
    orgName: info.organization_name,
    role: info.role,
    deviceId: info.device_id,
    timezone: info.timezone,
  });
  applyScreenshots();
}

async function login(email: string, password: string) {
  try {
    loginMessage = null;
    await api.signIn(email.trim().toLowerCase(), password);
    try {
      await refreshDevice();
    } catch (e) {
      await api.signOut();
      store.clear();
      if (e instanceof ApiError && e.kind === "inactive") {
        return {
          ok: false,
          error: "Your account isn't part of a company yet. Accept your invitation on the dashboard first.",
        };
      }
      throw e;
    }
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true, args: ["--hidden"] });
    push();
    void heartbeat();
    void refreshTasks(true);
    return { ok: true };
  } catch (e) {
    const message =
      e instanceof ApiError && e.kind === "offline"
        ? "No internet connection. Connect and try again."
        : e instanceof Error
          ? e.message
          : "Could not log in.";
    return { ok: false, error: message };
  }
}

async function logout() {
  if (tracker.clockedIn) {
    tracker.clockOut("clock_out");
    await sync();
  }
  if (tracker.hasUnsent()) {
    const { response } = await dialog.showMessageBox(win!, {
      type: "warning",
      buttons: ["Log out anyway", "Cancel"],
      defaultId: 1,
      message: "Some tracked time hasn't been uploaded yet.",
      detail: "Logging out now deletes it from this computer. Connect to the internet first to keep it.",
    });
    if (response === 1) return;
  }
  await api.signOut();
  store.clear();
  tracker.reset();
  shots.clear();
  push();
}

/** The company's plan may not cover this person: stop tracking and say why. */
function applyBilling(next: AgentBilling | undefined) {
  if (!next) return;
  billing = next;
  if (!next.can_track && tracker.clockedIn) {
    tracker.clockOut("clock_out");
    tracker.state.notice = next.message ?? "Your company's plan doesn't cover you, so you were clocked out.";
    tracker.save();
    notify("Clocked out", tracker.state.notice);
    void sync();
  }
}

function clockIn() {
  if (!tracker.state.account || tracker.needsConsent) return;
  if (billing && !billing.can_track) {
    tracker.state.notice = billing.message ?? "Your company's plan doesn't cover you yet. Ask your company admin.";
    tracker.save();
    push();
    return;
  }
  tracker.clockIn();
  lastPendingIdleCount = 0;
  push();
  void sync();
  void heartbeat();
  void refreshTasks(true);
}

/** Tray "Clock out…": open the window so the worker can say what they got done. */
function requestClockOut() {
  if (!tracker.clockedIn) return;
  askClockOut = true;
  showWindow();
  push();
}

async function clockOut(summary = "", markDone = false) {
  askClockOut = false;
  if (!tracker.clockedIn) {
    push();
    return;
  }
  const task = tracker.currentTask;
  tracker.addReport(summary); // before clockOut: the report belongs to this session
  tracker.clockOut("clock_out");
  push();
  if (markDone && task) await setTaskStatus(task.id, "done");
  await sync();
  updater?.installWhenPossible(); // a waiting update installs now, between work sessions
}

// ---------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------
/** Reload the worker's open tasks (kept on this computer so the picker works offline). */
async function refreshTasks(force = false) {
  if (!tracker.state.account || tracker.needsConsent) return;
  if (!force && Date.now() - lastTaskFetch < 30_000) return;
  lastTaskFetch = Date.now();
  try {
    tracker.setTaskCache(await api.myOpenTasks());
    online = true;
  } catch (e) {
    await handleApiError(e);
  }
  push();
}

async function setTaskStatus(taskId: string, status: "in_progress" | "done") {
  try {
    await api.setTaskStatus(taskId, status);
    const tasks = tracker.state.taskCache ?? [];
    tracker.setTaskCache(
      status === "done" ? tasks.filter((t) => t.id !== taskId) : tasks.map((t) => (t.id === taskId ? { ...t, status } : t)),
    );
  } catch (e) {
    if (status === "done") {
      tracker.state.notice =
        e instanceof ApiError && e.kind === "offline"
          ? "You're offline, so the task wasn't marked as done. Mark it on the dashboard later."
          : `The task wasn't marked as done: ${e instanceof Error ? e.message : String(e)}`;
      tracker.save();
    }
    if (e instanceof ApiError && e.kind !== "offline" && e.kind !== "other") await handleApiError(e);
  }
  push();
}

async function chooseTask(taskId: string | null) {
  tracker.setCurrentTask(taskId);
  push();
  const task = tracker.currentTask;
  // Starting work on a "to do" task moves it to "in progress" for the manager.
  if (task && task.status === "todo") await setTaskStatus(task.id, "in_progress");
}

async function quit() {
  if (tracker.clockedIn) {
    showWindow();
    const { response } = await dialog.showMessageBox(win!, {
      type: "question",
      buttons: ["Clock out and quit", "Cancel"],
      defaultId: 0,
      cancelId: 1,
      message: "You are clocked in.",
      detail: `Quitting ${APP_NAME} clocks you out.`,
    });
    if (response === 1) return;
    tracker.clockOut("clock_out");
  }
  quitting = true;
  // Give the last upload a few seconds; anything left uploads next time.
  await Promise.race([sync(), new Promise((r) => setTimeout(r, 5000))]);
  reader.stop();
  app.exit(0);
}

app.on("before-quit", (e) => {
  if (!quitting) {
    e.preventDefault();
    void quit();
  }
});

app.on("window-all-closed", () => {
  // Keep running in the tray.
});

function notify(title: string, body: string) {
  if (Notification.isSupported()) new Notification({ title, body, icon: path.join(assets, "icon.png") }).show();
}

// ---------------------------------------------------------------------
// Messages from the window
// ---------------------------------------------------------------------
ipcMain.handle("get-view", () => view());
ipcMain.handle("login", (_e, email: string, password: string) => login(String(email), String(password)));
ipcMain.handle("logout", () => logout());
ipcMain.handle("consent", () => {
  tracker.giveConsent();
  push();
});
ipcMain.handle("decline-consent", () => logout());
ipcMain.handle("clock-in", () => clockIn());
ipcMain.handle("clock-out", (_e, summary: unknown, markDone: unknown) =>
  clockOut(typeof summary === "string" ? summary : "", markDone === true),
);
ipcMain.handle("ask-clock-out", () => requestClockOut());
ipcMain.handle("cancel-clock-out", () => {
  askClockOut = false;
  push();
});
ipcMain.handle("set-task", (_e, taskId: unknown) => chooseTask(typeof taskId === "string" && taskId ? taskId : null));
ipcMain.handle("refresh-tasks", () => refreshTasks(true));
ipcMain.handle("answer-idle", (_e, id: string, keep: boolean, reason: string | null) => {
  tracker.decideIdle(String(id), Boolean(keep), reason ? String(reason) : null);
  lastPendingIdleCount = tracker.pendingIdle().length;
  push();
  void sync();
});
ipcMain.handle("dismiss-notice", () => {
  tracker.state.notice = null;
  tracker.save();
  push();
});
ipcMain.handle("open-dashboard", (_e, page: string) => {
  const safe = [
    "/dashboard",
    "/dashboard/activity",
    "/dashboard/timesheets",
    "/dashboard/tasks",
    "/dashboard/notifications",
    "/dashboard/chat",
    "/dashboard/screenshots",
    "/forgot-password",
    "/signup",
    "/what-we-track",
    "/privacy",
  ].includes(page) ? page : "/dashboard";
  void shell.openExternal(`${DASHBOARD_URL}${safe}`);
});
ipcMain.handle("retry-sync", () => sync());
