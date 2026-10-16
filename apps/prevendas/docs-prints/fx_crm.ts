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

const f14 = (dono: { id: string }, extra: L[]): L[] => extra.map((x) => L({ funnel_type: "f14", created_by: dono.id, assigned_to: null, ...x }));

const DO_COLAB = f14(U.colab, [
  { id: "f14p1", stage: "prospeccao", trade_name: "Posto Ponta Negra", contact_name: "Sr. Carlos", contact_phone: "(84) 99876-1122", city: "Natal", state: "RN", estimated_revenue: 2500, updated_at: d(0, 3) },
  { id: "f14p2", stage: "prospeccao", trade_name: "Posto Avenida Norte", contact_name: "Jéssica", contact_phone: "(84) 99654-3311", city: "Natal", state: "RN", estimated_revenue: 1800, updated_at: d(4) },
  { id: "f14c1", stage: "primeiro_contato", trade_name: "Auto Posto Planalto", contact_name: "Marcos", contact_phone: "(84) 98811-2299", city: "Natal", state: "RN", estimated_revenue: 3200, temperature: "morno", waiting_on: "cliente", waiting_until: dataFut(2), waiting_note: "Ficou de responder depois de falar com o sócio", updated_at: d(1) },
  { id: "f14b", stage: "qualificacao", trade_name: "Rede Litoral Combustíveis", legal_name: "Litoral Comércio de Combustíveis Ltda", cnpj: "23.456.789/0001-01", contact_name: "Paulo Henrique", contact_phone: "(84) 99654-1020", contact_email: "paulo@redelitoral.com.br", city: "Natal", state: "RN", estimated_revenue: 12000, temperature: "quente", qual_postos: 4, qual_decisor: "Paulo, sócio-diretor", qual_volume: "4 postos, ~1.500 carros/dia somados", qual_dor: "Gostou, pediu amostra para testar no posto da Prudente", qual_prazo: null, notes: "Indicação do cliente Posto Boa Viagem.", updated_at: d(0, 5) },
  { id: "f14q2", stage: "conexao_decisor", trade_name: "Posto Serrinha", contact_name: "Dona Lúcia", contact_phone: "(84) 99777-4545", city: "Macaíba", state: "RN", estimated_revenue: 2200, updated_at: d(9) },
  { id: "f14a", stage: "agendamento", trade_name: "Posto Alto do Moura", contact_name: "Renato", contact_phone: "(81) 99123-8080", city: "Caruaru", state: "PE", estimated_revenue: 4000, temperature: "morno", next_follow_up_at: d(-2), updated_at: d(2) },
  { id: "f14r", stage: "reuniao_realizada", trade_name: "Posto Caminho do Sol", contact_name: "Gerente Fábio", contact_phone: "(81) 99555-1212", city: "Ipojuca", state: "PE", estimated_revenue: 5200, temperature: "quente", qual_postos: 1, qual_decisor: "Fábio, gerente", qual_volume: "6 bombas, 500 carros/dia", qual_dor: "Quer testar com os frentistas", qual_prazo: null, updated_at: d(0, 20) },
  { id: "f14rep", stage: "repassado", trade_name: "Posto Boa Viagem", contact_name: "Ana Paula", contact_phone: "(81) 99812-3344", city: "Recife", state: "PE", estimated_revenue: 1560, temperature: "quente", updated_at: d(3) },
  { id: "f14fu", stage: "follow_up", trade_name: "Posto Três Irmãos", contact_name: "Seu José", contact_phone: "(84) 99321-7788", city: "Mossoró", state: "RN", estimated_revenue: 1500, updated_at: d(5) },
  { id: "f14d", stage: "descartado", trade_name: "Posto Beira Rio", contact_name: "—", contact_phone: null, city: "Natal", state: "RN", estimated_revenue: 0, lost_reason: "Empresa fechou / inativa", lost_at: d(4), updated_at: d(4) },
]);
const DE_OUTRO_SDR = f14(U.sdr2, [
  { id: "f14x1", stage: "qualificacao", trade_name: "Posto Serra Verde", contact_name: "Ivo", contact_phone: "(81) 99000-1111", city: "Caruaru", state: "PE", estimated_revenue: 2600, updated_at: d(1) },
  { id: "f14x2", stage: "primeiro_contato", trade_name: "Posto Recanto", contact_name: "Clara", contact_phone: "(83) 98888-1234", city: "João Pessoa", state: "PB", estimated_revenue: 1900, updated_at: d(8) },
]);
const F15: L[] = [
  L({ id: "f15d", funnel_type: "f15", stage: "qualificado", trade_name: "Posto Boa Viagem", contact_name: "Ana Paula", contact_phone: "(81) 99812-3344", city: "Recife", state: "PE", estimated_revenue: 1560, created_by: U.colab.id, assigned_to: null, origin_lead_id: "f14rep", origin_funnel_type: "f14", temperature: "quente", qual_postos: 1, qual_decisor: "Ana Paula, dona", qual_volume: "8 bombas, 400 carros/dia", qual_dor: "Gostou, quer começar com 120 frascos", qual_prazo: "Proposta até sexta", created_at: d(3), updated_at: d(3) }),
  L({ id: "f15c", funnel_type: "f15", stage: "proposta", trade_name: "Auto Posto Estrela", contact_name: "Rodrigo", contact_phone: "(83) 98877-6655", city: "João Pessoa", state: "PB", estimated_revenue: 780, created_by: U.colab.id, assigned_to: U.closer.id, origin_lead_id: "f14z", origin_funnel_type: "f14", updated_at: d(1) }),
  L({ id: "f15g", funnel_type: "f15", stage: "negociacao", trade_name: "Posto Alto da Serra", contact_name: "Helena", contact_phone: "(81) 99456-7788", city: "Garanhuns", state: "PE", estimated_revenue: 3400, created_by: U.sdr2.id, assigned_to: U.closer.id, origin_lead_id: "f14y", origin_funnel_type: "f14", updated_at: d(2) }),
  L({ id: "f15a", funnel_type: "f15", stage: "ganho", trade_name: "Rede Litoral Combustíveis", contact_name: "Paulo Henrique", contact_phone: "(84) 99654-1020", city: "Natal", state: "RN", estimated_revenue: 3090, created_by: U.colab.id, assigned_to: U.closer.id, origin_lead_id: "f14b0", origin_funnel_type: "f14", won_at: d(7), updated_at: d(7) }),
];

