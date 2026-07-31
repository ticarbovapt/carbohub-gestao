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

// ⚠️ REGRA DE OURO deste handler: respondWith NUNCA pode resolver `undefined`
// nem rejeitar.
//
//   • resolver undefined  → "TypeError: Failed to convert value to 'Response'"
//   • rejeitar            → "FetchEvent ... resulted in a network error response"
//
// Os dois derrubam a requisição de verdade, não só sujam o console. E o caso
// mais caro é o /assets/: o motor de chamada de voz é um chunk carregado por
// import() dinâmico. Chunk que morre aqui faz a chamada falhar sem explicação
// nenhuma na tela.
//
// A versão anterior tinha os dois defeitos: o fallback de navegação era
// `caches.match(req).then((r) => r || caches.match("/index.html"))`, que devolve
// undefined quando nem a rota nem o index estão em cache; e o ramo de /assets/
// não tinha .catch, então rejeitava offline.
const semRede = () =>
  new Response("Sem conexão.", { status: 503, statusText: "Offline", headers: { "Content-Type": "text/plain; charset=utf-8" } });

const guardar = (req, res) => {
  // Só o que dá para reusar. Resposta parcial (206) ou opaca quebra o cache.
  if (!res || !res.ok || res.status === 206) return res;
  const copia = res.clone();
  caches.open(CACHE).then((c) => c.put(req, copia)).catch(() => {});
  return res;
};

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch (_e) { return; }
  if (url.origin !== self.location.origin) return;

  const isNav = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");

  if (isNav) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put("/index.html", copia)).catch(() => {});
        }
        return res;
      } catch (_e) {
        // Cadeia de fallback COMPLETA: rota exata → index → resposta própria.
        // O último degrau é o que garante que sempre sai um Response.
        return (await caches.match(req)) || (await caches.match("/index.html")) || semRede();
      }
    })());
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    // Cache primeiro: asset com hash no nome é imutável.
    event.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      try { return guardar(req, await fetch(req)); } catch (_e) { return semRede(); }
    })());
    return;
  }

  event.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try { return guardar(req, await fetch(req)); } catch (_e) { return semRede(); }
  })());
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
