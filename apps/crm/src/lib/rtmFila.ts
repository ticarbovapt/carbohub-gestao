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
  /** Quando a última tentativa falhou — é daqui que sai o recuo progressivo.
   *  Sem isso, uma visita recusada em definitivo bate na API a cada 45 s para
   *  sempre, gastando bateria e franquia de quem está na estrada. */
  ultimo_erro_em?: string;
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
/**
 * Preenche a coordenada do check-in DEPOIS que ela chega.
 *
 * ⚠️ O check-in não espera o GPS — eram até 8 s de espera na porta do posto,
 * debaixo da cobertura de bomba, que é exatamente onde ele demora o máximo.
 * A pessoa via um spinner e tocava de novo, gerando dois check-ins.
 *
 * ⚠️ ANTES ESTA FUNÇÃO JOGAVA A COORDENADA FORA quando a visita já tinha subido
 * (`if (v.visita_id) return`), com a justificativa de que "o gatilho de
 * distância já disparou". A justificativa estava errada: o
 * `trg_rtm_distancia` é `before insert OR UPDATE OF checkin_lat, checkin_lng`
 * — atualizar depois recalcula a distância corretamente.
 *
 * O custo do engano foi medido: de 6 visitas registradas, 5 ficaram SEM
 * coordenada, e a única que tinha era justamente a que ficou aberta e nunca
 * subiu. Era uma corrida entre o GPS e a sincronização, e o GPS perdia quase
 * sempre — sem erro, sem log, sem sintoma na tela.
 *
 * Agora, quando a visita já subiu, a coordenada vai para o servidor por UPDATE.
 * Duas condições, e nenhuma é enfeite:
 *   · `.is("checkin_lat", null)` — nunca sobrescreve coordenada já gravada;
 *   · `.is("ts_checkout", null)` — visita FECHADA é imutável, e `checkin_lat`
 *     está na lista do gatilho de congelamento. Tentar ali daria erro a cada
 *     rodada da fila, para sempre. Correção de visita fechada é linha nova com
 *     `ajuste_de_id`, não UPDATE.
 */
export async function rtmCompletarLocal(clientUuid: string, geo: RtmGeo): Promise<void> {
  const v = await rtmLer(clientUuid);
  if (!v) return;
  if (v.geo_checkin?.lat != null) return;   // já temos, de qualquer origem

  v.geo_checkin = geo;
  await gravar(v);

  if (!v.visita_id || geo.lat == null) return;

  // Já está no servidor: manda a coordenada para lá também. Falha aqui é
  // silenciosa de propósito — é um complemento oportunista, e o vendedor não
  // pode ser interrompido por causa dele. O registro local já guardou.
  const { error } = await db.from("rtm_visitas")
    .update({
      checkin_lat: geo.lat, checkin_lng: geo.lng,
      checkin_precisao_m: geo.precisao_m ?? null,
    })
    .eq("id", v.visita_id)
    .is("checkin_lat", null)
    .is("ts_checkout", null);
  if (error) console.warn("[rtm] coordenada tardia não subiu:", error.message);
}

/** Quando a última sincronização deu certo.
 *
 *  ⚠️ `navigator.onLine` mente dentro do posto: ele diz que a INTERFACE está
 *  conectada, não que a internet responde. Um carimbo de sucesso real é o que
 *  deixa a tela dizer "sem enviar há 22 min" em vez de um "online" que não
 *  significa nada. */
const CHAVE_SUCESSO = "rtm:ultimo_sucesso";
function marcarSucesso() {
  try { localStorage.setItem(CHAVE_SUCESSO, new Date().toISOString()); } catch { /* modo privado */ }
}
export function rtmUltimoSucesso(): string | null {
  try { return localStorage.getItem(CHAVE_SUCESSO); } catch { return null; }
}

