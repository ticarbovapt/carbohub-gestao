import { EU as EU_P } from "./pessoas";
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

// Pedidos SEM problema (entregue, em andamento, cancelado): a tela de pós-venda mostra todos.
const OK: P[] = Array.from({ length: 70 }, (_, k) => ped({
  cliente: `Cliente ${k + 1}`, cidade: "Natal", data_pedido: dia(k % 35), problema: null, desde: null,
  etapa: k % 9 === 0 ? "cancelado" : k % 4 === 0 ? "em_transito" : "entregue",
  entregue_em: k % 4 && k % 9 ? ts(Math.max(0, (k % 35) - 3)) : null, previsao: k % 4 === 0 ? dia(-2) : null,
}));
const TODOS = [...ITENS, ...OK].map((p) => ({ ...p, antes_do_corte: String(p.data_pedido) < "2026-11-06" }));
const domingo = (iso: string) => { const t = new Date(iso + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() - t.getUTCDay()); return t.toISOString().slice(0, 10); };

// ── Casos (20261173): guardados em memória, com a MESMA lógica das funções ──
type Caso = { id: string; bling_id: number; tipo: string; passo: string; status: string; desfecho: string | null; valor: number | null;
  aberto_em: string; aberto_por: string | null; atualizado_em: string; encerrado_em: string | null };
type H = Record<string, unknown> & { id: number; caso_id: string; acao: string };
const EU = EU_P.id;
const CASOS: Caso[] = [];
const HIST: H[] = [];
let hid = 0;
const hist = (o: Partial<H> & { caso_id: string; acao: string }) => HIST.push({ id: ++hid, por: EU, em: new Date().toISOString(), ...o } as H);
const novoCaso = (bling_id: number, tipo: string, passo: string, diasAtras = 0) => {
  const c: Caso = { id: crypto.randomUUID(), bling_id, tipo, passo, status: "aberto", desfecho: null, valor: null,
    aberto_em: ts(diasAtras), aberto_por: EU, atualizado_em: ts(diasAtras), encerrado_em: null };
  CASOS.push(c); hist({ caso_id: c.id, acao: "abriu", tipo, passo, em: ts(diasAtras) }); return c;
};
// Um caso andando (Fernanda) e um encerrado (Thiago).
{
  const c = novoCaso(900002, "nao_recebido", "comprovante", 2);
  hist({ caso_id: c.id, acao: "respondeu", tipo: c.tipo, passo: "comprovante", opcao: "conferido", proximo: "vizinhos",
    campos: { comprovante: "Entregue 14:32, recebido por 'portaria'" }, em: ts(2) });
  hist({ caso_id: c.id, acao: "respondeu", tipo: c.tipo, passo: "vizinhos", opcao: "pedido", proximo: "achou", em: ts(1) });
  c.passo = "achou";
  const e = novoCaso(900009, "atraso", "rastreio", 6);
  hist({ caso_id: e.id, acao: "respondeu", tipo: e.tipo, passo: "rastreio", opcao: "prazo", proximo: "informar", em: ts(6) });
  hist({ caso_id: e.id, acao: "respondeu", tipo: e.tipo, passo: "informar", opcao: "informado", proximo: "acompanhar", em: ts(5) });
  hist({ caso_id: e.id, acao: "respondeu", tipo: e.tipo, passo: "acompanhar", opcao: "sim", desfecho: "resolvido", em: ts(2) });
  Object.assign(e, { passo: "acompanhar", status: "encerrado", desfecho: "resolvido", encerrado_em: ts(2) });
}
const erro = (message: string) => { throw Object.assign(new Error(message), { message }); };
const casoDe = (bling: unknown) => {
  const doPedido = CASOS.filter((c) => c.bling_id === bling).sort((a, b) => (a.status === "aberto" ? -1 : 1) - (b.status === "aberto" ? -1 : 1) || b.aberto_em.localeCompare(a.aberto_em));
  return { caso: doPedido[0] ?? null, casos_n: doPedido.length };
};

