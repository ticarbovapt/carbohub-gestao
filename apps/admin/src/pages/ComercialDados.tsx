import { useMemo, useState } from "react";
import { Database, AlertTriangle, Search, Download, ShoppingCart, DollarSign, Target, EyeOff, Users, Building2, ListOrdered, ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
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

interface ClienteAgg {
  key: string; cnpj: string | null; nome: string; nomes: Set<string>; vendedores: Set<string>;
  segmento: string | null; pedidos: number; totalBRL: number; primeira: string | null; ultima: string | null;
  orders: ComercialOrderRow[];
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

export default function ComercialDados() {
  const { canAdmin } = useAuth();
  const [filters, setFilters] = useState<DashFilters>(EMPTY_FILTERS);
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("all");
  const [soMetricas, setSoMetricas] = useState(false);
  const [view, setView] = useState<"pedidos" | "clientes">("pedidos");
  const [clienteDetail, setClienteDetail] = useState<ClienteAgg | null>(null);

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

  // Agrupa por CNPJ (fallback: nome) — só pedidos que contam. Revela compradores
  // repetidos que o gráfico conta como PDVs diferentes.
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
      g.orders.push(o);
      g.pedidos++; g.totalBRL += o.total ?? 0;
      const d = o.created_at;
      if (d) {
        if (!g.primeira || d < g.primeira) g.primeira = d;
        if (!g.ultima || d > g.ultima) { g.ultima = d; g.nome = o.customer_name ?? g.nome; g.segmento = o.segmento ?? g.segmento; }
      }
    }
    return Array.from(map.values());
  }, [rows]);

  const [sort, setSort] = useState<{ col: SortCol; dir: "asc" | "desc" }>({ col: "ultima", dir: "desc" });
  const toggleSort = (col: SortCol) =>
    setSort((s) => (s.col === col ? { col, dir: s.dir === "asc" ? "desc" : "asc" } : { col, dir: col === "nome" || col === "cnpj" || col === "canal" || col === "vendedor" ? "asc" : "desc" }));
  const clientesSorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    const val = (c: ClienteAgg): string | number => {
      switch (sort.col) {
        case "cnpj": return c.cnpj ?? "zzz"; // sem doc por último
        case "nome": return (c.nome ?? "").toLowerCase();
        case "canal": return c.segmento ?? "zzz";
        case "vendedor": return (Array.from(c.vendedores)[0] ?? "zzz").toLowerCase();
        case "pedidos": return c.pedidos;
        case "total": return c.totalBRL;
        case "primeira": return c.primeira ?? "";
        case "ultima": return c.ultima ?? "";
      }
    };
    return [...clientes].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [clientes, sort]);

  const nomesDistintos = useMemo(
    () => new Set(rows.filter((r) => r.contaPedido).map((r) => (r.customer_name ?? "").trim().toLowerCase()).filter(Boolean)).size,
    [rows],
  );

  const download = (name: string, head: string[], lines: string[]) => {
    const csv = [head.join(","), ...lines].join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  };
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const exportCsv = () => {
    if (view === "clientes") {
      const head = ["cnpj_cpf", "cliente", "vendedor(es)", "nomes_distintos", "canal", "pedidos", "total", "primeira_compra", "ultima_compra"];
      const lines = clientesSorted.map((c) => [
        c.cnpj ? fmtDoc(c.cnpj) : "(sem doc)", c.nome, Array.from(c.vendedores).join(" | ") || "—", c.nomes.size,
        c.segmento ? (CANAL_LABEL[c.segmento] ?? c.segmento) : "", c.pedidos, c.totalBRL,
        c.primeira, c.ultima,
      ].map(esc).join(","));
      download("comercial-clientes.csv", head, lines);
      return;
    }
    const head = ["pedido", "data", "cliente", "cnpj_cpf", "vendedor", "canal", "status", "total", "conta_pedido", "conta_metrica", "origem"];
    const lines = rows.map((o: ComercialOrderRow) => [
      o.order_number, o.created_at, o.customer_name, o.cnpj ? fmtDoc(o.cnpj) : "", o.vendedor_name,
      o.segmento ? (CANAL_LABEL[o.segmento] ?? o.segmento) : "", o.status, o.total,
      o.contaPedido ? "sim" : "não", o.contaMetrica ? "sim" : "não",
      o.external_ref?.startsWith("bling-") ? "bling" : "manual",
    ].map(esc).join(","));
    download("comercial-fonte.csv", head, lines);
  };

  if (!canAdmin) return <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8"><RestrictedNotice /></main>;

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
            {([["pedidos", "Pedidos", ListOrdered], ["clientes", "Clientes (por CNPJ)", Users]] as const).map(([k, l, Ico]) => (
              <button key={k} onClick={() => setView(k)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${view === k ? "bg-carbo-green/10 text-carbo-green" : "text-muted-foreground hover:bg-muted"}`}>
                <Ico className="h-3.5 w-3.5" /> {l}
              </button>
            ))}
          </div>
          {view === "clientes" && (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5 text-carbo-green" />
              <b className="text-foreground">{clientes.length}</b> clientes reais (CNPJ) · <b className="text-foreground">{nomesDistintos}</b> nomes distintos · {data?.totalPedidos ?? 0} pedidos
            </p>
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
          <Button variant="outline" size="sm" className="h-9" onClick={exportCsv} disabled={view === "pedidos" ? !rows.length : !clientes.length}>
            <Download className="h-3.5 w-3.5 mr-1" /> Exportar CSV
          </Button>
          <p className="text-xs text-muted-foreground ml-auto">{view === "pedidos" ? `${rows.length} de ${data?.totalRows ?? 0} linhas` : `${clientes.length} clientes`}</p>
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
                        {o.contaPedido
                          ? (o.contaMetrica ? <CarboBadge variant="success">Métrica</CarboBadge> : <CarboBadge variant="warning">Excl.</CarboBadge>)
                          : <CarboBadge variant="secondary">Fora</CarboBadge>}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{o.external_ref?.startsWith("bling-") ? "Bling" : "Manual"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              )
            ) : (
              clientes.length === 0 ? (
                <p className="text-sm text-muted-foreground py-10 text-center">Nenhum cliente para os filtros atuais.</p>
              ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-board-surface">
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <SortTh col="cnpj" label="CNPJ / CPF" sort={sort} onSort={toggleSort} />
                    <SortTh col="nome" label="Cliente" sort={sort} onSort={toggleSort} />
                    <SortTh col="vendedor" label="Vendedor dono" sort={sort} onSort={toggleSort} />
                    <SortTh col="canal" label="Canal" sort={sort} onSort={toggleSort} />
                    <SortTh col="pedidos" label="Pedidos" sort={sort} onSort={toggleSort} align="center" />
                    <SortTh col="total" label="Total" sort={sort} onSort={toggleSort} align="right" />
                    <SortTh col="primeira" label="1ª compra" sort={sort} onSort={toggleSort} />
                    <SortTh col="ultima" label="Última compra" sort={sort} onSort={toggleSort} />
                  </tr>
                </thead>
                <tbody>
                  {clientesSorted.slice(0, 500).map((c) => {
                    const dias = diasDesde(c.ultima);
                    const vend = Array.from(c.vendedores);
                    return (
                      <tr key={c.key} className="border-b last:border-0 hover:bg-accent/40 cursor-pointer" onClick={() => setClienteDetail(c)}>
                        <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{c.cnpj ? fmtDoc(c.cnpj) : <span className="text-muted-foreground">— (sem doc)</span>}</td>
                        <td className="px-3 py-2 max-w-[220px]">
                          <span className="truncate block">{c.nome || "—"}</span>
                          {c.nomes.size > 1 && <span className="text-[10px] text-amber-500">{c.nomes.size} nomes diferentes no mesmo doc</span>}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {vend.length === 0 ? <span className="text-muted-foreground">—</span>
                            : vend.map((v) => <div key={v} className="whitespace-nowrap">{v}</div>)}
                        </td>
                        <td className="px-3 py-2">{canalBadge(c.segmento)}</td>
                        <td className="px-3 py-2 text-center tabular-nums font-medium">{c.pedidos}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{brl(c.totalBRL)}</td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">{fmtDay(c.primeira)}</td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap">
                          {fmtDay(c.ultima)}
                          {dias != null && <span className="text-[10px] text-muted-foreground ml-1">({dias === 0 ? "hoje" : `há ${dias}d`})</span>}
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
        {view === "clientes" && clientes.length > 500 && <p className="text-xs text-muted-foreground text-center">Mostrando os 500 primeiros clientes · use o CSV para o resto ({clientes.length} no total).</p>}
      </div>

      {/* Detalhe do cliente — pedidos, datas, último pedido (para follow-up). */}
      <Dialog open={!!clienteDetail} onOpenChange={(o) => !o && setClienteDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
          {clienteDetail && (() => {
            const c = clienteDetail;
            const ordersSorted = [...c.orders].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
            const dias = diasDesde(c.ultima);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 flex-wrap">
                    <span>{c.nome || "—"}</span>
                    {canalBadge(c.segmento)}
                  </DialogTitle>
                  <p className="text-xs text-muted-foreground font-mono">{c.cnpj ? fmtDoc(c.cnpj) : "— (sem documento)"}</p>
                </DialogHeader>

                {/* Resumo do cliente */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div className="rounded-lg border p-2"><p className="text-[11px] text-muted-foreground">Pedidos</p><p className="text-lg font-bold tabular-nums">{c.pedidos}</p></div>
                  <div className="rounded-lg border p-2"><p className="text-[11px] text-muted-foreground">Total</p><p className="text-lg font-bold tabular-nums">{brl(c.totalBRL)}</p></div>
                  <div className="rounded-lg border p-2"><p className="text-[11px] text-muted-foreground">Ticket médio</p><p className="text-lg font-bold tabular-nums">{brl(c.pedidos ? c.totalBRL / c.pedidos : 0)}</p></div>
                  <div className="rounded-lg border p-2"><p className="text-[11px] text-muted-foreground">Última compra</p><p className="text-sm font-bold">{fmtDay(c.ultima)}{dias != null && <span className="block text-[10px] font-normal text-muted-foreground">{dias === 0 ? "hoje" : `há ${dias} dias`}</span>}</p></div>
                </div>

                {c.nomes.size > 1 && (
                  <p className="text-[11px] text-amber-500">⚠ Este documento aparece com {c.nomes.size} nomes diferentes: {Array.from(c.nomes).join(" · ")}</p>
                )}

                {/* Pedidos do cliente */}
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground bg-muted/30">
                        <th className="px-3 py-2 font-medium">Pedido</th>
                        <th className="px-3 py-2 font-medium">Data</th>
                        <th className="px-3 py-2 font-medium text-right">Total</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium">Origem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordersSorted.map((o, i) => (
                        <tr key={o.id} className="border-b last:border-0">
                          <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{o.order_number || "—"}{i === 0 && <span className="ml-1 text-[9px] font-semibold text-carbo-green">último</span>}</td>
                          <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">{fmtDateTime(o.created_at)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">{brl(o.total || 0)}</td>
                          <td className="px-3 py-2 text-xs">{o.status || "—"}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{o.external_ref?.startsWith("bling-") ? "Bling" : "Manual"}</td>
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
    </main>
  );
}
