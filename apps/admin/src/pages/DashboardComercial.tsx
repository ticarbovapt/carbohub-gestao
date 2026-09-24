import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from "recharts";
import {
  TrendingUp, ShoppingCart, DollarSign, Trophy, Repeat2, BarChart3,
  ArrowUpRight, ArrowDownRight, Minus, Loader2, Pencil, AlertTriangle, Globe, Wrench, Package,
} from "lucide-react";
import { useServicosNfse } from "@/hooks/useServicosNfse";
import { useUnidadesVendidas } from "@/hooks/useUnidadesVendidas";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { useAuth } from "@/contexts/AuthContext";
import { useDashComercial } from "@/hooks/useDashComercial";
import { useComercialCanais, type CanalKey } from "@/hooks/useComercialCanais";
import { useCanalMetas } from "@/hooks/useCanalMetas";
import { ComercialFilterBar, EMPTY_FILTERS, type DashFilters } from "@/components/comercial/ComercialFilterBar";
import { ComercialTabs } from "@/components/comercial/ComercialTabs";
import { CanalMetasDialog } from "@/components/comercial/CanalMetasDialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ── Helpers ───────────────────────────────────────────────────────────────────
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
// Quantidade inteira com separador de milhar — contagem, nunca dinheiro.
const fmtNum = (v: number) => Math.round(v).toLocaleString("pt-BR");
const fmtK = (v: number) => (v >= 1_000_000 ? `R$${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : brl(v));
const kAxis = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v));
const mesLbl = (y: number, m: number) => format(new Date(y, m - 1, 1), "MMM/yy", { locale: ptBR });

const boxStyle = { background: "#1a2234", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 8px 28px rgba(0,0,0,0.45)", borderRadius: 10, padding: "8px 14px", fontSize: 12 } as const;
const titleStyle = { color: "#fff", fontWeight: 700, marginBottom: 6, fontSize: 13 } as const;

function DarkTip({ active, payload, label, fmt, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={boxStyle}>
      <p style={titleStyle}>{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {fmt ? fmt(Number(p.value)) : `${Number(p.value)}${unit ?? ""}`}</p>
      ))}
    </div>
  );
}

function RestrictedNotice() {
  return (
    <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-6 flex flex-col items-center gap-2 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-500/70" />
      <p className="text-sm font-medium">Área restrita a gestores.</p>
    </div>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({ title, value, sub, Icon, accent, iconBg }: {
  title: string; value: string; sub?: string; Icon: React.ElementType; accent: string; iconBg: string;
}) {
  const len = value.length;
  const valSize = len <= 6 ? "text-3xl" : len <= 10 ? "text-2xl" : len <= 16 ? "text-xl" : "text-base";
  return (
    <div className={`relative overflow-hidden rounded-xl bg-board-surface p-4 border-l-4 ${accent} kpi-glow transition-all hover:-translate-y-0.5`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-board-muted truncate">{title}</p>
          <p className={`mt-1.5 font-bold text-board-text leading-tight break-words ${valSize}`}>{value}</p>
          {sub && <p className="mt-1 text-xs text-board-muted leading-snug line-clamp-2" title={sub}>{sub}</p>}
        </div>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBg}`}><Icon className="h-4.5 w-4.5" /></div>
      </div>
    </div>
  );
}

// ── Growth group ──────────────────────────────────────────────────────────────
function PctBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-bold bg-muted text-board-muted shrink-0"><Minus className="h-3 w-3" /> s/d</span>;
  const up = pct >= 0;
  return (
    <span className={`flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-bold shrink-0 ${up ? "bg-green-500/10 text-green-500" : "bg-red-400/10 text-red-400"}`}>
      {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}{Math.abs(pct).toFixed(1)}%
    </span>
  );
}
function GrowthSub({ label, pct, value, refLine }: { label: string; pct: number | null; value: string; refLine: string }) {
  const tone = pct == null ? "text-board-text" : pct >= 0 ? "text-green-500" : "text-red-400";
  return (
    <div className="p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold text-board-muted uppercase tracking-wider">{label}</p>
        <PctBadge pct={pct} />
      </div>
      <p className={`text-xl font-bold tabular-nums leading-none ${tone}`}>{value}</p>
      <p className="text-[11px] text-board-muted">{refLine}</p>
    </div>
  );
}

// ⚠️ `descarbonizacao` NÃO vem de `segmento` — não existe pedido com esse
// canal em `carboze_orders`. Ele sai da NFS-e, e o card o busca em `servicos`.
// Criar o valor na coluna `segmento` seria inventar pedido de serviço no Bling.
// Participação sobre a MESMA base do número grande do card. Base diferente
// engana calado, e por isso o rótulo dela vai escrito na tela ("dos packs" /
// "dos itens"), não só aqui.
const pctDe = (v: number, total: number) => (total > 0 ? `${((v / total) * 100).toFixed(1)}%` : "—");

/** Card de produto — o mesmo formato da tela de Vendas Online. */
function UnidadeCard({ nome, codigo, mapeado, numero, rotulo, detalhe, aviso }: {
  nome: string; codigo: string | null; mapeado: boolean;
  numero: number; rotulo: string; detalhe: string; aviso: string | null;
}) {
  // Sem mapeamento o multiplicador é desconhecido e o número é um PISO. O card
  // diz isso na cara — somá-lo aos outros apagaria a pista de que falta cadastro.
  const cor = mapeado ? "#a78bfa" : "#f59e0b";
  return (
    <div className="rounded-xl border border-border bg-board-surface/60 p-3 flex flex-col gap-1 transition-all hover:-translate-y-0.5"
         style={{ borderLeftColor: cor, borderLeftWidth: 3 }}
         title={`${nome}${codigo ? ` · ${codigo}` : ""}\n${numero.toLocaleString("pt-BR")} ${rotulo}\n${detalhe}`}>
      <div className="flex items-start justify-between gap-1.5">
        <p className="text-[11px] font-medium text-board-muted leading-tight line-clamp-2">{nome}</p>
        <div className="p-1 rounded-lg shrink-0" style={{ background: cor + "20", color: cor }}>
          <Package className="h-4 w-4" />
        </div>
      </div>
      <p className="text-lg font-bold leading-none text-board-text tabular-nums">
        {numero.toLocaleString("pt-BR")}
        <span className="text-[11px] font-medium text-board-muted ml-1">{rotulo}</span>
      </p>
      <p className="text-[11px] text-board-muted leading-snug">
        {detalhe}
        {aviso && <span className="text-amber-500"> · {aviso}</span>}
      </p>
    </div>
  );
}

