// Fixtures da área "comercial" (ver areas.ts): Metas, PDVs, Minha Equipe e Carbo Chat.
// Tudo FICTÍCIO — nenhum ponto, CNPJ ou pessoa real.
import { PAPEL, U, EU } from "./pessoas";

const agora = Date.now();
const min = (m: number) => new Date(agora - m * 60000).toISOString();
const dia = (d: number) => new Date(agora - d * 864e5).toISOString().slice(0, 10);
const G = PAPEL === "gestor";
// Avatar de iniciais para as pessoas que só existem nesta área.
const av = (nome: string, cor: string) => "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'><rect width='96' height='96' fill='${cor}'/><text x='48' y='60' font-family='Arial' font-size='38' font-weight='700' fill='white' text-anchor='middle'>${nome.split(" ").map((x) => x[0]).slice(0, 2).join("")}</text></svg>`);
const DIEGO = { id: "u-v4", full_name: "Diego Martins", avatar_url: av("Diego Martins", "#EC4899") };
const CARLA = { id: "u-v5", full_name: "Carla Mendes", avatar_url: av("Carla Mendes", "#14B8A6") };
const PATRICIA = { id: "u-v6", full_name: "Patrícia Rocha", avatar_url: av("Patrícia Rocha", "#6366F1") };

// ── Metas (crm_metas_board) ─────────────────────────────────────────────────
// O servidor só manda R$ para gestor; para o colaborador os valores vêm nulos.
const vend = (u: { id: string; full_name: string; avatar_url: string }, dep: string, meta: number, real: number, prev: number, sem: number, qtd: number) => ({ u, dep, meta, real, prev, sem, qtd });
const METAS = [
  vend(U.colab, "cgc", 40000, 31200, 27800, 9100, 14),
  vend(U.vend2, "cgc", 35000, 36400, 30100, 10200, 17),
  vend(U.closer, "cgc", 30000, 17900, 21500, 3800, 8),
  vend(DIEGO, "expansao", 25000, 21300, 18200, 6400, 9),
  vend(CARLA, "expansao", 25000, 11200, 14900, 2100, 5),
];
const tt = METAS.reduce((s, m) => s + m.meta, 0);
const ta = METAS.reduce((s, m) => s + m.real, 0);
const metasBoard = () => METAS.map((m) => ({
  vendedor_id: m.u.id, full_name: m.u.full_name, avatar_url: m.u.avatar_url || null,
  department: m.dep, secondary_department: null,
  target_amount: G ? m.meta : null, actual_amount: G ? m.real : null, prev_amount: G ? m.prev : null,
  week_amount: G ? m.sem : null, actual_qty: G ? m.qtd : null,
  pct_amount: Math.round((m.real / m.meta) * 1000) / 10,
  pct_week: Math.round(((m.sem * 4) / m.meta) * 1000) / 10,
  team_target: G ? tt : null, team_actual: G ? ta : null, team_pct: Math.round((ta / tt) * 1000) / 10,
}));