export const RPC_FX: Record<string, unknown> = {
  carbo_posvenda_caso_abrir: (a: { p_bling_id: number; p_tipo: string; p_passo: string }) => {
    if (CASOS.some((c) => c.bling_id === a.p_bling_id && c.status === "aberto")) erro("Este pedido já tem um caso aberto");
    return novoCaso(a.p_bling_id, a.p_tipo, a.p_passo).id;
  },
  carbo_posvenda_caso_responder: (a: Record<string, any>) => {
    const c = CASOS.find((x) => x.id === a.p_caso)!;
    if (c.passo !== a.p_passo) erro("Outra pessoa já respondeu este passo. Atualize a tela.");
    hist({ caso_id: c.id, acao: a.p_tipo ? "mudou_tipo" : "respondeu", tipo: c.tipo, passo: c.passo, opcao: a.p_opcao,
      proximo: a.p_proximo, desfecho: a.p_desfecho, valor: a.p_valor, nota: a.p_nota, campos: a.p_campos });
    if (a.p_tipo) c.tipo = a.p_tipo;
    if (a.p_proximo) c.passo = a.p_proximo;
    if (a.p_desfecho) Object.assign(c, { status: "encerrado", desfecho: a.p_desfecho, encerrado_em: new Date().toISOString() });
    if (a.p_valor != null) c.valor = a.p_valor;
    c.atualizado_em = new Date().toISOString();
    return null;
  },
  carbo_posvenda_caso_voltar: (a: { p_caso: string }) => {
    const c = CASOS.find((x) => x.id === a.p_caso)!;
    const desfeitas = new Set(HIST.filter((h) => h.acao === "voltou").map((h) => h.desfaz));
    const h = [...HIST].reverse().find((x) => x.caso_id === c.id && ["respondeu", "mudou_tipo", "encerrou"].includes(x.acao) && !desfeitas.has(x.id));
    if (!h) erro("Não há passo para voltar");
    Object.assign(c, { tipo: h!.tipo, passo: h!.passo, status: "aberto", desfecho: null, encerrado_em: null });
    hist({ caso_id: c.id, acao: "voltou", tipo: h!.tipo, passo: h!.passo, desfaz: h!.id });
    return null;
  },
  carbo_posvenda_caso_encerrar: (a: { p_caso: string; p_desfecho: string; p_nota: string | null }) => {
    const c = CASOS.find((x) => x.id === a.p_caso)!;
    hist({ caso_id: c.id, acao: "encerrou", tipo: c.tipo, passo: c.passo, desfecho: a.p_desfecho, nota: a.p_nota });
    Object.assign(c, { status: "encerrado", desfecho: a.p_desfecho, encerrado_em: new Date().toISOString() });
    return null;
  },
  carbo_posvenda_caso_anotar: (a: { p_caso: string; p_nota: string }) => {
    const c = CASOS.find((x) => x.id === a.p_caso)!;
    hist({ caso_id: c.id, acao: "nota", tipo: c.tipo, passo: c.passo, nota: a.p_nota });
    return null;
  },
  carbo_posvenda: (a: { p_de: string; p_ate: string; p_so_casos?: boolean }) => {
    const abertos = TODOS.filter((p) => p.problema && !(p.trato as P | null)?.situacao?.toString().match(/resolvido|reembolsado|sem_solucao/));
    const sem = new Map<string, { semana: string; antes: boolean; n: number }>();
    for (const p of abertos) {
      const k = domingo(String(p.data_pedido)) + p.antes_do_corte;
      const s = sem.get(k) ?? { semana: domingo(String(p.data_pedido)), antes: Boolean(p.antes_do_corte), n: 0 };
      s.n++; sem.set(k, s);
    }
    return {
      gerado_em: new Date().toISOString(), corte: "2026-11-06", de: a.p_de, ate: a.p_ate,
      primeiro: TODOS.map((p) => String(p.data_pedido)).sort()[0],
      abertos: { antes: abertos.filter((p) => p.antes_do_corte).length, novos: abertos.filter((p) => !p.antes_do_corte).length },
      semanas: [...sem.values()],
      casos_abertos: {
        antes: TODOS.filter((p) => p.antes_do_corte && casoDe(p.bling_id).caso?.status === "aberto").length,
        novos: TODOS.filter((p) => !p.antes_do_corte && casoDe(p.bling_id).caso?.status === "aberto").length,
      },
      itens: TODOS.filter((p) => a.p_so_casos ? casoDe(p.bling_id).caso?.status === "aberto"
          : String(p.data_pedido) >= a.p_de && String(p.data_pedido) <= a.p_ate)
        .map((p) => ({ ...p, ...casoDe(p.bling_id) }))
        .sort((x, y) => String(x.data_pedido).localeCompare(String(y.data_pedido))),
    };
  },
};

export const FX: Record<string, unknown> = {
  carbo_posvenda_casos: () => CASOS,
  carbo_posvenda_caso_hist: () => HIST,
  carbo_entrega_trato_hist: [
    { id: 2, bling_id: 900002, situacao: "em_contato", observacao: "Cliente diz que não recebeu. Pedi foto da caixa de correio.", em: ts(1), por: "11111111-1111-1111-1111-111111111111" },
    { id: 1, bling_id: 900002, situacao: "em_contato", observacao: "Liguei, caixa postal. Mandei mensagem.", em: ts(2), por: "11111111-1111-1111-1111-111111111111" },
  ],
};
