import { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  BookText, MapPin, Users, Cloud, ArrowDownToLine, ArrowUpFromLine, Factory,
  Activity, Info, Loader2, ChevronLeft, ChevronRight, ArrowUpCircle, ArrowDownCircle,
} from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useStockLive } from "@/hooks/useStock";
import { useStockMovements } from "@/hooks/useStockMovements";
import { useStockMovementStats } from "@/hooks/useStockMovementStats";
import { useCadernoTrend, isFinalCategory } from "@/hooks/useCadernoCaixa";

// ─────────────────────────────────────────────────────────────────────────────
// Caderno de Caixa do Estoque (Carbo Ops) — leitura das movimentações por hub.
//  • Resumo do período (entradas / saídas / produzido / total).
//  • Gráfico de linha: insumo entrando × produto final produzido × saído.
//  • Extrato paginado (o "caderno" em si) com filtro por categoria.
// Espelha o seletor de hub/período do Suprimentos (mesma experiência).
// ─────────────────────────────────────────────────────────────────────────────

type Hub = "rn" | "sp" | "sp-vendas" | "bling";
const HUB_CODE: Record<Hub, string> = { rn: "HUB-RN", sp: "HUB-SP", "sp-vendas": "HUB-SP-VENDAS", bling: "CD-BLING" };
const HUB_LABEL: Record<Hub, string> = { rn: "Hub Natal", sp: "CD SP LogHouse", "sp-vendas": "CD SP Vendas", bling: "CD Bling" };

const PERIODOS = [{ v: "7d", label: "Últimos 7 dias" }, { v: "30d", label: "Últimos 30 dias" }, { v: "mes", label: "Este mês" }];
const PAGE_SIZES = [10, 25, 50, 100];