// ── Pontos de Venda (carbo_pdvs_painel) ─────────────────────────────────────
const mix = (a: string, b: string, c: string, pa: number | null = null, pb: number | null = null, pc: number | null = null) => ({
  "10ml": { oferece: a, preco: pa }, "100ml": { oferece: b, preco: pb }, "1l": { oferece: c, preco: pc },
});
const pdv = (o: Record<string, unknown>) => ({
  legal_name: null, address_zip: null, contact_name: null, contact_phone: null, email: null, notes: null,
  created_at: min(90 * 1440), updated_at: min(1440), opened_at: null, is_micro: false, micro_desde: null,
  owner_seller_id: null, owner_seller_name: null, pedidos: 0, total_comprado: 0, ultima_compra: null,
  primeira_compra: null, sem_documento: false, mix: {}, ...o,
  cnpj_digits: String(o.cnpj ?? "").replace(/\D/g, ""),
});
const PDVS = [
  pdv({ id: "p1", pdv_code: "PDV-0012", name: "Posto Ponta Negra", legal_name: "Ponta Negra Comércio de Combustíveis Ltda", cnpj: "11222333000181", address_street: "Av. Engenheiro Roberto Freire, 1200 – Ponta Negra", address_city: "Natal", address_state: "RN", address_zip: "59090000", contact_name: "Sr. Carlos", contact_phone: "(84) 99876-1122", status: "active", opened_at: dia(320), owner_seller_id: U.colab.id, owner_seller_name: U.colab.full_name, pedidos: 9, total_comprado: 14820, ultima_compra: dia(6), primeira_compra: dia(300), mix: mix("sim", "sim", "nao", 12.9, 34.9) }),
  pdv({ id: "p2", pdv_code: "PDV-0027", name: "Auto Posto Planalto", legal_name: "Planalto Derivados de Petróleo Ltda", cnpj: "22333444000172", address_street: "Rua das Acácias, 455 – Planalto", address_city: "Natal", address_state: "RN", address_zip: "59073100", status: "active", opened_at: dia(200), owner_seller_id: U.vend2.id, owner_seller_name: U.vend2.full_name, pedidos: 5, total_comprado: 7640, ultima_compra: dia(19), primeira_compra: dia(180), mix: mix("sim", "a_confirmar", "a_confirmar", 13.5) }),
  pdv({ id: "p3", pdv_code: "PDV-0031", name: "Posto Caminho do Sol", cnpj: "33444555000163", address_street: "BR-101, km 34", address_city: "Ipojuca", address_state: "PE", status: "active", owner_seller_id: U.colab.id, owner_seller_name: U.colab.full_name, pedidos: 3, total_comprado: 4980, ultima_compra: dia(41), primeira_compra: dia(120), mix: mix("sim", "sim", "sim", 12.9, 36.9, 189.9), is_micro: true, micro_desde: dia(60) }),
  pdv({ id: "p4", pdv_code: "PDV-0044", name: "Posto Alto do Moura", cnpj: "44555666000154", address_city: "Caruaru", address_state: "PE", status: "registered", owner_seller_id: U.colab.id, owner_seller_name: U.colab.full_name, mix: mix("a_confirmar", "a_confirmar", "a_confirmar") }),
  pdv({ id: "p5", pdv_code: "PDV-0045", name: "Conveniência Serra Verde", address_street: "Rua Projetada, s/n", address_city: "Parnamirim", address_state: "RN", status: "registered", sem_documento: true, cnpj: null, mix: mix("sim", "nao", "nao", 14.0) }),
  pdv({ id: "p6", pdv_code: "PDV-0008", name: "Posto Boa Viagem", legal_name: "Boa Viagem Combustíveis Eireli", cnpj: "55666777000145", address_street: "Av. Conselheiro Aguiar, 3100 – Boa Viagem", address_city: "Recife", address_state: "PE", status: "suspended", owner_seller_id: U.vend2.id, owner_seller_name: U.vend2.full_name, pedidos: 4, total_comprado: 3120, ultima_compra: dia(95), primeira_compra: dia(260), mix: mix("sim", "sim", "nao", 12.5, 33.9) }),
  pdv({ id: "p7", pdv_code: "PDV-0003", name: "Posto Avenida Norte", cnpj: "66777888000136", address_city: "Natal", address_state: "RN", status: "inactive", pedidos: 1, total_comprado: 780, ultima_compra: dia(240), primeira_compra: dia(240), mix: mix("nao", "nao", "nao") }),
];
const pedidosPdv = [
  { id: "o1", order_number: "V2026100031", created_at: min(6 * 1440), sale_date: dia(6), total: 2340, status: "invoiced", segmento: "revenda", nf_numero: "000412", nf_situacao: "Autorizada", vendedor_name: U.colab.full_name, conta_metrica: true },
  { id: "o2", order_number: "V2026090077", created_at: min(37 * 1440), sale_date: dia(37), total: 1980, status: "delivered", segmento: "revenda", nf_numero: "000388", nf_situacao: "Autorizada", vendedor_name: U.colab.full_name, conta_metrica: true },
  { id: "o3", order_number: "V2026080142", created_at: min(70 * 1440), sale_date: dia(70), total: 1560, status: "delivered", segmento: "revenda", nf_numero: "000301", nf_situacao: "Autorizada", vendedor_name: U.colab.full_name, conta_metrica: true },
  { id: "o4", order_number: "V2026080019", created_at: min(85 * 1440), sale_date: null, total: 620, status: "quote", segmento: "revenda", nf_numero: null, nf_situacao: null, vendedor_name: U.colab.full_name, conta_metrica: false },
];

// ── Minha Equipe (carbo_team_members) ───────────────────────────────────────
const equipe = () => [
  ...[U.gestor, U.colab, U.vend2, U.closer].map((x) => ({
    id: x.id, full_name: x.full_name, avatar_url: x.avatar_url, username: x.username, email: x.email,
    department: "comercial", funcao: x.funcao, secondary_department: null, secondary_funcao: null,
  })),
  { ...DIEGO, username: "COM012", email: "com012@carbo.internal", department: "comercial", funcao: "vendedor", secondary_department: null, secondary_funcao: null },
  { ...PATRICIA, username: "COM014", email: "patricia.rocha@exemplo.com.br", department: "comercial", funcao: "vendedor", secondary_department: null, secondary_funcao: null },
];

