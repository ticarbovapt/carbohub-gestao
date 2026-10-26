// Fixtures da área "quadros" (ver areas.ts): a lista de quadros, o quadro
// "Conteúdo Outubro" e o cartão aberto. Tudo FICTÍCIO.
// ⚠️ As tabelas mkt_* também são lidas pelas VISÕES (Calendário, Tabela…):
// nas rotas desta área respondem os dados daqui; fora delas, os da área
// "visoes" se ela tiver a tabela (molde do `porRota` do fx_logistica do Ops).
import { PAPEL, U, EU } from "./pessoas";
import * as visoes from "./fx_visoes";
void PAPEL;

const naNossa = () => {
  const p = typeof location !== "undefined" ? location.pathname : "";
  return p === "/quadros" || /^\/quadros\/[^/]+\/?$/.test(p) || p.startsWith("/cartao/");
};
const resolve = (v: unknown) => (typeof v === "function" ? (v as () => unknown)() : v);
const OUTRAS = [visoes] as { FX?: Record<string, unknown> }[];
const porRota = (chave: string, meu: () => unknown) => () => {
  if (naNossa()) return meu();
  for (const a of OUTRAS) if (a.FX && chave in a.FX) return resolve(a.FX[chave]);
  return meu();
};

// ── Datas ───────────────────────────────────────────────────────────────────
const agora = Date.now();
const dias = (d: number, h = 18) => { const x = new Date(agora + d * 86400000); x.setHours(h, 0, 0, 0); return x.toISOString(); };
const min = (m: number) => new Date(agora - m * 60000).toISOString();

// ── Quadros ─────────────────────────────────────────────────────────────────
const B = "q-conteudo";
const quadros = [
  { id: B, workspace_id: "ws1", title: "Conteúdo Outubro", background: "purple", position: 1, is_archived: false, created_at: dias(-40), created_by: U.gestor.id, trello_id: "https://trello.com/b/aB12cD34",
    descricao: "Calendário de posts, vídeos e newsletter de **outubro**.\n\n- Toda peça passa por *Em aprovação* antes de publicar.\n- Prazo de entrega = dia da publicação." },
  { id: "q-campanhas", workspace_id: "ws1", title: "Campanhas 2026", background: "blue", position: 2, is_archived: false, created_at: dias(-90), created_by: U.gestor.id, descricao: null },
  { id: "q-eventos", workspace_id: "ws1", title: "Eventos e feiras", background: "orange", position: 3, is_archived: false, created_at: dias(-60), created_by: U.closer.id, descricao: null },
  { id: "q-blog", workspace_id: "ws1", title: "Blog e SEO", background: "green", position: 4, is_archived: false, created_at: dias(-20), created_by: U.colab.id, descricao: null },
  { id: "q-identidade", workspace_id: "ws1", title: "Identidade visual — revisão 2026", background: "pink", position: 5, is_archived: false, created_at: dias(-10), created_by: U.vend2.id, descricao: null },
];

const L = (id: string, title: string, position: number, color: string | null = null, board_id = B, is_archived = false) =>
  ({ id, board_id, title, position, color, is_archived, archived_at: is_archived ? dias(-12) : null });
const listas = [
  L("l-ideias", "Ideias", 1000),
  L("l-producao", "Produção", 2000),
  L("l-aprovacao", "Em aprovação", 3000, "orange"),
  L("l-publicado", "Publicado", 4000, "green"),
  L("l-descartadas", "Ideias descartadas", 5000, null, B, true),
  L("l-planej", "Planejamento", 1000, null, "q-campanhas"),
];

const etiquetas = [
  { id: "e-insta", board_id: B, name: "Instagram", color: "purple", created_at: dias(-40) },
  { id: "e-reels", board_id: B, name: "Reels", color: "pink", created_at: dias(-40) },
  { id: "e-blog", board_id: B, name: "Blog", color: "blue", created_at: dias(-40) },
  { id: "e-urgente", board_id: B, name: "Urgente", color: "red", created_at: dias(-40) },
  { id: "e-campanha", board_id: B, name: "Campanha CarboZé", color: "green", created_at: dias(-40) },
  { id: "e-tiktok", board_id: B, name: "TikTok", color: "black", created_at: dias(-40) },
];

