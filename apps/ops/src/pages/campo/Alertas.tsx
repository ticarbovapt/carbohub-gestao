import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle, CheckCircle2, ChevronRight, Factory, Loader2, Package,
  RefreshCw, Search, ShoppingCart, Truck, Wrench, X,
} from "lucide-react";
import { useParamUrl } from "@carbo/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useStock } from "@/hooks/useStock";
import { HUBS } from "@/components/estoque/stockData";
import { usePosVendaOrders, POSVENDA_STAGES, colunaDaEtapa } from "@/hooks/usePosVenda";
import { useProductionOrders } from "@/hooks/useProductionOrders";
import { useProducibility } from "@/hooks/useProducibility";
import { useOS, useVendasSemOS } from "@/hooks/useOS";

// ─────────────────────────────────────────────────────────────────────────────
// Alertas operacionais — o que precisa de ação AGORA, de todas as áreas do Ops.
// Os alertas são VIVOS: nascem da leitura dos dados e somem quando a pendência
// sai. Somente leitura — nenhuma escrita aqui.
//
// ⚠️ Fonte que falhou APARECE na tela. Sem isso "não carregou" teria a mesma
// cara de "tudo certo" — e tudo certo é o que esta tela existe para negar.
// ─────────────────────────────────────────────────────────────────────────────

