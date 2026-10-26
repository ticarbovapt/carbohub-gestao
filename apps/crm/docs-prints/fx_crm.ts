// Fixtures: Pipeline (crm_sales_leads), painel do card, atividades.
import { U } from "./pessoas";

const agora = Date.now();
const d = (dias: number, h = 0) => new Date(agora - dias * 864e5 - h * 36e5).toISOString();
const dataFut = (dias: number) => new Date(agora + dias * 864e5).toISOString().slice(0, 10);

const base = {
  contact_whatsapp: null, contact_cpf: null, ramo: "Posto de combustível", address: null, bairro: null, numero: null, cep: null,
  customer_ie: null, segment: null, lead_segment: null, credit_amount: null, wave: null, score: null, fleet_size: null, probability: null,
  next_steps: null, assigned_team: null, territory: null, lost_reason: null, won_at: null, lost_at: null, last_contact_at: null,
  next_follow_up_at: null, contact_attempts: 0, notes: null, qual_volume: null, qual_dor: null, qual_decisor: null, qual_prazo: null,
  qual_postos: null, waiting_on: null, waiting_until: null, waiting_note: null, origin_lead_id: null, origin_funnel_type: null,
  assigned_to_nome: null, tags: [], custom_fields: {}, deleted_at: null, source: "indicacao", temperature: "frio", cnpj: null, legal_name: null,
};
type L = Record<string, unknown>;
const L = (o: L): L => ({ ...base, created_at: d(6), updated_at: d(1), ...o });

const F = (funnel: string, dono: { id: string }, extra: L[]): L[] => extra.map((x) => L({ funnel_type: funnel, created_by: dono.id, assigned_to: dono.id, segment: "pdv", lead_segment: "pdv", ...x }));

// Comercial Expansão (f13) — a pipeline padrão do Sales.
const F13_COLAB = F("f13", U.colab, [
  { id: "c1", stage: "a_contatar", trade_name: "Posto Ponta Negra", contact_name: "Sr. Carlos", contact_phone: "(84) 99876-1122", city: "Natal", state: "RN", estimated_revenue: 2500, source: "indicacao", updated_at: d(0, 3) },
  { id: "c2", stage: "a_contatar", trade_name: "Posto Avenida Norte", contact_name: "Jéssica", contact_phone: "(84) 99654-3311", city: "Natal", state: "RN", estimated_revenue: 1800, source: "indicacao", updated_at: d(4) },
  { id: "c3", stage: "contato", trade_name: "Auto Posto Planalto", contact_name: "Marcos", contact_phone: "(84) 98811-2299", city: "Natal", state: "RN", estimated_revenue: 3200, temperature: "morno", waiting_on: "cliente", waiting_until: dataFut(2), waiting_note: "Ficou de responder depois de falar com o sócio", updated_at: d(1) },
  { id: "c4", stage: "qualificado", trade_name: "Rede Litoral Combustíveis", legal_name: "Litoral Comércio de Combustíveis Ltda", cnpj: "23.456.789/0001-01", contact_name: "Paulo Henrique", contact_phone: "(84) 99654-1020", contact_email: "paulo@redelitoral.com.br", city: "Natal", state: "RN", estimated_revenue: 12000, temperature: "quente", qual_decisor: "Paulo, sócio-diretor", qual_volume: "4 postos, ~1.500 carros/dia somados", qual_dor: "Quer reduzir reclamação de bico entupido", qual_prazo: "Decide até sexta", notes: "Indicação do cliente Posto Boa Viagem.", updated_at: d(0, 5) },
  { id: "c5", stage: "visita_agendada", trade_name: "Transportadora Serrana", contact_name: "Dona Lúcia", contact_phone: "(84) 99777-4545", city: "Macaíba", state: "RN", estimated_revenue: 6200, segment: "frotista", lead_segment: "frotista", next_follow_up_at: d(-2), updated_at: d(9) },
  { id: "c6", stage: "orcamento", trade_name: "Posto Alto do Moura", contact_name: "Renato", contact_phone: "(81) 99123-8080", city: "Caruaru", state: "PE", estimated_revenue: 4000, temperature: "morno", updated_at: d(2) },
  { id: "c7", stage: "em_negociacao", trade_name: "Posto Caminho do Sol", contact_name: "Gerente Fábio", contact_phone: "(81) 99555-1212", city: "Ipojuca", state: "PE", estimated_revenue: 5200, temperature: "quente", updated_at: d(0, 20) },
  { id: "c8", stage: "convertido", trade_name: "Posto Boa Viagem", contact_name: "Ana Paula", contact_phone: "(81) 99812-3344", city: "Recife", state: "PE", estimated_revenue: 1560, won_at: d(3), updated_at: d(3) },
  { id: "c9", stage: "sem_interesse", trade_name: "Posto Beira Rio", contact_name: "—", contact_phone: null, city: "Natal", state: "RN", estimated_revenue: 0, lost_reason: "Preço", lost_at: d(4), updated_at: d(4) },
]);
const F13_OUTRO = F("f13", U.vend2, [
  { id: "c20", stage: "contato", trade_name: "Posto Serra Verde", contact_name: "Ivo", contact_phone: "(81) 99000-1111", city: "Caruaru", state: "PE", estimated_revenue: 2600, updated_at: d(1) },
  { id: "c21", stage: "qualificado", trade_name: "Posto Recanto", contact_name: "Clara", contact_phone: "(83) 98888-1234", city: "João Pessoa", state: "PB", estimated_revenue: 1900, updated_at: d(8) },
]);
// Outbound (f12, SDR) → repassa ao Inbound (f11, closer). Follow up (f10) = recompra.
const OUTROS = [
  ...F("f12", U.colab, [
    { id: "o1", stage: "prospeccao", trade_name: "Posto Três Irmãos", contact_name: "Seu José", contact_phone: "(84) 99321-7788", city: "Mossoró", state: "RN", estimated_revenue: 1500, updated_at: d(5) },
    { id: "o2", stage: "conectado", trade_name: "Frota Nordeste Log", contact_name: "Carla", contact_phone: "(84) 99111-2233", city: "Parnamirim", state: "RN", estimated_revenue: 8000, segment: "frotista", lead_segment: "frotista", updated_at: d(1) },
    { id: "o3", stage: "repassado", trade_name: "Posto Estrela do Sul", contact_name: "Rodrigo", contact_phone: "(83) 98877-6655", city: "João Pessoa", state: "PB", estimated_revenue: 780, updated_at: d(2) },
  ]),
  ...F("f11", U.closer, [
    { id: "i1", stage: "novo", trade_name: "Posto Estrela do Sul", contact_name: "Rodrigo", contact_phone: "(83) 98877-6655", city: "João Pessoa", state: "PB", estimated_revenue: 780, origin_lead_id: "o3", origin_funnel_type: "f12", created_by: U.colab.id, assigned_to: null, updated_at: d(2) },
    { id: "i2", stage: "proposta", trade_name: "Posto Alto da Serra", contact_name: "Helena", contact_phone: "(81) 99456-7788", city: "Garanhuns", state: "PE", estimated_revenue: 3400, updated_at: d(2) },
  ]),
  ...F("f10", U.colab, [
    { id: "r1", stage: "a_reativar", trade_name: "Posto Boa Esperança", contact_name: "Sr. Antônio", contact_phone: "(84) 99222-5566", city: "Natal", state: "RN", estimated_revenue: 1300, updated_at: d(12) },
    { id: "r2", stage: "oferta", trade_name: "Posto Cidade Verde", contact_name: "Lara", contact_phone: "(84) 99333-6677", city: "Natal", state: "RN", estimated_revenue: 900, updated_at: d(3) },
  ]),
];

