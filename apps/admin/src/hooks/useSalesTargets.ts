import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface SalesTarget {
  id: string;
  vendedor_id: string;
  month: string; // ISO date: 2026-04-01
  target_amount: number;
  target_qty: number;
  linha: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  vendedor?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    department: string | null;
    secondary_department: string | null;
  };
}

export interface SalesTargetWithProgress extends SalesTarget {
  actual_amount: number;
  actual_qty: number;
  pct_amount: number;
  pct_qty: number;
  // De onde veio a meta efetiva deste mês:
  //  "month"   = exceção específica do mês (linha em sales_targets)
  //  "default" = meta padrão recorrente (sales_target_defaults)
  //  "none"    = vendedor sem meta padrão nem exceção (aparece zerado)
  source: "month" | "default" | "none";
  // id da exceção do mês (quando source === "month"), para editar/remover
  override_id: string | null;
  // valor da meta padrão (para mostrar "voltar ao padrão = R$ X")
  default_amount: number;
}

export function useSalesTargets(month?: string) {
  return useQuery({
    queryKey: ["sales-targets", month],
    queryFn: async () => {
      let query = supabase
        .from("sales_targets")
        .select(`
          *,
          vendedor:profiles(id, full_name, avatar_url, department, secondary_department)
        `)
        .order("month", { ascending: false });

      if (month) {
        query = query.eq("month", month);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as SalesTarget[];
    },
  });
}

const POLL_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

export function useSalesTargetsWithProgress(month: string) {
  return useQuery({
    queryKey: ["sales-targets-progress", month],
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      // Exceções do mês (metas específicas)
      const { data: targets, error: targetsError } = await supabase
        .from("sales_targets")
        .select(`*, vendedor:profiles(id, full_name, avatar_url, department, secondary_department)`)
        .eq("month", month);

      if (targetsError) throw targetsError;

      // Metas padrão (recorrentes) por vendedor
      const { data: defaults } = await supabase
        .from("sales_target_defaults")
        .select("vendedor_id, target_amount, target_qty");
      const defaultMap: Record<string, { amount: number; qty: number }> = {};
      for (const d of defaults || []) {
        defaultMap[d.vendedor_id] = { amount: Number(d.target_amount || 0), qty: Number(d.target_qty || 0) };
      }

      // Todos os vendedores ativos — aparecem no dashboard mesmo zerados
      const { data: vendedores } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, department, secondary_department")
        .eq("is_vendedor", true);

      // Fetch orders for the month.
      // Uses sale_date when set (head/command correction) with fallback to created_at.
      // We fetch a ±1-month expanded range so corrections around month boundaries are captured,
      // then JS-filter by effective date.
      const [yearNum, monNum] = month.split("-").map(Number);
      const lastDay = new Date(yearNum, monNum, 0).getDate();
      const monthStartStr = `${month}-01`;
      const monthEndStr   = `${yearNum}-${String(monNum).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      // Expanded created_at window: previous month start → next month end
      const expandedStart = new Date(yearNum, monNum - 2, 1).toISOString();
      const expandedEnd   = new Date(yearNum, monNum + 1, 0, 23, 59, 59).toISOString();

      const { data: ordersRaw } = await supabase
        .from("carboze_orders")
        .select("vendedor_id, total, items, status, created_at, sale_date")
        .gte("created_at", expandedStart)
        .lte("created_at", expandedEnd);

      const orders = (ordersRaw || []).filter(o => {
        if (o.status === "cancelled") return false;
        const effectiveDate = o.sale_date ?? o.created_at.substring(0, 10);
        return effectiveDate >= monthStartStr && effectiveDate <= monthEndStr;
      });

      // Calculate progress per vendedor
      const progressMap: Record<string, { amount: number; qty: number }> = {};
      for (const order of orders || []) {
        if (!order.vendedor_id) continue;
        if (!progressMap[order.vendedor_id]) {
          progressMap[order.vendedor_id] = { amount: 0, qty: 0 };
        }
        progressMap[order.vendedor_id].amount += Number(order.total || 0);
        const items = Array.isArray(order.items) ? order.items : [];
        progressMap[order.vendedor_id].qty += items.reduce(
          (sum: number, item: any) => sum + (item.quantity || 0),
          0
        );
      }

      // Indexa exceções do mês por vendedor
      const overrideMap: Record<string, SalesTarget> = {};
      for (const t of targets || []) overrideMap[t.vendedor_id] = t as SalesTarget;

      // União de todos os vendedores que devem aparecer: ativos + quem tem
      // exceção/padrão (cobre vendedor inativo que ainda tenha meta no mês).
      const vendedorMap: Record<string, SalesTarget["vendedor"]> = {};
      for (const v of vendedores || []) vendedorMap[v.id] = v as SalesTarget["vendedor"];
      for (const t of targets || []) if (t.vendedor) vendedorMap[t.vendedor_id] = t.vendedor;

      const allIds = new Set<string>([
        ...Object.keys(vendedorMap),
        ...Object.keys(defaultMap),
      ]);

      return Array.from(allIds)
        .filter((vid) => {
          // Esconde "fantasmas": id que só tem meta padrão sobrando, sem ser
          // vendedor ativo (vendedorMap), sem exceção do mês e sem vendas.
          // Ex.: vendedor que teve a flag is_vendedor removida mas cuja meta
          // padrão ficou no banco — apareceria como "—" sem este filtro.
          if (vendedorMap[vid]) return true;
          if (overrideMap[vid]) return true;
          if (progressMap[vid]) return true;
          return false;
        })
        .map((vid): SalesTargetWithProgress => {
        const override = overrideMap[vid];
        const def      = defaultMap[vid];
        const progress = progressMap[vid] || { amount: 0, qty: 0 };

        // Resolução: exceção do mês vence; senão a meta padrão; senão zero.
        const source: SalesTargetWithProgress["source"] =
          override ? "month" : def ? "default" : "none";
        const targetAmount = override ? Number(override.target_amount) : (def?.amount ?? 0);
        const targetQty    = override ? Number(override.target_qty)    : (def?.qty ?? 0);

        return {
          id: override?.id ?? `${source}-${vid}`,
          vendedor_id: vid,
          month,
          target_amount: targetAmount,
          target_qty: targetQty,
          linha: override?.linha ?? null,
          created_at: override?.created_at ?? "",
          updated_at: override?.updated_at ?? "",
          vendedor: vendedorMap[vid],
          actual_amount: progress.amount,
          actual_qty: progress.qty,
          pct_amount: targetAmount > 0 ? Math.round((progress.amount / targetAmount) * 100) : 0,
          pct_qty: targetQty > 0 ? Math.round((progress.qty / targetQty) * 100) : 0,
          source,
          override_id: override?.id ?? null,
          default_amount: def?.amount ?? 0,
        };
      });
    },
  });
}

export function useUpsertSalesTarget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      vendedor_id: string;
      month: string;
      target_amount: number;
      target_qty: number;
      linha?: string | null;
    }) => {
      // Manual upsert: functional unique index on COALESCE(linha,'') is not
      // resolvable via PostgREST onConflict column names.
      let existingQuery = supabase
        .from("sales_targets")
        .select("id")
        .eq("vendedor_id", data.vendedor_id)
        .eq("month", data.month);

      existingQuery = data.linha
        ? existingQuery.eq("linha", data.linha)
        : existingQuery.is("linha", null);

      const { data: existing } = await existingQuery.maybeSingle();

      const payload = { ...data, updated_at: new Date().toISOString() };

      if (existing?.id) {
        const { data: result, error } = await supabase
          .from("sales_targets")
          .update(payload)
          .eq("id", existing.id)
          .select()
          .single();
        if (error) throw error;
        return result;
      }

      const { data: result, error } = await supabase
        .from("sales_targets")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-targets"] });
      queryClient.invalidateQueries({ queryKey: ["sales-targets-progress"] });
      toast.success("Meta salva!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao salvar meta: " + error.message);
    },
  });
}

// ── Metas padrão (recorrentes) ───────────────────────────────────────────────

export interface SalesTargetDefault {
  vendedor_id: string;
  target_amount: number;
  target_qty: number;
  linha: string | null;
}

export function useSalesTargetDefaults() {
  return useQuery({
    queryKey: ["sales-target-defaults"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_target_defaults")
        .select("vendedor_id, target_amount, target_qty, linha");
      if (error) throw error;
      return (data || []) as SalesTargetDefault[];
    },
  });
}

export function useUpsertSalesTargetDefault() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { vendedor_id: string; target_amount: number; target_qty?: number; linha?: string | null }) => {
      const linha = data.linha ?? null;
      let q = supabase.from("sales_target_defaults").select("id").eq("vendedor_id", data.vendedor_id);
      q = linha ? q.eq("linha", linha) : q.is("linha", null);
      const { data: existing } = await q.maybeSingle();

      const payload = {
        vendedor_id: data.vendedor_id,
        target_amount: data.target_amount,
        target_qty: data.target_qty ?? 0,
        linha,
        updated_at: new Date().toISOString(),
      };

      if (existing?.id) {
        const { error } = await supabase.from("sales_target_defaults").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("sales_target_defaults").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-target-defaults"] });
      queryClient.invalidateQueries({ queryKey: ["sales-targets-progress"] });
      toast.success("Meta padrão salva — vale para todos os meses.");
    },
    onError: (e: Error) => toast.error("Erro ao salvar meta padrão: " + e.message),
  });
}

export function useDeleteSalesTargetDefault() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vendedorId: string) => {
      const { error } = await supabase
        .from("sales_target_defaults")
        .delete()
        .eq("vendedor_id", vendedorId)
        .is("linha", null);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-target-defaults"] });
      queryClient.invalidateQueries({ queryKey: ["sales-targets-progress"] });
      toast.success("Meta padrão removida.");
    },
  });
}

export function useDeleteSalesTarget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sales_targets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-targets"] });
      queryClient.invalidateQueries({ queryKey: ["sales-targets-progress"] });
      toast.success("Meta removida.");
    },
  });
}

export interface WeeklyTopEntry {
  rank: number;
  vendedor_id: string;
  total: number;
  profile: { id: string; full_name: string | null; avatar_url: string | null; department: string | null; secondary_department: string | null } | null;
}

// Commercial week: starts Friday, ends Thursday.
// Capped to the 1st of the current month — if the Friday that started
// this week belongs to the previous month, sales from the new month
// already count toward the new month's targets.
function commercialWeekStart(): Date {
  const now = new Date();
  const dow = now.getDay(); // 0=Sun … 6=Sat
  const daysSinceFriday = dow >= 5 ? dow - 5 : dow + 2;
  const friday = new Date(now);
  friday.setDate(now.getDate() - daysSinceFriday);
  friday.setHours(0, 0, 0, 0);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return friday >= monthStart ? friday : monthStart;
}

export function useWeeklyTopVendedores() {
  return useQuery({
    queryKey: ["weekly-top-vendedores"],
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const weekStart = commercialWeekStart();
      // Expand by 7 days to catch sale_date corrections
      const expandedStart = new Date(weekStart);
      expandedStart.setDate(expandedStart.getDate() - 7);

      const { data: ordersRaw } = await supabase
        .from("carboze_orders")
        .select("vendedor_id, total, status, created_at, sale_date")
        .gte("created_at", expandedStart.toISOString());

      const orders = (ordersRaw || []).filter(o => {
        if (o.status === "cancelled" || !o.vendedor_id) return false;
        const effectiveDate = new Date(o.sale_date ?? o.created_at);
        return effectiveDate >= weekStart;
      });
      const totals: Record<string, number> = {};
      for (const order of orders || []) {
        if (!order.vendedor_id) continue;
        totals[order.vendedor_id] = (totals[order.vendedor_id] || 0) + Number(order.total || 0);
      }

      const topIds = Object.entries(totals)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([id]) => id);

      if (topIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, department, secondary_department")
        .in("id", topIds);

      return topIds.map((id, idx): WeeklyTopEntry => ({
        rank: idx + 1,
        vendedor_id: id,
        total: totals[id],
        profile: profiles?.find(p => p.id === id) ?? null,
      }));
    },
  });
}

export interface WeeklyVendedorEntry {
  rank: number;
  vendedor_id: string;
  total: number;
  count: number;
  profile: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    department: string | null;
    secondary_department: string | null;
  } | null;
}

export interface WeeklyVendedoresResult {
  entries: WeeklyVendedorEntry[];
  weekStart: string; // ISO date (sexta)
  weekEnd: string;   // ISO date (quinta)
}

// Semana comercial: sexta → quinta. SEM corte no início do mês — usado para
// navegar entre semanas e exibir o intervalo de datas na tela.
export function commercialWeekStartOf(ref: Date): Date {
  const d = new Date(ref);
  const dow = d.getDay(); // 0=Dom … 6=Sáb
  const daysSinceFriday = dow >= 5 ? dow - 5 : dow + 2;
  const start = new Date(d);
  start.setDate(d.getDate() - daysSinceFriday);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function useWeeklyVendedoresData(teamFilter?: "todos" | "cgc" | "expansao", weekStartISO?: string) {
  return useQuery({
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    queryKey: ["weekly-vendedores-data", teamFilter, weekStartISO ?? "current"],
    queryFn: async (): Promise<WeeklyVendedoresResult> => {
      const weekStart = weekStartISO
        ? new Date(weekStartISO + "T00:00:00")
        : commercialWeekStartOf(new Date());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const expandedStart = new Date(weekStart); expandedStart.setDate(expandedStart.getDate() - 2);
      const expandedEnd   = new Date(weekEnd);   expandedEnd.setDate(expandedEnd.getDate() + 2);

      const { data: ordersRaw } = await supabase
        .from("carboze_orders")
        .select("vendedor_id, total, status, created_at, sale_date")
        .gte("created_at", expandedStart.toISOString())
        .lte("created_at", expandedEnd.toISOString());

      const orders = (ordersRaw || []).filter(o => {
        if (o.status === "cancelled" || !o.vendedor_id) return false;
        const eff = new Date((o.sale_date ?? o.created_at.substring(0, 10)) + "T12:00:00");
        return eff >= weekStart && eff <= weekEnd;
      });

      const totals: Record<string, { total: number; count: number }> = {};
      for (const order of orders) {
        const vid = order.vendedor_id!;
        if (!totals[vid]) totals[vid] = { total: 0, count: 0 };
        totals[vid].total += Number(order.total || 0);
        totals[vid].count += 1;
      }

      // Só quem está flegado como vendedor — inclui zerados.
      const { data: vendedores } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, department, secondary_department")
        .eq("is_vendedor", true);

      let entries: WeeklyVendedorEntry[] = (vendedores || []).map(v => ({
        rank: 0,
        vendedor_id: v.id,
        total: totals[v.id]?.total || 0,
        count: totals[v.id]?.count || 0,
        profile: v as WeeklyVendedorEntry["profile"],
      }));

      if (teamFilter && teamFilter !== "todos") {
        entries = entries.filter(e =>
          e.profile?.department === teamFilter || e.profile?.secondary_department === teamFilter);
      }

      entries.sort((a, b) => b.total - a.total);
      entries = entries.map((e, idx) => ({ ...e, rank: idx + 1 }));

      return {
        entries,
        weekStart: weekStart.toISOString().slice(0, 10),
        weekEnd: weekEnd.toISOString().slice(0, 10),
      };
    },
  });
}
