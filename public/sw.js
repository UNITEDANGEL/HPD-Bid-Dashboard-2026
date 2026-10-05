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
