const CACHE = "medical-search-tools-v17";
const SCOPE = new URL("./", self.location.href);
const CORE = ["./", "./index.html", "./styles.css", "./app.js?v=20261106", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(async cache => {
    // A missing optional file must not prevent the update from activating.
    await Promise.allSettled(CORE.map(async path => {
      const request = new Request(new URL(path, SCOPE), {cache:"reload"});
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response);
    }));
    await self.skipWaiting();
  }));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(names => Promise.all(
    names.filter(name => name.startsWith("medical-search-tools-") && name !== CACHE).map(name => caches.delete(name))
  )).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;
  // Explicit refreshes must fail visibly when offline, rather than serve an old page.
  if (url.searchParams.has("_refresh")) {
    event.respondWith((async () => {
      const response = await fetch(request, {cache:"no-store", signal:AbortSignal.timeout(15000)});
      if (response.ok) {
        const canonical = new URL(url);
        canonical.searchParams.delete("_refresh");
        try { await (await caches.open(CACHE)).put(canonical.href, response.clone()); } catch {}
      }
      return response;
    })());
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request, {cache:"no-store", signal:AbortSignal.timeout(12000)});
      if (response.ok && !url.pathname.startsWith(new URL("dienstplan/", SCOPE).pathname)) {
        try { await cache.put(request, response.clone()); } catch {}
      }
      return response;
    } catch {
      return await cache.match(request) || new Response(
        request.mode === "navigate" ? "Bitte Internetverbindung prüfen und erneut laden." : "",
        {status:503, headers:{"Content-Type":"text/plain; charset=utf-8"}}
      );
    }
  })());
});
