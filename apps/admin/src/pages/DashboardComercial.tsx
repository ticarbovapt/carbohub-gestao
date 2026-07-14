import { useMemo, useState } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from "recharts";
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart, Trophy, Repeat, Target, AlertTriangle, Pencil,
} from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useDashComercial } from "@/hooks/useDashComercial";
import { useComercialCanais, type CanalKey } from "@/hooks/useComercialCanais";
import { useCanalMetas } from "@/hooks/useCanalMetas";
import { VendedorFilter } from "@/components/comercial/VendedorFilter";
import { CanalMetasDialog } from "@/components/comercial/CanalMetasDialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtK = (v: number) =>
  v >= 1_000_000 ? `R$${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : brl(v);
const mesLbl = (y: number, m: number) => format(new Date(y, m - 1, 1), "MMM/yy", { locale: ptBR });

const TooltipBRL = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="font-bold mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {brl(Number(p.value))}</p>
      ))}
    </div>
  );
};
const TooltipQty = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="font-bold mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {Number(p.value)}</p>
      ))}
    </div>
  );
};

function RestrictedNotice() {
  return (
    <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-6 flex flex-col items-center gap-2 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-500/70" />
      <p className="text-sm font-medium">Área restrita a gestores.</p>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, tone = "green" }: {
  icon: React.ElementType; label: string; value: string; sub?: string; tone?: "green" | "blue" | "amber" | "violet";
}) {
  const toneCls = { green: "text-carbo-green", blue: "text-blue-500", amber: "text-amber-500", violet: "text-violet-500" }[tone];
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Icon className={`h-4 w-4 ${toneCls}`} /> {label}</div>
        <p className="text-xl font-bold truncate">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function GrowthPct({ label, pct }: { label: string; pct: number | null }) {
  const up = (pct ?? 0) >= 0;
  return (
    <div className="flex items-center justify-between rounded-lg border px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      {pct == null ? (
        <span className="text-xs text-muted-foreground">s/d</span>
      ) : (
        <span className={`text-sm font-semibold flex items-center gap-1 ${up ? "text-emerald-600" : "text-destructive"}`}>
          {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          {up ? "+" : ""}{pct.toFixed(1)}%
        </span>
      )}
    </div>
  );
}

const CANAL_META: { key: CanalKey; label: string; color: string; sub: string }[] = [
  { key: "consumo", label: "Consumo (B2B)", color: "#3b82f6", sub: "regra: mês anterior +15%" },
  { key: "revenda", label: "Revenda (PDV)", color: "#f59e0b", sub: "Nordeste + Sudeste" },
  { key: "online", label: "On-line", color: "#22c55e", sub: "a partir de jul/26" },
];

export default function DashboardComercial() {
  const { canAdmin } = useAuth();
  const [vendedor, setVendedor] = useState("all");
  const [modoClientes, setModoClientes] = useState<"acum" | "ativos" | "novos">("acum");
  const [metasOpen, setMetasOpen] = useState(false);

  const { data } = useDashComercial(vendedor === "all" ? null : vendedor, 12);
  const { data: canais } = useComercialCanais();
  const year = canais?.year ?? new Date().getFullYear();
  const { data: canalMetas } = useCanalMetas(year);

  // Real x Meta por canal (cruza real do ano com as metas; consumo tem regra rolante).
  const canalSeries = useMemo(() => {
    const real = canais?.realByCanal;
    if (!real) return null;
    const metas = canalMetas ?? { consumo: {}, revenda: {}, online: {} };
    const build = (canal: CanalKey) =>
      Array.from({ length: 12 }, (_, i) => {
        const mes = i + 1;
        const stored = (metas as any)[canal]?.[mes];
        let meta: number | null = stored != null ? Number(stored) : null;
        if (meta == null && canal === "consumo") {
          const prev = real.consumo[mes - 1];
          meta = mes > 1 && prev > 0 ? Math.round(prev * 1.15) : null;
        }
        return { mes: mesLbl(year, mes), real: real[canal][mes], meta };
      });
    return { consumo: build("consumo"), revenda: build("revenda"), online: build("online") };
  }, [canais, canalMetas, year]);

  const clientesChart = useMemo(
    () => (canais?.clientes ?? []).map((r: any) => ({
      mes: r.mes, b2b: r[`consumo_${modoClientes}`], pdv: r[`revenda_${modoClientes}`], online: r[`online_${modoClientes}`],
    })),
    [canais, modoClientes],
  );

  if (!canAdmin) return <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8"><RestrictedNotice /></main>;

  const k = data?.kpis;
  const g = data?.growth;
  const seg = canais?.segmentacao;

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 space-y-6">
      <CarboPageHeader
        icon={TrendingUp} title="Dashboard — Comercial"
        description="Vendas, evolução, crescimento e análise por canal (fonte: carboze_orders)."
        actions={<div className="w-48"><VendedorFilter value={vendedor} onChange={setVendedor} /></div>}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi icon={ShoppingCart} label="Total de Vendas" value={String(k?.totalVendas ?? 0)} sub="Pedidos ativos" tone="blue" />
        <Kpi icon={DollarSign} label="R$ Total Vendido" value={fmtK(k?.totalBRL ?? 0)} tone="green" />
        <Kpi icon={Trophy} label="Maior Venda" value={fmtK(k?.maiorVenda ?? 0)} sub={k?.maiorCliente} tone="amber" />
        <Kpi icon={Repeat} label="Top Recorrência" value={k?.topCliente ?? "—"} sub={`${k?.topQtd ?? 0} pedidos`} tone="violet" />
        <Kpi icon={Target} label="Ticket Médio" value={fmtK(k?.ticketMedio ?? 0)} tone="green" />
      </div>

      {/* Crescimento */}
      <div className="grid md:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Crescimento Mês a Mês {g && <span className="text-xs font-normal text-muted-foreground">({g.mom.prevLabel} → {g.mom.curLabel})</span>}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <GrowthPct label="Faturamento" pct={g?.mom.brl ?? null} />
            <GrowthPct label="Volume (pedidos)" pct={g?.mom.qty ?? null} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Último Mês vs Janeiro {g && <span className="text-xs font-normal text-muted-foreground">({g.vsJan.janLabel} → {g.vsJan.curLabel})</span>}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <GrowthPct label="Faturamento" pct={g?.vsJan.brl ?? null} />
            <GrowthPct label="Volume (pedidos)" pct={g?.vsJan.qty ?? null} />
          </CardContent>
        </Card>
      </div>

      {/* Evolução Mensal */}
      <div className="grid md:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Total Faturado por Mês</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={data?.monthly ?? []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="mes" fontSize={11} /><YAxis tickFormatter={fmtK} fontSize={11} width={54} />
                <Tooltip content={<TooltipBRL />} />
                <Bar dataKey="faturado" name="Faturado" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Line dataKey="faturado" name="Faturado" stroke="#16a34a" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Total de Vendas por Mês</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={data?.monthly ?? []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="mes" fontSize={11} /><YAxis fontSize={11} width={32} />
                <Tooltip content={<TooltipQty />} />
                <Bar dataKey="pedidos" name="Pedidos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Line dataKey="pedidos" name="Pedidos" stroke="#2563eb" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Crescimento anual + ticket médio */}
      <div className="grid md:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Crescimento Anual — real vs meta ({year})</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={data?.annualGrowth ?? []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="label" fontSize={11} /><YAxis tickFormatter={fmtK} fontSize={11} width={54} />
                <Tooltip content={<TooltipBRL />} />
                <Bar dataKey="real" name="Real" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Line dataKey="meta" name="Meta" stroke="#f59e0b" strokeDasharray="5 4" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Evolução do Ticket Médio</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={data?.monthly ?? []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="mes" fontSize={11} /><YAxis tickFormatter={fmtK} fontSize={11} width={54} />
                <Tooltip content={<TooltipBRL />} />
                <Line dataKey="ticketMedio" name="Ticket médio" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Análise por Canal ── */}
      <div className="flex items-center gap-3 pt-2">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Análise por Canal</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* Vendas por canal + clientes por canal */}
      <div className="grid lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Vendas por Canal</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {seg && ([
              ["Consumo (B2B)", seg.consumo, "#3b82f6"],
              ["Revenda (PDV)", seg.revenda, "#f59e0b"],
              ["On-line", seg.online, "#22c55e"],
              ["Não classificado", seg.naoClassificado, "#94a3b8"],
            ] as const).map(([label, b, color]) => {
              const p = seg.pct(b.brl);
              return (
                <div key={label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium">{label} <span className="text-muted-foreground">· {b.qtd} ped.</span></span>
                    <span className="tabular-nums">{brl(b.brl)} <span className="text-muted-foreground">({p.toFixed(0)}%)</span></span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{ width: `${p}%`, background: color }} /></div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">Crescimento de Clientes por Canal</CardTitle>
            <div className="flex gap-1 rounded-md border p-0.5">
              {([["acum", "Base"], ["ativos", "Ativos"], ["novos", "Novos"]] as const).map(([k2, l]) => (
                <button key={k2} onClick={() => setModoClientes(k2)}
                  className={`rounded px-2 py-0.5 text-[10px] font-medium ${modoClientes === k2 ? "bg-carbo-green/10 text-carbo-green" : "text-muted-foreground hover:bg-muted"}`}>{l}</button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={clientesChart}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="mes" fontSize={11} /><YAxis fontSize={11} width={32} />
                <Tooltip content={<TooltipQty />} />
                <Line dataKey="b2b" name="Consumo" stroke="#3b82f6" dot={false} />
                <Line dataKey="pdv" name="Revenda" stroke="#f59e0b" dot={false} />
                <Line dataKey="online" name="On-line" stroke="#22c55e" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Metas por canal */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Metas por Canal · {year}</h3>
          <Button variant="outline" size="sm" onClick={() => setMetasOpen(true)}><Pencil className="h-3.5 w-3.5 mr-1" /> Editar metas</Button>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          {CANAL_META.map((c) => (
            <Card key={c.key}>
              <CardHeader className="pb-1"><CardTitle className="text-xs flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: c.color }} /> {c.label}</CardTitle><p className="text-[10px] text-muted-foreground">{c.sub}</p></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={170}>
                  <ComposedChart data={canalSeries?.[c.key] ?? []}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="mes" fontSize={9} interval={1} /><YAxis tickFormatter={fmtK} fontSize={9} width={44} />
                    <Tooltip content={<TooltipBRL />} />
                    <Bar dataKey="real" name="Real" fill={c.color} radius={[3, 3, 0, 0]} />
                    <Line dataKey="meta" name="Meta" stroke="#64748b" strokeDasharray="4 3" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <CanalMetasDialog open={metasOpen} onOpenChange={setMetasOpen} ano={year} />
    </main>
  );
}
