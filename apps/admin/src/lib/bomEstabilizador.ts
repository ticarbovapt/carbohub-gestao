// ═══════════════════════════════════════════════════════════════════════════
// QUANTO ESTABILIZADOR CADA PRODUTO LEVA — a lista de materiais, resolvida
//
// A pergunta é "quantos litros de líquido saíram pela venda", e ela não é
// respondida por uma consulta rasa à `mrp_bom`. A árvore tem TRÊS níveis, e o
// produto mais vendido da casa está no fundo dela:
//
//     CZ100               → EMB-LIQ100ML (1 un) → INS-LIQ-CARBO  100 ml
//     KIT-5UN-CARB-100ML  → CZ100        (5 un) → …              500 ml
//     KIT-CARB-SACH-10ML  → CARB-SACH-10ML (10) → INS-LIQ-CARBO  120 ml
//     CZ1L                → INS-LIQ-CARBO (1 L)
//
// ⚠️ Um `join` de um nível só devolve ZERO para o CZ100 — e zero não parece
// erro, parece "não consome". Era o resultado para 34 mil itens vendidos.
//
// ── Três regras que este arquivo existe para manter ──────────────────────
//
// 1. **A unidade é lida, nunca presumida.** O mesmo insumo aparece em `ml`
//    (CARB-SACH-10ML, VAPT70, EMB-LIQ100ML) e em `L` (CZ1L, CZ-500) — e há
//    `l` minúsculo no cadastro. Presumir litro infla mil vezes.
//
// 2. **Variante herda do produto-base, pelo CADASTRO.** `CZ100-MD`,
//    `CZ100-PDV` e `CZ100-BON` não têm BOM própria e nem precisam: são o
//    mesmo frasco com outro preço. Quem diz isso é `preco_de` /
//    `bonificacao_de`, não uma lista de sufixos no código — produto novo com
//    outro sufixo entra pelo cadastro e obedece sozinho.
//
// 3. **Sem BOM devolve `null`, nunca `0`.** `BOM-80-SAC` e `CAR-100-BOC-28`
//    não têm lista cadastrada; dar-lhes zero esconderia o cadastro que falta
//    dentro de um total que parece completo. `null` vira linha na lista de
//    trabalho da tela.
// ═══════════════════════════════════════════════════════════════════════════

/** O insumo que está sendo medido — o líquido do CarboZé. */
export const CODIGO_ESTABILIZADOR = "INS-LIQ-CARBO";

export interface BomRow {
  product_id: string;
  insumo_id: string;
  /** PostgREST entrega `numeric` como string. */
  quantity_per_unit: number | string | null;
  unit: string | null;
}

export interface ProdutoBomRow {
  id: string;
  product_code: string | null;
  name: string | null;
  category: string | null;
  preco_de: string | null;
  bonificacao_de: string | null;
}

export interface ResolucaoBom {
  /** product_id → litros do insumo por UM item de catálogo. */
  litrosPorItem: Map<string, number>;
  /** Produtos cuja árvore não resolve (sem BOM, unidade estranha ou ciclo). */
  semBom: Set<string>;
  /** product_id → o produto DE VERDADE por trás dele (ver `resolverBase`). */
  base: Map<string, BaseProduto>;
}

