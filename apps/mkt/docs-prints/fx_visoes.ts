// Fixtures da área "visoes" (ver areas.ts): as visões de um quadro
// (Calendário, Timeline, Tabela, Dashboard, Mapa), as visões entre quadros
// (/calendario-geral, /tabela-geral) e Campanhas. Tudo FICTÍCIO.
//
// ⚠️ As tabelas `mkt_*` também são da área "quadros" (fx_quadros). Para não
// atropelar os prints de lá, cada tabela daqui só responde com os dados desta
// área NAS ROTAS desta área; fora delas, devolve o que fx_quadros declarar.
import { PAPEL, U, EU } from "./pessoas";
import * as quadros from "./fx_quadros";
void PAPEL; void EU;

const rota = () => { try { return location.pathname; } catch { return ""; } };
const NOSSA = /^\/quadros\/[^/]+\/(calendario|linha-do-tempo|tabela|painel|mapa)|^\/(calendario|tabela)-geral|^\/campanhas/;
const naNossa = () => NOSSA.test(rota());
const resolve = (v: unknown, args?: unknown) => (typeof v === "function" ? (v as (a?: unknown) => unknown)(args) : v);
const outra = (q: { FX?: Record<string, unknown>; RPC_FX?: Record<string, unknown> }) => q;
const porRota = (chave: string, meu: () => unknown) => () => {
  if (naNossa()) return meu();
  const fx = outra(quadros).FX ?? {};
  return chave in fx ? resolve(fx[chave]) : [];
};
const rpcPorRota = (nome: string, meu: (a: unknown) => unknown) => (args: unknown) => {
  if (naNossa()) return meu(args);
  const rpc = outra(quadros).RPC_FX ?? {};
  return nome in rpc ? resolve(rpc[nome], args) : null;
};

// ── Datas: sempre dentro do MÊS ATUAL, para o calendário sair cheio ─────────
const hoje = new Date();
const dia = (d: number, h = 12) => new Date(hoje.getFullYear(), hoje.getMonth(), d, h, 0, 0).toISOString();
const atras = (d: number) => new Date(Date.now() - d * 86400000).toISOString();

const WS = "w-mkt";
const B = { ed: "b-visoes", lanc: "b-vis-lanc", ev: "b-vis-ev" };
const boards = [
  { id: B.ed, workspace_id: WS, title: "Calendário Editorial", background: "blue", position: 1, is_archived: false, created_at: atras(90), created_by: U.gestor.id, descricao: null },
  { id: B.lanc, workspace_id: WS, title: "Lançamentos CarboZé", background: "green", position: 2, is_archived: false, created_at: atras(60), created_by: U.gestor.id, descricao: null },
  { id: B.ev, workspace_id: WS, title: "Eventos e Feiras", background: "orange", position: 3, is_archived: false, created_at: atras(40), created_by: U.gestor.id, descricao: null },
];
const lista = (id: string, board_id: string, title: string, position: number, color: string | null) =>
  ({ id, board_id, title, position, color, is_archived: false, created_at: atras(90) });
const lists = [
  lista("l-ed-1", B.ed, "Ideias", 1, "gray"),
  lista("l-ed-2", B.ed, "Em produção", 2, "blue"),
  lista("l-ed-3", B.ed, "Em aprovação", 3, "orange"),
  lista("l-ed-4", B.ed, "Agendado", 4, "purple"),
  lista("l-ed-5", B.ed, "Publicado", 5, "green"),
  lista("l-la-1", B.lanc, "Planejamento", 1, "sky"),
  lista("l-la-2", B.lanc, "Em execução", 2, "orange"),
  lista("l-la-3", B.lanc, "Lançado", 3, "green"),
  lista("l-ev-1", B.ev, "Confirmados", 1, "purple"),
  lista("l-ev-2", B.ev, "Realizados", 2, "green"),
];
const labels = [
  { id: "lb-ig", board_id: B.ed, name: "Instagram", color: "purple", created_at: atras(90) },
  { id: "lb-in", board_id: B.ed, name: "LinkedIn", color: "blue", created_at: atras(90) },
  { id: "lb-bl", board_id: B.ed, name: "Blog", color: "green", created_at: atras(90) },
  { id: "lb-ur", board_id: B.ed, name: "Urgente", color: "red", created_at: atras(90) },
  { id: "lb-cz", board_id: B.ed, name: "Campanha CarboZé", color: "orange", created_at: atras(90) },
  { id: "lb-la", board_id: B.lanc, name: "Produto novo", color: "green", created_at: atras(60) },
  { id: "lb-ev", board_id: B.ev, name: "Presencial", color: "yellow", created_at: atras(40) },
];

