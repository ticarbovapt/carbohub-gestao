import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Boxes, AlertTriangle, PackageSearch, ShieldAlert, ArrowLeftRight, TrendingUp,
  TrendingDown, Layers, Truck, CheckCircle2, RotateCcw,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, Legend,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from "recharts";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell,
} from "@/components/ui/carbo-table";
import { useAuth } from "@/contexts/AuthContext";
import { fmtBRL, fmtNum } from "@/lib/dash-format";
import { useSuprimentosCockpit } from "@/hooks/useSuprimentosCockpit";

// ─────────────────────────────────────────────────────────────────────────────
// "Suprimentos" — visão ESTRATÉGICA (data-viz/insights), somente leitura.
// Espelha a intenção do /suprimentos do Ops (valor mobilizado, cobertura de
// custo, risco de ruptura, fluxo) sem nada operacional (hub tabs de gestão,
// registrar remessa, confirmar chegada, editar política de estoque — isso
// continua no Ops).
// ─────────────────────────────────────────────────────────────────────────────

function RestrictedNotice() {
  return (
    <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-6 flex flex-col items-center gap-2 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-500/70" />
      <p className="text-sm font-medium">Área restrita a gestores.</p>
    </div>
  );
}

const TOOLTIP_STYLE = { background: "hsl(var(--popover))", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 };
const PIE_COLORS = ["#22c55e", "#3b82f6", "#8b5cf6", "#f59e0b", "#14b8a6", "#ef4444"];
const TRANSFER_COLORS: Record<string, string> = { em_transito: "#3b82f6", entregue: "#22c55e", estornado: "#64748b" };
const TRANSFER_LABEL: Record<string, string> = { em_transito: "Em trânsito", entregue: "Entregue", estornado: "Estornado" };

/** Nota de rodapé compacta — reaparece nas seções de valor mobilizado quando a cobertura de custo está incompleta. */
function DataCoverageNote({ pct }: { pct: number }) {
  if (pct >= 80) return null;
  return (
    <p className="text-[11px] text-muted-foreground mt-2">
      Produtos com custo R$0 são excluídos do valor mobilizado — os números ficam abaixo do real até completar o cadastro no Ops.
    </p>
  );
}

function StatTile({ label, value, sub, accent, icon: Icon }: {
  label: string; value: string; sub?: string; accent: string; icon: React.ElementType;
}) {
  return (
    <div className={`relative overflow-hidden rounded-xl bg-card p-4 border border-border border-l-4 ${accent} transition-all hover:-translate-y-0.5`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
          <p className="mt-1.5 text-xl font-bold text-foreground leading-tight break-words tabular-nums">{value}</p>
          {sub && <p className="mt-1 text-xs text-muted-foreground leading-snug">{sub}</p>}
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-400/10 text-blue-500">
          <Icon className="h-[18px] w-[18px]" />
        </div>
      </div>
    </div>
  );
}

function SectionSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
      <Skeleton className="h-28 rounded-2xl" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Skeleton className="lg:col-span-2 h-80 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
      <Skeleton className="h-72 rounded-2xl" />
      <Skeleton className="h-80 rounded-2xl" />
      <Skeleton className="h-80 rounded-2xl" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Skeleton className="lg:col-span-2 h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    </div>
  );
}

