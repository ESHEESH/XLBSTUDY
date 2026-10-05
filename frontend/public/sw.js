// App-shell cache. Network-first so deploys show up immediately; cache is only the offline fallback.
// Data never goes through here: it lives in IndexedDB (Dexie) and Supabase calls are cross-origin.
const CACHE = "xlb-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  ),
);

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/auth")) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        // don't cache login redirects as if they were the page
        if (res.ok && !res.redirected) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => (await caches.match(req, { ignoreVary: true })) ?? Response.error()),
  );
});
