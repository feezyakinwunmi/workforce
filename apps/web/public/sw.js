/* Workbase service worker: shows push notifications (clock reminders, messages, tasks).
   It does not cache pages, so the dashboard is always fresh. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Workbase", body: event.data ? event.data.text() : "" };
  }
  const reminder = data.kind === "clock_reminder";
  const title = data.title || "Workbase";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: reminder ? "clock-reminder" : data.id || undefined,
      renotify: true,
      // Reminders stay on screen until tapped, and vibrate like a ring.
      requireInteraction: reminder,
      vibrate: reminder ? [400, 200, 400, 200, 400, 600, 400, 200, 400] : [200, 100, 200],
      silent: false,
      data: { link: data.link || "/dashboard/notifications" },
      actions: reminder ? [{ action: "open", title: data.link && data.link.includes("reminder=out") ? "Clock out" : "Clock in" }] : [],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/dashboard";
  const url = new URL(link, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.startsWith(self.location.origin) && "focus" in w) {
          w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