type C = { id: string; b: string; l: string; t: string; s?: number | null; d?: number | null; ok?: boolean; loc?: [number, number, string] };
const cs: C[] = [
  { id: "c-v1", b: B.ed, l: "l-ed-5", t: "Post Dia do Motorista", d: 3, ok: true },
  { id: "c-v2", b: B.ed, l: "l-ed-5", t: "Carrossel: 5 sinais de motor carbonizado", s: 5, d: 7, ok: true },
  { id: "c-v3", b: B.ed, l: "l-ed-3", t: "Artigo blog: economia de combustível", s: 8, d: 14 },
  { id: "c-v4", b: B.ed, l: "l-ed-2", t: "Vídeo depoimento frotista", s: 12, d: 22, loc: [-5.7945, -35.211, "Posto parceiro — Natal/RN"] },
  { id: "c-v5", b: B.ed, l: "l-ed-3", t: "Post LinkedIn: case transportadora", d: 20 },
  { id: "c-v6", b: B.ed, l: "l-ed-4", t: "Reels CarboVAPT antes e depois", s: 24, d: 28, loc: [-8.0476, -34.877, "Oficina parceira — Recife/PE"] },
  { id: "c-v7", b: B.ed, l: "l-ed-4", t: "Stories promoção Black Friday", s: 27, d: 30 },
  { id: "c-v8", b: B.ed, l: "l-ed-2", t: "Sessão de fotos do kit sachê", s: 16, d: 19, loc: [-23.5505, -46.6333, "Estúdio — São Paulo/SP"] },
  { id: "c-v9", b: B.ed, l: "l-ed-1", t: "Pauta: dicas de manutenção no inverno" },
  { id: "c-v10", b: B.ed, l: "l-ed-1", t: "Ideia: série com mecânicos parceiros" },
  { id: "c-v11", b: B.ed, l: "l-ed-5", t: "Newsletter de outubro", d: 10, ok: true },
  { id: "c-v12", b: B.ed, l: "l-ed-2", t: "Landing page CarboPRO", s: 18, d: 29 },
  { id: "c-la1", b: B.lanc, l: "l-la-1", t: "Lançamento CarboZé 1 Litro", s: 4, d: 25 },
  { id: "c-la2", b: B.lanc, l: "l-la-2", t: "Embalagem nova do sachê", d: 15 },
  { id: "c-la3", b: B.lanc, l: "l-la-3", t: "Kit 5 frascos na loja on-line", d: 6, ok: true },
  { id: "c-ev1", b: B.ev, l: "l-ev-1", t: "Feira de transportes — estande", s: 21, d: 23, loc: [-23.62, -46.7, "São Paulo/SP"] },
  { id: "c-ev2", b: B.ev, l: "l-ev-2", t: "Encontro de revendedores NE", d: 9, ok: true, loc: [-5.79, -35.2, "Natal/RN"] },
];
const cards = cs.map((c, i) => ({
  id: c.id, board_id: c.b, list_id: c.l, position: (i + 1) * 1000, title: c.t, description: null,
  start_date: c.s ? dia(c.s, 9) : null, due_date: c.d ? dia(c.d, 18) : null, is_complete: !!c.ok,
  cover: null, updated_at: atras(i % 5), is_archived: false, mirror_of: null,
  lembrete_minutos: null, recorrencia: null,
  location_lat: c.loc?.[0] ?? null, location_lng: c.loc?.[1] ?? null, location_name: c.loc?.[2] ?? null,
  created_at: atras(30), created_by: U.gestor.id,
}));
const cl = (card_id: string, ...ids: string[]) => ids.map((label_id) => ({ card_id, label_id }));
const card_labels = [
  ...cl("c-v1", "lb-ig"), ...cl("c-v2", "lb-ig", "lb-cz"), ...cl("c-v3", "lb-bl"), ...cl("c-v4", "lb-ig", "lb-ur"),
  ...cl("c-v5", "lb-in"), ...cl("c-v6", "lb-ig", "lb-cz"), ...cl("c-v7", "lb-ig", "lb-ur"), ...cl("c-v8", "lb-cz"),
  ...cl("c-v11", "lb-bl"), ...cl("c-v12", "lb-cz"), ...cl("c-la1", "lb-la"), ...cl("c-la2", "lb-la"), ...cl("c-ev1", "lb-ev"), ...cl("c-ev2", "lb-ev"),
];
const cm = (card_id: string, ...us: { id: string }[]) => us.map((u) => ({ card_id, user_id: u.id }));
const card_members = [
  ...cm("c-v1", U.colab), ...cm("c-v2", U.colab, U.vend2), ...cm("c-v3", U.vend2), ...cm("c-v4", U.colab, U.closer),
  ...cm("c-v5", U.gestor), ...cm("c-v6", U.closer), ...cm("c-v7", U.colab), ...cm("c-v8", U.vend2),
  ...cm("c-v11", U.gestor), ...cm("c-v12", U.colab, U.gestor), ...cm("c-la1", U.gestor), ...cm("c-la2", U.vend2),
  ...cm("c-ev1", U.closer, U.colab),
];
const checklists = [
  { id: "ck-v3", card_id: "c-v3", title: "Etapas", position: 1 },
  { id: "ck-v4", card_id: "c-v4", title: "Gravação", position: 1 },
  { id: "ck-v12", card_id: "c-v12", title: "Páginas", position: 1 },
];
const item = (id: string, checklist_id: string, is_done: boolean) => ({ id, checklist_id, is_done, due_date: null, text: "Item", position: 1 });
const checklist_items = [
  item("i1", "ck-v3", true), item("i2", "ck-v3", true), item("i3", "ck-v3", false),
  item("i4", "ck-v4", true), item("i5", "ck-v4", false), item("i6", "ck-v4", false), item("i7", "ck-v4", false),
  item("i8", "ck-v12", true), item("i9", "ck-v12", false),
];
const custom_fields = [
  { id: "f-canal", board_id: B.ed, name: "Formato", type: "select", position: 1, options: [
    { id: "o-post", label: "Post", color: "purple" }, { id: "o-video", label: "Vídeo", color: "red" },
    { id: "o-texto", label: "Texto", color: "green" }, { id: "o-email", label: "E-mail", color: "blue" },
  ] },
];
const fv = (card_id: string, value: string) => ({ card_id, field_id: "f-canal", value });
const field_values = [
  fv("c-v1", "o-post"), fv("c-v2", "o-post"), fv("c-v3", "o-texto"), fv("c-v4", "o-video"), fv("c-v5", "o-texto"),
  fv("c-v6", "o-video"), fv("c-v7", "o-post"), fv("c-v8", "o-post"), fv("c-v11", "o-email"), fv("c-v12", "o-texto"),
];

export const FX: Record<string, unknown> = {
  mkt_workspaces: porRota("mkt_workspaces", () => [{ id: WS, name: "Marketing", created_at: atras(120) }]),
  mkt_boards: porRota("mkt_boards", () => boards),
  mkt_lists: porRota("mkt_lists", () => lists),
  mkt_labels: porRota("mkt_labels", () => labels),
  mkt_cards: porRota("mkt_cards", () => cards),
  mkt_card_labels: porRota("mkt_card_labels", () => card_labels),
  mkt_card_members: porRota("mkt_card_members", () => card_members),
  mkt_checklists: porRota("mkt_checklists", () => checklists),
  mkt_checklist_items: porRota("mkt_checklist_items", () => checklist_items),
  mkt_comments: porRota("mkt_comments", () => []),
  mkt_card_attachments: porRota("mkt_card_attachments", () => []),
  mkt_custom_fields: porRota("mkt_custom_fields", () => custom_fields),
  mkt_card_field_values: porRota("mkt_card_field_values", () => field_values),
};
export const RPC_FX: Record<string, unknown> = {
  carbo_team_members: rpcPorRota("carbo_team_members", () => Object.values(U)),
};
