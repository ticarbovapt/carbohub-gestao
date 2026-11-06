// Fixtures da aba "Assuntos" do /painel. Os NÚMEROS (grupos, assuntos, série)
// vieram agregados do banco de teste; nenhum texto, nome ou telefone de
// cliente real: os destaques e a lista de "quem falou" abaixo são INVENTADOS.
import dados from "./fx_assuntos_dados.json";

const NUM = { servico: "1255756280958635", clube: "1274076859132981", loja: "1347087218483622" };
const h = (horas: number) => new Date(Date.now() - horas * 3600_000).toISOString();

const ELOGIOS = [
  { nome: "Juliana Prado", wa: "5500000000101", n: NUM.servico, t: 3, texto: "Chegou tudo certinho e bem embalado, antes do prazo. Já coloquei no carro hoje de manhã!", a: ["entrega_ok"] },
  { nome: "Carlos Mendes", wa: "5500000000102", n: NUM.clube, t: 9, texto: "Segunda vez que compro, o carro ficou bem mais econômico na estrada. Vou indicar pros amigos.", a: ["produto_aprovado"] },
  { nome: "Patrícia Lopes", wa: "5500000000103", n: NUM.servico, t: 20, texto: "Obrigada pela atenção e pela agilidade em resolver a troca do endereço, atendimento excelente.", a: ["atendimento_elogiado"] },
  { nome: "Rogério Tavares", wa: "5500000000104", n: NUM.servico, t: 30, texto: "Recebi hoje, tudo em ordem. A moto está respondendo melhor já no primeiro tanque.", a: ["entrega_ok"] },
  { nome: "Fernanda Rocha", wa: "5500000000105", n: NUM.loja, t: 44, texto: "Produto de ótima qualidade, o consumo melhorou bastante. Pretendo comprar mais.", a: ["produto_aprovado", "recompra"] },
  { nome: "Marcos Vieira", wa: "5500000000106", n: NUM.servico, t: 52, texto: "Encomenda chegou certinha, muito obrigado pelo aviso de entrega!", a: ["entrega_ok"] },
];

const RISCOS = [
  { nome: "Eduardo Nunes", wa: "5500000000201", n: NUM.servico, t: 5, texto: "Já faz 15 dias e nada do pedido. Se não resolverem hoje vou abrir reclamação no Procon.", a: ["atraso", "ameaca"], r: false },
  { nome: "Sandra Melo", wa: "5500000000202", n: NUM.loja, t: 26, texto: "Fui cobrada duas vezes no cartão, quero o estorno de uma das compras.", a: ["cobranca_duplicada", "cancelamento"], r: true },
  { nome: "Vinícius Araújo", wa: "5500000000203", n: NUM.servico, t: 70, texto: "Consta entregue mas não recebi nada. Isso é golpe?", a: ["entrega_falhou"], r: false },
];

const dest = (x: { nome: string; wa: string; n: string; t: number; texto: string; a: string[]; r?: boolean }) => ({
  numero_id: x.n, wa_id: x.wa, nome: x.nome, ocorrido_em: h(x.t), texto: x.texto, assuntos: x.a,
  ...(x.r === undefined ? {} : { respondido: x.r }),
});

const CLIENTES = [
  { nome: "Eduardo Nunes", wa: "5500000000201", n: NUM.servico, risco: true, resp: false,
    msgs: [[5, "Já faz 15 dias e nada do pedido. Se não resolverem hoje vou abrir reclamação no Procon."], [30, "Até agora nada da minha encomenda"], [80, "Cadê meu pedido? Era para chegar dia 28."]] },
  { nome: "Luciana Barros", wa: "5500000000301", n: NUM.servico, risco: false, resp: false,
    msgs: [[8, "Ainda não chegou, o rastreio parou no centro de distribuição"]] },
  { nome: "Henrique Duarte", wa: "5500000000302", n: NUM.loja, risco: false, resp: true,
    msgs: [[22, "Bom dia, minha compra ainda não foi entregue"], [48, "A previsão era ontem"]] },
  { nome: "Tatiane Ribeiro", wa: "5500000000303", n: NUM.servico, risco: false, resp: true,
    msgs: [[60, "Comprei dia 20 e ainda não recebi o produto"]] },
];

const clientes = (a: { p_filtro?: string; p_offset?: number }) => ({
  total: 54,
  itens: (a.p_offset ?? 0) > 0 ? [] : CLIENTES.map((c) => ({
    numero_id: c.n, wa_id: c.wa, nome: c.nome, risco: c.risco, respondido_depois: c.resp,
    primeira_em: h(c.msgs[c.msgs.length - 1][0] as number), ultima_em: h(c.msgs[0][0] as number), n: c.msgs.length,
    mensagens: c.msgs.map(([t, texto]) => ({ em: h(t as number), tipo: "text", texto, assuntos: [a.p_filtro && !a.p_filtro.includes(":") && a.p_filtro !== "risco" ? a.p_filtro : "atraso"] })),
  })),
});

export const RPC_FX: Record<string, unknown> = {
  carbo_atendimento_assuntos: () => ({
    ...dados, gerado_em: new Date().toISOString(), por_numero: [],
    totais: { ...dados.totais, com_risco: RISCOS.length },
    elogios: ELOGIOS.map(dest), riscos: RISCOS.map(dest),
  }),
  carbo_atendimento_assunto_clientes: clientes,
};
