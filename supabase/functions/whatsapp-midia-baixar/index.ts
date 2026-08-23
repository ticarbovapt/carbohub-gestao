// ─────────────────────────────────────────────────────────────────────────────
// whatsapp-midia-baixar — ouvir o áudio, ver a foto que o cliente mandou
//
// O webhook guarda o `media_id`, não o arquivo. O arquivo fica na Meta, e sair
// de lá exige DUAS chamadas com o token:
//
//   1. GET /{media_id}   devolve uma URL temporária e o mime
//   2. GET nessa URL     COM o Authorization — sem ele, 401
//
// ⚠️ Por isso o navegador não consegue sozinho. A URL do passo 1 dura cerca de
// cinco minutos E exige o mesmo bearer no passo 2 — pôr o token no front seria
// entregar a conta inteira do WhatsApp a qualquer um com o DevTools aberto.
//
// Esta função é a ponte: autentica quem pede, busca com o nosso token e
// devolve os bytes.
//
// ── ⚠️ O que ela NÃO resolve ────────────────────────────────────────────────
//
// A Meta guarda a mídia por cerca de 30 dias. Depois disso o `media_id` morre e
// não há o que buscar. Para atendimento é tempo de sobra; para histórico, não —
// e aí o caminho é baixar no recebimento e guardar no nosso storage, que é
// outra decisão (custo, LGPD, retenção).
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// deno-lint-ignore-file no-explicit-any

const ALLOWED_ORIGINS = [
  "https://admin.carbohub.com.br",
  "https://ops.carbohub.com.br",
  "https://carbohub-admin.vercel.app",
  "http://localhost:8080",
  "http://localhost:8082",
  "http://localhost:5173",
];

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const TOKEN  = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
const VERSAO = Deno.env.get("WHATSAPP_API_VERSION") ?? "v25.0";

const INTERNAS = ["carbo_admin","carbo_crm","carbo_ops","carbo_ops_app",
                  "carbo_financas","carbo_mkt","carbo_ti"];

Deno.serve(async (req: Request) => {
  const base = cors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: base });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b, null, 2),
                 { status: s, headers: { "Content-Type": "application/json", ...base } });

  if (req.method !== "POST") return json({ error: "método não suportado" }, 405);

  // ── Quem está pedindo ───────────────────────────────────────────────────
  const auth = req.headers.get("authorization") ?? "";
  if (!auth) return json({ error: "sessão ausente" }, 401);
  const { data: { user }, error: erroUser } =
    await supabase.auth.getUser(auth.replace("Bearer ", ""));
  if (erroUser || !user) return json({ error: "sessão inválida" }, 401);

  const { data: perfil } = await supabase
    .from("profiles").select("allowed_interfaces").eq("id", user.id).maybeSingle();
  const interno = (perfil?.allowed_interfaces ?? [])
    .some((x: string) => INTERNAS.includes(String(x).toLowerCase()));
  if (!interno) return json({ error: "sem acesso ao atendimento" }, 403);

  if (!TOKEN) return json({ error: "WHATSAPP_ACCESS_TOKEN não está configurado." }, 500);

  const corpo = await req.json().catch(() => ({}));
  const mediaId = String(corpo?.media_id ?? "").trim();
  if (!mediaId) return json({ error: "media_id ausente" }, 400);

  // ⚠️ O id tem de ser de uma mensagem NOSSA. Sem esta checagem, quem tem
  // acesso à tela poderia pedir qualquer id da conta — inclusive de conversas
  // que ele não abriria. É barato: um índice já existe sobre a coluna.
  const { data: existe } = await supabase
    .from("carbo_wa_mensagens").select("wamid").eq("midia_id", mediaId).limit(1);
  if (!existe?.length) return json({ error: "mídia não encontrada nas conversas" }, 404);

  // ── 1. A URL temporária ─────────────────────────────────────────────────
  let url = "", mime = "application/octet-stream";
  try {
    const res = await fetch(`https://graph.facebook.com/${VERSAO}/${mediaId}`, {
      headers: { "Authorization": `Bearer ${TOKEN}` },
    });
    const meta = await res.json().catch(() => ({}));
    if (!res.ok || !meta?.url) {
      // O 404 aqui quase sempre é a retenção de 30 dias, e dizer isso poupa
      // meia hora de gente procurando bug onde não há.
      return json({
        error: "midia_indisponivel",
        detalhe: res.status === 404
          ? "A Meta guarda a mídia por cerca de 30 dias — este arquivo já expirou."
          : (meta?.error?.message ?? `HTTP ${res.status}`),
      }, 404);
    }
    url = String(meta.url);
    mime = String(meta.mime_type ?? mime);
  } catch (e) {
    return json({ error: "midia_indisponivel", detalhe: String((e as Error)?.message ?? e) }, 502);
  }

  // ── 2. Os bytes, e o Authorization vai JUNTO ────────────────────────────
  try {
    const res = await fetch(url, { headers: { "Authorization": `Bearer ${TOKEN}` } });
    if (!res.ok) {
      return json({ error: "midia_indisponivel", detalhe: `download HTTP ${res.status}` }, 502);
    }
    return new Response(res.body, {
      status: 200,
      headers: {
        ...base,
        "Content-Type": mime,
        // Só o navegador de quem pediu guarda, e por pouco tempo: a URL de
        // origem expira e o conteúdo é de cliente.
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e) {
    return json({ error: "midia_indisponivel", detalhe: String((e as Error)?.message ?? e) }, 502);
  }
});
