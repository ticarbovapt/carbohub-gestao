import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ClipboardList, Calendar, Zap, CheckCircle2, Search, LayoutGrid, List, Plus, RefreshCw, Loader2, AlertTriangle, Car } from "lucide-react";
import { NovaDescarbonizacaoDialog } from "@/components/NovaDescarbonizacaoDialog";
import { useOS, useVendasSemOS, type OSRow } from "@/hooks/useOS";

// Acompanhamento das descarbonizações (B2C · B2B · Frota). ESPELHO ao vivo da
// OS do Carbox/Licenciados (fonte de verdade). O Sales cria e acompanha; a
// EXECUÇÃO (avançar estágio, fotos) é feita no portal Licenciados.

// Estágios do kanban = os do licenciados: Nova OS → Em Execução → Concluída.
const OS_STAGES = [
  { id: "nova", label: "Nova OS", emoji: "📥", color: "#64748b" },
  { id: "em_execucao", label: "Em Execução", emoji: "⚙️", color: "#8b5cf6" },
  { id: "concluida", label: "Concluída", emoji: "✔️", color: "#22c55e" },
];

// Metadados por estágio (inclui 'cancelada', que fica fora do kanban).
const STAGE_META: Record<string, { label: string; emoji: string; color: string }> = {
  nova: { label: "Nova OS", emoji: "📥", color: "#64748b" },
  em_execucao: { label: "Em Execução", emoji: "⚙️", color: "#8b5cf6" },
  concluida: { label: "Concluída", emoji: "✔️", color: "#22c55e" },
  cancelada: { label: "Cancelada", emoji: "🚫", color: "#ef4444" },
};

const TIPO_LABEL: Record<string, string> = { b2c: "B2C", b2b: "B2B", frota: "Frota" };

interface OSView {
  id: string; numero: string; cliente: string; tipo: string; veiculo: string;
  agendamento: string | null; stage: string;
  vagas: number; vagasExecutadas: number; portes: string;
  pedido: string | null; valor: number | null;
}

const dt = (s: string | null) => (s ? new Date(s).toLocaleDateString("pt-BR") : "—");
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

// "5P · 3M · 1G" — a leitura mais rápida do que a OS tem para fazer.
const portesLabel = (p: Record<string, number>) =>
  ["P", "M", "G", "—"].filter((k) => p[k]).map((k) => `${p[k]}${k === "—" ? "" : k}`).join(" · ");

function toView(o: OSRow): OSView {
  const veiculo = [o.placa, o.modelo].filter(Boolean).join(" · ") || "—";
  return {
    id: o.id,
    // Número padronizado da OS (DESCAAAAMMXXXX). Cai no título/id só se ainda não tiver.
    numero: o.numero?.trim() || o.titulo?.trim() || `OS-${o.id.slice(0, 8)}`,
    cliente: o.cliente_nome || "—",
    tipo: TIPO_LABEL[o.tipo] ?? o.tipo,
    veiculo,
    agendamento: o.data_prevista,
    stage: o.stage,
    vagas: o.vagas,
    vagasExecutadas: o.vagasExecutadas,
    portes: portesLabel(o.portes),
    pedido: o.saleOrderNumber,
    valor: o.saleTotal,
  };
}

