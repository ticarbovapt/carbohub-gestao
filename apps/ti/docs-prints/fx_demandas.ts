// Fixtures da área "demandas" (ver areas.ts): Visão geral (/) e o quadro de
// Demandas (/demandas), com o card aberto e o Ranking do time. Tudo FICTÍCIO.
//
// ⚠️ `carbo_bug_reports` também alimenta a tela /bugs (prints `bugs` e
// `bugs-gestor`, da base). b1 e b2 ficam IGUAIS aos de fixtures.ts e, fora das
// rotas desta área, só eles voltam — para os prints da base não mudarem.
import { PAPEL, U, EU } from "./pessoas";
void PAPEL;

const rota = () => { try { return location.pathname; } catch { return ""; } };
const naNossa = () => rota() === "/" || rota().startsWith("/demandas");

const agora = Date.now();
const min = (m: number) => new Date(agora - m * 60000).toISOString();
const h = (x: number) => min(x * 60);
const d = (x: number) => min(x * 60 * 24);

// As duas linhas da base (fixtures.ts) — iguais, byte a byte no conteúdo.
const base = () => [
  { id: "b1", app: "ti", kind: "bug", title: "Busca de usuário não achava pelo e-mail", description: "Digitando o e-mail completo, a lista vinha vazia.", status: "resolved", reporter_id: EU.id, reporter_name: EU.full_name, created_at: min(60 * 30), updated_at: min(60 * 26), archived_at: null, admin_notes: "Corrigido na versão de hoje.", url: "/usuarios", severity: null, reach: null },
  { id: "b2", app: "ti", kind: "sugestao", title: "Mostrar o sistema de origem na lista de bugs", description: "Ajudaria a saber de qual app veio o pedido.", status: "open", reporter_id: EU.id, reporter_name: EU.full_name, created_at: min(60 * 5), updated_at: min(60 * 5), archived_at: null, admin_notes: null, url: "/usuarios", severity: null, reach: "meu_time" },
];

const pessoa = (p: { id: string; full_name: string } | null) => (p ? { assignee_id: p.id, assignee_name: p.full_name } : { assignee_id: null, assignee_name: null });
const dem = (o: Record<string, unknown>) => ({
  app: "ti", kind: "bug", description: "", url: null, reporter_id: null, reporter_name: null, reporter_email: null,
  department: null, admin_notes: null, assignee_id: null, assignee_name: null, priority: null, bloqueio: null,
  pessoas_afetadas: null, attachments: null, client_context: null, archived_at: null, reopen_count: 0, ...o,
});

