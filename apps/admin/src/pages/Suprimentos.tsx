import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Boxes, AlertTriangle, PackageSearch, ShieldAlert, ArrowLeftRight, TrendingUp,
  TrendingDown, Layers, Truck, FlaskConical, Gauge, Snowflake, Coins,
  Factory, Store, ArrowRight, Repeat2, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, Cell,
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
// "Suprimentos" — visão ESTRATÉGICA para o CEO (somente leitura). Responde, de
// cima p/ baixo: (1) o estoque está saudável hoje? — faixa executiva com capital,
// giro/dias de cobertura, capital congelado, risco em R$ e cobertura de custo;
// (2) está no hub certo? — estado da rede (Natal produz → SP vende) + "a
// remanejar"; (3) onde agir — risco nomeado em R$, parados, excesso; (4) custo
// de fabricação por ficha técnica. Nada operacional (registrar remessa, editar
// política) — isso continua no Ops.
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
const fmtPct = (v: number) => `${v >= 0 ? "" : ""}${v.toFixed(0)}%`;

// Chip de tendência vs base histórica. `higherIsBetter` decide a cor
// (ex.: risco subindo = ruim/vermelho; cobertura subindo = bom/verde).
// `neutral` = só direção, sem juízo de valor (ex.: capital em estoque).
function TrendChip({ value, unit, higherIsBetter, neutral, baseDate }: {
  value: number | null; unit: "pct" | "pp"; higherIsBetter?: boolean; neutral?: boolean; baseDate: string;
}) {
  if (value === null || !Number.isFinite(value)) return null;
  const rounded = unit === "pct" ? value : value; // pp já em pontos
  if (Math.abs(rounded) < (unit === "pp" ? 0.5 : 1)) {
    return <span className="mt-1 inline-block text-[10px] text-muted-foreground" title={`desde ${baseDate}`}>estável</span>;
  }
  const up = rounded > 0;
  const good = neutral ? null : (up === !!higherIsBetter);
  const color = neutral ? "text-muted-foreground" : good ? "text-emerald-500" : "text-red-500";
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const txt = unit === "pct" ? `${up ? "+" : ""}${rounded.toFixed(0)}%` : `${up ? "+" : ""}${rounded.toFixed(0)} p.p.`;
  return (
    <span className={`mt-1 inline-flex items-center gap-0.5 text-[10px] font-medium ${color}`} title={`vs ${baseDate}`}>
      <Icon className="h-3 w-3" /> {txt}
    </span>
  );
}

