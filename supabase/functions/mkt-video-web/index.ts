import { createClient } from "npm:@supabase/supabase-js@2.39.3";

// ─────────────────────────────────────────────────────────────────────────────
// mkt-video-web — a PORTA do conversor de vídeo dos Quadros do Marketing.
//
// O .MOV do iPhone (HEVC) não toca no Chrome. Quem converte é o GitHub Actions
// (`.github/workflows/mkt-transcodificar.yml`, ffmpeg); esta função só entrega
// a fila e recebe o resultado. Converter AQUI não cabe: um vídeo de 243 MB não
// passa na memória nem no tempo de uma edge function.
//
// ⚠️ Por que uma função e não o workflow falando direto com o Storage: o
// GitHub guarda só o CRON_SECRET, nunca a service role (que lê o banco inteiro).
// ⚠️ AUSÊNCIA FECHA: sem CRON_SECRET no servidor, 500; segredo errado, 401.
// ⚠️ Os caminhos de escrita são FIXOS (`web/<id>/…mp4`, `capas/<id>/…jpg`): a
// função nunca grava onde quem chama mandar.
// ⚠️ O ORIGINAL nunca é tocado. A cópia web serve só para ASSISTIR.
//
// Ações (POST JSON, cabeçalho x-cron-secret):
//   { acao: "pendentes", limite? }                    vídeos ainda não olhados
//   { acao: "enviar", id, tipo: "web" | "capa" }      URL assinada de upload
//   { acao: "concluir", id, storage_path, nativo?, web_path?, poster_path? }
//   { acao: "falhou", id, storage_path, erro }
// ─────────────────────────────────────────────────────────────────────────────

const CRON_SECRET = Deno.env.get("CRON_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "mkt-anexos";
const MAX_TENTATIVAS = 3;
// Mesma regra de `public.mkt_e_video` (SQL) e `tipoDoArquivo` (app mkt).
const EH_VIDEO = (mime: string | null, nome: string | null) =>
  (mime ?? "").toLowerCase().startsWith("video/") || /\.(mov|mp4|m4v|webm|avi|mkv|3gp)$/i.test(nome ?? "");

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (!CRON_SECRET) return json({ erro: "CRON_SECRET ausente no servidor — configure em Edge Functions → Secrets." }, 500);
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ erro: "não autorizado" }, 401);
  if (req.method !== "POST") return json({ erro: "use POST" }, 405);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ erro: "corpo inválido" }, 400); }
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const id = typeof b.id === "string" ? b.id : "";
  const uuidOk = /^[0-9a-f-]{36}$/i.test(id);

  if (b.acao === "pendentes") {
    const limite = Math.min(Math.max(Number(b.limite) || 5, 1), 20);
    const { data, error } = await sb.from("mkt_card_attachments")
      .select("id, name, mime_type, storage_path, poster_path, tamanho, web_tentativas")
      .eq("kind", "arquivo").not("storage_path", "is", null).is("web_status", null)
      .lt("web_tentativas", MAX_TENTATIVAS)
      .order("created_at", { ascending: false }).limit(1000);
    if (error) return json({ erro: error.message }, 500);
    const videos = (data ?? []).filter((a) => EH_VIDEO(a.mime_type, a.name)).slice(0, limite);
    const itens = [];
    for (const a of videos) {
      const s = await sb.storage.from(BUCKET).createSignedUrl(a.storage_path, 3 * 3600);
      if (s.error || !s.data) continue;
      itens.push({ id: a.id, nome: a.name, mime: a.mime_type, storage_path: a.storage_path, tamanho: a.tamanho, sem_capa: !a.poster_path, url: s.data.signedUrl });
    }
    return json({ itens });
  }

  if (!uuidOk) return json({ erro: "id inválido" }, 400);

  if (b.acao === "enviar") {
    const caminho = b.tipo === "capa" ? `capas/${id}/${crypto.randomUUID()}.jpg`
      : b.tipo === "web" ? `web/${id}/${crypto.randomUUID()}.mp4` : null;
    if (!caminho) return json({ erro: "tipo inválido" }, 400);
    const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(caminho);
    if (error || !data) return json({ erro: error?.message ?? "sem URL" }, 500);
    return json({ caminho, url: data.signedUrl });
  }

  const storagePath = typeof b.storage_path === "string" ? b.storage_path : "";
  if (!storagePath) return json({ erro: "storage_path é obrigatório" }, 400);

  if (b.acao === "concluir") {
    const web = typeof b.web_path === "string" ? b.web_path : null;
    const capa = typeof b.poster_path === "string" ? b.poster_path : null;
    if (web && !web.startsWith(`web/${id}/`)) return json({ erro: "web_path fora do lugar" }, 400);
    if (capa && !capa.startsWith(`capas/${id}/`)) return json({ erro: "poster_path fora do lugar" }, 400);
    if (!web && b.nativo !== true) return json({ erro: "informe web_path ou nativo" }, 400);

    // ⚠️ Só grava se o anexo AINDA aponta o arquivo que foi convertido. Se
    // alguém substituiu durante a conversão, a cópia é de um arquivo que não
    // existe mais no anexo — e mostrá-la seria exibir a versão errada.
    const { data, error } = await sb.from("mkt_card_attachments")
      .update({ web_status: web ? "pronto" : "nativo", web_path: web, web_erro: null })
      .eq("id", id).eq("storage_path", storagePath).select("id, poster_path");
    if (error) return json({ erro: error.message }, 500);
    if (!data?.length) {
      await sb.storage.from(BUCKET).remove([web, capa].filter(Boolean) as string[]);
      return json({ descartado: true, motivo: "o anexo foi substituído durante a conversão" });
    }
    if (capa) {
      // Capa só preenche o que FALTA — nunca troca a que o navegador gerou.
      const c = await sb.from("mkt_card_attachments").update({ poster_path: capa })
        .eq("id", id).is("poster_path", null).select("id");
      if (!c.data?.length) await sb.storage.from(BUCKET).remove([capa]);
    }
    return json({ ok: true });
  }

  if (b.acao === "falhou") {
    const { data: a } = await sb.from("mkt_card_attachments").select("web_tentativas").eq("id", id).eq("storage_path", storagePath).maybeSingle();
    if (!a) return json({ descartado: true });
    const t = (a.web_tentativas ?? 0) + 1;
    const { error } = await sb.from("mkt_card_attachments")
      .update({ web_tentativas: t, web_erro: String(b.erro ?? "").slice(0, 500), web_status: t >= MAX_TENTATIVAS ? "falhou" : null })
      .eq("id", id).eq("storage_path", storagePath);
    if (error) return json({ erro: error.message }, 500);
    return json({ ok: true, tentativas: t });
  }

  return json({ erro: "ação desconhecida" }, 400);
});
