// Reembolsos de pós-venda (20261175) — dados FICTÍCIOS para a tela /reembolsos.
const agora = Date.now();
const ts = (h: number) => new Date(agora - h * 3600_000).toISOString();
const dia = (d: number) => new Date(agora - d * 86_400_000).toISOString().slice(0, 10);

const base = {
  caso_status: "aberto", caso_desfecho: null, caso_encerrado_em: null, nota: null, pago_em: null, valor_pago: null,
  comprovante_path: null, nota_financeiro: null, pago_por: null, pago_registrado_em: null, devolvido_em: null,
  motivo_devolucao: null, devolvido_por: null, cancelado_em: null, pedido_numero: null, pedido_loja: null, nf_numero: "003811",
};
const ITENS = [
  { ...base, id: "r1", caso_id: "c1", bling_id: 900006, tipo: "parcial", valor: 29.9, forma: "pix",
    dados: "Chave Pix: 123.456.789-00 (CPF)\nTitular: Patrícia Gomes", status: "solicitado",
    solicitado_em: ts(3), solicitado_por: "Marina Alves", caso_tipo: "faltante", nota: "Faltou 1 frasco do kit de 5.",
    pedido_codigo: "CZ28006", canal: "PayT", data_pedido: dia(9), total: 149.5, cliente: "Patrícia Gomes", cliente_fone: "84991047514" },
  { ...base, id: "r2", caso_id: "c2", bling_id: 900002, tipo: "integral", valor: 149.5, forma: "estorno", dados: null,
    status: "solicitado", solicitado_em: ts(1), solicitado_por: "Ana Souza", caso_tipo: "nao_recebido",
    pedido_codigo: "CZ28002", canal: "Nuvemshop", data_pedido: dia(14), total: 149.5, cliente: "Fernanda Lima", cliente_fone: "11987650002" },
  { ...base, id: "r3", caso_id: "c3", bling_id: 900009, tipo: "integral", valor: 284.23, forma: "transferencia",
    dados: "Banco do Brasil · ag. 1234-5 · cc 98765-4\nThiago Rocha · CPF 987.654.321-00", status: "pago",
    solicitado_em: ts(50), solicitado_por: "Bruno Lima", caso_tipo: "avaria", pago_em: dia(1), valor_pago: 284.23,
    comprovante_path: "r3/1-comprovante.pdf", pago_por: "Rafael Costa", pago_registrado_em: ts(20), nota_financeiro: "TED às 10h",
    pedido_codigo: "CZ28009", canal: "PayT", data_pedido: dia(20), total: 284.23, cliente: "Thiago Rocha", cliente_fone: "21999990009" },
];

export const RPC_FX: Record<string, unknown> = {
  carbo_posvenda_reembolsos_lista: (a: { p_status: string | null }) => {
    const itens = ITENS.filter((r) => !a.p_status || r.status === a.p_status);
    const contagem: Record<string, number> = {};
    for (const r of ITENS) contagem[r.status] = (contagem[r.status] ?? 0) + 1;
    return { itens, total: itens.length, contagem };
  },
};