/** O produto real por trás de uma variante ou de um kit. */
export interface BaseProduto {
  id: string;
  nome: string;
  codigo: string | null;
  /**
   * Quantas unidades do BASE valem UM item deste produto.
   * 1 para variante de preço (o -MD é o mesmo frasco), 10 para o kit de
   * sachês, 5 para o kit de cinco frascos.
   */
  porItem: number;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Fator para litro. `null` = unidade que não é de volume (ou desconhecida) —
 * e aí a linha NÃO vira litro nenhum, em vez de virar um número qualquer.
 */
function paraLitros(unit: string | null): number | null {
  switch ((unit ?? "").trim().toLowerCase()) {
    case "l":
    case "lt":
    case "litro":
    case "litros": return 1;
    case "ml":
    case "mililitro":
    case "mililitros": return 0.001;
    default: return null;
  }
}

/**
 * Litros do insumo por item de catálogo, para TODO produto do cadastro.
 *
 * `null` nunca entra no mapa: quem não resolve aparece em `semBom`, que é a
 * lista de trabalho — a tela mostra os dois.
 */
export function resolverEstabilizador(
  boms: BomRow[],
  produtos: ProdutoBomRow[],
  codigoInsumo: string = CODIGO_ESTABILIZADOR,
): ResolucaoBom {
  const alvo = produtos.find(
    (p) => (p.product_code ?? "").trim().toUpperCase() === codigoInsumo.toUpperCase(),
  );
  const litrosPorItem = new Map<string, number>();
  const semBom = new Set<string>();
  if (!alvo) return { litrosPorItem, semBom: new Set(produtos.map((p) => p.id)), base: new Map() };

  const filhos = new Map<string, BomRow[]>();
  for (const b of boms ?? []) {
    const lista = filhos.get(b.product_id);
    if (lista) lista.push(b);
    else filhos.set(b.product_id, [b]);
  }

  const memo = new Map<string, number | null>();
  const categoria = new Map(produtos.map((p) => [p.id, (p.category ?? "").trim()]));

  /**
   * Litros para montar UMA unidade deste produto. `null` = não se sabe.
   *
   * ⚠️ "Sem BOM" significa coisas OPOSTAS conforme a categoria. Insumo e
   * embalagem são FOLHA: a tampa não tem lista porque não é montada, e ela
   * contribui zero — não "não se sabe". Já um Produto Final ou Semi-acabado
   * sem lista é cadastro faltando, e aí a resposta é `null`. Tratar os dois
   * como zero enterraria o cadastro que falta dentro de um total completo.
   */
  const litros = (id: string, caminho: Set<string>): number | null => {
    const pronto = memo.get(id);
    if (pronto !== undefined) return pronto;
    // ⚠️ Ciclo na BOM é erro de cadastro, e o laço infinito derrubaria a tela.
    // Aqui ele vira "não se sabe", que é exatamente o que é.
    if (caminho.has(id)) return null;

    const linhas = filhos.get(id);
    if (!linhas || linhas.length === 0) {
      const folha = categoria.get(id) === "Insumo" ? 0 : null;
      memo.set(id, folha);
      return folha;
    }

    caminho.add(id);
    let total = 0;
    let desconhecido = false;
    for (const l of linhas) {
      const qtd = num(l.quantity_per_unit);
      if (qtd <= 0) continue;
      if (l.insumo_id === alvo.id) {
        // Chegou no insumo medido: aqui a unidade é de VOLUME, e é LIDA.
        const fator = paraLitros(l.unit);
        if (fator === null) { desconhecido = true; continue; }
        total += qtd * fator;
        continue;
      }
      // Componente: desce a árvore. ⚠️ A quantidade multiplica o que vier de
      // baixo — é isto que faz o kit de 5 valer 5 × 100 ml.
      const abaixo = litros(l.insumo_id, caminho);
      if (abaixo === null) desconhecido = true;
      else total += qtd * abaixo;
    }
    caminho.delete(id);

    // ⚠️ Um ramo desconhecido anula o produto INTEIRO. Somar só os ramos que
    // se conhece devolveria litros a menos com cara de total.
    const r = desconhecido ? null : total;
    memo.set(id, r);
    return r;
  };

  // ── Produto a produto, com a herança da variante ─────────────────────────
  const porId = new Map(produtos.map((p) => [p.id, p]));
  for (const p of produtos) {
    // ⚠️ No máximo quatro saltos: cadastro com variante de variante existe, e
    // um `while` sem teto é um laço infinito esperando um ciclo no cadastro.
    let atual: ProdutoBomRow | undefined = p;
    let r: number | null = null;
    for (let i = 0; i < 4 && atual; i++) {
      r = litros(atual.id, new Set());
      if (r !== null) break;
      const base = atual.bonificacao_de ?? atual.preco_de;
      atual = base ? porId.get(base) : undefined;
    }
    if (r === null) semBom.add(p.id);
    else litrosPorItem.set(p.id, r);
  }

  return { litrosPorItem, semBom, base: resolverBase(produtos, filhos) };
}

/**
 * O produto DE VERDADE por trás de cada código — e quantas unidades dele cabem
 * num item.
 *
 * "CarboZé 100ml", "CarboZé 100ml - Microdistribuidor" e "CarboZé 100ml - PDV"
 * são o mesmo frasco; o que muda é para quem se vende. "KIT 10und CARBOZE
 * SACHÊ" é o mesmo sachê, só que dez numa caixa. Para a pergunta de produção
 * — quanto líquido saiu, de que produto — esses são UM item na lista, e
 * mostrá-los em linhas separadas parte o produto em três.
 *
 * ⚠️ As duas regras saem do CADASTRO, não de uma lista de sufixos nem de
 * leitura de nome:
 *
 *   1. VARIANTE DE PREÇO — `preco_de` / `bonificacao_de` apontam o pai. É o
 *      mesmo item físico com outra tabela; vale 1 por 1.
 *   2. KIT — BOM com UM único componente, e esse componente é Produto Final.
 *      Aí o produto não é outra coisa: é uma CAIXA daquela coisa, e a
 *      quantidade da linha é quantas cabem.
 *
 * A regra 2 é estreita de propósito. O CZ100 também tem BOM, mas com DOIS
 * componentes (a embalagem cheia e o rótulo), e o primeiro é Semi-acabado —
 * ele não é caixa de nada, é o produto. Uma regra do tipo "tem componente
 * Produto Final" sem o "um único" faria todo produto montado virar alias do
 * primeiro insumo que tivesse.
 */
function resolverBase(
  produtos: ProdutoBomRow[],
  filhos: Map<string, BomRow[]>,
): Map<string, BaseProduto> {
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const categoria = new Map(produtos.map((p) => [p.id, (p.category ?? "").trim()]));
  const saida = new Map<string, BaseProduto>();

  for (const p of produtos) {
    let atual: ProdutoBomRow = p;
    let porItem = 1;
    // ⚠️ Teto de saltos: variante de variante existe, e um `while` sem limite
    // é um laço infinito esperando um ciclo no cadastro.
    for (let i = 0; i < 4; i++) {
      const pai = atual.bonificacao_de ?? atual.preco_de;
      const paiRow = pai ? porId.get(pai) : undefined;
      if (paiRow) { atual = paiRow; continue; }

      const linhas = filhos.get(atual.id);
      if (linhas && linhas.length === 1) {
        const l = linhas[0];
        const un = (l.unit ?? "un").trim().toLowerCase();
        const comp = porId.get(l.insumo_id);
        const qtd = Number(l.quantity_per_unit);
        // Só `un`: caixa se conta em peças. Componente medido em ml/L é
        // conteúdo, não embalagem — é o caso da Boca 28, que leva 100 ml de
        // líquido e NÃO é uma caixa de líquido.
        if (comp && categoria.get(comp.id) === "Produto Final"
            && (un === "un" || un === "") && Number.isFinite(qtd) && qtd > 0) {
          porItem *= qtd;
          atual = comp;
          continue;
        }
      }
      break;
    }
    saida.set(p.id, {
      id: atual.id,
      nome: atual.name ?? atual.product_code ?? "Produto sem nome",
      codigo: atual.product_code,
      porItem,
    });
  }
  return saida;
}
