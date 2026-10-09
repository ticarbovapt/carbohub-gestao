// ─────────────────────────────────────────────────────────────────────────────
// "Sincronizar com o Trello" — compara o quadro VIVO do Trello (lido pela
// função `trello-migrar`, ação `quadro`) com o quadro daqui e devolve o PLANO:
// o que entra, o que muda e o que é arquivado. Quem grava é o
// `SincronizarTrello.tsx`, depois de a pessoa ler o resumo.
//
// PURO, no molde do `trelloImport.ts`: nada de banco aqui dentro.
//
// ⚠️ Regras que custam caro se forem desfeitas sem entender:
//   1. O TRELLO VENCE em tudo que veio de lá — é o combinado até a virada,
//      porque o time continua trabalhando no Trello.
//   2. ⚠️ O que NASCEU AQUI fica intocado. Cartão, checklist ou item criado no
//      sistema não existe no Trello, e "Trello vence" leria isso como "foi
//      apagado lá". Separa os dois `veioDoTrello()`: tem `trello_id`, ou foi
//      gravado pela importação (até 30 min depois de o quadro nascer — o
//      import grava tudo em segundos; o cartão importado ainda carrega o
//      instante de criação do Trello, mais antigo que o quadro).
//   3. ⚠️ Apagado no Trello é ARQUIVADO aqui, nunca apagado: comentário,
//      anexo e histórico continuam, e desfazer é um clique.
//   4. O PRIMEIRO elo é pelo instante de criação (o id do Trello o carrega e a
//      importação gravou exatamente ele), e SÓ com casamento único. Ligado,
//      grava `trello_id` e dali em diante o elo é o id.
//   5. ⚠️ Membro: só sai do cartão quem é uma pessoa CASADA com alguém do
//      Trello. Quem não tem par lá (ou cujo par é ambíguo) fica — tirar
//      alguém por falha de casamento de nome seria apagar trabalho calado.
//   6. Anexo nunca sai: arquivo que o time subiu aqui é o que o sistema tem de
//      mais caro de refazer. Só ENTRA o anexo novo do Trello.
// ─────────────────────────────────────────────────────────────────────────────

import { casarPessoas, corEtiqueta, corLista, criadoEm, type PessoaDaqui } from "./trelloImport";

/* eslint-disable @typescript-eslint/no-explicit-any */
type J = any;
type Linha = Record<string, unknown>;

export interface EstadoDaqui {
  board: { id: string; created_at: string; trello_id: string | null };
  lists: { id: string; title: string; position: number; color: string | null; is_archived: boolean; created_at: string; trello_id: string | null }[];
  cards: {
    id: string; list_id: string; title: string; description: string | null; position: number;
    start_date: string | null; due_date: string | null; is_complete: boolean; cover: string | null;
    is_archived: boolean; created_at: string; trello_id: string | null; mirror_of: string | null;
  }[];
  labels: { id: string; name: string; color: string; created_at: string; trello_id: string | null }[];
  fields: { id: string; name: string; type: string; options: { id: string; label: string; color?: string }[]; created_at: string; trello_id: string | null }[];
  cardLabels: { card_id: string; label_id: string }[];
  cardMembers: { card_id: string; user_id: string }[];
  fieldValues: { card_id: string; field_id: string; value: unknown }[];
  checklists: { id: string; card_id: string; title: string; position: number; created_at: string; trello_id: string | null }[];
  items: {
    id: string; checklist_id: string; text: string; is_done: boolean; position: number;
    due_date: string | null; assignee_id: string | null; created_at: string; trello_id: string | null;
  }[];
  attachments: { card_id: string; external_url: string | null }[];
  /** `trello_id` de cartões que alguém MOVEU daqui para outro quadro. */
  movidosParaFora?: Set<string>;
  /** `trello_id` de LISTAS movidas daqui para outro quadro (Ações da lista). */
  listasMovidasParaFora?: Set<string>;
}

export interface Patch { id: string; patch: Linha }

export interface Mudanca { cartao: string; lista: string; o_que: string[] }

