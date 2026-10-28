// Fixtures da área "usuarios" (ver areas.ts): Usuários (/usuarios),
// Departamentos e funções (/estrutura) e Notificações (/notificacoes, com a
// aba Vendas online). Tudo FICTÍCIO — nenhuma pessoa é real.
//
// ⚠️ `profiles`, `carbo_departments` e `carbo_functions` são lidas por TODAS as
// telas (barra do topo, chat, AuthContext). Respondem por ROTA: nas nossas
// rotas, a lista maior (com as 4 pessoas de U, mesmos ids); fora delas, a
// base (a mesma do fixtures.ts — recriada aqui, porque importar o fixtures.ts
// daria import circular).
import { PAPEL, U, EU } from "./pessoas";
void PAPEL;

const rota = () => { try { return location.pathname; } catch { return ""; } };
const NOSSAS = ["/usuarios", "/estrutura", "/ecommerce/avisos-de-venda", "/notificacoes"];
const naNossa = () => NOSSAS.some((r) => rota().startsWith(r));
const porRota = (meu: () => unknown, base: () => unknown) => () => (naNossa() ? meu() : base());

const agora = Date.now();
const dias = (d: number) => new Date(agora - d * 86400000).toISOString();

// ── Base (igual à do fixtures.ts) ───────────────────────────────────────────
const baseProfiles = () => [EU, ...Object.values(U).filter((x) => x.id !== EU.id)];
const baseFunctions = [
  { department: "ti_suporte", function_key: "analista", label: "Analista", access_level: "colaborador", is_active: true },
  { department: "ti_suporte", function_key: "gerente", label: "Gerente", access_level: "gestor", is_active: true },
];
const baseDepartments = [{ key: "ti_suporte", label: "TI / Suporte", sigla: "TI" }];

// ── Departamentos e funções ─────────────────────────────────────────────────
const D = (i: number, key: string, label: string, sigla: string, color: string) =>
  ({ id: `d-${key}`, key, label, sigla, color, sort_order: i, is_active: true });
const departamentos = [
  D(1, "command", "Diretoria", "CMD", "#0f172a"),
  D(2, "comercial", "Comercial", "COM", "#16a34a"),
  D(3, "ops", "Operações", "OPS", "#f59e0b"),
  D(4, "financeiro", "Financeiro", "FIN", "#0d9488"),
  D(5, "marketing", "Marketing", "MKT", "#db2777"),
  D(6, "atendimento", "Atendimento", "ATD", "#9333ea"),
  D(7, "ti_suporte", "TI / Suporte", "TI", "#0ea5e9"),
];
const F = (department: string, function_key: string, label: string, hierarchy_order: number, access_level: "gestor" | "colaborador") =>
  ({ id: `f-${department}-${function_key}`, department, function_key, label, hierarchy_order, access_level, is_active: true });
const funcoes = [
  F("command", "ceo", "CEO", 1, "gestor"),
  F("comercial", "head", "Head Comercial", 1, "gestor"),
  F("comercial", "coordenador", "Coordenador de Vendas", 2, "gestor"),
  F("comercial", "vendedor", "Vendedor", 3, "colaborador"),
  F("comercial", "sdr", "SDR", 4, "colaborador"),
  F("ops", "coordenador", "Coordenadora de Operações", 1, "gestor"),
  F("ops", "analista", "Analista de Logística", 2, "colaborador"),
  F("financeiro", "gerente", "Gerente Financeiro", 1, "gestor"),
  F("financeiro", "analista", "Analista Financeiro", 2, "colaborador"),
  F("marketing", "designer", "Designer", 2, "colaborador"),
  F("atendimento", "atendente", "Atendente", 2, "colaborador"),
  F("ti_suporte", "gerente", "Gerente", 1, "gestor"),
  F("ti_suporte", "analista", "Analista", 2, "colaborador"),
];

// ── Pessoas ─────────────────────────────────────────────────────────────────
const CORES = ["#3BC770", "#0EA5E9", "#F59E0B", "#8B5CF6", "#EC4899", "#14B8A6"];
let k = 0;
const avatar = (nome: string) => {
  const ini = nome.split(" ").map((x) => x[0]).slice(0, 2).join("");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'><rect width='96' height='96' fill='${CORES[k++ % CORES.length]}'/><text x='48' y='60' font-family='Arial' font-size='38' font-weight='700' fill='white' text-anchor='middle'>${ini}</text></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
};
type P = Record<string, unknown>;
const pessoa = (id: string, full_name: string, username: string, department: string, funcao: string, ifaces: string[], extra: P = {}): P => ({
  id, full_name, username, avatar_url: avatar(full_name), department, funcao,
  secondary_department: null, secondary_funcao: null, allowed_interfaces: ifaces,
  escopo: null, email: `${username.toLowerCase()}@exemplo.com.br`, phone: "(84) 99999-0000",
  status: "approved", manager_user_id: null, is_vendedor: false, created_at: dias(120), ...extra,
});
export const ID = { carla: "u-carla", diego: "u-diego", paula: "u-paula", thiago: "u-thiago", julia: "u-julia", helena: "u-helena" };