export default function Suprimentos() {
  const { canAdmin } = useAuth();
  const { data, isLoading, error } = useSuprimentosCockpit();
  const [fluxoPeriodo, setFluxoPeriodo] = useState<30 | 90>(30);

  // Agrupamentos client-side do fluxoDiario (hook só entrega linhas cruas) —
  // sempre chamados (regra dos hooks), mesmo com data ainda undefined.
  const fluxoFiltrado = useMemo(() => {
    if (!data) return [];
    const cutoff = new Date(Date.now() - fluxoPeriodo * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return data.fluxoDiario.filter((r) => r.date >= cutoff);
  }, [data, fluxoPeriodo]);

  const fluxoPorDia = useMemo(() => {
    const map = new Map<string, { date: string; entradas: number; saidas: number }>();
    for (const r of fluxoFiltrado) {
      const cur = map.get(r.date) ?? { date: r.date, entradas: 0, saidas: 0 };
      if (r.tipo === "entrada") cur.entradas += r.quantidade; else cur.saidas += r.quantidade;
      map.set(r.date, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [fluxoFiltrado]);

  const fluxoLiquidoPorCategoria = useMemo(() => {
    const map = new Map<string, { entradas: number; saidas: number }>();
    for (const r of fluxoFiltrado) {
      const cur = map.get(r.category) ?? { entradas: 0, saidas: 0 };
      if (r.tipo === "entrada") cur.entradas += r.quantidade; else cur.saidas += r.quantidade;
      map.set(r.category, cur);
    }
    return Array.from(map.entries())
      .map(([category, { entradas, saidas }]) => ({ category, net: entradas - saidas }))
      .sort((a, b) => b.net - a.net);
  }, [fluxoFiltrado]);

  if (!canAdmin) return <main className="p-4 lg:p-6"><RestrictedNotice /></main>;

  if (error) {
    return (
      <div className="p-4 md:p-6">
        <div className="space-y-6 max-w-[1500px] mx-auto">
          <CarboPageHeader icon={Boxes} iconColor="gradient" title="Suprimentos"
            description="Valor mobilizado, cobertura de custo e risco de estoque — visão estratégica, somente leitura" />
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              Não foi possível carregar os dados de suprimentos. Tente novamente mais tarde.
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const d = data;

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-6 max-w-[1500px] mx-auto">
        <CarboPageHeader icon={Boxes} iconColor="gradient" title="Suprimentos"
          description="Valor mobilizado, cobertura de custo e risco de estoque — visão estratégica, somente leitura" />

        {isLoading || !d ? <SectionSkeleton /> : (
          <>
            {/* ── 2. Valor Mobilizado por Hub ─────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {d.valorPorHub.map((h, i) => (
                    <motion.div key={h.hubCode} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                      <StatTile label={h.hubLabel} value={fmtBRL(h.valor)} accent="border-l-blue-400" icon={Boxes} />
                    </motion.div>
                  ))}
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: d.valorPorHub.length * 0.05 }}>
                    <StatTile label="Total" value={fmtBRL(d.valorTotal)} accent="border-l-carbo-green" icon={Layers} />
                  </motion.div>
                </div>
                <DataCoverageNote pct={d.coberturaPct} />
              </div>

              <Card className="rounded-2xl border-0 shadow-sm">
                <CardHeader className="pb-1 pt-5 px-5">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Boxes className="h-4 w-4 text-primary" /> Valor por Hub
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  {d.valorPorHub.length === 0 ? (
                    <p className="px-3 py-16 text-center text-sm text-muted-foreground">Sem dados no período.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie data={d.valorPorHub} dataKey="valor" nameKey="hubLabel" cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2}>
                          {d.valorPorHub.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [fmtBRL(v), "Valor"]} />
                        <Legend formatter={(v) => <span className="text-xs">{v}</span>} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ── 3. Cobertura de Dado ─────────────────────────────────────── */}
            <Card className="rounded-2xl border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="flex flex-col md:flex-row md:items-center gap-6">
                  <div className="shrink-0">
                    <div className="flex items-center gap-2">
                      <p className="text-3xl font-bold tabular-nums text-foreground">{d.coberturaPct.toFixed(0)}%</p>
                      {d.coberturaPct < 80 && <CarboBadge variant="warning">Dado parcial</CarboBadge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">produtos com custo cadastrado</p>
                    <p className="text-xs text-muted-foreground">{fmtNum(d.produtosComCusto)} de {fmtNum(d.totalProdutosAtivos)}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-carbo-green transition-all duration-700" style={{ width: `${Math.min(100, d.coberturaPct)}%` }} />
                    </div>
                    {d.coberturaPct < 80 && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Produtos com custo R$0 são excluídos do valor mobilizado — os números de valor ficam abaixo do real até completar o cadastro no Ops.
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ── 4. Top 10 Produtos + Risco de Ruptura ───────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="lg:col-span-2 rounded-2xl border-0 shadow-sm">
                <CardHeader className="pb-1 pt-5 px-5">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <PackageSearch className="h-4 w-4 text-primary" /> Top 10 Produtos por Valor Mobilizado
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-0 pb-2">
                  {d.topProdutos.length === 0 ? (
                    <p className="py-16 text-center text-sm text-muted-foreground">Sem dados no período.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <CarboTable>
                        <CarboTableHeader>
                          <CarboTableRow>
                            <CarboTableHead className="w-10">#</CarboTableHead>
                            <CarboTableHead>Produto</CarboTableHead>
                            <CarboTableHead className="text-right">Estoque</CarboTableHead>
                            <CarboTableHead className="text-right">Valor</CarboTableHead>
                          </CarboTableRow>
                        </CarboTableHeader>
                        <CarboTableBody>
                          {d.topProdutos.map((p, idx) => (
                            <CarboTableRow key={p.id}>
                              <CarboTableCell className="text-center text-sm text-muted-foreground">
                                {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}º`}
                              </CarboTableCell>
                              <CarboTableCell>
                                <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[10px] font-mono text-muted-foreground">{p.product_code}</span>
                                  <CarboBadge variant="secondary" size="sm">{p.category}</CarboBadge>
                                </div>
                              </CarboTableCell>
                              <CarboTableCell className="text-right tabular-nums text-muted-foreground whitespace-nowrap">
                                {fmtNum(p.qty)} {p.unit}
                              </CarboTableCell>
                              <CarboTableCell className="text-right">
                                <CarboBadge variant="success" className="whitespace-nowrap">{fmtBRL(p.valor)}</CarboBadge>
                              </CarboTableCell>
                            </CarboTableRow>
                          ))}
                        </CarboTableBody>
                      </CarboTable>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className={`rounded-2xl shadow-sm ${
                d.riscoCriticoTotal > 0 ? "border-2 border-destructive/30"
                  : d.riscoTotal > 0 ? "border border-warning/30" : "border-0"
              }`}>
                <CardHeader className="pb-1 pt-5 px-5">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-amber-500" /> Risco de Ruptura
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-5 space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg p-3 bg-amber-500/10 text-center">
                      <p className="text-[10px] text-muted-foreground">Abaixo do mínimo</p>
                      <p className="text-xl font-bold tabular-nums text-amber-500">{fmtNum(d.riscoTotal)}</p>
                    </div>
                    <div className="rounded-lg p-3 bg-red-500/10 text-center">
                      <p className="text-[10px] text-muted-foreground">Zerados</p>
                      <p className="text-xl font-bold tabular-nums text-red-500">{fmtNum(d.riscoCriticoTotal)}</p>
                    </div>
                  </div>
                  {d.riscoPorHub.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-2">Nenhum produto em risco.</p>
                  ) : (
                    <div className="space-y-2">
                      {d.riscoPorHub.map((h) => {
                        const max = Math.max(...d.riscoPorHub.map((x) => x.count), 1);
                        return (
                          <div key={h.hubCode} className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-24 shrink-0 truncate">{h.hubLabel}</span>
                            <div className="flex-1 h-4 bg-muted rounded-md overflow-hidden">
                              <div className="h-full rounded-md bg-amber-500 transition-all duration-700" style={{ width: `${(h.count / max) * 100}%` }} />
                            </div>
                            <span className="text-xs font-semibold tabular-nums w-6 text-right">{h.count}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ── 5. Valor Mobilizado por Categoria ────────────────────────── */}
            <Card className="rounded-2xl border-0 shadow-sm">
              <CardHeader className="pb-1 pt-5 px-5">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" /> Valor Mobilizado por Categoria
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                {d.valorPorCategoria.length === 0 ? (
                  <p className="px-3 py-16 text-center text-sm text-muted-foreground">Sem dados no período.</p>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={Math.max(220, d.valorPorCategoria.length * 44)}>
                      <BarChart data={d.valorPorCategoria} layout="vertical" margin={{ top: 8, right: 40, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false}
                          tickFormatter={(x: number) => (x >= 1000 ? `${Math.round(x / 1000)}k` : String(x))} />
                        <YAxis type="category" dataKey="category" width={110} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [fmtBRL(v), "Valor"]} />
                        <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
                          {d.valorPorCategoria.map((_, i) => (
                            <Cell key={i} fill="#22c55e" fillOpacity={1 - i * 0.08} />
                          ))}
                          <LabelList dataKey="valor" position="right" formatter={(v: number) => fmtBRL(v)} style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="px-3"><DataCoverageNote pct={d.coberturaPct} /></div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* ── 6. Fluxo Entradas vs Saídas ──────────────────────────────── */}
            <Card className="rounded-2xl border-0 shadow-sm">
              <CardHeader className="pb-1 pt-5 px-5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <ArrowLeftRight className="h-4 w-4 text-primary" /> Fluxo Entradas vs Saídas
                  </CardTitle>
                  <div className="flex gap-1 bg-muted/40 rounded-lg p-1">
                    {([30, 90] as const).map((p) => (
                      <button key={p} onClick={() => setFluxoPeriodo(p)}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${fluxoPeriodo === p ? "bg-carbo-green text-white" : "text-muted-foreground hover:text-foreground"}`}>
                        {p}d
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                {fluxoPorDia.length === 0 ? (
                  <p className="px-3 py-16 text-center text-sm text-muted-foreground">Sem dados no período.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={fluxoPorDia} margin={{ top: 8, right: 12, left: -6, bottom: 0 }}>
                      <defs>
                        <linearGradient id="fluxoEntradas" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22c55e" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="fluxoSaidas" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false}
                        tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE}
                        formatter={(v: number, n: string) => [fmtNum(v), n === "entradas" ? "Entradas" : "Saídas"]} />
                      <Area type="monotone" dataKey="entradas" stroke="#22c55e" strokeWidth={2} fill="url(#fluxoEntradas)" />
                      <Area type="monotone" dataKey="saidas" stroke="#3b82f6" strokeWidth={2} fill="url(#fluxoSaidas)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* ── 7. Fluxo Líquido por Categoria ───────────────────────────── */}
            <Card className="rounded-2xl border-0 shadow-sm">
              <CardHeader className="pb-1 pt-5 px-5">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  {fluxoLiquidoPorCategoria.some((c) => c.net < 0)
                    ? <TrendingDown className="h-4 w-4 text-primary" />
                    : <TrendingUp className="h-4 w-4 text-primary" />} Fluxo Líquido por Categoria ({fluxoPeriodo}d)
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                {fluxoLiquidoPorCategoria.length === 0 ? (
                  <p className="px-3 py-16 text-center text-sm text-muted-foreground">Sem dados no período.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(220, fluxoLiquidoPorCategoria.length * 44)}>
                    <BarChart data={fluxoLiquidoPorCategoria} layout="vertical" margin={{ top: 8, right: 40, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="category" width={110} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [fmtNum(v), "Fluxo líquido"]} />
                      <Bar dataKey="net" radius={[0, 4, 4, 0]}>
                        {fluxoLiquidoPorCategoria.map((c, i) => <Cell key={i} fill={c.net >= 0 ? "#22c55e" : "#ef4444"} />)}
                        <LabelList dataKey="net" position="right" formatter={(v: number) => fmtNum(v)} style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* ── 8. Transferências Entre Hubs ─────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
                {d.transferencias.map((t, i) => {
                  const conf = t.status === "em_transito"
                    ? { accent: "border-l-blue-400", icon: Truck, badge: "info" as const }
                    : t.status === "entregue"
                    ? { accent: "border-l-green-500", icon: CheckCircle2, badge: "success" as const }
                    : { accent: "border-l-slate-400", icon: RotateCcw, badge: "secondary" as const };
                  return (
                    <motion.div key={t.status} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                      <StatTile label={TRANSFER_LABEL[t.status]} value={fmtNum(t.count)} accent={conf.accent} icon={conf.icon} />
                    </motion.div>
                  );
                })}
              </div>

              <Card className="rounded-2xl border-0 shadow-sm">
                <CardHeader className="pb-1 pt-5 px-5">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <ArrowLeftRight className="h-4 w-4 text-primary" /> Transferências
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  {d.transferencias.every((t) => t.count === 0) ? (
                    <p className="px-3 py-16 text-center text-sm text-muted-foreground">Sem dados no período.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={d.transferencias} dataKey="count" nameKey="status" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2}>
                          {d.transferencias.map((t) => <Cell key={t.status} fill={TRANSFER_COLORS[t.status]} />)}
                        </Pie>
                        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, n: string) => [fmtNum(v), TRANSFER_LABEL[n] ?? n]} />
                        <Legend formatter={(v) => <span className="text-xs">{TRANSFER_LABEL[v] ?? v}</span>} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