export interface PlanoSync {
  boardPatch: Linha;
  labelsInsert: Linha[]; labelsUpdate: Patch[];
  fieldsInsert: Linha[]; fieldsUpdate: Patch[];
  listsInsert: Linha[]; listsUpdate: Patch[];
  cardsInsert: Linha[]; cardsUpdate: Patch[];
  cardLabelsInsert: Linha[]; cardLabelsDelete: { card_id: string; label_id: string }[];
  membersInsert: Linha[]; membersDelete: { card_id: string; user_id: string }[];
  valuesUpsert: Linha[]; valuesDelete: { card_id: string; field_id: string }[];
  checklistsInsert: Linha[]; checklistsUpdate: Patch[]; checklistsDelete: string[];
  itemsInsert: Linha[]; itemsUpdate: Patch[]; itemsDelete: string[];
  attachmentsInsert: Linha[];
  resumo: {
    titulo: string;
    listasNovas: number; listasAlteradas: number;
    cartoesNovos: number; cartoesAlterados: number; cartoesArquivados: number; cartoesDesarquivados: number;
    nasceramAqui: number; semVinculo: number;
    mudancas: Mudanca[];
    pessoas: { trello: string; casou: string | null }[];
  };
}

const uuid = () => crypto.randomUUID();
const ms = (s: string | null | undefined) => (s ? new Date(s).getTime() : null);
const mesmaData = (a: string | null | undefined, b: string | null | undefined) => ms(a) === ms(b);
// Posição: a importação somou uma FRAÇÃO de desempate (ordem × 1e-6) ao `pos`
// do Trello. Comparar exato acusaria todo cartão como "mudou"; mais de meio
// ponto é que é mudança de verdade (o Trello espaça os `pos` em milhares).
const outraPosicao = (aqui: number, la: number) => Math.abs(Number(aqui) - Number(la)) > 0.5;

function capa(c: J): string | null {
  if (!c.cover?.color) return null;
  return (c.cover.size === "full" ? "full:" : "") + corEtiqueta(c.cover.color);
}

const TIPO: Record<string, string> = { list: "select", text: "text", number: "number", date: "date", checkbox: "checkbox" };
function valorDoCampo(tipo: string, v: J): unknown {
  if (tipo === "select") return v.idValue ?? null;
  if (tipo === "number") return v.value?.number != null ? Number(v.value.number) : null;
  if (tipo === "checkbox") return v.value?.checked === "true";
  if (tipo === "date") return v.value?.date ? String(v.value.date).slice(0, 10) : null;
  return v.value?.text ?? null;
}

// Liga cada coisa do Trello a UMA daqui: primeiro pelo `trello_id`; sem ele,
// pela chave dada, e só quando ela é única dos DOIS lados.
function ligar<A extends { id: string; trello_id: string | null }>(
  daqui: A[], doTrello: J[], chaveAqui: (a: A) => string | null, chaveLa: (t: J) => string | null,
): Map<string, A> {
  const out = new Map<string, A>();
  const porId = new Map(daqui.filter((a) => a.trello_id).map((a) => [a.trello_id as string, a]));
  const livres = daqui.filter((a) => !a.trello_id);
  const porChave = new Map<string, A[]>();
  for (const a of livres) { const k = chaveAqui(a); if (k) porChave.set(k, [...(porChave.get(k) ?? []), a]); }
  const chavesLa = new Map<string, number>();
  for (const t of doTrello) { if (porId.has(t.id)) continue; const k = chaveLa(t); if (k) chavesLa.set(k, (chavesLa.get(k) ?? 0) + 1); }
  for (const t of doTrello) {
    const ja = porId.get(t.id);
    if (ja) { out.set(t.id, ja); continue; }
    const k = chaveLa(t);
    const cands = k ? porChave.get(k) ?? [] : [];
    if (k && cands.length === 1 && chavesLa.get(k) === 1) out.set(t.id, cands[0]);
  }
  return out;
}