export const leads = (papel: string): L[] => {
  const todos = [...F13_COLAB, ...F13_OUTRO, ...OUTROS];
  if (papel === "gestor") return todos.map((x) => ({ ...x, assigned_to_nome: nomeDe(x.assigned_to as string | null) }));
  return todos.filter((x) => x.created_by === U.colab.id || x.assigned_to === U.colab.id)
    .map((x) => ({ ...x, assigned_to_nome: x.assigned_to === U.colab.id ? U.colab.full_name : null }));
};
const nomeDe = (id: string | null) => Object.values(U).find((x) => x.id === id)?.full_name ?? null;

export const atividades = [
  { id: "a1", lead_id: "c4", activity_type: "note", subject: null, body: "Liga amanhã cedo — o Paulo decide até sexta. Leva a planilha de economia por bomba.", status: "done", due_at: null, done_at: null, stage_from: null, stage_to: null, created_by: U.gestor.id, created_by_name: U.gestor.full_name, created_at: d(0, 2), pinned: true },
  { id: "a2", lead_id: "c4", activity_type: "call", subject: null, body: "Falei com o Paulo: tem 4 postos, quer amostra para o da Prudente.", status: "done", due_at: null, done_at: d(0, 4), stage_from: null, stage_to: null, created_by: U.colab.id, created_by_name: U.colab.full_name, created_at: d(0, 4), pinned: false },
  { id: "a3", lead_id: "c4", activity_type: "stage_change", subject: null, body: null, status: "done", due_at: null, done_at: null, stage_from: "contato", stage_to: "qualificado", created_by: U.colab.id, created_by_name: U.colab.full_name, created_at: d(1), pinned: false },
  { id: "a4", lead_id: "c4", activity_type: "task", subject: null, body: "Levar amostra no posto da Prudente", status: "pending", due_at: d(-2), done_at: null, stage_from: null, stage_to: null, created_by: U.colab.id, created_by_name: U.colab.full_name, created_at: d(1, 2), pinned: false },
  { id: "a5", lead_id: "c4", activity_type: "note", subject: null, body: "Indicação do Posto Boa Viagem.", status: "done", due_at: null, done_at: null, stage_from: null, stage_to: null, created_by: U.colab.id, created_by_name: U.colab.full_name, created_at: d(2), pinned: false },
];

export const leadFixtures: Record<string, unknown> = {
  crm_sales_lead_activities: atividades,
  crm_sales_lead_owner_log: [],
  crm_lead_orders: [],
};

export const rpcCrm = (papel: string): Record<string, unknown> => ({
  crm_lead_detalhe: (a: { p_lead?: string }) => {
    const lead = leads(papel).find((x) => x.id === a.p_lead) ?? null;
    return lead ? { lead, arquivado: false, atividades: atividades.filter((x) => x.lead_id === a.p_lead), orcamentos: [] } : null;
  },
  crm_lead_orcamento_vigente: () => [],
  crm_sales_lead_repassar: () => "i-novo",
  crm_sales_lead_pegar: null,
  crm_sales_lead_transfer: null,
  crm_sales_lead_arquivar: null,
});
