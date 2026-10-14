import { app } from "electron";
import { autoUpdater } from "electron-updater";

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000; // every 4 hours
const RETRY_INSTALL_EVERY_MS = 5 * 60 * 1000;

/**
 * Keeps the installed app up to date from GitHub Releases.
 * A new version downloads in the background and installs only when it can't
 * interrupt work: the worker is clocked out. The app restarts by itself.
 */
export function startAutoUpdates(opts: {
  canInstallNow: () => boolean;
  beforeInstall: () => Promise<void>;
}) {
  if (!app.isPackaged) return; // running from source: nothing to update

  let downloaded = false;
  let installing = false;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-downloaded", () => {
    downloaded = true;
    void tryInstall();
  });
  autoUpdater.on("error", () => {
    // No internet or no release yet: try again at the next check.
  });

  const check = () => autoUpdater.checkForUpdates().catch(() => undefined);
  setTimeout(check, 30_000);
  setInterval(check, CHECK_EVERY_MS);
  setInterval(() => void tryInstall(), RETRY_INSTALL_EVERY_MS);

  async function tryInstall() {
    if (!downloaded || installing || !opts.canInstallNow()) return;
    installing = true;
    await opts.beforeInstall();
    // Silent install, then start the new version.
    autoUpdater.quitAndInstall(true, true);
  }

  return { installWhenPossible: () => void tryInstall() };
}
