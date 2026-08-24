// ─────────────────────────────────────────────────────────────────────────────
// whatsapp-midia — foto, documento e áudio no atendimento
//
// Dois passos, e é a Meta que os separa:
//
//   1. POST /{PHONE_ID}/media      o arquivo sobe e vira um `media_id`
//   2. POST /{PHONE_ID}/messages   a mensagem é enviada com esse id
//
// ⚠️ Não dá para pular o passo 1 mandando uma URL. Existe a forma com `link`,
// mas ela exige que o arquivo esteja num endereço público — o que significaria
// publicar a foto que o atendimento acabou de tirar num lugar sem
// autenticação. O upload é mais trabalho e não expõe nada.
//
// ── Quem pode chamar ────────────────────────────────────────────────────────
//
// Gente logada, do time interno — igual ao `whatsapp-responder`, e pela mesma
// razão: escrever pelo número da CarboZé não pode depender de um segredo que
// anda na URL. Sobe SEM `--no-verify-jwt`.
//
// ── ⚠️ A janela vale aqui também ────────────────────────────────────────────
//
// Mídia é mensagem de texto livre para efeito da Meta: fora da janela de 24 h
// ela recusa com 131047, exatamente como recusaria um texto.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { detalheDoErro } from "../_shared/metaTemplate.ts";
import { conferirMidia, corpoDaMidia } from "../_shared/metaMidia.ts";
import { webmParaOgg } from "../_shared/webmParaOgg.ts";

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

const INTERNAS = ["carbo_admin","carbo_crm","carbo_ops","carbo_ops_app",
                  "carbo_financas","carbo_mkt","carbo_ti"];