export async function rtmSincronizar(): Promise<void> {
  if (rodando) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  rodando = true;
  try {
    // ⚠️ ORDEM CRONOLÓGICA, não a do `getAll()`.
    //
    // A chave do IndexedDB é o `client_uuid`, que é aleatório — então a ordem de
    // envio era SORTEADA. Numa manhã sem sinal com três PDVs, se a terceira
    // visita subisse primeiro, o `rtm_abrir_visita` bateria na trava de "visita
    // em aberto" e ela iria para erro, tentando de novo a cada 45 s até que as
    // anteriores passassem. O servidor está certo; era a fila que embaralhava.
    const todas = (await rtmLerTodas()).sort(
      (a, b) => (a.ts_dispositivo_checkin ?? "").localeCompare(b.ts_dispositivo_checkin ?? ""));

    for (const v of todas) {
      if (v.estado === "pronta") continue;

      // ⚠️ Recuo progressivo. `tentativas` era incrementado e nunca lido: uma
      // visita recusada em definitivo batia na API a cada 45 s para sempre,
      // gastando bateria e franquia de quem está na estrada.
      if (v.estado === "erro" && v.tentativas > 0 && v.ultimo_erro_em) {
        const espera = Math.min(45_000 * 2 ** Math.min(v.tentativas, 5), 15 * 60_000);
        if (Date.now() - new Date(v.ultimo_erro_em).getTime() < espera) continue;
      }

      try {
        await sincronizarUma(v);
        marcarSucesso();
      } catch (e) {
        v.estado = "erro";
        v.tentativas += 1;
        v.erro = (e as { message?: string })?.message ?? "falha ao sincronizar";
        v.ultimo_erro_em = new Date().toISOString();
        await gravar(v);

        // ⚠️ Trava de visita aberta PARA o laço: as seguintes vão falhar pelo
        // mesmo motivo, e insistir só queima rede em pé, no meio da rua.
        if (/visita em aberto/i.test(v.erro)) break;
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

  // ⚠️ Pede armazenamento PERSISTENTE. Doze visitas com foto são dezenas de MB
  // no IndexedDB, e sem isto o navegador pode despejar tudo sob pressão de
  // espaço — o dia inteiro de trabalho some sem erro nenhum. É uma chamada.
  void navigator.storage?.persist?.().catch(() => { /* navegador sem suporte */ });

  void rtmSincronizar();
  instalarConsole();
}

/**
 * `__rtmFila` no console — ver e limpar o que está guardado no aparelho.
 *
 * ⚠️ Existe porque a fila é offline-first e o aparelho VENCE o banco: se
 * alguém apagar visitas no servidor enquanto um celular ainda tem a visita na
 * fila, a sincronização (a cada 45 s) tenta reenviá-la. E como ela carrega o
 * `visita_planejada_id` de um agendamento que não existe mais, a FK recusa e a
 * visita fica presa em erro, a cada 45 segundos, sem ninguém saber por quê.
 *
 * Sem uma forma de limpar o aparelho, a única saída seria ensinar alguém a
 * abrir o DevTools e apagar o IndexedDB à mão. Mesmo padrão do `__somVenda`,
 * que existe pelo mesmo motivo: falha silenciosa precisa de uma alavanca.
 */
function instalarConsole() {
  (window as unknown as Record<string, unknown>).__rtmFila = {
    async estado() {
      const todas = await rtmLerTodas();
      console.table(todas.map((v) => ({
        pdv: v.pdv_nome, estado: v.estado, visita_id: v.visita_id ?? "—",
        fotos: v.fotos?.length ?? 0, erro: v.erro ?? "", atualizado: v.atualizado_em,
      })));
      return { total: todas.length, ultimo_sucesso: rtmUltimoSucesso() };
    },
    /**
     * Apaga a fila LOCAL. Não toca no servidor — o que já subiu continua lá.
     *
     * ⚠️ RECUSA quando há visita que nunca subiu. Essa visita só existe neste
     * aparelho: apagá-la é a única forma de perder de verdade o registro de
     * alguém que esteve no PDV. Quem quiser mesmo usa `forcar()`.
     */
    async limpar() {
      const todas = await rtmLerTodas();
      const naoSubiram = todas.filter((v) => !v.visita_id).length;
      if (naoSubiram > 0) {
        console.warn(
          `[rtm] ${naoSubiram} visita(s) NUNCA subiram para o servidor. ` +
          "Apagar aqui perde o registro delas. Use __rtmFila.forcar() se for isso mesmo.",
        );
        return { apagadas: 0, nao_subiram: naoSubiram };
      }
      for (const v of todas) await rtmApagar(v.client_uuid);
      avisar();
      return { apagadas: todas.length };
    },
    async forcar() {
      const todas = await rtmLerTodas();
      for (const v of todas) await rtmApagar(v.client_uuid);
      avisar();
      return { apagadas: todas.length };
    },
  };
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
