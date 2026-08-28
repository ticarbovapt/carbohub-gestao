import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Movimentações de estoque (Carbo Ops) — LEITURA do banco compartilhado.
//  • stock_movements = ledger append-only (entrada/saída). Tem warehouse_id →
//    cada hub mostra só as suas (telas independentes), FILTRADO NO SERVIDOR.
//  • created_by → nome de quem fez (profiles.full_name).
//  RLS: stock_movements liberado por SELECT a autenticado (migration do estoque).
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as { from: (t: string) => any };

export interface StockMovement {
  id: string;
  data: string;            // created_at ISO
  produto: string;
  product_code: string;
  tipo: "entrada" | "saida";
  qtd: number;
  unidade: string;
  origem: string;          // PC | OP | ajuste | ecommerce
  observacoes: string | null;
  warehouseCode: string | null;
  por: string | null;      // nome de quem fez
  // Elo com o card que causou o movimento. Preenchido a partir da etapa 2
  // (venda) e 3 (produção); null em ajuste e transferência.
  orderId: string | null;
  orderNumber: string | null;
  opId: string | null;
  opNumber: string | null;
  /**
   * Documento de origem que NÃO é id do nosso banco — hoje o pedido de
   * e-commerce (`nuvemshop:1234-5678`). Fica em coluna própria, não dentro da
   * observação: número no meio de uma frase não dá para filtrar nem copiar.
   */
  refExterna: string | null;
  /**
   * Quem executou quando não foi gente logada (`cron:ecommerce`). ⚠️ Existe
   * para a tela não mostrar "—" tanto para "o sistema fez" quanto para "não se
   * sabe quem fez" — duas coisas diferentes com a mesma cara.
   */
  executor: string | null;
}

/**
 * Movimentações de um hub num período.
 *
 * ⚠️ O HUB E O PERÍODO FILTRAM NO SERVIDOR, não na tela.
 *
 * Antes esta consulta trazia as 300 mais recentes de TODOS os hubs e a tela
 * filtrava depois. Funcionava enquanto o volume era baixo — mas basta um hub
 * movimentar muito para as 300 vagas serem tomadas por ele, e os outros hubs
 * ficarem com a aba VAZIA. Não é hipótese: as saídas por venda vão entrar
 * nesta tabela em breve, quase todas no HUB-RN, e afogariam os CDs de SP.
 *
 * Filtrar por `warehouse_id` no servidor não muda quem aparece: movimento com
 * warehouse nulo (rota legada que grava saldo com hub e movimento sem) já não
 * aparecia em hub nenhum, porque o filtro da tela comparava com o código.
 *
 * @param warehouseCode código do hub (HUB-RN, HUB-SP…). Sem ele, não busca.
 * @param fromISO/toISO  janela; o mesmo período dos KPIs, para lista e cartão
 *                       não contarem coisas diferentes.
 */
export function useStockMovements(
  warehouseCode: string | null | undefined,
  fromISO?: string,
  toISO?: string,
  limit = 300,
) {
  return useQuery({
    queryKey: ["ops", "stock-movements", warehouseCode, fromISO, toISO, limit],
    enabled: !!warehouseCode,
    queryFn: async (): Promise<StockMovement[]> => {
      // O id do hub tem de ser resolvido antes: stock_movements guarda
      // warehouse_id, e quem chama conhece o code.
      const wh = await db.from("warehouses").select("id, code");
      if (wh.error) throw wh.error;
      const hubId = (wh.data ?? []).find((w: { code: string }) => w.code === warehouseCode)?.id ?? null;
      // Hub que não existe na tabela (o CD Bling é um caso real) devolve lista
      // vazia em vez de trazer o mundo inteiro sem filtro.
      if (!hubId) return [];

      let q = db
        .from("stock_movements")
        .select("id, product_id, warehouse_id, tipo, quantidade, origem, observacoes, created_at, created_by, order_id, op_id, ref_externa, executor")
        .eq("warehouse_id", hubId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (fromISO) q = q.gte("created_at", fromISO);
      if (toISO) q = q.lte("created_at", toISO);

      const [movs, products, warehouses, profiles] = await Promise.all([
        q,
        db.from("mrp_products").select("id, name, product_code, stock_unit"),
        db.from("warehouses").select("id, code"),
        db.from("profiles").select("id, full_name"),
      ]);
      if (movs.error) throw movs.error;
      if (products.error) throw products.error;
      if (warehouses.error) throw warehouses.error;
      // profiles pode ser barrado por RLS — nome cai pra "—" se faltar.

      const prodById = new Map<string, { name: string; code: string; unit: string }>();
      for (const p of products.data ?? []) prodById.set(p.id, { name: p.name ?? "", code: p.product_code ?? "", unit: p.stock_unit ?? "un" });
      const codeById = new Map<string, string>();
      for (const w of warehouses.data ?? []) codeById.set(w.id, w.code);
      const nameById = new Map<string, string>();
      for (const p of profiles.data ?? []) nameById.set(p.id, p.full_name ?? "");

      // Números do pedido e da OP. Buscados SÓ para os ids que apareceram na
      // página — o texto da observação já traz o número, mas ele é texto: para
      // virar link precisa do id, e para o link ter rótulo precisa do número.
      const linhas = (movs.data ?? []) as Record<string, unknown>[];
      const orderIds = [...new Set(linhas.map((m) => m.order_id).filter(Boolean))] as string[];
      const opIds = [...new Set(linhas.map((m) => m.op_id).filter(Boolean))] as string[];
      const [ords, ops] = await Promise.all([
        orderIds.length
          ? db.from("carboze_orders").select("id, order_number").in("id", orderIds)
          : Promise.resolve({ data: [], error: null }),
        opIds.length
          ? db.from("production_orders").select("id, op_number").in("id", opIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      const ordNum = new Map<string, string>();
      for (const o of ords.data ?? []) ordNum.set(o.id, o.order_number ?? "");
      const opNum = new Map<string, string>();
      for (const o of ops.data ?? []) opNum.set(o.id, o.op_number ?? "");

      return linhas.map((m) => {
        const p = prodById.get(m.product_id as string);
        return {
          id: m.id as string,
          data: m.created_at as string,
          produto: p?.name ?? "—",
          product_code: p?.code ?? "",
          tipo: (m.tipo as "entrada" | "saida") ?? "entrada",
          qtd: Number(m.quantidade) || 0,
          unidade: p?.unit ?? "un",
          origem: (m.origem as string) ?? "",
          observacoes: (m.observacoes as string) ?? null,
          warehouseCode: m.warehouse_id ? codeById.get(m.warehouse_id as string) ?? null : null,
          por: m.created_by ? nameById.get(m.created_by as string) || null : null,
          orderId: (m.order_id as string) ?? null,
          orderNumber: m.order_id ? ordNum.get(m.order_id as string) ?? null : null,
          opId: (m.op_id as string) ?? null,
          opNumber: m.op_id ? opNum.get(m.op_id as string) ?? null : null,
          refExterna: (m.ref_externa as string) ?? null,
          executor: (m.executor as string) ?? null,
        };
      });
    },
  });
}
