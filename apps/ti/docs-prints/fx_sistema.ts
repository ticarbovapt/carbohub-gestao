// Fixtures da área "sistema" (ver areas.ts): Avisos de status (/status) e
// Carbo Academy — acessos (/academy/acessos). Tudo FICTÍCIO.
//
// ⚠️ `carbo_status_aviso` é lido pela TARJA em toda tela, e o selo do Academy
// no menu lê a fila em toda tela: os dois só respondem com linhas nas NOSSAS
// rotas — fora delas, vazio (senão a tarja/selo apareceria em todos os prints).
import { PAPEL, U, EU } from "./pessoas";
void PAPEL; void U; void EU;

const rota = () => { try { return location.pathname; } catch { return ""; } };
const naRota = (r: string) => rota().startsWith(r);

const agora = Date.now();
const min = (m: number) => new Date(agora - m * 60000).toISOString();
const depois = (m: number) => new Date(agora + m * 60000).toISOString();

const avisos = [
  { id: "st1", ativo: true, severidade: "manutencao", titulo: "Emissão de nota fiscal em manutenção",
    mensagem: "Os pedidos continuam sendo registrados e serão faturados quando voltar.",
    apps: ["financas", "ops", "ti"], inicio_em: min(35), previsao_fim: depois(85), encerrado_em: null,
    normalizado_minutos: 30, normalizado_texto: null, created_at: min(35) },
  { id: "st2", ativo: false, severidade: "instabilidade", titulo: "Lentidão para abrir a Esteira",
    mensagem: "A tela pode demorar até um minuto para carregar.", apps: [],
    inicio_em: min(60 * 26), previsao_fim: null, encerrado_em: min(60 * 24),
    normalizado_minutos: 30, normalizado_texto: null, created_at: min(60 * 26) },
  { id: "st3", ativo: false, severidade: "queda", titulo: "Sistema fora do ar",
    mensagem: "Estamos verificando com o provedor.", apps: [],
    inicio_em: min(60 * 24 * 6), previsao_fim: null, encerrado_em: min(60 * 24 * 6 - 50),
    normalizado_minutos: 60, normalizado_texto: null, created_at: min(60 * 24 * 6) },
  { id: "st4", ativo: false, severidade: "info", titulo: "Nova tela de Contas a pagar no Finanças",
    mensagem: null, apps: ["financas"], inicio_em: min(60 * 24 * 12), previsao_fim: null,
    encerrado_em: min(60 * 24 * 10), normalizado_minutos: 0, normalizado_texto: null, created_at: min(60 * 24 * 12) },
];

const ped = (
  id: string, nome: string, curso: string, status: string, extra: Record<string, unknown> = {},
) => ({
  user_id: id, nome, email: `${nome.split(" ")[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}@exemplo.com.br`, avatar_url: null,
  papel_portal: null, loja: null, departamento: null, e_licenciado: false,
  curso_id: "c-" + curso.toLowerCase().replace(/\W+/g, "-"), curso_titulo: curso, oficial: true,
  status, pedido_em: min(90), decidido_em: null, decidido_por: null, motivo: null, ...extra,
});

const fila = [
  ped("a1", "Juliana Pereira", "Como vender o CarboZé no balcão", "pendente",
    { papel_portal: "frentista", loja: "Posto Exemplo Centro", pedido_em: min(18) }),
  ped("a2", "Carlos Menezes", "Descarbonização CarboVAPT na prática", "pendente",
    { e_licenciado: true, pedido_em: min(75) }),
  ped("a3", "Patrícia Rocha", "Integração do Carbo Sales", "pendente",
    { departamento: "comercial", pedido_em: min(60 * 5) }),
  ped("a4", "Diego Martins", "Como vender o CarboZé no balcão", "aprovado",
    { papel_portal: "gestor", loja: "Posto Exemplo Norte", pedido_em: min(60 * 30), decidido_em: min(60 * 28), decidido_por: "Marina Alves" }),
  ped("a5", "Fernanda Lopes", "Integração do Carbo Sales", "aprovado",
    { departamento: "ops", pedido_em: min(60 * 50), decidido_em: min(60 * 49), decidido_por: "Rafael Costa" }),
  ped("a6", "Lucas Teixeira", "Descarbonização CarboVAPT na prática", "recusado",
    { pedido_em: min(60 * 72), decidido_em: min(60 * 70), decidido_por: "Marina Alves",
      motivo: "Curso só para licenciados — peça pelo cadastro do licenciado." }),
];

export const FX: Record<string, unknown> = {
  carbo_status_aviso: () => (naRota("/status") ? avisos : []),
};
export const RPC_FX: Record<string, unknown> = {
  academy_acessos_fila: () => (naRota("/academy") ? fila : []),
};
