// ─────────────────────────────────────────────────────────────────────────────
// Carbo Chat — Edge Function de Web Push (app fechado).
//
// Chamada pelo trigger chat_notify_on_message (via pg_net) com a lista de
// destinatários já calculada no banco (mesma regra do in-app: DM avisa o outro,
// grupo avisa mencionados, @todos fura silêncio, respeita mutado, nunca o autor).
//
// Regras de entrega:
//  • NÃO envia se a pessoa está com AQUELE canal aberto e ativa agora (o toast
//    in-app já cobre) — checa chat_presence.
//  • 1 push por pessoa, no ÚLTIMO app que ela usou (chat_presence.origin);
//    se aquela subscription morreu (404/410), cai para a próxima mais recente.
//
// Server-to-server: valida x-chat-push-secret (não usa JWT). web-push só aqui.
// ─────────────────────────────────────────────────────────────────────────────
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";
import webpush from "npm:web-push@3.6.7";

const SHARED_SECRET = Deno.env.get("CHAT_PUSH_SHARED_SECRET") ?? "";
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:ti@carbohub.com.br";

const PRESENCE_FRESH_MS = 45_000; // "está vendo o canal agora"

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

interface Sub { id: string; endpoint: string; p256dh: string; auth: string; origin: string | null; last_seen_at: string; }

serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (!SHARED_SECRET || req.headers.get("x-chat-push-secret") !== SHARED_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return new Response("vapid keys ausentes", { status: 500 });
  }

  let payload: { message_id?: string; channel_id?: string; sender?: string; preview?: string; recipients?: string[] };
  try { payload = await req.json(); } catch { return new Response("bad json", { status: 400 }); }

  const { channel_id, sender, preview, recipients } = payload;
  if (!channel_id || !Array.isArray(recipients) || recipients.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const notification = JSON.stringify({
    title: sender || "Carbo Chat",
    body: preview || "Nova mensagem",
    tag: "chat:" + channel_id,                 // colapsa repetição da mesma conversa
    data: { channel_id, path: "/chat?c=" + channel_id },
  });

  let sent = 0;

  await Promise.all(recipients.map(async (userId) => {
    // Está vendo esse canal agora? então não manda push (toast in-app cobre).
    const { data: pres } = await admin
      .from("chat_presence")
      .select("active_channel_id, origin, last_seen_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (pres && pres.active_channel_id === channel_id &&
        Date.now() - new Date(pres.last_seen_at).getTime() < PRESENCE_FRESH_MS) {
      return;
    }

    const { data: subsRaw } = await admin
      .from("chat_push_subscriptions")
      .select("id, endpoint, p256dh, auth, origin, last_seen_at")
      .eq("user_id", userId)
      .order("last_seen_at", { ascending: false });

    const subs = (subsRaw ?? []) as Sub[];
    if (subs.length === 0) return;

    // Ordem de tentativa: 1º o app que a pessoa usou por último (presence.origin),
    // depois os demais por recência. Só UM push por pessoa.
    const preferred = pres?.origin ? subs.filter((s) => s.origin === pres.origin) : [];
    const rest = subs.filter((s) => !preferred.includes(s));
    const ordered = [...preferred, ...rest];

    for (const s of ordered) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          notification,
        );
        sent++;
        return; // entregue → não tenta outra subscription da mesma pessoa
      } catch (err) {
        const code = (err as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) {
          // endpoint morto → remove e tenta o próximo
          await admin.from("chat_push_subscriptions").delete().eq("id", s.id);
          continue;
        }
        return; // outro erro (rede, etc.) → não insiste
      }
    }
  }));

  return new Response(JSON.stringify({ sent }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