type Prioridade = "critical" | "high" | "medium";
const PRIO: Record<Prioridade, { label: string; plural: string; dot: string; bar: string; chip: string }> = {
  critical: { label: "Crítico", plural: "Críticos", dot: "bg-red-500", bar: "bg-red-500",
    chip: "bg-red-500/10 text-red-700 dark:text-red-300" },
  high: { label: "Alta", plural: "Altas", dot: "bg-orange-500", bar: "bg-orange-500",
    chip: "bg-orange-500/10 text-orange-700 dark:text-orange-300" },
  medium: { label: "Média", plural: "Médias", dot: "bg-amber-400", bar: "bg-amber-400",
    chip: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
};
const PRIO_ORDEM: Prioridade[] = ["critical", "high", "medium"];

type Area = "estoque" | "pedidos" | "producao" | "campo";
const AREAS: Record<Area, { label: string; icon: typeof Package; tone: string }> = {
  estoque:  { label: "Estoque",           icon: Package, tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  pedidos:  { label: "Pedidos",           icon: Truck,   tone: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" },
  producao: { label: "Produção",          icon: Factory, tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  campo:    { label: "OS de campo",       icon: Wrench,  tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
};
const AREA_ORDEM: Area[] = ["estoque", "pedidos", "producao", "campo"];

interface Pend {
  id: string;
  area: Area;
  /** Rótulo curto do tipo, mostrado na linha ("Parado", "NF", "Atrasada"…). */
  tipo: string;
  titulo: string;
  detalhe: string;
  prioridade: Prioridade;
  /** Dias parado/atrasado — ordena dentro da mesma prioridade. */
  dias?: number;
  // Ação principal é só navegação → <Link> (abre em nova guia com Ctrl/meio).
  action: { label: string; to: string };
  // A secundária leva `state` (pré-preenchimento), que não sobrevive a uma guia
  // nova — por isso fica botão.
  action2?: { label: string; icon: typeof ShoppingCart; go: () => void };
}

// Dia de Brasília (hora local), nunca `toISOString()`: às 21h ele já é amanhã.
const diaLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const paraData = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : new Date(s));
const diaDe = (s: string | null | undefined) => {
  if (!s) return "";
  const d = paraData(s);
  return Number.isNaN(d.getTime()) ? "" : diaLocal(d);
};
const diasDesde = (s?: string | null) => {
  if (!s) return 0;
  const d = paraData(s).getTime();
  if (Number.isNaN(d)) return 0;
  return Math.max(0, Math.floor((Date.now() - d) / 86_400_000));
};
const dataCurta = (s: string) => paraData(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const ha = (d: number) => (d === 0 ? "hoje" : d === 1 ? "há 1 dia" : `há ${d} dias`);

const TERMINAL = new Set(["entregue", "cancelado"]);
const PARADO_DIAS = 3;
const stageLabel = (k: string) => POSVENDA_STAGES.find((s) => s.key === colunaDaEtapa(k))?.label ?? k;
const POR_GRUPO = 6;

export default function Alertas() {
  const navigate = useNavigate();
  const stockQ = useStock();
  const posQ = usePosVendaOrders();
  const opsQ = useProductionOrders();
  const osQ = useOS();
  const semOsQ = useVendasSemOS();
  const producible = useProducibility();

  const [areaUrl, setArea] = useParamUrl("area", "");
  const [prioUrl, setPrio] = useParamUrl("prioridade", "");
  const [busca, setBusca] = useParamUrl("busca", "", { replace: true });
  const [abertos, setAbertos] = useParamUrl("ver", "");
  const area = (AREA_ORDEM as string[]).includes(areaUrl) ? (areaUrl as Area) : null;
  const prio = (PRIO_ORDEM as string[]).includes(prioUrl) ? (prioUrl as Prioridade) : null;
  const gruposAbertos = new Set(abertos.split(",").filter(Boolean));

  const fontes = [
    { nome: "Estoque", q: stockQ },
    { nome: "Pedidos", q: posQ },
    { nome: "Produção", q: opsQ },
    { nome: "OS de campo", q: osQ },
    { nome: "Vendas sem OS", q: semOsQ },
  ];
  const carregando = fontes.some((f) => f.q.isLoading);
  const atualizando = fontes.some((f) => f.q.isFetching);
  const falharam = fontes.filter((f) => f.q.isError).map((f) => f.nome);
  const atualizar = () => fontes.forEach((f) => f.q.refetch());

  const pends = useMemo<Pend[]>(() => {
    const out: Pend[] = [];
    const hoje = diaLocal(new Date());

    // ── Estoque abaixo do mínimo ou negativo, por hub ────────────────────────
    for (const p of stockQ.data ?? []) {
      for (const hub of HUBS) {
        // CD Bling e ML Full são espelho, não prateleira nossa.
        if (hub.id === "bling" || hub.id === "mlfull") continue;
        if (p.foraDoHub?.[hub.id]) continue;
        const qty = p.hubs[hub.id] ?? 0;
        const min = p.mins[hub.id] ?? 0;
        const negativo = qty < 0;
        if (!negativo && (!min || min <= 0 || qty >= min)) continue;
        const prioridade: Prioridade = qty <= 0 ? "critical" : qty < min * 0.5 ? "high" : "medium";
        const sugerido = Math.max(1, Math.ceil((min || 0) - qty));
        out.push({
          id: `estoque-${p.id}-${hub.id}`, area: "estoque",
          tipo: negativo ? "Negativo" : qty <= 0 ? "Zerado" : "Abaixo do mínimo",
          titulo: p.name || p.product_code,
          detalhe: `${hub.label} · saldo ${qty.toLocaleString("pt-BR")} ${p.stock_unit}` +
            (min > 0 ? ` · mínimo ${min.toLocaleString("pt-BR")}` : ""),
          prioridade,
          action: { label: "Ver estoque", to: `/suprimentos/${hub.slug}/estoque` },
          action2: { label: "Requisitar", icon: ShoppingCart, go: () => navigate("/requisicoes", { state: { prefill: {
            descricao: p.name, quantidade: sugerido, unidade: p.stock_unit,
            motivo: qty <= 0 ? "ruptura" : "reposicao_safety", priority: qty <= 0 ? "critica" : "normal",
          } } }) },
        });
      }
    }

    // ── Pedidos: produzido sem mover, NF pendente, parado na etapa ───────────
    for (const o of posQ.data?.orders ?? []) {
      const stg = o.fulfillment_stage;
      if (TERMINAL.has(stg)) continue;
      // "parado há X" conta da troca de etapa (coluna própria, não poluída).
      const dias = diasDesde(o.stage_changed_at ?? o.updated_at ?? o.created_at);
      const titulo = `${o.customer_name} · ${o.order_number}`;
      const rastreio = { label: "Abrir rastreio", to: "/rastreio" };
      if (stg === "criar_op" && o.production_done) {
        out.push({ id: `prod-${o.id}`, area: "pedidos", tipo: "Produzido", titulo, dias,
          detalhe: `Produção concluída, falta mover para Em Separação · ${ha(dias)}`,
          prioridade: dias >= 2 ? "critical" : "high", action: rastreio });
      } else if (stg === "gerar_nf") {
        out.push({ id: `nf-${o.id}`, area: "pedidos", tipo: "NF", titulo, dias,
          detalhe: `Aguardando emissão da nota fiscal · ${ha(dias)}`,
          prioridade: dias >= 5 ? "high" : "medium", action: rastreio });
      } else if (dias >= PARADO_DIAS) {
        out.push({ id: `parado-${o.id}`, area: "pedidos", tipo: "Parado", titulo, dias,
          detalhe: `Em “${stageLabel(stg)}” ${ha(dias)}`,
          prioridade: dias >= 10 ? "critical" : dias >= 7 ? "high" : "medium", action: rastreio });
      }
    }

    // ── Produção: OP atrasada, OP parada, OP travada por insumo, gargalo ─────
    const producao = { label: "Abrir produção", to: "/producao/ordens" };
    const opTitulo = (op: { op_number?: string | null; product_code?: string | null; customer_name?: string | null }) =>
      [op.op_number ?? "OP", op.product_code ?? op.customer_name].filter(Boolean).join(" · ");
    for (const op of opsQ.data ?? []) {
      if (op.op_status === "concluida" || op.op_status === "cancelada") continue;
      if (op.need_date && op.need_date < hoje) {
        const atraso = diasDesde(op.need_date);
        out.push({ id: `op-${op.id}`, area: "producao", tipo: "Atrasada", titulo: opTitulo(op), dias: atraso,
          detalhe: `Prazo venceu em ${dataCurta(op.need_date)} · ${op.planned_quantity} un`,
          prioridade: atraso >= 3 ? "critical" : "high", action: producao });
        continue;
      }
      // Parada demais na etapa (independe de prazo) — pega OP interna sem data.
      const parado = diasDesde(op.stage_since);
      if (parado >= 2) {
        out.push({ id: `opdwell-${op.id}`, area: "producao", tipo: "Parada", titulo: opTitulo(op), dias: parado,
          detalhe: `Na mesma etapa ${ha(parado)} · ${op.planned_quantity} un`,
          prioridade: parado >= 10 ? "critical" : parado >= 5 ? "high" : "medium", action: producao });
      }
    }
    const INICIO = new Set(["rascunho", "planejada", "aguardando_separacao"]);
    const iniciais = (opsQ.data ?? []).filter((o) => INICIO.has(o.op_status));
    const veredito = producible.allocate(iniciais);
    for (const op of iniciais) {
      const v = veredito.get(op.id);
      if (v === "ok") {
        out.push({ id: `opready-${op.id}`, area: "producao", tipo: "Pronta", titulo: opTitulo(op),
          detalhe: `Insumos em estoque, pronta para separar · ${op.planned_quantity} un`,
          prioridade: "medium", action: producao });
      } else if (v === "falta") {
        out.push({ id: `opfalta-${op.id}`, area: "producao", tipo: "Falta insumo", titulo: opTitulo(op),
          detalhe: `Travada por insumo sem estoque · ${op.planned_quantity} un`,
          prioridade: "high", action: producao });
      }
    }
    for (const b of producible.bottlenecks) {
      out.push({ id: `gargalo-${b.insumoId}`, area: "producao", tipo: "Gargalo", titulo: b.name,
        detalhe: `Insumo zerado no Hub Natal · trava ${b.affected} ${b.affected === 1 ? "produção" : "produções"}`,
        prioridade: "critical", action: producao });
    }

    // ── Operação de campo ────────────────────────────────────────────────────
    // Venda de descarbonização sem OS: o serviço nunca chega a quem executa.
    for (const v of semOsQ.data ?? []) {
      const dias = diasDesde(v.sale_date);
      out.push({ id: `semos-${v.order_id}`, area: "campo", tipo: "Venda sem OS", dias,
        titulo: `${v.customer_name ?? "Cliente"}${v.order_number ? ` · ${v.order_number}` : ""}`,
        detalhe: `Venda${v.sale_date ? ` de ${dataCurta(v.sale_date)}` : ""} sem ordem de serviço` +
          (v.vendedor_name ? ` · ${v.vendedor_name}` : ""),
        prioridade: "critical", action: { label: "Abrir OS", to: "/os" } });
    }
    for (const os of osQ.data ?? []) {
      if (os.stage !== "nova" && os.stage !== "em_execucao") continue;
      const dia = diaDe(os.data_prevista);
      if (!dia || dia > hoje) continue;
      const atrasada = dia < hoje;
      const dias = atrasada ? diasDesde(dia) : 0;
      const titulo = [os.cliente_nome ?? "Cliente", os.numero].filter(Boolean).join(" · ");
      const veiculos = os.vagas > 1 ? ` · ${os.vagasExecutadas} de ${os.vagas} veículos` : "";
      out.push({ id: `os-${os.id}`, area: "campo", tipo: atrasada ? "Atrasada" : "Hoje", titulo, dias,
        detalhe: atrasada
          ? `Agendada para ${dataCurta(dia)} e ainda ${os.stage === "nova" ? "não iniciada" : "em execução"}${veiculos}`
          : `Agendada para hoje${veiculos}`,
        prioridade: atrasada ? (dias >= 3 ? "critical" : "high") : "medium",
        action: { label: "Abrir OS", to: atrasada ? "/os" : "/os?ver=agenda" } });
    }

    const peso = (p: Prioridade) => PRIO_ORDEM.indexOf(p);
    return out.sort((a, b) => peso(a.prioridade) - peso(b.prioridade) || (b.dias ?? 0) - (a.dias ?? 0));
  }, [stockQ.data, posQ.data, opsQ.data, osQ.data, semOsQ.data, producible, navigate]);

  // Cada contagem é feita com os OUTROS filtros aplicados e o dela solto —
  // senão a opção escolhida contaria só a si mesma.
  const q = busca.trim().toLowerCase();
  const casaBusca = (p: Pend) => !q || `${p.titulo} ${p.detalhe} ${p.tipo}`.toLowerCase().includes(q);
  const porArea = (a: Area) => pends.filter((p) => p.area === a && casaBusca(p) && (!prio || p.prioridade === prio));
  const porPrio = (pr: Prioridade | null) =>
    pends.filter((p) => (!pr || p.prioridade === pr) && casaBusca(p) && (!area || p.area === area)).length;
  const visiveis = pends.filter((p) => (!area || p.area === area) && (!prio || p.prioridade === prio) && casaBusca(p));
  const criticos = pends.filter((p) => p.prioridade === "critical").length;
  const filtrando = !!(area || prio || q);

  const alternarGrupo = (a: Area) => {
    const s = new Set(gruposAbertos);
    if (s.has(a)) s.delete(a); else s.add(a);
    setAbertos([...s].join(","));
  };

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-[1200px] space-y-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Alertas Operacionais</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {carregando ? "Lendo estoque, pedidos, produção e campo…"
                : pends.length === 0 ? "Nada esperando por ação agora"
                : `${pends.length} ${pends.length === 1 ? "pendência" : "pendências"}` +
                  (criticos ? ` · ${criticos} ${criticos === 1 ? "crítica" : "críticas"}` : "")}
            </p>
          </div>
          <Button variant="outline" size="sm" className="h-9 gap-2 self-start sm:self-auto" onClick={atualizar} disabled={atualizando}>
            <RefreshCw className={cn("h-4 w-4", atualizando && "animate-spin")} /> Atualizar
          </Button>
        </header>

        {falharam.length > 0 && (
          <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3.5 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="min-w-0">
              <p className="font-medium text-destructive">Não foi possível ler: {falharam.join(", ")}</p>
              <p className="text-xs text-muted-foreground">Os alertas dessas áreas não aparecem abaixo. Tente atualizar.</p>
            </div>
          </div>
        )}

        {/* Áreas — o cartão é o filtro */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {AREA_ORDEM.map((a) => {
            const cfg = AREAS[a];
            const itens = pends.filter((p) => p.area === a);
            const crit = itens.filter((p) => p.prioridade === "critical").length;
            const ativo = area === a;
            return (
              <button key={a} type="button" onClick={() => setArea(ativo ? "" : a)}
                className={cn(
                  "rounded-xl border bg-card px-4 py-3.5 text-left transition-colors hover:border-foreground/20",
                  ativo && "border-primary ring-1 ring-primary",
                )}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium text-muted-foreground">{cfg.label}</span>
                  <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", cfg.tone)}>
                    <cfg.icon className="h-3.5 w-3.5" />
                  </span>
                </div>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className="text-2xl font-semibold tabular-nums tracking-tight">{carregando ? "–" : itens.length}</span>
                  {crit > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />{crit} {crit === 1 ? "crítico" : "críticos"}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Busca + prioridade */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar produto, cliente, pedido ou OP" value={busca}
              onChange={(e) => setBusca(e.target.value)} className="h-9 pl-9" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex w-full rounded-lg border bg-muted/40 p-0.5 sm:inline-flex sm:w-auto">
              {([null, ...PRIO_ORDEM] as (Prioridade | null)[]).map((pr) => (
                <button key={pr ?? "todas"} type="button" onClick={() => setPrio(pr ?? "")}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-md px-1.5 py-1.5 text-xs font-medium transition-colors sm:flex-none sm:px-2.5",
                    prio === pr ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}>
                  {pr && <span className={cn("h-1.5 w-1.5 rounded-full", PRIO[pr].dot)} />}
                  {pr ? PRIO[pr].plural : "Todas"}
                  <span className="tabular-nums text-muted-foreground">{porPrio(pr)}</span>
                </button>
              ))}
            </div>
            {filtrando && (
              <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs"
                onClick={() => { setArea(""); setPrio(""); setBusca(""); }}>
                <X className="h-3.5 w-3.5" /> Limpar
              </Button>
            )}
          </div>
        </div>

        {carregando ? (
          <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando alertas…
          </div>
        ) : visiveis.length === 0 ? (
          <div className="rounded-xl border border-dashed py-20 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500/70" />
            <p className="mt-3 text-sm font-medium">{filtrando ? "Nenhum alerta neste filtro" : "Tudo em dia"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {filtrando ? "Tire um filtro para ver as outras pendências." : "Nenhuma pendência operacional aberta agora."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {AREA_ORDEM.filter((a) => !area || a === area).map((a) => {
              const itens = porArea(a);
              if (itens.length === 0) return null;
              const cfg = AREAS[a];
              // Filtrado numa área só, mostra tudo; na visão geral, os primeiros.
              const aberto = !!area || gruposAbertos.has(a);
              const mostrar = aberto ? itens : itens.slice(0, POR_GRUPO);
              return (
                <section key={a} className="overflow-hidden rounded-xl border bg-card">
                  <div className="flex items-center gap-2.5 border-b px-4 py-3">
                    <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", cfg.tone)}>
                      <cfg.icon className="h-3.5 w-3.5" />
                    </span>
                    <h2 className="text-sm font-semibold">{cfg.label}</h2>
                    <span className="rounded-full border bg-background px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                      {itens.length}
                    </span>
                  </div>
                  <ul className="divide-y">
                    {mostrar.map((p) => <Linha key={p.id} p={p} />)}
                  </ul>
                  {!area && itens.length > POR_GRUPO && (
                    <button type="button" onClick={() => alternarGrupo(a)}
                      className="w-full border-t px-4 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground">
                      {aberto ? "Mostrar menos" : `Mostrar mais ${itens.length - POR_GRUPO}`}
                    </button>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Linha({ p }: { p: Pend }) {
  const cfg = PRIO[p.prioridade];
  return (
    <li className="relative flex flex-col gap-2 py-3 pl-5 pr-4 sm:flex-row sm:items-center sm:gap-4">
      <span className={cn("absolute inset-y-2 left-0 w-1 rounded-r", cfg.bar)} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start gap-2">
          <p className="line-clamp-2 break-words text-sm font-medium" title={p.titulo}>{p.titulo}</p>
          <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", cfg.chip)}>
            {p.tipo}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground" title={p.detalhe}>{p.detalhe}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-auto">
        {p.action2 && (
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={p.action2.go}>
            <p.action2.icon className="h-3.5 w-3.5" /> {p.action2.label}
          </Button>
        )}
        <Button asChild variant="ghost" size="sm" className="h-8 gap-1 text-xs">
          <Link to={p.action.to}>{p.action.label} <ChevronRight className="h-3.5 w-3.5" /></Link>
        </Button>
      </div>
    </li>
  );
}
