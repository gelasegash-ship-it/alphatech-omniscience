const CACHE = "hopital-v1";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "../apps-plus.js", "../icon-192.png", "../icon-512.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()).catch(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) return;
  if (r.mode === "navigate" || u.pathname.endsWith(".html") || u.pathname.endsWith("/")) {
    e.respondWith(fetch(r).then(resp => { const cp = resp.clone(); caches.open(CACHE).then(c => c.put(r, cp)); return resp; })
      .catch(() => caches.match(r).then(m => m || caches.match("./index.html"))));
    return;
  }
  e.respondWith(caches.match(r).then(m => m || fetch(r).then(resp => { const cp = resp.clone(); caches.open(CACHE).then(c => c.put(r, cp)); return resp; })));
});