Deno.serve(async (req: Request) => {
  const h = { "Content-Type": "application/json", ...cors(req) };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b, null, 2), { status: s, headers: h });

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
  if (!interno) return json({ error: "sem acesso ao atendimento" }, 403);

  if (!TOKEN) return json({ error: "WHATSAPP_ACCESS_TOKEN não está configurado." }, 500);

  // ── 2. O arquivo ────────────────────────────────────────────────────────
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "envie o arquivo como multipart/form-data" }, 400);
  }

  const arquivo = form.get("arquivo");
  const waId = String(form.get("wa_id") ?? "").replace(/\D/g, "");
  const legenda = String(form.get("legenda") ?? "").trim();

  if (!waId) return json({ error: "wa_id ausente" }, 400);
  if (!(arquivo instanceof File)) return json({ error: "arquivo ausente" }, 400);

  // ⚠️ Recusa AQUI, com frase, em vez de deixar a Meta recusar com código. O
  // webm do Chrome é o caso mais provável e tem explicação própria.
  const veredito = conferirMidia(arquivo.type, arquivo.size, arquivo.name);
  if (!veredito.ok) return json({ error: veredito.erro }, 400);

  // ── 3. A janela ─────────────────────────────────────────────────────────
  const { data: contato } = await supabase
    .from("carbo_wa_contatos").select("last_inbound_at").eq("wa_id", waId).maybeSingle();
  const ultima = contato?.last_inbound_at ? new Date(contato.last_inbound_at).getTime() : 0;
  const fecha = ultima + 24 * 60 * 60 * 1000;
  if (!ultima || Date.now() >= fecha) {
    return json({
      error: "janela_fechada",
      detalhe: ultima
        ? `A janela de 24h fechou em ${new Date(fecha).toISOString()}. Só template aprovado alcança este cliente agora, e template não carrega arquivo sem header aprovado.`
        : "Este cliente nunca escreveu para o número.",
    }, 409);
  }

  // ── 4. Troca a embalagem, quando é preciso ──────────────────────────────
  //
  // ⚠️ O Chrome não grava ogg. Grava webm/opus (mesmo codec, outro contêiner) ou
  // mp4 — e o mp4 dele a Meta recusa com 131053: "uploaded with mimetype as
  // audio/mp4, however on processing it is of type application/octet-stream".
  // Medido em produção, duas vezes, com o balão parecendo enviado nas duas.
  //
  // O remux tira os pacotes Opus do webm e os põe num Ogg, byte a byte iguais.
  // Não é conversão: não há ffmpeg aqui, e não há perda.
  let corpoArquivo: Blob = arquivo;
  let nomeUpload = arquivo.name || "arquivo";

  if (veredito.remuxar) {
    const bruto = new Uint8Array(await arquivo.arrayBuffer());
    const r = webmParaOgg(bruto);
    if (!r.ok || !r.ogg) {
      return json({ error: "falha_no_audio", detalhe: r.erro ?? "não consegui reempacotar o áudio." }, 400);
    }
    // Duração zero seria arquivo montado sem áudio dentro — o defeito que passa
    // por sucesso. Melhor recusar aqui que mandar silêncio ao cliente.
    if (!r.duracao || r.duracao < 0.1) {
      return json({ error: "falha_no_audio",
                    detalhe: "a gravação saiu vazia — tente segurar o botão um instante a mais." }, 400);
    }
    corpoArquivo = new Blob([r.ogg], { type: "audio/ogg" });
    nomeUpload = (arquivo.name || "audio").replace(/\.[^.]+$/, "") + ".ogg";
    console.log("[midia] remux webm→ogg", { pacotes: r.pacotes, duracao: r.duracao,
                                            de: arquivo.size, para: r.ogg.length });
  }

  // ── 5. Sobe o arquivo ───────────────────────────────────────────────────
  const upload = new FormData();
  upload.append("messaging_product", "whatsapp");
  upload.append("type", veredito.mime!);
  upload.append("file", corpoArquivo, nomeUpload);

  let mediaId: string | null = null;
  try {
    const res = await fetch(`https://graph.facebook.com/${VERSAO}/${PHONE_ID}/media`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${TOKEN}` },
      body: upload,
    });
    const corpo = await res.json().catch(() => ({}));
    if (!res.ok || !corpo?.id) {
      return json({
        error: "falha_no_upload",
        // O detalhe da Meta é o que diz se foi tipo, tamanho ou token — e é
        // ele que vai responder a pergunta do áudio em webm.
        detalhe: detalheDoErro(corpo) || `HTTP ${res.status}`,
        codigo: corpo?.error?.code ?? null,
        enviei_como: veredito.mime,
      }, 502);
    }
    mediaId = String(corpo.id);
  } catch (e) {
    return json({ error: "falha_no_upload", detalhe: String((e as Error)?.message ?? e) }, 502);
  }

  // ── 6. Manda ────────────────────────────────────────────────────────────
  const payload = corpoDaMidia(waId, veredito.tipo!, mediaId, legenda, nomeUpload);

  let resposta: any = null, status = 0;
  try {
    const res = await fetch(`https://graph.facebook.com/${VERSAO}/${PHONE_ID}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    resposta = await res.json().catch(() => ({}));
    status = res.status;
  } catch (e) {
    return json({ error: "falha_no_envio", detalhe: String((e as Error)?.message ?? e) }, 502);
  }

  const ok = status >= 200 && status < 300;
  const wamid = resposta?.messages?.[0]?.id ?? null;

  if (ok && wamid) {
    // ⚠️ Só grava o que SAIU, e guarda o `media_id` — o arquivo em si fica na
    // Meta e o link dela expira. Guardar o id é o que permite buscá-lo depois;
    // baixar e armazenar é outra decisão (storage, custo, LGPD).
    const { error: erroGrava } = await supabase.from("carbo_wa_mensagens").upsert({
      wamid, wa_id: waId, direcao: "saida", tipo: veredito.tipo,
      // ⚠️ Áudio sem legenda grava NULO, não o nome do arquivo. O nome é nosso
      // (`audio-1787495498124.ogg`) e apareceria na conversa como se alguém o
      // tivesse escrito. Documento é o contrário: ali o nome é o conteúdo.
      // ⚠️ Só DOCUMENTO guarda o nome como texto da mensagem: ali o nome é o
      // conteúdo ("NF-000515.pdf"). Em foto e áudio o nome é nosso
      // (`print-1787…png`) e apareceria na conversa como se alguém o tivesse
      // escrito — ruído embaixo da própria imagem.
      texto: legenda || (veredito.tipo === "document" ? nomeUpload : null) || null,
      midia_id: mediaId, midia_mime: veredito.mime,
      ocorrido_em: new Date().toISOString(),
      payload: { por: perfil?.full_name ?? user.email ?? user.id, ...payload },
    }, { onConflict: "wamid" });
    if (erroGrava) console.error("[midia] enviou mas não gravou", wamid, erroGrava);
    return json({ ok: true, wamid, media_id: mediaId, tipo: veredito.tipo,
                  gravado: !erroGrava });
  }

  return json({
    error: "falha_no_envio",
    codigo: resposta?.error?.code ?? null,
    detalhe: detalheDoErro(resposta) || `HTTP ${status}`,
  }, 502);
});
