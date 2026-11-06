// Offline support.
// - Pages (index.html): network first, so a new deploy is used as soon as there is a
//   connection; the cached copy is the fallback offline. This avoids an old page
//   asking for script files that a newer deploy has removed (blank screen).
// - Everything else (hashed assets, icons): cache first, filled on first use.
// The preview (/prova/) has its own worker and cache on the same site: each
// worker keeps to its own cache and leaves the other's pages alone.
const PREVIEW = self.registration.scope.endsWith("/prova/");
const CACHE = PREVIEW ? "diario-fitness-v3-prova" : "diario-fitness-v3";
const mine = (k) => k.startsWith("diario-fitness-") && k.endsWith("-prova") === PREVIEW;
const previewPath = new URL("./prova/", self.registration.scope).pathname;
const SHELL = ["./", "./index.html", "./compositore.html", "./manifest.webmanifest", "./icon.svg", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && mine(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  if (new URL(req.url).pathname.startsWith(previewPath)) return;
  if (req.mode === "navigate") {
    // Each page is cached under its own address (diary or plan editor).
    const page = new URL(req.url).pathname.endsWith("/compositore.html") ? "./compositore.html" : "./index.html";
    event.respondWith(
      fetch(req)
        .then((res) => { if (res.ok) caches.open(CACHE).then((c) => c.put(page, res.clone())); return res; })
        .catch(() => caches.match(page, { ignoreSearch: true }))
    );
    return;
  }
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
  );
});

// Reminders from the push server (see server/): show them, and open the app when tapped.
self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { body: event.data?.text() || "" }; }
  event.waitUntil(self.registration.showNotification(d.title || "Diario Fitness", {
    body: d.body || "",
    tag: d.tag || undefined,
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    data: { url: d.url || "./" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "./", self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.startsWith(self.registration.scope));
      return open ? open.focus() : self.clients.openWindow(url);
    })
  );
});
