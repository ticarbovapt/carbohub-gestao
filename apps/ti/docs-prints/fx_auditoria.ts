// Fixtures da área "auditoria" (ver areas.ts): Central de Auditoria,
// Acompanhamento Comercial, Último acesso e Adoção do Carbo Chat.
// Tudo FICTÍCIO — nenhum cliente, loja ou pessoa real. Só RPCs e uma tabela
// própria (crm_stage_sla), nenhuma compartilhada com outra área.
import { PAPEL, U, EU } from "./pessoas";
void PAPEL; void EU;

const agora = Date.now();
const min = (m: number) => new Date(agora - m * 60000).toISOString();
const diaISO = (d: number) => {
  const x = new Date(agora - d * 864e5);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};

// ── Central de Auditoria (admin_audit_feed) ─────────────────────────────────
const ev = (source: string, category: string, m: number, actor: { id: string; full_name: string } | null, action: string, entity: string | null, summary: string, details: Record<string, unknown> | null) => ({
  source, category, event_at: min(m), actor_id: actor?.id ?? null, actor_name: actor?.full_name ?? null, action, entity, summary, details,
});
const FEED = [
  ev("order_status", "Vendas", 12, U.vend2, "Status da venda alterado", "V2026100231", "V2026100231 · Auto Posto Exemplo: Confirmado → Faturado", { pedido: "V2026100231", de: "Confirmado", para: "Faturado", cliente: "Auto Posto Exemplo Ltda" }),
  ev("stock_movement", "Estoque", 38, U.closer, "Saída de estoque", "CarboZé 100ml", "Saída de 24 un. de CarboZé 100ml no Hub Natal (venda V2026100229)", { produto: "CarboZé 100ml", quantidade: 24, galpao: "Hub Natal", origem: "venda" }),
  ev("crm_lead_transfer", "CRM", 75, U.gestor, "Card transferido", "Transportes Modelo", "Card Transportes Modelo passou de Ana Souza para Bruno Lima", { de: "Ana Souza", para: "Bruno Lima", funil: "Inbound" }),
  ev("os_stage", "Produção", 130, U.colab, "Etapa da OP concluída", "OP-2026-0412", "OP-2026-0412 · CarboPRO 1L: Envase concluído", { op: "OP-2026-0412", etapa: "Envase", quantidade: 120 }),
  ev("bling_sync", "Bling", 190, null, "Sincronização do Bling", null, "Sincronização automática: 18 pedidos e 9 notas atualizados", { pedidos: 18, notas: 9, conta: "Matriz" }),
  ev("crm_lead_deletion", "CRM", 260, U.vend2, "Card excluído", "Lead duplicado", "Card \"Posto Teste (duplicado)\" excluído do Outbound", { motivo: "Cadastro em dobro", funil: "Outbound" }),
  ev("rc_approval", "Compras", 420, U.gestor, "Requisição aprovada", "RC-2026-0088", "RC-2026-0088 · Frascos 100ml aprovada (R$ 4.800,00)", { requisicao: "RC-2026-0088", valor: "R$ 4.800,00" }),
  ev("governance", "Governança", 610, U.gestor, "Acesso liberado", "Rafael Costa", "Acesso ao Carbo Ops liberado para Rafael Costa", { sistema: "Carbo Ops", pessoa: "Rafael Costa" }),
];