const TOOLTIP = { backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" } as const;
// Cores das três séries (distintas e coerentes com o app).
const C_INSUMO = "hsl(217, 91%, 55%)";   // azul  — insumo entrando
const C_PROD   = "hsl(142, 71%, 40%)";   // verde — produto final produzido
const C_SAIDA  = "hsl(28, 92%, 52%)";    // laranja — produto final saindo

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const nf = (n: number) => n.toLocaleString("pt-BR");

type CatFilter = "todos" | "insumo" | "final";

export default function CadernoCaixa() {
  const [hub, setHub] = useState<Hub>("rn");
  const [catFilter, setCatFilter] = useState<CatFilter>("todos");
  const [size, setSize] = useState(10);
  const [page, setPage] = useState(1);

  // Período (persiste, igual ao Suprimentos). Valores: 7d | 30d | mes | custom | "YYYY-MM".
  const [periodo, setPeriodo] = useState(() => { try { return localStorage.getItem("ops_caderno_periodo") || "30d"; } catch { return "30d"; } });
  const [customFrom, setCustomFrom] = useState(() => { try { return localStorage.getItem("ops_caderno_from") || ""; } catch { return ""; } });
  const [customTo, setCustomTo] = useState(() => { try { return localStorage.getItem("ops_caderno_to") || ""; } catch { return ""; } });
  useEffect(() => { try { localStorage.setItem("ops_caderno_periodo", periodo); localStorage.setItem("ops_caderno_from", customFrom); localStorage.setItem("ops_caderno_to", customTo); } catch { /* ignora */ } }, [periodo, customFrom, customTo]);

  useStockLive(); // atualiza ao vivo quando outro usuário mexe no estoque (produção ou manual)

  const monthOptions = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      return { v, label: label.charAt(0).toUpperCase() + label.slice(1) };
    });
  }, []);
  const periodLabel = periodo === "7d" ? "7 dias" : periodo === "30d" ? "30 dias" : periodo === "mes" ? "este mês"
    : periodo === "custom" ? "período" : (monthOptions.find((m) => m.v === periodo)?.label ?? "período");

  // Intervalo [from, to] do período escolhido.
  const range = useMemo(() => {
    const now = new Date();
    if (periodo === "7d") { const f = new Date(); f.setDate(f.getDate() - 7); return { from: f, to: now }; }
    if (periodo === "30d") { const f = new Date(); f.setDate(f.getDate() - 30); return { from: f, to: now }; }
    if (periodo === "mes") { return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now }; }
    if (periodo === "custom") {
      const f = customFrom ? new Date(customFrom + "T00:00:00") : new Date(0);
      const t = customTo ? new Date(customTo + "T23:59:59") : now;
      return f > t ? { from: t, to: f } : { from: f, to: t };
    }
    const [y, mth] = periodo.split("-").map(Number);
    if (y && mth) return { from: new Date(y, mth - 1, 1), to: new Date(y, mth, 0, 23, 59, 59) };
    const f = new Date(); f.setDate(f.getDate() - 30); return { from: f, to: now };
  }, [periodo, customFrom, customTo]);

  const code = HUB_CODE[hub];
  const fromISO = range.from.toISOString();
  const toISO = range.to.toISOString();

  const isBling = hub === "bling";

  // Dados
  const { data: movStats } = useStockMovementStats(code, fromISO, toISO);
  const { data: trend, isLoading: trendLoading } = useCadernoTrend(code, fromISO, toISO);
  const { data: movimentacoes = [], isLoading: movLoading } = useStockMovements();

  // Extrato do hub + período + categoria (mesmo teto de 300 linhas recentes do Suprimentos).
  const extrato = useMemo(() => {
    return movimentacoes
      .filter((m) => m.warehouseCode === code)
      .filter((m) => { const d = new Date(m.data); return d >= range.from && d <= range.to; })
      .filter((m) => {
        if (catFilter === "todos") return true;
        const fin = isFinalCategory(m.category);
        return catFilter === "final" ? fin : !fin;
      });
  }, [movimentacoes, code, range, catFilter]);

  // Volta pra 1ª página ao mudar filtro.
  useEffect(() => { setPage(1); }, [hub, catFilter, periodo, customFrom, customTo, size]);

  const total = extrato.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const start = (page - 1) * size;
  const pageRows = extrato.slice(start, start + size);

  const kpis = {
    entradas: movStats?.entradas ?? 0,
    saidas: movStats?.saidas ?? 0,
    produzido: trend?.totals.finalProd ?? 0,
    movimentacoes: movStats?.movimentacoes ?? 0,
  };

  const hasTrend = (trend?.points.length ?? 0) > 0;

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-5 max-w-[1500px] mx-auto">
        {/* Header */}
        <CarboPageHeader title="Caderno de Caixa" description="Entradas de insumo, produção e saída de produto final" icon={BookText} />

        {/* Hub selector */}
        <div className="flex items-center gap-2 flex-wrap">
          {(["rn", "sp", "sp-vendas", "bling"] as Hub[]).map((h) => {
            const active = hub === h;
            const Icon = h === "sp-vendas" ? Users : h === "bling" ? Cloud : MapPin;
            return (
              <Button key={h} variant={active ? "default" : "outline"} size="sm"
                className={cn("gap-2", active && "bg-carbo-blue hover:bg-carbo-blue/90 text-white")}
                onClick={() => setHub(h)}>
                <Icon className="h-4 w-4" /> {HUB_LABEL[h]}
              </Button>
            );
          })}
        </div>

        {/* Período */}
        <div className="flex items-center gap-2 justify-end flex-wrap">
          <span className="text-xs text-muted-foreground">Período:</span>
          {periodo === "custom" && (
            <div className="flex items-center gap-1.5">
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-7 w-[140px] text-xs" />
              <span className="text-xs text-muted-foreground">até</span>
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-7 w-[140px] text-xs" />
            </div>
          )}
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger className="w-[170px] h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Rápido</SelectLabel>
                {PERIODOS.map((p) => <SelectItem key={p.v} value={p.v}>{p.label}</SelectItem>)}
                <SelectItem value="custom">Personalizado…</SelectItem>
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>Por mês</SelectLabel>
                {monthOptions.map((m) => <SelectItem key={m.v} value={m.v}>{m.label}</SelectItem>)}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {/* Resumo do período */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <CarboCard variant="kpi" padding="sm"><CarboCardContent>
            <div className="flex items-center gap-2 mb-1"><ArrowDownToLine className="h-4 w-4 text-carbo-green" /><span className="text-xs text-muted-foreground">Entradas ({periodLabel})</span></div>
            <p className="text-2xl font-bold">{nf(kpis.entradas)}</p>
          </CarboCardContent></CarboCard>
          <CarboCard variant="kpi" padding="sm"><CarboCardContent>
            <div className="flex items-center gap-2 mb-1"><ArrowUpFromLine className="h-4 w-4 text-warning" /><span className="text-xs text-muted-foreground">Saídas ({periodLabel})</span></div>
            <p className="text-2xl font-bold">{nf(kpis.saidas)}</p>
          </CarboCardContent></CarboCard>
          <CarboCard variant="kpi" padding="sm"><CarboCardContent>
            <div className="flex items-center gap-2 mb-1"><Factory className="h-4 w-4 text-carbo-blue" /><span className="text-xs text-muted-foreground">Produzido ({periodLabel})</span></div>
            <p className="text-2xl font-bold text-carbo-blue">{nf(kpis.produzido)} <span className="text-sm font-normal text-muted-foreground">un</span></p>
          </CarboCardContent></CarboCard>
          <CarboCard variant="kpi" padding="sm"><CarboCardContent>
            <div className="flex items-center gap-2 mb-1"><Activity className="h-4 w-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Movimentações ({periodLabel})</span></div>
            <p className="text-2xl font-bold">{nf(kpis.movimentacoes)}</p>
          </CarboCardContent></CarboCard>
        </div>

        {/* Gráfico de linha */}
        <CarboCard><CarboCardContent className="pt-5 space-y-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold"><BookText className="h-4 w-4 text-carbo-blue" /> Movimentação no período — {HUB_LABEL[hub]}</h2>
            <p className="text-xs text-muted-foreground">Insumo entrando, produto final produzido e produto final saindo, por dia.</p>
          </div>
          {trendLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando…</div>
          ) : !hasTrend ? (
            <CarboEmptyState title="Sem movimentações no período" description="Ajuste o período ou o hub para ver a curva." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trend!.points} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP} labelStyle={{ color: "hsl(var(--foreground))" }} formatter={(v: number, n: string) => [nf(v), n]} />
                  <Legend />
                  <Line type="monotone" dataKey="insumoIn" name="Insumo entrando" stroke={C_INSUMO} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="finalProd" name="Produto final produzido" stroke={C_PROD} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="finalOut" name="Produto final saindo" stroke={C_SAIDA} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>A linha de <strong>insumo</strong> soma quantidades de itens em unidades diferentes (kg, L, un…), então é um indicador de <em>volume</em>, não uma grandeza exata. As linhas de <strong>produto final</strong> estão em unidades.</span>
              </div>
            </>
          )}
        </CarboCardContent></CarboCard>

        {/* Extrato (o caderno) */}
        <CarboCard><CarboCardContent className="pt-5 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="font-semibold">Extrato — lançamentos</h2>
            <div className="flex items-center gap-1.5">
              {([["todos", "Todos"], ["insumo", "Insumos"], ["final", "Produto final"]] as [CatFilter, string][]).map(([v, label]) => (
                <Button key={v} size="sm" variant={catFilter === v ? "default" : "outline"} className="h-7 text-xs" onClick={() => setCatFilter(v)}>{label}</Button>
              ))}
            </div>
          </div>

          {movLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando…</div>
          ) : total === 0 ? (
            <CarboEmptyState title="Nenhum lançamento" description="Entradas, saídas e produção deste hub aparecem aqui." />
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                {pageRows.map((m) => {
                  const isIn = m.tipo === "entrada";
                  const fin = isFinalCategory(m.category);
                  return (
                    <div key={m.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-card/50 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 truncate font-medium">
                          <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                            isIn ? "bg-carbo-green/15 text-carbo-green" : "bg-warning/15 text-warning")}>
                            {isIn ? <ArrowUpCircle size={11} /> : <ArrowDownCircle size={11} />}{isIn ? "Entrada" : "Saída"}
                          </span>
                          <span className="truncate">{m.produto}</span>
                          <span className="font-mono text-[10px] text-muted-foreground">{m.product_code}</span>
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
                          <CarboBadge variant={fin ? "success" : "info"}>{fin ? "Produto final" : "Insumo"}</CarboBadge>
                          <span className="truncate">{m.por ?? "—"} · origem {m.origem || "—"}{m.observacoes ? ` · ${m.observacoes}` : ""}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={cn("block font-bold tabular-nums", isIn ? "text-carbo-green" : "text-warning")}>
                          {isIn ? "+" : "−"}{nf(m.qtd)} <span className="text-xs font-normal text-muted-foreground">{m.unidade}</span>
                        </span>
                        <span className="text-xs text-muted-foreground">{fmtDateTime(m.data)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Paginação */}
              {total > PAGE_SIZES[0] && (
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    Mostrar
                    <select value={size} onChange={(e) => setSize(Number(e.target.value))}
                      className="h-9 rounded-lg border border-input bg-card px-2 outline-none focus:border-primary">
                      {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    por página
                  </label>
                  <div className="flex items-center gap-3">
                    <span className="text-sm tabular-nums text-muted-foreground">{start + 1}–{Math.min(start + size, total)} de {total}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-30" aria-label="Página anterior">
                        <ChevronLeft size={18} />
                      </button>
                      <span className="min-w-[70px] text-center text-sm font-medium tabular-nums">{page} / {totalPages}</span>
                      <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-30" aria-label="Próxima página">
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">Mostra as movimentações mais recentes do hub no período (até 300 lançamentos).</p>
            </>
          )}
        </CarboCardContent></CarboCard>

        {isBling && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-blue-500/10 border border-blue-500/20 text-sm text-blue-500">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <span><strong>CD Bling</strong> — o saldo vem da integração; a produção acontece no Hub Natal, então este hub costuma ter poucas movimentações de produção.</span>
          </div>
        )}
      </div>
    </div>
  );
}
