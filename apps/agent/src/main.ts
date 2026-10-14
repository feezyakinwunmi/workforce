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
import { Api, ApiError } from "./api";
import { APP_NAME, DASHBOARD_URL, HEARTBEAT_SECONDS, SYNC_SECONDS, TICK_SECONDS } from "./config";
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

let quitting = false;
let online = true;
let syncing = false;
let lastError: string | null = null;
let loginMessage: string | null = null;
let lastPendingIdleCount = 0;
let lastState: "active" | "idle" = "active";
let updater: ReturnType<typeof startAutoUpdates>;

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
  if (process.platform === "win32") app.setAppUserModelId(`com.workforce.${APP_NAME.toLowerCase()}`);
  const userData = app.getPath("userData");
  store = new SecureStore(path.join(userData, "auth.bin"));
  tracker = new Tracker(path.join(userData, "state.json"));
  api = new Api(store);
  reader = new ActiveWindowReader(userData);

  tracker.recoverAfterRestart();
  createTray();
  createWindow();

  if (tracker.state.account) {
    const user = await api.currentUser();
    if (!user) {
      tracker.setAccount(null);
    } else {
      await refreshDevice().catch(handleApiError);
    }
  }
  push();

  setInterval(() => void tick(), TICK_SECONDS * 1000);
  setInterval(() => void heartbeat(), HEARTBEAT_SECONDS * 1000);
  setInterval(() => void sync(), SYNC_SECONDS * 1000);
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
    height: 600,
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
      ...(tracker.state.account && !tracker.needsConsent
        ? [
            working
              ? { label: "Clock out", click: () => void clockOut() }
              : { label: "Clock in", click: () => clockIn() },
          ]
        : []),
      { label: `Open ${APP_NAME}`, click: showWindow },
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
  if (!tracker.state.account || tracker.needsConsent || !tracker.clockedIn) return;

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
  push();
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
  } catch (e) {
    await handleApiError(e);
  }
  push();
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
  else tracker.reset();
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
  if (tracker.state.dataOwner && tracker.state.dataOwner !== user.id) tracker.reset();
  const osName = process.platform === "win32" ? "Windows" : process.platform === "darwin" ? "macOS" : process.platform;
  const info = await api.registerDevice(
    tracker.state.installId,
    os.hostname(),
    `${osName} ${os.release()}`,
    app.getVersion(),
  );
  tracker.setServerTime(info.server_time);
  tracker.setSettings(info.settings);
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
  push();
}

function clockIn() {
  if (!tracker.state.account || tracker.needsConsent) return;
  tracker.clockIn();
  lastPendingIdleCount = 0;
  push();
  void sync();
  void heartbeat();
}

async function clockOut() {
  tracker.clockOut("clock_out");
  push();
  await sync();
  updater?.installWhenPossible(); // a waiting update installs now, between work sessions
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
ipcMain.handle("clock-out", () => clockOut());
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
  const safe = ["/dashboard", "/dashboard/activity", "/dashboard/timesheets", "/forgot-password", "/signup"].includes(page) ? page : "/dashboard";
  void shell.openExternal(`${DASHBOARD_URL}${safe}`);
});
ipcMain.handle("retry-sync", () => sync());
