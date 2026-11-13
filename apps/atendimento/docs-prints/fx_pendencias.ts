// Fixtures da área "pendencias": a tela /pendencias (Pendências de entrega).
// Dados FICTÍCIOS (pessoas.ts não tem clientes); as datas andam com o relógio.
const dia = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const ts = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const hoje = new Date();
const diasAteCorte = Math.round((hoje.getTime() - new Date("2026-11-06T12:00:00").getTime()) / 86_400_000);

type P = Record<string, unknown>;
let n = 0;
const ped = (o: P): P => {
  n++;
  return {
    bling_id: 900000 + n, pedido_numero: String(4100 + n), pedido_loja: `PAYT_LYK2ZA_X${n}`,
    pedido_codigo: `CZ${String(28000 + n)}`, canal: "PayT", total: 149.5, cliente_fone: `8499${String(1000000 + n * 7919).slice(-7)}`,
    uf: "RN", etapa: "etiqueta", previsao: null, rastreio_status: null, transportadora: "Jadlog",
    rastreio: `ME26${(n * 48271).toString(36).toUpperCase().padStart(6, "0")}BR`, url_rastreio: null,
    nf_numero: String(52000 + n), trato: null, ...o,
  };
};

const ANTES = diasAteCorte + 3;
const ITENS: P[] = [
  ped({ cliente: "Marcos Vieira Lopes", cidade: "Natal", data_pedido: dia(ANTES + 40), problema: "vencida", desde: ts(ANTES + 30), canal: "Nuvemshop", transportadora: "Correios PAC", rastreio: "AP681157427BR", total: 299 }),
  ped({ cliente: "Fernanda Rocha", cidade: "Mossoró", data_pedido: dia(ANTES + 22), problema: "nao_postado", desde: ts(ANTES + 21),
        trato: { situacao: "em_contato", observacao: "Cliente diz que não recebeu. Pedi foto da caixa de correio.", em: ts(1), por: "Ana Souza" } }),
  ped({ cliente: "Carlos Eduardo Santos", cidade: "Parnamirim", data_pedido: dia(ANTES + 18), problema: "atrasado", desde: ts(ANTES + 6), etapa: "em_transito", transportadora: "J&T Express", rastreio: "888031019428896", previsao: dia(ANTES + 6) }),
  ped({ cliente: "Juliana Martins", cidade: "Recife", uf: "PE", data_pedido: dia(ANTES + 15), problema: "transportadora", desde: ts(ANTES + 4), etapa: "em_transito", rastreio_status: "returned" }),
  ped({ cliente: "Roberto Almeida", cidade: "Fortaleza", uf: "CE", data_pedido: dia(ANTES + 12), problema: "nao_postado", desde: ts(ANTES + 11),
        trato: { situacao: "reenviado", observacao: "Reenviado com etiqueta nova em 10/11.", em: ts(3), por: "Bruno Lima" } }),
  ped({ cliente: "Patrícia Gomes", cidade: "João Pessoa", uf: "PB", data_pedido: dia(ANTES + 9), problema: "nao_postado", desde: ts(ANTES + 8) }),
  ped({ cliente: "Lucas Ferreira", cidade: "Caicó", data_pedido: dia(ANTES + 7), problema: "cancelada", desde: ts(ANTES + 6), canal: "Nuvemshop" }),
  ped({ cliente: "Aline Barbosa", cidade: "Natal", data_pedido: dia(ANTES + 5), problema: "sem_etiqueta", desde: ts(ANTES + 5), etapa: "nf_emitida", transportadora: null, rastreio: null }),
  ped({ cliente: "Thiago Ribeiro", cidade: "São Paulo", uf: "SP", data_pedido: dia(ANTES + 3), problema: "atrasado", desde: ts(ANTES + 1), etapa: "em_transito", transportadora: "Correios SEDEX", rastreio: "QB123456789BR",
        trato: { situacao: "resolvido", observacao: "Entregue em mãos, cliente confirmou por WhatsApp.", em: ts(2), por: "Ana Souza" } }),
  ped({ cliente: "Mercado Livre · comprador", cidade: "Belo Horizonte", uf: "MG", data_pedido: dia(ANTES + 135), problema: "nao_postado", desde: ts(ANTES + 135), canal: "Mercado Livre", cliente_fone: null, transportadora: "Mercado Envios", rastreio: "45123987654" }),
  ped({ cliente: "Renata Cavalcanti", cidade: "Natal", data_pedido: dia(5), problema: "nao_postado", desde: ts(5) }),
  ped({ cliente: "Gustavo Henrique", cidade: "Maceió", uf: "AL", data_pedido: dia(4), problema: "vencida", desde: ts(1), canal: "Nuvemshop" }),
  ped({ cliente: "Beatriz Nogueira", cidade: "Natal", data_pedido: dia(6), problema: "sem_etiqueta", desde: ts(5), etapa: "nf_emitida", transportadora: null, rastreio: null }),
  ped({ cliente: "Diego Freitas", cidade: "Recife", uf: "PE", data_pedido: dia(4), problema: "sem_nf", desde: ts(4), etapa: "confirmado", transportadora: null, rastreio: null, nf_numero: null }),
];

export const RPC_FX: Record<string, unknown> = {
  carbo_entrega_pendencias: () => ({
    gerado_em: new Date().toISOString(), corte: "2026-11-06",
    itens: ITENS.map((p) => ({ ...p, antes_do_corte: String(p.data_pedido) < "2026-11-06" })),
  }),
};

export const FX: Record<string, unknown> = {
  carbo_entrega_trato_hist: [
    { id: 2, bling_id: 900002, situacao: "em_contato", observacao: "Cliente diz que não recebeu. Pedi foto da caixa de correio.", em: ts(1), por: "11111111-1111-1111-1111-111111111111" },
    { id: 1, bling_id: 900002, situacao: "em_contato", observacao: "Liguei, caixa postal. Mandei mensagem.", em: ts(2), por: "11111111-1111-1111-1111-111111111111" },
  ],
};
