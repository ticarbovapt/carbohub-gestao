// ─────────────────────────────────────────────────────────────────────────────
// RTM — a fila local da visita
//
// ⚠️ Este arquivo existe porque o interior da Bahia e de Pernambuco tem trecho
// sem sinal, e o briefing é explícito: offline não é feature opcional. A
// alternativa (gravar direto no Supabase) parece mais simples e é uma armadilha
// — o vendedor perde a visita justamente onde ela é mais difícil de fazer, e
// descobre isso depois de já ter saído do PDV.
//
// ── O desenho, em uma frase ───────────────────────────────────────────────
//
// O IndexedDB é a fonte da verdade enquanto a visita está em andamento; o
// Supabase é o destino. A tela NUNCA espera a rede para deixar o vendedor
// seguir.
//
// ── Uma linha por VISITA, não uma por operação ────────────────────────────
//
// A tentação é enfileirar cada ação (abrir, responder, fotografar, fechar) como
// item independente. Não funciona: fechar exige que a foto e o checklist já
// estejam no servidor (quem valida é o `rtm_fechar_visita`), e a foto exige o
// id da visita, que só existe depois do abrir. São passos ENCADEADOS.
//
// Então a fila guarda a visita inteira — respostas e fotos incluídas — e a
// sincronização roda o encadeamento completo:
//
//   abrir → fotos + checklist + SKUs → fechar
//
// ── Todo passo é idempotente, e isso não é luxo ───────────────────────────
//
// Numa rede ruim o caso comum não é "falhou", é "funcionou e a resposta se
// perdeu". Reenviar precisa ser inofensivo:
//
//   · abrir     — `rtm_abrir_visita` acha pelo `client_uuid` e devolve o que existe
//   · fotos     — caminho determinístico + upsert: reenviar sobrescreve o mesmo objeto
//   · checklist — upsert por (visita, item)
//   · fechar    — visita já fechada devolve o registro em vez de erro
//
// ⚠️ E o primeiro passo é o que decide se há trabalho: `abrir` devolve a visita
// com o `ts_checkout` preenchido quando ela JÁ foi fechada numa tentativa
// anterior. Nesse caso a sincronização termina ali. Sem essa checagem o retry
// tentaria regravar a conferência de uma visita fechada e bateria no trigger de
// congelamento — falhando para sempre, em silêncio, com a visita já salva.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";

const DB_NOME = "carbo-rtm";
const DB_VERSAO = 1;
const STORE = "visitas";

export type RtmResultado = "pedido" | "sem_pedido" | "pdv_fechado" | "nao_atendido";
export type RtmSituacaoSku = "tem" | "zerado" | "nao_trabalha";
export type RtmTipoFoto = "expositor" | "fachada" | "gondola" | "material" | "outro";

export interface RtmGeo {
  lat: number | null;
  lng: number | null;
  precisao_m: number | null;
}

export interface RtmFotoLocal {
  /** Gerado no aparelho. Vira o nome do arquivo, e é o que torna o reenvio
   *  idempotente: mesma foto, mesmo caminho, mesmo objeto sobrescrito. */
  id: string;
  tipo: RtmTipoFoto;
  blob: Blob;
  ts_dispositivo: string;
  lat: number | null;
  lng: number | null;
  legenda?: string | null;
}

export interface RtmVisitaLocal {
  client_uuid: string;
  /** Preenchido pela sincronização quando o servidor cria (ou reconhece) a
   *  visita. Enquanto for nulo, nada além do `abrir` pode ser tentado. */
  visita_id: string | null;
  vendedor_id: string;

  pdv_id: string;
  pdv_nome: string;
  visita_planejada_id: string | null;
  tipo: "roteiro" | "fora_roteiro" | "prospeccao";

  ts_dispositivo_checkin: string;
  geo_checkin: RtmGeo;

  respostas: Record<string, { resposta?: "sim" | "nao" | "na"; numero?: number; texto?: string }>;
  skus: Record<string, { situacao: RtmSituacaoSku; preco?: number | null }>;
  fotos: RtmFotoLocal[];

  /** Só existe depois que o vendedor conclui a visita na tela. Enquanto for
   *  nulo, a visita está em andamento e a fila só sincroniza o check-in. */
  fechamento: {
    resultado: RtmResultado;
    motivo_id: string | null;
    motivo_texto: string | null;
    proximo_passo: string | null;
    proximo_passo_em: string | null;
    ts_dispositivo: string;
    geo: RtmGeo;
  } | null;

  /** 'pronta' = tudo no servidor. A linha fica no IndexedDB mais um pouco
   *  para a tela poder mostrar "sincronizada" antes de sumir. */
  estado: "rascunho" | "enviando" | "pronta" | "erro";
  erro: string | null;
  tentativas: number;
  atualizado_em: string;
}

// ── IndexedDB, o mínimo ──────────────────────────────────────────────────────

function abrirDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOME, DB_VERSAO);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "client_uuid" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return abrirDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, modo);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

