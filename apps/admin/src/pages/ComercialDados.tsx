import { useMemo, useState } from "react";
import { Database, AlertTriangle, Search, Download, ShoppingCart, DollarSign, Target, EyeOff } from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useComercialOrders, type ComercialOrderRow } from "@/hooks/useComercialOrders";
import { ComercialFilterBar, EMPTY_FILTERS, type DashFilters } from "@/components/comercial/ComercialFilterBar";
import { ComercialTabs } from "@/components/comercial/ComercialTabs";

const brl = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDateTime = (s: string | null) => (s ? new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
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

export default function ComercialDados() {
  const { canAdmin } = useAuth();
  const [filters, setFilters] = useState<DashFilters>(EMPTY_FILTERS);
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("all");
  const [soMetricas, setSoMetricas] = useState(false);

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

  const exportCsv = () => {
    const head = ["pedido", "data", "cliente", "vendedor", "canal", "status", "total", "conta_pedido", "conta_metrica", "origem"];
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = rows.map((o: ComercialOrderRow) => [
      o.order_number, o.created_at, o.customer_name, o.vendedor_name,
      o.segmento ? (CANAL_LABEL[o.segmento] ?? o.segmento) : "", o.status, o.total,
      o.contaPedido ? "sim" : "não", o.contaMetrica ? "sim" : "não",
      o.external_ref?.startsWith("bling-") ? "bling" : "manual",
    ].map(esc).join(","));
    const csv = [head.join(","), ...lines].join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = "comercial-fonte.csv"; a.click(); URL.revokeObjectURL(url);
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
          <Button variant="outline" size="sm" className="h-9" onClick={exportCsv} disabled={!rows.length}>
            <Download className="h-3.5 w-3.5 mr-1" /> Exportar CSV
          </Button>
          <p className="text-xs text-muted-foreground ml-auto">{rows.length} de {data?.totalRows ?? 0} linhas</p>
        </div>

        {/* Tabela */}
        <CarboCard>
          <CarboCardContent className="p-0 overflow-x-auto">
            {isLoading ? (
              <p className="text-sm text-muted-foreground py-10 text-center">Carregando…</p>
            ) : rows.length === 0 ? (
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
            )}
          </CarboCardContent>
        </CarboCard>
        {rows.length > 500 && <p className="text-xs text-muted-foreground text-center">Mostrando as 500 primeiras · use os filtros ou o CSV para o resto ({rows.length} no total).</p>}
      </div>
    </main>
  );
}
