/* ALPHATECH — service worker : l'application reste utilisable sans réseau.
   Stratégie : coquille en cache d'abord (rapide, marche hors ligne), réseau d'abord
   pour les données fraîches (prix, compteurs), jamais de mise en cache des API. */
const VERSION = "alphatech-v1-2026-11-13";
const SHELL = [
  "/alphatech-omniscience/",
  "/alphatech-omniscience/index.html",
  "/alphatech-omniscience/manifest.json",
  "/alphatech-omniscience/icon-192.png",
  "/alphatech-omniscience/icon-512.png",
  "/alphatech-omniscience/ecc/",
  "/alphatech-omniscience/edge/",
  "/alphatech-omniscience/capture/",
  "/alphatech-omniscience/usage/",
  "/alphatech-omniscience/partager/"
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(VERSION).then((c) =>
      Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => null)))
    )
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // jamais de cache pour les API de données
  if (/binance|coingecko|abacus|graph\.facebook|googleapis/.test(url.hostname)) return;

  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(e.request).then((hit) => {
        const reseau = fetch(e.request)
          .then((r) => {
            if (r && r.status === 200) {
              const clone = r.clone();
              caches.open(VERSION).then((c) => c.put(e.request, clone));
            }
            return r;
          })
          .catch(() => hit || caches.match("/alphatech-omniscience/"));
        return hit || reseau;
      })
    );
  }
});