function StatTile({ label, value, sub, accent, icon: Icon, tone = "blue", delta }: {
  label: string; value: string; sub?: string; accent: string; icon: React.ElementType;
  tone?: "blue" | "green" | "amber" | "red" | "teal"; delta?: React.ReactNode;
}) {
  const toneCls: Record<string, string> = {
    blue: "bg-blue-400/10 text-blue-500",
    green: "bg-emerald-400/10 text-emerald-500",
    amber: "bg-amber-400/10 text-amber-500",
    red: "bg-red-400/10 text-red-500",
    teal: "bg-teal-400/10 text-teal-500",
  };
  return (
    <div className={`relative overflow-hidden rounded-xl bg-card p-4 border border-border border-l-4 ${accent} transition-all hover:-translate-y-0.5`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
          <p className="mt-1.5 text-xl font-bold text-foreground leading-tight break-words tabular-nums">{value}</p>
          {sub && <p className="mt-1 text-xs text-muted-foreground leading-snug">{sub}</p>}
          {delta}
        </div>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneCls[tone]}`}>
          <Icon className="h-[18px] w-[18px]" />
        </div>
      </div>
    </div>
  );
}

function SectionSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <Skeleton className="h-32 rounded-2xl" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
      <Skeleton className="h-80 rounded-2xl" />
      <Skeleton className="h-80 rounded-2xl" />
    </div>
  );
}

const ABC_COLORS: Record<string, string> = { A: "#22c55e", B: "#3b82f6", C: "#94a3b8" };

export default function Suprimentos() {
  const { canAdmin } = useAuth();
  const { data, isLoading, error } = useSuprimentosCockpit();
  const [fluxoPeriodo, setFluxoPeriodo] = useState<30 | 90>(30);

  const fluxoFiltrado = useMemo(() => {
    if (!data) return [];
    const cutoff = new Date(Date.now() - fluxoPeriodo * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return data.fluxoDiario.filter((r) => r.date >= cutoff);
  }, [data, fluxoPeriodo]);

  // Fluxo em R$ (valorizado) — soma quantidade × unit_cost, não unidades cruas
  // (somar mL + un + kg não tem significado; em R$ vira caixa entrando/saindo).
  const fluxoPorDia = useMemo(() => {
    const map = new Map<string, { date: string; entradas: number; saidas: number }>();
    for (const r of fluxoFiltrado) {
      const cur = map.get(r.date) ?? { date: r.date, entradas: 0, saidas: 0 };
      if (r.tipo === "entrada") cur.entradas += r.valor; else cur.saidas += r.valor;
      map.set(r.date, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [fluxoFiltrado]);

  const fluxoLiquidoPorCategoria = useMemo(() => {
    const map = new Map<string, { entradas: number; saidas: number }>();
    for (const r of fluxoFiltrado) {
      const cur = map.get(r.category) ?? { entradas: 0, saidas: 0 };
      if (r.tipo === "entrada") cur.entradas += r.valor; else cur.saidas += r.valor;
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
            description="Hub Natal · saúde de estoque, giro, risco em R$ e custo de fabricação — visão estratégica, somente leitura" />
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
          description="Saúde de estoque, giro, risco em R$ e rede de distribuição — visão estratégica, somente leitura" />

        {isLoading || !d ? <SectionSkeleton /> : (
          <>
            {/* ── 1. Faixa executiva — saúde de suprimentos em 5 segundos ───── */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {[
                { label: "Capital em estoque", value: fmtBRL(d.valorTotal), sub: `${fmtNum(d.totalProdutosAtivos)} produtos ativos`, accent: "border-l-blue-400", icon: Coins, tone: "blue" as const,
                  delta: d.tendencia && <TrendChip value={d.tendencia.valorTotal} unit="pct" neutral baseDate={d.tendencia.baseDate} /> },
                { label: "Giro anualizado", value: d.giroAnualizado != null ? `${d.giroAnualizado.toFixed(1)}×/ano` : "—", sub: d.diasCoberturaMedia != null ? `${Math.round(d.diasCoberturaMedia)} dias de cobertura` : "sem consumo no período", accent: "border-l-teal-400", icon: Gauge, tone: "teal" as const },
                { label: "Capital congelado", value: fmtBRL(d.capitalCongelado), sub: `parado ${fmtBRL(d.valorParado)} · excesso ${fmtBRL(d.valorExcesso)}`, accent: "border-l-amber-400", icon: Snowflake, tone: "amber" as const },
                { label: "Risco de ruptura (R$)", value: fmtBRL(d.riscoValorTotal), sub: `${fmtNum(d.riscoTotal)} abaixo do mínimo · ${fmtNum(d.riscoCriticoTotal)} zerados`, accent: d.riscoCriticoTotal > 0 ? "border-l-red-500" : "border-l-amber-400", icon: ShieldAlert, tone: d.riscoCriticoTotal > 0 ? "red" as const : "amber" as const,
                  delta: d.tendencia && <TrendChip value={d.tendencia.riscoValor} unit="pct" higherIsBetter={false} baseDate={d.tendencia.baseDate} /> },
                { label: "Cobertura de custo", value: `${d.coberturaPct.toFixed(0)}%`, sub: d.produtosSemCustoTotal > 0 ? `${fmtNum(d.produtosSemCustoTotal)} com estoque sem custo` : "cadastro completo", accent: d.coberturaPct >= 80 ? "border-l-emerald-400" : "border-l-amber-400", icon: PackageSearch, tone: d.coberturaPct >= 80 ? "green" as const : "amber" as const,
                  delta: d.tendencia && <TrendChip value={d.tendencia.cobertura} unit="pp" higherIsBetter baseDate={d.tendencia.baseDate} /> },
              ].map((t, i) => (
                <motion.div key={t.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <StatTile {...t} />
                </motion.div>
              ))}
            </div>

            {/* ── 2. Estado da rede — Natal produz → SP vende ───────────────────
                Só aparece com mais de 1 hub no escopo. Hoje o escopo é só Natal
                (FOCO_HUBS), então esta seção fica oculta — os CDs de SP são
                acompanhados de outra forma por enquanto. */}
            {d.hubResumo.length > 1 && (
            <Card className="rounded-2xl border-0 shadow-sm">
              <CardHeader className="pb-1 pt-5 px-5">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <ArrowLeftRight className="h-4 w-4 text-primary" /> Estado da Rede
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Capital mobilizado e ruptura por hub, na ordem do fluxo físico (produção → venda). O que está em trânsito é capital comprometido, ainda não vendável.
                </p>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <div className="flex flex-col lg:flex-row items-stretch gap-3">
                  {d.hubResumo.map((h, i) => (
                    <div key={h.hubCode} className="flex items-center gap-3 flex-1">
                      <div className="flex-1 rounded-xl border border-border bg-card p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-foreground truncate">{h.hubLabel}</span>
                          <CarboBadge variant={h.papel === "producao" ? "secondary" : "outline"} size="sm" className="gap-1 shrink-0">
                            {h.papel === "producao" ? <Factory className="h-3 w-3" /> : <Store className="h-3 w-3" />}
                            {h.papel === "producao" ? "Produção" : "Venda"}
                          </CarboBadge>
                        </div>
                        <p className="mt-1.5 text-lg font-bold tabular-nums text-foreground">{fmtBRL(h.valor)}</p>
                        <p className="text-[11px] mt-0.5">
                          {h.ruptura > 0
                            ? <span className="text-amber-500 font-medium">{fmtNum(h.ruptura)} produto(s) abaixo do mínimo</span>
                            : <span className="text-muted-foreground">sem ruptura</span>}
                        </p>
                      </div>
                      {i < d.hubResumo.length - 1 && <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 hidden lg:block" />}
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  <Truck className="h-3.5 w-3.5 text-blue-500" />
                  <span className="font-medium text-foreground">Em trânsito:</span>
                  <span><strong className="text-foreground">{fmtBRL(d.valorEmTransito)}</strong> · {fmtNum(d.unidadesEmTransito)} un</span>
                  {d.transitoDiasMax != null && d.transitoDiasMax >= 15 && (
                    <CarboBadge variant="warning" size="sm">remessa parada há {d.transitoDiasMax} dias</CarboBadge>
                  )}
                  <span className="text-[11px] text-muted-foreground/70 ml-auto">execução no Carbo Ops</span>
                </div>
              </CardContent>
            </Card>
            )}

            {/* ── 3. A remanejar (só quando há mais de 1 hub no escopo) ──────── */}
            {d.produtosRemanejar.length > 0 && (
              <Card className="rounded-2xl border-0 shadow-sm">
                <CardHeader className="pb-1 pt-5 px-5">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Repeat2 className="h-4 w-4 text-primary" /> A Remanejar
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Falta no hub de venda mas <strong className="text-foreground">existe em Natal</strong> — é transferência, não compra. {fmtNum(d.produtosRemanejarTotal)} caso(s).
                  </p>
                </CardHeader>
                <CardContent className="px-0 pb-2">
                  <div className="overflow-x-auto">
                    <CarboTable>
                      <CarboTableHeader>
                        <CarboTableRow>
                          <CarboTableHead>Produto</CarboTableHead>
                          <CarboTableHead>Falta em</CarboTableHead>
                          <CarboTableHead className="text-right">Transferir</CarboTableHead>
                          <CarboTableHead className="text-right">Em Natal</CarboTableHead>
                        </CarboTableRow>
                      </CarboTableHeader>
                      <CarboTableBody>
                        {d.produtosRemanejar.map((p) => (
                          <CarboTableRow key={`${p.id}::${p.hubFaltaCode}`}>
                            <CarboTableCell>
                              <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                              <span className="text-[10px] font-mono text-muted-foreground">{p.product_code}</span>
                            </CarboTableCell>
                            <CarboTableCell className="text-xs text-muted-foreground">{p.hubFaltaLabel}</CarboTableCell>
                            <CarboTableCell className="text-right">
                              <CarboBadge variant="warning" className="whitespace-nowrap">{fmtNum(p.faltaQty)} {p.unit}</CarboBadge>
                            </CarboTableCell>
                            <CarboTableCell className="text-right tabular-nums text-muted-foreground whitespace-nowrap">{fmtNum(p.disponivelProducao)} {p.unit}</CarboTableCell>
                          </CarboTableRow>
                        ))}
                      </CarboTableBody>
                    </CarboTable>
                    {d.produtosRemanejarTotal > d.produtosRemanejar.length && (
                      <p className="text-[11px] text-muted-foreground text-center py-2">+ {d.produtosRemanejarTotal - d.produtosRemanejar.length} outro(s)</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Risco de ruptura nomeado (largura total) ─────────────────────── */}
            <div className="grid grid-cols-1 gap-4">
              <Card className={`rounded-2xl shadow-sm ${d.riscoCriticoTotal > 0 ? "border-2 border-destructive/30" : d.riscoTotal > 0 ? "border border-warning/30" : "border-0"}`}>
                <CardHeader className="pb-1 pt-5 px-5">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-amber-500" /> Risco de Ruptura
                  </CardTitle>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-muted-foreground">Repor até o mínimo custa <strong className="text-foreground">{fmtBRL(d.riscoValorTotal)}</strong>.</span>
                    {d.riscoPorHub.map((h) => (
                      <span key={h.hubCode} className="text-[11px] text-muted-foreground">· {h.hubLabel}: <strong className="text-foreground">{fmtNum(h.count)}</strong></span>
                    ))}
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  {d.produtosEmRisco.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-8">Nenhum produto em risco.</p>
                  ) : (
                    <div className="divide-y divide-border -mx-1">
                      {d.produtosEmRisco.map((p) => (
                        <div key={`${p.id}::${p.hubCode}`} className="flex items-center justify-between gap-2 py-2 px-1">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate">{p.name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <CarboBadge variant="secondary" size="sm">{p.category}</CarboBadge>
                              <span className="text-[10px] text-muted-foreground">{p.hubLabel}</span>
                              {p.diasCobertura != null && <span className="text-[10px] text-muted-foreground">· {Math.round(p.diasCobertura)}d de cobertura</span>}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className={`text-xs font-bold tabular-nums block ${p.quantity === 0 ? "text-red-500" : "text-amber-500"}`}>
                              {fmtNum(p.quantity)} / {fmtNum(p.effectiveMin)} {p.unit}
                            </span>
                            {p.valorRisco > 0 && <span className="text-[10px] text-muted-foreground">repor: {fmtBRL(p.valorRisco)}</span>}
                          </div>
                        </div>
                      ))}
                      {d.riscoTotal > d.produtosEmRisco.length && (
                        <p className="text-[11px] text-muted-foreground text-center pt-2">+ {d.riscoTotal - d.produtosEmRisco.length} outro(s) em risco</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ── 4. Capital congelado: parados + excesso ───────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Parados */}
              <Card className="rounded-2xl border-0 shadow-sm">
                <CardHeader className="pb-1 pt-5 px-5">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Snowflake className="h-4 w-4 text-amber-500" /> Produtos Parados
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Estoque sem nenhuma movimentação em 90 dias — <strong className="text-foreground">{fmtNum(d.produtosParadosTotal)}</strong> produto(s), <strong className="text-foreground">{fmtBRL(d.valorParado)}</strong> ({d.valorTotal > 0 ? ((d.valorParado / d.valorTotal) * 100).toFixed(0) : 0}% do capital) sem giro — candidato a liquidação.
                  </p>
                </CardHeader>
                <CardContent className="px-0 pb-2">
                  {d.produtosParados.length === 0 ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">Sem produtos parados.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <CarboTable>
                        <CarboTableHeader>
                          <CarboTableRow>
                            <CarboTableHead>Produto</CarboTableHead>
                            <CarboTableHead className="text-right">Estoque</CarboTableHead>
                            <CarboTableHead className="text-right">Parado</CarboTableHead>
                          </CarboTableRow>
                        </CarboTableHeader>
                        <CarboTableBody>
                          {d.produtosParados.map((p) => (
                            <CarboTableRow key={p.id}>
                              <CarboTableCell>
                                <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[10px] font-mono text-muted-foreground">{p.product_code}</span>
                                  <CarboBadge variant="secondary" size="sm">{p.category}</CarboBadge>
                                </div>
                              </CarboTableCell>
                              <CarboTableCell className="text-right tabular-nums text-muted-foreground whitespace-nowrap">{fmtNum(p.qty)} {p.unit}</CarboTableCell>
                              <CarboTableCell className="text-right"><CarboBadge variant="warning" className="whitespace-nowrap">{fmtBRL(p.valor)}</CarboBadge></CarboTableCell>
                            </CarboTableRow>
                          ))}
                        </CarboTableBody>
                      </CarboTable>
                      {d.produtosParadosTotal > d.produtosParados.length && (
                        <p className="text-[11px] text-muted-foreground text-center py-2">+ {d.produtosParadosTotal - d.produtosParados.length} outro(s) parado(s)</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Excesso */}
              <Card className="rounded-2xl border-0 shadow-sm">
                <CardHeader className="pb-1 pt-5 px-5">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Layers className="h-4 w-4 text-amber-500" /> Excesso de Estoque
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Ainda giram, mas há mais de 90 dias de consumo em estoque — <strong className="text-foreground">{fmtNum(d.produtosExcessoTotal)}</strong> produto(s), <strong className="text-foreground">{fmtBRL(d.valorExcesso)}</strong> além do necessário.
                    <br /><span className="text-[11px]">Cobertura = estoque atual ÷ consumo médio por dia (saídas dos últimos 90 dias em Natal). Ex.: 804 dias = o estoque atual dura 804 dias no ritmo de consumo recente.</span>
                  </p>
                </CardHeader>
                <CardContent className="px-0 pb-2">
                  {d.produtosExcesso.length === 0 ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">Sem excesso relevante — estoque dimensionado ao consumo.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <CarboTable>
                        <CarboTableHeader>
                          <CarboTableRow>
                            <CarboTableHead>Produto</CarboTableHead>
                            <CarboTableHead className="text-right">Cobertura (dias)</CarboTableHead>
                            <CarboTableHead className="text-right">Excesso (R$)</CarboTableHead>
                          </CarboTableRow>
                        </CarboTableHeader>
                        <CarboTableBody>
                          {d.produtosExcesso.map((p) => (
                            <CarboTableRow key={p.id}>
                              <CarboTableCell>
                                <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[10px] font-mono text-muted-foreground">{p.product_code}</span>
                                  <CarboBadge variant="secondary" size="sm">{p.category}</CarboBadge>
                                </div>
                              </CarboTableCell>
                              <CarboTableCell className="text-right tabular-nums text-muted-foreground whitespace-nowrap">{Math.round(p.diasCobertura)} dias</CarboTableCell>
                              <CarboTableCell className="text-right"><CarboBadge variant="warning" className="whitespace-nowrap">{fmtBRL(p.valorExcesso)}</CarboBadge></CarboTableCell>
                            </CarboTableRow>
                          ))}
                        </CarboTableBody>
                      </CarboTable>
                      {d.produtosExcessoTotal > d.produtosExcesso.length && (
                        <p className="text-[11px] text-muted-foreground text-center py-2">+ {d.produtosExcessoTotal - d.produtosExcesso.length} outro(s) com excesso</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ── 5. Concentração (ABC) + Top 10 ────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="rounded-2xl border-0 shadow-sm">
                <CardHeader className="pb-1 pt-5 px-5">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <PackageSearch className="h-4 w-4 text-primary" /> Concentração (ABC)
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Onde o capital se concentra — foque o controle nos itens A.</p>
                </CardHeader>
                <CardContent className="px-5 pb-5 space-y-3">
                  <div className="flex h-3 w-full overflow-hidden rounded-full">
                    {d.abc.map((c) => c.pctValor > 0 && (
                      <div key={c.classe} style={{ width: `${c.pctValor}%`, background: ABC_COLORS[c.classe] }} title={`${c.classe}: ${c.pctValor.toFixed(0)}%`} />
                    ))}
                  </div>
                  {d.abc.map((c) => (
                    <div key={c.classe} className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: ABC_COLORS[c.classe] }} />
                        <strong className="text-foreground">Classe {c.classe}</strong>
                        <span className="text-muted-foreground">{fmtNum(c.count)} itens ({c.pctCount.toFixed(0)}%)</span>
                      </span>
                      <span className="tabular-nums text-foreground font-medium">{fmtBRL(c.valor)} · {c.pctValor.toFixed(0)}%</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="lg:col-span-2 rounded-2xl border-0 shadow-sm">
                <CardHeader className="pb-1 pt-5 px-5">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Coins className="h-4 w-4 text-primary" /> Top 10 Produtos por Valor
                  </CardTitle>
                  {d.topProdutos.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Esses 10 concentram <strong className="text-foreground">{d.topProdutosValorPct.toFixed(0)}%</strong> do capital mobilizado.
                    </p>
                  )}
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
                              <CarboTableCell className="text-right tabular-nums text-muted-foreground whitespace-nowrap">{fmtNum(p.qty)} {p.unit}</CarboTableCell>
                              <CarboTableCell className="text-right"><CarboBadge variant="success" className="whitespace-nowrap">{fmtBRL(p.valor)}</CarboBadge></CarboTableCell>
                            </CarboTableRow>
                          ))}
                        </CarboTableBody>
                      </CarboTable>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ── 6. Custo de Fabricação (BOM) — 1 custo de referência + rota ── */}
            {d.custoFabricacao.length > 0 && (
              <Card className="rounded-2xl border-0 shadow-sm">
                <CardHeader className="pb-1 pt-5 px-5">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <FlaskConical className="h-4 w-4 text-primary" /> Custo de Fabricação (ficha técnica)
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Custo de produzir 1 unidade, somando os insumos da ficha. Quando há um semi-acabado, comparamos as 2 rotas (🏷️ Rotular vs ⚙️ Do zero) e mostramos a <strong className="text-foreground">mais barata</strong>. O <strong className="text-foreground">preço de venda</strong> é o cadastrado no produto (Ops) e a <strong className="text-foreground">margem</strong> = (preço − custo) ÷ preço — só aparece quando o custo da ficha está completo.
                  </p>
                </CardHeader>
                <CardContent className="px-0 pb-2">
                  <div className="overflow-x-auto">
                    <CarboTable>
                      <CarboTableHeader>
                        <CarboTableRow>
                          <CarboTableHead>Produto</CarboTableHead>
                          <CarboTableHead className="text-right">Custo de fabricação</CarboTableHead>
                          <CarboTableHead>Rota / economia</CarboTableHead>
                          <CarboTableHead className="text-right">Preço de venda</CarboTableHead>
                          <CarboTableHead className="text-right">Margem</CarboTableHead>
                          <CarboTableHead className="text-right">vs cadastrado</CarboTableHead>
                          <CarboTableHead>Cobertura</CarboTableHead>
                        </CarboTableRow>
                      </CarboTableHeader>
                      <CarboTableBody>
                        {d.custoFabricacao.map((p) => {
                          const faltRef = p.rotaReferencia === "zero" ? (p.itensFaltantesZero ?? 0) : p.itensFaltantes;
                          const totRef = p.rotaReferencia === "zero" ? (p.totalItensBomZero ?? 0) : p.totalItensBom;
                          const outraCusto = p.rotaReferencia === "zero" ? p.custoCalculado : p.custoZero;
                          const outraLabel = p.rotaReferencia === "zero" ? "🏷️ Rotular" : "⚙️ Do zero";
                          const economia = p.economiaZero;
                          return (
                            <CarboTableRow key={p.id}>
                              <CarboTableCell>
                                <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[10px] font-mono text-muted-foreground">{p.product_code}</span>
                                  <CarboBadge variant="secondary" size="sm">{p.category}</CarboBadge>
                                </div>
                              </CarboTableCell>
                              <CarboTableCell className="text-right">
                                <span className={`text-sm font-bold tabular-nums block ${p.completo ? "text-foreground" : "text-amber-500"}`}>
                                  {p.completo ? "" : "~"}{fmtBRL(p.custoReferencia)}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  {p.rotaReferencia === "zero" ? "⚙️ Do zero" : "🏷️ Rotular"}
                                </span>
                              </CarboTableCell>
                              <CarboTableCell>
                                {p.temAlternativa && economia != null ? (
                                  Math.abs(economia) < 0.01 ? (
                                    <span className="text-xs text-muted-foreground">custo igual nas 2 rotas</span>
                                  ) : economia > 0 ? (
                                    <div className="flex flex-col gap-0.5">
                                      <CarboBadge variant="success" size="sm" className="w-fit">⚙️ Do zero economiza {fmtBRL(economia)}</CarboBadge>
                                      {outraCusto != null && <span className="text-[10px] text-muted-foreground">{outraLabel}: {fmtBRL(outraCusto)}</span>}
                                    </div>
                                  ) : (
                                    <div className="flex flex-col gap-0.5">
                                      <CarboBadge variant="secondary" size="sm" className="w-fit">🏷️ Rotular economiza {fmtBRL(-economia)}</CarboBadge>
                                      {outraCusto != null && <span className="text-[10px] text-muted-foreground">{outraLabel}: {fmtBRL(outraCusto)}</span>}
                                    </div>
                                  )
                                ) : (
                                  <span className="text-xs text-muted-foreground">rota única</span>
                                )}
                              </CarboTableCell>
                              <CarboTableCell className="text-right">
                                {p.precoVenda != null ? (
                                  <span className="text-sm font-semibold tabular-nums text-foreground whitespace-nowrap">{fmtBRL(p.precoVenda)}</span>
                                ) : (
                                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">sem preço</span>
                                )}
                              </CarboTableCell>
                              <CarboTableCell className="text-right">
                                {p.margemPct != null ? (
                                  <CarboBadge variant={p.margemPct >= 40 ? "success" : p.margemPct >= 15 ? "warning" : "destructive"} className="whitespace-nowrap">
                                    {p.margemPct.toFixed(0)}%
                                  </CarboBadge>
                                ) : p.precoVenda != null && !p.completo ? (
                                  <span className="text-[10px] text-amber-500 whitespace-nowrap">custo incompleto</span>
                                ) : (
                                  <span className="text-[11px] text-muted-foreground">—</span>
                                )}
                              </CarboTableCell>
                              <CarboTableCell className="text-right">
                                {p.custoCadastrado > 0 ? (
                                  <div className="flex flex-col items-end gap-0.5">
                                    <span className="text-xs tabular-nums text-muted-foreground">{fmtBRL(p.custoCadastrado)}</span>
                                    {p.variancePct != null && Math.abs(p.variancePct) >= 1 && (
                                      <span className={`text-[10px] font-medium ${p.variancePct > 0 ? "text-red-500" : "text-emerald-500"}`}>
                                        ficha {p.variancePct > 0 ? "+" : ""}{fmtPct(p.variancePct)}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-amber-500 whitespace-nowrap">não cadastrado</span>
                                )}
                              </CarboTableCell>
                              <CarboTableCell>
                                {faltRef > 0 ? (
                                  <span className="text-xs text-amber-500 whitespace-nowrap">falta custo de {faltRef} de {totRef} insumo(s)</span>
                                ) : (
                                  <span className="text-xs text-muted-foreground whitespace-nowrap">{totRef} insumo(s) — completo</span>
                                )}
                              </CarboTableCell>
                            </CarboTableRow>
                          );
                        })}
                      </CarboTableBody>
                    </CarboTable>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── 7. Fluxo em R$ (entradas vs saídas) + líquido por categoria ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="rounded-2xl border-0 shadow-sm">
                <CardHeader className="pb-1 pt-5 px-5">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <ArrowLeftRight className="h-4 w-4 text-primary" /> Fluxo de Caixa em Estoque (R$)
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
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: string) => v.slice(5)} />
                        <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(x: number) => (x >= 1000 ? `${Math.round(x / 1000)}k` : String(x))} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, n: string) => [fmtBRL(v), n === "entradas" ? "Entradas" : "Saídas"]} />
                        <Area type="monotone" dataKey="entradas" stroke="#22c55e" strokeWidth={2} fill="url(#fluxoEntradas)" />
                        <Area type="monotone" dataKey="saidas" stroke="#3b82f6" strokeWidth={2} fill="url(#fluxoSaidas)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-0 shadow-sm">
                <CardHeader className="pb-1 pt-5 px-5">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    {fluxoLiquidoPorCategoria.some((c) => c.net < 0)
                      ? <TrendingDown className="h-4 w-4 text-primary" />
                      : <TrendingUp className="h-4 w-4 text-primary" />} Fluxo Líquido por Categoria ({fluxoPeriodo}d, R$)
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Positivo = capital acumulando (entrou mais que saiu); negativo = drenando.</p>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  {fluxoLiquidoPorCategoria.length === 0 ? (
                    <p className="px-3 py-16 text-center text-sm text-muted-foreground">Sem dados no período.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={Math.max(220, fluxoLiquidoPorCategoria.length * 44)}>
                      <BarChart data={fluxoLiquidoPorCategoria} layout="vertical" margin={{ top: 8, right: 56, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(x: number) => (Math.abs(x) >= 1000 ? `${Math.round(x / 1000)}k` : String(x))} />
                        <YAxis type="category" dataKey="category" width={110} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [fmtBRL(v), "Fluxo líquido"]} />
                        <Bar dataKey="net" radius={[0, 4, 4, 0]}>
                          {fluxoLiquidoPorCategoria.map((c, i) => <Cell key={i} fill={c.net >= 0 ? "#22c55e" : "#ef4444"} />)}
                          <LabelList dataKey="net" position="right" formatter={(v: number) => fmtBRL(v)} style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ── 8. Valor por categoria + blind spots de custo ─────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="lg:col-span-2 rounded-2xl border-0 shadow-sm">
                <CardHeader className="pb-1 pt-5 px-5">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Layers className="h-4 w-4 text-primary" /> Valor Mobilizado por Categoria
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  {d.valorPorCategoria.length === 0 ? (
                    <p className="px-3 py-16 text-center text-sm text-muted-foreground">Sem dados no período.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={Math.max(200, d.valorPorCategoria.length * 44)}>
                      <BarChart data={d.valorPorCategoria} layout="vertical" margin={{ top: 8, right: 56, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(x: number) => (x >= 1000 ? `${Math.round(x / 1000)}k` : String(x))} />
                        <YAxis type="category" dataKey="category" width={110} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [fmtBRL(v), "Valor"]} />
                        <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
                          {d.valorPorCategoria.map((_, i) => <Cell key={i} fill="#22c55e" fillOpacity={1 - i * 0.08} />)}
                          <LabelList dataKey="valor" position="right" formatter={(v: number) => fmtBRL(v)} style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-0 shadow-sm">
                <CardHeader className="pb-1 pt-5 px-5">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <PackageSearch className="h-4 w-4 text-amber-500" /> Custos a Cadastrar
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Produtos com estoque mas custo R$0 — somem do valor mobilizado. Completar no Ops libera visibilidade.
                  </p>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  {d.produtosSemCusto.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-8">Todos os produtos com estoque têm custo cadastrado. 🎉</p>
                  ) : (
                    <div className="divide-y divide-border -mx-1">
                      {d.produtosSemCusto.map((p) => (
                        <div key={p.id} className="flex items-center justify-between gap-2 py-2 px-1">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate">{p.name}</p>
                            <span className="text-[10px] font-mono text-muted-foreground">{p.product_code}</span>
                          </div>
                          <span className="text-xs tabular-nums text-muted-foreground shrink-0">{fmtNum(p.qty)} {p.unit}</span>
                        </div>
                      ))}
                      {d.produtosSemCustoTotal > d.produtosSemCusto.length && (
                        <p className="text-[11px] text-muted-foreground text-center pt-2">+ {d.produtosSemCustoTotal - d.produtosSemCusto.length} outro(s) sem custo</p>
                      )}
                    </div>
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
