import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { addMonths, format, startOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart3, Send, CheckCircle2, Percent, TrendingUp, Timer, ChevronLeft, ChevronRight,
} from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useRepasses, useLeadsSdr, type Repasse } from "@/hooks/useResultados";
import { FUNNEL_CONFIG, isWonStage, isLostStage, stageLabelAnywhere } from "@/types/crm";

// ─────────────────────────────────────────────────────────────────────────────
// Resultados — o que aconteceu com o que o SDR passou ao closer.
//
// Tudo aqui é COORTE pela data do repasse: "dos que repassei em outubro, quantos
// fecharam", mesmo que tenham fechado em novembro. É o que mantém a conversão
// honesta — contar fechamentos do mês sobre repasses do mês misturaria leads
// de meses diferentes e a taxa passaria de 100%.
//
// O SDR vê os PRÓPRIOS repasses. O gestor vê todos e escolhe um SDR. A visão do
// closer ("o que eu recebi do meu SDR") é uma segunda tela, combinada para
// depois — por isso quem não é gestor vê só o que ELE repassou, mesmo que a
// função também devolva o que ele recebeu como closer.
// ─────────────────────────────────────────────────────────────────────────────

const CLOSER = FUNNEL_CONFIG.f15;

const COR = {
  fechado: "#22C55E",
  andamento: "#3B82F6",
  fila: "#F59E0B",
  perdido: "#EF4444",
};

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : null);
const fmtPct = (v: number | null) => (v == null ? "—" : `${v}%`);

const DIA = 24 * 60 * 60 * 1000;
function dias(desde: string, ate: Date | string = new Date()) {
  const fim = typeof ate === "string" ? new Date(ate) : ate;
  return Math.max(0, (fim.getTime() - new Date(desde).getTime()) / DIA);
}
function fmtIdade(d: number) {
  const n = Math.floor(d);
  return n === 0 ? "hoje" : n === 1 ? "1 dia" : `${n} dias`;
}
function fmtDuracao(d: number | null) {
  if (d == null) return "—";
  if (d < 1) return "< 1 dia";
  return `${d.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias`;
}

type Situacao = "fechado" | "perdido" | "fila" | "andamento";
const situacaoDe = (r: Repasse): Situacao =>
  isWonStage(r.etapa) ? "fechado"
    : isLostStage(r.etapa) ? "perdido"
    : !r.closer_id ? "fila"
    : "andamento";

/** Os números de um recorte de repasses — a mesma conta para o topo e para cada linha das tabelas. */
function resumo(lista: Repasse[]) {
  const fechados = lista.filter((r) => situacaoDe(r) === "fechado");
  const tempos = fechados.filter((r) => r.ganho_em).map((r) => dias(r.repassado_em, r.ganho_em!));
  return {
    total: lista.length,
    fechados: fechados.length,
    perdidos: lista.filter((r) => situacaoDe(r) === "perdido").length,
    fila: lista.filter((r) => situacaoDe(r) === "fila").length,
    andamento: lista.filter((r) => situacaoDe(r) === "andamento").length,
    receita: lista.reduce((s, r) => s + r.valor_vendido, 0),
    tempoMedio: tempos.length ? tempos.reduce((s, d) => s + d, 0) / tempos.length : null,
  };
}

