import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PRECO_REFERENCIA, MARGEM_ALVO_PADRAO, MARGEM_ALVO_POR_CATEGORIA } from "@/lib/precoReferencia";

// ─────────────────────────────────────────────────────────────────────────────
// "Suprimentos" — cockpit ESTRATÉGICO de suprimentos para o Admin, cópia própria
// (somente leitura, cada app é autossuficiente — ver CLAUDE.md). Espelha a
// intenção estratégica da tela /suprimentos do Carbo Ops, mas com foco de CEO:
// não só "quanto de capital está parado e onde", mas TEMPO (giro / dias de
// cobertura), RISCO EM R$, capital congelado (parado + excesso) e a leitura de
// REDE (produção em Natal → venda em SP).
//  • Estoque por hub = warehouse_stock ⋈ warehouses (fonte de verdade — nunca
//    usar mrp_products.current_stock_qty).
//  • Consumo = saídas de stock_movements (90d) — usado p/ giro, dias de
//    cobertura e detecção de excesso; a mesma query já era buscada.
//  • Mínimo por hub = ops_stock_min, com fallback pro safety_stock_qty do
//    produto quando não há política específica pro hub (mesma regra do Ops).
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as { from: (t: string) => any };

export const HUB_LABELS: Record<string, string> = {
  "HUB-RN": "Hub Natal",
  "HUB-SP": "CD SP LogHouse",
  "HUB-SP-VENDAS": "CD SP Vendas",
  "CD-BLING": "CD Bling",
};
// Rede física: Natal produz, SP vende. Usado p/ a leitura de rede e "a remanejar".
export const PRODUCTION_HUB = "HUB-RN";
export const SALES_HUBS = ["HUB-SP", "HUB-SP-VENDAS", "CD-BLING"];

// ⚠️ ESCOPO ATUAL: só Hub Natal. Os CDs de SP (LogHouse/Vendas) são acompanhados
// de outra forma por enquanto — todo estoque/consumo/risco aqui é filtrado a
// estes hubs. Para reativar a visão de rede completa, adicione os códigos de SP
// aqui (a seção "Estado da Rede" e "A Remanejar" voltam a aparecer sozinhas).
export const FOCO_HUBS = ["HUB-RN"];

export const CATEGORY_LIST = ["Produto Final", "Semi-acabado", "Insumo", "Embalagem", "Carbonatação"];
export const categoryOf = (c: string | null | undefined): string =>
  c && CATEGORY_LIST.includes(c) ? c : "Outro";

const hubLabelOf = (code: string) => HUB_LABELS[code] ?? code;

const CONSUMO_JANELA_DIAS = 90;
// Acima de quantos dias de cobertura um produto COM giro é considerado "excesso"
// (capital congelado além de 1 trimestre de consumo).
const EXCESSO_COBERTURA_DIAS = 90;