const extras = () => [
  dem({ id: "d11", app: "sales", kind: "bug", title: "Vender não salva venda de CarboVAPT", description: "Ao clicar em Salvar e Vender aparece “erro ao salvar” e a venda não é criada. Acontece com todos do time desde hoje cedo.", status: "open", priority: "critica", bloqueio: "travado", pessoas_afetadas: "todo_mundo", reporter_id: "r-joana", reporter_name: "Joana Mendes", reporter_email: "joana.mendes@exemplo.com.br", department: "comercial", url: "https://sales.carbohub.com.br/vender", created_at: h(2), updated_at: h(2), stage_since: h(2) }),
  dem({ id: "d1", app: "sales", kind: "bug", title: "Desconto não aparece no PDF do orçamento", description: "O desconto que dei no item sai certo na tela, mas no PDF a linha vem sem desconto.", status: "open", bloqueio: "contorno", pessoas_afetadas: "meu_time", reporter_id: "r-carlos", reporter_name: "Carlos Pinheiro", department: "comercial", created_at: h(5), updated_at: h(5), stage_since: h(5) }),
  dem({ id: "d2", app: "ti", kind: "acesso", title: "Liberar o Carbo Ops para a nova estagiária", description: "Começou hoje na logística, precisa do Ops.", status: "open", priority: "media", reporter_id: "r-lucia", reporter_name: "Lúcia Ramos", department: "ops", created_at: d(1), updated_at: d(1), stage_since: d(1) }),
  dem({ id: "d4", app: "ops", kind: "bug", title: "Rastreio não muda de etapa depois da NF", description: "A nota foi emitida e o card continua em Gerar Nota Fiscal.", status: "priorizada", priority: "alta", bloqueio: "contorno", pessoas_afetadas: "todo_mundo", reporter_id: "r-lucia", reporter_name: "Lúcia Ramos", ...pessoa(U.colab), created_at: d(2), updated_at: d(1), stage_since: d(1) }),
  dem({ id: "d12", app: "ti", kind: "infra", title: "Wi-Fi da sala de reunião caindo", description: "Cai a cada 10 minutos durante as chamadas.", status: "priorizada", priority: "media", reporter_id: "r-carlos", reporter_name: "Carlos Pinheiro", created_at: d(9), updated_at: d(8), stage_since: d(8) }),
  dem({ id: "d3", app: "ti", kind: "infra", title: "Monitor do caixa piscando", description: "O segundo monitor do caixa pisca e apaga.", status: "priorizada", priority: "baixa", reporter_id: "r-joana", reporter_name: "Joana Mendes", ...pessoa(U.closer), created_at: d(3), updated_at: d(2), stage_since: d(2) }),
  dem({ id: "d5", app: "financas", kind: "bug", title: "Baixa de título some ao recarregar a página", description: "Dou baixa, aparece como pago, e ao apertar F5 volta para em aberto.", status: "in_progress", priority: "alta", bloqueio: "travado", pessoas_afetadas: "so_eu", reporter_id: "r-paula", reporter_name: "Paula Nunes", ...pessoa(U.colab), created_at: d(6), updated_at: d(4), stage_since: d(4) }),
  dem({ id: "d6", app: "mkt", kind: "sugestao", title: "Exportar o quadro em PDF", description: "Para mandar o planejamento do mês para a diretoria sem precisar de print da tela.\n\nPode ser só a lista de cartões com a data de entrega.", status: "in_progress", priority: "media", reporter_id: "r-paula", reporter_name: "Paula Nunes", reporter_email: "paula.nunes@exemplo.com.br", department: "marketing", url: "https://mkt.carbohub.com.br/quadros", ...pessoa(U.vend2), created_at: d(12), updated_at: d(9), stage_since: d(9) }),
  dem({ id: "d7", app: "sales", kind: "ajuda", title: "Como gero a segunda via do orçamento?", description: "O cliente perdeu o PDF.", status: "aguardando", priority: "baixa", reporter_id: "r-carlos", reporter_name: "Carlos Pinheiro", ...pessoa(U.gestor), created_at: d(6), updated_at: d(5), stage_since: d(5) }),
  dem({ id: "d8", app: "admin", kind: "bug", title: "Gráfico do Dashboard Comercial vazio no tema escuro", description: "No tema claro aparece; no escuro o gráfico some.", status: "em_teste", priority: "media", reporter_id: "r-joana", reporter_name: "Joana Mendes", ...pessoa(U.colab), created_at: d(4), updated_at: d(1), stage_since: d(1) }),
  dem({ id: "d9", app: "sales", kind: "bug", title: "Busca de cliente não acha CNPJ com pontos", description: "", status: "resolved", priority: "alta", admin_notes: "A busca passou a ignorar pontos e barras.", ...pessoa(U.colab), created_at: d(5), updated_at: d(2), stage_since: d(2) }),
  dem({ id: "d10", app: "mkt", kind: "sugestao", title: "Trocar a cor do menu", description: "", status: "declined", priority: "baixa", admin_notes: "A cor segue o padrão de todos os sistemas.", ...pessoa(U.closer), created_at: d(8), updated_at: d(3), stage_since: d(3) }),
];