// ── Acompanhamento Comercial (crm_acompanhamento) ───────────────────────────
const serie = Array.from({ length: 30 }, (_, i) => {
  const d = 29 - i;
  const fds = new Date(agora - d * 864e5).getDay() % 6 === 0;
  const k = (i * 7) % 5;
  return {
    dia: diaISO(d), receita: 0,
    criados: fds ? 1 : 4 + k, ganhos: fds ? 0 : (i % 3 === 0 ? 2 : i % 4 === 0 ? 1 : 0),
    perdidos: fds ? 0 : (i % 5 === 0 ? 1 : 0), movimentados: fds ? 2 : 11 + ((i * 3) % 8),
  };
});
const ACOMP = {
  periodo: { desde: diaISO(29), ate: diaISO(0), vendedor: null },
  valores: {
    estimado_aberto: 186400, orcado_aberto: 94250, orcado_qtd: 14, na_etapa_orcamento: 6,
    na_etapa_orcamento_valor: 38900, sem_orcamento: 33, ganho_periodo: 61780, ganho_qtd: 17,
    perdido_periodo: 22300, perdido_qtd: 6,
  },
  aguardando_por: [],
  serie,
  hoje: { criados: 5, ganhos: 2, perdidos: 0, movimentados: 14, abertos: 47, parados: 9, esquecidos: 4, aguardando: 3, espera_vencida: 2 },
  por_pessoa: [
    { dono: U.vend2.id, abertos: 16, parados: 2, esquecidos: 0, aguardando: 1, pior_dias: 6, valor_aberto: 71200, valor_ganho: 28400 },
    { dono: U.colab.id, abertos: 14, parados: 3, esquecidos: 2, aguardando: 1, pior_dias: 12, valor_aberto: 58300, valor_ganho: 19600 },
    { dono: U.closer.id, abertos: 11, parados: 3, esquecidos: 1, aguardando: 1, pior_dias: 9, valor_aberto: 41900, valor_ganho: 13780 },
    { dono: U.gestor.id, abertos: 6, parados: 1, esquecidos: 1, aguardando: 0, pior_dias: 15, valor_aberto: 15000, valor_ganho: 0 },
  ],
  por_etapa: [
    { funnel_type: "f12", stage: "cadencia", prazo_dias: 7, leads: 12, parados: 2, dias_medio: 4, valor: 24000, com_orcamento: 0 },
    { funnel_type: "f12", stage: "conectado", prazo_dias: 5, leads: 8, parados: 1, dias_medio: 3, valor: 31500, com_orcamento: 0 },
    { funnel_type: "f11", stage: "diagnostico", prazo_dias: 5, leads: 9, parados: 2, dias_medio: 4, valor: 42800, com_orcamento: 2 },
    { funnel_type: "f11", stage: "orcamento", prazo_dias: 3, leads: 6, parados: 3, dias_medio: 5, valor: 38900, com_orcamento: 6 },
    { funnel_type: "f11", stage: "negociacao", prazo_dias: 3, leads: 7, parados: 1, dias_medio: 2, valor: 36200, com_orcamento: 6 },
    { funnel_type: "f13", stage: "nutricao", prazo_dias: 30, leads: 5, parados: 0, dias_medio: 11, valor: 13000, com_orcamento: 0 },
  ],
  motivos: [
    { funnel_type: "f11", motivo: "Preço", n: 3, valor: 12800 },
    { funnel_type: "f11", motivo: "Comprou do concorrente", n: 1, valor: 6200 },
    { funnel_type: "f12", motivo: "Sem perfil", n: 4, valor: 0 },
    { funnel_type: "f12", motivo: "Sem resposta", n: 2, valor: 3300 },
  ],
  lista_esquecidos: [
    { id: "lead-e1", nome: "Transportadora Rota Norte", funnel_type: "f11", stage: "orcamento", dono: U.colab.id, dias_parado: 8, prazo_dias: 3, valor: 9800 },
    { id: "lead-e2", nome: "Auto Posto Boa Viagem (exemplo)", funnel_type: "f12", stage: "cadencia", dono: U.colab.id, dias_parado: 12, prazo_dias: 7, valor: 4200 },
    { id: "lead-e3", nome: "Frota Litoral Logística", funnel_type: "f11", stage: "diagnostico", dono: U.closer.id, dias_parado: 9, prazo_dias: 5, valor: 15600 },
    { id: "lead-e4", nome: "Oficina Diesel Centro", funnel_type: "f13", stage: "negociacao", dono: U.gestor.id, dias_parado: 15, prazo_dias: 3, valor: 3100 },
  ],
  lista_espera_vencida: [
    { id: "lead-w1", nome: "Cooperativa de Transportes Agreste", funnel_type: "f11", stage: "negociacao", dono: U.vend2.id, waiting_on: "decisor", waiting_until: diaISO(3), waiting_note: "Aguardando o diretor voltar de férias", valor: 22400 },
    { id: "lead-w2", nome: "Posto Estrela do Sul (exemplo)", funnel_type: "f12", stage: "conectado", dono: U.closer.id, waiting_on: "cliente", waiting_until: diaISO(1), waiting_note: "Ficou de mandar o volume mensal", valor: 5600 },
  ],
};
const REPASSES = {
  total: { repassados: 19, na_fila_agora: 2 },
  por_sdr: [
    { sdr: U.vend2.id, repassados: 9, na_fila: 1, ganhos: 3, perdidos: 1, sem_qualificacao: 0 },
    { sdr: U.colab.id, repassados: 7, na_fila: 1, ganhos: 1, perdidos: 2, sem_qualificacao: 3 },
    { sdr: U.closer.id, repassados: 3, na_fila: 0, ganhos: 1, perdidos: 0, sem_qualificacao: 1 },
  ],
};
const SLA = [
  ["f11", "diagnostico", 5], ["f11", "orcamento", 3], ["f11", "negociacao", 3], ["f11", "proposta", 4],
  ["f12", "cadencia", 7], ["f12", "conectado", 5], ["f12", "qualificado", 4],
  ["f13", "nutricao", 30], ["f13", "negociacao", 3],
].map(([funnel_type, stage, prazo_dias]) => ({ funnel_type, stage, prazo_dias }));

