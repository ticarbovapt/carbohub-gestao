import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// "Suprimentos" — cockpit ESTRATÉGICO de suprimentos para o Admin, cópia própria
// (somente leitura, cada app é autossuficiente — ver CLAUDE.md). Espelha a
// intenção estratégica da tela /suprimentos do Carbo Ops (valor mobilizado,
// cobertura de custo, risco de ruptura, fluxo de movimentações), mas NÃO é
// operacional: sem registrar remessa, confirmar chegada ou editar política de
// estoque — isso é feito no Ops.
//  • Estoque por hub = warehouse_stock ⋈ warehouses (fonte de verdade — nunca
//    usar mrp_products.current_stock_qty).
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

export const CATEGORY_LIST = ["Produto Final", "Semi-acabado", "Insumo", "Embalagem", "Carbonatação"];
export const categoryOf = (c: string | null | undefined): string =>
  c && CATEGORY_LIST.includes(c) ? c : "Outro";

const hubLabelOf = (code: string) => HUB_LABELS[code] ?? code;

export interface HubValor { hubCode: string; hubLabel: string; valor: number; }
export interface HubRisco { hubCode: string; hubLabel: string; count: number; }
export interface TopProduto { id: string; name: string; product_code: string; category: string; valor: number; }
export interface ValorCategoria { category: string; valor: number; }
export interface TransferenciaStatus { status: "em_transito" | "entregue" | "estornado"; count: number; }
export interface FluxoDiarioRow {
  date: string; // YYYY-MM-DD
  tipo: "entrada" | "saida";
  quantidade: number;
  hubCode: string;
  category: string;
}

export interface SuprimentosCockpit {
  valorPorHub: HubValor[];
  valorTotal: number;
  totalProdutosAtivos: number;
  produtosComCusto: number;
  coberturaPct: number;
  topProdutos: TopProduto[];
  riscoPorHub: HubRisco[];
  riscoTotal: number;
  riscoCriticoTotal: number;
  valorPorCategoria: ValorCategoria[];
  transferencias: TransferenciaStatus[];
  fluxoDiario: FluxoDiarioRow[];
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
      const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const since180 = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();

      const [productsRes, stockRes, minRes, movRes, transfRes] = await Promise.all([
        db.from("mrp_products")
          .select("id, name, product_code, category, unit_cost, safety_stock_qty, is_active")
          .eq("is_active", true),
        db.from("warehouse_stock")
          .select("product_id, quantity, warehouse_id, warehouse:warehouses(id, code, name, is_active)"),
        db.from("ops_stock_min")
          .select("product_id, warehouse_id, min_qty, warehouse:warehouses(code)"),
        db.from("stock_movements")
          .select("product_id, warehouse_id, tipo, quantidade, created_at, warehouse:warehouses(code)")
          .gte("created_at", since90),
        db.from("stock_transfers")
          .select("status, created_at")
          .gte("created_at", since180),
      ]);

      if (productsRes.error) throw productsRes.error;
      if (stockRes.error) throw stockRes.error;
      if (minRes.error) throw minRes.error;
      if (movRes.error) throw movRes.error;
      if (transfRes.error) throw transfRes.error;

      interface Product {
        id: string; name: string; product_code: string; category: string | null;
        unit_cost: number; safety_stock_qty: number;
      }
      const products: Product[] = (productsRes.data ?? []).map((p: Record<string, unknown>) => ({
        id: p.id as string,
        name: (p.name as string) ?? "",
        product_code: (p.product_code as string) ?? "",
        category: (p.category as string) ?? null,
        unit_cost: Number(p.unit_cost) || 0,
        safety_stock_qty: Number(p.safety_stock_qty) || 0,
      }));
      const productById = new Map(products.map((p) => [p.id, p]));

      // ── warehouse_stock ⋈ warehouses ativos ────────────────────────────────
      interface StockRow { product_id: string; warehouse_id: string; hubCode: string; quantity: number; }
      const stockRows: StockRow[] = [];
      const activeWarehouseCodes = new Set<string>();
      for (const row of stockRes.data ?? []) {
        const wh = row.warehouse;
        if (!wh || wh.is_active === false) continue;
        const hubCode = wh.code ?? wh.id;
        activeWarehouseCodes.add(hubCode);
        stockRows.push({
          product_id: row.product_id,
          warehouse_id: row.warehouse_id,
          hubCode,
          quantity: Number(row.quantity) || 0,
        });
      }