export const leads = (papel: string): L[] => {
  const todos = [...DO_COLAB, ...DE_OUTRO_SDR, ...F15];
  if (papel === "gestor") return todos.map((x) => ({ ...x, assigned_to_nome: nomeDe(x.assigned_to as string | null) }));
  return todos.filter((x) => x.created_by === U.colab.id || x.assigned_to === U.colab.id)
    .map((x) => ({ ...x, assigned_to_nome: x.assigned_to === U.colab.id ? U.colab.full_name : null }));
};
const nomeDe = (id: string | null) => Object.values(U).find((x) => x.id === id)?.full_name ?? null;

export const atividades = [
  { id: "a1", lead_id: "f14b", activity_type: "note", subject: null, body: "Liga amanhã cedo — o Paulo decide até sexta. Leva a planilha de economia por bomba.", status: "done", due_at: null, done_at: null, stage_from: null, stage_to: null, created_by: U.gestor.id, created_by_name: U.gestor.full_name, created_at: d(0, 2), pinned: true },
  { id: "a2", lead_id: "f14b", activity_type: "call", subject: null, body: "Falei com o Paulo: tem 4 postos, quer amostra para o da Prudente.", status: "done", due_at: null, done_at: d(0, 4), stage_from: null, stage_to: null, created_by: U.colab.id, created_by_name: U.colab.full_name, created_at: d(0, 4), pinned: false },
  { id: "a3", lead_id: "f14b", activity_type: "stage_change", subject: null, body: null, status: "done", due_at: null, done_at: null, stage_from: "primeiro_contato", stage_to: "qualificacao", created_by: U.colab.id, created_by_name: U.colab.full_name, created_at: d(1), pinned: false },
  { id: "a4", lead_id: "f14b", activity_type: "task", subject: null, body: "Levar amostra no posto da Prudente", status: "pending", due_at: d(-2), done_at: null, stage_from: null, stage_to: null, created_by: U.colab.id, created_by_name: U.colab.full_name, created_at: d(1, 2), pinned: false },
  { id: "a5", lead_id: "f14b", activity_type: "note", subject: null, body: "Indicação do Posto Boa Viagem. O dono é amigo da Ana Paula.", status: "done", due_at: null, done_at: null, stage_from: null, stage_to: null, created_by: U.colab.id, created_by_name: U.colab.full_name, created_at: d(2), pinned: false },
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
  crm_sales_lead_repassar: () => "f15novo",
  crm_sales_lead_pegar: null,
  crm_sales_lead_transfer: null,
  crm_sales_lead_arquivar: null,
});