// ── Carbo Chat ──────────────────────────────────────────────────────────────
const OUTRO = EU.id === U.colab.id ? U.gestor : U.colab;
const conversas = () => [
  { channel_id: "ch-dm", type: "dm", name: null, is_private: true, channel_avatar: null, other_id: OUTRO.id, other_name: OUTRO.full_name, other_avatar: OUTRO.avatar_url,
    last_body: "Fechou! Lança no /vender que eu aprovo o desconto.", last_kind: "text", last_at: min(4), last_sender_id: OUTRO.id, last_sender_name: OUTRO.full_name,
    unread: 1, last_activity: min(4), muted: false, pinned: true, archived: false, is_announcement: false, needs_ack: false },
  { channel_id: "ch-com", type: "group", name: "Comercial NE", is_private: false, channel_avatar: null, other_id: null, other_name: null, other_avatar: null,
    last_body: "Bom dia, time! Meta da semana no ar.", last_kind: "text", last_at: min(55), last_sender_id: U.gestor.id, last_sender_name: U.gestor.full_name,
    unread: 3, last_activity: min(55), muted: false, pinned: false, archived: false, is_announcement: false, needs_ack: false },
  { channel_id: "ch-avisos", type: "group", name: "Avisos Grupo Carbo", is_private: false, channel_avatar: null, other_id: null, other_name: null, other_avatar: null,
    last_body: "Nova tabela de preços a partir de segunda.", last_kind: "text", last_at: min(300), last_sender_id: U.gestor.id, last_sender_name: U.gestor.full_name,
    unread: 0, last_activity: min(300), muted: false, pinned: false, archived: false, is_announcement: true, needs_ack: false },
  { channel_id: "ch-dm2", type: "dm", name: null, is_private: true, channel_avatar: null, other_id: U.vend2.id, other_name: U.vend2.full_name, other_avatar: U.vend2.avatar_url,
    last_body: "Te mando o CNPJ do posto já já", last_kind: "text", last_at: min(1500), last_sender_id: EU.id, last_sender_name: EU.full_name,
    unread: 0, last_activity: min(1500), muted: false, pinned: false, archived: false, is_announcement: false, needs_ack: false },
  { channel_id: "ch-ops", type: "group", name: "Logística · Pedidos", is_private: true, channel_avatar: null, other_id: null, other_name: null, other_avatar: null,
    last_body: "Pedido V2026100031 saiu para entrega", last_kind: "text", last_at: min(2900), last_sender_id: U.closer.id, last_sender_name: U.closer.full_name,
    unread: 0, last_activity: min(2900), muted: true, pinned: false, archived: false, is_announcement: false, needs_ack: false },
];
const ref = (x: { id: string; full_name: string; avatar_url: string }) => ({ id: x.id, full_name: x.full_name, avatar_url: x.avatar_url });
const msg = (id: string, quem: typeof EU, body: string, m: number, extra: Record<string, unknown> = {}) => ({
  id, channel_id: "ch-dm", sender_id: quem.id, kind: "text", body, reply_to_id: null, mentions: [], metadata: {},
  created_at: min(m), edited_at: null, deleted_at: null, sender: ref(quem), attachments: [], reactions: [], ...extra,
});
// ⚠️ O mock ignora `.order()` e a tela inverte a lista (vem do banco da mais
// nova para a mais antiga): por isso a ordem aqui é DESCENDENTE.
const mensagens = () => [
  msg("m1", EU, "Oi! Saí agora da Rede Litoral. Eles querem os 4 postos, mas pediram 8% no primeiro pedido.", 42),
  msg("m2", OUTRO, "Boa! Qual o volume que eles falaram?", 38),
  msg("m3", EU, "Uns 1.500 carros por dia somando os quatro. Decidem até sexta.", 35),
  msg("m4", OUTRO, "Pode dar os 8% só neste primeiro pedido. Do segundo em diante, tabela.", 12, { reactions: [{ message_id: "m4", user_id: EU.id, emoji: "👍" }] }),
  msg("m5", OUTRO, "Fechou! Lança no /vender que eu aprovo o desconto.", 4),
].reverse();
const membros = () => [EU, OUTRO].map((x) => ({ user_id: x.id, role: "member", last_read_at: min(5), last_delivered_at: min(4) }));

export const FX: Record<string, unknown> = {
  chat_messages: mensagens,
  chat_channel_members: membros,
  chat_attachments: [],
  chat_acks: [],
  chat_scheduled_messages: [],
  chat_user_status: [],
  call_sessions: [],
};
export const RPC_FX: Record<string, unknown> = {
  crm_metas_board: metasBoard,
  carbo_pdv_pedidos: () => pedidosPdv,
  carbo_team_members: equipe,
  chat_conversations: conversas,
  chat_unread_counts: () => conversas().map((c) => ({ channel_id: c.channel_id, unread: c.unread })),
  chat_profiles: () => [EU, OUTRO, U.vend2, U.closer].map(ref),
  chat_statuses: () => [],
  chat_user_info: () => ({ ...ref(OUTRO), department: "comercial", funcao: OUTRO.funcao, email: OUTRO.email }),
  chat_feed_highlights: () => ({ aniversariantes: [], novos_membros: [] }),
  chat_recent_announcements: () => [],
  chat_feed_list: () => [],
  chat_can_announce: () => G,
  chat_directory: () => [],
  chat_public_channels: () => [],
  group_call_state: () => null,
};

// carbo_pdvs_painel é TABELA (view) — vai no FX.
FX.carbo_pdvs_painel = PDVS;
