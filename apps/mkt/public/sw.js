/* Carbo — Service Worker (PWA instalável + Web Push do Carbo Chat).
 * Cache seguro:
 *  - Navegação (HTML): network-first → nunca serve shell antigo.
 *  - /assets/* (hasheados pelo Vite): cache-first.
 *  - Outros GET same-origin: stale-while-revalidate.
 * Só GET same-origin; Supabase/APIs (cross-origin) passam direto.
 * Push: mostra a notificação; clique foca/abre o app na conversa.
 */
const CACHE = "carbo-app-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/index.html"]).catch(() => {})));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isNav = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");
  if (isNav) {
    event.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("/index.html", copy)).catch(() => {}); return res; })
        .catch(() => caches.match(req).then((r) => r || caches.match("/index.html")))
    );
    return;
  }
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(caches.match(req).then((hit) => hit ||
      fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); return res; })));
    return;
  }
  event.respondWith(caches.match(req).then((hit) => {
    const net = fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); return res; }).catch(() => hit);
    return hit || net;
  }));
});

// ── Web Push (Carbo Chat) ─────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_e) { data = {}; }
  const title = data.title || "Carbo Chat";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "Nova mensagem",
    tag: data.tag,          // colapsa repetições da mesma conversa
    renotify: true,
    icon: "/favicon.png",
    badge: "/favicon.png",
    data: data.data || {},
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.path) || "/chat";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if ("focus" in c) { try { await c.navigate(path); } catch (_e) {} return c.focus(); }
    }
    if (self.clients.openWindow) return self.clients.openWindow(path);
  })());
});