const LEAD = {
  lead: {
    id: "lead-e1", trade_name: "Transportadora Rota Norte", legal_name: "Rota Norte Transportes Ltda", contact_name: "Paulo Henrique",
    funnel_type: "f11", stage: "orcamento", estimated_revenue: 9800, source: "Indicação", contact_phone: "(84) 98888-1234",
    city: "Natal", state: "RN", created_at: min(60 * 24 * 21), waiting_on: null, waiting_until: null, waiting_note: null,
    qual_volume: "12 caminhões", qual_decisor: "Sócio-gerente", qual_dor: "Consumo alto de diesel", qual_prazo: "Este mês",
  },
  arquivado: false,
  orcamentos: [{ order_id: "o1", order_number: "V2026100188", total: 9800, status: "quote", created_at: min(60 * 24 * 9) }],
  atividades: [
    { id: "a1", activity_type: "note", subject: null, body: "Mandei o orçamento por WhatsApp. Ele vai ver com o sócio.", status: null, due_at: null, done_at: null, stage_from: null, stage_to: null, created_by: U.colab.id, created_by_name: U.colab.full_name, created_at: min(60 * 24 * 8), pinned: false, meta: null },
    { id: "a2", activity_type: "stage_change", subject: null, body: null, status: null, due_at: null, done_at: null, stage_from: "diagnostico", stage_to: "orcamento", created_by: U.colab.id, created_by_name: U.colab.full_name, created_at: min(60 * 24 * 9), pinned: false, meta: null },
    { id: "a3", activity_type: "call", subject: "Ligação de diagnóstico", body: "12 caminhões, rodam no interior. Interesse em CarboPRO.", status: null, due_at: null, done_at: null, stage_from: null, stage_to: null, created_by: U.colab.id, created_by_name: U.colab.full_name, created_at: min(60 * 24 * 14), pinned: false, meta: null },
  ],
};

// ── Último acesso (get_last_login_summary) ──────────────────────────────────
const lg = (user_id: string, full_name: string, user_area: string, department: string | null, funcao: string | null, last: number | null, last_app: string | null, extra: Partial<{ region: string; orders: number; repo: number; dep2: string; fn2: string }> = {}) => ({
  user_id, full_name, department, funcao, secondary_department: extra.dep2 ?? null, secondary_funcao: extra.fn2 ?? null,
  last_login_at: last == null ? null : min(last), user_area, region: extra.region ?? null,
  orders_last_30_days: extra.orders ?? 0, last_replenishment_at: extra.repo == null ? null : min(extra.repo),
  last_app, last_app_at: last == null ? null : min(last),
});
const LOGINS = [
  lg(U.gestor.id, U.gestor.full_name, "internal", "ti_suporte", "gerente", 8, "carbo_ti"),
  lg(U.colab.id, U.colab.full_name, "internal", "ti_suporte", "analista", 45, "carbo_ti"),
  lg(U.vend2.id, U.vend2.full_name, "internal", "cgc", "vendedor", 60 * 26, "carbo_crm", { dep2: "expansao" }),
  lg(U.closer.id, U.closer.full_name, "internal", "cgc", "closer", 60 * 24 * 3, "carbo_crm"),
  lg("u-l5", "Diego Martins", "internal", "ops", "analista", 60 * 24 * 11, "carbo_ops_app"),
  lg("u-l6", "Carla Mendes", "internal", "financeiro", "analista", 60 * 24 * 40, "carbo_financas"),
  lg("u-l7", "Patrícia Rocha", "internal", "marketing", "designer", null, null),
  lg("lic-1", "Licenciado Natal Centro (exemplo)", "licensee", null, null, 60 * 5, "portal_licenciado", { region: "RN", orders: 6 }),
  lg("lic-2", "Licenciado Recife Sul (exemplo)", "licensee", null, null, 60 * 24 * 12, "portal_licenciado", { region: "PE", orders: 0 }),
  lg("lic-3", "Licenciado Fortaleza (exemplo)", "licensee", null, null, 60 * 24 * 45, "portal_licenciado", { region: "CE", orders: 0 }),
  lg("loj-1", "Posto Exemplo 01", "produtos", null, null, 90, "portal_pdv", { region: "Rede Modelo", repo: 60 * 24 * 4 }),
  lg("loj-2", "Posto Exemplo 02", "produtos", null, null, 60 * 24 * 5, "portal_pdv", { region: "Rede Modelo", repo: 60 * 24 * 18 }),
  lg("loj-3", "Posto Avulso Exemplo", "produtos", null, null, null, null, { region: "Sem rede" }),
];

