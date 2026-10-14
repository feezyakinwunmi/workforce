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
  clockOut: (summary: string, markDone: boolean) => ipcRenderer.invoke("clock-out", summary, markDone),
  askClockOut: () => ipcRenderer.invoke("ask-clock-out"),
  cancelClockOut: () => ipcRenderer.invoke("cancel-clock-out"),
  setTask: (taskId: string | null) => ipcRenderer.invoke("set-task", taskId),
  refreshTasks: () => ipcRenderer.invoke("refresh-tasks"),
  answerIdle: (id: string, keep: boolean, reason: string | null) => ipcRenderer.invoke("answer-idle", id, keep, reason),
  dismissNotice: () => ipcRenderer.invoke("dismiss-notice"),
  openDashboard: (page: string) => ipcRenderer.invoke("open-dashboard", page),
  retrySync: () => ipcRenderer.invoke("retry-sync"),
});
