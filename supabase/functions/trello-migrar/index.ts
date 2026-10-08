import { createClient } from "npm:@supabase/supabase-js@2.39.3";

// ─────────────────────────────────────────────────────────────────────────────
// trello-migrar — traz do Trello o que o export em JSON não traz: os ARQUIVOS
// enviados ao Trello e os COMENTÁRIOS além das últimas 1.000 ações.
//
// Quem chama é o NAVEGADOR (app de Marketing), por gente logada — por isso sobe
// SEM --no-verify-jwt, e ainda confere `carbo_e_time_interno()`.
//
// ⚠️ A chave e o token do Trello moram SÓ aqui (Secrets `TRELLO_KEY` e
// `TRELLO_TOKEN`). O navegador nunca os vê.
// ⚠️ Os destinos são FIXOS: `trello.com/1/cards/<id>/attachments/<id>/download`
// e `api.trello.com/1/boards/<id>/actions`. Sem URL livre — senão a função
// viraria um proxy que bate em qualquer servidor levando o token junto.
//
// Ações (POST JSON):
//   { acao: "anexo", attachment_id }        copia UM arquivo para `mkt-anexos`
//   { acao: "comentarios", quadro, antes? } até 1.000 comentários do quadro,
//                                           do mais novo para o mais velho
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "mkt-anexos";
// O Storage exige pedaço de EXATAMENTE 6 MB no upload em partes (menos o
// último). É o que deixa um arquivo de 243 MB passar sem caber na memória.
const PEDACO = 6 * 1024 * 1024;

function origemPermitida(origin: string): boolean {
  if (origin.startsWith("http://localhost:")) return true;
  try {
    const { protocol, hostname } = new URL(origin);
    return protocol === "https:" && (hostname === "carbohub.com.br" || hostname.endsWith(".carbohub.com.br"));
  } catch {
    return false;
  }
}

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": origemPermitida(origin) ? origin : "https://mkt.carbohub.com.br",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

const ANEXO_TRELLO = /^https:\/\/trello\.com\/1\/cards\/([0-9a-f]{24})\/attachments\/([0-9a-f]{24})\/download\/(.+)$/;

function nomeSeguro(s: string): string {
  let n = s;
  try { n = decodeURIComponent(s); } catch { /* fica como veio */ }
  n = n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return (n || "arquivo").slice(-120);
}

function b64(s: string) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s)));
}

// Upload em partes (TUS) — lê do Trello e grava no Storage de 6 em 6 MB.
async function enviarEmPartes(corpo: ReadableStream<Uint8Array>, tamanho: number, caminho: string, tipo: string) {
  const ini = await fetch(`${SUPABASE_URL}/storage/v1/upload/resumable`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${SERVICE_ROLE}`,
      "tus-resumable": "1.0.0",
      "upload-length": String(tamanho),
      "x-upsert": "true",
      "upload-metadata": [
        `bucketName ${b64(BUCKET)}`,
        `objectName ${b64(caminho)}`,
        `contentType ${b64(tipo)}`,
        `cacheControl ${b64("3600")}`,
      ].join(","),
    },
  });
  if (ini.status !== 201) throw new Error(`Storage recusou o início (${ini.status}): ${(await ini.text()).slice(0, 300)}`);
  let destino = ini.headers.get("location") ?? "";
  if (!destino) throw new Error("Storage não devolveu o endereço do upload");
  if (destino.startsWith("/")) destino = new URL(destino, SUPABASE_URL).toString();

  const leitor = corpo.getReader();
  let buf = new Uint8Array(PEDACO);
  let cheio = 0;
  let enviado = 0;

  const mandar = async (parte: Uint8Array) => {
    const r = await fetch(destino, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${SERVICE_ROLE}`,
        "tus-resumable": "1.0.0",
        "upload-offset": String(enviado),
        "content-type": "application/offset+octet-stream",
      },
      body: parte,
    });
    if (r.status !== 204) throw new Error(`Storage recusou a parte em ${enviado} (${r.status}): ${(await r.text()).slice(0, 300)}`);
    enviado += parte.byteLength;
  };

  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    let i = 0;
    while (i < value.byteLength) {
      const n = Math.min(PEDACO - cheio, value.byteLength - i);
      buf.set(value.subarray(i, i + n), cheio);
      cheio += n; i += n;
      if (cheio === PEDACO) { await mandar(buf); buf = new Uint8Array(PEDACO); cheio = 0; }
    }
  }
  if (cheio > 0) await mandar(buf.subarray(0, cheio));
  if (enviado !== tamanho) throw new Error(`Tamanho não bateu: Trello disse ${tamanho}, chegaram ${enviado}`);
  return enviado;
}

Deno.serve(async (req) => {
  const h = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: h });
  const json = (status: number, obj: unknown) =>
    new Response(JSON.stringify(obj), { status, headers: { ...h, "content-type": "application/json" } });
  // ⚠️ Exceção que escapa vira 500 do runtime SEM os cabeçalhos de CORS, e o
  // navegador só diz "Failed to send a request" — o erro real some. Todo
  // caminho devolve JSON com CORS, inclusive o inesperado.
  try {
    return await atender(req, json);
  } catch (e) {
    return json(500, { ok: false, erro: `Falha inesperada: ${e instanceof Error ? e.message : String(e)}` });
  }
});