export default function OrdensServico() {
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, isError, refetch, isFetching } = useOS();
  const { data: semOS = [] } = useVendasSemOS();
  const all = useMemo(() => (data ?? []).map(toView), [data]);

  const filtered = useMemo(() => all.filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return o.numero.toLowerCase().includes(q) || o.cliente.toLowerCase().includes(q) || o.veiculo.toLowerCase().includes(q);
  }), [all, search]);

  const stats = useMemo(() => {
    const now = new Date();
    const today = now.toDateString();
    const isSameMonth = (d: Date) => d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    return {
      total: all.filter((o) => o.stage !== "concluida" && o.stage !== "cancelada").length,
      agendadasHoje: all.filter((o) => o.agendamento && new Date(o.agendamento).toDateString() === today).length,
      emExecucao: all.filter((o) => o.stage === "em_execucao").length,
      concluidasMes: all.filter((o) => o.stage === "concluida" && o.agendamento && isSameMonth(new Date(o.agendamento))).length,
    };
  }, [all]);

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-6 max-w-[1600px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3"><ClipboardList className="h-6 w-6 text-purple-500" /> Ordens de Serviço</h1>
            <p className="text-muted-foreground mt-1">Descarbonização CarboVAPT — B2C · B2B · Frota</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1"><RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /></Button>
            <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-2 bg-purple-600 hover:bg-purple-700 text-white"><Plus className="h-4 w-4" /> Nova Descarbonização</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl border bg-card p-4 space-y-1"><div className="flex items-center gap-2 text-muted-foreground text-sm"><ClipboardList className="h-4 w-4" /><span>OS Ativas</span></div><p className="text-2xl font-bold">{stats.total}</p></div>
          <div className="rounded-xl border bg-card p-4 space-y-1"><div className="flex items-center gap-2 text-amber-500 text-sm"><Calendar className="h-4 w-4" /><span>Agendadas Hoje</span></div><p className="text-2xl font-bold text-amber-600">{stats.agendadasHoje}</p></div>
          <div className="rounded-xl border bg-card p-4 space-y-1"><div className="flex items-center gap-2 text-purple-500 text-sm"><Zap className="h-4 w-4" /><span>Em Execução</span></div><p className="text-2xl font-bold text-purple-600">{stats.emExecucao}</p></div>
          <div className="rounded-xl border bg-card p-4 space-y-1"><div className="flex items-center gap-2 text-green-500 text-sm"><CheckCircle2 className="h-4 w-4" /><span>Concluídas (mês)</span></div><p className="text-2xl font-bold text-green-600">{stats.concluidasMes}</p></div>
        </div>

        {/* Vendas de descarbonização que não geraram OS. Sem isto, uma falha na
            criação vira um toast que some e o serviço nunca é executado. */}
        {semOS.length > 0 && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 overflow-hidden">
            <div className="flex items-start gap-3 p-4">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-600">
                  {semOS.length} venda(s) de descarbonização sem OS
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Foram vendidas mas não têm ordem de serviço — ninguém vai executar. Abra a OS manualmente em “Nova Descarbonização”.
                </p>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        {["Pedido", "Cliente", "Vendedor", "Valor", "Venda", "Execução"].map((h) => (
                          <th key={h} className="text-left font-medium pb-1 pr-4 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {semOS.slice(0, 8).map((v) => (
                        <tr key={v.order_id} className="border-t border-amber-500/20">
                          <td className="py-1.5 pr-4 font-mono whitespace-nowrap">{v.order_number ?? "—"}</td>
                          <td className="py-1.5 pr-4 font-medium truncate max-w-[180px]">{v.customer_name ?? "—"}</td>
                          <td className="py-1.5 pr-4 text-muted-foreground whitespace-nowrap">{v.vendedor_name ?? "—"}</td>
                          <td className="py-1.5 pr-4 tabular-nums whitespace-nowrap">{brl(v.valor_descarb)}</td>
                          <td className="py-1.5 pr-4 text-muted-foreground whitespace-nowrap">{dt(v.sale_date)}</td>
                          <td className="py-1.5 pr-4 text-muted-foreground whitespace-nowrap">{dt(v.execution_date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {semOS.length > 8 && (
                    <p className="text-[11px] text-muted-foreground mt-2">
                      e mais {semOS.length - 8}…
                    </p>
                  )}
                </div>
              </div>
              <Button size="sm" onClick={() => setCreateOpen(true)}
                className="shrink-0 gap-1.5 bg-amber-500 hover:bg-amber-600 text-white">
                <Plus className="h-3.5 w-3.5" /> Abrir OS
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por OS, cliente, placa..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex rounded-lg border overflow-hidden">
            <button onClick={() => setViewMode("kanban")} className={`px-3 py-2 text-xs flex items-center gap-1.5 transition-colors ${viewMode === "kanban" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}><LayoutGrid className="h-3.5 w-3.5" /> Kanban</button>
            <button onClick={() => setViewMode("list")} className={`px-3 py-2 text-xs flex items-center gap-1.5 border-l transition-colors ${viewMode === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}><List className="h-3.5 w-3.5" /> Lista</button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Carregando ordens de serviço...</div>
        ) : isError ? (
          <div className="text-center py-20 text-sm text-destructive">Erro ao carregar as ordens de serviço.</div>
        ) : all.length === 0 ? (
          <div className="text-center py-20 space-y-3">
            <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Nenhuma ordem de serviço ainda.</p>
            <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-2 bg-purple-600 hover:bg-purple-700 text-white"><Plus className="h-4 w-4" /> Nova Descarbonização</Button>
          </div>
        ) : viewMode === "kanban" ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {OS_STAGES.map((col) => {
              const items = filtered.filter((o) => o.stage === col.id);
              return (
                <div key={col.id} className="rounded-2xl border border-border bg-muted/20 flex flex-col min-h-[160px]">
                  <div className="rounded-t-2xl px-3 py-2.5 border-b border-border flex items-center justify-between" style={{ background: col.color + "12" }}>
                    <span className="text-sm font-semibold flex items-center gap-1.5">{col.emoji} {col.label}</span>
                    <span className="text-xs font-bold rounded-full px-2 py-0.5" style={{ background: col.color + "20", color: col.color }}>{items.length}</span>
                  </div>
                  <div className="p-2 space-y-2 min-h-[70px]">
                    {items.map((o) => (
                      <div key={o.id} className="rounded-xl border border-border bg-card p-3 relative overflow-hidden">
                        <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: col.color }} />
                        <div className="pl-1.5">
                          <span className="font-mono text-xs font-medium text-purple-500">{o.numero}</span>
                          <p className="text-sm font-semibold mt-0.5 truncate">{o.cliente}</p>
                          <p className="text-xs text-muted-foreground">{o.tipo}{o.veiculo !== "—" ? ` · ${o.veiculo}` : ""}</p>

                          {/* Quantos carros e de que porte — o que o Carbox
                              precisa saber antes de abrir a OS. */}
                          {o.vagas > 0 && (
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                              <span className="inline-flex items-center gap-1 font-medium">
                                <Car className="h-3 w-3" />
                                {o.vagasExecutadas}/{o.vagas} executado(s)
                              </span>
                              {o.portes && <span className="text-muted-foreground">{o.portes}</span>}
                            </div>
                          )}
                          {o.vagas > 1 && (
                            <div className="mt-1 h-1 w-full rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full bg-purple-500 transition-all"
                                style={{ width: `${Math.round((o.vagasExecutadas / o.vagas) * 100)}%` }} />
                            </div>
                          )}

                          {o.pedido && (
                            <p className="mt-1.5 text-[10px] text-muted-foreground">
                              Pedido <span className="font-mono">{o.pedido}</span>
                              {o.valor != null && o.valor > 0 ? ` · ${brl(o.valor)}` : ""}
                            </p>
                          )}
                          {o.agendamento && <p className="text-[10px] text-muted-foreground mt-1">📅 {dt(o.agendamento)}</p>}
                        </div>
                      </div>
                    ))}
                    {items.length === 0 && <p className="text-[11px] text-muted-foreground/50 text-center py-3">Vazio</p>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr>
                {["OS #", "Pedido", "Cliente", "Tipo", "Veículos", "Agendamento", "Etapa"].map((h) => <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y">
                {filtered.map((o) => {
                  const st = STAGE_META[o.stage] ?? { label: o.stage, emoji: "•", color: "#64748b" };
                  return (
                    <tr key={o.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-purple-500 font-medium">{o.numero}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {o.pedido ?? <span className="italic">manual</span>}
                      </td>
                      <td className="px-4 py-3 font-medium">{o.cliente}</td>
                      <td className="px-4 py-3 text-muted-foreground">{o.tipo}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {o.vagas > 0
                          ? <span>{o.vagasExecutadas}/{o.vagas}{o.portes ? ` · ${o.portes}` : ""}</span>
                          : o.veiculo}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{dt(o.agendamento)}</td>
                      <td className="px-4 py-3"><span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: st.color + "20", color: st.color }}>{st.emoji} {st.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground text-center">{all.length} ordem(ns) de serviço · agendamento e execução entram nas próximas fases.</p>
      </div>

      <NovaDescarbonizacaoDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