type C = Record<string, unknown>;
const card = (id: string, list_id: string, position: number, title: string, x: C = {}): C => ({
  id, list_id, board_id: B, position, title, description: null, start_date: null, due_date: null,
  is_complete: false, cover: null, updated_at: min(60), created_at: dias(-15), created_by: U.gestor.id,
  is_archived: false, archived_at: null, mirror_of: null, lembrete_minutos: null, recorrencia: null,
  location_lat: null, location_lng: null, location_name: null, trello_id: null, ...x,
});
const DESC = `## Objetivo
Post em **carrossel** para a ação do Dia do Motorista, dentro da campanha CarboZé.

- 5 telas: abertura, 3 dicas de cuidado com o motor e a chamada para o CarboZé
- Tom leve, foco em quem roda muito
- Legenda curta, com CTA para o link da bio

Referência: [Pasta da campanha no Drive](https://drive.google.com/drive/folders/exemplo)`;

const cartoes: C[] = [
  // Ideias
  card("c-serie", "l-ideias", 1000, "Série 'Antes e depois' da descarbonização", { description: "Mostrar o resultado no escapamento.", start_date: dias(3) }),
  card("c-pauta", "l-ideias", 2000, "Ideias de pauta para o blog"),
  card("c-enquete", "l-ideias", 3000, "Enquete nos stories: dúvidas sobre o CarboZé", { cover: "full:sky" }),
  // Produção
  card("c-motorista", "l-producao", 1000, "Post Dia do Motorista", {
    description: DESC, cover: "yellow", start_date: dias(-3, 9), due_date: dias(2, 18), lembrete_minutos: 60, created_by: U.colab.id,
  }),
  card("c-tutorial", "l-producao", 2000, "Vídeo tutorial: como aplicar o CarboZé", { due_date: dias(-1, 17), description: "Roteiro no anexo." }),
  card("c-espelho", "l-producao", 3000, "", { mirror_of: "c-orig" }),
  // Em aprovação
  card("c-carrossel", "l-aprovacao", 1000, "Carrossel: 5 sinais de motor com carbono", { due_date: dias(0, 20), recorrencia: "semanal" }),
  card("c-news", "l-aprovacao", 2000, "Newsletter de outubro", { due_date: dias(4, 10) }),
  // Publicado
  card("c-bastidores", "l-publicado", 1000, "Reels: bastidores da fábrica", { due_date: dias(-5), is_complete: true }),
  card("c-feriado", "l-publicado", 2000, "Post: horário especial do feriado", { due_date: dias(-9), is_complete: true }),
  // Arquivados
  card("c-arq1", "l-producao", 9000, "Post antigo de setembro", { is_archived: true, archived_at: dias(-6) }),
  card("c-arq2", "l-descartadas", 1000, "Live com cliente (adiada)", { is_archived: true, archived_at: dias(-12) }),
  card("c-arq4", "l-aprovacao", 9000, "Teaser de novembro (cancelado)", { is_archived: true, archived_at: dias(-2) }),
  card("c-arq3", "l-descartadas", 2000, "Sorteio no TikTok", { is_archived: false }),
  // Original do espelho (outro quadro)
  { ...card("c-orig", "l-planej", 1000, "Roteiro do Reels de lançamento", { due_date: dias(6) }), board_id: "q-campanhas" },
];

const rotulos: [string, string][] = [
  ["c-serie", "e-insta"], ["c-serie", "e-reels"], ["c-pauta", "e-blog"],
  ["c-motorista", "e-insta"], ["c-motorista", "e-campanha"], ["c-motorista", "e-urgente"],
  ["c-tutorial", "e-reels"], ["c-tutorial", "e-tiktok"], ["c-carrossel", "e-insta"], ["c-news", "e-blog"],
  ["c-bastidores", "e-reels"], ["c-feriado", "e-insta"], ["c-orig", "e-reels"],
];
const membros: [string, string][] = [
  ["c-serie", U.colab.id], ["c-motorista", U.colab.id], ["c-motorista", U.vend2.id], ["c-motorista", U.gestor.id],
  ["c-tutorial", U.closer.id], ["c-carrossel", U.gestor.id], ["c-news", U.vend2.id],
  ["c-bastidores", U.colab.id], ["c-bastidores", U.closer.id], ["c-orig", U.colab.id],
];