const meusProfiles = (): P[] => [
  // As 4 de U: mesmos ids e nomes (a barra do topo e o AuthContext dependem deles).
  { ...U.gestor, status: "approved", is_vendedor: false, created_at: dias(400), allowed_interfaces: ["carbo_ti", "carbo_admin", "carbo_crm", "carbo_ops_app"], escopo: "Acessos, sistemas e suporte ao time" },
  { ...U.colab, status: "approved", is_vendedor: false, created_at: dias(200), manager_user_id: U.gestor.id, allowed_interfaces: ["carbo_ti", "carbo_crm"] },
  { ...U.vend2, username: "COM0003", email: "com0003@exemplo.com.br", department: "comercial", funcao: "vendedor", status: "approved", is_vendedor: true, created_at: dias(150), manager_user_id: U.closer.id, allowed_interfaces: ["carbo_crm", "carbo_ops"] },
  { ...U.closer, username: "COM0001", email: "com0001@exemplo.com.br", department: "comercial", funcao: "head", status: "approved", is_vendedor: true, created_at: dias(300), allowed_interfaces: ["carbo_crm", "carbo_prevendas", "carbo_admin"] },
  pessoa(ID.helena, "Helena Duarte", "CMD0001", "command", "ceo", ["carbo_admin", "carbo_crm", "carbo_ops_app", "carbo_financas", "carbo_mkt", "carbo_ti"], { created_at: dias(500) }),
  pessoa(ID.carla, "Carla Mendes", "OPS0003", "ops", "coordenador", ["carbo_ops_app", "carbo_ops", "carbo_crm"], { escopo: "Expedição, estoque e viagens", manager_user_id: ID.helena, is_vendedor: true }),
  pessoa(ID.diego, "Diego Ramos", "FIN0004", "financeiro", "analista", ["carbo_financas"], { manager_user_id: ID.helena, secondary_department: "ops", secondary_funcao: "analista" }),
  pessoa(ID.paula, "Paula Nogueira", "MKT0002", "marketing", "designer", ["carbo_mkt"], { email: "mkt0002@carbo.internal", created_at: dias(3) }),
  pessoa(ID.julia, "Júlia Pires", "ATD0001", "atendimento", "atendente", ["carbo_atendimento", "carbo_crm"]),
  pessoa(ID.thiago, "Thiago Freitas", "COM0007", "comercial", "sdr", ["carbo_prevendas"], { manager_user_id: U.closer.id }),
];

// ── Quem recebe a venda on-line ─────────────────────────────────────────────
const aviso = (p: P, e_head: boolean, recebe: boolean, extra: P = {}) => ({
  id: p.id, nome: p.full_name, avatar_url: p.avatar_url,
  departamento: p.department, funcao: p.funcao,
  departamento_2: p.secondary_department ?? null, funcao_2: p.secondary_funcao ?? null,
  e_head, recebe, ligado_em: null, ligado_por_nome: null, desligado_em: null, desligado_por_nome: null, ...extra,
});
const listaAviso = () => {
  const ps = Object.fromEntries(meusProfiles().map((p) => [p.id as string, p]));
  return [
    aviso(ps[ID.helena], true, true, { ligado_em: dias(7), ligado_por_nome: "Marina Alves" }),
    aviso(ps[U.closer.id], true, true, { ligado_em: dias(7), ligado_por_nome: "Marina Alves" }),
    aviso(ps[U.gestor.id], false, true, { ligado_em: dias(6), ligado_por_nome: "Marina Alves" }),
    aviso(ps[ID.julia], false, true, { ligado_em: dias(2), ligado_por_nome: "Marina Alves" }),
    aviso(ps[ID.carla], false, false, { desligado_em: dias(5), desligado_por_nome: "Marina Alves" }),
    aviso(ps[U.vend2.id], false, false),
    aviso(ps[ID.diego], false, false),
    aviso(ps[U.colab.id], false, false),
  ];
};