const CANAL_CARDS: { key: CanalKey | "naoClassificado" | "descarbonizacao"; label: string; accent: string; bar: string; text: string }[] = [
  { key: "consumo", label: "Consumo (B2B)", accent: "border-l-blue-500", bar: "bg-blue-500", text: "text-blue-400" },
  { key: "revenda", label: "Revenda (PDV)", accent: "border-l-amber-400", bar: "bg-amber-400", text: "text-amber-500" },
  { key: "online", label: "On-line", accent: "border-l-green-500", bar: "bg-green-500", text: "text-green-500" },
  { key: "descarbonizacao", label: "Descarbonização", accent: "border-l-cyan-500", bar: "bg-cyan-500", text: "text-cyan-500" },
  { key: "naoClassificado", label: "Não classificado", accent: "border-l-slate-400", bar: "bg-slate-400", text: "text-board-muted" },
];
const META_CARDS: { key: CanalKey; title: string; color: string; note: string }[] = [
  { key: "consumo", title: "Consumo (B2B)", color: "#3b82f6", note: "Meta = real do mês anterior + 15%" },
  { key: "revenda", title: "Revenda (PDV)", color: "#f59e0b", note: "Meta R$75k/mês (NE 25k + SE 50k)" },
  { key: "online", title: "On-line", color: "#22c55e", note: "Meta R$27k/mês a partir de jul/26" },
];
const MODO_LABEL: Record<string, string> = {
  acum: "Total acumulado (tamanho da base)", ativos: "Ativos no mês (compraram no mês)", novos: "Novos no mês (1ª compra)",
};