const checklists = [
  { id: "ck-mot", card_id: "c-motorista", title: "Entregas", position: 1 },
  { id: "ck-tut", card_id: "c-tutorial", title: "Gravação", position: 1 },
  { id: "ck-serie", card_id: "c-serie", title: "Pesquisa", position: 1 },
];
const item = (id: string, checklist_id: string, position: number, text: string, is_done: boolean, assignee_id: string | null = null, due_date: string | null = null) =>
  ({ id, checklist_id, position, text, is_done, assignee_id, due_date });
const itens = [
  item("i1", "ck-mot", 1, "Briefing aprovado", true),
  item("i2", "ck-mot", 2, "Arte do carrossel (5 telas)", true, U.vend2.id),
  item("i3", "ck-mot", 3, "Legenda com CTA para o link da bio", false, U.colab.id, dias(1, 12)),
  item("i4", "ck-mot", 4, "Aprovação da Marina", false, U.gestor.id),
  item("i5", "ck-mot", 5, "Agendar no Meta Business", false),
  item("i6", "ck-tut", 1, "Roteiro", true),
  item("i7", "ck-tut", 2, "Gravar no galpão", false, U.closer.id, dias(-2, 12)),
  item("i8", "ck-tut", 3, "Edição e legenda", false),
  item("i9", "ck-serie", 1, "Separar 3 clientes com foto do antes", false),
];

const comentarios = [
  { id: "co1", card_id: "c-motorista", user_id: U.gestor.id, body: "@Rafael Costa revisa a legenda antes de subir, por favor. A chamada tem de ir para o **link da bio**.", created_at: min(60 * 26), updated_at: min(60 * 26) },
  { id: "co2", card_id: "c-motorista", user_id: U.colab.id, body: "Legenda revisada. Subi a **v2** da arte nos anexos — troquei a cor do fundo.", created_at: min(60 * 5), updated_at: min(60 * 5) },
  { id: "co3", card_id: "c-motorista", user_id: U.vend2.id, body: "Ficou ótimo! Aprovado pelo comercial 🎉", created_at: min(40), updated_at: min(40) },
  { id: "co4", card_id: "c-tutorial", user_id: U.closer.id, body: "Gravação remarcada para quinta.", created_at: min(60 * 30), updated_at: min(60 * 30) },
  { id: "co5", card_id: "c-carrossel", user_id: U.gestor.id, body: "Aguardando o texto final.", created_at: min(60 * 3), updated_at: min(60 * 3) },
  { id: "co6", card_id: "c-serie", user_id: U.colab.id, body: "Pedi as fotos ao time de campo.", created_at: min(60 * 50), updated_at: min(60 * 50) },
];
const reacoes = [
  { comment_id: "co2", user_id: U.gestor.id, emoji: "👍" }, { comment_id: "co2", user_id: U.vend2.id, emoji: "👍" },
  { comment_id: "co3", user_id: U.colab.id, emoji: "❤️" }, { comment_id: "co1", user_id: U.colab.id, emoji: "✅" },
];