// ── Adoção do Carbo Chat ────────────────────────────────────────────────────
const CHAT_SERIE = Array.from({ length: 30 }, (_, i) => {
  const d = 29 - i;
  const fds = new Date(agora - d * 864e5).getDay() % 6 === 0;
  return { dia: diaISO(d), usuarios_ativos: fds ? 4 + (i % 3) : 18 + Math.round(i / 3) + (i % 4), mensagens: fds ? 20 + i : 160 + i * 6 + ((i * 37) % 60) };
});

export const FX: Record<string, unknown> = {
  crm_stage_sla: SLA,
};

export const RPC_FX: Record<string, unknown> = {
  admin_audit_feed: (a: { p_sources?: string[] | null }) => (a.p_sources ? FEED.filter((r) => a.p_sources!.includes(r.source)) : FEED),
  crm_acompanhamento: ACOMP,
  crm_acompanhamento_repasses: REPASSES,
  crm_lead_detalhe: LEAD,
  get_last_login_summary: LOGINS,
  chat_adoption_overview: [{ funcionarios: 34, ativos_hoje: 21, ativos_7d: 27, ativos_30d: 29, msgs_hoje: 318, msgs_7d: 1742, msgs_30d: 6905, grupos_ativos: 14, dms_ativas: 63, com_push: 22, sem_push: 12 }],
  chat_active_users_series: CHAT_SERIE,
  chat_volume_by_department: [
    { departamento: "Comercial", mensagens: 2140, usuarios_ativos: 9 },
    { departamento: "Operações", mensagens: 1630, usuarios_ativos: 7 },
    { departamento: "TI / Suporte", mensagens: 1210, usuarios_ativos: 4 },
    { departamento: "Financeiro", mensagens: 860, usuarios_ativos: 4 },
    { departamento: "Marketing", mensagens: 640, usuarios_ativos: 3 },
    { departamento: "Diretoria", mensagens: 425, usuarios_ativos: 2 },
  ],
  chat_onboarding_pendencies: [
    { user_id: "u-l7", full_name: "Patrícia Rocha", departamento: "Marketing", tem_push: false, usou_app: false, ultima_atividade: null },
    { user_id: "u-l6", full_name: "Carla Mendes", departamento: "Financeiro", tem_push: false, usou_app: true, ultima_atividade: min(60 * 24 * 9) },
    { user_id: U.closer.id, full_name: U.closer.full_name, departamento: "Comercial", tem_push: false, usou_app: true, ultima_atividade: min(60 * 5) },
    { user_id: "u-l5", full_name: "Diego Martins", departamento: "Operações", tem_push: true, usou_app: true, ultima_atividade: min(60 * 24 * 2) },
    { user_id: U.vend2.id, full_name: U.vend2.full_name, departamento: "Comercial", tem_push: true, usou_app: true, ultima_atividade: min(30) },
  ],
  chat_inactive_users: (a: { p_days?: number }) => [
    { user_id: "u-l7", full_name: "Patrícia Rocha", departamento: "Marketing", ultima_msg: null, ultima_ativid: null, dias_inativo: null },
    { user_id: "u-l6", full_name: "Carla Mendes", departamento: "Financeiro", ultima_msg: min(60 * 24 * 9), ultima_ativid: min(60 * 24 * 9), dias_inativo: 9 },
    { user_id: "u-l8", full_name: "Lucas Ferreira", departamento: "Operações", ultima_msg: min(60 * 24 * 16), ultima_ativid: min(60 * 24 * 16), dias_inativo: 16 },
  ].filter((r) => r.dias_inativo == null || r.dias_inativo > (a.p_days ?? 7)),
  chat_channel_stats: [{ grupos_total: 19, grupos_ativos_30d: 14, dms_total: 88, dms_ativas_30d: 63, media_membros: 7.4 }],
};
