// ─────────────────────────────────────────────────────────────────────────────
// PayT — do postback para as linhas de `ecommerce_orders`.
//
// ⚠️ ESCRITO CONTRA PAYLOAD REAL, não contra a documentação. Os 15 fixtures de
// produção (cartão, pix, boleto, upsell, order bump, carrinho perdido,
// assinatura, UTM) foram lidos antes desta função existir. O `_shared/
// shopeePedido.ts` avisa no topo dele que os caminhos vieram da doc e nunca de
// uma resposta observada — e foi exatamente isso que deixou uma dúvida aberta
// por semanas quando o SKU voltou vazio. Aqui não se repete.
//
// ── O que o payload é, de fato ───────────────────────────────────────────────
//
//   transaction_id   o pedido. NULO em `lost_cart`.
//   cart_id          o carrinho. Existe sempre, inclusive sem pedido.
//   product          UM produto — não é array.
//   product.items[]  os COMPONENTES, quando `type: "grouped"` (kit).
//   order_bumps[]    itens adicionais, cada um com seu próprio `.product`.
//   test             venda de homologação.
//
// Tudo em CENTAVOS, inteiro. Datas em `Y-m-d H:i:s` SEM fuso — Brasília.
// ─────────────────────────────────────────────────────────────────────────────

export interface LinhaPayt {
  platform: "payt";
  order_id: string;
  product_sku: string | null;
  product_name: string | null;
  quantity: number;
  units_real: number;
  unit_price: number;
  total: number;
  status: string;
  ordered_at: string;
  platform_order_number: string | null;
  raw: unknown;
}

/** Centavos → reais. ⚠️ TODO valor da PayT é inteiro em centavos; usar direto
 *  dá faturamento ×100, e o erro passa despercebido no primeiro dia porque
 *  "vendeu bem". */
export const reais = (centavos: unknown): number => {
  const n = Number(centavos);
  return Number.isFinite(n) ? Math.round(n) / 100 : 0;
};

/** `"2020-07-10 13:47:17"` → ISO com o fuso de Brasília explícito.
 *
 *  ⚠️ A PayT manda sem fuso. Tratar como UTC joga o pedido três horas para
 *  frente: venda das 21h30 vira o dia seguinte, e o painel do dia passa a
 *  mostrar três horas de ontem. É o mesmo erro que o `useMetaEcommerce` já
 *  pagou com `ordered_at::date`. */
export function dataDeBrasilia(s: unknown): string | null {
  const t = String(s ?? "").trim();
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, a, mes, d, h, min, seg] = m;
  return new Date(`${a}-${mes}-${d}T${h}:${min}:${seg}-03:00`).toISOString();
}

/** O status da PayT no vocabulário de `ecommerce_orders`.
 *
 *  ⚠️ Enum ABERTO: status desconhecido devolve o texto cru em vez de derrubar a
 *  ingestão ou de virar `pending` por engano. A PayT cria status novo sem
 *  avisar, e perder a venda é pior que guardar um rótulo que ainda não sabemos
 *  ler — o log cru permite reprocessar quando aprendermos.
 *
 *  ⚠️ Não existe `delivered` na PayT. O ciclo dela termina em `shipped`; a
 *  entrega, quando houver, vem pelo rastreio. Card de esteira não vai a
 *  "entregue" por esta via. */
export function statusDaPayt(s: string): string {
  switch (s) {
    case "paid":            return "paid";
    case "waiting_payment": return "pending";
    // Faturada e todo o ciclo logístico já são venda: a mercadoria saiu ou está
    // saindo. Tratá-los como "pendente" tiraria receita real do painel.
    case "billed":
    case "separation":
    case "collected":
    case "shipping":
    case "shipped":         return "shipped";
    case "canceled":        return "cancelled";
    default:                return s;
  }
}

interface Item { sku: string | null; nome: string | null; qtd: number; precoCent: number; code: string }

