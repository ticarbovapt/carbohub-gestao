// ─────────────────────────────────────────────────────────────────────────────
// whatsapp-responder — o atendimento responde o cliente, em texto livre
//
// A outra metade da conversa. O `whatsapp-meta` manda TEMPLATE, sozinho, por
// cron; esta função manda TEXTO LIVRE, por um clique de gente.
//
// ── ⚠️ Por que ela não pode existir sem a janela de 24 h ────────────────────
//
// Texto livre só é aceito enquanto a janela estiver aberta — ela abre quando o
// CLIENTE escreve e dura 24 h. Fora dela a Meta recusa com 131047, e nenhum
// dos seis templates da esteira serve para responder dúvida: eles avisam sobre
// o pedido, não conversam.
//
// Então a janela é conferida ANTES de chamar a Meta, e a recusa é explícita
// (409 com a hora em que fechou). Um 500 genérico faria a pessoa reescrever a
// mensagem várias vezes achando que é falha do sistema — quando o que houve é
// que não há mais como falar com aquele cliente por aqui.
//
// ── Quem pode chamar ────────────────────────────────────────────────────────
//
// Gente logada, do TIME INTERNO. Não é `CRON_SECRET`: máquina nenhuma responde
// cliente. E não basta estar autenticado — o portal de lojas e o de licenciados
// usam a mesma tabela `profiles`, e sem a checagem de interface um lojista
// logado poderia escrever pelo número da CarboZé.
//
// Por isso ela sobe SEM `--no-verify-jwt`, como a `evolution-instancia`.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { detalheDoErro, ehTransitorio } from "../_shared/metaTemplate.ts";

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

const TOKEN    = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
const PHONE_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "1255756280958635";
const VERSAO   = Deno.env.get("WHATSAPP_API_VERSION") ?? "v25.0";

/** As mesmas interfaces do `carbo_e_time_interno`. Lista duplicada de propósito
 *  é dívida; aqui ela é inevitável (o SQL não alcança daqui), então fica com o
 *  aviso: mudou lá, muda aqui. */
const INTERNAS = ["carbo_admin","carbo_crm","carbo_ops","carbo_ops_app",
                  "carbo_financas","carbo_mkt","carbo_ti"];

Deno.serve(async (req: Request) => {
  const h = { "Content-Type": "application/json", ...cors(req) };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b, null, 2), { status: s, headers: h });

  if (req.method !== "POST") return json({ error: "método não suportado" }, 405);

  // ── 1. Quem está falando ────────────────────────────────────────────────
  const auth = req.headers.get("authorization") ?? "";
  if (!auth) return json({ error: "sessão ausente" }, 401);
  const { data: { user }, error: erroUser } =
    await supabase.auth.getUser(auth.replace("Bearer ", ""));
  if (erroUser || !user) return json({ error: "sessão inválida" }, 401);

  const { data: perfil } = await supabase
    .from("profiles").select("allowed_interfaces, full_name").eq("id", user.id).maybeSingle();
  const interno = (perfil?.allowed_interfaces ?? [])
    .some((x: string) => INTERNAS.includes(String(x).toLowerCase()));
  if (!interno) {
    // 403 e não 401: a sessão é válida, o acesso é que não existe. Um 401 aqui
    // faria a tela mandar a pessoa fazer login de novo, para o mesmo resultado.
    return json({ error: "sem acesso ao atendimento" }, 403);
  }

  if (!TOKEN) return json({ error: "WHATSAPP_ACCESS_TOKEN não está configurado." }, 500);

  const corpo = await req.json().catch(() => ({}));
  const waId = String(corpo?.wa_id ?? "").replace(/\D/g, "");
  const texto = String(corpo?.texto ?? "").trim();
  if (!waId) return json({ error: "wa_id ausente" }, 400);
  if (!texto) return json({ error: "mensagem vazia" }, 400);
  // A Cloud API aceita 4096 caracteres em texto livre. Cortar aqui, com aviso,
  // é melhor do que a Meta recusar a mensagem inteira depois de escrita.
  if (texto.length > 4096) return json({ error: "mensagem acima de 4096 caracteres" }, 400);

  // ── 2. A janela ─────────────────────────────────────────────────────────
  const { data: contato } = await supabase
    .from("carbo_wa_contatos").select("nome,last_inbound_at").eq("wa_id", waId).maybeSingle();

  const ultima = contato?.last_inbound_at ? new Date(contato.last_inbound_at).getTime() : 0;
  const fecha = ultima + 24 * 60 * 60 * 1000;
  if (!ultima || Date.now() >= fecha) {
    return json({
      error: "janela_fechada",
      // A mensagem é para ser LIDA por quem está atendendo, não decodificada.
      detalhe: ultima
        ? `A janela de 24h fechou em ${new Date(fecha).toISOString()}. Só template aprovado alcança este cliente agora, e nenhum dos seis da esteira serve para responder dúvida.`
        : "Este cliente nunca escreveu para o número. Só é possível responder depois que ele iniciar a conversa.",
      fechou_em: ultima ? new Date(fecha).toISOString() : null,
    }, 409);
  }

  // ── 3. Manda ────────────────────────────────────────────────────────────
  const payload = {
    messaging_product: "whatsapp", recipient_type: "individual",
    to: waId, type: "text",
    // `preview_url: false` de propósito: prévia de link muda a altura da
    // mensagem e vaza o destino de um link interno se alguém colar um por
    // engano.
    text: { preview_url: false, body: texto },
  };

  let resposta: any = null, status = 0;
  for (let tentativa = 0; tentativa <= 2; tentativa++) {
    const res = await fetch(`https://graph.facebook.com/${VERSAO}/${PHONE_ID}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    resposta = await res.json().catch(() => ({}));
    status = res.status;
    if (res.ok) break;
    if (ehTransitorio(res.status, resposta?.error?.code) && tentativa < 2) {
      await new Promise((r) => setTimeout(r, 2 ** tentativa * 1000));
      continue;
    }
    break;
  }

  const ok = status >= 200 && status < 300;
  const wamid = resposta?.messages?.[0]?.id ?? null;

  // ── 4. Registra ─────────────────────────────────────────────────────────
  //
  // ⚠️ Só grava o que SAIU. Uma tentativa que falhou não é mensagem: gravá-la
  // faria a conversa na tela mostrar um balão que o cliente nunca recebeu — e
  // quem atende responderia como se já tivesse dito aquilo.
  if (ok && wamid) {
    const { error: erroGrava } = await supabase.from("carbo_wa_mensagens").upsert({
      wamid, wa_id: waId, direcao: "saida", tipo: "text", texto,
      ocorrido_em: new Date().toISOString(),
      payload: { por: perfil?.full_name ?? user.email ?? user.id, ...payload },
    }, { onConflict: "wamid" });
    // A mensagem JÁ SAIU. Falhar aqui não desfaz nada, então não vira erro para
    // quem atendeu — vira log, e a resposta diz que houve.
    if (erroGrava) console.error("[responder] enviou mas não gravou", wamid, erroGrava);
    return json({ ok: true, wamid, gravado: !erroGrava });
  }

  return json({
    error: "falha_no_envio",
    codigo: resposta?.error?.code ?? null,
    detalhe: detalheDoErro(resposta) || `HTTP ${status}`,
  }, 502);
});
