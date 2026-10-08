// ─────────────────────────────────────────────────────────────────────────────
// Importação de um quadro do Trello (o JSON de "Imprimir, exportar e
// compartilhar → Exportar como JSON") para os Quadros do Marketing.
//
// PURO: recebe o JSON e o contexto e devolve as LINHAS de cada tabela, já com
// os ids gerados aqui. Quem grava é o `ImportarTrello.tsx`, na ordem das
// chaves estrangeiras. Separado assim para dar para conferir o resumo ANTES de
// gravar qualquer coisa.
//
// ⚠️ Decisões que custam caro se forem desfeitas sem entender:
//   1. NADA é descartado por estar arquivado. Lista e cartão arquivados no
//      Trello entram arquivados aqui (`is_archived`), e o histórico continua
//      existindo. O objetivo pedido foi "não perder os dados".
//   2. Pessoa do Trello vira pessoa daqui só com casamento ÚNICO pelo primeiro
//      nome. Dois candidatos = nenhum: atribuir cartão à pessoa errada é pior
//      que deixar sem responsável, e o resumo diz quem não casou.
//   3. Comentário de quem não casou entra com o autor ESCRITO no texto, em nome
//      de quem importou — o conteúdo nunca é descartado por falta de dono.
//   4. ⚠️ Anexo ENVIADO ao Trello (`isUpload`) vira LINK para o Trello, que só
//      abre com login lá e morre junto com o quadro de lá. O arquivo em si não
//      atravessa: baixá-lo exige a chave de API do Trello. O resumo CONTA esses
//      anexos para ninguém apagar o Trello achando que trouxe tudo.
//   5. ⚠️ O export do Trello traz só as ÚLTIMAS 1.000 ações, e é de lá que vêm
//      os comentários. Comentário mais antigo que a ação mais antiga do arquivo
//      não existe no JSON — o resumo diz a data de corte.
// ─────────────────────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
type J = any;

export interface PessoaDaqui { id: string; full_name: string | null; doTime?: boolean }

export interface Importacao {
  board: Record<string, unknown>;
  lists: Record<string, unknown>[];
  labels: Record<string, unknown>[];
  cards: Record<string, unknown>[];
  cardLabels: Record<string, unknown>[];
  cardMembers: Record<string, unknown>[];
  checklists: Record<string, unknown>[];
  checklistItems: Record<string, unknown>[];
  attachments: Record<string, unknown>[];
  comments: Record<string, unknown>[];
  fields: Record<string, unknown>[];
  fieldValues: Record<string, unknown>[];
  resumo: {
    titulo: string;
    listasAtivas: number; listasArquivadas: number;
    cartoesVisiveis: number; cartoesArquivados: number;
    checklists: number; itens: number;
    etiquetas: number; campos: number;
    anexosLink: number; anexosNoTrello: number; anexosNoTrelloMB: number;
    comentarios: number; comentariosDesde: string | null;
    pessoas: { idTrello: string; trello: string; casou: string | null; casouId: string | null }[];
  };
}

const uuid = () => crypto.randomUUID();

// Paleta deste app (mktTheme: LABEL_COLORS / LIST_DOT). Cor do Trello que não
// existe aqui vira a mais próxima; nunca uma string que a tela não sabe pintar.
const COR_ETIQUETA = new Set(["green", "yellow", "orange", "red", "purple", "blue", "sky", "lime", "pink", "black"]);
function corEtiqueta(c: string | null | undefined): string {
  const base = (c ?? "").split("_")[0];
  if (COR_ETIQUETA.has(base)) return base;
  if (base === "gray" || base === "grey") return "black";
  return "black";
}
const COR_LISTA = new Set(["blue", "green", "orange", "red", "purple", "pink", "sky", "gray", "lime", "dark"]);
function corLista(c: string | null | undefined): string | null {
  if (!c) return null;
  const base = c.split("_")[0];
  if (COR_LISTA.has(base)) return base;
  if (base === "yellow") return "orange";
  if (base === "black") return "dark";
  if (base === "grey") return "gray";
  return null;
}

// O id do Trello carrega o instante de criação nos 8 primeiros hex (segundos).
function criadoEm(idTrello: string): string | null {
  const s = parseInt(String(idTrello).slice(0, 8), 16);
  return Number.isFinite(s) && s > 0 ? new Date(s * 1000).toISOString() : null;
}