async function atender(req: Request, json: (status: number, obj: unknown) => Response): Promise<Response> {

  const KEY = Deno.env.get("TRELLO_KEY");
  const TOKEN = Deno.env.get("TRELLO_TOKEN");
  if (!KEY || !TOKEN) return json(500, { ok: false, erro: "TRELLO_KEY / TRELLO_TOKEN ausentes em Supabase → Edge Functions → Secrets" });

  // Quem chama: gente logada E do time interno.
  // O JWT de QUEM CHAMA vai no Authorization, então `auth.uid()` é dele — a
  // chave aqui só abre a porta do PostgREST (as outras funções do projeto não
  // dependem de SUPABASE_ANON_KEY, e esta também não).
  const jwt = req.headers.get("authorization") ?? "";
  if (!/^Bearer\s+\S+/i.test(jwt)) return json(401, { ok: false, erro: "Sem sessão" });
  const usuario = createClient(SUPABASE_URL, SERVICE_ROLE, {
    global: { headers: { Authorization: jwt } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: interno, error: eInterno } = await usuario.rpc("carbo_e_time_interno");
  if (eInterno) return json(401, { ok: false, erro: `Não deu para conferir o acesso: ${eInterno.message}` });
  if (interno !== true) return json(403, { ok: false, erro: "Só o time interno usa esta função" });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { ok: false, erro: "Corpo não é JSON" }); }
  const autTrello = `OAuth oauth_consumer_key="${KEY}", oauth_token="${TOKEN}"`;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // ── Comentários ───────────────────────────────────────────────────────────
  if (body.acao === "comentarios") {
    const quadro = String(body.quadro ?? "");
    if (!/^[A-Za-z0-9]{8,24}$/.test(quadro)) return json(400, { ok: false, erro: "Quadro do Trello inválido" });
    const antes = body.antes ? String(body.antes) : "";
    if (antes && !/^[0-9a-f]{24}$/.test(antes)) return json(400, { ok: false, erro: "Cursor inválido" });
    const url = `https://api.trello.com/1/boards/${quadro}/actions?filter=commentCard&limit=1000` +
      `&fields=id,date,data,idMemberCreator&memberCreator_fields=fullName,username` + (antes ? `&before=${antes}` : "");
    const r = await fetch(url, { headers: { authorization: autTrello, accept: "application/json" } });
    if (!r.ok) return json(502, { ok: false, erro: `Trello respondeu ${r.status}: ${(await r.text()).slice(0, 300)}` });
    const acoes = await r.json() as Record<string, any>[];
    const comentarios = acoes.map((a) => ({
      id: a.id, data: a.date, cartao: a.data?.card?.id ?? null, cartaoNome: a.data?.card?.name ?? null,
      texto: a.data?.text ?? "", membro: a.idMemberCreator ?? null,
      membroNome: a.memberCreator?.fullName ?? null, membroUsuario: a.memberCreator?.username ?? null,
    }));
    return json(200, { ok: true, comentarios, fim: acoes.length < 1000 });
  }

  // ── Um arquivo ────────────────────────────────────────────────────────────
  if (body.acao === "anexo") {
    const id = String(body.attachment_id ?? "");
    if (!/^[0-9a-f-]{36}$/.test(id)) return json(400, { ok: false, erro: "attachment_id inválido" });
    const { data: a, error } = await admin.from("mkt_card_attachments")
      .select("id, card_id, kind, external_url, mime_type, storage_path").eq("id", id).maybeSingle();
    if (error) return json(500, { ok: false, erro: error.message });
    if (!a) return json(404, { ok: false, erro: "Anexo não existe" });
    if (a.kind === "arquivo" && a.storage_path) return json(200, { ok: true, jaEstava: true, caminho: a.storage_path });
    const m = ANEXO_TRELLO.exec(a.external_url ?? "");
    if (!m) return json(400, { ok: false, erro: "Este anexo não é um arquivo enviado ao Trello" });

    const r = await fetch(a.external_url, { headers: { authorization: autTrello }, redirect: "follow" });
    if (!r.ok || !r.body) return json(502, { ok: false, erro: `Trello respondeu ${r.status} ao baixar` });
    const tamanho = Number(r.headers.get("content-length") ?? "");
    const tipo = a.mime_type || r.headers.get("content-type") || "application/octet-stream";
    const caminho = `trello/${a.card_id}/${m[2]}-${nomeSeguro(m[3])}`;

    try {
      let bytes: number;
      if (Number.isFinite(tamanho) && tamanho > 0) {
        bytes = await enviarEmPartes(r.body, tamanho, caminho, tipo);
      } else {
        // Sem tamanho anunciado não dá para o upload em partes; só arquivo
        // pequeno chega assim, então cabe na memória.
        const dados = new Uint8Array(await r.arrayBuffer());
        const { error: eUp } = await admin.storage.from(BUCKET).upload(caminho, dados, { contentType: tipo, upsert: true });
        if (eUp) throw new Error(eUp.message);
        bytes = dados.byteLength;
      }
      // ⚠️ Só marca DEPOIS de o arquivo estar lá: marcar antes deixaria um
      // anexo que não abre, e ele sairia da lista de pendentes para sempre.
      const { error: eUpd } = await admin.from("mkt_card_attachments")
        .update({ kind: "arquivo", storage_path: caminho, mime_type: tipo }).eq("id", id);
      if (eUpd) throw new Error(`Arquivo copiado, mas a linha não foi marcada: ${eUpd.message}`);
      return json(200, { ok: true, bytes, caminho });
    } catch (e) {
      return json(500, { ok: false, erro: String(e instanceof Error ? e.message : e) });
    }
  }

  return json(400, { ok: false, erro: "acao desconhecida" });
}
