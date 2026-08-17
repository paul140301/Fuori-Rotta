const SHELL_CACHE = "fr-shell-v5";
const RUNTIME_CACHE = "fr-runtime-v5";

const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/supabase-config.js",
  "./js/auth.js",
  "./js/db.js",
  "./js/geo.js",
  "./js/categories.js",
  "./js/itinerary.js",
  "./js/importer.js",
  "./js/map.js",
  "./js/radar.js",
  "./js/app.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png"
];

// iOS in modalità standalone (aggiunta a Home) rifiuta con
// "Response served by service worker has redirections" qualunque risposta
// che porti il flag response.redirected = true — anche se arriva dalla
// cache e anche se in una scheda Safari normale non dà problemi. Capita
// tipicamente con "./" che alcuni host risolvono con un redirect verso
// "./index.html" prima di rispondere 200.
//
// Fix: non mettiamo mai in cache (né restituiamo) una Response con quel
// flag attivo — la ricostruiamo da zero, stesso body/status/header, senza
// lo storico del redirect.
async function stripRedirect(response) {
  if (!response || !response.redirected) return response;
  const body = await response.blob();
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

async function cacheCleanPut(cache, request, response) {
  const clean = await stripRedirect(response);
  await cache.put(request, clean.clone());
  return clean;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(async (cache) => {
      await Promise.all(
        SHELL_FILES.map(async (path) => {
          try {
            const res = await fetch(path, { redirect: "follow" });
            if (res.ok) await cacheCleanPut(cache, path, res);
          } catch (e) {
            // Un file non raggiungibile in fase di install non deve bloccare
            // tutta l'installazione del service worker.
            console.warn("Precache fallito per", path, e);
          }
        })
      );
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Runtime caching: map tiles e webfonts con strategia cache-first, così le
// zone già viste restano disponibili offline. Tutto il same-origin cade
// sulla cache dell'app shell.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  const isTile = /tile\.openstreetmap\.org|basemaps\.cartocdn\.com/.test(url.hostname);
  const isFont = /fonts\.googleapis\.com|fonts\.gstatic\.com/.test(url.hostname);
  const isLib = /unpkg\.com|cdnjs\.cloudflare\.com/.test(url.hostname);

  if (isTile || isFont || isLib) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const fetchPromise = fetch(req, { redirect: "follow" })
          .then((res) => (res && res.status === 200 ? cacheCleanPut(cache, req, res) : stripRedirect(res)))
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  if (url.origin === self.location.origin) {
    // Network-first per i file dell'app: mentre sei online prendi sempre
    // l'ultima versione deployata (e la rimetti in cache aggiornata); solo
    // se la rete non risponde (offline) usi l'ultima copia buona in cache.
    // Prima era cache-first, il che voleva dire "una volta scaricato un
    // file non si aggiorna più finché non cambia il service worker stesso"
    // — ogni nuovo deploy sembrava non avere effetto.
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req, { redirect: "follow", cache: "no-store" });
          if (res && res.ok) {
            const cache = await caches.open(SHELL_CACHE);
            return await cacheCleanPut(cache, req, res);
          }
          return await stripRedirect(res);
        } catch (e) {
          const cached = await caches.match(req);
          return cached || (await caches.match("./index.html")) || Response.error();
        }
      })()
    );
  }
});
