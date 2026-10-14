import { contextBridge, ipcRenderer } from "electron";

// The only things the window can ask the app to do.
contextBridge.exposeInMainWorld("agent", {
  getView: () => ipcRenderer.invoke("get-view"),
  onView: (callback: (view: unknown) => void) => {
    ipcRenderer.on("view", (_event, view) => callback(view));
  },
  login: (email: string, password: string) => ipcRenderer.invoke("login", email, password),
  logout: () => ipcRenderer.invoke("logout"),
  consent: () => ipcRenderer.invoke("consent"),
  declineConsent: () => ipcRenderer.invoke("decline-consent"),
  clockIn: () => ipcRenderer.invoke("clock-in"),
  clockOut: () => ipcRenderer.invoke("clock-out"),
  answerIdle: (id: string, keep: boolean, reason: string | null) => ipcRenderer.invoke("answer-idle", id, keep, reason),
  dismissNotice: () => ipcRenderer.invoke("dismiss-notice"),
  openDashboard: (page: string) => ipcRenderer.invoke("open-dashboard", page),
  retrySync: () => ipcRenderer.invoke("retry-sync"),
});