function itemDoProduto(p: Record<string, unknown> | null | undefined): Item | null {
  if (!p) return null;
  const code = String(p.code ?? "").trim();
  if (!code) return null;
  return {
    code,
    // ⚠️ SKU como TEXTO. Os fixtures trazem `"0001"` e `"9001"`: converter para
    // número apaga o zero à esquerda e o mapa deixa de casar, sem erro.
    sku:  p.sku != null && String(p.sku).trim() !== "" ? String(p.sku).trim() : null,
    nome: p.name != null ? String(p.name) : null,
    qtd:  Math.max(1, Number(p.quantity) || 1),
    precoCent: Number(p.price) || 0,
  };
}

/**
 * O postback vira 0, 1 ou N linhas de `ecommerce_orders`.
 *
 * Devolve `[]` — e isso é resposta, não falha — quando o evento não é uma venda
 * que caiba na tabela. Quem guarda o que foi recusado é `payt_eventos`.
 */
export function linhasDaPayt(body: unknown): { linhas: LinhaPayt[]; motivo: string } {
  const b = (body ?? {}) as Record<string, unknown>;

  // ⚠️ Venda de homologação NÃO vira pedido. Ela contamina faturamento e meta,
  // e ninguém desconfia de um número que só está um pouco maior.
  if (b.test === true) return { linhas: [], motivo: "venda de teste (test: true)" };

  const status = String(b.status ?? "");
  const transacao = b.transaction_id != null ? String(b.transaction_id).trim() : "";

  // ⚠️ Carrinho perdido NÃO é pedido: vem com `transaction_id: null`, sem
  // `transaction`, e virar linha aqui inflaria a contagem de vendas e dispararia
  // o som de venda online para todo o time interno. O `cart_id` fica no log cru,
  // que é de onde uma pipeline de recuperação (como a da Nuvemshop) leria.
  if (status === "lost_cart" || !transacao) {
    return { linhas: [], motivo: status === "lost_cart" ? "carrinho perdido" : "sem transaction_id" };
  }

  // ⚠️ O CARRINHO é o pedido, não a transação.
  //
  // Medido em 01/09 no primeiro pedido PayT que chegou ao Bling: o Bling criou
  // UM pedido (nº 615, R$ 269,10) para DUAS transações nossas — `PK2279K`
  // (R$ 149,50) e `2877EQV` (R$ 119,60, o order bump). O bump é transação
  // separada na PayT e o Bling funde as duas na mesma venda.
  //
  // Com `transaction_id` aqui, a coluna "Pago" mostrava DOIS cards para uma
  // compra só, e casar por transação não resolvia: sairia o `PK2279K` e o
  // `2877EQV` ficaria órfão para sempre, porque o Bling não o referencia em
  // lugar nenhum. Trocaria duplicado por órfão permanente.
  //
  // `cart_id` é o que agrupa: venda, upsell, bump e carrinho recuperado da mesma
  // compra o repetem (conferido nos fixtures — `R6VZW4` cobre lost_cart,
  // cart_recovered e manual_upsell). Assim o card de "Pago" passa a valer os
  // R$ 269,10 e a bater com o pedido do Bling.
  //
  // ⚠️ A transação NÃO se perde: ela continua no `order_id` (`<transacao>-<code>`),
  // que é a chave do upsert, e é por ela que o `numero_loja` do Bling
  // (`PAYT_<seller_id>_<transacao>`) vai casar.
  const carrinho = b.cart_id != null && String(b.cart_id).trim() !== ""
    ? String(b.cart_id).trim()
    : transacao;   // sem carrinho, a transação ainda é melhor que nada

  const dataDoPayload = dataDeBrasilia(b.started_at) ?? dataDeBrasilia(b.updated_at);
  // ⚠️ Inventar a data em SILÊNCIO é a doença que este repo persegue — o
  // `Math.round` que criava o fator `×1` em vez de admitir que não sabia. E
  // `ordered_at` não é enfeite: governa a janela de 12 h do sininho, o marco
  // zero da dedução de estoque e a soma por dia do painel.
  //
  // Recusar a venda seria pior (perder o pedido por causa da data), então o
  // `now()` fica — mas agora ele GRITA. `grep PAYT_SEM_DATA` responde se está
  // acontecendo, em vez de a suspeita depender de alguém notar timestamps
  // repetidos numa consulta.
  if (!dataDoPayload) {
    console.warn(
      `[payt] PAYT_SEM_DATA — transação ${transacao}: started_at=${JSON.stringify(b.started_at)} ` +
      `updated_at=${JSON.stringify(b.updated_at)} não casaram com Y-m-d H:i:s. ` +
      `ordered_at recebeu a hora ATUAL, que não é a hora da venda.`,
    );
  }
  const quando = dataDoPayload ?? new Date().toISOString();
  const st = statusDaPayt(status);

  // O produto principal + cada order bump. ⚠️ `product.items[]` NÃO entra: são
  // os componentes de um kit (`type: "grouped"`), não linhas vendidas. Contá-los
  // multiplicaria a quantidade e o faturamento pelo tamanho do kit — o que se
  // vendeu foi UM kit, e é o SKU dele que o mapa resolve.
  const itens: Item[] = [];
  const principal = itemDoProduto(b.product as Record<string, unknown>);
  if (principal) itens.push(principal);

  for (const bump of (Array.isArray(b.order_bumps) ? b.order_bumps : [])) {
    const it = itemDoProduto((bump as Record<string, unknown>)?.product as Record<string, unknown>);
    if (it) itens.push(it);
  }

  if (itens.length === 0) return { linhas: [], motivo: "payload sem produto" };

  const linhas = itens.map((it) => ({
    platform: "payt" as const,
    // ⚠️ Uma linha por ITEM, com `<pedido>-<code>` — o mesmo desenho de todos os
    // canais, e é o que faz o upsert por (platform, order_id) não duplicar.
    // O `code` do produto é estável na PayT; o índice do array não seria.
    order_id: `${transacao}-${it.code}`,
    product_sku: it.sku,
    product_name: it.nome,
    quantity: it.qtd,
    // `units_real` sem fator é a própria quantidade. Quem multiplica é o mapa
    // (`carbo_ecommerce_sku_resolve`), na leitura — nunca aqui.
    units_real: it.qtd,
    unit_price: reais(it.precoCent),
    // ⚠️ O total da LINHA, não `transaction.total_price`.
    //
    // `total_price` é do PEDIDO, já com desconto e frete. Repeti-lo em cada
    // linha multiplicaria o faturamento pelo número de itens — o furo que a
    // 20260855 fechou. E colocá-lo só na primeira linha faria a soma por
    // produto mentir.
    //
    // ⚠️⚠️ E há um motivo MAIOR, medido no postback real da nossa conta:
    // `total_price` inclui os JUROS DO PARCELAMENTO.
    //
    //     total_price                296616  = 12 × 24718 (installment_price)
    //     price_without_installments 233331  = o valor dos produtos
    //     soma das nossas linhas     233331  ✅
    //
    // Usá-lo como faturamento inflaria a receita em 27% naquele pedido, e o erro
    // cresce com o número de parcelas. Ninguém desconfiaria: o número só ficaria
    // bom demais. A soma das linhas bate EXATO com o valor dos produtos.
    //
    // Sobra a divergência menor, do desconto de pedido (no fixture de cartão o
    // produto sai por 223,92 e a transação fecha em 212,72). Ratear exigiria uma
    // regra de arredondamento que ninguém validou; o valor real está no log cru,
    // e a conciliação é passo próprio.
    total: reais(it.precoCent) * it.qtd,
    status: st,
    ordered_at: quando,
    // ⚠️ O CARRINHO, não a transação — ver o comentário do `carrinho` acima.
    // É por esta coluna que a `ecommerce_aguardando_bling` agrupa a coluna
    // "Pago", então ela precisa ser a unidade que o Bling também enxerga.
    platform_order_number: carrinho,
    raw: body,
  }));

  return { linhas, motivo: `${linhas.length} linha(s)` };
}
