// ─────────────────────────────────────────────────────────────────────────────
// A matemática da distribuição de meta — SEM dependência nenhuma.
//
// Vive separada do hook de propósito: o hook importa o cliente Supabase, que
// depende de `import.meta.env` e só existe no browser. Com a conta aqui, ela
// roda em Node e dá para verificar o arredondamento sem subir a aplicação —
// que é justamente a parte onde o erro é silencioso e caro.
// ─────────────────────────────────────────────────────────────────────────────

export interface ItemDistribuivel {
  id: string;          // uuid do vendedor, ou o slug da plataforma
  nome: string;
  metaAtual: number;
  realizado: number;
}

/**
 * Reparte `total` entre `itens` proporcionalmente ao peso de cada um.
 *
 * ⚠️ O PROBLEMA QUE ESTA FUNÇÃO EXISTE PARA RESOLVER: arredondamento.
 * R$ 100.000 entre 3 dá 33.333,33 cada, e 33.333 × 3 = 99.999. O real que
 * sobra PRECISA ir para alguém — se sumir, a soma nunca fecha com o total e o
 * semáforo da tela fica amarelo para sempre, sem ninguém entender por quê.
 *
 * Usa o método do maior resto: piso para todos, e o troco vai, um real por vez,
 * para quem tem a maior parte fracionária. É o mesmo critério de distribuição
 * de cadeiras em eleição — o desvio máximo de qualquer item é R$ 1.
 *
 * Trabalha em reais inteiros porque é essa a convenção da tela de metas (o
 * diálogo já faz `parseInt` dos dígitos); centavo não existe neste domínio.
 *
 * GARANTIA: a soma dos valores devolvidos é exatamente `Math.round(total)`.
 */
export function distribuirPorPeso(
  total: number,
  itens: Array<{ id: string; peso: number }>,
): Record<string, number> {
  const saida: Record<string, number> = {};
  if (itens.length === 0) return saida;

  const alvo = Math.max(0, Math.round(total));
  const somaPesos = itens.reduce((a, i) => a + Math.max(0, i.peso), 0);

  // ⚠️ Peso total zero acontece de verdade: mês em que ninguém vendeu ainda, ou
  // equipe toda sem histórico. Dividir aqui seria 0/0 = NaN e a tela mostraria
  // "R$ NaN" em todo mundo. Cai para divisão igual, que é a intenção óbvia.
  const pesos = somaPesos > 0
    ? itens.map((i) => Math.max(0, i.peso))
    : itens.map(() => 1);
  const soma = pesos.reduce((a, p) => a + p, 0);

  const exatos = pesos.map((p) => (alvo * p) / soma);
  const base = exatos.map(Math.floor);
  let resto = alvo - base.reduce((a, b) => a + b, 0);

  // Maior parte fracionária primeiro; empate desempata pelo índice, para o
  // resultado ser estável entre execuções (mesma entrada, mesma saída).
  const ordem = exatos
    .map((v, idx) => ({ idx, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.idx - b.idx);

  for (const { idx } of ordem) {
    if (resto <= 0) break;
    base[idx] += 1;
    resto -= 1;
  }

  itens.forEach((i, idx) => { saida[i.id] = base[idx]; });
  return saida;
}

/** Divide igualmente — é `distribuirPorPeso` com todo mundo pesando 1. */
export function distribuirIgual(total: number, ids: string[]): Record<string, number> {
  return distribuirPorPeso(total, ids.map((id) => ({ id, peso: 1 })));
}

/** Reparte proporcionalmente ao que cada um já realizou. */
export function distribuirProporcional(
  total: number,
  itens: ItemDistribuivel[],
): Record<string, number> {
  return distribuirPorPeso(total, itens.map((i) => ({ id: i.id, peso: i.realizado })));
}

/**
 * Reparte só entre os itens DESTRAVADOS, respeitando o que já foi travado.
 *
 * É o que faz a tela ser usável: o gestor acerta dois vendedores na mão, trava
 * os dois, e manda o resto se acomodar no que sobrou do total.
 *
 * ⚠️ Se os travados já passam do total, os destravados recebem ZERO — não
 * número negativo. O estouro fica visível no resíduo da tela, que é onde a
 * decisão pertence.
 */
export function redistribuirDestravados(
  total: number,
  itens: ItemDistribuivel[],
  valores: Record<string, number>,
  travados: Set<string>,
  modo: "igual" | "proporcional",
): Record<string, number> {
  const somaTravados = itens
    .filter((i) => travados.has(i.id))
    .reduce((a, i) => a + (valores[i.id] ?? 0), 0);

  const livres = itens.filter((i) => !travados.has(i.id));
  const sobra = Math.max(0, total - somaTravados);

  const repartido = modo === "proporcional"
    ? distribuirProporcional(sobra, livres)
    : distribuirIgual(sobra, livres.map((i) => i.id));

  return { ...valores, ...repartido };
}
