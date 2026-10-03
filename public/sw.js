/* Trade In Orbit service worker: displays Web Push notifications.
 * Kept deliberately small: no offline caching of pages, because account data
 * must never be served stale from a cache. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Trade In Orbit", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Trade In Orbit";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: data.id || undefined,
      // Only same-origin relative links are opened.
      data: { link: typeof data.link === "string" && data.link.startsWith("/") ? data.link : "/notifications" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data && event.notification.data.link ? event.notification.data.link : "/notifications";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (new URL(w.url).origin === self.location.origin && "focus" in w) {
          w.navigate(link);
          return w.focus();
        }
      }
      return self.clients.openWindow(link);
    }),
  );
});
