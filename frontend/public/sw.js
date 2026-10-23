/* ask Elon – service worker (PWA).
 * Safe by design:
 *  - only same-origin GET requests are handled; everything else goes straight to the network;
 *  - /api/* is NEVER cached (login, chat, PDFs, TTS audio, payments stay live and private);
 *  - requests with a Range header (audio/video) are not cached;
 *  - page navigations: network first, offline fallback = cached start page "/" (then offline.html);
 *  - hashed static files (/_expo/static/, /assets/, icons, fonts, images): cache first.
 * Bump VERSION to drop old caches.
 */
const VERSION = "v1";
const PRECACHE = "askelon-precache-" + VERSION;
const RUNTIME = "askelon-runtime-" + VERSION;
const RUNTIME_MAX_ENTRIES = 80;
const START_URL = "/";
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/apple-touch-icon.png",
  "/favicon-32.png",
];

function isApi(url) {
  return url.pathname === "/api" || url.pathname.startsWith("/api/");
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_expo/static/") ||
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(?:png|jpe?g|webp|gif|svg|ico|ttf|otf|woff2?)$/i.test(url.pathname)
  );
}

// Cache the start page plus the JS/CSS bundles it references, so "/" also opens offline right after install.
async function precacheStartPage(cache) {
  const res = await fetch(START_URL, { cache: "no-cache", credentials: "same-origin" });
  if (!res.ok) return;
  const html = await res.clone().text();
  await cache.put(START_URL, res);
  const assets = new Set();
  const re = /(?:src|href)="(\/_expo\/static\/[^"]+)"/g;
  let m;
  while ((m = re.exec(html))) assets.add(m[1]);
  await Promise.all(
    [...assets].map(async (u) => {
      try {
        const r = await fetch(u, { credentials: "same-origin" });
        if (r.ok) await cache.put(u, r);
      } catch (_) {}
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE);
      await cache.addAll(PRECACHE_URLS);
      try {
        await precacheStartPage(cache);
      } catch (_) {}
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PRECACHE, RUNTIME]);
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith("askelon-") && !keep.has(n)).map((n) => caches.delete(n)));
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
        } catch (_) {}
      }
      await self.clients.claim();
    })()
  );
});

async function trimRuntime() {
  const cache = await caches.open(RUNTIME);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - RUNTIME_MAX_ENTRIES; i++) await cache.delete(keys[i]);
}

async function handleNavigation(event, url) {
  try {
    const preload = await event.preloadResponse;
    const res = preload || (await fetch(event.request));
    if (res && res.ok && url.pathname === START_URL) {
      const copy = res.clone();
      caches.open(PRECACHE).then((c) => c.put(START_URL, copy));
    }
    return res;
  } catch (_) {
    const cache = await caches.open(PRECACHE);
    return (await cache.match(START_URL)) || (await cache.match(OFFLINE_URL)) || Response.error();
  }
}

async function handleStatic(event) {
  const cached = await caches.match(event.request);
  if (cached) return cached;
  const res = await fetch(event.request);
  if (res && res.ok && res.type === "basic") {
    const copy = res.clone();
    event.waitUntil(
      caches
        .open(RUNTIME)
        .then((c) => c.put(event.request, copy))
        .then(trimRuntime)
    );
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (isApi(url)) return;
  if (req.headers.has("range")) return;
  if (url.pathname === "/sw.js") return;

  if (req.mode === "navigate") {
    event.respondWith(handleNavigation(event, url));
    return;
  }
  if (isStaticAsset(url)) {
    event.respondWith(handleStatic(event));
  }
  // anything else (e.g. metadata.json, manifest): normal network
});