const anexo = (id: string, card_id: string, x: C): C => ({
  id, card_id, kind: "arquivo", name: "", external_url: "", drive_file_id: null, thumbnail_url: null,
  storage_path: `cartoes/${card_id}/${id}`, poster_path: null, tamanho: null, atualizado_em: null, versao: 1,
  web_path: null, web_status: null, mime_type: null, created_at: min(60 * 48), ...x,
});
const anexos = [
  anexo("a-arte", "c-motorista", { name: "arte-dia-do-motorista.png", mime_type: "image/png", tamanho: 2_400_000, versao: 2, atualizado_em: min(60 * 5) }),
  anexo("a-video", "c-motorista", { name: "reels-dia-do-motorista.mp4", mime_type: "video/mp4", tamanho: 48_300_000 }),
  anexo("a-brief", "c-motorista", { kind: "drive", name: "Briefing — Dia do Motorista", external_url: "https://docs.google.com/document/d/exemplo", storage_path: null, versao: null }),
  anexo("a-rot", "c-tutorial", { name: "roteiro-tutorial.pdf", mime_type: "application/pdf", tamanho: 180_000 }),
  anexo("a-news", "c-news", { kind: "link", name: "Rascunho da newsletter", external_url: "https://exemplo.com/news", storage_path: null }),
];
const versoes = [
  { id: "v-arte1", anexo_id: "a-arte", versao: 1, name: "arte-dia-do-motorista.png", storage_path: "cartoes/c-motorista/a-arte-v1", poster_path: null, web_path: null,
    mime_type: "image/png", tamanho: 2_100_000, criado_em: min(60 * 48), criado_por: U.vend2.id, substituido_em: min(60 * 5) },
];

const campos = [
  { id: "f-canal", board_id: B, name: "Canal de Publicação", type: "select", position: 1,
    options: [{ id: "o-ig", label: "Instagram", color: "purple" }, { id: "o-tt", label: "TikTok", color: "black" }, { id: "o-yt", label: "YouTube", color: "red" }, { id: "o-em", label: "E-mail", color: "blue" }] },
  { id: "f-formato", board_id: B, name: "Formato", type: "select", position: 2,
    options: [{ id: "o-car", label: "Carrossel" }, { id: "o-vid", label: "Vídeo" }, { id: "o-est", label: "Estático" }] },
];
const valores = [
  { card_id: "c-motorista", field_id: "f-canal", value: "o-ig" }, { card_id: "c-motorista", field_id: "f-formato", value: "o-car" },
  { card_id: "c-tutorial", field_id: "f-canal", value: "o-tt" }, { card_id: "c-news", field_id: "f-canal", value: "o-em" },
];

const atividade = [
  { id: "at1", board_id: B, card_id: "c-motorista", user_id: U.colab.id, type: "card.create", data: { title: "Post Dia do Motorista" }, created_at: dias(-4, 10) },
  { id: "at2", board_id: B, card_id: "c-motorista", user_id: U.colab.id, type: "anexo.substituir", data: { nome: "arte-dia-do-motorista.png" }, created_at: min(60 * 5) },
  { id: "at3", board_id: B, card_id: "c-bastidores", user_id: U.closer.id, type: "card.move", data: {}, created_at: min(60 * 20) },
  { id: "at4", board_id: B, card_id: "c-arq1", user_id: U.gestor.id, type: "card.archive", data: {}, created_at: dias(-6) },
];

const modelos = [
  { id: "m-reels", board_id: B, nome: "Reels padrão", titulo: "Reels: ", descricao: "Roteiro, gravação e legenda.", cover: null, label_ids: ["e-reels"],
    checklists: [{ title: "Reels", items: ["Roteiro", "Gravação", "Edição", "Legenda", "Agendar"] }], campos: [{ field_id: "f-formato", value: "o-vid" }], criado_em: dias(-20) },
  { id: "m-post", board_id: B, nome: "Post de Instagram", titulo: "Post: ", descricao: null, cover: null, label_ids: ["e-insta"],
    checklists: [], campos: [{ field_id: "f-canal", value: "o-ig" }], criado_em: dias(-18) },
];

