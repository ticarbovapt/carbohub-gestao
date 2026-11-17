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
// Reclamações do WhatsApp (assuntos do painel do atendimento), por pedido.
const RECL: Record<number, P> = {
  900006: { n: 2, primeira_em: ts(3), ultima_em: ts(1), trecho: "Chegou a caixa mas faltou um frasco, só vieram 4. Vou no Procon se não resolverem.",
            wa_id: "5584991047514", numero_id: "1255756280958635", assuntos: [{ codigo: "faltou_item", rotulo: "Veio faltando ou veio errado" }, { codigo: "ameaca", rotulo: "Ameaça (Procon, Reclame Aqui, polícia, redes)" }] },
  900002: { n: 1, primeira_em: ts(4), ultima_em: ts(4), trecho: "Diz que foi entregue mas não recebi nada",
            wa_id: "5584991015838", numero_id: "1255756280958635", assuntos: [{ codigo: "entrega_falhou", rotulo: "Consta entregue e não recebeu" }] },
  900003: { n: 1, primeira_em: ts(2), ultima_em: ts(2), trecho: "Já faz 20 dias e não chegou",
            wa_id: "5584991023757", numero_id: "1255756280958635", assuntos: [{ codigo: "atraso", rotulo: "Atraso, ainda não chegou" }] },
};
const comReclamacao = (p: P) => {
  const r = RECL[p.bling_id as number];
  if (!r) return { reclamacao: null };
  const c = casoDe(p.bling_id).caso;
  return { reclamacao: { ...r, pendente: c?.status !== "aberto" && (!c || c.desfecho === "cancelado" || String(c.encerrado_em) < String(r.ultima_em)) } };
};
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