      // ── 1/2. Valor mobilizado por hub + total ──────────────────────────────
      const valorPorHubMap = new Map<string, number>();
      for (const row of stockRows) {
        const product = productById.get(row.product_id);
        if (!product) continue;
        const valor = product.unit_cost * row.quantity;
        valorPorHubMap.set(row.hubCode, (valorPorHubMap.get(row.hubCode) ?? 0) + valor);
      }
      const valorPorHub: HubValor[] = Array.from(valorPorHubMap.entries())
        .map(([hubCode, valor]) => ({ hubCode, hubLabel: hubLabelOf(hubCode), valor }))
        .sort((a, b) => b.valor - a.valor);
      const valorTotal = valorPorHub.reduce((s, h) => s + h.valor, 0);

      // ── 3. Cobertura de dado ────────────────────────────────────────────────
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
        .map((x) => ({ ...x.p, category: categoryOf(x.p.category), valor: x.p.unit_cost * x.total }));

      // ── 4. Top 10 produtos por valor ────────────────────────────────────────
      const topProdutos: TopProduto[] = [...produtosComEstoque]
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 10)
        .map((p) => ({ id: p.id, name: p.name, product_code: p.product_code, category: p.category, valor: p.valor }));

      // ── 8. Valor por categoria (sobre TODOS os produtos com estoque) ───────
      const valorPorCategoriaMap = new Map<string, number>();
      for (const p of produtosComEstoque) {
        valorPorCategoriaMap.set(p.category, (valorPorCategoriaMap.get(p.category) ?? 0) + p.valor);
      }
      const valorPorCategoria: ValorCategoria[] = Array.from(valorPorCategoriaMap.entries())
        .map(([category, valor]) => ({ category, valor }))
        .sort((a, b) => b.valor - a.valor);

      // ── ops_stock_min por produto+hub, fallback safety_stock_qty ────────────
      const minByProductHub = new Map<string, number>(); // key = `${product_id}::${hubCode}`
      for (const row of minRes.data ?? []) {
        const hubCode = row.warehouse?.code;
        if (!hubCode) continue;
        minByProductHub.set(`${row.product_id}::${hubCode}`, Number(row.min_qty) || 0);
      }
      const quantityByProductHub = new Map<string, number>();
      for (const row of stockRows) {
        quantityByProductHub.set(`${row.product_id}::${row.hubCode}`, row.quantity);
      }

      // ── 5/6/7. Risco de ruptura por hub ─────────────────────────────────────
      const riscoPorHubMap = new Map<string, number>();
      let riscoCriticoTotal = 0;
      for (const p of products) {
        for (const hubCode of activeWarehouseCodes) {
          const key = `${p.id}::${hubCode}`;
          const effectiveMin = minByProductHub.has(key) ? minByProductHub.get(key)! : p.safety_stock_qty;
          if (effectiveMin <= 0) continue;
          const quantity = quantityByProductHub.get(key) ?? 0;
          if (quantity < effectiveMin) {
            riscoPorHubMap.set(hubCode, (riscoPorHubMap.get(hubCode) ?? 0) + 1);
            if (quantity === 0) riscoCriticoTotal++;
          }
        }
      }
      const riscoPorHub: HubRisco[] = Array.from(riscoPorHubMap.entries())
        .map(([hubCode, count]) => ({ hubCode, hubLabel: hubLabelOf(hubCode), count }))
        .sort((a, b) => b.count - a.count);
      const riscoTotal = riscoPorHub.reduce((s, h) => s + h.count, 0);

      // ── 9. Transferências entre hubs ────────────────────────────────────────
      const transferenciasMap = new Map<string, number>([
        ["em_transito", 0], ["entregue", 0], ["estornado", 0],
      ]);
      for (const row of transfRes.data ?? []) {
        const status = mapTransferStatus(row.status);
        transferenciasMap.set(status, (transferenciasMap.get(status) ?? 0) + 1);
      }
      const transferencias: TransferenciaStatus[] = Array.from(transferenciasMap.entries())
        .map(([status, count]) => ({ status: status as TransferenciaStatus["status"], count }));

      // ── 10. Fluxo diário (linhas cruas — a página agrupa) ──────────────────
      const fluxoDiario: FluxoDiarioRow[] = (movRes.data ?? []).map((m: Record<string, unknown>) => {
        const product = productById.get(m.product_id as string);
        const createdAt = (m.created_at as string) ?? "";
        return {
          date: createdAt.slice(0, 10),
          tipo: (m.tipo as string) === "saida" ? "saida" : "entrada",
          quantidade: Number(m.quantidade) || 0,
          hubCode: (m.warehouse as { code?: string } | null)?.code ?? "—",
          category: categoryOf(product?.category ?? null),
        };
      });

      return {
        valorPorHub, valorTotal, totalProdutosAtivos, produtosComCusto, coberturaPct,
        topProdutos, riscoPorHub, riscoTotal, riscoCriticoTotal, valorPorCategoria,
        transferencias, fluxoDiario,
      };
    },
  });
}
