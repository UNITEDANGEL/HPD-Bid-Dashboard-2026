// HPD Field offline helper. Pages always come from the network when there is a signal (so the
// newest version shows right away); the last copy is used only when the phone is offline.
// Built app files (/_next/static, named by content) are kept on the phone for a fast start.
// Bump this whenever an update must reach phones that are still running an old copy of the app:
// the new helper replaces the old one and reloads every open copy of the app once.
const CACHE = "hpd-field-v2";
const SHELL = ["/map/", "/paperwork/"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => {})))));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        const replaced = keys.some((key) => key.startsWith("hpd-field-") && key !== CACHE);
        return Promise.all(keys.filter((key) => key.startsWith("hpd-field-") && key !== CACHE).map((key) => caches.delete(key)))
          .then(() => self.clients.claim())
          .then(() => {
            // An older helper was here: the open app is old code. Reload it into the new version
            // (job steps and photos are already saved on the phone). Not awaited: the reload's
            // page request needs this helper to finish starting first, or both would wait forever.
            if (replaced) self.clients.matchAll({ type: "window" }).then((windows) => windows.forEach((client) => client.navigate(client.url).catch(() => {})));
          });
      })
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(url.pathname, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(url.pathname).then((hit) => hit || caches.match("/map/")))
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      }))
    );
  }
});

// Phone alerts (20 Oct): an alert from the 10-minute fetcher (scripts/send-push.mjs) -- HPD replied, a new invitation to
// bid, a notice running out of time -- shows even when the app is closed; tapping it opens the app there.
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: event.data ? event.data.text() : "HPD Field" }; }
  const title = data.title || "HPD Field";
  // The Home Screen icon counts alerts like Gmail (the app sets the exact number when it opens).
  const bump = caches.open("hpd-badge").then((c) => c.match("/badge").then((r) => (r ? r.text() : "0")).then((t) => {
    const n = (Number(t) || 0) + 1;
    return c.put("/badge", new Response(String(n))).then(() => (self.navigator.setAppBadge ? self.navigator.setAppBadge(n) : undefined));
  })).catch(() => {});
  event.waitUntil(bump);
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "",
    tag: data.tag || undefined,
    renotify: !!data.tag,
    requireInteraction: data.kind === "notice" || data.kind === "urgent" || data.kind === "rejection",
    vibrate: data.kind === "award" ? [40, 30, 40, 30, 200] : data.kind === "notice" ? [200, 80, 200, 80, 200] : data.kind === "rejection" ? [150, 60, 150, 60, 300] : data.kind === "bid" ? [40, 40, 40] : [60, 40, 60],
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: data.url || "/map/?view=all&map=1" },
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/map/", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    for (const w of windows) { if (w.url.startsWith(self.location.origin)) { w.navigate(url).catch(() => {}); return w.focus(); } }
    return self.clients.openWindow(url);
  }));
});
