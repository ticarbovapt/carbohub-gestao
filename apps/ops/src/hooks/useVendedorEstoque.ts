import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Estoque dos vendedores (Carbo Ops)
//
// A caixa de cada vendedor é um `warehouse` com kind='vendedor'. Por isso este
// arquivo é curto: saldo, movimento e transferência já existem e funcionam.
//
// ⚠️ O envio reaproveita `ops_transfer_register` SEM alterar a RPC. Ela já sai
// do HUB-RN, trava a linha do produto, confere saldo e recusa o que não tem —
// e é essa conferência que a gente NÃO quer reescrever: reimplementá-la aqui
// criaria uma segunda regra de "pode enviar?" para divergir da primeira.
//
// A chegada continua sendo `ops_transfer_confirm` (a mesma dos hubs): o
// crédito no destino acontece lá, numa transação com o flip do status.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
};

export interface CaixaVendedor {
  warehouse_id: string;
  warehouse_code: string;
  warehouse_name: string;
  is_active: boolean;
  vendedor_id: string;
  vendedor_nome: string | null;
  vendedor_avatar: string | null;
  itens: {
    product_id: string;
    product_code: string | null;
    product_name: string;
    stock_unit: string | null;
    quantidade: number;
    saldo_em: string | null;
  }[];
  total_unidades: number;
  skus_com_saldo: number;
}

/** Uma linha por vendedor, com os produtos dentro. A view devolve linha ZERADA
 *  para produto sem saldo de propósito — é o que falta na caixa. */
export function useVendedorEstoque() {
  return useQuery({
    queryKey: ["ops", "vendedor-estoque"],
    queryFn: async (): Promise<CaixaVendedor[]> => {
      const { data, error } = await db
        .from("vendedor_estoque")
        .select("*")
        .order("vendedor_nome")
        .order("product_name");
      if (error) throw error;

      const porVendedor = new Map<string, CaixaVendedor>();
      for (const r of (data ?? []) as Record<string, any>[]) {
        let c = porVendedor.get(r.warehouse_id);
        if (!c) {
          c = {
            warehouse_id: r.warehouse_id,
            warehouse_code: r.warehouse_code,
            warehouse_name: r.warehouse_name,
            is_active: r.is_active,
            vendedor_id: r.vendedor_id,
            vendedor_nome: r.vendedor_nome,
            vendedor_avatar: r.vendedor_avatar,
            itens: [],
            total_unidades: 0,
            skus_com_saldo: 0,
          };
          porVendedor.set(r.warehouse_id, c);
        }
        const qtd = Number(r.quantidade) || 0;
        c.itens.push({
          product_id: r.product_id,
          product_code: r.product_code,
          product_name: r.product_name,
          stock_unit: r.stock_unit,
          quantidade: qtd,
          saldo_em: r.saldo_em,
        });
        c.total_unidades += qtd;
        if (qtd > 0) c.skus_com_saldo += 1;
      }
      return [...porVendedor.values()];
    },
  });
}

/** Saldo do HUB-RN por produto — é de lá que sai tudo. Serve para a tela
 *  mostrar o teto ANTES de o operador digitar, em vez de deixar a RPC recusar
 *  depois: erro que dá para evitar antes do clique não deveria virar toast. */
export function useSaldoNatal() {
  return useQuery({
    queryKey: ["ops", "saldo-natal"],
    queryFn: async (): Promise<Record<string, number>> => {
      const wh = await db.from("warehouses").select("id").eq("code", "HUB-RN").maybeSingle();
      if (wh.error) throw wh.error;
      if (!wh.data?.id) return {};
      const { data, error } = await db
        .from("warehouse_stock")
        .select("product_id, quantity")
        .eq("warehouse_id", wh.data.id);
      if (error) throw error;
      const mapa: Record<string, number> = {};
      for (const r of (data ?? []) as { product_id: string; quantity: number }[]) {
        mapa[r.product_id] = Number(r.quantity) || 0;
      }
      return mapa;
    },
  });
}

/** Envia produto de Natal para a caixa do vendedor. Débito no RN + registro +
 *  movimento numa transação só, dentro da RPC. */
export function useEnviarParaVendedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      productId: string; productCode: string; toCode: string;
      quantity: number; notes?: string | null;
    }) => {
      if (!Number.isFinite(p.quantity) || p.quantity <= 0) throw new Error("Quantidade inválida.");
      const { data: auth } = await db.auth.getUser();
      const rr = await db.rpc("ops_transfer_register", {
        p_product_id: p.productId,
        p_product_code: p.productCode,
        p_to_code: p.toCode,
        p_qty: p.quantity,
        p_notes: p.notes || null,
        p_user: auth?.user?.id ?? null,
      });
      if (rr.error) throw rr.error;
      return rr.data as string;
    },
    onSuccess: () => {
      // O envio sai do RN mas ainda NÃO está na caixa: a transferência nasce em
      // trânsito e só credita o destino na confirmação de chegada. As duas
      // pontas são invalidadas porque o saldo de Natal já caiu.
      qc.invalidateQueries({ queryKey: ["ops", "vendedor-estoque"] });
      qc.invalidateQueries({ queryKey: ["ops", "saldo-natal"] });
      qc.invalidateQueries({ queryKey: ["ops", "stock"] });
      qc.invalidateQueries({ queryKey: ["ops", "stock-transfers"] });
    },
  });
}

