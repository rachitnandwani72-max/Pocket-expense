const CACHE_NAME = "pocket-offline-v20";
const APP_SHELL = [
  "/manifest.webmanifest",
  "/favicon-32.png",
  "/app-icon-192.png",
  "/app-icon-512.png",
  "/apple-touch-icon.png",
];

async function precacheApp() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(APP_SHELL);

  const response = await fetch("/", { cache: "reload" });
  if (!response.ok) throw new Error("Unable to cache the app");
  const html = await response.clone().text();
  await cache.put("/", response);

  const assetUrls = Array.from(html.matchAll(/(?:src|href)=["']([^"']+)["']/g))
    .map((match) => new URL(match[1], self.location.origin))
    .filter((url) => url.origin === self.location.origin && /\.(?:css|js|woff2?|png)$/i.test(url.pathname))
    .map((url) => url.href);
  await Promise.allSettled(assetUrls.map((url) => cache.add(url)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheApp().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("pocket-offline-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    const refresh = fetch(request).then((response) => {
      if (response.ok && (response.headers.get("content-type") || "").includes("text/html")) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put("/", copy)));
      }
      return response;
    });

    event.respondWith(
      caches.match("/").then((cached) => {
        if (cached) {
          event.waitUntil(refresh.catch(() => undefined));
          return cached;
        }
        return refresh.catch(() => caches.match("/"));
      }),
    );
    return;
  }

  if (["style", "script", "font", "image", "manifest"].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
        }
        return response;
      })),
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => new URL(client.url).origin === self.location.origin);
      return existing ? existing.focus() : self.clients.openWindow("/");
    }),
  );
});