export const rtmLerTodas = () => tx<RtmVisitaLocal[]>("readonly", (s) => s.getAll());
export const rtmLer = (id: string) => tx<RtmVisitaLocal | undefined>("readonly", (s) => s.get(id));
export const rtmApagar = (id: string) => tx<undefined>("readwrite", (s) => s.delete(id) as IDBRequest<undefined>);

async function gravar(v: RtmVisitaLocal) {
  v.atualizado_em = new Date().toISOString();
  await tx("readwrite", (s) => s.put(v));
  avisar();
  return v;
}

// A tela precisa saber quando a fila mexeu — inclusive quando quem mexeu foi a
// sincronização, que roda fora de qualquer clique.
type Ouvinte = () => void;
const ouvintes = new Set<Ouvinte>();
export function rtmObservar(fn: Ouvinte) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}
const avisar = () => ouvintes.forEach((f) => { try { f(); } catch { /* ouvinte quebrado não derruba a fila */ } });

// ── Operações locais (nunca tocam a rede) ────────────────────────────────────

export async function rtmAbrirLocal(dados: {
  vendedor_id: string;
  pdv_id: string;
  pdv_nome: string;
  visita_planejada_id?: string | null;
  tipo?: RtmVisitaLocal["tipo"];
  geo: RtmGeo;
}): Promise<RtmVisitaLocal> {
  const v: RtmVisitaLocal = {
    client_uuid: crypto.randomUUID(),
    visita_id: null,
    vendedor_id: dados.vendedor_id,
    pdv_id: dados.pdv_id,
    pdv_nome: dados.pdv_nome,
    visita_planejada_id: dados.visita_planejada_id ?? null,
    tipo: dados.tipo ?? "roteiro",
    ts_dispositivo_checkin: new Date().toISOString(),
    geo_checkin: dados.geo,
    respostas: {},
    skus: {},
    fotos: [],
    fechamento: null,
    estado: "rascunho",
    erro: null,
    tentativas: 0,
    atualizado_em: new Date().toISOString(),
  };
  await gravar(v);
  void rtmSincronizar();          // tenta já; se não houver rede, fica na fila
  return v;
}

export async function rtmResponder(
  client_uuid: string,
  item_id: string,
  valor: { resposta?: "sim" | "nao" | "na"; numero?: number; texto?: string },
) {
  const v = await rtmLer(client_uuid);
  if (!v) return;
  v.respostas[item_id] = valor;
  await gravar(v);
}

export async function rtmMarcarSku(
  client_uuid: string,
  produto: string,
  situacao: RtmSituacaoSku,
  preco?: number | null,
) {
  const v = await rtmLer(client_uuid);
  if (!v) return;
  v.skus[produto] = { situacao, preco: preco ?? null };
  await gravar(v);
}

export async function rtmAdicionarFoto(client_uuid: string, foto: Omit<RtmFotoLocal, "id">) {
  const v = await rtmLer(client_uuid);
  if (!v) return;
  v.fotos.push({ ...foto, id: crypto.randomUUID() });
  await gravar(v);
}

export async function rtmRemoverFoto(client_uuid: string, foto_id: string) {
  const v = await rtmLer(client_uuid);
  if (!v) return;
  v.fotos = v.fotos.filter((f) => f.id !== foto_id);
  await gravar(v);
}

export async function rtmFecharLocal(
  client_uuid: string,
  fechamento: NonNullable<RtmVisitaLocal["fechamento"]>,
) {
  const v = await rtmLer(client_uuid);
  if (!v) return;
  v.fechamento = fechamento;
  v.erro = null;
  await gravar(v);
  void rtmSincronizar();
}

// ── Sincronização ────────────────────────────────────────────────────────────

const db = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
  from: (t: string) => any;
  storage: { from: (b: string) => any };
};

let rodando = false;

/** Roda o encadeamento completo de todas as visitas pendentes. Seguro chamar a
 *  qualquer momento e de qualquer lugar: reentrância é barrada, e cada passo é
 *  idempotente. */
export async function rtmSincronizar(): Promise<void> {
  if (rodando) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  rodando = true;
  try {
    const todas = await rtmLerTodas();
    for (const v of todas) {
      if (v.estado === "pronta") continue;
      try {
        await sincronizarUma(v);
      } catch (e) {
        v.estado = "erro";
        v.tentativas += 1;
        v.erro = (e as { message?: string })?.message ?? "falha ao sincronizar";
        await gravar(v);
      }
    }
  } finally {
    rodando = false;
  }
}