export interface HubValor { hubCode: string; hubLabel: string; valor: number; }
export interface HubRisco { hubCode: string; hubLabel: string; count: number; }
// Nó da rede (topo): valor mobilizado + ruptura + papel (produção/venda).
export interface HubResumo {
  hubCode: string; hubLabel: string; valor: number; ruptura: number; papel: "producao" | "venda";
}
export interface TopProduto { id: string; name: string; product_code: string; category: string; qty: number; unit: string; valor: number; }
export interface ValorCategoria { category: string; valor: number; }
export interface AbcClasse { classe: "A" | "B" | "C"; count: number; valor: number; pctValor: number; pctCount: number; }
export interface ProdutoEmRisco {
  id: string; name: string; product_code: string; category: string;
  hubCode: string; hubLabel: string;
  quantity: number; effectiveMin: number; unit: string;
  valorRisco: number;            // gap × unit_cost (custo p/ repor até o mínimo)
  diasCobertura: number | null;  // estoque ÷ consumo diário (null se sem giro/sem custo)
}
export interface ProdutoRemanejar {
  id: string; name: string; product_code: string; category: string;
  hubFaltaCode: string; hubFaltaLabel: string;
  faltaQty: number; disponivelProducao: number; unit: string; valorRemanejar: number;
}
export interface ProdutoParado {
  id: string; name: string; product_code: string; category: string; qty: number; unit: string; valor: number;
}
export interface ProdutoExcesso {
  id: string; name: string; product_code: string; category: string;
  qty: number; unit: string; diasCobertura: number; valorExcesso: number;
}
export interface ProdutoSemCusto {
  id: string; name: string; product_code: string; category: string; qty: number; unit: string;
}
export interface CustoFabricacao {
  id: string; name: string; product_code: string; category: string;
  // Rota "🏷️ Rotular" — usa o semi-acabado pronto como está no BOM direto.
  custoCalculado: number;
  custoCadastrado: number;  // unit_cost do próprio produto (p/ variância; 0 = não cadastrado)
  itensFaltantes: number;
  totalItensBom: number;
  // Rota "⚙️ Do zero" — explode o semi-acabado nos insumos crus. null = produto
  // sem semi-acabado na ficha (não há rota alternativa).
  custoZero: number | null;
  itensFaltantesZero: number | null;
  totalItensBomZero: number | null;
  // Veredito p/ o CEO: custo de referência (rota mais barata entre as completas
  // possíveis), qual rota, e economia da alternativa.
  custoReferencia: number;
  rotaReferencia: "rotular" | "zero";
  temAlternativa: boolean;
  economiaZero: number | null;   // custoCalculado − custoZero (>0 = do zero é mais barato)
  completo: boolean;             // rota de referência sem insumo faltando
  variancePct: number | null;    // (custoReferencia − custoCadastrado)/custoCadastrado; null se cadastrado=0
  // Preço sugerido (cascata: âncora manual → sugestão por custo se ficha
  // completa → indisponível). Ver apps/admin/src/lib/precoReferencia.ts.
  precoExibir: number | null;              // preço resolvido (o que a UI mostra)
  fontePreco: "referencia" | "sugerido" | "indisponivel";
  margemAlvoUsada: number;                 // margem-alvo aplicada na sugestão
  margemRealPct: number | null;            // (preço − custo)/preço; só com custo completo
}
export interface Tendencia {
  baseDate: string;             // data do snapshot usado como base de comparação
  valorTotal: number | null;    // variação % do capital em estoque
  riscoValor: number | null;    // variação % do risco em R$
  cobertura: number | null;     // variação em pontos percentuais da cobertura de custo
}
export interface TransferenciaStatus { status: "em_transito" | "entregue" | "estornado"; count: number; }
export interface FluxoDiarioRow {
  date: string; // YYYY-MM-DD
  tipo: "entrada" | "saida";
  quantidade: number;
  valor: number;      // quantidade × unit_cost do produto (fluxo em R$)
  hubCode: string;
  category: string;
}

export interface SuprimentosCockpit {
  // Valor / capital
  valorPorHub: HubValor[];
  valorTotal: number;
  hubResumo: HubResumo[];
  // Giro / tempo
  valorSaidas90: number;
  giroAnualizado: number | null;
  diasCoberturaMedia: number | null;
  // Cobertura de custo (data-quality)
  totalProdutosAtivos: number;
  produtosComCusto: number;
  coberturaPct: number;
  produtosSemCusto: ProdutoSemCusto[];
  produtosSemCustoTotal: number;
  // Top / concentração
  topProdutos: TopProduto[];
  topProdutosValorPct: number;
  abc: AbcClasse[];
  // Risco
  riscoPorHub: HubRisco[];
  riscoTotal: number;
  riscoCriticoTotal: number;
  riscoValorTotal: number;
  produtosEmRisco: ProdutoEmRisco[];
  produtosRemanejar: ProdutoRemanejar[];
  produtosRemanejarTotal: number;
  // Capital congelado
  produtosParados: ProdutoParado[];
  produtosParadosTotal: number;
  valorParado: number;
  produtosExcesso: ProdutoExcesso[];
  produtosExcessoTotal: number;
  valorExcesso: number;
  capitalCongelado: number;
  // Categoria / fluxo
  valorPorCategoria: ValorCategoria[];
  fluxoDiario: FluxoDiarioRow[];
  // Transferências / rede
  transferencias: TransferenciaStatus[];
  valorEmTransito: number;
  unidadesEmTransito: number;
  transitoDiasMax: number | null;
  // BOM
  custoFabricacao: CustoFabricacao[];
  // Tendência vs histórico (suprimentos_snapshots) — null até haver base
  tendencia: Tendencia | null;
}

function mapTransferStatus(raw: string | null): "em_transito" | "entregue" | "estornado" {
  if (raw === "executed") return "entregue";
  if (raw === "cancelled" || raw === "rejected") return "estornado";
  return "em_transito";
}