const atividades = [
  { id: "a1", demanda_id: "d6", activity_type: "note", body: "Combinado com a Paula: primeiro só a lista, sem capa.", status: null, status_from: null, status_to: null, assignee_id: null, due_at: null, pinned: true, created_by: U.vend2.id, created_by_name: U.vend2.full_name, created_at: d(9) },
  { id: "a2", demanda_id: "d6", activity_type: "task", body: "Testar a exportação com um quadro de 300 cartões", status: "pending", status_from: null, status_to: null, assignee_id: null, due_at: d(-2), pinned: false, created_by: U.vend2.id, created_by_name: U.vend2.full_name, created_at: h(30) },
  { id: "a3", demanda_id: "d6", activity_type: "status_change", body: null, status: null, status_from: "priorizada", status_to: "in_progress", assignee_id: null, due_at: null, pinned: false, created_by: U.vend2.id, created_by_name: U.vend2.full_name, created_at: d(9) },
  { id: "a4", demanda_id: "d6", activity_type: "assign", body: "Ana Souza assumiu a demanda", status: null, status_from: null, status_to: null, assignee_id: U.vend2.id, due_at: null, pinned: false, created_by: U.vend2.id, created_by_name: U.vend2.full_name, created_at: d(10) },
  { id: "a5", demanda_id: "d6", activity_type: "note", body: "Já dá para gerar a lista; falta a data de entrega.", status: null, status_from: null, status_to: null, assignee_id: null, due_at: null, pinned: false, created_by: U.vend2.id, created_by_name: U.vend2.full_name, created_at: h(3) },
];

export const FX: Record<string, unknown> = {
  carbo_bug_reports: () => (naNossa() ? [...base(), ...extras()] : base()),
  carbo_demanda_activities: () => [...atividades].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)),
};

const ranking = [
  { person_id: U.colab.id, person_name: U.colab.full_name, entregas: 9, pontos: 16.4, criticas: 3, assumidas: 11, em_aberto: 3, paradas: 0, reabertas: 0, sem_solicitante: 0, idas_aguardando: 1, amostra_tempo: 8, minutos_ativos_med: 260, indice_velocidade: 0.8, fechadas_sem_execucao: 0 },
  { person_id: U.vend2.id, person_name: U.vend2.full_name, entregas: 7, pontos: 10.2, criticas: 1, assumidas: 8, em_aberto: 1, paradas: 1, reabertas: 1, sem_solicitante: 0, idas_aguardando: 2, amostra_tempo: 6, minutos_ativos_med: 410, indice_velocidade: 1.1, fechadas_sem_execucao: 0 },
  { person_id: U.closer.id, person_name: U.closer.full_name, entregas: 6, pontos: 7.6, criticas: 0, assumidas: 7, em_aberto: 2, paradas: 0, reabertas: 0, sem_solicitante: 0, idas_aguardando: 0, amostra_tempo: 5, minutos_ativos_med: 180, indice_velocidade: 0.9, fechadas_sem_execucao: 0 },
  { person_id: U.gestor.id, person_name: U.gestor.full_name, entregas: 2, pontos: 2.3, criticas: 0, assumidas: 3, em_aberto: 1, paradas: 0, reabertas: 0, sem_solicitante: 0, idas_aguardando: 0, amostra_tempo: 2, minutos_ativos_med: 90, indice_velocidade: null, fechadas_sem_execucao: 0 },
];

export const RPC_FX: Record<string, unknown> = {
  // Superconjunto do da base: o quadro precisa de foto e departamento (só quem é do TI pode assumir).
  carbo_all_profiles: () => Object.values(U).map((x) => ({ id: x.id, full_name: x.full_name, username: x.username, email: x.email, avatar_url: x.avatar_url, department: x.department, secondary_department: null })),
  carbo_demanda_counts: () => [
    { demanda_id: "d6", notes: 2, tasks_pendentes: 1 },
    { demanda_id: "d5", notes: 1, tasks_pendentes: 0 },
    { demanda_id: "d4", notes: 3, tasks_pendentes: 0 },
  ],
  carbo_ti_ranking: () => ranking,
  carbo_ti_time: () => [{ entregues: 24, lead_p50_horas: 30.5, lead_p90_horas: 120, triagem_p50_horas: 2.4, firmeza_pct: 96, fila_envelhecida: 1 }],
};