function Secao({ titulo, direita, children, className = "" }: {
  titulo: string; direita?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-xl border bg-card ${className}`}>
      <header className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
        <h2 className="text-sm font-semibold">{titulo}</h2>
        {direita}
      </header>
      {children}
    </section>
  );
}

const th = "px-5 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground";

export default function Resultados() {
  const navigate = useNavigate();
  const { user, isGestor } = useAuth();
  const [mes, setMes] = useState(() => startOfMonth(new Date()));
  const [sdrSel, setSdrSel] = useState("todos");

  const repassesQ = useRepasses(mes, user?.id);
  const leadsQ = useLeadsSdr(mes, user?.id);
  const carregando = repassesQ.isLoading || leadsQ.isLoading;
  const erro = (repassesQ.error ?? leadsQ.error) as Error | null;

  const noMesAtual = startOfMonth(new Date()).getTime() <= mes.getTime();
  const rotuloMes = format(mes, "MMMM 'de' yyyy", { locale: ptBR });
  const rotuloMesTitulo = rotuloMes.charAt(0).toUpperCase() + rotuloMes.slice(1);

  // SDRs que aparecem no mês — o seletor do gestor só oferece quem tem número.
  const sdrs = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of repassesQ.data ?? []) if (r.sdr_id) m.set(r.sdr_id, r.sdr_nome ?? "—");
    return Array.from(m, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [repassesQ.data]);

  // Quem está sendo olhado: o próprio SDR, ou o escolhido pelo gestor.
  const alvo = isGestor ? (sdrSel === "todos" ? null : sdrSel) : user?.id ?? null;
  const visaoGeral = isGestor && alvo == null;

  const repasses = useMemo(
    () => (repassesQ.data ?? []).filter((r) => (alvo ? r.sdr_id === alvo : true)),
    [repassesQ.data, alvo],
  );
  const leads = useMemo(
    () => (leadsQ.data ?? []).filter((l) => (alvo ? (l.assigned_to ?? l.created_by) === alvo : true)),
    [leadsQ.data, alvo],
  );

  const r = useMemo(() => resumo(repasses), [repasses]);
  const conversao = pct(r.fechados, r.total);

  const prospeccao = useMemo(() => ({
    criados: leads.length,
    repassados: leads.filter((l) => l.stage === "repassado").length,
    descartados: leads.filter((l) => isLostStage(l.stage)).length,
  }), [leads]);

  const porCloser = useMemo(() => {
    const m = new Map<string, { nome: string; lista: Repasse[] }>();
    for (const x of repasses) {
      if (!x.closer_id) continue;
      const e = m.get(x.closer_id) ?? { nome: x.closer_nome ?? "—", lista: [] };
      e.lista.push(x);
      m.set(x.closer_id, e);
    }
    return Array.from(m.values())
      .map((e) => ({ nome: e.nome, ...resumo(e.lista) }))
      .sort((a, b) => b.total - a.total || b.fechados - a.fechados);
  }, [repasses]);

  const porSdr = useMemo(() => {
    const m = new Map<string, { nome: string; lista: Repasse[] }>();
    for (const x of repasses) {
      const k = x.sdr_id ?? "—";
      const e = m.get(k) ?? { nome: x.sdr_nome ?? "—", lista: [] };
      e.lista.push(x);
      m.set(k, e);
    }
    return Array.from(m.values())
      .map((e) => ({ nome: e.nome, ...resumo(e.lista) }))
      .sort((a, b) => b.total - a.total || b.fechados - a.fechados);
  }, [repasses]);

  // Os que estão com o closer agora, por etapa, na ORDEM da pipeline dele.
  const porEtapa = useMemo(() => {
    const abertos = repasses.filter((x) => situacaoDe(x) === "andamento");
    return CLOSER.stages
      .filter((s) => !isWonStage(s.id) && !isLostStage(s.id))
      .map((s) => ({ ...s, qtd: abertos.filter((x) => x.etapa === s.id).length }))
      .filter((s) => s.qtd > 0);
  }, [repasses]);
  const maxEtapa = Math.max(1, ...porEtapa.map((s) => s.qtd));

  const situacoes: { id: Situacao; rotulo: string; qtd: number }[] = [
    { id: "fechado", rotulo: "Fechados", qtd: r.fechados },
    { id: "andamento", rotulo: "Em negociação", qtd: r.andamento },
    { id: "fila", rotulo: "Na fila, sem closer", qtd: r.fila },
    { id: "perdido", rotulo: "Perdidos", qtd: r.perdidos },
  ];

  const filtros = (
    <div className="flex flex-wrap items-center gap-2">
      {isGestor && (
        <Select value={sdrSel} onValueChange={setSdrSel}>
          <SelectTrigger className="h-9 w-[200px]"><SelectValue placeholder="Todos os SDRs" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os SDRs</SelectItem>
            {sdrs.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      <div className="flex items-center rounded-lg border">
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setMes((m) => subMonths(m, 1))} aria-label="Mês anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-[150px] text-center text-sm font-medium">{rotuloMesTitulo}</span>
        <Button variant="ghost" size="icon" className="h-9 w-9" disabled={noMesAtual}
          onClick={() => setMes((m) => addMonths(m, 1))} aria-label="Próximo mês">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 p-4 md:p-6">
      <CarboPageHeader title="Resultados" description="Do repasse ao fechamento" icon={BarChart3} actions={filtros} />

      {erro && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          Não foi possível carregar os resultados: {erro.message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <CarboKPI title="Repassados" value={r.total} icon={Send} iconColor="blue" loading={carregando} />
        <CarboKPI title="Fechados" value={r.fechados} icon={CheckCircle2} iconColor="success" loading={carregando} />
        <CarboKPI title="Conversão" value={fmtPct(conversao)} icon={Percent} iconColor="green" loading={carregando} />
        <CarboKPI title="Receita gerada" value={brl(r.receita)} icon={TrendingUp} iconColor="green" loading={carregando} />
        <CarboKPI title="Tempo até fechar" value={fmtDuracao(r.tempoMedio)} icon={Timer} iconColor="muted" loading={carregando} />
      </div>

      {!carregando && r.total === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-14 text-center text-sm text-muted-foreground">
          Nenhum lead repassado em {rotuloMes}.
        </div>
      ) : !carregando && (
        <>
          <div className="grid gap-4 lg:grid-cols-5">
            <Secao titulo="Situação dos repassados" className="lg:col-span-2">
              <div className="space-y-5 px-5 py-4">
                <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                  {situacoes.filter((s) => s.qtd > 0).map((s) => (
                    <div key={s.id} style={{ width: `${(s.qtd / r.total) * 100}%`, background: COR[s.id] }} />
                  ))}
                </div>
                <ul className="space-y-2.5">
                  {situacoes.map((s) => (
                    <li key={s.id} className="flex items-center gap-2.5 text-sm">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COR[s.id] }} />
                      <span className="flex-1 text-muted-foreground">{s.rotulo}</span>
                      <span className="font-semibold tabular-nums">{s.qtd}</span>
                      <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{fmtPct(pct(s.qtd, r.total))}</span>
                    </li>
                  ))}
                </ul>

                {porEtapa.length > 0 && (
                  <div className="space-y-2.5 border-t pt-4">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Em negociação, por etapa</p>
                    {porEtapa.map((s) => (
                      <div key={s.id} className="flex items-center gap-3 text-sm">
                        <span className="w-32 shrink-0 truncate text-muted-foreground">{s.label}</span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full" style={{ width: `${(s.qtd / maxEtapa) * 100}%`, background: s.color }} />
                        </div>
                        <span className="w-6 text-right font-semibold tabular-nums">{s.qtd}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Secao>

            <Secao titulo="Por closer" className="lg:col-span-3">
              <TabelaResumo linhas={porCloser} rotulo="Closer" rotuloTotal="Recebidos"
                rodape={r.fila > 0 ? `${r.fila} ${r.fila === 1 ? "lead aguarda" : "leads aguardam"} um closer pegar na fila.` : null} />
            </Secao>
          </div>

          {visaoGeral && porSdr.length > 1 && (
            <Secao titulo="Por SDR">
              <TabelaResumo linhas={porSdr} rotulo="SDR" rotuloTotal="Repassados" />
            </Secao>
          )}

          <Secao titulo="Antes do repasse">
            <div className="grid grid-cols-3 divide-x">
              {[
                { rotulo: "Leads criados", valor: String(prospeccao.criados) },
                { rotulo: "Descartados", valor: String(prospeccao.descartados) },
                { rotulo: "Taxa de repasse", valor: fmtPct(pct(prospeccao.repassados, prospeccao.criados)) },
              ].map((x) => (
                <div key={x.rotulo} className="px-5 py-4">
                  <p className="text-2xl font-bold tabular-nums">{x.valor}</p>
                  <p className="text-xs text-muted-foreground">{x.rotulo}</p>
                </div>
              ))}
            </div>
          </Secao>

          <Secao titulo="Repasses" direita={<span className="text-xs tabular-nums text-muted-foreground">{r.total}</span>}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr className="text-left">
                    <th className={th}>Lead</th>
                    <th className={th}>Repassado</th>
                    {visaoGeral && <th className={th}>SDR</th>}
                    <th className={th}>Closer</th>
                    <th className={th}>Etapa</th>
                    <th className={`${th} text-right`}>Vendido</th>
                  </tr>
                </thead>
                <tbody>
                  {repasses.map((x) => {
                    const etapa = CLOSER.stages.find((s) => s.id === x.etapa);
                    const cor = etapa?.color ?? "#94A3B8";
                    return (
                      <tr key={x.lead_id}
                        onClick={() => navigate(`/crm/pipelines?funil=f15&lead=${x.lead_id}`)}
                        className="cursor-pointer border-b last:border-0 hover:bg-muted/40">
                        <td className="max-w-[260px] truncate px-5 py-3 font-medium">
                          {/* Link de verdade no nome: Ctrl/meio-clique abre o card em
                              outra aba. O stopPropagation evita que a linha navegue
                              junto na aba atual. */}
                          <Link to={`/crm/pipelines?funil=f15&lead=${x.lead_id}`}
                            onClick={(e) => e.stopPropagation()} className="hover:underline">
                            {x.cliente}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">
                          {format(new Date(x.repassado_em), "dd/MM")}
                          <span className="ml-1.5 text-xs">· {fmtIdade(dias(x.repassado_em))}</span>
                        </td>
                        {visaoGeral && <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">{x.sdr_nome ?? "—"}</td>}
                        <td className="whitespace-nowrap px-5 py-3">
                          {x.closer_id
                            ? <span className="text-muted-foreground">{x.closer_nome ?? "—"}</span>
                            : <span className="text-amber-500">Na fila</span>}
                        </td>
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{ background: cor + "1f", color: cor }}>
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: cor }} />
                            {stageLabelAnywhere(x.etapa, "f15")}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums">
                          {x.valor_vendido > 0 ? brl(x.valor_vendido) : <span className="text-muted-foreground">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Secao>
        </>
      )}
    </div>
  );
}

function TabelaResumo({ linhas, rotulo, rotuloTotal, rodape }: {
  linhas: (ReturnType<typeof resumo> & { nome: string })[];
  rotulo: string;
  rotuloTotal: string;
  rodape?: string | null;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b">
          <tr className="text-left">
            <th className={th}>{rotulo}</th>
            <th className={`${th} text-right`}>{rotuloTotal}</th>
            <th className={`${th} text-right`}>Fechados</th>
            <th className={`${th} text-right`}>Conversão</th>
            <th className={`${th} text-right`}>Receita</th>
          </tr>
        </thead>
        <tbody>
          {linhas.length === 0 ? (
            <tr><td colSpan={5} className="px-5 py-6 text-center text-muted-foreground">Ninguém pegou os repasses ainda.</td></tr>
          ) : linhas.map((l) => (
            <tr key={l.nome} className="border-b last:border-0">
              <td className="whitespace-nowrap px-5 py-3 font-medium">{l.nome}</td>
              <td className="px-5 py-3 text-right tabular-nums">{l.total}</td>
              <td className="px-5 py-3 text-right tabular-nums">{l.fechados}</td>
              <td className="px-5 py-3 text-right tabular-nums">{fmtPct(pct(l.fechados, l.total))}</td>
              <td className="px-5 py-3 text-right tabular-nums">{brl(l.receita)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rodape && <p className="border-t px-5 py-2.5 text-xs text-amber-500">{rodape}</p>}
    </div>
  );
}