/** Transferências ainda em trânsito para caixas de vendedor. É o que explica a
 *  diferença entre "saiu de Natal" e "está com o vendedor" — sem esta lista a
 *  mercadoria some da tela no meio do caminho. */
export function useEnviosEmTransito() {
  return useQuery({
    queryKey: ["ops", "envios-vendedor-transito"],
    queryFn: async () => {
      const whs = await db.from("warehouses").select("id, name").eq("kind", "vendedor");
      if (whs.error) throw whs.error;
      const nomes = new Map<string, string>(
        ((whs.data ?? []) as { id: string; name: string }[]).map((w) => [w.id, w.name]),
      );
      if (nomes.size === 0) return [];

      const { data, error } = await db
        .from("stock_transfers")
        .select("id, product_id, product_code, quantity, status, notes, created_at, to_hub")
        .in("to_hub", [...nomes.keys()])
        .eq("status", "approved")
        .order("created_at", { ascending: false });
      if (error) throw error;

      return ((data ?? []) as Record<string, any>[]).map((t) => ({
        id: t.id as string,
        product_code: (t.product_code as string) ?? "",
        quantidade: Number(t.quantity) || 0,
        destino: nomes.get(t.to_hub as string) ?? "—",
        notes: (t.notes as string) ?? null,
        created_at: t.created_at as string,
      }));
    },
  });
}

export function useConfirmarChegadaVendedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (transferId: string) => {
      const { data: auth } = await db.auth.getUser();
      const rr = await db.rpc("ops_transfer_confirm", {
        p_transfer_id: transferId,
        p_user: auth?.user?.id ?? null,
      });
      if (rr.error) throw rr.error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ops", "vendedor-estoque"] });
      qc.invalidateQueries({ queryKey: ["ops", "envios-vendedor-transito"] });
      qc.invalidateQueries({ queryKey: ["ops", "stock-transfers"] });
    },
  });
}

/**
 * Corrige o saldo de uma caixa a partir do que foi CONTADO.
 *
 * ⚠️ Manda também o `saldoEsperado` — o número que a tela estava exibindo. Se
 * ele não bater com o do banco, a RPC RECUSA: significa que houve venda ou
 * chegada enquanto a pessoa conferia, e ajustar com o número velho apagaria
 * essa movimentação. Recusar custa um clique; gravar em cima custa um
 * inventário.
 *
 * ⚠️ NÃO use `useSetStockQty` para caixa de vendedor. Ele grava valor absoluto
 * lido da tela, em duas requisições separadas, e apaga venda concorrente.
 */
export function useAjustarCaixa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      warehouseId: string; productId: string; qtdContada: number;
      motivo: string; obs?: string | null; saldoEsperado: number;
    }) => {
      const rr = await db.rpc("carbo_ajustar_estoque", {
        p_warehouse_id: p.warehouseId,
        p_product_id: p.productId,
        p_qty_contada: p.qtdContada,
        p_motivo: p.motivo,
        p_obs: p.obs || null,
        p_saldo_esperado: p.saldoEsperado,
      });
      if (rr.error) throw rr.error;
      return rr.data as number;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ops", "vendedor-estoque"] });
      qc.invalidateQueries({ queryKey: ["ops", "stock"] });
      qc.invalidateQueries({ queryKey: ["ops", "stock-movements"] });
      // O vendedor vê o próprio saldo no /vender e no Meu Estoque.
      qc.invalidateQueries({ queryKey: ["meu_estoque"] });
    },
  });
}

/** Motivos aceitos pelo banco. Lista fechada — ver o CHECK em stock_movements. */
export const MOTIVOS_AJUSTE = [
  { v: "contagem",          label: "Erro de contagem" },
  { v: "quebra",            label: "Quebra / avaria" },
  { v: "perda",             label: "Perda / extravio" },
  { v: "amostra",           label: "Amostra / degustação" },
  { v: "devolucao_cliente", label: "Devolução de cliente" },
  { v: "outro",             label: "Outro" },
] as const;


// ─────────────────────────────────────────────────────────────────────────────
// O caminho de VOLTA
//
// ⚠️ Estas duas funções não são conveniência — são o que impede perda
// silenciosa. Toda lista de trânsito do sistema filtra por `to_hub`, então uma
// devolução sairia da caixa do vendedor e não apareceria para NINGUÉM
// confirmar: presa em `approved` para sempre, debitada de quem devolveu e
// nunca creditada no destino.
// ─────────────────────────────────────────────────────────────────────────────