// Notificações: as três da base (fixtures.ts) + os avisos dos cartões, que dão
// o sininho na frente do "Post Dia do Motorista".
const notifBase = [
  { id: "n1", user_id: EU.id, type: "crm_lead", title: "Cartão movido para Em aprovação", body: "Post Dia do Motorista · Quadro Conteúdo", is_read: false, reference_type: null, reference_id: null, created_at: min(25) },
  { id: "n2", user_id: EU.id, type: "mention", title: "Marina Alves mencionou você", body: "Post Dia do Motorista: \"revisa a legenda antes de subir\"", is_read: false, reference_type: null, reference_id: null, created_at: min(140) },
  { id: "n3", user_id: EU.id, type: "bug_fixed", title: "Bug corrigido", body: "O filtro do quadro voltou a funcionar.", is_read: true, reference_type: "bug", reference_id: "b1", created_at: min(60 * 26) },
];
const notifCartoes = [
  { id: "nq1", user_id: EU.id, type: "mkt_mencao", title: "Marina Alves mencionou você", body: "Post Dia do Motorista", is_read: false, reference_type: "mkt_card", reference_id: "c-motorista", created_at: min(60 * 26) },
  { id: "nq2", user_id: EU.id, type: "mkt_seguindo", title: "Novo comentário", body: "Post Dia do Motorista", is_read: false, reference_type: "mkt_card", reference_id: "c-motorista", created_at: min(40) },
];

const doQuadro = (rows: C[]) => rows;
export const FX: Record<string, unknown> = {
  mkt_workspaces: porRota("mkt_workspaces", () => [{ id: "ws1", name: "Marketing", created_at: dias(-100) }]),
  mkt_boards: porRota("mkt_boards", () => quadros),
  mkt_lists: porRota("mkt_lists", () => listas),
  mkt_labels: porRota("mkt_labels", () => etiquetas),
  mkt_cards: porRota("mkt_cards", () => doQuadro(cartoes)),
  mkt_card_labels: porRota("mkt_card_labels", () => rotulos.map(([card_id, label_id]) => ({ card_id, label_id }))),
  mkt_card_members: porRota("mkt_card_members", () => membros.map(([card_id, user_id]) => ({ card_id, user_id }))),
  mkt_checklists: porRota("mkt_checklists", () => checklists),
  mkt_checklist_items: porRota("mkt_checklist_items", () => itens),
  mkt_comments: porRota("mkt_comments", () => comentarios),
  mkt_comment_reacoes: porRota("mkt_comment_reacoes", () => reacoes),
  mkt_card_attachments: porRota("mkt_card_attachments", () => anexos),
  mkt_anexo_versoes: porRota("mkt_anexo_versoes", () => versoes),
  mkt_custom_fields: porRota("mkt_custom_fields", () => campos),
  mkt_card_field_values: porRota("mkt_card_field_values", () => valores),
  mkt_activity: porRota("mkt_activity", () => atividade),
  mkt_card_templates: porRota("mkt_card_templates", () => modelos),
  mkt_board_membros: porRota("mkt_board_membros", () => [
    { board_id: B, user_id: U.gestor.id, papel: "admin", created_at: dias(-40) },
    { board_id: B, user_id: U.colab.id, papel: "membro", created_at: dias(-39) },
    { board_id: B, user_id: U.vend2.id, papel: "membro", created_at: dias(-30) },
  ]),
  mkt_card_seguidores: porRota("mkt_card_seguidores", () => [
    { card_id: "c-motorista", user_id: EU.id }, { card_id: "c-carrossel", user_id: EU.id },
  ]),
  mkt_lista_seguidores: porRota("mkt_lista_seguidores", () => [{ list_id: "l-aprovacao", user_id: EU.id }]),
  mkt_saved_searches: porRota("mkt_saved_searches", () => [
    { id: "s1", name: "Instagram desta semana", scope: "board", board_id: B, user_id: EU.id, criteria: { labelIds: ["e-insta"], prazos: ["semana"], modo: "todas" }, created_at: dias(-5) },
    { id: "s2", name: "Tudo com o Rafael", scope: "all", board_id: null, user_id: EU.id, criteria: { memberIds: [U.colab.id] }, created_at: dias(-8) },
  ]),
  notifications: () => (naNossa() ? [...notifBase, ...notifCartoes] : notifBase),
};

export const RPC_FX: Record<string, unknown> = {
  carbo_team_members: () => Object.values(U).map((x) => ({ id: x.id, full_name: x.full_name, avatar_url: x.avatar_url, username: x.username, email: x.email, department: x.department, funcao: x.funcao, secondary_department: null, secondary_funcao: null })),
  mkt_quadro_para_excluir: () => ({ cartoes: 10, espelhos_fora: 0, arquivos: ["a", "b", "c"] }),
};