export function planejarSincronizacao(t: J, aqui: EstadoDaqui, ctx: { userId: string; pessoas: PessoaDaqui[] }): PlanoSync {
  if (!t || !Array.isArray(t.lists) || !Array.isArray(t.cards)) throw new Error("O Trello não devolveu um quadro (faltam listas e cartões).");
  const agora = new Date().toISOString();
  const boardId = aqui.board.id;
  const limiteImport = (ms(aqui.board.created_at) ?? 0) + 30 * 60 * 1000;
  const veioDoTrello = (x: { trello_id: string | null; created_at: string }) =>
    !!x.trello_id || (ms(x.created_at) ?? Infinity) <= limiteImport;

  const { membro, pessoas } = casarPessoas(t.members ?? [], ctx.pessoas);
  const pessoasCasadas = new Set(membro.values());

  // ── Etiquetas ─────────────────────────────────────────────────────────────
  const tLabels: J[] = t.labels ?? [];
  const labelLig = ligar(aqui.labels, tLabels, (l) => `${l.name}|${l.color}`, (l) => `${l.name ?? ""}|${corEtiqueta(l.color)}`);
  const labelsInsert: Linha[] = []; const labelsUpdate: Patch[] = [];
  const labelDaqui = new Map<string, string>();
  for (const l of tLabels) {
    const cor = corEtiqueta(l.color); const nome = l.name ?? "";
    const a = labelLig.get(l.id);
    if (a) {
      labelDaqui.set(l.id, a.id);
      const p: Linha = {};
      if (a.trello_id !== l.id) p.trello_id = l.id;
      if (a.name !== nome) p.name = nome;
      if (a.color !== cor) p.color = cor;
      if (Object.keys(p).length) labelsUpdate.push({ id: a.id, patch: p });
    } else {
      const id = uuid(); labelDaqui.set(l.id, id);
      labelsInsert.push({ id, board_id: boardId, name: nome, color: cor, trello_id: l.id });
    }
  }

  // ── Campos personalizados ─────────────────────────────────────────────────
  const tFields: J[] = (t.customFields ?? []).filter((f: J) => TIPO[f.type]);
  const fieldLig = ligar(aqui.fields, tFields, (f) => f.name, (f) => f.name ?? "");
  const fieldsInsert: Linha[] = []; const fieldsUpdate: Patch[] = [];
  const campo = new Map<string, { id: string; tipo: string }>();
  tFields.forEach((f, i) => {
    const tipo = TIPO[f.type];
    const options = (f.options ?? []).map((o: J) => ({ id: o.id, label: o.value?.text ?? "", color: o.color && o.color !== "none" ? corEtiqueta(o.color) : "blue" }));
    const a = fieldLig.get(f.id);
    if (a) {
      campo.set(f.id, { id: a.id, tipo: a.type });
      const p: Linha = {};
      if (a.trello_id !== f.id) p.trello_id = f.id;
      if (a.name !== (f.name ?? "")) p.name = f.name ?? "";
      if (tipo === "select" && JSON.stringify(a.options) !== JSON.stringify(options)) p.options = options;
      if (Object.keys(p).length) fieldsUpdate.push({ id: a.id, patch: p });
    } else {
      const id = uuid(); campo.set(f.id, { id, tipo });
      fieldsInsert.push({ id, board_id: boardId, name: f.name ?? "", type: tipo, position: Number(f.pos) || i, options, trello_id: f.id });
    }
  });

  // ── Listas ────────────────────────────────────────────────────────────────
  // ⚠️ Lista MOVIDA daqui para outro quadro leva o `trello_id`: sem este corte
  // ela voltaria como lista nova, e os cartões dela ficariam de fora (já
  // estão no outro quadro) — uma lista vazia com nome conhecido.
  const tLists: J[] = t.lists.filter((l: J) => !aqui.listasMovidasParaFora?.has(l.id));
  const listLig = ligar(aqui.lists, tLists, (l) => String(ms(l.created_at)), (l) => String(ms(criadoEm(l.id))));
  const listsInsert: Linha[] = []; const listsUpdate: Patch[] = [];
  const listaDaqui = new Map<string, string>();
  const nomeLista = new Map<string, string>(aqui.lists.map((l) => [l.id, l.title]));
  let listasNovas = 0, listasAlteradas = 0;
  for (const l of tLists) {
    const a = listLig.get(l.id);
    const desejo = { title: l.name || "(sem título)", position: Number(l.pos) || 0, color: corLista(l.color), is_archived: !!l.closed };
    if (a) {
      listaDaqui.set(l.id, a.id); nomeLista.set(a.id, desejo.title);
      const p: Linha = {};
      if (a.trello_id !== l.id) p.trello_id = l.id;
      if (a.title !== desejo.title) p.title = desejo.title;
      if (outraPosicao(a.position, desejo.position)) p.position = desejo.position;
      if ((a.color ?? null) !== desejo.color) p.color = desejo.color;
      if (a.is_archived !== desejo.is_archived) { p.is_archived = desejo.is_archived; p.archived_at = desejo.is_archived ? agora : null; }
      if (Object.keys(p).some((k) => k !== "trello_id")) listasAlteradas++;
      if (Object.keys(p).length) listsUpdate.push({ id: a.id, patch: p });
    } else {
      const id = uuid(); listaDaqui.set(l.id, id); nomeLista.set(id, desejo.title); listasNovas++;
      listsInsert.push({
        id, board_id: boardId, ...desejo, archived_at: desejo.is_archived ? agora : null,
        created_at: criadoEm(l.id) ?? agora, trello_id: l.id,
      });
    }
  }
  const tituloLista = (idAqui: string) => nomeLista.get(idAqui) ?? "?";

  // ── Cartões ───────────────────────────────────────────────────────────────
  const cardsDaqui = aqui.cards.filter((c) => !c.mirror_of); // espelho segue o original
  // ⚠️ Cartão que alguém MOVEU daqui para outro quadro (o "Mover" do menu
  // leva o `trello_id` junto) não é "sumiu daqui": sem este corte ele voltaria
  // como cartão NOVO, e o mesmo cartão existiria em dois quadros.
  const tCards: J[] = t.cards.filter((c: J) => listaDaqui.has(c.idList) && !aqui.movidosParaFora?.has(c.id));
  const cardLig = ligar(cardsDaqui, tCards, (c) => String(ms(c.created_at)), (c) => String(ms(criadoEm(c.id))));
  // Mesmo segundo nos dois lados: desempata pelo nome, como no "Trazer comentários".
  for (const c of tCards) {
    if (cardLig.has(c.id)) continue;
    const inst = ms(criadoEm(c.id));
    const cands = cardsDaqui.filter((a) => !a.trello_id && ms(a.created_at) === inst && a.title === c.name);
    const jaUsado = new Set([...cardLig.values()].map((a) => a.id));
    if (cands.length === 1 && !jaUsado.has(cands[0].id)) cardLig.set(c.id, cands[0]);
  }

  const cardsInsert: Linha[] = []; const cardsUpdate: Patch[] = [];
  const cardDaqui = new Map<string, string>();
  // Uma linha por cartão no resumo, com tudo o que mudou nele.
  const mudancaDe = new Map<string, Mudanca>();
  const anotar = (chave: string, cartao: string, lista: string, o_que: string) => {
    const m = mudancaDe.get(chave);
    if (m) { if (!m.o_que.includes(o_que)) m.o_que.push(o_que); }
    else mudancaDe.set(chave, { cartao, lista, o_que: [o_que] });
  };
  let cartoesNovos = 0, cartoesArquivados = 0, cartoesDesarquivados = 0;
  const novos = new Set<string>();
  const ordemNaLista = new Map<string, number>();

  for (const c of tCards) {
    const listId = listaDaqui.get(c.idList)!;
    const ord = (ordemNaLista.get(c.idList) ?? 0) + 1; ordemNaLista.set(c.idList, ord);
    const desejo = {
      list_id: listId, title: c.name || "(sem título)", description: c.desc ? c.desc : null,
      start_date: c.start ?? null, due_date: c.due ?? null, is_complete: !!c.dueComplete,
      cover: capa(c), is_archived: !!c.closed,
    };
    const a = cardLig.get(c.id);
    if (!a) {
      const id = uuid(); cardDaqui.set(c.id, id); novos.add(c.id); cartoesNovos++;
      cardsInsert.push({
        id, board_id: boardId, ...desejo, position: (Number(c.pos) || 0) + ord * 1e-6,
        location_lat: null, location_lng: null, location_name: null,
        archived_at: desejo.is_archived ? (c.dateClosed ?? agora) : null,
        created_by: ctx.userId, created_at: criadoEm(c.id) ?? agora, trello_id: c.id,
      });
      if (!desejo.is_archived) anotar(c.id, desejo.title, tituloLista(listId), "novo");
      continue;
    }
    cardDaqui.set(c.id, a.id);
    const p: Linha = {}; const o_que: string[] = [];
    if (a.trello_id !== c.id) p.trello_id = c.id;
    if (a.list_id !== listId) { p.list_id = listId; o_que.push(`movido: ${tituloLista(a.list_id)} → ${tituloLista(listId)}`); }
    if (a.list_id !== listId || outraPosicao(a.position, Number(c.pos) || 0)) {
      p.position = (Number(c.pos) || 0) + ord * 1e-6;
      if (a.list_id === listId) o_que.push("ordem na lista");
    }
    if (a.title !== desejo.title) { p.title = desejo.title; o_que.push(`título (era "${a.title}")`); }
    if ((a.description ?? null) !== desejo.description) { p.description = desejo.description; o_que.push("descrição"); }
    if (!mesmaData(a.start_date, desejo.start_date)) { p.start_date = desejo.start_date; o_que.push("início"); }
    if (!mesmaData(a.due_date, desejo.due_date)) { p.due_date = desejo.due_date; o_que.push("entrega"); }
    if (a.is_complete !== desejo.is_complete) { p.is_complete = desejo.is_complete; o_que.push(desejo.is_complete ? "concluído" : "reaberto"); }
    if ((a.cover ?? null) !== desejo.cover) { p.cover = desejo.cover; o_que.push("capa"); }
    if (a.is_archived !== desejo.is_archived) {
      p.is_archived = desejo.is_archived; p.archived_at = desejo.is_archived ? (c.dateClosed ?? agora) : null;
      o_que.push(desejo.is_archived ? "arquivado no Trello" : "desarquivado");
      if (desejo.is_archived) cartoesArquivados++; else cartoesDesarquivados++;
    }
    if (Object.keys(p).length) cardsUpdate.push({ id: a.id, patch: p });
    for (const x of o_que) anotar(c.id, desejo.title, tituloLista(listId), x);
  }

  // Veio do Trello e sumiu de lá: ARQUIVA. Nasceu aqui: fica.
  const ligados = new Set([...cardLig.values()].map((a) => a.id));
  let nasceramAqui = 0;
  for (const a of cardsDaqui) {
    if (ligados.has(a.id)) continue;
    if (!veioDoTrello(a)) { nasceramAqui++; continue; }
    if (a.is_archived) continue;
    cardsUpdate.push({ id: a.id, patch: { is_archived: true, archived_at: agora } });
    cartoesArquivados++;
    anotar(a.id, a.title, tituloLista(a.list_id), "não existe mais no Trello — arquivado");
  }

  // ── Etiquetas, membros e campos de cada cartão do Trello ─────────────────
  // Cartão novo já aparece como "novo"; arquivado não interessa ao resumo.
  const marca = (o_que: string, c: J) => {
    if (novos.has(c.id) || c.closed) return;
    anotar(c.id, c.name || "(sem título)", tituloLista(listaDaqui.get(c.idList)!), o_que);
  };

  const porCartao = <T extends { card_id: string }>(xs: T[]) => {
    const m = new Map<string, T[]>(); for (const x of xs) m.set(x.card_id, [...(m.get(x.card_id) ?? []), x]); return m;
  };
  const labelsDoCartao = porCartao(aqui.cardLabels);
  const membrosDoCartao = porCartao(aqui.cardMembers);
  const valoresDoCartao = porCartao(aqui.fieldValues);
  const anexosDoCartao = porCartao(aqui.attachments);
  const campoDoTrello = new Set([...campo.values()].map((f) => f.id));

  const cardLabelsInsert: Linha[] = []; const cardLabelsDelete: { card_id: string; label_id: string }[] = [];
  const membersInsert: Linha[] = []; const membersDelete: { card_id: string; user_id: string }[] = [];
  const valuesUpsert: Linha[] = []; const valuesDelete: { card_id: string; field_id: string }[] = [];
  const attachmentsInsert: Linha[] = [];

  for (const c of tCards) {
    const id = cardDaqui.get(c.id)!;
    // Etiquetas: o conjunto do Trello vence.
    const quer = new Set<string>((c.idLabels ?? []).map((l: string) => labelDaqui.get(l)).filter(Boolean));
    const tem = new Set((labelsDoCartao.get(id) ?? []).map((x) => x.label_id));
    let mudou = false;
    for (const l of quer) if (!tem.has(l)) { cardLabelsInsert.push({ card_id: id, label_id: l }); mudou = true; }
    for (const l of tem) if (!quer.has(l)) { cardLabelsDelete.push({ card_id: id, label_id: l }); mudou = true; }
    if (mudou) marca("etiquetas", c);

    // Membros: entra quem casou; sai só quem é pessoa casada e não está lá.
    const querM = new Set<string>((c.idMembers ?? []).map((m: string) => membro.get(m)).filter(Boolean) as string[]);
    const temM = new Set((membrosDoCartao.get(id) ?? []).map((x) => x.user_id));
    mudou = false;
    for (const u of querM) if (!temM.has(u)) { membersInsert.push({ card_id: id, user_id: u }); mudou = true; }
    for (const u of temM) if (!querM.has(u) && pessoasCasadas.has(u)) { membersDelete.push({ card_id: id, user_id: u }); mudou = true; }
    if (mudou) marca("membros", c);

    // Campos: só os que vieram do Trello; campo criado aqui não é tocado.
    const querV = new Map<string, unknown>();
    for (const v of c.customFieldItems ?? []) {
      const f = campo.get(v.idCustomField);
      if (!f) continue;
      const val = valorDoCampo(f.tipo, v);
      if (val !== null && val !== "") querV.set(f.id, val);
    }
    const temV = new Map((valoresDoCartao.get(id) ?? []).map((x) => [x.field_id, x.value]));
    mudou = false;
    for (const [f, val] of querV) if (JSON.stringify(temV.get(f)) !== JSON.stringify(val)) { valuesUpsert.push({ card_id: id, field_id: f, value: val }); mudou = true; }
    for (const [f] of temV) if (campoDoTrello.has(f) && !querV.has(f)) { valuesDelete.push({ card_id: id, field_id: f }); mudou = true; }
    if (mudou) marca("campos", c);

    // Anexos: só ENTRA o que é novo no Trello.
    const urls = new Set((anexosDoCartao.get(id) ?? []).map((x) => x.external_url).filter(Boolean));
    let entrou = false;
    for (const x of c.attachments ?? []) {
      if (!x.url || urls.has(x.url)) continue;
      attachmentsInsert.push({
        card_id: id, kind: "link", name: (x.name || x.fileName || x.url).slice(0, 300),
        external_url: x.url, mime_type: x.mimeType || null, created_by: ctx.userId, created_at: x.date ?? agora,
      });
      urls.add(x.url); entrou = true;
    }
    if (entrou) marca("anexo novo", c);
  }

  // ── Checklists e itens ────────────────────────────────────────────────────
  const checklistsInsert: Linha[] = []; const checklistsUpdate: Patch[] = []; const checklistsDelete: string[] = [];
  const itemsInsert: Linha[] = []; const itemsUpdate: Patch[] = []; const itemsDelete: string[] = [];
  const tChecks = new Map<string, J[]>();
  for (const k of (t.checklists ?? []) as J[]) tChecks.set(k.idCard, [...(tChecks.get(k.idCard) ?? []), k]);
  const checksDaqui = porCartao(aqui.checklists);
  const itensDaqui = new Map<string, EstadoDaqui["items"]>();
  for (const i of aqui.items) itensDaqui.set(i.checklist_id, [...(itensDaqui.get(i.checklist_id) ?? []), i]);

  const desejoItem = (i: J) => ({
    text: i.name || "(vazio)", is_done: i.state === "complete", position: Number(i.pos) || 0, due_date: i.due ?? null,
  });

  for (const c of tCards) {
    const id = cardDaqui.get(c.id)!;
    const ks: J[] = tChecks.get(c.id) ?? [];
    const daqui = checksDaqui.get(id) ?? [];
    const lig = ligar(daqui, ks, (k) => k.title, (k) => k.name || "Checklist");
    let mudou = false;
    for (const k of ks) {
      const a = lig.get(k.id);
      const titulo = k.name || "Checklist";
      let kid: string;
      if (a) {
        kid = a.id;
        const p: Linha = {};
        if (a.trello_id !== k.id) p.trello_id = k.id;
        if (a.title !== titulo) p.title = titulo;
        if (outraPosicao(a.position, Number(k.pos) || 0)) p.position = Number(k.pos) || 0;
        if (Object.keys(p).some((x) => x !== "trello_id" && x !== "position")) mudou = true;
        if (Object.keys(p).length) checklistsUpdate.push({ id: a.id, patch: p });
      } else {
        kid = uuid(); mudou = true;
        checklistsInsert.push({ id: kid, card_id: id, title: titulo, position: Number(k.pos) || 0, trello_id: k.id });
      }
      // Itens
      const its: J[] = k.checkItems ?? [];
      const itAqui = a ? itensDaqui.get(a.id) ?? [] : [];
      const ligI = ligar(itAqui, its, (i) => i.text, (i) => i.name || "(vazio)");
      for (const i of its) {
        const d = desejoItem(i);
        const quem = i.idMember ? membro.get(i.idMember) : undefined;
        const b = ligI.get(i.id);
        if (b) {
          const p: Linha = {};
          if (b.trello_id !== i.id) p.trello_id = i.id;
          if (b.text !== d.text) p.text = d.text;
          if (b.is_done !== d.is_done) p.is_done = d.is_done;
          if (outraPosicao(b.position, d.position)) p.position = d.position;
          if (!mesmaData(b.due_date, d.due_date)) p.due_date = d.due_date;
          if (quem && b.assignee_id !== quem) p.assignee_id = quem;
          if (Object.keys(p).some((x) => x !== "trello_id" && x !== "position")) mudou = true;
          if (Object.keys(p).length) itemsUpdate.push({ id: b.id, patch: p });
        } else {
          mudou = true;
          itemsInsert.push({ checklist_id: kid, ...d, assignee_id: quem ?? null, trello_id: i.id });
        }
      }
      const ligadosI = new Set([...ligI.values()].map((b) => b.id));
      for (const b of itAqui) if (!ligadosI.has(b.id) && veioDoTrello(b)) { itemsDelete.push(b.id); mudou = true; }
    }
    const ligadosK = new Set([...lig.values()].map((a) => a.id));
    for (const a of daqui) if (!ligadosK.has(a.id) && veioDoTrello(a)) { checklistsDelete.push(a.id); mudou = true; }
    if (mudou) marca("checklist", c);
  }

  const mudancas = [...mudancaDe.values()];
  const cartoesAlterados = mudancas.filter((m) => !m.o_que.includes("novo") && !m.o_que.some((x) => x.includes("arquivado") || x === "desarquivado")).length;
  const semVinculo = cardsDaqui.filter((a) => !ligados.has(a.id) && veioDoTrello(a)).length;

  return {
    boardPatch: { trello_id: t.id, trello_sincronizado_em: agora },
    labelsInsert, labelsUpdate, fieldsInsert, fieldsUpdate, listsInsert, listsUpdate,
    cardsInsert, cardsUpdate, cardLabelsInsert, cardLabelsDelete, membersInsert, membersDelete,
    valuesUpsert, valuesDelete, checklistsInsert, checklistsUpdate, checklistsDelete,
    itemsInsert, itemsUpdate, itemsDelete, attachmentsInsert,
    resumo: {
      titulo: String(t.name ?? ""),
      listasNovas, listasAlteradas,
      cartoesNovos, cartoesAlterados, cartoesArquivados, cartoesDesarquivados,
      nasceramAqui, semVinculo,
      mudancas: mudancas.sort((x, y) => x.lista.localeCompare(y.lista) || x.cartao.localeCompare(y.cartao)),
      pessoas: pessoas.map((p) => ({ trello: p.trello, casou: p.casou })),
    },
  };
}
