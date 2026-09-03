import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AreaChart, Area, BarChart, Bar, Cell,
  PieChart, Pie,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  ShoppingCart, Package, TrendingUp, XCircle, Clock,
  CheckCircle2, Star, Boxes, AlertCircle, BarChart3, Calendar,
  Percent, Wallet, Receipt, Trophy, Hourglass, Pencil, Check, History,
} from "lucide-react";
import {
  useDashEcommerce, useEcommerceComparativo, useEcommerceRawCheck, useCommissionRates,
  useEcommerceHistoricoMensal,
  type EcommercePlatform, type EcommercePeriod, type RawCheckMetrics, type EcommerceMetrics,
  type ComparativoMetrics,
  type ProdutoVendido,
  type EcommerceCustom,
  MINUTOS_ATE_ALERTAR,
} from "@/hooks/useDashEcommerce";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Platform config
// ─────────────────────────────────────────────────────────────────────────────

interface PlatformConfig {
  id: EcommercePlatform;
  label: string;
  color: string;
  gradient: string;
  textClass: string;
  bgClass: string;
  borderClass: string;
  emoji: string;
  disabled?: boolean;   // plataforma ainda não usada — aparece cinza, sem clique
}

const PLATFORMS: PlatformConfig[] = [
  {
    id: "mercadolivre", label: "Mercado Livre",
    color: "#FFD700", gradient: "from-yellow-500 to-yellow-400",
    textClass: "text-yellow-600 dark:text-yellow-300",
    bgClass: "bg-yellow-500/10", borderClass: "border-yellow-500/50",
    emoji: "🛒",
  },
  {
    id: "amazon", label: "Amazon",
    color: "#FF9900", gradient: "from-orange-500 to-amber-400",
    textClass: "text-orange-600 dark:text-orange-300",
    bgClass: "bg-orange-500/10", borderClass: "border-orange-500/50",
    emoji: "📦",
  },
  {
    id: "nuvemshop", label: "Nuvemshop",
    color: "#2D7FF9", gradient: "from-blue-500 to-sky-400",
    textClass: "text-blue-600 dark:text-blue-300",
    bgClass: "bg-blue-500/10", borderClass: "border-blue-500/50",
    emoji: "🏪",
  },
  {
    // PayT — checkout próprio, vende os MESMOS produtos da loja própria.
    // ⚠️ Nasce ATIVA (sem `disabled`), ao contrário do TikTok Shop que ocupava
    // este lugar e nunca foi integrado.
    // Cor escolhida por MEDIDA, não por gosto: verde-azulado (teal) é o único
    // ponto do círculo cromático livre entre o amarelo do ML (#FFD700), o
    // laranja da Amazon (#FF9900), o azul da Nuvemshop (#2D7FF9) e o
    // laranja-avermelhado da Shopee (#EE4D2D).
    id: "payt", label: "PayT",
    color: "#14B8A6", gradient: "from-teal-500 to-emerald-400",
    textClass: "text-teal-600 dark:text-teal-300",
    bgClass: "bg-teal-500/10", borderClass: "border-teal-500/50",
    emoji: "💳",
  },
  {
    id: "shopee", label: "Shopee",
    color: "#EE4D2D", gradient: "from-red-500 to-orange-400",
    textClass: "text-red-600 dark:text-red-300",
    bgClass: "bg-red-500/10", borderClass: "border-red-500/50",
    emoji: "🧡",
  },
];

// Plataformas realmente em uso (para comparativo/histórico e seleção)
const ACTIVE_PLATFORMS = PLATFORMS.filter(p => !p.disabled);

/** "3h" em vez de "187 min": quem lê o selo quer a ordem de grandeza. */
function textoDeAtraso(min: number): string {
  if (min < 90) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 36) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

const PMAP = Object.fromEntries(PLATFORMS.map(p => [p.id, p])) as Record<EcommercePlatform, PlatformConfig>;


const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtNum = (v: number) => v.toLocaleString("pt-BR");
const pct = (a: number, b: number) => b > 0 ? ((a / b) * 100).toFixed(1) + "%" : "0%";

const PERIOD_OPTIONS: { value: EcommercePeriod; label: string }[] = [
  { value: "today",     label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "7d",        label: "Últimos 7 dias" },
  { value: "30d",       label: "Últimos 30 dias" },
  { value: "month",     label: "Este mês" },
  { value: "custom",    label: "Por período…" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Metric card — custom for this page
// ─────────────────────────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, icon, accent,
}: {
  label: string; value: string; sub?: string;
  icon: React.ReactNode; accent: string;
}) {
  return (
    <div
      className="rounded-xl border bg-card p-3 flex flex-col gap-1 transition-all hover:-translate-y-0.5 hover:shadow-md"
      style={{ borderLeftColor: accent, borderLeftWidth: 3 }}
    >
      <div className="flex items-start justify-between gap-1.5">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide leading-tight">{label}</p>
        <div className="p-1 rounded-lg shrink-0" style={{ background: accent + "20" }}>
          <div style={{ color: accent }}>{icon}</div>
        </div>
      </div>
      <p className="text-lg font-bold leading-none truncate" title={value}>{value}</p>
      {/* ⚠️ `line-clamp-2` + `title`: a legenda encolhe mas NÃO se perde. Ela
          carrega o que o número significa ("unidades entregues ao cliente"), e
          rótulo que nomeia a coisa errada ensina uma leitura falsa do painel —
          foi por isso que "frascos" saiu daqui. Cortar o texto é aceitável;
          cortar o sentido, não. */}
      {sub && (
        <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2" title={sub}>
          {sub}
        </p>
      )}
    </div>
  );
}

/**
 * Um produto, um card — quanto o CLIENTE levou daquele item.
 *
 * ⚠️ Os cards saem do array `porProduto`, um por produto do cadastro: NÃO há
 * "card do sachê" e "card do 100 ml" escritos aqui. Produto novo entra pelo
 * cadastro de SKU e ganha card sozinho; uma dupla fixa o deixaria de fora em
 * silêncio.
 *
 * ⚠️ O número grande é `display_units_per_pack` — o que o cliente recebeu (kit
 * de sachês = 10 sachês). NÃO é o que sai da prateleira, onde o mesmo kit vale
 * 1. Ver `lib/skuUnidades.ts`.
 */
