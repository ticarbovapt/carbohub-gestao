// ─────────────────────────────────────────────────────────────────────────────
// carbo-push — leva o SININHO para o celular (Web Push), com o app fechado.
//
// Chamada pelo gatilho `trg_notificacao_push` (migração 20261064), UMA vez por
// lote de notificações — a venda on-line chega como ~30 linhas num insert só.
// O chat continua no `chat-push`, que tem regra própria; `chat_message` nem
// chega aqui.
//
// Regras de entrega:
//  • UM aviso por pessoa por notificação. Prefere o aparelho onde o HUB está
//    instalado (carbohub.com.br): é o "app do celular" do ecossistema. Sem Hub,
//    vai para o app usado mais recentemente.
//  • O toque abre a TELA certa por URL ABSOLUTA (a venda abre no Admin, o
//    cartão no Marketing) — o Hub não tem essas telas.
//  • Aparelho morto (404/410) sai da tabela e o próximo é tentado.
//
// ⚠️ Server-to-server: valida `x-chat-push-secret` (o MESMO do chat). Ausente
// no servidor FECHA (500), errado recusa (401).
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "npm:@supabase/supabase-js@2.39.3";
import webpush from "npm:web-push@3.6.7";

const SHARED_SECRET = Deno.env.get("CHAT_PUSH_SHARED_SECRET") ?? "";
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:ti@carbohub.com.br";
const HUB = "https://carbohub.com.br";
// O Hub abre com e sem `www` (medido: o aparelho do CEO registrou
// https://www.carbohub.com.br) — os dois são o Hub.
const ehHub = (o: string | null) => !!o && /^https:\/\/(www\.)?carbohub\.com\.br$/.test(o);

if (VAPID_PUBLIC && VAPID_PRIVATE) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

interface Item {
  user_id: string; type: string | null; title: string | null; body: string | null;
  reference_type: string | null; reference_id: string | null;
}
interface Sub { id: string; endpoint: string; p256dh: string; auth: string; origin: string | null }

// Para onde o toque leva. Tipo novo sem regra cai no Hub — nunca num link morto.
function destino(i: Item): string {
  if (i.reference_type === "mkt_card" && i.reference_id) return `https://mkt.carbohub.com.br/cartao/${i.reference_id}`;
  if (i.reference_type === "mkt_board" && i.reference_id) return `https://mkt.carbohub.com.br/quadros/${i.reference_id}`;
  const t = i.type ?? "";
  if (t === "ecommerce_sale" || t === "ecommerce_disconnected") return "https://admin.carbohub.com.br/ecommerce/vendas-online";
  if (t.startsWith("bug_")) return "https://ti.carbohub.com.br/bugs";
  if (t.startsWith("finance_")) return "https://finance.carbohub.com.br/compras";
  return `${HUB}/home`;
}

const json = (status: number, obj: unknown) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { erro: "use POST" });
  if (!SHARED_SECRET) return json(500, { erro: "CHAT_PUSH_SHARED_SECRET ausente no servidor" });
  if (req.headers.get("x-chat-push-secret") !== SHARED_SECRET) return json(401, { erro: "não autorizado" });
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return json(500, { erro: "chaves VAPID ausentes no servidor" });

  let itens: Item[];
  try { itens = ((await req.json()) as { itens?: Item[] }).itens ?? []; } catch { return json(400, { erro: "corpo inválido" }); }
  if (!itens.length) return json(200, { enviados: 0 });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const usuarios = [...new Set(itens.map((i) => i.user_id))];
  const { data: subsRaw, error } = await admin.from("chat_push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth, origin, last_seen_at")
    .in("user_id", usuarios).order("last_seen_at", { ascending: false });
  if (error) return json(500, { erro: error.message });

  const porUsuario = new Map<string, Sub[]>();
  for (const s of (subsRaw ?? []) as (Sub & { user_id: string })[]) {
    const l = porUsuario.get(s.user_id) ?? [];
    l.push(s);
    porUsuario.set(s.user_id, l);
  }
  const mortos = new Set<string>();
  let enviados = 0;

  await Promise.all(itens.map(async (i) => {
    const subs = (porUsuario.get(i.user_id) ?? []);
    const ordem = [...subs.filter((s) => ehHub(s.origin)), ...subs.filter((s) => !ehHub(s.origin))];
    const aviso = JSON.stringify({
      title: i.title || "Carbo",
      body: i.body || "",
      // Agrupa repetição do MESMO assunto (o mesmo cartão, a mesma venda) em vez
      // de empilhar; assuntos diferentes ficam separados.
      tag: `notif:${i.type ?? "geral"}:${i.reference_id ?? crypto.randomUUID()}`,
      data: { url: destino(i) },
    });
    for (const s of ordem) {
      if (mortos.has(s.id)) continue;
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, aviso);
        enviados++;
        return; // um aparelho por pessoa
      } catch (e) {
        const code = (e as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) { mortos.add(s.id); continue; }
        return;
      }
    }
  }));

  if (mortos.size) await admin.from("chat_push_subscriptions").delete().in("id", [...mortos]);
  return json(200, { enviados, aparelhos_removidos: mortos.size });
});