/** Devolve produto da caixa para outro armazém. Mesma RPC do envio, com a
 *  origem invertida — ela debita a caixa, trava a linha e confere saldo. */
export function useDevolverDaCaixa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      productId: string; productCode: string;
      fromCode: string; toCode: string;
      quantity: number; notes?: string | null;
    }) => {
      if (!Number.isFinite(p.quantity) || p.quantity <= 0) throw new Error("Quantidade inválida.");
      const { data: auth } = await db.auth.getUser();
      const rr = await db.rpc("ops_transfer_register", {
        p_product_id: p.productId,
        p_product_code: p.productCode,
        p_from_code: p.fromCode,
        p_to_code: p.toCode,
        p_qty: p.quantity,
        p_notes: p.notes || null,
        p_user: auth?.user?.id ?? null,
      });
      if (rr.error) throw rr.error;
      return rr.data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ops", "vendedor-estoque"] });
      qc.invalidateQueries({ queryKey: ["ops", "devolucoes-transito"] });
      qc.invalidateQueries({ queryKey: ["ops", "saldo-natal"] });
      qc.invalidateQueries({ queryKey: ["ops", "stock"] });
      qc.invalidateQueries({ queryKey: ["meu_estoque"] });
    },
  });
}

/** O que está VOLTANDO: transferências que SAÍRAM de uma caixa de vendedor e
 *  ainda não foram confirmadas no destino. É a fila que faltava. */
export function useDevolucoesEmTransito() {
  return useQuery({
    queryKey: ["ops", "devolucoes-transito"],
    queryFn: async () => {
      const whs = await db.from("warehouses").select("id, name, kind");
      if (whs.error) throw whs.error;
      const todos = (whs.data ?? []) as { id: string; name: string; kind: string }[];
      const caixas = todos.filter((w) => w.kind === "vendedor").map((w) => w.id);
      const nome = new Map(todos.map((w) => [w.id, w.name]));
      if (caixas.length === 0) return [];

      const { data, error } = await db
        .from("stock_transfers")
        .select("id, product_code, quantity, notes, created_at, from_hub, to_hub")
        .in("from_hub", caixas)
        .eq("status", "approved")
        .order("created_at", { ascending: false });
      if (error) throw error;

      return ((data ?? []) as Record<string, any>[]).map((t) => ({
        id: t.id as string,
        product_code: (t.product_code as string) ?? "",
        quantidade: Number(t.quantity) || 0,
        origem: nome.get(t.from_hub as string) ?? "—",
        destino: nome.get(t.to_hub as string) ?? "—",
        notes: (t.notes as string) ?? null,
        created_at: t.created_at as string,
      }));
    },
  });
}


/** Mínimos cadastrados por caixa. `${warehouse_id}:${product_id}` → min_qty. */
export function useMinimosCaixa() {
  return useQuery({
    queryKey: ["ops", "minimos-caixa"],
    queryFn: async (): Promise<Record<string, number>> => {
      const whs = await db.from("warehouses").select("id").eq("kind", "vendedor");
      if (whs.error) throw whs.error;
      const ids = ((whs.data ?? []) as { id: string }[]).map((w) => w.id);
      if (ids.length === 0) return {};

      const { data, error } = await db.from("ops_stock_min")
        .select("warehouse_id, product_id, min_qty").in("warehouse_id", ids);
      if (error) throw error;

      const mapa: Record<string, number> = {};
      for (const r of (data ?? []) as Record<string, any>[]) {
        mapa[`${r.warehouse_id}:${r.product_id}`] = Number(r.min_qty) || 0;
      }
      return mapa;
    },
  });
}

/**
 * Define o mínimo de um produto numa caixa.
 *
 * ⚠️ Grava por `warehouse_id`, não por `code`. O hook de mínimo dos hubs
 * resolve o armazém pelo código — e o código da caixa é derivado do uuid do
 * vendedor, justamente o acoplamento que a migração das caixas pede para
 * evitar. Aqui o id já está em mãos.
 *
 * ⚠️ Mínimo ZERO apaga a linha em vez de gravar 0: a view de alerta faz INNER
 * JOIN em ops_stock_min, então linha com 0 seria lida como "configurado, mas
 * nunca dispara" — indistinguível de não configurado na tela, e ruído no banco.
 */
export function useSetMinimoCaixa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { warehouseId: string; productId: string; minQty: number }) => {
      if (p.minQty <= 0) {
        const { error } = await db.from("ops_stock_min").delete()
          .eq("warehouse_id", p.warehouseId).eq("product_id", p.productId);
        if (error) throw error;
        return;
      }
      const { data: auth } = await db.auth.getUser();
      const { error } = await db.from("ops_stock_min").upsert(
        {
          warehouse_id: p.warehouseId, product_id: p.productId,
          min_qty: Math.round(p.minQty),
          updated_by: auth?.user?.id ?? null, updated_at: new Date().toISOString(),
        },
        { onConflict: "product_id,warehouse_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops", "minimos-caixa"] }),
  });
}
