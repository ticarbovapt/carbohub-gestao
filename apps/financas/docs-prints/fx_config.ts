// Fixtures da área "config" (ver areas.ts): Funcionários, Integração Bling,
// Integração Bling 2 e NFS-e Nacional. Dados FICTÍCIOS.
//
// ⚠️ Estado da conexão por PARÂMETRO do harness: `?mock=desconectado`,
// `?mock=expirado`, `?mock=falhou` (histórico com erro). A tela ignora o
// parâmetro; só a fixture o lê.
// ⚠️ Tabelas que outras áreas também leem (contatos, produtos, pedidos e os
// espelhos do Bling 2) respondem por ROTA: fora de /integracoes/* a resposta é
// a da outra área (molde do `porRota` do fx_logistica do Ops).
import { U } from "./pessoas";
import * as contas from "./fx_contas";
import * as vendas from "./fx_vendasfin";
import * as compras from "./fx_compras";

const OUTRAS = [contas, vendas, compras] as { FX?: Record<string, unknown>; RPC_FX?: Record<string, unknown> }[];
const resolve = (v: unknown) => (typeof v === "function" ? (v as () => unknown)() : v);
const rota = () => (typeof location === "undefined" ? "" : location.pathname);
const mock = () => (typeof location === "undefined" ? "" : new URLSearchParams(location.search).get("mock") ?? "");
const naIntegracao = () => rota().startsWith("/integracoes");
const porRota = (chave: string, meu: () => unknown, padrao: () => unknown = () => []) => () => {
  if (naIntegracao()) return meu();
  for (const a of [...OUTRAS].reverse()) if (a.FX && chave in a.FX) return resolve(a.FX[chave]);
  return padrao();
};

const agora = Date.now();
const min = (m: number) => new Date(agora - m * 60000).toISOString();
const linhas = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `x${i}` }));

// ── Conexão ─────────────────────────────────────────────────────────────────
const conexao = (apelido?: string) => () => {
  if (mock() === "desconectado") return [];
  const vence = mock() === "expirado" ? min(40) : new Date(agora + 4 * 3600e3).toISOString();
  return [{ is_active: true, expires_at: vence, apelido: apelido ?? null }];
};

const log = (tipo: string, regs: number, m: number, extra: Record<string, unknown> = {}) => ({
  id: `log-${tipo}`, entity_type: tipo, status: "completed", records_synced: regs, records_failed: 0,
  error_message: null, started_at: min(m), finished_at: min(m - 1), triggered_by: null, ...extra,
});
const falha = (tipo: string, m: number) => log(tipo, 0, m, {
  status: "failed", error_message: "Bling respondeu 401: invalid_token — a conexão precisa ser refeita.",
});

const logs1 = () => mock() === "falhou"
  ? [falha("nfe", 3), falha("orders", 4), falha("contas_pagar", 5), log("products", 214, 60 * 7)]
  : [log("nfe", 18, 2), log("orders", 37, 3), log("bridge", 12, 4), log("contas_receber", 46, 6),
     log("contas_pagar", 31, 6), log("contacts", 9, 60 * 3), log("products", 214, 60 * 7)];
const logs2 = () => mock() === "falhou"
  ? [falha("nfe_recente", 2), falha("orders_recente", 2), log("products", 186, 60 * 9)]
  : [log("orders_recente", 14, 1), log("nfe_recente", 6, 1), log("order_details", 60, 8),
     log("contas_receber", 52, 30), log("contas_pagar", 27, 30), log("contacts", 11, 60 * 2),
     log("products", 186, 60 * 9)];

const CALLBACK = (conta: string) => (b: Record<string, unknown>) => {
  if (b.action === "authorize") return { success: true, data: { authUrl: "/integracoes/" + conta } };
  if (b.action === "callback")
    return b.code === "velho"
      ? { success: false, error: "invalid_grant: o código de autorização expirou ou já foi usado" }
      : { success: true, data: { connected: true } };
  if (b.action === "refresh") return { success: true, data: { refreshed: true } };
  return { success: true, data: {} };
};

