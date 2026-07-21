import { useMemo, useState } from "react";
import {
  Database, AlertTriangle, Search, Download, ShoppingCart, DollarSign, Target, EyeOff,
  Users, Building2, ListOrdered, ArrowUp, ArrowDown, ChevronsUpDown, Layers, Loader2, CheckCircle2, UserPlus, Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useComercialOrders, type ComercialOrderRow } from "@/hooks/useComercialOrders";
import { ComercialFilterBar, EMPTY_FILTERS, type DashFilters } from "@/components/comercial/ComercialFilterBar";
import { ComercialTabs } from "@/components/comercial/ComercialTabs";
import { useFollowupLeadStatus, useCreateFollowupLead } from "@/hooks/useFollowupLead";
import { useVendedoresDir } from "@/hooks/useVendedoresDir";

const brl = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDateTime = (s: string | null) => (s ? new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const fmtDay = (s: string | null) => (s ? new Date(s).toLocaleDateString("pt-BR") : "—");
const fmtDoc = (v: string | null) => {
  const d = (v ?? "").replace(/\D/g, "");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return v?.trim() || "—";
};
const diasDesde = (s: string | null) => (s ? Math.floor((Date.now() - new Date(s).getTime()) / 86_400_000) : null);

// Agregado por CNPJ (nível base).
interface ClienteAgg {
  key: string; cnpj: string | null; nome: string; nomes: Set<string>; vendedores: Set<string>;
  segmento: string | null; pedidos: number; totalBRL: number; primeira: string | null; ultima: string | null;
  orders: ComercialOrderRow[];
}
// Linha exibida (por CNPJ ou grupo de nome). Unifica o render/ordenação/popup.
interface RowVM {
  key: string;
  nome: string;
  cnpjs: string[];              // [] sem doc; 1 = por CNPJ; >1 = grupo de nome com vários CNPJs
  multiNome: number;            // nº de nomes diferentes no mesmo doc (modo por-CNPJ)
  vendedores: string[];
  segmento: string | null;
  pedidos: number;
  totalBRL: number;
  primeira: string | null;
  ultima: string | null;
  orders: ComercialOrderRow[];
  subCnpjs: ClienteAgg[];       // no modo agrupado, os CNPJs dentro do grupo
}
type SortCol = "cnpj" | "nome" | "canal" | "vendedor" | "pedidos" | "total" | "primeira" | "ultima";

const CANAL_LABEL: Record<string, string> = { consumo: "Consumo (B2B)", revenda: "Revenda (PDV)", online: "On-line" };
const canalBadge = (s: string | null) =>
  s === "consumo" ? <CarboBadge variant="default">Consumo</CarboBadge>
  : s === "revenda" ? <CarboBadge variant="warning">Revenda</CarboBadge>
  : s === "online" ? <CarboBadge variant="success">On-line</CarboBadge>
  : <CarboBadge variant="secondary">Não classif.</CarboBadge>;

function RestrictedNotice() {
  return (
    <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-6 flex flex-col items-center gap-2 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-500/70" />
      <p className="text-sm font-medium">Área restrita a gestores.</p>
    </div>
  );
}

function Tile({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: string; tone: string }) {
  return (
    <CarboCard>
      <CarboCardContent className="p-3">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-0.5"><Icon className={`h-3.5 w-3.5 ${tone}`} /> {label}</div>
        <p className="text-lg font-bold tabular-nums">{value}</p>
      </CarboCardContent>
    </CarboCard>
  );
}

function SortTh({ col, label, sort, onSort, align = "left" }: {
  col: SortCol; label: string; sort: { col: SortCol; dir: "asc" | "desc" }; onSort: (c: SortCol) => void; align?: "left" | "center" | "right";
}) {
  const active = sort.col === col;
  const justify = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  return (
    <th className="px-3 py-2 font-medium">
      <button onClick={() => onSort(col)} className={`flex items-center gap-1 w-full ${justify} hover:text-foreground transition-colors ${active ? "text-foreground" : ""}`}>
        {label}
        {active ? (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  );
}

// Último pedido (mais recente) do cliente — fonte de CNPJ/nome/vendedor do card.
const ultimoPedido = (r: RowVM): ComercialOrderRow | undefined =>
  [...r.orders].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0];
const cnpjDoRow = (r: RowVM): string | null =>
  (ultimoPedido(r)?.cnpj ?? "").replace(/\D/g, "") || r.cnpjs[0] || null;

// Célula "Ação" — 1 status query por cliente (funil f10 + CNPJ).
function FollowupCell({ row, pending, onCreate }: {
  row: RowVM; pending: boolean; onCreate: (r: RowVM) => void;
}) {
  const cnpjDigits = cnpjDoRow(row);
  const { data: status } = useFollowupLeadStatus(cnpjDigits);

  if (!cnpjDigits)
    return <Button size="sm" variant="outline" className="h-7 text-xs" disabled title="sem CNPJ">Criar follow-up</Button>;
  if (status?.exists)
    return (
      <Button size="sm" variant="outline" className="h-7 text-xs text-carbo-green border-carbo-green/40" disabled>
        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> No follow-up
      </Button>
    );
  return (
    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={pending} onClick={() => onCreate(row)}>
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><UserPlus className="h-3.5 w-3.5 mr-1" /> Criar follow-up</>}
    </Button>
  );
}

export default function ComercialDados() {
  const { canAdmin } = useAuth();
  const [filters, setFilters] = useState<DashFilters>(EMPTY_FILTERS);
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("all");
  const [soMetricas, setSoMetricas] = useState(false);
  const [view, setView] = useState<"pedidos" | "clientes">("pedidos");
  const [agrupado, setAgrupado] = useState(false);
  const [detail, setDetail] = useState<RowVM | null>(null);
  const [sort, setSort] = useState<{ col: SortCol; dir: "asc" | "desc" }>({ col: "ultima", dir: "desc" });

  // Follow-up (funil f10) — criação a partir da linha de cliente.
  const createFollowup = useCreateFollowupLead();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [vendDialog, setVendDialog] = useState<RowVM | null>(null);
  const [vendSel, setVendSel] = useState("");
  const { data: vendedores } = useVendedoresDir();

  const qc = useQueryClient();

  // Edição de linha (Canal + Origem) — gestor. Grava direto em carboze_orders (RLS de gestor).
  const [editRow, setEditRow] = useState<ComercialOrderRow | null>(null);
  const [editSeg, setEditSeg] = useState<string>("none");
  const [editOri, setEditOri] = useState<string>("auto");
  const [savingEdit, setSavingEdit] = useState(false);

  const origemLabel = (o: ComercialOrderRow): "Bling" | "Manual" => {
    if (o.origem_override === "bling") return "Bling";
    if (o.origem_override === "manual") return "Manual";
    return o.external_ref?.startsWith("bling-") ? "Bling" : "Manual";
  };

  const openEdit = (o: ComercialOrderRow) => {
    setEditRow(o);
    setEditSeg(o.segmento ?? "none");
    setEditOri(o.origem_override ?? "auto");
  };

  const saveEdit = async () => {
    if (!editRow) return;
    setSavingEdit(true);
    try {
      const { error } = await (supabase as any)
        .from("carboze_orders")
        .update({
          segmento: editSeg === "none" ? null : editSeg,
          origem_override: editOri === "auto" ? null : editOri,
        })
        .eq("id", editRow.id);
      if (error) throw error;
      toast.success("Pedido atualizado");
      qc.invalidateQueries({ queryKey: ["comercial-fonte"] });
      setEditRow(null);
    } catch (e) {
      toast.error("Erro ao salvar: " + (e instanceof Error ? e.message : "tente de novo"));
    } finally {
      setSavingEdit(false);
    }
  };

  const runCreate = (r: RowVM, override?: string) => {
    setPendingKey(r.key);
    createFollowup.mutate(
      { row: r, assignedToOverride: override },
      { onSettled: () => setPendingKey(null), onSuccess: () => setVendDialog(null) },
    );
  };
  const onCreateFollowup = (r: RowVM) => {
    if (r.cnpjs.length > 1) toast.info(`Cliente com ${r.cnpjs.length} CNPJs; usando o do último pedido.`);
    if (ultimoPedido(r)?.vendedor_id) runCreate(r);
    else { setVendSel(""); setVendDialog(r); }
  };

  const vendedorId = filters.vendedor === "all" ? null : filters.vendedor;
  const { data, isLoading } = useComercialOrders({ vendedorId, from: filters.from, to: filters.to, segmento: filters.segmento });

  const rows = useMemo(() => {
    let r = data?.rows ?? [];
    const t = busca.trim().toLowerCase();
    if (t) r = r.filter((o) => (o.customer_name ?? "").toLowerCase().includes(t) || (o.order_number ?? "").toLowerCase().includes(t));
    if (statusFiltro !== "all") r = r.filter((o) => (o.status ?? "") === statusFiltro);
    if (soMetricas) r = r.filter((o) => o.contaMetrica);
    return r;
  }, [data, busca, statusFiltro, soMetricas]);

  const statuses = useMemo(() => Array.from(new Set((data?.rows ?? []).map((o) => o.status).filter(Boolean))) as string[], [data]);

  // Nível base: agrega por CNPJ (fallback nome).
  const clientes = useMemo(() => {
    const map = new Map<string, ClienteAgg>();
    for (const o of rows) {
      if (!o.contaPedido) continue;
      const digits = (o.cnpj ?? "").replace(/\D/g, "");
      const nomeKey = (o.customer_name ?? "").trim().toLowerCase();
      const key = digits || (nomeKey ? `nome:${nomeKey}` : "");
      if (!key) continue;
      let g = map.get(key);
      if (!g) { g = { key, cnpj: digits || null, nome: o.customer_name ?? "—", nomes: new Set(), vendedores: new Set(), segmento: o.segmento, pedidos: 0, totalBRL: 0, primeira: null, ultima: null, orders: [] }; map.set(key, g); }
      if (o.customer_name?.trim()) g.nomes.add(o.customer_name.trim());
      if (o.vendedor_name?.trim()) g.vendedores.add(o.vendedor_name.trim());
      g.orders.push(o); g.pedidos++; g.totalBRL += o.total ?? 0;
      const d = o.created_at;
      if (d) {
        if (!g.primeira || d < g.primeira) g.primeira = d;
        if (!g.ultima || d > g.ultima) { g.ultima = d; g.nome = o.customer_name ?? g.nome; g.segmento = o.segmento ?? g.segmento; }
      }
    }
    return Array.from(map.values());
  }, [rows]);

  // Linhas exibidas: por CNPJ (default) ou agrupadas por nome (junta CNPJs iguais de nome).
  const rowsVM = useMemo<RowVM[]>(() => {
    if (!agrupado) {
      return clientes.map((c) => ({
        key: c.key, nome: c.nome, cnpjs: c.cnpj ? [c.cnpj] : [], multiNome: c.nomes.size,
        vendedores: Array.from(c.vendedores), segmento: c.segmento, pedidos: c.pedidos, totalBRL: c.totalBRL,
        primeira: c.primeira, ultima: c.ultima, orders: c.orders, subCnpjs: [c],
      }));
    }
    const map = new Map<string, RowVM>();
    for (const c of clientes) {
      const nkey = (c.nome ?? "").trim().toLowerCase() || c.key;
      let g = map.get(nkey);
      if (!g) { g = { key: `g:${nkey}`, nome: c.nome, cnpjs: [], multiNome: 0, vendedores: [], segmento: c.segmento, pedidos: 0, totalBRL: 0, primeira: null, ultima: null, orders: [], subCnpjs: [] }; map.set(nkey, g); }
      g.subCnpjs.push(c);
      if (c.cnpj && !g.cnpjs.includes(c.cnpj)) g.cnpjs.push(c.cnpj);
      for (const v of c.vendedores) if (!g.vendedores.includes(v)) g.vendedores.push(v);
      g.pedidos += c.pedidos; g.totalBRL += c.totalBRL; g.orders.push(...c.orders);
      if (c.primeira && (!g.primeira || c.primeira < g.primeira)) g.primeira = c.primeira;
      if (c.ultima && (!g.ultima || c.ultima > g.ultima)) { g.ultima = c.ultima; g.nome = c.nome; g.segmento = c.segmento; }
    }
    return Array.from(map.values());
  }, [clientes, agrupado]);

  const toggleSort = (col: SortCol) =>
    setSort((s) => (s.col === col ? { col, dir: s.dir === "asc" ? "desc" : "asc" } : { col, dir: (col === "nome" || col === "cnpj" || col === "canal" || col === "vendedor") ? "asc" : "desc" }));

  const rowsSorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    const val = (r: RowVM): string | number => {
      switch (sort.col) {
        case "cnpj": return r.cnpjs.length > 1 ? `~${String(r.cnpjs.length).padStart(4, "0")}` : (r.cnpjs[0] ?? "zzzz");
        case "nome": return (r.nome ?? "").toLowerCase();
        case "canal": return r.segmento ?? "zzz";
        case "vendedor": return (r.vendedores[0] ?? "zzz").toLowerCase();
        case "pedidos": return r.pedidos;
        case "total": return r.totalBRL;
        case "primeira": return r.primeira ?? "";
        case "ultima": return r.ultima ?? "";
      }
    };
    return [...rowsVM].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [rowsVM, sort]);

  const nomesDistintos = useMemo(
    () => new Set(rows.filter((r) => r.contaPedido).map((r) => (r.customer_name ?? "").trim().toLowerCase()).filter(Boolean)).size,
    [rows],
  );
  const cnpjsDistintos = useMemo(() => new Set(clientes.map((c) => c.cnpj).filter(Boolean)).size, [clientes]);

  const download = (name: string, head: string[], lines: string[]) => {
    const csv = [head.join(","), ...lines].join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  };
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const exportCsv = () => {
    if (view === "clientes") {
      const head = ["cnpjs", "cliente", "vendedor(es)", "canal", "pedidos", "total", "primeira_compra", "ultima_compra"];
      const lines = rowsSorted.map((r) => [
        r.cnpjs.map(fmtDoc).join(" | ") || "(sem doc)", r.nome, r.vendedores.join(" | ") || "—",
        r.segmento ? (CANAL_LABEL[r.segmento] ?? r.segmento) : "", r.pedidos, r.totalBRL, r.primeira, r.ultima,
      ].map(esc).join(","));
      download("comercial-clientes.csv", head, lines);
      return;
    }
    const head = ["pedido", "data", "cliente", "cnpj_cpf", "vendedor", "canal", "status", "total", "conta_pedido", "conta_metrica", "origem"];
    const lines = rows.map((o: ComercialOrderRow) => [
      o.order_number, o.created_at, o.customer_name, o.cnpj ? fmtDoc(o.cnpj) : "", o.vendedor_name,
      o.segmento ? (CANAL_LABEL[o.segmento] ?? o.segmento) : "", o.status, o.total,
      o.contaPedido ? "sim" : "não", o.contaMetrica ? "sim" : "não",
      origemLabel(o).toLowerCase(),
    ].map(esc).join(","));
    download("comercial-fonte.csv", head, lines);
  };

  if (!canAdmin) return <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8"><RestrictedNotice /></main>;

  const cnpjCell = (r: RowVM) => {
    if (r.cnpjs.length === 0) return <span className="text-muted-foreground">— (sem doc)</span>;
    if (r.cnpjs.length === 1) return <span className="font-mono text-xs">{fmtDoc(r.cnpjs[0])}</span>;
    return <CarboBadge variant="warning">{r.cnpjs.length} CNPJs</CarboBadge>;
  };

  return (
    <main className="p-4 lg:p-6 board-fade-in">
      <div className="space-y-4 max-w-[1600px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <CarboPageHeader icon={Database} title="Dados Comerciais — Fonte" description="As linhas cruas de carboze_orders que alimentam os gráficos. Mesma base, mesmos filtros." />
          <div className="flex flex-col items-end gap-2">
            <ComercialTabs />
            <ComercialFilterBar filters={filters} onChange={setFilters} />
          </div>
        </div>

        {/* Resumo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Tile icon={ShoppingCart} label="Pedidos (contam)" value={String(data?.totalPedidos ?? 0)} tone="text-blue-500" />
          <Tile icon={DollarSign} label="R$ Total (pedidos)" value={brl(data?.totalBRL ?? 0)} tone="text-carbo-green" />
          <Tile icon={Target} label="Ticket médio" value={brl(data?.ticketMedio ?? 0)} tone="text-violet-500" />
          <Tile icon={EyeOff} label="Excluídos das métricas" value={String(data?.excluidos ?? 0)} tone="text-amber-500" />
        </div>

        {/* Modo de visão */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex gap-1 rounded-lg border p-1">
            {([["pedidos", "Pedidos", ListOrdered], ["clientes", "Clientes", Users]] as const).map(([k, l, Ico]) => (
              <button key={k} onClick={() => setView(k)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${view === k ? "bg-carbo-green/10 text-carbo-green" : "text-muted-foreground hover:bg-muted"}`}>
                <Ico className="h-3.5 w-3.5" /> {l}
              </button>
            ))}
          </div>
          {view === "clientes" && (
            <>
              <Button variant={agrupado ? "default" : "outline"} size="sm" className="h-8" onClick={() => setAgrupado((v) => !v)}>
                <Layers className="h-3.5 w-3.5 mr-1" /> {agrupado ? "Agrupado por nome" : "Agrupar nomes iguais"}
              </Button>
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <Building2 className="h-3.5 w-3.5 text-carbo-green" />
                {agrupado
                  ? <><b className="text-foreground">{rowsVM.length}</b> grupos (por nome) · {cnpjsDistintos} CNPJs · {nomesDistintos} nomes</>
                  : <><b className="text-foreground">{cnpjsDistintos}</b> CNPJs · <b className="text-foreground">{nomesDistintos}</b> nomes distintos · {data?.totalPedidos ?? 0} pedidos</>}
              </p>
            </>
          )}
        </div>

        {/* Controles da tabela */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente ou nº do pedido…" className="pl-9 h-9" />
          </div>
          <Select value={statusFiltro} onValueChange={setStatusFiltro}>
            <SelectTrigger className="h-9 w-44 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {statuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant={soMetricas ? "default" : "outline"} size="sm" className="h-9" onClick={() => setSoMetricas((v) => !v)}>
            <EyeOff className="h-3.5 w-3.5 mr-1" /> Só os que contam métrica
          </Button>
          <Button variant="outline" size="sm" className="h-9" onClick={exportCsv} disabled={view === "pedidos" ? !rows.length : !rowsSorted.length}>
            <Download className="h-3.5 w-3.5 mr-1" /> Exportar CSV
          </Button>
          <p className="text-xs text-muted-foreground ml-auto">{view === "pedidos" ? `${rows.length} de ${data?.totalRows ?? 0} linhas` : `${rowsSorted.length} ${agrupado ? "grupos" : "clientes"}`}</p>
        </div>

        {/* Tabela */}
        <CarboCard>
          <CarboCardContent className="p-0 overflow-x-auto">
            {isLoading ? (
              <p className="text-sm text-muted-foreground py-10 text-center">Carregando…</p>
            ) : view === "pedidos" ? (
              rows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-10 text-center">Nenhuma linha para os filtros atuais.</p>
              ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-board-surface">
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Pedido</th>
                    <th className="px-3 py-2 font-medium">Data</th>
                    <th className="px-3 py-2 font-medium">Cliente</th>
                    <th className="px-3 py-2 font-medium">Vendedor</th>
                    <th className="px-3 py-2 font-medium">Canal</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium text-right">Total</th>
                    <th className="px-3 py-2 font-medium text-center">Conta?</th>
                    <th className="px-3 py-2 font-medium">Origem</th>
                    <th className="px-3 py-2 font-medium text-center">Editar</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 500).map((o) => (
                    <tr key={o.id} className={`border-b last:border-0 hover:bg-accent/40 ${!o.contaPedido ? "opacity-50" : ""}`}>
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{o.order_number || "—"}</td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">{fmtDateTime(o.created_at)}</td>
                      <td className="px-3 py-2 max-w-[200px] truncate">{o.customer_name || "—"}</td>
                      <td className="px-3 py-2 max-w-[140px] truncate text-muted-foreground">{o.vendedor_name || "—"}</td>
                      <td className="px-3 py-2">{canalBadge(o.segmento)}</td>
                      <td className="px-3 py-2 text-xs">{o.status || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{brl(o.total || 0)}</td>
                      <td className="px-3 py-2 text-center">
                        {o.contaPedido ? (o.contaMetrica ? <CarboBadge variant="success">Métrica</CarboBadge> : <CarboBadge variant="warning">Excl.</CarboBadge>) : <CarboBadge variant="secondary">Fora</CarboBadge>}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{origemLabel(o)}</td>
                      <td className="px-3 py-2 text-center">
                        <button onClick={() => openEdit(o)} title="Editar canal e origem"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              )
            ) : (
              rowsSorted.length === 0 ? (
                <p className="text-sm text-muted-foreground py-10 text-center">Nenhum cliente para os filtros atuais.</p>
              ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-board-surface">
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <SortTh col="cnpj" label={agrupado ? "CNPJ(s)" : "CNPJ / CPF"} sort={sort} onSort={toggleSort} />
                    <SortTh col="nome" label="Cliente" sort={sort} onSort={toggleSort} />
                    <SortTh col="vendedor" label="Vendedor dono" sort={sort} onSort={toggleSort} />
                    <SortTh col="canal" label="Canal" sort={sort} onSort={toggleSort} />
                    <SortTh col="pedidos" label="Pedidos" sort={sort} onSort={toggleSort} align="center" />
                    <SortTh col="total" label="Total" sort={sort} onSort={toggleSort} align="right" />
                    <SortTh col="primeira" label="1ª compra" sort={sort} onSort={toggleSort} />
                    <SortTh col="ultima" label="Última compra" sort={sort} onSort={toggleSort} />
                    <th className="px-3 py-2 font-medium text-right">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsSorted.slice(0, 500).map((r) => {
                    const dias = diasDesde(r.ultima);
                    return (
                      <tr key={r.key} className="border-b last:border-0 hover:bg-accent/40 cursor-pointer" onClick={() => setDetail(r)}>
                        <td className="px-3 py-2 whitespace-nowrap">{cnpjCell(r)}</td>
                        <td className="px-3 py-2 max-w-[220px]">
                          <span className="truncate block">{r.nome || "—"}</span>
                          {!agrupado && r.multiNome > 1 && <span className="text-[10px] text-amber-500">{r.multiNome} nomes diferentes no mesmo doc</span>}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {r.vendedores.length === 0 ? <span className="text-muted-foreground">—</span> : r.vendedores.map((v) => <div key={v} className="whitespace-nowrap">{v}</div>)}
                        </td>
                        <td className="px-3 py-2">{canalBadge(r.segmento)}</td>
                        <td className="px-3 py-2 text-center tabular-nums font-medium">{r.pedidos}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{brl(r.totalBRL)}</td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">{fmtDay(r.primeira)}</td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtDay(r.ultima)}{dias != null && <span className="text-[10px] text-muted-foreground ml-1">({dias === 0 ? "hoje" : `há ${dias}d`})</span>}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <FollowupCell row={r} pending={pendingKey === r.key} onCreate={onCreateFollowup} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              )
            )}
          </CarboCardContent>
        </CarboCard>
        {view === "pedidos" && rows.length > 500 && <p className="text-xs text-muted-foreground text-center">Mostrando as 500 primeiras · use os filtros ou o CSV para o resto ({rows.length} no total).</p>}
        {view === "clientes" && rowsSorted.length > 500 && <p className="text-xs text-muted-foreground text-center">Mostrando os 500 primeiros · use o CSV para o resto ({rowsSorted.length} no total).</p>}
      </div>

      {/* Detalhe — pedidos, CNPJs do grupo, datas (para follow-up). */}
      {/* Editar Canal + Origem do pedido (gestor) */}
      <Dialog open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar pedido {editRow?.order_number || ""}</DialogTitle>
          </DialogHeader>
          {editRow && (
            <div className="space-y-4 pt-1">
              <p className="text-xs text-muted-foreground truncate">{editRow.customer_name || "—"}</p>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Canal</label>
                <Select value={editSeg} onValueChange={setEditSeg}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não classificado</SelectItem>
                    <SelectItem value="consumo">Consumo (B2B)</SelectItem>
                    <SelectItem value="revenda">Revenda (PDV)</SelectItem>
                    <SelectItem value="online">On-line</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Origem</label>
                <Select value={editOri} onValueChange={setEditOri}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Automática ({editRow.external_ref?.startsWith("bling-") ? "Bling" : "Manual"})</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="bling">Bling</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">"Automática" deriva de onde o pedido entrou. Manual/Bling força o rótulo sem alterar o vínculo do Bling.</p>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" onClick={() => setEditRow(null)} disabled={savingEdit}>Cancelar</Button>
                <Button onClick={saveEdit} disabled={savingEdit}>
                  {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
          {detail && (() => {
            const r = detail;
            const ordersSorted = [...r.orders].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
            const dias = diasDesde(r.ultima);
            const multiCnpj = r.cnpjs.length > 1;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 flex-wrap"><span>{r.nome || "—"}</span>{canalBadge(r.segmento)}</DialogTitle>
                  <p className="text-xs text-muted-foreground font-mono">
                    {r.cnpjs.length === 0 ? "— (sem documento)" : r.cnpjs.length === 1 ? fmtDoc(r.cnpjs[0]) : `${r.cnpjs.length} CNPJs agrupados por nome`}
                  </p>
                </DialogHeader>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div className="rounded-lg border p-2"><p className="text-[11px] text-muted-foreground">Pedidos</p><p className="text-lg font-bold tabular-nums">{r.pedidos}</p></div>
                  <div className="rounded-lg border p-2"><p className="text-[11px] text-muted-foreground">Total</p><p className="text-lg font-bold tabular-nums">{brl(r.totalBRL)}</p></div>
                  <div className="rounded-lg border p-2"><p className="text-[11px] text-muted-foreground">Ticket médio</p><p className="text-lg font-bold tabular-nums">{brl(r.pedidos ? r.totalBRL / r.pedidos : 0)}</p></div>
                  <div className="rounded-lg border p-2"><p className="text-[11px] text-muted-foreground">Última compra</p><p className="text-sm font-bold">{fmtDay(r.ultima)}{dias != null && <span className="block text-[10px] font-normal text-muted-foreground">{dias === 0 ? "hoje" : `há ${dias} dias`}</span>}</p></div>
                </div>

                {r.vendedores.length > 0 && (
                  <p className="text-xs text-muted-foreground">Vendedor(es): <b className="text-foreground">{r.vendedores.join(" · ")}</b></p>
                )}

                {/* Quando é grupo de nome com vários CNPJs, mostra o desdobramento. */}
                {multiCnpj && (
                  <div>
                    <p className="text-xs font-semibold mb-1">CNPJs neste grupo ({r.cnpjs.length})</p>
                    <div className="rounded-lg border divide-y">
                      {r.subCnpjs.slice().sort((a, b) => b.totalBRL - a.totalBRL).map((c) => (
                        <div key={c.key} className="flex items-center justify-between px-3 py-1.5 text-xs">
                          <span className="font-mono">{c.cnpj ? fmtDoc(c.cnpj) : "— (sem doc)"}</span>
                          <span className="text-muted-foreground">{c.pedidos} ped. · {brl(c.totalBRL)} · última {fmtDay(c.ultima)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pedidos (com CNPJ por linha — dá pra ver os documentos diferentes). */}
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground bg-muted/30">
                        <th className="px-3 py-2 font-medium">Pedido</th>
                        <th className="px-3 py-2 font-medium">Data</th>
                        {multiCnpj && <th className="px-3 py-2 font-medium">CNPJ</th>}
                        <th className="px-3 py-2 font-medium text-right">Total</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordersSorted.map((o, i) => (
                        <tr key={o.id} className="border-b last:border-0">
                          <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{o.order_number || "—"}{i === 0 && <span className="ml-1 text-[9px] font-semibold text-carbo-green">último</span>}</td>
                          <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">{fmtDateTime(o.created_at)}</td>
                          {multiCnpj && <td className="px-3 py-2 font-mono text-[11px] whitespace-nowrap">{o.cnpj ? fmtDoc(o.cnpj) : "—"}</td>}
                          <td className="px-3 py-2 text-right tabular-nums font-medium">{brl(o.total || 0)}</td>
                          <td className="px-3 py-2 text-xs">{o.status || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Escolher vendedor — só quando o último pedido não tem vendedor. */}
      <Dialog open={!!vendDialog} onOpenChange={(o) => !o && setVendDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Escolher vendedor do follow-up</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            O último pedido de <b className="text-foreground">{vendDialog?.nome || "—"}</b> não tem vendedor. Escolha o dono do card.
          </p>
          <Select value={vendSel} onValueChange={setVendSel}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Selecione o vendedor…" /></SelectTrigger>
            <SelectContent>
              {(vendedores ?? []).filter((v) => v.is_vendedor).map((v) => (
                <SelectItem key={v.id} value={v.id}>{v.full_name || v.id}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setVendDialog(null)}>Cancelar</Button>
            <Button
              size="sm"
              disabled={!vendSel || (!!pendingKey && pendingKey === vendDialog?.key)}
              onClick={() => vendDialog && runCreate(vendDialog, vendSel)}
            >
              {pendingKey && pendingKey === vendDialog?.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Criar follow-up"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
