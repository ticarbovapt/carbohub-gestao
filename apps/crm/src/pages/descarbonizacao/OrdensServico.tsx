import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ClipboardList, CalendarDays, Zap, CheckCircle2, Search, LayoutGrid, List, Plus,
  RefreshCw, Loader2, AlertTriangle, Calendar,
} from "lucide-react";
import { useParamUrl } from "@carbo/shell";
import { cn } from "@/lib/utils";
import { NovaDescarbonizacaoDialog } from "@/components/NovaDescarbonizacaoDialog";
import { useOS, useVendasSemOS } from "@/hooks/useOS";
import { toView, parseData, dt, brl } from "@/components/os/osView";
import { OSKanban } from "@/components/os/OSKanban";
import { OSLista } from "@/components/os/OSLista";
import { OSAgenda } from "@/components/os/OSAgenda";

// Espelho ao vivo da OS do portal de Licenciados (fonte de verdade): o Sales
// cria e acompanha; a execução acontece lá.

type Visao = "quadro" | "lista" | "agenda";

const VISOES: { id: Visao; label: string; icon: typeof LayoutGrid }[] = [
  { id: "quadro", label: "Quadro", icon: LayoutGrid },
  { id: "lista", label: "Lista", icon: List },
  { id: "agenda", label: "Agenda", icon: CalendarDays },
];

function Kpi({ icon: Icon, label, value, tone }: {
  icon: typeof ClipboardList; label: string; value: number; tone: string;
}) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-muted-foreground">{label}</span>
        <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", tone)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
    </div>
  );
}

export default function OrdensServico() {
  const [busca, setBusca] = useParamUrl("busca", "", { replace: true });
  const [visaoUrl, setVisao] = useParamUrl("ver", "quadro");
  const visao: Visao = VISOES.some((v) => v.id === visaoUrl) ? (visaoUrl as Visao) : "quadro";
  const [createOpen, setCreateOpen] = useState(false);
  const [semOsAberto, setSemOsAberto] = useState(false);

  const { data, isLoading, isError, refetch, isFetching } = useOS();
  const { data: semOS = [] } = useVendasSemOS();
  const all = useMemo(() => (data ?? []).map(toView), [data]);

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return all;
    return all.filter((o) =>
      [o.numero, o.cliente, o.veiculo ?? "", o.pedido ?? ""].some((c) => c.toLowerCase().includes(q)));
  }, [all, busca]);

  const stats = useMemo(() => {
    const now = new Date();
    const hoje = now.toDateString();
    const noMes = (d: Date) => d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    return {
      abertas: all.filter((o) => o.stage !== "concluida" && o.stage !== "cancelada").length,
      hoje: all.filter((o) => o.agendamento && parseData(o.agendamento).toDateString() === hoje).length,
      execucao: all.filter((o) => o.stage === "em_execucao").length,
      concluidasMes: all.filter((o) => o.stage === "concluida" && o.agendamento && noMes(parseData(o.agendamento))).length,
    };
  }, [all]);

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Ordens de Serviço</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Descarbonização CarboVAPT</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => refetch()} title="Atualizar">
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            </Button>
            <Button onClick={() => setCreateOpen(true)} className="h-9 gap-2 bg-violet-600 text-white hover:bg-violet-700">
              <Plus className="h-4 w-4" /> Nova descarbonização
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi icon={ClipboardList} label="Em aberto" value={stats.abertas} tone="bg-slate-500/10 text-slate-600 dark:text-slate-300" />
          <Kpi icon={Calendar} label="Agendadas hoje" value={stats.hoje} tone="bg-amber-500/10 text-amber-600 dark:text-amber-400" />
          <Kpi icon={Zap} label="Em execução" value={stats.execucao} tone="bg-violet-500/10 text-violet-600 dark:text-violet-400" />
          <Kpi icon={CheckCircle2} label="Concluídas no mês" value={stats.concluidasMes} tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" />
        </div>

        {/* Venda de descarbonização sem OS: sem isto, a falha na criação vira um
            toast que some e o serviço nunca é executado. */}
        {semOS.length > 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06]">
            <div className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {semOS.length === 1 ? "1 venda sem ordem de serviço" : `${semOS.length} vendas sem ordem de serviço`}
                  </p>
                  <p className="text-xs text-muted-foreground">Sem a OS, o serviço não chega a quem executa.</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setSemOsAberto((v) => !v)}>
                  {semOsAberto ? "Ocultar" : "Ver vendas"}
                </Button>
                <Button size="sm" onClick={() => setCreateOpen(true)} className="h-8 gap-1.5 bg-amber-500 text-xs text-white hover:bg-amber-600">
                  <Plus className="h-3.5 w-3.5" /> Abrir OS
                </Button>
              </div>
            </div>
            {semOsAberto && (
              <div className="overflow-x-auto border-t border-amber-500/20">
                <table className="w-full min-w-[640px] text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      {["Pedido", "Cliente", "Vendedor", "Valor", "Venda", "Execução"].map((h) => (
                        <th key={h} className="whitespace-nowrap px-3.5 py-2 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {semOS.map((v) => (
                      <tr key={v.order_id} className="border-t border-amber-500/10">
                        <td className="whitespace-nowrap px-3.5 py-2 font-mono">{v.order_number ?? "—"}</td>
                        <td className="max-w-[220px] truncate px-3.5 py-2 font-medium">{v.customer_name ?? "—"}</td>
                        <td className="whitespace-nowrap px-3.5 py-2 text-muted-foreground">{v.vendedor_name ?? "—"}</td>
                        <td className="whitespace-nowrap px-3.5 py-2 tabular-nums">{brl(v.valor_descarb)}</td>
                        <td className="whitespace-nowrap px-3.5 py-2 text-muted-foreground">{dt(v.sale_date)}</td>
                        <td className="whitespace-nowrap px-3.5 py-2 text-muted-foreground">{dt(v.execution_date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar OS, cliente, placa ou pedido" value={busca}
              onChange={(e) => setBusca(e.target.value)} className="h-9 pl-9" />
          </div>
          <div className="inline-flex self-start rounded-lg border bg-muted/40 p-0.5 sm:self-auto">
            {VISOES.map((v) => (
              <button key={v.id} onClick={() => setVisao(v.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  visao === v.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}>
                <v.icon className="h-3.5 w-3.5" /> {v.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando ordens de serviço…
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 py-16 text-center text-sm text-destructive">
            Não foi possível carregar as ordens de serviço.
            <Button variant="link" size="sm" onClick={() => refetch()}>Tentar de novo</Button>
          </div>
        ) : all.length === 0 ? (
          <div className="rounded-xl border border-dashed py-20 text-center">
            <ClipboardList className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">Nenhuma ordem de serviço ainda.</p>
            <Button size="sm" onClick={() => setCreateOpen(true)} className="mt-4 gap-2 bg-violet-600 text-white hover:bg-violet-700">
              <Plus className="h-4 w-4" /> Nova descarbonização
            </Button>
          </div>
        ) : visao === "quadro" ? (
          <OSKanban items={filtered} />
        ) : visao === "lista" ? (
          <OSLista items={filtered} />
        ) : (
          <OSAgenda items={filtered} />
        )}
      </div>

      <NovaDescarbonizacaoDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