// ── NFS-e ───────────────────────────────────────────────────────────────────
const CNPJ_CARBO = "36060692000100";
const nota = (i: number, papel: "emitida" | "recebida", numero: string, dias: number, nome: string, doc: string,
  descricao: string, valor: number, extra: Record<string, unknown> = {}) => ({
  ambiente: "1", nsu: 900 - i, chave_acesso: `24081023606069200010000${String(i).padStart(27, "0")}`,
  numero, situacao_codigo: "100", municipio_emissao: papel === "emitida" ? "Natal/RN" : "São Paulo/SP",
  municipio_prestacao: null, servico_nacional: null,
  emit_cnpj: papel === "emitida" ? CNPJ_CARBO : doc, emit_nome: papel === "emitida" ? "CARBO SOLUCOES LTDA" : nome,
  toma_doc: papel === "emitida" ? doc : CNPJ_CARBO, toma_nome: papel === "emitida" ? nome : "CARBO SOLUCOES LTDA",
  emitida_em: new Date(agora - dias * 864e5).toISOString(), processada_em: null, competencia: null,
  valor_liquido: valor, base_calculo: valor, total_retido: 0, valor_servico: valor, descricao, papel,
  cancelada: false, cancelamento_tipo: null, cancelada_em: null, cancelamento_motivo: null,
  confirmada_tomador: false, confirmada_em: null, substitui_chave: null, substituicao_motivo: null,
  substituida_por_chave: null, substituida_por_numero: null, ...extra,
});
const NOTAS = [
  nota(1, "emitida", "231", 1, "TRANSPORTES SERIDO LTDA", "11222333000144", "SERVIÇO DE DESCARBONIZAÇÃO. CARBOVAPT. 8 VEÍCULOS.", 5600, { confirmada_tomador: true }),
  nota(2, "emitida", "230", 2, "LOCADORA LITORAL LTDA", "22333444000155", "SERVIÇO DE DESCARBONIZAÇÃO. CARBOVAPT. VEICULO: HILUX, 2021, QWE1A23.", 700),
  nota(3, "recebida", "4471", 3, "GRAFICA NORTE LTDA", "33444555000166", "Impressão de material de ponto de venda", 1840),
  nota(4, "emitida", "229", 5, "COOPERATIVA AGRESTE", "44555666000177", "SERVIÇO DE DESCARBONIZAÇÃO. CARBOVAPT. 3 VEÍCULOS.", 4200,
    { valor_liquido: 3990, total_retido: 210, valor_servico: 4200 }),
  nota(5, "emitida", "228", 6, "LOCADORA LITORAL LTDA", "22333444000155", "SERVIÇO DE DESCARBONIZAÇÃO. CARBOVAPT. 2 VEÍCULOS.", 1400,
    { cancelada: true, cancelamento_tipo: "CANCELAMENTO_POR_SUBSTITUICAO", substituida_por_numero: "230", substituicao_motivo: "Correção da placa" }),
  nota(6, "recebida", "1290", 8, "CONTABILIDADE PRISMA LTDA", "55666777000188", "Honorários contábeis — outubro", 3200),
  nota(7, "emitida", "227", 9, "FROTA BRAVA LOGISTICA", "66777888000199", "SERVIÇO DE DESCARBONIZAÇÃO. CARBOVAPT. 12 VEÍCULOS.", 8400),
  nota(8, "emitida", "226", 12, "JOAO PEREIRA", "12345678909", "SERVIÇO DE DESCARBONIZAÇÃO. CARBOVAPT. VEICULO: GOL, 2018, ABC1D23.", 700,
    { cancelada: true, cancelamento_tipo: "CANCELAMENTO", cancelamento_motivo: "Serviço não realizado" }),
  nota(9, "recebida", "883", 14, "MANUTENCAO EXPRESS LTDA", "77888999000100", "Manutenção de equipamento", 950),
  nota(10, "emitida", "225", 16, "TRANSPORTES SERIDO LTDA", "11222333000144", "SERVIÇO DE DESCARBONIZAÇÃO. CARBOVAPT. 5 VEÍCULOS.", 3500, { confirmada_tomador: true }),
];