// ── Notificações (a mesma forma do `carbo_notif_painel`) ────────────────────
const ABAS = [
  ["venda_interna", "Vendas internas", "O \"🎉 Nova venda!\" de cada venda feita pelo /vender.", "app", ["carbo_crm", "carbo_admin"]],
  ["venda_online", "Vendas online", "A venda do e-commerce (som, toast, sininho e celular). Só recebe quem for ligado à mão.", "lista", []],
  ["ecommerce", "E-commerce e Esteira", "Resumo diário dos pedidos parados na Esteira, etiqueta morta e canal de e-commerce desconectado.", "app", ["carbo_admin", "carbo_mkt", "carbo_atendimento"]],
  ["atendimento", "Mensagem de cliente", "Cliente respondeu no WhatsApp. A lista é a da tela Conversas, no Atendimento.", "lista", []],
  ["marketing", "Quadros do Marketing", "Menção, prazo, lembrete, cartão seguido e quadro compartilhado.", "app", ["carbo_mkt"]],
  ["financas", "Finanças e Compras", "Requisição de compra esperando aprovação e ordem de compra nova.", "app", ["carbo_financas"]],
  ["estoque", "Estoque e Operação", "Estoque baixo na caixa de vendedor e nas máquinas.", "app", ["carbo_ops"]],
  ["ti", "TI e Academy", "Chamado novo, chamado atribuído e pedido de acesso a curso do Academy.", "app", ["carbo_ti"]],
  ["chat", "Carbo Chat", "Mensagem e lembrete de comunicado do chat.", "pessoal", []],
  ["pessoal", "Avisos para você", "Avisos dirigidos à pessoa: menção, o próprio chamado, a NF cancelada da própria venda, curso liberado.", "pessoal", []],
].map(([aba, rotulo, descricao, modo, apps], i) => ({ aba, rotulo, descricao, modo, apps, ordem: (i + 1) * 10 }));
const T = (aba: string, tipo: string, rotulo: string, linhas_30d: number, pessoas_30d: number, referencia = "") =>
  ({ aba, tipo, referencia, rotulo, descricao: "", linhas_30d, pessoas_30d });
const painel = () => ({
  filtro_ativo: true,
  abas: ABAS,
  tipos: [
    T("venda_interna", "ecommerce_sale", "Nova venda", 2310, 33, "carboze_order"),
    T("venda_online", "ecommerce_sale", "Venda on-line", 8420, 4, "ecommerce_order"),
    T("ecommerce", "esteira_parado_resumo", "Pedidos parados", 990, 33),
    T("ecommerce", "esteira_etiqueta_morta", "Etiqueta morta", 132, 33),
    T("ecommerce", "ecommerce_disconnected", "E-commerce caído", 12, 6),
    T("marketing", "mkt_mencao", "Menção no quadro", 84, 9),
    T("marketing", "mkt_prazo", "Prazo e lembrete", 311, 11),
    T("marketing", "mkt_quadro", "Quadro compartilhado", 9, 5),
    T("marketing", "mkt_seguindo", "Cartão seguido", 57, 4),
    T("financas", "finance_rc_pendente", "Requisição a aprovar", 46, 7),
    T("financas", "finance_oc_nova", "Ordem de compra nova", 38, 7),
    T("estoque", "estoque_vendedor_baixo", "Caixa de vendedor baixa", 64, 8),
    T("ti", "bug_report", "Chamado novo", 120, 5),
    T("ti", "academy_acesso", "Pedido de acesso ao Academy", 14, 3),
    T("chat", "chat_message", "Mensagem no chat", 4120, 31),
    T("pessoal", "mention", "Menção", 22, 12),
    T("pessoal", "bug_resolved", "Seu chamado resolvido", 41, 17),
  ],
  sem_aba: [{ tipo: "cobranca_atrasada", referencia: "", linhas_30d: 66, pessoas_30d: 33 }],
  pessoas: meusProfiles().map((p) => ({
    id: p.id, nome: p.full_name, avatar_url: p.avatar_url, departamento: p.department, funcao: p.funcao,
    departamento_2: p.secondary_department ?? null, funcao_2: p.secondary_funcao ?? null, apps: p.allowed_interfaces ?? [],
  })),
  escolhas: [
    { user_id: ID.helena, aba: "marketing", recebe: false, definido_em: dias(2), definido_por_nome: "Marina Alves" },
    { user_id: ID.diego, aba: "marketing", recebe: true, definido_em: dias(1), definido_por_nome: "Marina Alves" },
  ],
});

export const FX: Record<string, unknown> = {
  profiles: porRota(meusProfiles, baseProfiles),
  carbo_departments: porRota(() => departamentos, () => baseDepartments),
  carbo_functions: porRota(() => funcoes, () => baseFunctions),
  carbo_usuarios_bloqueados: porRota(() => [{ user_id: ID.thiago }], () => []),
};
export const RPC_FX: Record<string, unknown> = {
  carbo_aviso_venda_online_lista: listaAviso,
  carbo_aviso_venda_online_definir: null,
  carbo_notif_painel: painel,
  carbo_notif_definir: null,
};
