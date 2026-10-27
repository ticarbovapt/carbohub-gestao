// Dados FICTÍCIOS dos prints da Documentação do Carbo Finanças (README.md).
import { PAPEL, U, EU } from "./pessoas";
import { vendas } from "./fx_vendas";
import { produtos, faixas, tiers, pedidosEdit } from "./fx_vender";
import { FX_AREAS, RPC_AREAS } from "./areas";

export const USUARIO = { auth: { id: EU.id, email: EU.email, user_metadata: { full_name: EU.full_name } } };
const agora = Date.now();
const min = (m: number) => new Date(agora - m * 60000).toISOString();

export const FIXTURES: Record<string, unknown> = {
  profiles: () => [EU, ...Object.values(U).filter((x) => x.id !== EU.id)],
  carbo_functions: [
    { department: "financeiro", function_key: "analista", label: "Analista", access_level: "colaborador", is_active: true },
    { department: "financeiro", function_key: "gerente", label: "Coordenadora", access_level: "gestor", is_active: true },
  ],
  carbo_departments: [{ key: "financeiro", label: "Financeiro", sigla: "FIN" }],
  carbo_usuario_bloqueio_log: [],
  carbo_status_aviso: [],
  notifications: [
    { id: "n1", user_id: EU.id, type: "crm_lead", title: "Pedido liberado para faturar", body: "V2026100088 · Posto Horizonte · R$ 1.560,00", is_read: false, reference_type: null, reference_id: null, created_at: min(25) },
    { id: "n2", user_id: EU.id, type: "mention", title: "Marina Alves mencionou você", body: "Contas a pagar: \"confere o boleto da Gráfica Norte?\"", is_read: false, reference_type: null, reference_id: null, created_at: min(140) },
    { id: "n3", user_id: EU.id, type: "bug_fixed", title: "Bug corrigido", body: "O filtro de mês voltou a valer depois do F5.", is_read: true, reference_type: "bug", reference_id: "b1", created_at: min(60 * 26) },
  ],
  carbo_bug_reports: [
    { id: "b1", app: "financas", kind: "bug", title: "Filtro de mês do Faturamento voltava para hoje", description: "Escolhendo setembro e apertando F5, a tela voltava ao mês atual.", status: "resolved", reporter_id: EU.id, reporter_name: EU.full_name, created_at: min(60 * 30), updated_at: min(60 * 26), archived_at: null, admin_notes: "Corrigido na versão de hoje.", url: "/faturamento", severity: null, reach: null },
    { id: "b2", app: "financas", kind: "sugestao", title: "Exportar as contas a pagar em planilha", description: "Ajudaria a fechar o mês com o financeiro.", status: "open", reporter_id: EU.id, reporter_name: EU.full_name, created_at: min(60 * 5), updated_at: min(60 * 5), archived_at: null, admin_notes: null, url: "/faturamento", severity: null, reach: "meu_time" },
  ],
  mrp_products: produtos,
  carbo_faixa_preco: faixas,
  discount_approval_config: [{ enabled: true }],
  discount_approval_tiers: tiers,
  prazo_config: [{ enabled: true, min_business_days: 3, ship_offset_days: 1 }],
  vendedor_estoque: [],
  carboze_orders: () => [...pedidosEdit, ...vendas(PAPEL)],
  carbo_vendas_metrica: () => vendas(PAPEL),
  purchase_requests: [
    { id: "rc-a", rc_number: "RC-2026-0041", status: "aguardando_aprovacao", created_at: min(60 * 5) },
    { id: "rc-b", rc_number: "RC-2026-0042", status: "aguardando_aprovacao", created_at: min(60 * 2) },
  ],
  ...FX_AREAS,
};

export const RPC: Record<string, unknown> = {
  record_app_access: null,
  carbo_all_profiles: () => Object.values(U).map((x) => ({ id: x.id, full_name: x.full_name, username: x.username, email: x.email })),
  crm_list_vendedores: () => (PAPEL === "gestor" ? Object.values(U) : [EU]).map((x) => ({ id: x.id, full_name: x.full_name, avatar_url: x.avatar_url, department: x.department, secondary_department: null, is_vendedor: true })),
  carbo_clientes_busca: () => [],
  carbo_vendas_busca: () => vendas(PAPEL),
  // Início: os cartões do topo (as áreas podem sobrescrever com a mesma forma).
  fin_payables_aging: [
    { bucket: "vencido_1_30", qtd: 3, total: 4280.5 }, { bucket: "vence_hoje", qtd: 2, total: 1890 },
    { bucket: "a_vencer_7", qtd: 6, total: 12640.75 }, { bucket: "a_vencer_30", qtd: 14, total: 38210 },
  ],
  fin_receivables_aging: [
    { bucket: "vencido_1_30", qtd: 4, total: 6920 }, { bucket: "a_vencer_7", qtd: 9, total: 18450 },
    { bucket: "a_vencer_30", qtd: 21, total: 52300 },
  ],
  fin_cashflow_weekly: () => Array.from({ length: 8 }, (_, i) => ({ semana: new Date(Date.now() + i * 7 * 864e5).toISOString().slice(0, 10), entrada: [18450, 14200, 12100, 9800, 11300, 8700, 10400, 9100][i], saida: [16100, 12900, 13400, 8100, 9900, 7600, 8800, 9500][i] })),
  ...RPC_AREAS,
};