// ── Funcionários ────────────────────────────────────────────────────────────
const perfil = (id: string, full_name: string, username: string, department: string) => ({
  id, full_name, username, email: `${username.toLowerCase()}@exemplo.com.br`, avatar_url: null, department, secondary_department: null,
});
const hojeMD = new Date().toISOString().slice(5, 10);
const PERFIS = () => [
  { ...Object.values(U)[0], department: "financeiro", secondary_department: null },
  ...Object.values(U).slice(1).map((x) => ({ ...x, secondary_department: null })),
  perfil("u-ops1", "Joana Prado", "OPS014", "ops"),
  perfil("u-com1", "Lucas Ferreira", "COM022", "comercial"),
  perfil("u-mkt1", "Paula Nunes", "MKT007", "marketing"),
];
const fin = (id: string, user_id: string | null, full_name: string, extra: Record<string, unknown>) => ({
  id, user_id, full_name, cpf: null, birth_date: null, pix_key: null, pix_type: null, bank_name: null, bank_code: null,
  bank_agency: null, bank_account: null, account_type: null, phone: null, emergency_name: null, emergency_phone: null,
  notes: null, active: true, ...extra,
});
const FINANCEIRO = [
  fin("ef1", "u-colab", "Rafael Costa", { pix_type: "cpf", pix_key: "123.456.789-09", birth_date: "1994-03-12", phone: "(84) 99811-2030", bank_name: "Banco do Brasil", bank_agency: "3421" }),
  fin("ef2", "u-gestor", "Marina Alves", { pix_type: "email", pix_key: "marina.alves@exemplo.com.br", birth_date: `1988-${hojeMD}`, phone: "(84) 99733-1001" }),
  fin("ef3", "u-ops1", "Joana Prado", { bank_name: "Caixa", bank_code: "104", bank_agency: "0034", bank_account: "22190-4", account_type: "poupanca", birth_date: "1991-11-04" }),
  fin("ef4", "u-vend2", "Ana Souza", { birth_date: "1997-11-20", phone: "(84) 99620-4455" }),
  fin("ef5", null, "Sérgio Mota", { pix_type: "telefone", pix_key: "(84) 98810-7722", notes: "Diarista — limpeza do Hub", birth_date: "1979-12-02", phone: "(84) 98810-7722" }),
];

export const FX: Record<string, unknown> = {
  bling_integration: conexao(),
  bling2_integration: conexao("Carbo Filial SP"),
  bling_sync_log: logs1,
  bling2_sync_log: logs2,
  bling_products: porRota("bling_products", () => linhas(214)),
  bling_contacts: porRota("bling_contacts", () => linhas(1282)),
  bling_orders: porRota("bling_orders", () => linhas(642)),
  bling2_products: porRota("bling2_products", () => linhas(186)),
  bling2_product_variations: porRota("bling2_product_variations", () => linhas(58)),
  bling2_contacts: porRota("bling2_contacts", () => linhas(1824)),
  bling2_vendedores: porRota("bling2_vendedores", () => linhas(7)),
  bling2_orders: porRota("bling2_orders", () => linhas(1415)),
  bling2_nfe: porRota("bling2_nfe", () => linhas(884)),
  bling2_contas_pagar: porRota("bling2_contas_pagar", () => linhas(612)),
  bling2_contas_receber: porRota("bling2_contas_receber", () => linhas(2634)),
  bling2_pedidos_compra: porRota("bling2_pedidos_compra", () => linhas(41)),
  "fn:bling-auth": CALLBACK("bling"),
  "fn:bling2-auth": CALLBACK("bling2"),
  carbo_nfse_visao: () => NOTAS,
  carbo_nfse_saude: [{ ultimo_nsu: 900, notas: 712, eventos: 74, malformados: 0, ultima_rodada: min(23), ultimo_status: "ok", ultimo_erro: null, parada: false }],
  employee_finance: () => FINANCEIRO,
  carbo_departments: [
    { key: "financeiro", label: "Financeiro", sigla: "FIN" }, { key: "ops", label: "Operações", sigla: "OPS" },
    { key: "comercial", label: "Comercial", sigla: "COM" }, { key: "marketing", label: "Marketing", sigla: "MKT" },
    { key: "command", label: "Diretoria", sigla: "DIR" },
  ],
};

export const RPC_FX: Record<string, unknown> = {
  // Fora de /funcionarios, a mesma forma do fixtures.ts (as outras áreas).
  carbo_all_profiles: () => rota().startsWith("/funcionarios")
    ? PERFIS()
    : Object.values(U).map((x) => ({ id: x.id, full_name: x.full_name, username: x.username, email: x.email })),
};
