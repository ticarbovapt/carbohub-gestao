// Dados FICTÍCIOS dos prints da Documentação do Carbo Sales (README.md).
import { PAPEL, U, EU } from "./pessoas";
import { vendas } from "./fx_vendas";
import { produtos, faixas, tiers, pedidosEdit } from "./fx_vender";
import { leads, leadFixtures, rpcCrm } from "./fx_crm";
import { FX_AREAS, RPC_AREAS } from "./areas";

export const USUARIO = { auth: { id: EU.id, email: EU.email, user_metadata: { full_name: EU.full_name } } };
const agora = Date.now();
const min = (m: number) => new Date(agora - m * 60000).toISOString();

export const FIXTURES: Record<string, unknown> = {
  profiles: () => [EU, ...Object.values(U).filter((x) => x.id !== EU.id)],
  carbo_functions: [
    { department: "comercial", function_key: "vendedor", label: "Vendedor", access_level: "colaborador", is_active: true },
    { department: "comercial", function_key: "gerente", label: "Gerente Comercial", access_level: "gestor", is_active: true },
  ],
  carbo_departments: [{ key: "comercial", label: "Comercial", sigla: "COM" }],
  carbo_usuario_bloqueio_log: [],
  carbo_status_aviso: [],
  notifications: [
    { id: "n1", user_id: EU.id, type: "crm_lead", title: "Lead repassado para você", body: "Posto Estrela do Sul entrou no Inbound.", is_read: false, reference_type: "crm_lead", reference_id: "i1", created_at: min(25) },
    { id: "n2", user_id: EU.id, type: "mention", title: "Marina Alves comentou no seu card", body: "Rede Litoral: \"liga amanhã cedo, o dono decide até sexta\"", is_read: false, reference_type: "crm_lead", reference_id: "c4", created_at: min(140) },
    { id: "n3", user_id: EU.id, type: "bug_fixed", title: "Bug corrigido", body: "O filtro do pipeline voltou a funcionar.", is_read: true, reference_type: "bug", reference_id: "b1", created_at: min(60 * 26) },
  ],
  carbo_bug_reports: [
    { id: "b1", app: "crm", kind: "bug", title: "Filtro do pipeline não aplicava a etapa", description: "Ao escolher a etapa, a lista continuava igual.", status: "resolved", reporter_id: EU.id, reporter_name: EU.full_name, created_at: min(60 * 30), updated_at: min(60 * 26), archived_at: null, admin_notes: "Corrigido na versão de hoje.", url: "/funis", severity: null, reach: null },
    { id: "b2", app: "crm", kind: "sugestao", title: "Mostrar a cidade do posto no card", description: "Ajudaria a planejar as visitas por região.", status: "open", reporter_id: EU.id, reporter_name: EU.full_name, created_at: min(60 * 5), updated_at: min(60 * 5), archived_at: null, admin_notes: null, url: "/funis", severity: null, reach: "meu_time" },
  ],
  mrp_products: produtos,
  carbo_faixa_preco: faixas,
  discount_approval_config: [{ enabled: true }],
  discount_approval_tiers: tiers,
  prazo_config: [{ enabled: true, min_business_days: 3, ship_offset_days: 1 }],
  vendedor_estoque: [],
  carboze_orders: () => [...pedidosEdit, ...vendas(PAPEL)],
  carbo_vendas_metrica: () => vendas(PAPEL),
  crm_sales_leads: () => leads(PAPEL),
  ...leadFixtures,
  ...FX_AREAS,
};

export const RPC: Record<string, unknown> = {
  record_app_access: null,
  carbo_all_profiles: () => Object.values(U).map((x) => ({ id: x.id, full_name: x.full_name, username: x.username, email: x.email })),
  crm_list_vendedores: () => (PAPEL === "gestor" ? Object.values(U) : [EU]).map((x) => ({ id: x.id, full_name: x.full_name, avatar_url: x.avatar_url, department: x.department, secondary_department: null, is_vendedor: true })),
  carbo_clientes_busca: () => [],
  carbo_vendas_busca: () => vendas(PAPEL),
  ...rpcCrm(PAPEL),
  ...RPC_AREAS,
};
