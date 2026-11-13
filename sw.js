/* ChronoRail offline cache. Shell: cache-first. Data: network-first, falls back to cache. */
const V = "cr-v5";
const SHELL = ["./", "index.html", "config.js", "assets/tokens.css", "assets/app.css", "assets/app.js", "assets/skin.js", "assets/icon.svg", "404.html"];
const DATA = ["data/listings.json", "data/categories.json", "data/stacks.json"];
self.addEventListener("install", e => e.waitUntil(caches.open(V).then(c => c.addAll(SHELL.concat(DATA))).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  if (/\.json$/.test(u.pathname)) {
    e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
  } else {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
  }
});