// ═══════════════════════════════════════════════════════════════════════════
// Um gráfico de série mensal. Existe porque as três seções (faturado, vendas,
// ticket) passaram a ter QUATRO recortes cada — doze gráficos escritos à mão
// seriam doze lugares para divergir em cor, eixo e formatação.
// ═══════════════════════════════════════════════════════════════════════════
function SerieMensal({
  titulo, acumulado, cor, dados, campo, moeda = true,
}: {
  titulo: string; acumulado: string; cor: string;
  dados: Array<Record<string, unknown>>; campo: string; moeda?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-board-surface/40 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[10px] font-bold text-board-muted uppercase tracking-widest">{titulo}</p>
          <p className="text-xl font-bold leading-none tabular-nums mt-0.5" style={{ color: cor }}>{acumulado}</p>
        </div>
      </div>
      {/* ⚠️ A altura é FIXA e generosa de propósito. Com quatro gráficos numa
          linha os rótulos de valor se sobrepunham e o eixo pulava meses — um
          gráfico que esconde o próprio número não serve para nada. Por isso a
          grade é de DUAS colunas (ver abaixo) e a altura sobe junto: o espaço
          vertical é o que dá ar aos rótulos em cima das barras. */}
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={dados} margin={{ top: 26, right: 10, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
          {/* `interval={0}` obriga a mostrar TODOS os meses: deixar o Recharts
              decidir faz ele pular rótulo quando aperta, e mês faltando num
              eixo se lê como mês sem venda. */}
          <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} dy={4} interval={0} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false}
                 width={moeda ? 48 : 32} tickFormatter={moeda ? kAxis : undefined} />
          <Tooltip cursor={{ fill: "rgba(148,163,184,0.08)" }}
                   content={moeda ? <DarkTip fmt={brl} /> : <DarkTip unit=" vendas" />} />
          <Bar dataKey={campo} name={titulo} fill={`${cor}30`} stroke={cor} strokeWidth={1.4}
               radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={false}>
            <LabelList dataKey={campo} position="top"
                       formatter={(v: any) => (moeda ? (v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${Math.round(v)}`) : v)}
                       style={{ fontSize: 11, fill: cor, fontWeight: 700 }} />
          </Bar>
          {/* ⚠️ `tooltipType="none"`: a linha e a barra são o MESMO dataKey, e
              sem isto o tooltip mostrava o valor DUAS vezes, uma embaixo da
              outra — parecia que havia duas séries diferentes com o mesmo
              número. A linha é enfeite de leitura, não uma segunda medida. */}
          <Line type="monotoneX" dataKey={campo} name={titulo} tooltipType="none" stroke={cor} strokeWidth={2.2}
                dot={{ r: 2.5, fill: cor, stroke: "#fff", strokeWidth: 1.5 }} activeDot={{ r: 4.5 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function DashboardComercial() {
  const { canAdmin } = useAuth();
  const [filters, setFilters] = useState<DashFilters>(EMPTY_FILTERS);
  const [modoClientes, setModoClientes] = useState<"acum" | "ativos" | "novos">("acum");
  const [metasOpen, setMetasOpen] = useState(false);

  const vendedorId = filters.vendedor === "all" ? null : filters.vendedor;
  const { data, isLoading, error } = useDashComercial(vendedorId, 12, { from: filters.from, to: filters.to, segmento: filters.segmento });
  // ⚠️ Receita de SERVIÇO vem de OUTRA base (NFS-e Nacional), porque serviço não
  // gera NF-e e por isso NUNCA entrou em `carbo_vendas_metrica`. Medido em
  // 24/09: zero pedidos com item de serviço contando no Bling — ou seja, somar
  // as duas NÃO duplica nada. A conferência veio primeiro porque um total
  // inflado é plausível e ninguém desconfia de número que só cresce.
  const { data: servicos } = useServicosNfse({ from: filters.from, to: filters.to });
  const { data: canais } = useComercialCanais({ vendedorId, from: filters.from, to: filters.to });
  const year = canais?.year ?? new Date().getFullYear();
  const { data: canalMetas } = useCanalMetas(year);
  // Unidades vendidas por produto — o mesmo recorte de período do resto da tela.
  const { data: unidades, error: erroUnidades } = useUnidadesVendidas({ from: filters.from, to: filters.to });

  const canalSeries = useMemo(() => {
    const real = canais?.realByCanal;
    if (!real) return null;
    const metas = canalMetas ?? { consumo: {}, revenda: {}, online: {} };
    const build = (canal: CanalKey) =>
      Array.from({ length: 12 }, (_, i) => {
        const mes = i + 1;
        const stored = (metas as any)[canal]?.[mes];
        let meta: number | null = stored != null ? Number(stored) : null;
        if (meta == null && canal === "consumo") { const prev = real.consumo[mes - 1]; meta = mes > 1 && prev > 0 ? Math.round(prev * 1.15) : null; }
        return { mes: mesLbl(year, mes), real: real[canal][mes], meta };
      });
    return { consumo: build("consumo"), revenda: build("revenda"), online: build("online") };
  }, [canais, canalMetas, year]);

  // ⚠️ A descarbonização entra por `mesIso` (YYYY-MM), nunca pelo rótulo
  // "set/26". E mês do Bling sem nota de serviço vira ZERO, não `undefined`:
  // buraco na linha se lê como "não sei", e aqui a resposta é "nenhum cliente".
  const clientesChart = useMemo(
    () => {
      const porIso = new Map((servicos?.clientesPorMes ?? []).map((m) => [m.mes, m] as const));
      return (canais?.clientes ?? []).map((r: any) => {
        const sv = porIso.get(r.mesIso);
        return {
          mes: r.mes,
          b2b: r[`consumo_${modoClientes}`],
          pdv: r[`revenda_${modoClientes}`],
          online: r[`online_${modoClientes}`],
          descarb: sv ? sv[modoClientes === "acum" ? "acum" : modoClientes] : 0,
        };
      });
    },
    [canais, modoClientes, servicos?.clientesPorMes],
  );
  const pdvDelta = useMemo(() => {
    const n = clientesChart.length;
    if (n < 2) return null;
    const cur = Number(clientesChart[n - 1].pdv ?? 0), prev = Number(clientesChart[n - 2].pdv ?? 0);
    if (prev <= 0) return null;
    return { pct: ((cur - prev) / prev) * 100, cur, prev, curLabel: clientesChart[n - 1].mes, prevLabel: clientesChart[n - 2].mes };
  }, [clientesChart]);

  if (!canAdmin) return <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8"><RestrictedNotice /></main>;

  // ⚠️ `data.growth` deixou de ser lido aqui: o crescimento mês a mês passou a
  // ser calculado por ORIGEM, em `mom`, sobre a série que já soma o serviço.
  // O hook continua devolvendo `growth` — outras telas o usam.
  const k = data?.kpis, monthly = data?.monthly ?? [], seg = canais?.segmentacao;

  // ⚠️ Recorrência juntando as duas bases pelo DOCUMENTO, nunca pelo nome.
  // Casar por nome misturaria empresas diferentes e separaria a mesma — é a
  // lição já paga no cadastro de PDV ("Postos RCM (Afogados)" e "Posto RF
  // Afogados" são a MESMA loja; nomes parecidos costumam ser filiais
  // distintas). Cliente sem documento fica na própria chave e nunca se funde
  // com outro por acaso.
  // ⚠️ NÃO é `useMemo`, e isso não é preguiça: este cálculo fica DEPOIS do
  // `if (!canAdmin) return`, e hook depois de retorno antecipado muda a
  // contagem de hooks entre renders — React #310, tela branca. Foi o que
  // aconteceu ao introduzir este card. O custo de recalcular é percorrer dois
  // mapas de ~1.500 entradas, irrelevante por render.
  const topGeral = (() => {
    const soma = new Map<string, { nome: string; qtd: number }>();
    for (const mapa of [data?.porCliente, servicos?.porCliente]) {
      if (!mapa) continue;
      for (const [chave, v] of mapa) {
        const atual = soma.get(chave) ?? { nome: v.nome, qtd: 0 };
        atual.qtd += v.qtd;
        soma.set(chave, atual);
      }
    }
    let melhor = { nome: "—", qtd: 0 };
    for (const v of soma.values()) if (v.qtd > melhor.qtd) melhor = v;
    return melhor;
  })();

  // Total dividido pelo total — ver a nota no card.
  const ticketGeral = (() => {
    const valor = (data?.totalBRL ?? 0) + (servicos?.total ?? 0);
    const qtd = (data?.totalVendas ?? 0) + (servicos?.notas ?? 0);
    return qtd > 0 ? valor / qtd : 0;
  })();
  // ⚠️ A junção é pelo `mesIso` (YYYY-MM), nunca pelo rótulo "set/26". Casar
  // por rótulo é frágil de um jeito silencioso: bastaria alguém mudar a
  // abreviação para os dois lados deixarem de se encontrar, e o gráfico
  // mostraria a descarbonização ZERADA, sem erro nenhum.
  // ⚠️ IIFE, não `useMemo` — pela MESMA razão do `topGeral` logo acima: isto
  // fica depois do `if (!canAdmin) return`, e hook depois de retorno antecipado
  // muda a contagem entre renders (React #310, tela branca). Nem o `tsc` nem o
  // `npm run build` pegam isso; quem pega é abrir a tela com outro perfil.
  const serie = (() => {
    const porIso = new Map(
      (servicos?.porMes ?? []).map((m) => [m.mes, m] as const),
    );
    return monthly.map((m) => {
      const sv = porIso.get(m.mesIso);
      const descFat = sv?.descarbonizacao ?? 0;
      const descQtd = sv?.notas ?? 0;
      const totalFat = m.faturado + descFat + (sv?.outros ?? 0);
      const totalQtd = m.pedidos + descQtd;
      return {
        mes: m.mes,
        // Total
        totalFat, totalQtd,
        totalTicket: totalQtd > 0 ? totalFat / totalQtd : 0,
        // On-line
        onFat: m.faturadoOnline, onQtd: m.pedidosOnline,
        onTicket: m.pedidosOnline > 0 ? m.faturadoOnline / m.pedidosOnline : 0,
        // Equipe / balcão
        eqFat: m.faturadoEquipe, eqQtd: m.pedidosEquipe,
        eqTicket: m.pedidosEquipe > 0 ? m.faturadoEquipe / m.pedidosEquipe : 0,
        // Descarbonização
        dsFat: descFat, dsQtd: descQtd,
        dsTicket: descQtd > 0 ? descFat / descQtd : 0,
      };
    });
  })();

  // Crescimento mês a mês, por ORIGEM. ⚠️ Sem mês anterior não existe
  // crescimento — devolve `null` em vez de 0%, que se leria como "ficou igual".
  const mom = (() => {
    const n = serie.length;
    if (n < 2) return null;
    const cur = serie[n - 1], prev = serie[n - 2];
    const p = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : null);
    // ⚠️ O valor ANTERIOR viaja junto do percentual. Percentual sozinho engana
    // em base pequena — +300% sobre R$ 400 e +300% sobre R$ 400 mil têm a mesma
    // cara, e é a linha de referência que separa as duas.
    const par = (a: number, b: number, qa: number, qb: number) =>
      ({ valor: a, valorAnterior: b, pct: p(a, b), qtd: qa, qtdAnterior: qb, qtdPct: p(qa, qb) });
    return {
      curLabel: cur.mes, prevLabel: prev.mes,
      online: par(cur.onFat, prev.onFat, cur.onQtd, prev.onQtd),
      equipe: par(cur.eqFat, prev.eqFat, cur.eqQtd, prev.eqQtd),
      descarb: par(cur.dsFat, prev.dsFat, cur.dsQtd, prev.dsQtd),
      total: par(cur.totalFat, prev.totalFat, cur.totalQtd, prev.totalQtd),
    };
  })();

  // Crescimento Anual passa a somar o serviço. ⚠️ A meta NÃO muda: ela foi
  // configurada contra o faturamento de produto, e mexer nela aqui mudaria o
  // alvo de quem a definiu sem ninguém decidir isso.
  const annualGrowth = (() => {
    const porRotulo = new Map(serie.map((x) => [x.mes, x] as const));
    return (data?.annualGrowth ?? []).map((pt) => {
      const x = porRotulo.get(pt.label);
      const real = x ? x.totalFat : pt.real;
      return { ...pt, real: real && real > 0 ? real : null };
    });
  })();

  // ⚠️ Duas listas a partir da MESMA agregação. Um produto vendido nos dois
  // canais aparece nas duas, com o número de cada uma — é o que deixa comparar
  // "quanto saiu por fora" contra "quanto a equipe vendeu" sem somar unidades
  // diferentes.
  const unidadesOnline = (unidades?.produtos ?? [])
    .filter((p) => p.onPacks > 0)
    .sort((a, b) => b.onUnidades - a.onUnidades || b.onReceita - a.onReceita);
  const unidadesEquipe = (unidades?.produtos ?? [])
    .filter((p) => p.eqItens > 0)
    .sort((a, b) => b.eqItens - a.eqItens || b.eqReceita - a.eqReceita);

  // Sem filtro, o recorte é TODO o histórico — e dizer isso por escrito é o
  // que evita alguém ler um acumulado de um ano como se fosse do mês.
  const periodoLabel = (() => {
    const d = (s?: string) => (s ? new Date(`${s}T12:00:00`).toLocaleDateString("pt-BR") : null);
    const de = d(filters.from), ate = d(filters.to);
    if (de && ate) return `${de} a ${ate}`;
    if (de) return `de ${de} até hoje`;
    if (ate) return `até ${ate}`;
    return "todo o histórico";
  })();

  const hasData = (monthly.reduce((s, m) => s + m.pedidos, 0)) > 0;

  return (
    <main className="p-4 lg:p-6 board-fade-in">
      <div className="space-y-3 max-w-[1600px] mx-auto">
        {/* Falha de consulta tem de aparecer. Sem isto, um erro no banco vira
            um dashboard zerado — indistinguível de "não vendemos nada". */}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/[0.06] px-3 py-2.5 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
            <div>
              <p className="font-semibold text-destructive">Não foi possível carregar os dados comerciais</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {(error as { message?: string })?.message ?? "Erro desconhecido"}
              </p>
            </div>
          </div>
        )}

        {/* 1. Header + filtros */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <CarboPageHeader icon={TrendingUp} title="Dashboard — Comercial" description="Licenciados, pedidos e performance de vendas" />
          <div className="flex flex-col items-end gap-2 shrink-0">
            <ComercialTabs />
            <ComercialFilterBar filters={filters} onChange={setFilters} />
          </div>
        </div>

        {/* 2a. Faturamento por ORIGEM — as três fontes e a soma.
            ⚠️ São bases DIFERENTES: as duas primeiras vêm da NF-e do Bling
            (`carbo_vendas_metrica`), a terceira da NFS-e do portal nacional.
            Elas não se sobrepõem — é por isso que somar é legítimo aqui, e a
            medição que provou isso está no `useServicosNfse`. */}
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <KpiCard title="CarboZé on-line" value={fmtK(data?.totalOnline ?? 0)}
                   sub={`${data?.qtdOnline ?? 0} pedidos · marketplaces e loja própria`}
                   Icon={Globe} accent="border-l-blue-500" iconBg="bg-blue-500/10 text-blue-500" />
          <KpiCard title="CarboZé equipe / balcão" value={fmtK(data?.totalNaoOnline ?? 0)}
                   sub={`${data?.qtdNaoOnline ?? 0} pedidos · venda direta e revenda`}
                   Icon={ShoppingCart} accent="border-l-green-500" iconBg="bg-green-500/10 text-green-600" />
          <KpiCard title="Descarbonização" value={fmtK(servicos?.descarbonizacao ?? 0)}
                   sub={`${servicos?.notasDescarbonizacao ?? 0} notas · serviço CarboVapt${servicos?.outros ? ` · +${fmtK(servicos.outros)} em outros serviços` : ""}`}
                   Icon={Wrench} accent="border-l-cyan-500" iconBg="bg-cyan-500/10 text-cyan-500" />
          <KpiCard title="Faturamento total"
                   value={fmtK((data?.totalBRL ?? 0) + (servicos?.total ?? 0))}
                   sub={`${(data?.totalVendas ?? 0) + (servicos?.notas ?? 0)} vendas · produto + serviço`}
                   Icon={DollarSign} accent="border-l-amber-400" iconBg="bg-amber-400/10 text-amber-500" />
        </div>

        {/* ⚠️ A série de serviço COMEÇA em jan/2026 e o Bling vai até out/25.
            Sem dizer isso, os meses anteriores com zero de descarbonização se
            leem como "o serviço começou em janeiro" — e é ausência de DADO no
            portal, não ausência de serviço. */}
        {servicos && servicos.primeiroMes && (
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            A receita de serviço vem da NFS-e do Portal Nacional, que só tem notas emitidas
            a partir de <strong className="text-foreground">{servicos.primeiroMes}</strong>.
            Meses anteriores aparecem sem descarbonização por falta de dado no portal, não
            por ausência de serviço. {servicos.notas} nota(s) no período.
          </div>
        )}

        {/* 2b. KPIs */}
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {/* ⚠️ A unidade NÃO é a mesma nas duas bases: no Bling conta-se
              PEDIDO, na NFS-e conta-se NOTA de serviço. Somar só é honesto com
              a composição escrita embaixo — um "1551" sozinho esconderia que
              320 daquilo são documentos de outra natureza. */}
          <KpiCard title="Total de Vendas"
                   value={String((k?.totalVendas ?? 0) + (servicos?.notas ?? 0))}
                   sub={`${data?.qtdOnline ?? 0} on-line · ${data?.qtdNaoOnline ?? 0} equipe · ${servicos?.notas ?? 0} serviço`}
                   Icon={ShoppingCart} accent="border-l-green-500" iconBg="bg-green-500/10 text-green-600" />
          {/* O card "R$ Vendido (produto)" saiu: on-line e equipe já estão nos
              cards de ORIGEM acima, e quem quiser o produto sozinho soma os
              dois. Um número a menos que repete outros dois. */}
          {/* ⚠️ "Maior venda" olha as DUAS bases. Antes via só a NF-e do Bling,
              então uma descarbonização maior que qualquer pedido de produto
              ficava invisível — e o card afirmava um recorde que não era o
              recorde. */}
          <KpiCard title="Maior Venda"
                   value={fmtK(Math.max(k?.maiorVenda ?? 0, servicos?.maiorNota ?? 0))}
                   sub={(servicos?.maiorNota ?? 0) > (k?.maiorVenda ?? 0)
                     ? `${servicos?.maiorNotaCliente ?? "—"} · descarbonização`
                     : `${k?.maiorCliente ?? "—"} · produto`}
                   Icon={Trophy} accent="border-l-amber-400" iconBg="bg-amber-400/10 text-amber-500" />
          <KpiCard title="Top Recorrência" value={topGeral.nome}
                   sub={`${topGeral.qtd} operação(ões) · produto + serviço`}
                   Icon={Repeat2} accent="border-l-blue-400" iconBg="bg-blue-400/10 text-blue-500" />
          {/* ⚠️ O ticket GERAL não é a média das três médias — é o total
              dividido pelo total. Média de médias daria peso igual a um canal
              de 320 notas e a outro de 1.100 pedidos. */}
          <KpiCard title="Ticket Médio" value={fmtK(ticketGeral)}
                   sub={`on-line ${fmtK(data?.ticketOnline ?? 0)} · equipe ${fmtK(data?.ticketNaoOnline ?? 0)} · descarb. ${fmtK(servicos?.ticketMedio ?? 0)}`}
                   Icon={TrendingUp} accent="border-l-violet-400" iconBg="bg-violet-400/10 text-violet-500" />
        </div>

        {/* 3. Crescimento mês a mês, UM CARD POR ORIGEM.
            ⚠️ O bloco "Último Mês vs Janeiro" foi ABSORVIDO, não perdido: os
            dois passariam a mostrar a mesma comparação, e duas caixas dizendo
            o mesmo número fazem quem lê procurar a diferença que não existe.
            A ordem é a MESMA dos gráficos abaixo (total · on-line · equipe ·
            descarbonização) — ordem diferente entre blocos do mesmo painel é
            o que faz comparar a caixa errada. */}
        {mom && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 items-start">
            {([
              { k: "total",   rotulo: "Total",            borda: "border-amber-400/20", barra: "bg-amber-400", chip: "bg-amber-400/10 text-amber-500", un: "vendas"  },
              { k: "online",  rotulo: "On-line",          borda: "border-blue-500/20",  barra: "bg-blue-500",  chip: "bg-blue-500/10 text-blue-500",   un: "pedidos" },
              { k: "equipe",  rotulo: "Equipe / balcão",  borda: "border-green-500/20", barra: "bg-green-500", chip: "bg-green-500/10 text-green-600", un: "pedidos" },
              { k: "descarb", rotulo: "Descarbonização",  borda: "border-cyan-500/20",  barra: "bg-cyan-500",  chip: "bg-cyan-500/10 text-cyan-500",   un: "notas"   },
            ] as const).map((c) => {
              const d = mom[c.k];
              return (
                <div key={c.k} className={`rounded-xl border overflow-hidden bg-board-surface ${c.borda}`}>
                  <div className={`h-1 w-full ${c.barra}`} />
                  <div className="px-4 pt-3 pb-2 border-b border-border/50">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${c.chip}`}>{c.rotulo}</span>
                    <p className="text-[11px] text-board-muted mt-0.5 font-medium">{mom.curLabel} vs {mom.prevLabel}</p>
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-border/50">
                    <GrowthSub label="Faturamento" pct={d.pct} value={fmtK(d.valor)}
                               refLine={`${mom.prevLabel}: ${fmtK(d.valorAnterior)}`} />
                    <GrowthSub label="Volume" pct={d.qtdPct} value={`${d.qtd} ${c.un}`}
                               refLine={`${mom.prevLabel}: ${d.qtdAnterior} ${c.un}`} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 4. Evolução Mensal */}
        <div className="rounded-2xl border border-border bg-board-surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-6 py-3">
            <div>
              <h2 className="text-base font-bold text-board-text flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /> Evolução Mensal de Vendas</h2>
              <p className="text-xs text-board-muted mt-0.5">Via Bling · <span className="font-semibold text-board-text">{k?.totalVendas ?? 0} pedidos</span> · <span className="font-semibold text-green-500">{brl(k?.totalBRL ?? 0)} acumulado</span></p>
            </div>
            <Link to="/comercial/dados/pedidos" className="text-xs font-semibold text-primary hover:underline shrink-0">Ver pedidos →</Link>
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center h-72"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : !hasData ? (
            <div className="flex items-center justify-center h-72 text-sm text-board-muted">Nenhum dado encontrado para o período selecionado.</div>
          ) : (
            <div className="px-4 pt-4 pb-4 space-y-4">
              {/* ⚠️ QUATRO recortes, e a ordem é a mesma nos três blocos:
                  Total · On-line · Equipe · Descarbonização. Ordem diferente
                  entre blocos faria a pessoa comparar o gráfico errado. */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <SerieMensal titulo="Faturado · TOTAL" acumulado={fmtK((k?.totalBRL ?? 0) + (servicos?.total ?? 0))}
                             cor="#1a7a4a" dados={serie} campo="totalFat" />
                <SerieMensal titulo="Faturado · on-line" acumulado={fmtK(data?.totalOnline ?? 0)}
                             cor="#3b82f6" dados={serie} campo="onFat" />
                <SerieMensal titulo="Faturado · equipe/balcão" acumulado={fmtK(data?.totalNaoOnline ?? 0)}
                             cor="#22c55e" dados={serie} campo="eqFat" />
                <SerieMensal titulo="Faturado · descarbonização" acumulado={fmtK(servicos?.descarbonizacao ?? 0)}
                             cor="#06b6d4" dados={serie} campo="dsFat" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <SerieMensal titulo="Vendas · TOTAL" moeda={false}
                             acumulado={String((k?.totalVendas ?? 0) + (servicos?.notas ?? 0))}
                             cor="#3b6ea5" dados={serie} campo="totalQtd" />
                <SerieMensal titulo="Vendas · on-line" moeda={false} acumulado={String(data?.qtdOnline ?? 0)}
                             cor="#3b82f6" dados={serie} campo="onQtd" />
                <SerieMensal titulo="Vendas · equipe/balcão" moeda={false} acumulado={String(data?.qtdNaoOnline ?? 0)}
                             cor="#22c55e" dados={serie} campo="eqQtd" />
                <SerieMensal titulo="Vendas · descarbonização" moeda={false}
                             acumulado={String(servicos?.notasDescarbonizacao ?? 0)}
                             cor="#06b6d4" dados={serie} campo="dsQtd" />
              </div>
            </div>
          )}
        </div>

        {/* 5. Crescimento Anual + Ticket
            ⚠️ Empilhados, não lado a lado. O Ticket virou QUATRO gráficos, e
            meia largura dividida em dois dava um quarto de tela a cada um —
            rótulo em cima de rótulo. Painel com vários gráficos ocupa a linha
            inteira; painel de um gráfico só é que pode dividir. */}
        <div className="space-y-3">
          <div className="rounded-2xl border border-border bg-board-surface overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-6 py-3">
              <div>
                <h2 className="text-base font-bold text-board-text flex items-center gap-2"><TrendingUp className="h-4 w-4 text-orange-400" /> Crescimento Anual</h2>
                <p className="text-xs text-board-muted mt-0.5">Real (produto + serviço) vs <span className="font-semibold text-orange-400">meta configurada</span> · {year}</p>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-board-muted">
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-emerald-500/70" /> Real</span>
                <span className="flex items-center gap-1"><span className="inline-block w-5 border-t-2 border-dashed border-orange-400" /> Meta</span>
              </div>
            </div>
            <div className="px-4 pt-4 pb-4">
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={annualGrowth} margin={{ top: 24, right: 10, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} dy={4} interval={0} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={48} tickFormatter={kAxis} />
                  <Tooltip content={<DarkTip fmt={fmtK} />} />
                  <Bar dataKey="real" name="Real" fill="rgba(16,185,129,0.55)" stroke="#10b981" strokeWidth={1.5} radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false}>
                    <LabelList dataKey="real" position="top" formatter={(v: any) => (v != null ? fmtK(v) : "")} style={{ fontSize: 11, fill: "#6ee7b7", fontWeight: 700 }} />
                  </Bar>
                  <Line dataKey="meta" name="Meta" type="monotone" stroke="#fb923c" strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-board-surface overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-6 py-3">
              <div>
                <h2 className="text-base font-bold text-board-text flex items-center gap-2"><TrendingUp className="h-4 w-4 text-violet-500" /> Evolução do Ticket Médio</h2>
                <p className="text-xs text-board-muted mt-0.5">Valor médio por pedido mês a mês · <span className="font-semibold text-violet-500">{fmtK(k?.ticketMedio ?? 0)} média geral</span></p>
              </div>
            </div>
            <div className="px-4 pt-4 pb-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* ⚠️ O ticket do TOTAL é o faturamento total dividido pelas
                  vendas totais — não a média das outras três. Média de médias
                  daria o mesmo peso a um canal de 320 notas e a outro de 1.100
                  pedidos. */}
              <SerieMensal titulo="Ticket · TOTAL" acumulado={fmtK(ticketGeral)}
                           cor="#8b5cf6" dados={serie} campo="totalTicket" />
              <SerieMensal titulo="Ticket · on-line" acumulado={fmtK(data?.ticketOnline ?? 0)}
                           cor="#3b82f6" dados={serie} campo="onTicket" />
              <SerieMensal titulo="Ticket · equipe/balcão" acumulado={fmtK(data?.ticketNaoOnline ?? 0)}
                           cor="#22c55e" dados={serie} campo="eqTicket" />
              <SerieMensal titulo="Ticket · descarbonização" acumulado={fmtK(servicos?.ticketMedio ?? 0)}
                           cor="#06b6d4" dados={serie} campo="dsTicket" />
            </div>
          </div>
        </div>

        {/* 6. Divider */}
        <div className="flex items-center gap-2 pt-2">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs font-semibold uppercase tracking-wider text-board-muted">Análise por Canal</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* 7. Vendas por canal + Clientes por canal */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
          <div className="rounded-2xl border border-border bg-board-surface overflow-hidden">
            <div className="border-b border-border px-6 py-3">
              <h2 className="text-base font-bold text-board-text flex items-center gap-2"><BarChart3 className="h-4 w-4 text-blue-400" /> Vendas por Canal</h2>
              <p className="text-xs text-board-muted mt-0.5">Consumo · Revenda · On-line · Descarbonização (NFS-e) · classifique cada pedido em <Link to="/comercial/dados/pedidos" className="font-semibold text-primary hover:underline">Pedidos</Link></p>
            </div>
            {/* ⚠️ LINHAS, não azulejos 2×3. Cinco canais em duas colunas davam
                três fileiras com a última pela metade — altura de painel de
                gráfico para cinco números. Em linha, o canal, o valor e a
                participação ficam alinhados em COLUNA, que é a leitura que
                essa tela pede: comparar cinco valores entre si. */}
            <div className="divide-y divide-border/50">
              {/* ⚠️ O percentual é sobre o total COM a descarbonização. Enquanto
                  o denominador era só o Bling, os quatro canais somavam 100% e
                  o serviço ficava de fora — acrescentar o card sem mexer na
                  base faria a tela exibir cinco fatias somando ~160%. */}
              {seg && CANAL_CARDS.map((c) => {
                const b = c.key === "descarbonizacao"
                  ? { qtd: servicos?.notas ?? 0, brl: servicos?.total ?? 0 }
                  : (seg as any)[c.key] as { qtd: number; brl: number };
                const baseTotal = seg.totalBRL + (servicos?.total ?? 0);
                const p = baseTotal > 0 ? (b.brl / baseTotal) * 100 : 0;
                return (
                  <div key={c.key} className={`flex items-center gap-3 border-l-4 ${c.accent} px-4 py-2.5`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-board-muted uppercase tracking-wider truncate">{c.label}</p>
                      {/* A barra fica sob o rótulo, fina: ela é comparação
                          visual, não um segundo número. */}
                      <div className="mt-1.5 h-1 w-full rounded-full bg-muted overflow-hidden">
                        <div className={`h-full ${c.bar} rounded-full`} style={{ width: `${p}%` }} />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-board-text tabular-nums leading-none">{fmtK(b.brl)}</p>
                      <p className="mt-0.5 text-[11px] text-board-muted tabular-nums">
                        {b.qtd} {c.key === "descarbonizacao" ? "nota(s)" : "pedido(s)"}
                      </p>
                    </div>
                    <span className={`w-10 text-right text-sm font-bold tabular-nums shrink-0 ${c.text}`}>{p.toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-board-surface overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-6 py-3">
              <div>
                <h2 className="text-base font-bold text-board-text flex items-center gap-2"><Repeat2 className="h-4 w-4 text-blue-400" /> Crescimento de Clientes por Canal</h2>
                {/* Dito na tela: a linha PDV sai do CADASTRO de pontos, as
                    outras duas saem de pedido. São perguntas diferentes e
                    misturá-las foi o que fez o gráfico mostrar 110 PDVs
                    existindo 73. */}
                <p className="text-xs text-board-muted mt-0.5">
                  {MODO_LABEL[modoClientes]} — B2B, On-line e Descarbonização por cliente único (CNPJ/CPF); PDV pelo cadastro de pontos
                </p>
                {pdvDelta && (
                  <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-amber-400/10 px-2 py-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-500">PDV {pdvDelta.curLabel} vs {pdvDelta.prevLabel}</span>
                    <span className={`flex items-center gap-0.5 text-xs font-bold ${pdvDelta.pct >= 0 ? "text-green-500" : "text-red-400"}`}>
                      {pdvDelta.pct >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}{pdvDelta.pct >= 0 ? "+" : ""}{pdvDelta.pct.toFixed(1)}%
                    </span>
                    <span className="text-[10px] text-board-muted">({pdvDelta.prev} → {pdvDelta.cur})</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <div className="inline-flex rounded-lg border border-border overflow-hidden text-[11px]">
                  {([["acum", "Acumulado"], ["ativos", "Ativos/mês"], ["novos", "Novos/mês"]] as const).map(([k2, l]) => (
                    <button key={k2} onClick={() => setModoClientes(k2)} className={`px-2.5 py-1 font-medium transition-colors ${modoClientes === k2 ? "bg-primary text-primary-foreground" : "text-board-muted hover:bg-muted/50"}`}>{l}</button>
                  ))}
                </div>
                <div className="hidden sm:flex items-center gap-3 text-[10px] text-board-muted">
                  <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2" style={{ borderColor: "#3b82f6" }} /> B2B (Consumo)</span>
                  <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2" style={{ borderColor: "#f59e0b" }} /> PDV (Revenda)</span>
                  <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2" style={{ borderColor: "#22c55e" }} /> On-line</span>
                  <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2" style={{ borderColor: "#06b6d4" }} /> Descarbonização</span>
                </div>
              </div>
            </div>
            <div className="px-4 pt-4 pb-4">
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={clientesChart} margin={{ top: 22, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} dy={4} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip cursor={{ stroke: "rgba(148,163,184,0.2)" }} content={<DarkTip unit=" clientes" />} />
                  <Line type="monotone" dataKey="b2b" name="B2B (Consumo)" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3, fill: "#3b82f6", stroke: "#fff", strokeWidth: 1.5 }} activeDot={{ r: 5 }} isAnimationActive={false}>
                    <LabelList dataKey="b2b" position="top" style={{ fontSize: 10, fill: "#60a5fa", fontWeight: 700 }} />
                  </Line>
                  <Line type="monotone" dataKey="pdv" name="PDV (Revenda)" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3, fill: "#f59e0b", stroke: "#fff", strokeWidth: 1.5 }} activeDot={{ r: 5 }} isAnimationActive={false}>
                    <LabelList dataKey="pdv" position="bottom" style={{ fontSize: 10, fill: "#fbbf24", fontWeight: 700 }} />
                  </Line>
                  <Line type="monotone" dataKey="online" name="On-line" stroke="#22c55e" strokeWidth={2} strokeDasharray="4 3" dot={{ r: 2.5, fill: "#22c55e" }} isAnimationActive={false} />
                  {/* Descarbonização: cliente único por CNPJ/CPF do TOMADOR da
                      NFS-e — a mesma pergunta das duas primeiras linhas, feita
                      na outra base. A série começa em jan/26 porque é de lá que
                      o portal nacional entrega as emitidas. */}
                  <Line type="monotone" dataKey="descarb" name="Descarbonização" stroke="#06b6d4" strokeWidth={2} dot={{ r: 2.5, fill: "#06b6d4" }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* 8. Metas por canal */}
        <div className="rounded-2xl border border-border bg-board-surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-6 py-3">
            <div>
              <h2 className="text-base font-bold text-board-text flex items-center gap-2"><BarChart3 className="h-4 w-4 text-blue-400" /> Metas por Canal · {year}</h2>
              <p className="text-xs text-board-muted mt-0.5">Real (barras) vs meta (linha) de cada canal · a meta geral está na curva acima</p>
            </div>
            <button onClick={() => setMetasOpen(true)} className="text-xs font-semibold text-primary hover:underline shrink-0 flex items-center gap-1"><Pencil className="h-3.5 w-3.5" /> Editar metas</button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4">
            {META_CARDS.map((c) => (
              <div key={c.key} className="rounded-xl border border-border bg-board-surface/40 p-3">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-sm font-semibold text-board-text">{c.title}</span>
                  <div className="flex items-center gap-2 text-[9px] text-board-muted">
                    <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: c.color }} />Real</span>
                    <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2 border-dashed border-orange-400" />Meta</span>
                  </div>
                </div>
                <p className="text-[10px] text-board-muted mb-1.5">{c.note}</p>
                <ResponsiveContainer width="100%" height={160}>
                  <ComposedChart data={canalSeries?.[c.key] ?? []} margin={{ top: 16, right: 6, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} interval={1} />
                    <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={34} tickFormatter={kAxis} />
                    <Tooltip content={<DarkTip fmt={fmtK} />} />
                    <Bar dataKey="real" name="Real" fill={c.color} fillOpacity={0.75} radius={[3, 3, 0, 0]} maxBarSize={26} isAnimationActive={false} />
                    <Line dataKey="meta" name="Meta" type="monotone" stroke="#fb923c" strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ))}
          </div>
        </div>

        {/* 8.5 Unidades vendidas — DUAS seções separadas, on-line e equipe.
            ⚠️ Elas não se somam num número só: o on-line conta PACKS (o que a
            plataforma anunciou) e a equipe conta ITENS DO CATÁLOGO. O kit de
            sachês é o caso — 1 pack entrega 10 sachês e 1 item de catálogo
            TAMBÉM é o kit de 10. Um total único diria 2 onde foram 20. */}
        <div className="flex items-center gap-2 pt-2">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs font-semibold uppercase tracking-wider text-board-muted">Unidades Vendidas</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* ⚠️ O PERÍODO fica escrito na tela. "De quando são esses números" não
            pode depender de lembrar qual filtro está aplicado no topo — e o
            padrão aqui é o histórico INTEIRO, que é justamente o que ninguém
            adivinha olhando um total. A régua também: só pedido que conta
            métrica, ou seja, com NF válida. */}
        <p className="-mt-1 text-xs text-board-muted">
          Período: <span className="font-semibold text-board-text">{periodoLabel}</span>
          {" · "}só pedidos que contam métrica (com NF válida) · bonificação incluída · insumo e serviço fora
        </p>
        {/* ⚠️ A COBERTURA fica na tela, ao lado do número. "Posso confiar
            nisto?" não pode ser uma investigação de meia hora cada vez que
            alguém olha — e um total sem cobertura ao lado é a doença do
            relatório que só sabe concordar consigo mesmo.
            O denominador exclui cancelado, orçamento e bonificação de
            propósito: eles ficam de fora CORRETAMENTE, e contá-los faria a
            cobertura acusar problema sempre — número que sempre acusa ensina
            a ser ignorado. */}
        {unidades?.cobertura != null && (
          <p className={`-mt-2 text-[11px] ${unidades.cobertura >= 95 ? "text-board-muted" : "text-amber-500"}`}>
            Cobertura: <span className="font-semibold">{unidades.cobertura.toFixed(1)}%</span> do valor que deveria contar
            {unidades.semNotaPedidos > 0
              ? ` · faltam ${unidades.semNotaPedidos} pedido(s) sem nota válida (${fmtK(unidades.semNotaValor)}) — venda real, ainda sem NF`
              : " · nenhuma venda sem nota válida"}
            {/* ⚠️ Dito à parte, e nunca somado ao buraco: entrega programada
                para o futuro não é venda que faltou, é venda que ainda não
                aconteceu. Misturar as duas faria a cobertura acusar um
                problema que não existe. */}
            {unidades.agendadosPedidos > 0 && (
              <span className="text-board-muted">
                {" · "}fora da conta: {unidades.agendadosPedidos} entrega(s) agendada(s) para datas futuras ({fmtK(unidades.agendadosValor)})
              </span>
            )}
          </p>
        )}
        {/* ⚠️ Correção de dado NUNCA é silenciosa. Sem esta linha o painel
            mostraria um número diferente do Bling e ninguém saberia por quê —
            e a correção de verdade é no cadastro de origem, não aqui. */}
        {!!unidades?.linhasCorrigidas && (
          <p className="-mt-2 text-[11px] text-amber-500">
            {unidades.linhasCorrigidas} linha(s) com quantidade deslocada em duas casas no cadastro antigo do Bling
            (preço abaixo de R$ 1,00 e quantidade múltipla de 100) foram lidas ÷100. O total em R$ da linha não muda —
            só o par quantidade × preço estava trocado.
          </p>
        )}

        {erroUnidades && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/[0.06] px-3 py-2.5 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
            <p className="text-xs text-board-muted">Não foi possível carregar as unidades: {(erroUnidades as { message?: string })?.message ?? "erro desconhecido"}</p>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
          {/* ── On-line ───────────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-border bg-board-surface overflow-hidden">
            <div className="border-b border-border px-6 py-3">
              <h2 className="text-base font-bold text-board-text flex items-center gap-2"><Globe className="h-4 w-4 text-blue-400" /> Unidades · On-line</h2>
              <p className="text-xs text-board-muted mt-0.5">
                <span className="font-semibold text-blue-500">{fmtNum(unidades?.onUnidades ?? 0)} unidades</span> ao cliente · {fmtNum(unidades?.onPacks ?? 0)} packs · {fmtK(unidades?.onReceita ?? 0)}
              </p>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 p-3">
              {(unidadesOnline ?? []).map((p) => (
                <UnidadeCard key={p.key} nome={p.nome} codigo={p.productCode} mapeado={p.mapeado}
                             numero={p.onPacks} rotulo="packs"
                             detalhe={`${pctDe(p.onPacks, unidades?.onPacks ?? 0)} dos packs · ${fmtNum(p.onUnidades)} un. · ${fmtK(p.onReceita)}`}
                             aviso={!p.mapeado ? "sem mapa, é o mínimo" : null} />
              ))}
              {unidades && unidadesOnline.length === 0 && (
                <p className="col-span-full py-6 text-center text-xs text-board-muted">Nenhuma venda on-line no período.</p>
              )}
            </div>
          </div>

          {/* ── Equipe / balcão ───────────────────────────────────────────── */}
          <div className="rounded-2xl border border-border bg-board-surface overflow-hidden">
            <div className="border-b border-border px-6 py-3">
              <h2 className="text-base font-bold text-board-text flex items-center gap-2"><ShoppingCart className="h-4 w-4 text-green-500" /> Unidades · Equipe / balcão</h2>
              {/* ⚠️ O número grande da equipe é o ITEM DO CATÁLOGO, e o rótulo
                  diz isso. Chamá-lo de "unidade" faria o kit de sachês valer 1
                  ao lado de um frasco que também vale 1 — o mesmo erro que
                  somar packs com itens. */}
              <p className="text-xs text-board-muted mt-0.5">
                <span className="font-semibold text-green-500">{fmtNum(unidades?.eqItens ?? 0)} itens</span> do catálogo · venda direta e revenda · {fmtK(unidades?.eqReceita ?? 0)}
              </p>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 p-3">
              {(unidadesEquipe ?? []).map((p) => (
                <UnidadeCard key={p.key} nome={p.nome} codigo={p.productCode} mapeado
                             numero={p.eqItens} rotulo="itens"
                             detalhe={`${pctDe(p.eqItens, unidades?.eqItens ?? 0)} dos itens · ${p.eqUnidades != null && p.eqUnidades !== p.eqItens ? `${fmtNum(p.eqUnidades)} un. · ` : ""}${fmtK(p.eqReceita)}`}
                             aviso={p.eqBonificadas > 0 ? `inclui ${fmtNum(p.eqBonificadas)} bonif.` : null} />
              ))}
              {unidades && unidadesEquipe.length === 0 && (
                <p className="col-span-full py-6 text-center text-xs text-board-muted">Nenhuma venda da equipe no período.</p>
              )}
            </div>
          </div>
        </div>

        {/* 9. Footer */}
        <div className="flex items-center justify-end gap-4 pb-1">
          <Link to="/comercial/dados/pedidos" className="text-xs text-board-muted hover:text-primary transition-colors flex items-center gap-1">Ver pedidos detalhados →</Link>
        </div>
      </div>

      <CanalMetasDialog open={metasOpen} onOpenChange={setMetasOpen} ano={year} />
    </main>
  );
}