export function useSuprimentosCockpit() {
  return useQuery({
    queryKey: ["admin", "suprimentos-cockpit"],
    queryFn: async (): Promise<SuprimentosCockpit> => {
      const since90 = new Date(Date.now() - CONSUMO_JANELA_DIAS * 24 * 60 * 60 * 1000).toISOString();
      const since180 = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();

      const snapSince = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const [productsRes, stockRes, minRes, movRes, transfRes, bomRes, snapRes] = await Promise.all([
        db.from("mrp_products")
          .select("id, name, product_code, category, unit_cost, sale_price, safety_stock_qty, stock_unit, is_active")
          .eq("is_active", true),
        db.from("warehouse_stock")
          .select("product_id, quantity, warehouse_id, warehouse:warehouses(id, code, name, is_active)"),
        db.from("ops_stock_min")
          .select("product_id, warehouse_id, min_qty, warehouse:warehouses(code)"),
        db.from("stock_movements")
          .select("product_id, warehouse_id, tipo, quantidade, created_at, warehouse:warehouses(code)")
          .gte("created_at", since90),
        db.from("stock_transfers")
          .select("status, created_at, product_id, quantity")
          .gte("created_at", since180),
        db.from("mrp_bom")
          .select("product_id, insumo_id, quantity_per_unit"),
        // Histórico (tendência). Resiliente: se a tabela/migration ainda não
        // existe, o .catch devolve erro e seguimos sem tendência — não quebra.
        db.from("suprimentos_snapshots")
          .select("snapshot_date, valor_total, risco_valor, produtos_ativos, produtos_com_custo")
          .gte("snapshot_date", snapSince)
          .order("snapshot_date", { ascending: true })
          .then((r: unknown) => r, () => ({ data: null, error: true })),
      ]);

      if (productsRes.error) throw productsRes.error;
      if (stockRes.error) throw stockRes.error;
      if (minRes.error) throw minRes.error;
      if (movRes.error) throw movRes.error;
      if (transfRes.error) throw transfRes.error;
      if (bomRes.error) throw bomRes.error;

      interface Product {
        id: string; name: string; product_code: string; category: string | null;
        unit_cost: number; sale_price: number | null; safety_stock_qty: number; stock_unit: string;
      }
      const products: Product[] = (productsRes.data ?? []).map((p: Record<string, unknown>) => ({
        id: p.id as string,
        name: (p.name as string) ?? "",
        product_code: (p.product_code as string) ?? "",
        category: (p.category as string) ?? null,
        unit_cost: Number(p.unit_cost) || 0,
        sale_price: p.sale_price == null ? null : Number(p.sale_price) || 0,
        safety_stock_qty: Number(p.safety_stock_qty) || 0,
        stock_unit: (p.stock_unit as string) ?? "un",
      }));
      const productById = new Map(products.map((p) => [p.id, p]));

      // Escopo de hubs (Natal-only por enquanto).
      const focoHubs = new Set(FOCO_HUBS);

      // ── warehouse_stock ⋈ warehouses ativos ────────────────────────────────
      interface StockRow { product_id: string; warehouse_id: string; hubCode: string; quantity: number; }
      const stockRows: StockRow[] = [];
      const activeWarehouseCodes = new Set<string>();
      for (const row of stockRes.data ?? []) {
        const wh = row.warehouse;
        if (!wh || wh.is_active === false) continue;
        const hubCode = wh.code ?? wh.id;
        if (!focoHubs.has(hubCode)) continue; // escopo: só Natal por enquanto
        activeWarehouseCodes.add(hubCode);
        stockRows.push({
          product_id: row.product_id,
          warehouse_id: row.warehouse_id,
          hubCode,
          quantity: Number(row.quantity) || 0,
        });
      }

      // Movimentações dentro do escopo de hubs (Natal-only por enquanto).
      const movFoco = (movRes.data ?? []).filter(
        (m: Record<string, unknown>) => focoHubs.has((m.warehouse as { code?: string } | null)?.code ?? ""),
      );

      // ── Consumo (saídas 90d) por produto — base de giro/cobertura/excesso ───
      const saidas90ByProduct = new Map<string, number>();
      for (const m of movFoco) {
        if ((m.tipo as string) !== "saida") continue;
        const pid = m.product_id as string;
        saidas90ByProduct.set(pid, (saidas90ByProduct.get(pid) ?? 0) + (Number(m.quantidade) || 0));
      }
      // Consumo diário do produto (unidades/dia) e cobertura em dias p/ um estoque.
      const consumoDiario = (pid: string) => (saidas90ByProduct.get(pid) ?? 0) / CONSUMO_JANELA_DIAS;
      const coberturaDias = (pid: string, qty: number): number | null => {
        const d = consumoDiario(pid);
        return d > 0 ? qty / d : null;
      };

      // ── 1/2. Valor mobilizado por hub + total ──────────────────────────────
      const valorPorHubMap = new Map<string, number>();
      for (const row of stockRows) {
        const product = productById.get(row.product_id);
        if (!product) continue;
        valorPorHubMap.set(row.hubCode, (valorPorHubMap.get(row.hubCode) ?? 0) + product.unit_cost * row.quantity);
      }
      const valorPorHub: HubValor[] = Array.from(valorPorHubMap.entries())
        .map(([hubCode, valor]) => ({ hubCode, hubLabel: hubLabelOf(hubCode), valor }))
        .sort((a, b) => b.valor - a.valor);
      const valorTotal = valorPorHub.reduce((s, h) => s + h.valor, 0);

      // ── Giro / dias de cobertura (rede) — consumo valorizado em R$ ──────────
      let valorSaidas90 = 0;
      for (const m of movFoco) {
        if ((m.tipo as string) !== "saida") continue;
        const p = productById.get(m.product_id as string);
        if (!p) continue;
        valorSaidas90 += p.unit_cost * (Number(m.quantidade) || 0);
      }
      const burnDiario = valorSaidas90 / CONSUMO_JANELA_DIAS;
      const diasCoberturaMedia = burnDiario > 0 ? valorTotal / burnDiario : null;
      const giroAnualizado = valorTotal > 0 ? (valorSaidas90 * (365 / CONSUMO_JANELA_DIAS)) / valorTotal : null;

      // ── 3. Cobertura de dado + blind spots (produtos com estoque, sem custo) ─
      const totalProdutosAtivos = products.length;
      const produtosComCusto = products.filter((p) => p.unit_cost > 0).length;
      const coberturaPct = totalProdutosAtivos > 0 ? (produtosComCusto / totalProdutosAtivos) * 100 : 0;

      // ── hubTotal(product) e valor por produto ───────────────────────────────
      const hubTotalByProduct = new Map<string, number>();
      for (const row of stockRows) {
        hubTotalByProduct.set(row.product_id, (hubTotalByProduct.get(row.product_id) ?? 0) + row.quantity);
      }

      const produtosComEstoque = products
        .map((p) => ({ p, total: hubTotalByProduct.get(p.id) ?? 0 }))
        .filter((x) => x.total > 0)
        .map((x) => ({ ...x.p, category: categoryOf(x.p.category), total: x.total, valor: x.p.unit_cost * x.total }));

      // Blind spots: têm estoque mas custo R$0 → some no valor mobilizado.
      const produtosSemCustoAll: ProdutoSemCusto[] = produtosComEstoque
        .filter((p) => p.unit_cost <= 0)
        .map((p) => ({ id: p.id, name: p.name, product_code: p.product_code, category: p.category, qty: p.total, unit: p.stock_unit }))
        .sort((a, b) => b.qty - a.qty);
      const produtosSemCustoTotal = produtosSemCustoAll.length;
      const produtosSemCusto = produtosSemCustoAll.slice(0, 8);

      // ── 4. Top 10 produtos por valor + ABC (Pareto) ─────────────────────────
      const ordenadosPorValor = [...produtosComEstoque].sort((a, b) => b.valor - a.valor);
      const topProdutos: TopProduto[] = ordenadosPorValor.slice(0, 10).map((p) => ({
        id: p.id, name: p.name, product_code: p.product_code, category: p.category,
        qty: p.total, unit: p.stock_unit, valor: p.valor,
      }));
      const topProdutosValor = topProdutos.reduce((s, p) => s + p.valor, 0);
      const topProdutosValorPct = valorTotal > 0 ? (topProdutosValor / valorTotal) * 100 : 0;

      // Classificação ABC: A = até 80% do valor acumulado, B = 80–95%, C = resto.
      const abcAgg: Record<"A" | "B" | "C", { count: number; valor: number }> = {
        A: { count: 0, valor: 0 }, B: { count: 0, valor: 0 }, C: { count: 0, valor: 0 },
      };
      let acum = 0;
      const totalComValor = ordenadosPorValor.filter((p) => p.valor > 0);
      for (const p of totalComValor) {
        const pctAntes = valorTotal > 0 ? acum / valorTotal : 0;
        const classe: "A" | "B" | "C" = pctAntes < 0.8 ? "A" : pctAntes < 0.95 ? "B" : "C";
        abcAgg[classe].count++;
        abcAgg[classe].valor += p.valor;
        acum += p.valor;
      }
      const totalCountAbc = totalComValor.length;
      const abc: AbcClasse[] = (["A", "B", "C"] as const).map((classe) => ({
        classe,
        count: abcAgg[classe].count,
        valor: abcAgg[classe].valor,
        pctValor: valorTotal > 0 ? (abcAgg[classe].valor / valorTotal) * 100 : 0,
        pctCount: totalCountAbc > 0 ? (abcAgg[classe].count / totalCountAbc) * 100 : 0,
      }));

      // ── Produtos parados (dead stock): estoque, sem NENHUMA movimentação 90d ─
      const productsWithRecentMovement = new Set<string>(
        movFoco.map((m: Record<string, unknown>) => m.product_id as string),
      );
      const produtosParadosAll: ProdutoParado[] = produtosComEstoque
        .filter((p) => !productsWithRecentMovement.has(p.id))
        .map((p) => ({
          id: p.id, name: p.name, product_code: p.product_code, category: p.category,
          qty: p.total, unit: p.stock_unit, valor: p.valor,
        }))
        .sort((a, b) => b.valor - a.valor);
      const produtosParadosTotal = produtosParadosAll.length;
      const valorParado = produtosParadosAll.reduce((s, p) => s + p.valor, 0);
      const produtosParados = produtosParadosAll.slice(0, 10);

      // ── Excesso (capital congelado além de EXCESSO_COBERTURA_DIAS de consumo) ─
      // Só produtos COM giro (saída>0); acima do limite, o estoque além de N dias
      // de consumo é excesso valorizado.
      const produtosExcessoAll: ProdutoExcesso[] = [];
      for (const p of produtosComEstoque) {
        if (p.unit_cost <= 0) continue;
        const cob = coberturaDias(p.id, p.total);
        if (cob === null || cob <= EXCESSO_COBERTURA_DIAS) continue;
        const consumoNoLimite = consumoDiario(p.id) * EXCESSO_COBERTURA_DIAS;
        const excessoQty = Math.max(0, p.total - consumoNoLimite);
        if (excessoQty <= 0) continue;
        produtosExcessoAll.push({
          id: p.id, name: p.name, product_code: p.product_code, category: p.category,
          qty: p.total, unit: p.stock_unit, diasCobertura: cob, valorExcesso: excessoQty * p.unit_cost,
        });
      }
      produtosExcessoAll.sort((a, b) => b.valorExcesso - a.valorExcesso);
      const produtosExcessoTotal = produtosExcessoAll.length;
      const valorExcesso = produtosExcessoAll.reduce((s, p) => s + p.valorExcesso, 0);
      const produtosExcesso = produtosExcessoAll.slice(0, 10);
      const capitalCongelado = valorParado + valorExcesso;

      // ── 5. Valor por categoria ──────────────────────────────────────────────
      const valorPorCategoriaMap = new Map<string, number>();
      for (const p of produtosComEstoque) {
        valorPorCategoriaMap.set(p.category, (valorPorCategoriaMap.get(p.category) ?? 0) + p.valor);
      }
      const valorPorCategoria: ValorCategoria[] = Array.from(valorPorCategoriaMap.entries())
        .map(([category, valor]) => ({ category, valor }))
        .sort((a, b) => b.valor - a.valor);

      // ── ops_stock_min por produto+hub, fallback safety_stock_qty ────────────
      const minByProductHub = new Map<string, number>();
      for (const row of minRes.data ?? []) {
        const hubCode = row.warehouse?.code;
        if (!hubCode) continue;
        minByProductHub.set(`${row.product_id}::${hubCode}`, Number(row.min_qty) || 0);
      }
      const quantityByProductHub = new Map<string, number>();
      for (const row of stockRows) {
        quantityByProductHub.set(`${row.product_id}::${row.hubCode}`, row.quantity);
      }

      // ── Risco de ruptura por hub — nomeado, em R$ e com dias de cobertura ────
      const riscoPorHubMap = new Map<string, number>();
      let riscoCriticoTotal = 0;
      let riscoValorTotal = 0;
      const produtosEmRiscoAll: (ProdutoEmRisco & { gap: number })[] = [];
      const remanejarAll: ProdutoRemanejar[] = [];
      for (const p of products) {
        for (const hubCode of activeWarehouseCodes) {
          const key = `${p.id}::${hubCode}`;
          const effectiveMin = minByProductHub.has(key) ? minByProductHub.get(key)! : p.safety_stock_qty;
          if (effectiveMin <= 0) continue;
          const quantity = quantityByProductHub.get(key) ?? 0;
          if (quantity >= effectiveMin) continue;
          const gap = effectiveMin - quantity;
          const valorRisco = gap * p.unit_cost;
          riscoPorHubMap.set(hubCode, (riscoPorHubMap.get(hubCode) ?? 0) + 1);
          if (quantity === 0) riscoCriticoTotal++;
          riscoValorTotal += valorRisco;
          produtosEmRiscoAll.push({
            id: p.id, name: p.name, product_code: p.product_code, category: categoryOf(p.category),
            hubCode, hubLabel: hubLabelOf(hubCode), quantity, effectiveMin, unit: p.stock_unit,
            valorRisco, diasCobertura: coberturaDias(p.id, quantity), gap,
          });
          // "A remanejar": falta num hub de venda mas existe no hub de produção.
          if (SALES_HUBS.includes(hubCode)) {
            const disponivelProducao = quantityByProductHub.get(`${p.id}::${PRODUCTION_HUB}`) ?? 0;
            if (disponivelProducao > 0) {
              const faltaQty = Math.min(gap, disponivelProducao);
              remanejarAll.push({
                id: p.id, name: p.name, product_code: p.product_code, category: categoryOf(p.category),
                hubFaltaCode: hubCode, hubFaltaLabel: hubLabelOf(hubCode),
                faltaQty, disponivelProducao, unit: p.stock_unit, valorRemanejar: faltaQty * p.unit_cost,
              });
            }
          }
        }
      }
      const riscoPorHub: HubRisco[] = Array.from(riscoPorHubMap.entries())
        .map(([hubCode, count]) => ({ hubCode, hubLabel: hubLabelOf(hubCode), count }))
        .sort((a, b) => b.count - a.count);
      const riscoTotal = produtosEmRiscoAll.length;
      // Zerados primeiro; depois maior valor em risco (R$ p/ repor).
      const produtosEmRisco: ProdutoEmRisco[] = [...produtosEmRiscoAll]
        .sort((a, b) => (a.quantity === 0 ? -1 : 0) - (b.quantity === 0 ? -1 : 0) || b.valorRisco - a.valorRisco)
        .slice(0, 8)
        .map(({ gap: _gap, ...rest }) => rest);
      remanejarAll.sort((a, b) => b.valorRemanejar - a.valorRemanejar);
      const produtosRemanejarTotal = remanejarAll.length;
      const produtosRemanejar = remanejarAll.slice(0, 10);

      // ── Estado da rede (topo): valor + ruptura por hub, ordenado produção→venda
      const hubResumo: HubResumo[] = Array.from(activeWarehouseCodes)
        .map((hubCode) => ({
          hubCode, hubLabel: hubLabelOf(hubCode),
          valor: valorPorHubMap.get(hubCode) ?? 0,
          ruptura: riscoPorHubMap.get(hubCode) ?? 0,
          papel: (hubCode === PRODUCTION_HUB ? "producao" : "venda") as "producao" | "venda",
        }))
        .sort((a, b) => (a.papel === "producao" ? -1 : 0) - (b.papel === "producao" ? -1 : 0) || b.valor - a.valor);

      // ── Transferências entre hubs + valor em trânsito + aging ───────────────
      const transferenciasMap = new Map<string, number>([
        ["em_transito", 0], ["entregue", 0], ["estornado", 0],
      ]);
      let valorEmTransito = 0;
      let unidadesEmTransito = 0;
      let transitoDiasMax: number | null = null;
      const agora = Date.now();
      for (const row of transfRes.data ?? []) {
        const status = mapTransferStatus(row.status);
        transferenciasMap.set(status, (transferenciasMap.get(status) ?? 0) + 1);
        if (status === "em_transito") {
          const qty = Number(row.quantity) || 0;
          const p = productById.get(row.product_id as string);
          unidadesEmTransito += qty;
          if (p) valorEmTransito += p.unit_cost * qty;
          const created = row.created_at ? new Date(row.created_at as string).getTime() : NaN;
          if (!Number.isNaN(created)) {
            const dias = Math.floor((agora - created) / (24 * 60 * 60 * 1000));
            transitoDiasMax = transitoDiasMax === null ? dias : Math.max(transitoDiasMax, dias);
          }
        }
      }
      const transferencias: TransferenciaStatus[] = Array.from(transferenciasMap.entries())
        .map(([status, count]) => ({ status: status as TransferenciaStatus["status"], count }));

      // ── Fluxo diário (linhas cruas, agora valorizadas em R$) ────────────────
      const fluxoDiario: FluxoDiarioRow[] = movFoco.map((m: Record<string, unknown>) => {
        const product = productById.get(m.product_id as string);
        const createdAt = (m.created_at as string) ?? "";
        const quantidade = Number(m.quantidade) || 0;
        return {
          date: createdAt.slice(0, 10),
          tipo: (m.tipo as string) === "saida" ? "saida" : "entrada",
          quantidade,
          valor: (product?.unit_cost ?? 0) * quantidade,
          hubCode: (m.warehouse as { code?: string } | null)?.code ?? "—",
          category: categoryOf(product?.category ?? null),
        };
      });

      // ── Custo de Fabricação (BOM): 1 nível direto (rotular) + explosão do
      // semi-acabado (do zero). Além dos dois custos, calcula o VEREDITO p/ o
      // CEO: custo de referência (rota mais barata), economia e variância vs
      // custo cadastrado. Nunca esconde valor parcial; sinaliza incompletude.
      const bomByProduct = new Map<string, { insumo_id: string; qty: number }[]>();
      for (const row of bomRes.data ?? []) {
        const arr = bomByProduct.get(row.product_id) ?? [];
        arr.push({ insumo_id: row.insumo_id, qty: Number(row.quantity_per_unit) || 0 });
        bomByProduct.set(row.product_id, arr);
      }
      const computeCost = (itens: { insumo_id: string; qty: number }[]) => {
        let custo = 0;
        let faltantes = 0;
        for (const it of itens) {
          const insumo = productById.get(it.insumo_id);
          const custoUnit = insumo?.unit_cost ?? 0;
          if (!insumo || custoUnit <= 0) faltantes++;
          custo += custoUnit * it.qty;
        }
        return { custo, faltantes, total: itens.length };
      };
      const explodeZero = (
        itens: { insumo_id: string; qty: number }[],
        depth = 0,
      ): { insumo_id: string; qty: number }[] => {
        const out: { insumo_id: string; qty: number }[] = [];
        for (const it of itens) {
          const insumo = productById.get(it.insumo_id);
          const subItens = bomByProduct.get(it.insumo_id);
          if (insumo && categoryOf(insumo.category) === "Semi-acabado" && subItens?.length && depth < 3) {
            for (const sub of explodeZero(subItens, depth + 1)) {
              out.push({ insumo_id: sub.insumo_id, qty: sub.qty * it.qty });
            }
          } else {
            out.push(it);
          }
        }
        return out;
      };
      const custoFabricacao: CustoFabricacao[] = Array.from(bomByProduct.entries())
        .map(([productId, itens]): CustoFabricacao | null => {
          const prod = productById.get(productId);
          if (!prod) return null;
          const rotular = computeCost(itens);
          const temSemiacabado = itens.some(
            (it) => categoryOf(productById.get(it.insumo_id)?.category) === "Semi-acabado",
          );
          const zero = temSemiacabado ? computeCost(explodeZero(itens)) : null;
          // Referência: se há alternativa, prefere a rota COMPLETA mais barata;
          // se ambas incompletas (ou só uma rota), usa rotular como base.
          let rotaReferencia: "rotular" | "zero" = "rotular";
          let custoReferencia = rotular.custo;
          let completo = rotular.faltantes === 0;
          if (zero) {
            const rotularOk = rotular.faltantes === 0;
            const zeroOk = zero.faltantes === 0;
            if (zeroOk && (!rotularOk || zero.custo < rotular.custo)) {
              rotaReferencia = "zero"; custoReferencia = zero.custo; completo = true;
            } else if (rotularOk) {
              rotaReferencia = "rotular"; custoReferencia = rotular.custo; completo = true;
            } else {
              // nenhuma completa → mostra a menor das parciais como piso
              if (zero.custo < rotular.custo && zero.custo > 0) { rotaReferencia = "zero"; custoReferencia = zero.custo; }
              completo = false;
            }
          }
          const economiaZero = zero ? rotular.custo - zero.custo : null;
          const variancePct = prod.unit_cost > 0 ? ((custoReferencia - prod.unit_cost) / prod.unit_cost) * 100 : null;
          // Preço sugerido — cascata: âncora manual > sugestão por custo (só se
          // ficha completa, nunca de custo parcial) > indisponível.
          const precoReferenciaManual = PRECO_REFERENCIA[prod.product_code] ?? null;
          const margemAlvoUsada = MARGEM_ALVO_POR_CATEGORIA[categoryOf(prod.category)] ?? MARGEM_ALVO_PADRAO;
          const precoSugeridoCusto = completo && custoReferencia > 0
            ? custoReferencia / (1 - margemAlvoUsada) : null;
          const precoExibir = precoReferenciaManual ?? precoSugeridoCusto ?? null;
          const fontePreco: "referencia" | "sugerido" | "indisponivel" =
            precoReferenciaManual != null ? "referencia"
              : precoSugeridoCusto != null ? "sugerido"
                : "indisponivel";
          const margemRealPct = precoExibir != null && completo && custoReferencia > 0
            ? ((precoExibir - custoReferencia) / precoExibir) * 100 : null;
          return {
            id: prod.id, name: prod.name, product_code: prod.product_code,
            category: categoryOf(prod.category),
            custoCalculado: rotular.custo, custoCadastrado: prod.unit_cost,
            itensFaltantes: rotular.faltantes, totalItensBom: rotular.total,
            custoZero: zero?.custo ?? null,
            itensFaltantesZero: zero?.faltantes ?? null,
            totalItensBomZero: zero?.total ?? null,
            custoReferencia, rotaReferencia, temAlternativa: zero !== null,
            economiaZero, completo, variancePct,
            precoExibir, fontePreco, margemAlvoUsada, margemRealPct,
          };
        })
        .filter((x): x is CustoFabricacao => x !== null)
        .sort((a, b) => b.custoReferencia - a.custoReferencia);

      // ── Tendência vs histórico ──────────────────────────────────────────────
      // Base = snapshot mais recente com ao menos ~7 dias (p/ variação ter
      // significado); se não houver, o mais antigo disponível. Compara com os
      // valores calculados AGORA (mesma semântica da captura).
      let tendencia: Tendencia | null = null;
      const snapData = (snapRes as { data?: Record<string, unknown>[] | null; error?: unknown })?.error
        ? null
        : ((snapRes as { data?: Record<string, unknown>[] | null })?.data ?? null);
      if (snapData && snapData.length > 0) {
        const hoje = new Date().toISOString().slice(0, 10);
        const anteriores = snapData.filter((r) => String(r.snapshot_date) < hoje);
        if (anteriores.length > 0) {
          const alvo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          const ateAlvo = anteriores.filter((r) => String(r.snapshot_date) <= alvo);
          const base = ateAlvo.length > 0 ? ateAlvo[ateAlvo.length - 1] : anteriores[0];
          const pct = (cur: number, b: number) => (b > 0 ? ((cur - b) / b) * 100 : null);
          const baseAtivos = Number(base.produtos_ativos) || 0;
          const baseCobertura = baseAtivos > 0 ? (Number(base.produtos_com_custo) / baseAtivos) * 100 : null;
          tendencia = {
            baseDate: String(base.snapshot_date),
            valorTotal: pct(valorTotal, Number(base.valor_total) || 0),
            riscoValor: pct(riscoValorTotal, Number(base.risco_valor) || 0),
            cobertura: baseCobertura === null ? null : coberturaPct - baseCobertura,
          };
        }
      }

      return {
        valorPorHub, valorTotal, hubResumo,
        valorSaidas90, giroAnualizado, diasCoberturaMedia,
        totalProdutosAtivos, produtosComCusto, coberturaPct, produtosSemCusto, produtosSemCustoTotal,
        topProdutos, topProdutosValorPct, abc,
        riscoPorHub, riscoTotal, riscoCriticoTotal, riscoValorTotal, produtosEmRisco,
        produtosRemanejar, produtosRemanejarTotal,
        produtosParados, produtosParadosTotal, valorParado,
        produtosExcesso, produtosExcessoTotal, valorExcesso, capitalCongelado,
        valorPorCategoria, fluxoDiario,
        transferencias, valorEmTransito, unidadesEmTransito, transitoDiasMax,
        custoFabricacao, tendencia,
      };
    },
  });
}
