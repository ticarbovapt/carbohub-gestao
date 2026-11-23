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
// ── O cofre (23/11/2026) ─────────────────────────────────────────────────────
//
// A Meta guarda a mídia por ~30 dias. Desde 23/11 o arquivo fica também no
// bucket privado `wa-midia` (ver `_shared/waMidiaCofre.ts`): esta função lê
// de lá primeiro e, quando não acha, busca na Meta e GUARDA — o histórico de
// antes da mudança vai sendo guardado na primeira abertura, enquanto a Meta
// ainda o tiver.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { ehTimeInterno } from "../_shared/interfacesInternas.ts";
import { cors } from "../_shared/cors.ts";
import {
  baixarDaMeta, guardarNoCofre, lerDoCofre,
} from "../_shared/waMidiaCofre.ts";
// deno-lint-ignore-file no-explicit-any



const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const TOKEN  = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
const VERSAO = Deno.env.get("WHATSAPP_API_VERSION") ?? "v25.0";


Deno.serve(async (req: Request) => {
  const base = cors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: base });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b, null, 2),
                 { status: s, headers: { "Content-Type": "application/json", ...base } });

  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "método não suportado" }, 405);
  }

  // ── Quem está pedindo ───────────────────────────────────────────────────
  const auth = req.headers.get("authorization") ?? "";
  if (!auth) return json({ error: "sessão ausente" }, 401);
  const { data: { user }, error: erroUser } =
    await supabase.auth.getUser(auth.replace("Bearer ", ""));
  if (erroUser || !user) return json({ error: "sessão inválida" }, 401);

  const { data: perfil } = await supabase
    .from("profiles").select("allowed_interfaces").eq("id", user.id).maybeSingle();
  // ⚠️ Pergunta ao BANCO (`carbo_interface_e_interna`), que e a fonte unica desde
  // a 20260927. Antes esta lista estava copiada AQUI, e ela nao aprendeu o
  // `carbo_atendimento` quando o app novo nasceu — quem so tivesse Atendimento
  // veria o campo na tela e levaria 403 no clique.
  const interno = await ehTimeInterno(supabase, perfil?.allowed_interfaces ?? []);
  if (!interno) return json({ error: "sem acesso ao atendimento" }, 403);

  if (!TOKEN) return json({ error: "WHATSAPP_ACCESS_TOKEN não está configurado." }, 500);

  // ⚠️ GET é o caminho principal, e não é estilo: resposta de POST o navegador
  // NÃO guarda no cache de HTTP, então o `Cache-Control` abaixo era ignorado e
  // cada F5 rebaixava o mesmo áudio da Meta — duas chamadas ao Graph por
  // escuta. Em GET a mesma URL responde do disco do navegador.
  const mediaId = req.method === "GET"
    ? String(new URL(req.url).searchParams.get("media_id") ?? "").trim()
    : String((await req.json().catch(() => ({})))?.media_id ?? "").trim();
  if (!mediaId) return json({ error: "media_id ausente" }, 400);

  // ⚠️ O id tem de ser de uma mensagem NOSSA. Sem esta checagem, quem tem
  // acesso à tela poderia pedir qualquer id da conta — inclusive de conversas
  // que ele não abriria. É barato: um índice já existe sobre a coluna.
  const { data: existe } = await supabase
    .from("carbo_wa_mensagens").select("wamid").eq("midia_id", mediaId).limit(1);
  if (!existe?.length) return json({ error: "mídia não encontrada nas conversas" }, 404);

  // ⚠️ (23/11/2026) Cache de UM ANO: o arquivo do cofre não muda nunca, e o
  // `media_id` aponta sempre para o mesmo arquivo.
  const responder = (bytes: Uint8Array, mime: string) => new Response(bytes, {
    status: 200,
    headers: {
      ...base,
      "Content-Type": mime,
      // `private`: o conteúdo é de cliente e não pode ficar em cache compartilhado.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });

  // ── 1. O cofre (bucket `wa-midia`) ───────────────────────────────────────
  // Lá mora o que o webhook guardou ao receber, o que nós enviamos, e o que
  // alguém já abriu antes. Não depende da Meta nem do prazo dela.
  const doCofre = await lerDoCofre(supabase, mediaId);
  if (doCofre) return responder(doCofre.bytes, doCofre.mime);

  // ── 2. A Meta, e guarda para a próxima vez ──────────────────────────────
  const b = await baixarDaMeta(mediaId, TOKEN, VERSAO);
  if (!b.ok) {
    // ⚠️ A frase em português chega à tela; o erro cru da Graph ("Unsupported
    // get request…") chegava em inglês e não dizia nada a quem atende.
    return json({ error: b.expirada ? "midia_expirada" : "midia_indisponivel", detalhe: b.detalhe },
                b.expirada ? 404 : 502);
  }
  await guardarNoCofre(supabase, mediaId, b.bytes, b.mime);
  return responder(b.bytes, b.mime);
});