export function montarImportacao(t: J, ctx: { userId: string; workspaceId: string | null; pessoas: PessoaDaqui[]; escolhidos?: Record<string, string | null> }): Importacao {
  if (!t || !Array.isArray(t.lists) || !Array.isArray(t.cards)) {
    throw new Error("Este arquivo não é um export de quadro do Trello (faltam listas e cartões).");
  }

  // Pessoas: casamento ÚNICO. Primeiro nome; com empate, desempata por
  // sobrenome, depois pelo USUÁRIO do Trello ("mirianguedesb" contém
  // "mirianguedes"), depois por ser do time de quem importa. Sobrando dois,
  // não escolhe — atribuir à pessoa errada é pior que deixar sem.
  // ⚠️ A lista é a do time INTERNO inteiro, não só o departamento de quem
  // importa: com só o departamento, a Mirian (Marketing) não casava quando
  // quem importava era do TI, e os comentários dela saíram em nome de outro.
  const tokens = (s: string | null | undefined) =>
    (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/[|].*$/, "").replace(/[^a-z\s]/g, " ").trim().split(/\s+/).filter(Boolean);
  const membro = new Map<string, string>(); // id Trello → profile id
  const pessoas: Importacao["resumo"]["pessoas"] = [];
  for (const m of t.members ?? []) {
    const tt = tokens(m.fullName);
    const usuario = String(m.username ?? "").toLowerCase().replace(/[^a-z]/g, "");
    let cands = ctx.pessoas.filter((p) => tt[0] && tokens(p.full_name)[0] === tt[0]);
    const estreitar = (f: (p: PessoaDaqui) => boolean) => { const x = cands.filter(f); if (x.length > 0) cands = x; };
    if (cands.length > 1 && tt.length > 1) estreitar((p) => tt.every((k) => tokens(p.full_name).includes(k)));
    if (cands.length > 1 && usuario) estreitar((p) => { const pt = tokens(p.full_name); return pt.length > 1 && usuario.includes(pt[0] + pt[1]); });
    if (cands.length > 1) estreitar((p) => !!p.doTime);
    // Escolha feita na tela vence o automático (inclusive "ninguém" = null).
    const escolha = ctx.escolhidos && m.id in ctx.escolhidos ? ctx.escolhidos[m.id] : undefined;
    const achou = escolha !== undefined
      ? (escolha ? ctx.pessoas.find((p) => p.id === escolha) ?? null : null)
      : (cands.length === 1 ? cands[0] : null);
    if (achou) membro.set(m.id, achou.id);
    pessoas.push({ idTrello: m.id, trello: m.fullName ?? m.username, casou: achou?.full_name ?? null, casouId: achou?.id ?? null });
  }
  const nomeTrello = new Map<string, string>((t.members ?? []).map((m: J) => [m.id, m.fullName ?? m.username]));

  // ⚠️ Toda linha leva TODAS as colunas: no insert em lote o PostgREST usa a
  // união das chaves, e coluna ausente numa linha vira NULL, não o default.
  const agora = new Date().toISOString();
  const boardId = uuid();
  const board = {
    id: boardId, title: String(t.name ?? "Quadro do Trello").slice(0, 200), background: "blue",
    workspace_id: ctx.workspaceId, created_by: ctx.userId, position: Date.now(),
  };

  const listId = new Map<string, string>();
  const lists = (t.lists as J[]).map((l) => {
    const id = uuid(); listId.set(l.id, id);
    return {
      id, board_id: boardId, title: l.name || "(sem título)", position: Number(l.pos) || 0,
      color: corLista(l.color), is_archived: !!l.closed, archived_at: l.closed ? agora : null,
      created_at: criadoEm(l.id) ?? agora,
    };
  });

  const labelId = new Map<string, string>();
  const labels = (t.labels as J[] ?? []).map((l) => {
    const id = uuid(); labelId.set(l.id, id);
    return { id, board_id: boardId, name: l.name ?? "", color: corEtiqueta(l.color) };
  });

  const cardId = new Map<string, string>();
  const cards: Record<string, unknown>[] = [];
  const cardLabels: Record<string, unknown>[] = [];
  const cardMembers: Record<string, unknown>[] = [];
  const attachments: Record<string, unknown>[] = [];
  let anexosNoTrello = 0, anexosLink = 0, bytesNoTrello = 0;
  const listaAtiva = new Set((t.lists as J[]).filter((l) => !l.closed).map((l) => l.id));
  let visiveis = 0, arquivados = 0;

  for (const c of t.cards as J[]) {
    const lid = listId.get(c.idList);
    if (!lid) continue; // cartão de lista que não veio no arquivo: não há onde pô-lo
    const id = uuid(); cardId.set(c.id, id);
    const coord = c.coordinates;
    cards.push({
      id, list_id: lid, board_id: boardId, title: c.name || "(sem título)", description: c.desc || null,
      position: Number(c.pos) || 0, start_date: c.start ?? null, due_date: c.due ?? null,
      is_complete: !!c.dueComplete, cover: c.cover?.color ? corEtiqueta(c.cover.color) : null,
      location_lat: coord?.latitude ?? null, location_lng: coord?.longitude ?? null,
      location_name: c.locationName ?? c.address ?? null,
      is_archived: !!c.closed, archived_at: c.closed ? (c.dateClosed ?? agora) : null,
      created_by: ctx.userId, created_at: criadoEm(c.id) ?? agora,
    });
    if (!c.closed && listaAtiva.has(c.idList)) visiveis++; else arquivados++;
    for (const l of c.idLabels ?? []) { const x = labelId.get(l); if (x) cardLabels.push({ card_id: id, label_id: x }); }
    // Dois ids do Trello podem casar com a MESMA pessoa daqui: dedupe pelo destino.
    for (const x of new Set((c.idMembers ?? []).map((m: string) => membro.get(m)).filter(Boolean))) cardMembers.push({ card_id: id, user_id: x });
    for (const a of c.attachments ?? []) {
      if (!a.url) continue;
      if (a.isUpload) { anexosNoTrello++; bytesNoTrello += Number(a.bytes) || 0; } else anexosLink++;
      attachments.push({
        card_id: id, kind: "link", name: (a.name || a.fileName || a.url).slice(0, 300),
        external_url: a.url, mime_type: a.mimeType || null, created_by: ctx.userId,
        created_at: a.date ?? agora,
      });
    }
  }

  const checklists: Record<string, unknown>[] = [];
  const checklistItems: Record<string, unknown>[] = [];
  let itens = 0;
  for (const k of t.checklists as J[] ?? []) {
    const cid = cardId.get(k.idCard);
    if (!cid) continue;
    const id = uuid();
    checklists.push({ id, card_id: cid, title: k.name || "Checklist", position: Number(k.pos) || 0 });
    for (const i of k.checkItems ?? []) {
      itens++;
      checklistItems.push({
        checklist_id: id, text: i.name || "(vazio)", is_done: i.state === "complete",
        position: Number(i.pos) || 0, due_date: i.due ?? null,
        assignee_id: i.idMember ? (membro.get(i.idMember) ?? null) : null,
      });
    }
  }

  // Comentários vêm das AÇÕES (só as últimas 1.000 estão no export).
  const acoes = (t.actions as J[] ?? []);
  const comentariosAcoes = acoes.filter((a) => a.type === "commentCard" && a.data?.card?.id && a.data?.text);
  const comments = comentariosAcoes.flatMap((a) => {
    const cid = cardId.get(a.data.card.id);
    if (!cid) return [];
    const autor = membro.get(a.idMemberCreator);
    const nome = a.memberCreator?.fullName ?? nomeTrello.get(a.idMemberCreator) ?? "alguém";
    return [{
      card_id: cid, user_id: autor ?? ctx.userId,
      body: autor ? a.data.text : `**${nome}** (no Trello): ${a.data.text}`,
      created_at: a.date, updated_at: a.date,
    }];
  });
  const datas = acoes.map((a) => a.date).filter(Boolean).sort();

  // Campos personalizados: lista do Trello vira "select"; a opção guarda o id.
  const TIPO: Record<string, string> = { list: "select", text: "text", number: "number", date: "date", checkbox: "checkbox" };
  const fieldId = new Map<string, { id: string; tipo: string }>();
  const fields = (t.customFields as J[] ?? []).flatMap((f, i) => {
    const tipo = TIPO[f.type];
    if (!tipo) return [];
    const id = uuid(); fieldId.set(f.id, { id, tipo });
    return [{
      id, board_id: boardId, name: f.name ?? "", type: tipo, position: Number(f.pos) || i,
      options: (f.options ?? []).map((o: J) => ({ id: o.id, label: o.value?.text ?? "", color: o.color && o.color !== "none" ? corEtiqueta(o.color) : "blue" })),
    }];
  });
  const fieldValues: Record<string, unknown>[] = [];
  for (const c of t.cards as J[]) {
    const cid = cardId.get(c.id);
    if (!cid) continue;
    for (const v of c.customFieldItems ?? []) {
      const f = fieldId.get(v.idCustomField);
      if (!f) continue;
      let value: unknown = null;
      if (f.tipo === "select") value = v.idValue ?? null;
      else if (f.tipo === "number") value = v.value?.number != null ? Number(v.value.number) : null;
      else if (f.tipo === "checkbox") value = v.value?.checked === "true";
      else if (f.tipo === "date") value = v.value?.date ? String(v.value.date).slice(0, 10) : null;
      else value = v.value?.text ?? null;
      if (value === null || value === "") continue;
      fieldValues.push({ card_id: cid, field_id: f.id, value });
    }
  }

  return {
    board, lists, labels, cards, cardLabels, cardMembers, checklists, checklistItems,
    attachments, comments, fields, fieldValues,
    resumo: {
      titulo: board.title,
      listasAtivas: lists.filter((l) => !l.is_archived).length,
      listasArquivadas: lists.filter((l) => l.is_archived).length,
      cartoesVisiveis: visiveis, cartoesArquivados: arquivados,
      checklists: checklists.length, itens,
      etiquetas: labels.length, campos: fields.length,
      anexosLink, anexosNoTrello, anexosNoTrelloMB: Math.round(bytesNoTrello / 1e6),
      comentarios: comments.length, comentariosDesde: datas[0] ?? null,
      pessoas,
    },
  };
}