// ── Reembolsos (20261175): o atendente pede; `__fxPagar()` faz o papel do Financeiro.
const REEMB: Record<string, unknown>[] = [];
(globalThis as any).__fxPagar = () => {
  const r = REEMB.find((x) => x.status === "solicitado") as any;
  if (!r) return false;
  const c = CASOS.find((x) => x.id === r.caso_id)!;
  Object.assign(r, { status: "pago", pago_por: "22222222-2222-2222-2222-222222222222", pago_em: new Date().toISOString().slice(0, 10),
    valor_pago: r.valor, comprovante_path: `${r.id}/1-comprovante.pdf`, nota_financeiro: "Pix enviado às 14h" });
  hist({ caso_id: c.id, acao: "respondeu", tipo: c.tipo, passo: c.passo, opcao: "pago_financeiro", proximo: r.passo_depois,
    valor: r.valor, campos: { pago_em: new Date().toLocaleDateString("pt-BR") }, por: "22222222-2222-2222-2222-222222222222" });
  c.passo = r.passo_depois;
  return true;
};
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
    for (const r of REEMB as any[]) if (r.caso_id === c.id && r.status === "solicitado" && r.passo_aguarda !== h!.passo) r.status = "cancelado";
    return null;
  },
  carbo_posvenda_caso_encerrar: (a: { p_caso: string; p_desfecho: string; p_nota: string | null }) => {
    const c = CASOS.find((x) => x.id === a.p_caso)!;
    hist({ caso_id: c.id, acao: "encerrou", tipo: c.tipo, passo: c.passo, desfecho: a.p_desfecho, nota: a.p_nota });
    Object.assign(c, { status: "encerrado", desfecho: a.p_desfecho, encerrado_em: new Date().toISOString() });
    return null;
  },
  carbo_posvenda_reembolso_solicitar: (a: Record<string, any>) => {
    const c = CASOS.find((x) => x.id === a.p_caso)!;
    if (c.passo !== a.p_passo) erro("Outra pessoa já respondeu este passo. Atualize a tela.");
    const id = crypto.randomUUID();
    REEMB.push({ id, caso_id: c.id, tipo: a.p_tipo, valor: a.p_valor, forma: a.p_forma, dados: a.p_dados, nota: a.p_nota,
      status: "solicitado", passo_aguarda: a.p_aguarda, passo_depois: a.p_depois, solicitado_por: EU,
      solicitado_em: new Date().toISOString(), pago_por: null, pago_em: null, valor_pago: null, comprovante_path: null,
      nota_financeiro: null, devolvido_em: null, motivo_devolucao: null });
    hist({ caso_id: c.id, acao: "respondeu", tipo: c.tipo, passo: c.passo, opcao: a.p_opcao, proximo: a.p_aguarda, valor: a.p_valor,
      nota: a.p_nota, campos: { forma: a.p_forma === "pix" ? "Pix" : a.p_forma, ...(a.p_dados ? { dados: a.p_dados } : {}) } });
    c.passo = a.p_aguarda; c.valor = a.p_valor;
    return id;
  },
  carbo_posvenda_caso_anotar: (a: { p_caso: string; p_nota: string }) => {
    const c = CASOS.find((x) => x.id === a.p_caso)!;
    hist({ caso_id: c.id, acao: "nota", tipo: c.tipo, passo: c.passo, nota: a.p_nota });
    return null;
  },
  carbo_posvenda_do_cliente: () => TODOS.slice(0, 3).map((p) => ({ ...p, caso: casoDe(p.bling_id).caso })),
  carbo_posvenda_painel: (a: { p_de: string; p_ate: string }) => ({
    gerado_em: new Date().toISOString(), de: a.p_de, ate: a.p_ate,
    agora: { abertos: 14, vencidos: 2, mais_antigo: ts(34), por_tipo: [{ tipo: "faltante", n: 5 }, { tipo: "nao_recebido", n: 4 }] },
    periodo: {
      abertos: 37, encerrados: 29, reembolsado: 1284.6, horas_mediana: 52, horas_p90: 190, no_prazo: 17, base_prazo: 18,
      por_tipo: [
        { tipo: "faltante", abertos: 12, encerrados: 10, reembolsado: 312.4, horas_mediana: 30, desfechos: [{ desfecho: "reenvio", n: 6 }, { desfecho: "reembolso_parcial", n: 3 }, { desfecho: "recusado", n: 1 }] },
        { tipo: "nao_recebido", abertos: 9, encerrados: 7, reembolsado: 449, horas_mediana: 96, desfechos: [{ desfecho: "resolvido", n: 3 }, { desfecho: "reenvio", n: 2 }, { desfecho: "reembolso_integral", n: 2 }] },
        { tipo: "avaria", abertos: 6, encerrados: 5, reembolsado: 299, horas_mediana: 26, desfechos: [{ desfecho: "troca", n: 3 }, { desfecho: "reembolso_integral", n: 2 }] },
        { tipo: "atraso", abertos: 5, encerrados: 4, reembolsado: 0, horas_mediana: 70, desfechos: [{ desfecho: "resolvido", n: 4 }] },
        { tipo: "arrependimento", abertos: 3, encerrados: 2, reembolsado: 224.2, horas_mediana: 140, desfechos: [{ desfecho: "reembolso_integral", n: 1 }, { desfecho: "recusado", n: 1 }] },
        { tipo: "defeito", abertos: 2, encerrados: 1, reembolsado: 0, horas_mediana: 48, desfechos: [{ desfecho: "troca", n: 1 }] },
      ],
      desfechos: [{ desfecho: "reenvio", n: 8, valor: 0 }, { desfecho: "resolvido", n: 7, valor: 0 }, { desfecho: "reembolso_integral", n: 5, valor: 972.2 },
        { desfecho: "troca", n: 4, valor: 0 }, { desfecho: "reembolso_parcial", n: 3, valor: 312.4 }, { desfecho: "recusado", n: 2, valor: 0 }],
      semanas: [0, 1, 2, 3, 4].map((k) => ({ semana: dia(35 - k * 7), abertos: [6, 9, 8, 7, 7][k], encerrados: [4, 6, 7, 6, 6][k] })),
      pessoas: [{ nome: "Ana Souza", abriu: 18, passos: 74, encerrou: 15 }, { nome: "Bruno Lima", abriu: 12, passos: 51, encerrou: 10 }, { nome: "Marina Alves", abriu: 7, passos: 22, encerrou: 4 }],
    },
    reclamacoes: {
      mensagens: 96, clientes: 58, pedidos: 49, com_caso: 37, sem_pedido: 6, ameacas: 3,
      por_assunto: [
        { codigo: "atraso", rotulo: "Atraso, ainda não chegou", clientes: 19, pedidos: 17, com_caso: 12 },
        { codigo: "faltou_item", rotulo: "Veio faltando ou veio errado", clientes: 14, pedidos: 13, com_caso: 12 },
        { codigo: "entrega_falhou", rotulo: "Consta entregue e não recebeu", clientes: 11, pedidos: 10, com_caso: 8 },
        { codigo: "avaria", rotulo: "Chegou violado, vazando ou amassado", clientes: 7, pedidos: 6, com_caso: 6 },
        { codigo: "nao_funcionou", rotulo: "Não funcionou ou piorou", clientes: 5, pedidos: 4, com_caso: 2 },
        { codigo: "ameaca", rotulo: "Ameaça (Procon, Reclame Aqui, polícia, redes)", clientes: 3, pedidos: 3, com_caso: 2 },
      ],
      sem_caso: [900006, 900003].map((id) => { const p = TODOS.find((x) => x.bling_id === id)!; const r = RECL[id];
        return { bling_id: id, pedido_codigo: p.pedido_codigo, pedido_numero: p.pedido_numero, cliente: p.cliente, canal: p.canal,
          data_pedido: p.data_pedido, antes_do_corte: p.antes_do_corte, n: r.n, ultima_em: r.ultima_em, assuntos: (r.assuntos as P[]).map((x) => x.rotulo) }; }),
      sem_caso_total: 12,
    },
  }),
  carbo_posvenda: (a: { p_de: string; p_ate: string; p_so_casos?: boolean; p_pedido?: number }) => {
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
      itens: TODOS.filter((p) => a.p_pedido != null ? p.bling_id === a.p_pedido
          : a.p_so_casos ? casoDe(p.bling_id).caso?.status === "aberto"
          : String(p.data_pedido) >= a.p_de && String(p.data_pedido) <= a.p_ate)
        .map((p) => ({ ...p, ...casoDe(p.bling_id), ...comReclamacao(p) }))
        .sort((x, y) => String(x.data_pedido).localeCompare(String(y.data_pedido))),
    };
  },
};

export const FX: Record<string, unknown> = {
  carbo_posvenda_casos: () => CASOS,
  carbo_posvenda_caso_hist: () => HIST,
  carbo_posvenda_reembolsos: () => REEMB,
  carbo_entrega_trato_hist: [
    { id: 2, bling_id: 900002, situacao: "em_contato", observacao: "Cliente diz que não recebeu. Pedi foto da caixa de correio.", em: ts(1), por: "11111111-1111-1111-1111-111111111111" },
    { id: 1, bling_id: 900002, situacao: "em_contato", observacao: "Liguei, caixa postal. Mandei mensagem.", em: ts(2), por: "11111111-1111-1111-1111-111111111111" },
  ],
};