async function sincronizarUma(v: RtmVisitaLocal) {
  v.estado = "enviando";
  v.erro = null;
  await gravar(v);

  // ── 1. Abrir ──────────────────────────────────────────────────────────────
  const { data: visita, error: erroAbrir } = await db.rpc("rtm_abrir_visita", {
    p_client_uuid: v.client_uuid,
    p_pdv_id: v.pdv_id,
    p_tipo: v.tipo,
    p_visita_planejada_id: v.visita_planejada_id,
    p_lat: v.geo_checkin.lat,
    p_lng: v.geo_checkin.lng,
    p_precisao_m: v.geo_checkin.precisao_m,
    p_ts_dispositivo: v.ts_dispositivo_checkin,
    p_offline: true,
  });
  if (erroAbrir) throw erroAbrir;

  const linha = Array.isArray(visita) ? visita[0] : visita;
  v.visita_id = linha?.id ?? null;
  if (!v.visita_id) throw new Error("servidor não devolveu o id da visita");

  // ⚠️ Já fechada numa tentativa anterior: parar AQUI. Seguir adiante tentaria
  // regravar a conferência de uma visita congelada e falharia para sempre.
  if (linha?.ts_checkout) {
    v.estado = "pronta";
    await gravar(v);
    return;
  }

  // Em andamento (o vendedor ainda não concluiu): o check-in já está no
  // servidor, que é o que o gestor precisa ver. O resto vai no fechamento.
  if (!v.fechamento) {
    v.estado = "rascunho";
    await gravar(v);
    return;
  }

  // ── 2. Fotos ──────────────────────────────────────────────────────────────
  for (const f of v.fotos) {
    const caminho = `${v.vendedor_id}/${v.visita_id}/${f.id}.jpg`;
    const { error: erroUp } = await db.storage.from("rtm-visitas").upload(caminho, f.blob, {
      contentType: f.blob.type || "image/jpeg",
      upsert: true,                          // reenvio sobrescreve o mesmo objeto
    });
    if (erroUp) throw erroUp;

    const { error: erroLinha } = await db.from("rtm_visita_fotos").upsert(
      {
        visita_id: v.visita_id,
        tipo: f.tipo,
        storage_path: caminho,
        ts_dispositivo: f.ts_dispositivo,
        lat: f.lat,
        lng: f.lng,
        bytes: f.blob.size,
        legenda: f.legenda ?? null,
      },
      { onConflict: "storage_path" },
    );
    if (erroLinha) throw erroLinha;
  }

  // ── 3. Conferência ────────────────────────────────────────────────────────
  const respostas = Object.entries(v.respostas).map(([item_id, r]) => ({
    visita_id: v.visita_id,
    item_id,
    resposta: r.resposta ?? null,
    numero: r.numero ?? null,
    texto: r.texto ?? null,
  }));
  if (respostas.length) {
    const { error } = await db
      .from("rtm_visita_checklist")
      .upsert(respostas, { onConflict: "visita_id,item_id" });
    if (error) throw error;
  }

  const skus = Object.entries(v.skus).map(([produto, s]) => ({
    visita_id: v.visita_id,
    produto,
    situacao: s.situacao,
    preco_encontrado: s.preco ?? null,
  }));
  if (skus.length) {
    const { error } = await db
      .from("rtm_visita_sku")
      .upsert(skus, { onConflict: "visita_id,produto" });
    if (error) throw error;
  }

  // ── 4. Fechar ─────────────────────────────────────────────────────────────
  const f = v.fechamento;
  const { error: erroFechar } = await db.rpc("rtm_fechar_visita", {
    p_visita_id: v.visita_id,
    p_resultado: f.resultado,
    p_motivo_id: f.motivo_id,
    p_motivo_texto: f.motivo_texto,
    p_proximo_passo: f.proximo_passo,
    p_proximo_passo_em: f.proximo_passo_em,
    p_lat: f.geo.lat,
    p_lng: f.geo.lng,
    p_precisao_m: f.geo.precisao_m,
    p_ts_dispositivo: f.ts_dispositivo,
  });
  if (erroFechar) throw erroFechar;

  v.estado = "pronta";
  v.erro = null;
  await gravar(v);
}

// ── Gatilhos da sincronização ────────────────────────────────────────────────
//
// ⚠️ `online` não basta. O evento dispara quando a interface de rede volta, que
// não é o mesmo que ter internet: dentro do posto o celular fica "conectado" a
// uma rede que não sai. Por isso há também o intervalo — barato, porque sem
// nada na fila a função retorna na primeira linha.

let instalado = false;
export function rtmIniciarSincronizacao() {
  if (instalado || typeof window === "undefined") return;
  instalado = true;
  window.addEventListener("online", () => void rtmSincronizar());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void rtmSincronizar();
  });
  window.setInterval(() => void rtmSincronizar(), 45_000);
  void rtmSincronizar();
}

/** Limpa as visitas já sincronizadas há mais de um dia. As fotos são o peso
 *  real (megabytes por visita) e o armazenamento do celular é finito — mas
 *  apagar cedo demais tiraria da tela a prova de que a visita subiu. */
export async function rtmLimparAntigas(horas = 24) {
  const limite = Date.now() - horas * 3600_000;
  for (const v of await rtmLerTodas()) {
    if (v.estado === "pronta" && new Date(v.atualizado_em).getTime() < limite) {
      await rtmApagar(v.client_uuid);
    }
  }
  avisar();
}