function ProdutoCard({ p, totalUnidades }: { p: ProdutoVendido; totalUnidades: number }) {
  // Sem mapeamento o multiplicador é desconhecido e o número é um PISO. O card
  // diz isso na cara — some-lo aos outros apagaria a pista de que falta cadastro.
  const accent = p.mapeado ? "#a78bfa" : "#f59e0b";
  return (
    <div
      className="rounded-xl border bg-card p-3 flex flex-col gap-1 transition-all hover:-translate-y-0.5 hover:shadow-md"
      style={{ borderLeftColor: accent, borderLeftWidth: 3 }}
      title={`${p.nome}${p.productCode ? ` · ${p.productCode}` : ""}${p.skus.length ? ` · SKU ${p.skus.join(", ")}` : ""}\n${fmtNum(p.packs)} packs vendidos → ${fmtNum(p.unidades)} unidades ao cliente\nFaturamento ${fmtBRL(p.receita)}`}
    >
      <div className="flex items-start justify-between gap-1.5">
        <p className="text-[11px] font-medium text-muted-foreground leading-tight line-clamp-2">
          {p.nome}
        </p>
        <div className="p-1 rounded-lg shrink-0" style={{ background: accent + "20" }}>
          <div style={{ color: accent }}>
            {p.mapeado ? <Package className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          </div>
        </div>
      </div>
      <p className="text-lg font-bold leading-none">{fmtNum(p.unidades)}</p>
      <p className="text-[11px] text-muted-foreground leading-snug">
        {fmtNum(p.packs)} packs · {pct(p.unidades, totalUnidades)} · {fmtBRL(p.receita)}
        {!p.mapeado && (
          <span className="text-amber-600 dark:text-amber-400"> · sem mapa, é o mínimo</span>
        )}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Funil de status — o que aconteceu com os pedidos que chegaram
//
// ⚠️ Existe porque a tela mostrava "18 pedidos" no cartão principal enquanto a
// receita ao lado só contava os 16 que viraram venda. Quem bate o olho lê 18 e
// vai embora. Os dois números são certos; o que faltava era o lugar onde eles
// se encontram.
//
// A regra de leitura é a soma fechar na vertical: vendas + aguardando pagamento
// + cancelados = recebidos, e o trio de dentro (aguardando envio, em transporte,
// entregues) = vendas. Isso diz sozinho, sem legenda, que a receita vem dos três
// de dentro — hoje isso só está escrito em `SALE_STATUSES`, dentro do hook.
//
// ⚠️ Cada valor em R$ aparece UMA vez, na etapa dele. Antes "A Receber" e o
// rodapé de "Pedidos Pendentes" imprimiam o mesmo `pendingRevenue` em dois
// cartões diferentes, e quem via procurava a diferença que não existe.
// ─────────────────────────────────────────────────────────────────────────────

function FunilEtapa({
  label, valor, dinheiro, cor, forte, recuada,
}: {
  label: string; valor: number; dinheiro?: string;
  cor: string; forte?: boolean; recuada?: boolean;
}) {
  return (
    <div className={cn("flex items-baseline gap-2 py-1", recuada && "pl-4")}>
      <span className="h-2 w-2 rounded-full shrink-0 self-center" style={{ background: cor }} />
      <span className={cn("text-xs", forte ? "font-semibold" : "text-muted-foreground")}>{label}</span>
      <span className="flex-1 border-b border-dashed border-border/60 mx-1" />
      <span className={cn("tabular-nums", forte ? "text-sm font-bold" : "text-sm")}>{fmtNum(valor)}</span>
      {dinheiro && (
        <span className="text-xs text-muted-foreground tabular-nums w-24 text-right shrink-0">{dinheiro}</span>
      )}
    </div>
  );
}

function FunilStatus({ m, cor }: { m: EcommerceMetrics; cor: string }) {
  return (
    <Card className="rounded-2xl border-0 shadow-sm">
      <CardHeader className="pt-5 px-5 pb-2 flex flex-row items-center gap-2">
        <ShoppingCart className="h-4 w-4 text-muted-foreground" />
        <CardTitle className="text-sm font-semibold">O que aconteceu com os pedidos</CardTitle>
        <span className="ml-auto text-xs text-muted-foreground">
          {fmtNum(m.totalOrders)} recebidos no período
        </span>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <FunilEtapa
          label="Vendas (pagas)" valor={m.saleOrders} dinheiro={fmtBRL(m.totalRevenue)}
          cor={cor} forte
        />
        <FunilEtapa label="Aguardando envio"  valor={m.paidOrders}      cor="#38bdf8" recuada />
        <FunilEtapa label="Em transporte"     valor={m.shippedOrders}   cor="#f59e0b" recuada />
        <FunilEtapa label="Entregues"         valor={m.deliveredOrders} cor="#22c55e" recuada />
        <div className="my-2 border-t border-border/50" />
        <FunilEtapa
          label="Aguardando pagamento" valor={m.pendingOrders} dinheiro={fmtBRL(m.pendingRevenue)}
          cor="#a78bfa"
        />
        <FunilEtapa
          label={`Cancelados${m.totalOrders > 0 ? ` · ${m.cancellationRate.toFixed(1)}%` : ""}`}
          valor={m.cancelledOrders} dinheiro={fmtBRL(m.cancelledRevenue)}
          cor="#f43f5e"
        />
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Commission card — editable rate with history
// ─────────────────────────────────────────────────────────────────────────────

function CommissionCard({ platform, commissionTotal, netRevenue }: {
  platform: EcommercePlatform; commissionTotal: number; netRevenue: number;
}) {
  const { history, currentRate, saveRate, saving } = useCommissionRates(platform);
  const [open, setOpen]     = useState(false);
  const [newRate, setNewRate] = useState("");
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10));

  const handleSave = async () => {
    const r = parseFloat(newRate.replace(",", ".")) / 100;
    if (isNaN(r) || r < 0 || r > 1) return;
    const ok = await saveRate(r, newDate);
    if (ok) { setNewRate(""); }
  };

  // ⚠️ Sem taxa cadastrada e sem padrão MEDIDO (PLATFORM_FEE_DEFAULT = null), o
  // cartão diz que não sabe. Antes qualquer plataforma caía num número padrão,
  // e um chute impresso com duas casas decimais é indistinguível de medição —
  // "R$ 0,00 de comissão" seria lido como "esta plataforma não cobra".
  const semTaxa = currentRate == null;
  const revenueAfterFee = netRevenue - commissionTotal;

  return (
    <>
      <div
        className="rounded-xl border bg-card p-4 flex flex-col gap-1.5 transition-all hover:-translate-y-0.5 hover:shadow-md cursor-pointer"
        style={{ borderLeftColor: "#94a3b8", borderLeftWidth: 3 }}
        onClick={() => setOpen(true)}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide leading-tight">Comissão da Plataforma</p>
          <div className="p-1.5 rounded-lg shrink-0" style={{ background: "#94a3b820" }}>
            <Receipt className="h-4 w-4 text-slate-400" />
          </div>
        </div>
        <p className="text-xl font-bold leading-none">{semTaxa ? "—" : fmtBRL(commissionTotal)}</p>
        <p className="text-xs text-muted-foreground">
          {semTaxa
            ? "taxa não cadastrada · clique para cadastrar"
            : `taxa: ${(currentRate * 100).toFixed(2)}% · clique para gerenciar`}
        </p>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-slate-400" />
              Comissão — {PMAP[platform].label}
            </DialogTitle>
            <DialogDescription>
              Gerencie a taxa de comissão da plataforma. Cada taxa vale a partir da data informada, preservando o cálculo de pedidos anteriores.
            </DialogDescription>
          </DialogHeader>

          {/* Resumo financeiro */}
          <div className="grid grid-cols-3 gap-3 py-2">
            <div className="rounded-lg bg-muted/40 p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Receita Líquida</p>
              <p className="text-sm font-bold">{fmtBRL(netRevenue)}</p>
            </div>
            <div className="rounded-lg bg-red-500/10 p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Comissão</p>
              <p className="text-sm font-bold text-red-500">
                {semTaxa ? "—" : `− ${fmtBRL(commissionTotal)}`}
              </p>
            </div>
            <div className="rounded-lg bg-green-500/10 p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Após Comissão</p>
              <p className="text-sm font-bold text-green-600">
                {semTaxa ? "—" : fmtBRL(revenueAfterFee)}
              </p>
            </div>
          </div>

          {/* Nova taxa */}
          <div className="border rounded-xl p-4 flex flex-col gap-3">
            <p className="text-sm font-semibold flex items-center gap-1.5">
              <Pencil className="h-3.5 w-3.5" /> Cadastrar nova taxa
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Taxa (%)</label>
                <div className="flex items-center gap-1">
                  <Input
                    className="h-8 text-sm"
                    placeholder={semTaxa ? "0,00" : `${(currentRate * 100).toFixed(2)}`}
                    value={newRate}
                    onChange={e => setNewRate(e.target.value)}
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Válida a partir de</label>
                <Input type="date" className="h-8 text-sm" value={newDate} onChange={e => setNewDate(e.target.value)} />
              </div>
            </div>
            <Button size="sm" onClick={handleSave} disabled={saving || !newRate}>
              <Check className="h-3.5 w-3.5 mr-1.5" /> Salvar taxa
            </Button>
          </div>

          {/* Histórico */}
          {history.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <History className="h-3.5 w-3.5" /> Histórico de taxas
              </p>
              <div className="rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/30 border-b text-xs text-muted-foreground">
                      <th className="text-left px-4 py-2 font-medium">Válida a partir de</th>
                      <th className="text-right px-4 py-2 font-medium">Taxa</th>
                      <th className="text-right px-4 py-2 font-medium">Cadastrada em</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {history.map((r, i) => (
                      <tr key={r.id} className={cn("hover:bg-muted/20", i === 0 && "bg-green-500/5")}>
                        <td className="px-4 py-2.5">{r.valid_from}{i === 0 && <Badge className="ml-2 text-xs py-0 h-4 bg-green-500/10 text-green-600 border-green-500/30">atual</Badge>}</td>
                        <td className="px-4 py-2.5 text-right font-semibold">{(r.rate * 100).toFixed(2)}%</td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground text-xs">{new Date(r.created_at).toLocaleDateString("pt-BR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconciliation panel — Path 1 (raw DB) vs Path 2 (system logic)
// ─────────────────────────────────────────────────────────────────────────────

function DiffBadge({ raw, sys }: { raw: number; sys: number }) {
  const diff = raw === 0 ? 0 : Math.abs((sys - raw) / raw) * 100;
  const label = raw === 0 && sys === 0 ? "—" : `${diff.toFixed(1)}%`;
  const cls =
    raw === 0 && sys === 0
      ? "bg-muted text-muted-foreground"
      : diff <= 1
      ? "bg-green-500/10 text-green-700 dark:text-green-400"
      : diff <= 5
      ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
      : "bg-red-500/10 text-red-700 dark:text-red-400";
  return (
    <span className={cn("inline-block rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums", cls)}>
      {label}
    </span>
  );
}

function ReconciliacaoPanel({
  platform,
  period,
  custom,
  m,
}: {
  platform: EcommercePlatform;
  period: EcommercePeriod;
  custom?: EcommerceCustom;
  m: EcommerceMetrics;
}) {
  const raw: RawCheckMetrics | null = useEcommerceRawCheck(platform, period, custom);

  if (!m.isConnected || raw === null) return null;

  const rows: { label: string; rawVal: number; sysVal: number; fmt: (v: number) => string }[] = [
    {
      label: "Pedidos",
      rawVal: raw.totalOrders,
      sysVal: m.totalOrders,
      fmt: fmtNum,
    },
    {
      label: "Qtd. packs",
      rawVal: raw.totalQuantity,
      sysVal: m.totalQuantityRaw,
      fmt: fmtNum,
    },
    {
      label: "Faturamento",
      rawVal: raw.saleRevenue,
      sysVal: m.totalRevenue,
      fmt: fmtBRL,
    },
    {
      label: "Cancelamentos",
      rawVal: raw.cancelledOrders,
      sysVal: m.cancelledOrders,
      fmt: fmtNum,
    },
  ];

  return (
    <Card className="rounded-2xl border-0 shadow-sm">
      <CardHeader className="pt-5 px-5 pb-3 flex flex-row items-center gap-2">
        <BarChart3 className="h-4 w-4 text-violet-500" />
        <CardTitle className="text-sm font-semibold">Verificação de Integridade</CardTitle>
        {/* ⚠️ "Caminho 1 / Caminho 2" era vocabulário de implementação: descreve
            como o número é buscado, não de onde ele vem. Quem lê a tela precisa
            saber que um lado é a soma crua no banco e o outro é o que os
            cartões acima mostram — é a divergência entre os dois que importa. */}
        <span className="ml-auto text-xs text-muted-foreground">
          soma direta no banco vs. o que esta tela mostra
        </span>
      </CardHeader>
      <CardContent className="p-0 pb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-border/50 bg-muted/30 text-muted-foreground text-xs">
                <th className="text-left px-5 py-2 font-medium">Métrica</th>
                <th className="text-right px-4 py-2 font-medium">Direto no banco</th>
                <th className="text-right px-4 py-2 font-medium">Nesta tela</th>
                <th className="text-center px-5 py-2 font-medium">Diferença</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {rows.map(({ label, rawVal, sysVal, fmt }) => (
                <tr key={label} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-2.5 font-medium text-muted-foreground">{label}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmt(rawVal)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{fmt(sysVal)}</td>
                  <td className="px-5 py-2.5 text-center">
                    <DiffBadge raw={rawVal} sys={sysVal} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Platform view
// ─────────────────────────────────────────────────────────────────────────────

function PlatformView({ platform, period, custom }: { platform: EcommercePlatform; period: EcommercePeriod; custom?: EcommerceCustom }) {
  const cfg = PMAP[platform];
  const { data: m } = useDashEcommerce(platform, period, custom);

  return (
    <div className="space-y-5">
      {/* Platform header bar */}
      <div
        className={cn("rounded-2xl border p-4 flex items-center justify-between", cfg.bgClass, cfg.borderClass)}
      >
        <div className="flex items-center gap-3">
          <span className="text-3xl">{cfg.emoji}</span>
          <div>
            <p className={cn("text-lg font-bold", cfg.textClass)}>{cfg.label}</p>
            <p className="text-xs text-muted-foreground">Dados de vendas externos — período selecionado</p>
          </div>
        </div>
        {/* ⚠️ TRÊS estados, não dois.
            "Conectado" respondia só "o token existe e não venceu". Em
            26/08/2026 o ecommerce-sync passou ~20 h tomando 401 do próprio
            cron com todos os tokens válidos — o selo teria dito Conectado o
            tempo inteiro enquanto nenhum pedido entrava, e o pg_cron marcava
            `succeeded` porque o sucesso dele é ter POSTADO.
            O estado do meio é justamente o que enganava: conectado e parado. */}
        {!m.isConnected ? (
          <Badge variant="outline" className={cn("gap-1.5 text-xs", cfg.bgClass, cfg.textClass, cfg.borderClass)}>
            <AlertCircle className="h-3 w-3" />
            Aguardando integração
          </Badge>
        ) : m.minutosSemSincronizar != null && m.minutosSemSincronizar > MINUTOS_ATE_ALERTAR ? (
          <Badge
            title={`Token válido, mas a última sincronização com dado foi há ${textoDeAtraso(m.minutosSemSincronizar)}. O sync roda a cada 5 minutos.`}
            className="bg-amber-500/10 text-amber-600 border-amber-500/30 gap-1.5 text-xs"
          >
            <AlertCircle className="h-3 w-3" />
            Sem sincronizar há {textoDeAtraso(m.minutosSemSincronizar)}
          </Badge>
        ) : (
          <Badge className="bg-green-500/10 text-green-600 border-green-500/30 gap-1.5 text-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block animate-pulse" />
            Conectado
          </Badge>
        )}
      </div>

      {/* Not connected notice */}
      {!m.isConnected && (
        <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-muted/20 p-6 flex flex-col items-center gap-2 text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">Aguardando sincronização</p>
          <p className="text-xs text-muted-foreground/70 max-w-md">
            A integração será estabelecida automaticamente. Os dados aparecerão assim que a próxima sincronização ocorrer.
          </p>
        </div>
      )}

      {/* ── KPIs ──────────────────────────────────────────────────────────────
          ⚠️ O cartão da frente agora é VENDAS, não "Pedidos". Ele traz junto
          quantos pedidos chegaram, para que os dois números apareçam na mesma
          frase em vez de em cartões distantes que não fecham entre si.

          Sumiram daqui, de propósito, quatro cartões que eram repetição:
          "Taxa de Cancelamento" (era o rodapé de Cancelamentos virado cartão),
          "Pedidos Pendentes" (imprimia o mesmo R$ de "A Receber") e
          "Em Transporte"/"Entregues"/"A enviar" — os três são etapas do funil e
          agora vivem lá, onde a soma deles fecha com as vendas. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Vendas" value={fmtNum(m.saleOrders)}
          sub={`de ${fmtNum(m.totalOrders)} pedidos recebidos`}
          icon={<ShoppingCart className="h-4 w-4" />} accent={cfg.color}
        />
        <MetricCard
          label="Faturamento" value={fmtBRL(m.totalRevenue)}
          sub={`ticket ${fmtBRL(m.avgTicket)} por venda`}
          icon={<TrendingUp className="h-4 w-4" />} accent={cfg.color}
        />
        <MetricCard
          label="A Receber" value={fmtBRL(m.pendingRevenue)}
          sub={`${fmtNum(m.pendingOrders)} pedido(s) aguardando pagamento`}
          icon={<Wallet className="h-4 w-4" />} accent="#a78bfa"
        />
        <CommissionCard platform={platform} commissionTotal={m.commissionTotal} netRevenue={m.netRevenue} />
      </div>

      {/* Unidades + o funil, lado a lado.
          ⚠️ "Unidades vendidas" passou a usar `saleUnits`: o cartão antigo dizia
          "reais vendidas" mas somava cancelado e não pago junto — a única métrica
          da tela que usava a palavra "vendidas" sobre base bruta. O total geral
          continua visível no rodapé, porque é ele que casa com "Qtd. packs" na
          verificação de integridade. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
          <MetricCard
            label="Unidades Vendidas" value={fmtNum(m.saleUnits)}
            /* ⚠️ "frascos" estava errado desde a correção de unidades: o número
               conta o que o CLIENTE levou, e o kit de sachês entrega SACHÊS, não
               frascos. Rótulo que nomeia o produto errado é pior que rótulo
               genérico — ele ensina uma leitura falsa do painel. */
            sub={`unidades entregues ao cliente · ${fmtNum(m.totalUnitsSold)} contando não pagos e cancelados`}
            icon={<Boxes className="h-4 w-4" />} accent={cfg.color}
          />
          <MetricCard
            label="Cancelados" value={fmtNum(m.cancelledOrders)}
            sub={`${fmtBRL(m.cancelledRevenue)}${m.totalOrders > 0 ? ` · ${m.cancellationRate.toFixed(1)}% dos pedidos` : ""}`}
            icon={<XCircle className="h-4 w-4" />} accent="#f43f5e"
          />
        </div>
        <div className="lg:col-span-2">
          <FunilStatus m={m} cor={cfg.color} />
        </div>
      </div>

      {/* Produto destaque */}
      {m.topProduct && (
        <div
          className="rounded-2xl border p-4 flex items-center gap-4"
          style={{ borderLeftColor: cfg.color, borderLeftWidth: 3 }}
        >
          <div className="p-2.5 rounded-xl" style={{ background: cfg.color + "20" }}>
            <Trophy className="h-5 w-5" style={{ color: cfg.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Produto mais vendido</p>
            <p className="font-bold truncate">{m.topProduct.name}</p>
            <p className="text-xs text-muted-foreground font-mono">
              {m.topProduct.sku ?? "sem SKU"}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-lg font-bold">{fmtBRL(m.topProduct.revenue)}</p>
            <p className="text-xs text-muted-foreground">
              {/* ⚠️ `orders` aqui é linha de item, não pedido: o mesmo campo já
                  aparece na tabela abaixo com o nome certo, "Qtd. packs".
                  Chamá-lo de "pedido" num lugar e de "pack" no outro fazia a
                  mesma variável virar dois substantivos, e nenhum dos dois era
                  pedido de verdade. */}
              {fmtNum(m.topProduct.orders)} {m.topProduct.orders === 1 ? "pack" : "packs"} · {fmtNum(m.topProduct.units_sold)} un.
            </p>
          </div>
        </div>
      )}

      {/* Reconciliation panel — Path 1 vs Path 2 (only shown when connected) */}
      <ReconciliacaoPanel platform={platform} period={period} custom={custom} m={m} />

      {/* Chart — only shown when connected */}
      {m.isConnected && (
        <Card className="rounded-2xl border-0 shadow-sm bg-card">
          <CardHeader className="pb-1 pt-5 px-5">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Evolução de Vendas
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            {/* Eixos vazios não dizem nada — um canal recém-ligado precisa ler
                "ainda não vendeu", não um gráfico em branco. */}
            {m.dailySales.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
                Nenhuma venda ainda no período selecionado.
              </div>
            ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={m.dailySales} margin={{ top: 4, right: 12, left: -10, bottom: 0 }} barCategoryGap="25%" barGap={2}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                  formatter={(v: number, n: string) => [fmtNum(v), n === "orders" ? "Pedidos" : "Unidades reais"]}
                  cursor={{ fill: "var(--muted)", opacity: 0.3 }}
                />
                <Legend iconType="square" iconSize={10} formatter={v => v === "orders" ? "Pedidos" : "Unidades reais"} />
                <Bar dataKey="orders" name="orders" fill={cfg.color} radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="units"  name="units"  fill="#818cf8"  radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}

      {/* Products */}
      <Card className="rounded-2xl border-0 shadow-sm">
        <CardHeader className="pt-5 px-5 pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Boxes className="h-4 w-4" style={{ color: cfg.color }} />
            Produtos Vendidos
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border/50 text-muted-foreground text-xs bg-muted/30">
                  <th className="text-left px-5 py-2 font-medium">Produto</th>
                  <th className="text-left px-4 py-2 font-medium">SKU</th>
                  <th className="text-right px-4 py-2 font-medium">Qtd. packs</th>
                  <th className="text-center px-4 py-2 font-medium">Un./pack</th>
                  <th className="text-right px-4 py-2 font-medium">Unidades reais</th>
                  <th className="text-right px-5 py-2 font-medium">Receita</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {/* ⚠️ Canal ATIVO e ainda sem venda é estado NORMAL — a PayT
                    entrou assim. Sem esta linha a tabela ficava só cabeçalho e
                    um rodapé de zeros, que lê como falha de carregamento em vez
                    de "ainda não vendeu". */}
                {m.products.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-sm text-muted-foreground">
                      Nenhuma venda ainda no período selecionado.
                    </td>
                  </tr>
                )}
                {m.products.map(p => (
                  <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3 font-medium">{p.name}</td>
                    {/* ⚠️ SKU ausente é DITO, não preenchido com o nome do
                        produto: um nome na coluna SKU faz a linha parecer
                        cadastrada e esconde o que falta fazer. */}
                    <td className="px-4 py-3 font-mono text-xs">
                      {p.sku
                        ? <span className="text-muted-foreground">{p.sku}</span>
                        : <span className="text-amber-600 dark:text-amber-500 not-italic" title="A plataforma não enviou SKU nesta linha (a Shopee grava nulo). Sem SKU não há como resolver o multiplicador.">sem SKU</span>}
                    </td>
                    <td className="px-4 py-3 text-right">{fmtNum(p.orders)}</td>
                    <td className="px-4 py-3 text-center">
                      {p.units_per_pack !== null ? (
                        <Badge variant="outline" className="text-xs font-mono px-2">×{p.units_per_pack}</Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-xs font-mono px-2 border-amber-500/60 text-amber-600 dark:text-amber-500"
                          title={p.sku
                            ? `SKU "${p.sku}" sem cadastro ativo em sku_product_mappings para esta plataforma — as unidades abaixo são o número cru da plataforma.`
                            : "Sem SKU não há multiplicador — as unidades abaixo são o número cru da plataforma."}
                        >×?</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{fmtNum(p.units_sold)}</td>
                    <td className="px-5 py-3 text-right">{fmtBRL(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-semibold bg-muted/20">
                  <td className="px-5 py-3" colSpan={2}>Total</td>
                  {/* ⚠️ A coluna é "Qtd. packs" — some as packs das linhas, não
                      `totalOrders`, que conta PEDIDOS distintos. Um total que
                      não é a soma da própria coluna faz duvidar da tabela
                      inteira. */}
                  <td className="px-4 py-3 text-right">
                    {fmtNum(m.products.reduce((s, p) => s + p.orders, 0))}
                  </td>
                  <td />
                  <td className="px-4 py-3 text-right" style={{ color: cfg.color }}>{fmtNum(m.totalUnitsSold)}</td>
                  <td className="px-5 py-3 text-right">{fmtBRL(m.totalRevenue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {m.avgRating !== null && (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground px-1">
          <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
          Avaliação média: <strong className="text-foreground ml-0.5">{m.avgRating.toFixed(1)}</strong>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Comparativo
// ─────────────────────────────────────────────────────────────────────────────

function ComparativoView({ period, custom }: { period: EcommercePeriod; custom?: EcommerceCustom }) {
  // ⚠️ Abre com TODAS marcadas e DERIVADO de `ACTIVE_PLATFORMS`, não com uma
  // lista escrita à mão. A lista antiga era `["mercadolivre","amazon","nuvemshop"]`
  // fixa: canal novo nascia desmarcado e ninguém percebia que faltava — foi
  // assim com a Shopee e teria sido de novo com a PayT.
  const [selected, setSelected] = useState<EcommercePlatform[]>(
    () => ACTIVE_PLATFORMS.map((p) => p.id),
  );
  const [metric, setMetric] = useState<"orders" | "units" | "revenue">("revenue");

  // ⚠️ Sem fallback silencioso. Antes, com menos de 2 marcadas, a tela trocava a
  // seleção por `["mercadolivre","amazon"]` por baixo do pano — mostrava dados
  // de plataformas que a pessoa tinha DESMARCADO, sem dizer nada. Como o toggle
  // impede desmarcar a última, `selected` nunca fica vazio.
  const { data, porProduto } = useEcommerceComparativo(selected, period, custom);

  // ⚠️ Sem teto. O antigo era `prev.length >= 4`, e com cinco plataformas a
  // quinta simplesmente não entrava — o clique não fazia nada e nada explicava
  // por quê. O piso de 1 fica: comparativo sem nenhuma plataforma é gráfico
  // vazio, e desmarcar a última seria um beco sem saída.
  const toggle = (p: EcommercePlatform) => setSelected(prev => {
    if (prev.includes(p)) return prev.length <= 1 ? prev : prev.filter(x => x !== p);
    return [...prev, p];
  });

  const anyConnected = data.some(c => c.totalOrders > 0);

  // ── Agregados do período ────────────────────────────────────────────────────
  const totalRevenue = data.reduce((s, c) => s + c.totalRevenue, 0);
  const totalOrders  = data.reduce((s, c) => s + c.totalOrders, 0);
  const totalSales   = data.reduce((s, c) => s + c.saleOrders, 0);
  const totalUnits   = data.reduce((s, c) => s + c.totalUnitsSold, 0);
  const totalCancel  = data.reduce((s, c) => s + c.cancelledOrders, 0);
  // ⚠️ Divide pelas VENDAS, não por todos os pedidos. Com `totalOrders` o
  // rodapé da tabela imprimia um ticket menor que o de TODAS as linhas acima
  // dele — cada linha usa `avgTicket`, que sempre dividiu pelas vendas. Duas
  // réguas na mesma tabela, e a errada era a do total.
  const overallTicket = totalSales > 0 ? totalRevenue / totalSales : 0;

  // ── Líder em receita (entre as que tiveram pedidos) ─────────────────────────
  // ⚠️ Os cartões "Maior ticket médio" e "Menor cancelamento" saíram: com duas
  // ou três plataformas eles não comparam nada que a tabela abaixo não mostre, e
  // "menor cancelamento" premiava empate em 0% pela ordem do array — o vencedor
  // mudava conforme a ordem de seleção, não conforme o desempenho.
  const withOrders = data.filter(c => c.totalOrders > 0);
  const leaderRevenue = [...withOrders].sort((a, b) => b.totalRevenue - a.totalRevenue)[0];

  // ── Dados de gráficos ───────────────────────────────────────────────────────
  const pieData = withOrders
    .map(c => ({ name: PMAP[c.platform].label, value: c.totalRevenue, color: PMAP[c.platform].color }))
    .filter(d => d.value > 0);

  const evoKey  = metric === "orders" ? "orders" : metric === "units" ? "units" : "revenue";
  // ⚠️ Alinhado por DATA, não por posição no array. Antes o ponto `i` de cada
  // plataforma era empilhado no mesmo X e o rótulo saía de `data[0]` — se uma
  // plataforma não vendeu no dia 1, ela não tem esse dia na série, e todos os
  // valores dela apareciam deslocados um dia para a esquerda, sob a data de
  // outra plataforma. O gráfico ficava plausível e errado.
  const diasSet = new Set<string>();
  data.forEach(c => c.dailySales.forEach(d => diasSet.add(d.date)));
  const dias = [...diasSet].sort();
  const rotulo = new Map<string, string>();
  data.forEach(c => c.dailySales.forEach(d => rotulo.set(d.date, d.label)));
  const lineData = dias.map(dia => {
    const entry: Record<string, number | string> = { label: rotulo.get(dia) ?? dia };
    data.forEach(c => {
      entry[c.platform] = c.dailySales.find(d => d.date === dia)?.[evoKey] ?? 0;
    });
    return entry;
  });
  const evoFmt = (v: number) => metric === "revenue" ? fmtBRL(v) : fmtNum(v);

  return (
    <div className="space-y-5">
      {/* Platform selector */}
      <Card className="rounded-2xl border-0 shadow-sm">
        {/* Sem cabeçalho: o "(2 a 3)" descrevia um limite que não existe mais, e
            os próprios botões já dizem o que fazem. */}
        <CardContent className="px-5 pt-5 pb-5">
          <div className="flex flex-wrap gap-2">
            {ACTIVE_PLATFORMS.map(p => {
              const on = selected.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all",
                    on
                      ? cn(p.bgClass, p.borderClass, p.textClass, "shadow-sm")
                      : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:bg-muted/30"
                  )}
                >
                  <span>{p.emoji}</span>
                  <span>{p.label}</span>
                  {on && <CheckCircle2 className="h-3.5 w-3.5 ml-0.5" />}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Not connected notice */}
      {!anyConnected && (
        <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-muted/20 p-6 flex flex-col items-center gap-2 text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">Nenhuma plataforma conectada</p>
          <p className="text-xs text-muted-foreground/70 max-w-md">
            Quando as integrações forem configuradas, o comparativo mostrará dados reais de cada plataforma selecionada.
          </p>
        </div>
      )}

      {/* ── Destaques ───────────────────────────────────────────────────────── */}
      {/* ⚠️ Os quatro cartões do período e os cards por PRODUTO moram na MESMA
          grade de propósito: são a mesma pergunta em dois cortes ("quanto
          saiu"), e a soma das unidades dos produtos tem de bater com o cartão
          "Unidades". Duas grades separadas convidariam a duas contas — foi
          assim que o Comparativo e a aba do ML já mostraram números
          diferentes para o mesmo dado.
          A grade cresce sozinha: produto novo vira card e a linha quebra. */}
      {anyConnected && (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <MetricCard
            label="Vendas" value={fmtNum(totalSales)}
            sub={`de ${fmtNum(totalOrders)} pedidos recebidos`}
            icon={<ShoppingCart className="h-4 w-4" />} accent="#22c55e"
          />
          <MetricCard
            label="Faturamento" value={fmtBRL(totalRevenue)}
            sub={`ticket ${fmtBRL(overallTicket)} por venda`}
            icon={<Wallet className="h-4 w-4" />} accent="#22c55e"
          />
          <MetricCard
            label="Unidades" value={fmtNum(totalUnits)}
            sub="entregues ao cliente, já com o multiplicador do pack"
            icon={<Boxes className="h-4 w-4" />} accent="#38bdf8"
          />
          <MetricCard
            label="Líder em faturamento"
            value={leaderRevenue ? `${PMAP[leaderRevenue.platform].emoji} ${PMAP[leaderRevenue.platform].label}` : "—"}
            sub={leaderRevenue ? `${fmtBRL(leaderRevenue.totalRevenue)} · ${pct(leaderRevenue.totalRevenue, totalRevenue)} do total` : undefined}
            icon={<Trophy className="h-4 w-4" />} accent={leaderRevenue ? PMAP[leaderRevenue.platform].color : "#94a3b8"}
          />
          {porProduto.map(p => (
            <ProdutoCard key={p.key} p={p} totalUnidades={totalUnits} />
          ))}
        </div>
      )}

      {/* ⚠️ O aviso sobrevive à mudança de tabela para card. Sem mapeamento não
          há multiplicador, o total de unidades fica SUBESTIMADO, e esconder isso
          tiraria a única pista de que falta cadastrar — mesmo motivo pelo qual
          `units_per_pack` devolve `null` em vez de 1. */}
      {anyConnected && porProduto.some(p => !p.mapeado) && (
        <p className="text-xs text-amber-600 dark:text-amber-400 -mt-1">
          ⚠️ {porProduto.filter(p => !p.mapeado).length === 1
            ? "1 produto sem mapeamento de SKU"
            : `${porProduto.filter(p => !p.mapeado).length} produtos sem mapeamento de SKU`}:
          {" "}sem cadastro não há multiplicador, então o total de unidades está subestimado.
          Cadastre em Ops → Suprimentos → CD SP → Mapeamento SKU.
        </p>
      )}

      {/* ── Tabela rica ─────────────────────────────────────────────────────── */}
      <Card className="rounded-2xl border-0 shadow-sm">
        <CardHeader className="pb-2 pt-5 px-5">
          <CardTitle className="text-sm font-semibold">Resumo Comparativo</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border/50 bg-muted/30 text-muted-foreground text-xs">
                  <th className="text-left px-5 py-2.5 font-medium">Plataforma</th>
                  {/* ⚠️ Duas colunas onde havia uma. "Pedidos" sozinho contava
                      cancelado e não pago junto, e era esse número que o dono
                      lia como venda. Agora o que chegou e o que virou venda
                      ficam lado a lado, e a diferença entre eles é visível. */}
                  <th className="text-right px-4 py-2.5 font-medium">Vendas</th>
                  <th className="text-right px-4 py-2.5 font-medium">Recebidos</th>
                  <th className="text-right px-4 py-2.5 font-medium">Unidades</th>
                  <th className="text-left px-4 py-2.5 font-medium">Faturamento · participação</th>
                  <th className="text-right px-4 py-2.5 font-medium">Ticket médio</th>
                  <th className="text-right px-5 py-2.5 font-medium">Cancel.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {[...data].sort((a, b) => b.totalRevenue - a.totalRevenue).map(c => {
                  const cfg = PMAP[c.platform];
                  const share = totalRevenue > 0 ? (c.totalRevenue / totalRevenue) * 100 : 0;
                  const isLeader = leaderRevenue?.platform === c.platform && c.totalRevenue > 0;
                  return (
                    <tr key={c.platform} className={cn("hover:bg-muted/20", isLeader && "bg-muted/10")}>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={cn("font-semibold", cfg.textClass)}>{cfg.emoji} {cfg.label}</span>
                          {isLeader && <Trophy className="h-3.5 w-3.5 text-amber-500" />}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">{fmtNum(c.saleOrders)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{fmtNum(c.totalOrders)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtNum(c.totalUnitsSold)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="tabular-nums w-20 shrink-0">{fmtBRL(c.totalRevenue)}</span>
                          <div className="flex-1 min-w-[60px] h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${share}%`, background: cfg.color }} />
                          </div>
                          <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">{share.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtBRL(c.avgTicket)}</td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        <span className={cn(c.cancelledOrders > 0 ? "text-destructive" : "text-muted-foreground")}>
                          {fmtNum(c.cancelledOrders)}
                          <span className="text-xs text-muted-foreground ml-1">({pct(c.cancelledOrders, c.totalOrders)})</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border/60 bg-muted/20 font-semibold">
                  <td className="px-5 py-3">Total</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtNum(totalSales)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{fmtNum(totalOrders)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtNum(totalUnits)}</td>
                  <td className="px-4 py-3 tabular-nums">{fmtBRL(totalRevenue)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtBRL(overallTicket)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {fmtNum(totalCancel)}
                    <span className="text-xs text-muted-foreground ml-1">({pct(totalCancel, totalOrders)})</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Gráficos ────────────────────────────────────────────────────────── */}
      {anyConnected && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Donut — mix de receita */}
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardHeader className="pb-1 pt-5 px-5">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Mix de Receita
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-5">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={pieData} dataKey="value" nameKey="name"
                    cx="50%" cy="50%" innerRadius={58} outerRadius={88} paddingAngle={2}
                    stroke="var(--background)" strokeWidth={2}
                  >
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                    formatter={(v: number, n: string) => [`${fmtBRL(v)} · ${pct(v, totalRevenue)}`, n]}
                  />
                  <Legend iconType="circle" iconSize={9} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Evolução — pedidos / unidades / receita */}
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardHeader className="pb-1 pt-5 px-5 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Evolução
              </CardTitle>
              <div className="flex gap-1.5">
                {([["revenue", "Receita"], ["orders", "Pedidos"], ["units", "Unidades"]] as const).map(([m2, lbl]) => (
                  <button
                    key={m2}
                    onClick={() => setMetric(m2)}
                    className={cn(
                      "text-xs px-2.5 py-1 rounded-lg border transition-all font-medium",
                      metric === m2
                        ? "bg-primary text-primary-foreground border-transparent"
                        : "border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="px-2 pb-4">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={lineData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                  <defs>
                    {selected.map(p => (
                      <linearGradient key={p} id={`grad-${p}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={PMAP[p].color} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={PMAP[p].color} stopOpacity={0.02} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={metric === "revenue" ? 44 : 28}
                    tickFormatter={v => metric === "revenue" ? (v === 0 ? "0" : `${(v / 1000).toFixed(0)}k`) : fmtNum(v)}
                  />
                  <Tooltip
                    contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                    formatter={(v: number, name: string) => [evoFmt(v), PMAP[name as EcommercePlatform]?.label ?? name]}
                    cursor={{ stroke: "var(--muted-foreground)", strokeOpacity: 0.3 }}
                  />
                  <Legend iconType="circle" iconSize={9} formatter={v => PMAP[v as EcommercePlatform]?.label ?? v} />
                  {selected.map(p => (
                    <Area
                      key={p} type="monotone" dataKey={p} name={p}
                      stroke={PMAP[p].color} strokeWidth={2}
                      fill={`url(#grad-${p})`} dot={false} activeDot={{ r: 4 }}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Histórico Mensal helpers
// ─────────────────────────────────────────────────────────────────────────────

const MN_SHORT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function getMonthLabel(ym: string) {
  const [y, m] = ym.split("-");
  return `${MN_SHORT[parseInt(m) - 1]}/${y.slice(2)}`;
}

function monthsBetween(from: string, to: string): string[] {
  const result: string[] = [];
  const cur = new Date(`${from}-02T12:00:00Z`);
  const end = new Date(`${to}-02T12:00:00Z`);
  while (cur <= end) {
    result.push(cur.toISOString().slice(0, 7));
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return result;
}

function generateMonthOptions(): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = [];
  const start = new Date(2024, 0, 1);
  const now   = new Date();
  while (start <= now) {
    const y = start.getFullYear();
    const m = start.getMonth();
    opts.push({ value: `${y}-${String(m + 1).padStart(2, "0")}`, label: `${MN_SHORT[m]}/${y}` });
    start.setMonth(start.getMonth() + 1);
  }
  return opts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Histórico Mensal view
// ─────────────────────────────────────────────────────────────────────────────

function HistoricoMensalView() {
  const now = new Date();
  const curMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  // Default: últimos 3 meses (não 12 — evita encher o chart com meses vazios)
  const def3ago = (() => {
    const d = new Date(now); d.setMonth(d.getMonth() - 2);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();

  // Mesma decisão do Comparativo: abre com todas e derivado da lista ativa.
  const [selected, setSelected]   = useState<EcommercePlatform[]>(
    () => ACTIVE_PLATFORMS.map((p) => p.id),
  );
  const [fromMonth, setFromMonth] = useState(def3ago);
  const [toMonth,   setToMonth]   = useState(curMonthStr);

  const { data, isLoading } = useEcommerceHistoricoMensal(selected, fromMonth, toMonth);

  const toggle = (p: EcommercePlatform) =>
    setSelected(prev => prev.includes(p) ? (prev.length <= 1 ? prev : prev.filter(x => x !== p)) : [...prev, p]);

  const monthOpts  = generateMonthOptions();
  const allMonths  = monthsBetween(fromMonth, toMonth);

  // Chart data: apenas meses com pelo menos 1 pedido em alguma plataforma
  const barData = allMonths.map(month => {
    const entry: Record<string, string | number> = { month, label: getMonthLabel(month) };
    for (const p of selected) {
      const m = data.find(d => d.month === month && d.platform === p);
      entry[`${p}_receita`]  = m?.totalRevenue   ?? 0;
      // ⚠️ A série de barras passa a plotar VENDAS, não pedidos recebidos: ela
      // fica ao lado do gráfico de faturamento, e duas barras que não falam da
      // mesma coisa lado a lado é o convite para dividir uma pela outra e achar
      // um ticket que não existe.
      entry[`${p}_pedidos`]  = m?.saleOrders      ?? 0;
      entry[`${p}_unidades`] = m?.saleUnits       ?? 0;
      entry[`${p}_ticket`]   = m?.avgTicket        ?? 0;
      entry[`${p}_cancel`]   = m?.cancellationRate ?? 0;
    }
    return entry;
  }).filter(entry =>
    selected.some(p => (entry[`${p}_pedidos`] as number) > 0)
  );

  // Aggregate KPIs
  const totalReceita    = data.reduce((s, d) => s + d.totalRevenue,   0);
  const totalPedidos    = data.reduce((s, d) => s + d.totalOrders,    0);
  const totalVendas     = data.reduce((s, d) => s + d.saleOrders,     0);
  const totalUnidades   = data.reduce((s, d) => s + d.saleUnits,      0);
  const totalCancelados = data.reduce((s, d) => s + d.cancelledOrders, 0);
  const totalPendente   = data.reduce((s, d) => s + d.pendingRevenue, 0);
  const totalCanceladoValor = data.reduce((s, d) => s + d.cancelledRevenue, 0);
  // ⚠️ Denominador = VENDAS. Com todos os pedidos, um mês de muito PIX não pago
  // mostrava ticket baixo sem nada ter acontecido com o preço.
  const avgTicketGeral  = totalVendas  > 0 ? totalReceita / totalVendas : 0;
  const cancelRateGeral = totalPedidos > 0 ? (totalCancelados / totalPedidos) * 100 : 0;

  // Per-platform aggregates
  const byPlatform = selected.map(p => {
    const rows     = data.filter(d => d.platform === p);
    const receita  = rows.reduce((s, r) => s + r.totalRevenue,   0);
    const pedidos  = rows.reduce((s, r) => s + r.saleOrders,     0);
    const unidades = rows.reduce((s, r) => s + r.saleUnits,      0);
    return { platform: p, receita, pedidos, unidades, pct: totalReceita > 0 ? (receita / totalReceita) * 100 : 0 };
  });

  // Combined month totals (all selected platforms summed)
  const monthTotals = allMonths.map(month => ({
    month,
    label:        getMonthLabel(month),
    totalRevenue: selected.reduce((s, p) => s + (data.find(d => d.month === month && d.platform === p)?.totalRevenue ?? 0), 0),
    totalOrders:  selected.reduce((s, p) => s + (data.find(d => d.month === month && d.platform === p)?.totalOrders  ?? 0), 0),
  })).filter(m => m.totalRevenue > 0 || m.totalOrders > 0);

  const bestMonth  = monthTotals.length ? monthTotals.reduce((a, b) => a.totalRevenue > b.totalRevenue ? a : b) : null;
  const worstMonth = monthTotals.length > 1 ? monthTotals.reduce((a, b) => a.totalRevenue < b.totalRevenue ? a : b) : null;

  // Month-over-month (last 2 months with data)
  const lastTwo  = monthTotals.slice(-2);
  const momChange = lastTwo.length === 2 && lastTwo[0].totalRevenue > 0
    ? ((lastTwo[1].totalRevenue - lastTwo[0].totalRevenue) / lastTwo[0].totalRevenue) * 100 : null;

  const hasData = data.length > 0;

  return (
    <div className="space-y-5">
      {/* ── Filter bar ── */}
      <Card className="rounded-2xl border-0 shadow-sm">
        <CardContent className="px-5 py-4">
          <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
            {/* Platform toggles */}
            <div className="flex-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Plataformas</p>
              <div className="flex flex-wrap gap-2">
                {ACTIVE_PLATFORMS.map(p => {
                  const on = selected.includes(p.id);
                  return (
                    <button key={p.id} onClick={() => toggle(p.id)}
                      className={cn(
                        "flex items-center gap-2 px-3.5 py-2 rounded-xl border-2 text-sm font-semibold transition-all",
                        on ? cn(p.bgClass, p.borderClass, p.textClass, "shadow-sm")
                           : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:bg-muted/30"
                      )}>
                      <span>{p.emoji}</span><span>{p.label}</span>
                      {on && <CheckCircle2 className="h-3.5 w-3.5 ml-0.5" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Date range */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Período</p>
              <div className="flex items-center gap-2">
                <Select value={fromMonth} onValueChange={v => { setFromMonth(v); if (v > toMonth) setToMonth(v); }}>
                  <SelectTrigger className="w-[118px] h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {monthOpts.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <span className="text-muted-foreground text-sm font-medium">→</span>
                <Select value={toMonth} onValueChange={v => { setToMonth(v); if (v < fromMonth) setFromMonth(v); }}>
                  <SelectTrigger className="w-[118px] h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {monthOpts.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Badge variant="secondary" className="hidden sm:flex text-xs">
                  {allMonths.length} {allMonths.length === 1 ? "mês" : "meses"}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex items-center gap-2 px-1 text-sm text-muted-foreground animate-pulse">
          <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          Carregando histórico...
        </div>
      )}

      {!isLoading && !hasData && (
        <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-muted/20 p-10 flex flex-col items-center gap-2 text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">Nenhum dado no período selecionado</p>
          <p className="text-xs text-muted-foreground/60">Ajuste o período ou aguarde a sincronização.</p>
        </div>
      )}

      {!isLoading && hasData && (
        <>
          {/* ── KPI Summary row ── */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-0.5">
              Resumo · {getMonthLabel(fromMonth)} → {getMonthLabel(toMonth)}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
              {/* ⚠️ Faturamento, não "receita total". Até a 20260914 este número
                  somava pedido cancelado e PIX não pago junto — e chamava isso
                  de receita do mês. Agora é só o pago, e o que saiu daqui está
                  escrito embaixo em vez de sumir. */}
              <div className="col-span-2 sm:col-span-1 rounded-xl border bg-card p-4" style={{ borderLeftColor: "#22c55e", borderLeftWidth: 3 }}>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Faturamento</p>
                <p className="text-xl font-bold mt-1 leading-none">{fmtBRL(totalReceita)}</p>
                {momChange !== null && (
                  <p className={cn("text-xs font-semibold mt-1", momChange >= 0 ? "text-green-500" : "text-red-500")}>
                    {momChange >= 0 ? "▲" : "▼"} {Math.abs(momChange).toFixed(1)}% vs mês ant.
                  </p>
                )}
              </div>
              {/* Vendas — e quantos pedidos chegaram, na mesma frase */}
              <div className="rounded-xl border bg-card p-4" style={{ borderLeftColor: "#3b82f6", borderLeftWidth: 3 }}>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Vendas</p>
                <p className="text-xl font-bold mt-1 leading-none">{fmtNum(totalVendas)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  de {fmtNum(totalPedidos)} pedidos recebidos
                </p>
              </div>
              {/* Não entrou — o que saiu do faturamento, dito em vez de omitido */}
              <div className="rounded-xl border bg-card p-4" style={{ borderLeftColor: "#a78bfa", borderLeftWidth: 3 }}>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Não entrou</p>
                <p className="text-xl font-bold mt-1 leading-none">{fmtBRL(totalPendente + totalCanceladoValor)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {fmtBRL(totalPendente)} a receber · {fmtBRL(totalCanceladoValor)} cancelado
                </p>
              </div>
              {/* Unidades — só das vendas, para casar com o faturamento acima */}
              <div className="rounded-xl border bg-card p-4" style={{ borderLeftColor: "#8b5cf6", borderLeftWidth: 3 }}>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Unidades Vendidas</p>
                <p className="text-xl font-bold mt-1 leading-none">{fmtNum(totalUnidades)}</p>
              </div>
              {/* Ticket médio */}
              <div className="rounded-xl border bg-card p-4" style={{ borderLeftColor: "#f59e0b", borderLeftWidth: 3 }}>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Ticket Médio</p>
                <p className="text-xl font-bold mt-1 leading-none">{fmtBRL(avgTicketGeral)}</p>
              </div>
              {/* Cancelamentos */}
              <div className="rounded-xl border bg-card p-4" style={{ borderLeftColor: "#ef4444", borderLeftWidth: 3 }}>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Cancelamentos</p>
                <p className="text-xl font-bold mt-1 leading-none">{cancelRateGeral.toFixed(1)}%</p>
                <p className="text-xs text-muted-foreground mt-1">{fmtNum(totalCancelados)} pedidos</p>
              </div>
              {/* Melhor mês */}
              {bestMonth && (
                <div className="rounded-xl border bg-green-500/5 border-green-500/20 p-4">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Melhor Mês</p>
                  <p className="text-lg font-bold text-green-600 mt-1 leading-none">{bestMonth.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{fmtBRL(bestMonth.totalRevenue)}</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Per-platform breakdown ── */}
          <div className={cn("grid gap-3", byPlatform.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2")}>
            {byPlatform.map(({ platform: p, receita, pedidos, unidades, pct: pctReceita }) => {
              const cfg = PMAP[p];
              const pRows = data.filter(d => d.platform === p).sort((a, b) => a.month.localeCompare(b.month));
              const lastM = pRows[pRows.length - 1];
              const prevM = pRows[pRows.length - 2];
              const mom = lastM && prevM && prevM.totalRevenue > 0
                ? ((lastM.totalRevenue - prevM.totalRevenue) / prevM.totalRevenue) * 100 : null;
              return (
                <Card key={p} className="rounded-2xl border-0 shadow-sm">
                  <CardContent className="px-5 py-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className={cn("text-sm font-bold flex items-center gap-1.5", cfg.textClass)}>
                        <span>{cfg.emoji}</span>{cfg.label}
                      </span>
                      <div className="flex items-center gap-2">
                        {mom !== null && (
                          <span className={cn("text-xs font-semibold", mom >= 0 ? "text-green-500" : "text-red-500")}>
                            {mom >= 0 ? "▲" : "▼"}{Math.abs(mom).toFixed(1)}% último mês
                          </span>
                        )}
                        <Badge variant="outline" className="text-xs">{pctReceita.toFixed(0)}% do faturamento</Badge>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Faturamento</p>
                        <p className="font-bold text-sm">{fmtBRL(receita)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Vendas</p>
                        <p className="font-bold text-sm">{fmtNum(pedidos)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Unidades</p>
                        <p className="font-bold text-sm">{fmtNum(unidades)}</p>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted/40">
                      <div className="h-1.5 rounded-full transition-all"
                        style={{ width: `${Math.min(pctReceita, 100)}%`, background: cfg.color }} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* ── Receita Mensal ── */}
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardHeader className="pb-1 pt-5 px-5">
              <CardTitle className="text-sm font-semibold">Faturamento Mensal por Plataforma</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-4">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={barData} margin={{ top: 20, right: 16, left: 8, bottom: 0 }} barCategoryGap="28%" barGap={3}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={60}
                    tickFormatter={v => v === 0 ? "R$0" : `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                    formatter={(v: number, name: string) => [fmtBRL(v), PMAP[name.replace("_receita","") as EcommercePlatform]?.label ?? name]}
                    cursor={{ fill: "var(--muted)", opacity: 0.3 }}
                  />
                  <Legend iconType="square" iconSize={10}
                    formatter={v => PMAP[v.replace("_receita","") as EcommercePlatform]?.label ?? v} />
                  {selected.map(p => (
                    <Bar key={p} dataKey={`${p}_receita`} name={`${p}_receita`}
                      fill={PMAP[p].color} radius={[4,4,0,0]} maxBarSize={38} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* ── Pedidos Mensais ── */}
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardHeader className="pb-1 pt-5 px-5">
              <CardTitle className="text-sm font-semibold">Vendas Mensais por Plataforma</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-4">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={barData} margin={{ top: 20, right: 16, left: 8, bottom: 0 }} barCategoryGap="28%" barGap={3}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={38} />
                  <Tooltip
                    contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                    formatter={(v: number, name: string) => [fmtNum(v) + " vendas", PMAP[name.replace("_pedidos","") as EcommercePlatform]?.label ?? name]}
                    cursor={{ fill: "var(--muted)", opacity: 0.3 }}
                  />
                  <Legend iconType="square" iconSize={10}
                    formatter={v => PMAP[v.replace("_pedidos","") as EcommercePlatform]?.label ?? v} />
                  {selected.map(p => (
                    <Bar key={p} dataKey={`${p}_pedidos`} name={`${p}_pedidos`}
                      fill={PMAP[p].color} radius={[4,4,0,0]} maxBarSize={38} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* ── Ticket Médio + Taxa Cancelamento ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Card className="rounded-2xl border-0 shadow-sm">
              <CardHeader className="pb-1 pt-5 px-5">
                <CardTitle className="text-sm font-semibold">Ticket Médio por Mês</CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={barData} margin={{ top: 20, right: 16, left: 8, bottom: 0 }} barCategoryGap="28%" barGap={3}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={54}
                      tickFormatter={v => `R$${v.toFixed(0)}`} />
                    <Tooltip
                      contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                      formatter={(v: number, name: string) => [fmtBRL(v), PMAP[name.replace("_ticket","") as EcommercePlatform]?.label ?? name]}
                      cursor={{ fill: "var(--muted)", opacity: 0.3 }}
                    />
                    <Legend iconType="square" iconSize={10}
                      formatter={v => PMAP[v.replace("_ticket","") as EcommercePlatform]?.label ?? v} />
                    {selected.map(p => (
                      <Bar key={p} dataKey={`${p}_ticket`} name={`${p}_ticket`}
                        fill={PMAP[p].color} radius={[4,4,0,0]} maxBarSize={38} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-0 shadow-sm">
              <CardHeader className="pb-1 pt-5 px-5">
                <CardTitle className="text-sm font-semibold">Taxa de Cancelamento por Mês</CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={barData} margin={{ top: 20, right: 16, left: 8, bottom: 0 }} barCategoryGap="28%" barGap={3}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={36}
                      tickFormatter={v => `${v}%`} />
                    <Tooltip
                      contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                      formatter={(v: number, name: string) => [`${(v as number).toFixed(1)}%`, PMAP[name.replace("_cancel","") as EcommercePlatform]?.label ?? name]}
                      cursor={{ fill: "var(--muted)", opacity: 0.3 }}
                    />
                    <Legend iconType="square" iconSize={10}
                      formatter={v => PMAP[v.replace("_cancel","") as EcommercePlatform]?.label ?? v} />
                    {selected.map(p => (
                      <Bar key={p} dataKey={`${p}_cancel`} name={`${p}_cancel`}
                        fill={PMAP[p].color} radius={[4,4,0,0]} maxBarSize={38} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* ── Tabela detalhada ── */}
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardHeader className="pt-5 px-5 pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold">Detalhamento por Mês e Plataforma</CardTitle>
              <p className="text-xs text-muted-foreground">{allMonths.length} meses · {selected.length} plataforma{selected.length > 1 ? "s" : ""}</p>
            </CardHeader>
            <CardContent className="p-0 pb-3">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-border/50 bg-muted/30 text-muted-foreground text-xs">
                      <th className="text-left px-5 py-2.5 font-medium">Mês</th>
                      <th className="text-left px-4 py-2.5 font-medium">Plataforma</th>
                      <th className="text-right px-4 py-2.5 font-medium">Pedidos</th>
                      <th className="text-right px-4 py-2.5 font-medium">Unidades</th>
                      <th className="text-right px-4 py-2.5 font-medium">Receita</th>
                      <th className="text-right px-4 py-2.5 font-medium">Ticket Médio</th>
                      <th className="text-right px-4 py-2.5 font-medium">Cancel.</th>
                      <th className="text-right px-5 py-2.5 font-medium">MoM</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {selected.flatMap(p => {
                      const pRows = data.filter(d => d.platform === p).sort((a, b) => a.month.localeCompare(b.month));
                      const maxRev = Math.max(...pRows.map(r => r.totalRevenue), 0);
                      return pRows.map((r, i) => {
                        const prev = pRows[i - 1];
                        const mom  = prev && prev.totalRevenue > 0
                          ? ((r.totalRevenue - prev.totalRevenue) / prev.totalRevenue) * 100 : null;
                        const cfg    = PMAP[r.platform];
                        const isTop  = pRows.length > 1 && r.totalRevenue === maxRev;
                        return (
                          <tr key={`${r.platform}-${r.month}`}
                            className={cn("hover:bg-muted/20 transition-colors", isTop && "bg-green-500/5")}>
                            <td className="px-5 py-2.5 font-semibold">{r.label}</td>
                            <td className="px-4 py-2.5">
                              <span className={cn("text-xs font-semibold", cfg.textClass)}>{cfg.emoji} {cfg.label}</span>
                            </td>
                            <td className="px-4 py-2.5 text-right">{fmtNum(r.totalOrders)}</td>
                            <td className="px-4 py-2.5 text-right">{fmtNum(r.totalUnitsSold)}</td>
                            <td className={cn("px-4 py-2.5 text-right font-semibold", isTop && "text-green-600")}>
                              {fmtBRL(r.totalRevenue)}
                              {isTop && <span className="ml-1 text-xs">🏆</span>}
                            </td>
                            <td className="px-4 py-2.5 text-right">{fmtBRL(r.avgTicket)}</td>
                            <td className="px-4 py-2.5 text-right text-destructive">{r.cancellationRate.toFixed(1)}%</td>
                            <td className="px-5 py-2.5 text-right">
                              {mom !== null ? (
                                <span className={cn("text-xs font-semibold", mom >= 0 ? "text-green-500" : "text-red-500")}>
                                  {mom >= 0 ? "▲" : "▼"}{Math.abs(mom).toFixed(1)}%
                                </span>
                              ) : <span className="text-xs text-muted-foreground">—</span>}
                            </td>
                          </tr>
                        );
                      });
                    })}
                  </tbody>
                  {/* Footer totals */}
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/20 font-semibold text-xs">
                      <td className="px-5 py-3" colSpan={2}>Total</td>
                      <td className="px-4 py-3 text-right">{fmtNum(totalPedidos)}</td>
                      <td className="px-4 py-3 text-right">{fmtNum(totalUnidades)}</td>
                      <td className="px-4 py-3 text-right">{fmtBRL(totalReceita)}</td>
                      <td className="px-4 py-3 text-right">{fmtBRL(avgTicketGeral)}</td>
                      <td className="px-4 py-3 text-right text-destructive">{cancelRateGeral.toFixed(1)}%</td>
                      <td className="px-5 py-3" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* ── Pior mês highlight ── */}
          {worstMonth && bestMonth && worstMonth.month !== bestMonth.month && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 flex items-start gap-3">
                <Trophy className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Melhor mês do período</p>
                  <p className="text-base font-bold text-green-600">{bestMonth.label}</p>
                  <p className="text-xs text-muted-foreground">{fmtBRL(bestMonth.totalRevenue)} · {fmtNum(bestMonth.totalOrders)} pedidos</p>
                </div>
              </div>
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 flex items-start gap-3">
                <TrendingUp className="h-5 w-5 text-red-500 shrink-0 mt-0.5 rotate-180" />
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Mês de menor receita</p>
                  <p className="text-base font-bold text-red-500">{worstMonth.label}</p>
                  <p className="text-xs text-muted-foreground">{fmtBRL(worstMonth.totalRevenue)} · {fmtNum(worstMonth.totalOrders)} pedidos</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

type ActiveView = EcommercePlatform | "comparativo" | "historico";

const TAB_KEY = "ecommerce_active_tab";

export default function EcommerceVendas() {
  const [period, setPeriod] = useState<EcommercePeriod>("7d");
  // Período personalizado. Fica fora do `period` de propósito: trocar para
  // "Hoje" e voltar para "Por período" preserva as datas escolhidas.
  const [custom, setCustom] = useState<EcommerceCustom>({});
  const [active, setActive] = useState<ActiveView>(() => {
    const saved = localStorage.getItem(TAB_KEY) as ActiveView | null;
    // ⚠️ A lista sai de PLATFORMS, não é escrita aqui. A versão anterior tinha
    // "shopee" fixa nesta linha: quando a aba foi habilitada, quem a escolhia e
    // voltava à tela caía no Mercado Livre — a aba funcionava e não "colava",
    // sem erro nenhum. Aba desabilitada volta a valer sozinha por esta regra.
    // "lps" (Vindi) foi descontinuado e não está mais em PLATFORMS.
    const desabilitada = PLATFORMS.some((p) => p.id === saved && p.disabled);
    const conhecida = ACTIVE_PLATFORMS.some((p) => p.id === saved)
      || saved === "comparativo" || saved === "historico";
    if (!saved || desabilitada || !conhecida) return "mercadolivre";
    return saved;
  });

  const handleSetActive = (v: ActiveView) => {
    setActive(v);
    localStorage.setItem(TAB_KEY, v);
  };

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-5">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShoppingCart className="h-6 w-6 text-primary" />
              Vendas Online
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Acompanhamento de pedidos, receita e unidades por plataforma de e-commerce
            </p>
          </div>
          {active !== "historico" && (
            <div className="flex flex-wrap items-center gap-2">
              <Select value={period} onValueChange={v => setPeriod(v as EcommercePeriod)}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {period === "custom" && (
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={custom.from ?? ""}
                    max={custom.to || undefined}
                    onChange={e => setCustom(c => ({ ...c, from: e.target.value }))}
                    className="h-10 rounded-md border border-input bg-background px-2.5 text-sm"
                    aria-label="Data inicial"
                  />
                  <span className="text-muted-foreground text-sm">até</span>
                  <input
                    type="date"
                    value={custom.to ?? ""}
                    min={custom.from || undefined}
                    onChange={e => setCustom(c => ({ ...c, to: e.target.value }))}
                    className="h-10 rounded-md border border-input bg-background px-2.5 text-sm"
                    aria-label="Data final"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Platform selector buttons */}
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map(p => {
            const on = active === p.id;
            if (p.disabled) {
              return (
                <span
                  key={p.id}
                  title="Em breve — integração ainda não disponível"
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border-2 border-border/50 text-muted-foreground/40 cursor-not-allowed select-none"
                >
                  <span className="text-base grayscale opacity-50">{p.emoji}</span>
                  {p.label}
                  <span className="text-[10px] font-normal">(em breve)</span>
                </span>
              );
            }
            return (
              <button
                key={p.id}
                onClick={() => handleSetActive(p.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all",
                  on
                    ? cn(p.bgClass, p.borderClass, p.textClass, "shadow-sm scale-[1.02]")
                    : "border-border text-muted-foreground hover:bg-muted/40 hover:border-muted-foreground/40"
                )}
              >
                <span className="text-base">{p.emoji}</span>
                {p.label}
              </button>
            );
          })}
          <button
            onClick={() => handleSetActive("comparativo")}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all",
              active === "comparativo"
                ? "bg-violet-500/10 border-violet-500/50 text-violet-600 dark:text-violet-300 shadow-sm scale-[1.02]"
                : "border-border text-muted-foreground hover:bg-muted/40 hover:border-muted-foreground/40"
            )}
          >
            <BarChart3 className="h-4 w-4" />
            Comparativo
          </button>
          <button
            onClick={() => handleSetActive("historico")}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all",
              active === "historico"
                ? "bg-indigo-500/10 border-indigo-500/50 text-indigo-600 dark:text-indigo-300 shadow-sm scale-[1.02]"
                : "border-border text-muted-foreground hover:bg-muted/40 hover:border-muted-foreground/40"
            )}
          >
            <Calendar className="h-4 w-4" />
            Histórico Mensal
          </button>
        </div>

        {/* Content */}
        {active === "historico" ? (
          <HistoricoMensalView />
        ) : active === "comparativo" ? (
          <ComparativoView period={period} custom={custom} />
        ) : (
          <PlatformView platform={active as EcommercePlatform} period={period} custom={custom} />
        )}
      </div>
    </div>
  );
}
