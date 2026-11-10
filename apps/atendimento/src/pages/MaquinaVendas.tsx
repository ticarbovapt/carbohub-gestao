import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Clock, KanbanSquare, List, MapPin, Plus, Search, Wrench,
} from "lucide-react";
import { QuadroRolavel, useParamUrl } from "@carbo/shell";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LeadPainel } from "@/components/mv/LeadPainel";
import { erroDeLeitura, useMvAtualizar, useMvLeads, useMvPessoas } from "@/hooks/useMaquinaVendas";
import {
  COR_ETAPA, ETAPAS, ROTULO_ETAPA, ROTULO_PAGO, casaBusca, diaDe, diasSemContato, ehEtapa, estaParado, faltaParaEtapa,
  fmtBRL, fmtDia, fmtHora, hoje, proximaEtapa, resumir, segundaDa, somarDias, type Etapa, type MvLead, type Pessoa,
} from "@/lib/maquinaVendas";

// ─────────────────────────────────────────────────────────────────────────────
// Máquina de Vendas — o pipeline das descarbonizações (`/maquina-de-vendas`).
// Substitui o Notion. Banco: migração 20261153 (`mv_leads`).
//
// Estado na URL (F5 e link mandado no chat abrem a MESMA tela):
//   ?ver=quadro|lista|agenda      (ausente = quadro)
//   ?lead=<id>|novo               o painel aberto  (?etapa= para o "+" da coluna)
//   ?busca=  ?responsavel=  ?tecnico=<id>|eu  ?semana=YYYY-MM-DD  ?arquivados=1
// ─────────────────────────────────────────────────────────────────────────────

const TODOS = "todos";

function Iniciais({ nome }: { nome: string }) {
  const ini = nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  return <span title={nome} className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[9px] font-semibold text-primary">{ini}</span>;
}

function Kpi({ rotulo, valor, sub, alerta }: { rotulo: string; valor: string; sub?: string; alerta?: boolean }) {
  return (
    <div className={cn("rounded-xl border bg-card px-3 py-2.5", alerta && "border-amber-500/50")}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{rotulo}</div>
      <div className={cn("text-lg font-semibold tabular-nums", alerta && "text-amber-600")}>{valor}</div>
      {sub && <div className="truncate text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function CardLead({ l, nomeDe, onAbrir, onAvancar, arrastavel }: {
  l: MvLead; nomeDe: (id: string | null) => string | null; onAbrir: () => void; onAvancar?: () => void; arrastavel: boolean;
}) {
  const parado = estaParado(l);
  const dias = diasSemContato(l);
  const tecnico = nomeDe(l.tecnico_id);
  return (
    <div
      data-card
      draggable={arrastavel}
      onDragStart={(e) => { e.dataTransfer.setData("text/mv-lead", l.id); e.dataTransfer.effectAllowed = "move"; }}
      onClick={onAbrir}
      className="group cursor-pointer rounded-lg border bg-card p-2.5 text-sm shadow-sm transition-colors hover:border-primary/50"
    >
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 font-medium leading-tight">{l.nome}</span>
        {l.valor != null && <span className="shrink-0 text-xs font-semibold tabular-nums">{fmtBRL(l.valor)}</span>}
      </div>
      {(l.modelo || l.cidade) && (
        <div className="mt-1 truncate text-xs text-muted-foreground">
          {[l.modelo, l.cidade && `${l.cidade}${l.uf ? "/" + l.uf : ""}`].filter(Boolean).join(" · ")}
        </div>
      )}
      {l.agendado_para && (l.etapa === "agendado" || l.etapa === "orcado") && (
        <div className="mt-1.5 flex items-center gap-1 text-xs font-medium text-blue-600">
          <CalendarDays className="h-3 w-3" /> {fmtDia(diaDe(l.agendado_para))} às {fmtHora(l.agendado_para)}
        </div>
      )}
      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {(l.etapa === "contato" || l.etapa === "orcado") && (
          <span className={cn("inline-flex items-center gap-0.5", parado && "font-medium text-amber-600")}>
            <Clock className="h-3 w-3" /> {dias === 0 ? "hoje" : `${dias}d`}
          </span>
        )}
        {l.etapa === "executado" ? (
          <>
            {l.pago_para && <span className="shrink-0 rounded bg-muted px-1.5 py-px font-medium text-foreground/80">{ROTULO_PAGO[l.pago_para]}</span>}
            {!l.pos_venda_nf && <span className="shrink-0 whitespace-nowrap font-medium text-amber-600">sem NF</span>}
          </>
        ) : l.parceiro && <span className="min-w-0 truncate">{l.parceiro}</span>}
        <span className="ml-auto flex items-center gap-1">
          {tecnico && <span className="inline-flex items-center gap-0.5"><Wrench className="h-3 w-3" /><Iniciais nome={tecnico} /></span>}
          {onAvancar && (
            <button type="button" title="Avançar etapa" onClick={(e) => { e.stopPropagation(); onAvancar(); }}
              className="rounded p-0.5 opacity-0 hover:bg-muted group-hover:opacity-100 max-lg:opacity-100">
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

function Quadro({ leads, nomeDe, abrir, novo, mover }: {
  leads: MvLead[]; nomeDe: (id: string | null) => string | null;
  abrir: (id: string) => void; novo: (e: Etapa) => void; mover: (l: MvLead, e: Etapa) => void;
}) {
  const [sobre, setSobre] = useState<Etapa | null>(null);
  const porEtapa = useMemo(() => {
    const m = new Map<Etapa, MvLead[]>(ETAPAS.map((e) => [e.id, []]));
    for (const l of leads) m.get(l.etapa)?.push(l);
    const quando = (l: MvLead) => l.agendado_para ?? "9999";
    m.get("agendado")?.sort((a, b) => quando(a).localeCompare(quando(b)));
    return m;
  }, [leads]);

  return (
    <QuadroRolavel envolve="relative" className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 sm:snap-none">
      {ETAPAS.map((e) => {
        const lista = porEtapa.get(e.id) ?? [];
        const soma = lista.reduce((s, l) => s + (l.valor ?? 0), 0);
        return (
          <div key={e.id}
            onDragOver={(ev) => { if (ev.dataTransfer.types.includes("text/mv-lead")) { ev.preventDefault(); setSobre(e.id); } }}
            onDragLeave={() => setSobre((s) => (s === e.id ? null : s))}
            onDrop={(ev) => {
              ev.preventDefault(); setSobre(null);
              const id = ev.dataTransfer.getData("text/mv-lead");
              const l = leads.find((x) => x.id === id);
              if (l && l.etapa !== e.id) mover(l, e.id);
            }}
            className={cn("flex h-[70dvh] w-[86vw] shrink-0 snap-center flex-col rounded-xl border bg-muted/30 sm:w-72 md:h-[max(440px,calc(100dvh-21rem))]",
              sobre === e.id && "ring-2 ring-primary/50")}>
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: e.cor }} />
              <span className="text-sm font-semibold">{e.rotulo}</span>
              <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{lista.length}</span>
              {soma > 0 && <span className="ml-auto text-xs tabular-nums text-muted-foreground">{fmtBRL(soma)}</span>}
              {e.id !== "perdido" && e.id !== "executado" && (
                <button type="button" title="Novo lead nesta etapa" onClick={() => novo(e.id)} className={cn("rounded p-0.5 hover:bg-muted", soma <= 0 && "ml-auto")}>
                  <Plus className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-2">
              {lista.map((l) => (
                <CardLead key={l.id} l={l} nomeDe={nomeDe} arrastavel onAbrir={() => abrir(l.id)}
                  onAvancar={proximaEtapa(l.etapa) ? () => mover(l, proximaEtapa(l.etapa)!) : undefined} />
              ))}
            </div>
          </div>
        );
      })}
    </QuadroRolavel>
  );
}

function Lista({ leads, nomeDe, abrir }: { leads: MvLead[]; nomeDe: (id: string | null) => string | null; abrir: (id: string) => void }) {
  const [limite, setLimite] = useState(150);
  const grupos = useMemo(() => {
    const m = new Map<string, MvLead[]>();
    for (const l of leads.slice(0, limite)) {
      const k = l.primeiro_contato_em;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(l);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [leads, limite]);

  if (!leads.length) return <p className="py-16 text-center text-sm text-muted-foreground">Nenhum lead.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[960px] text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Nome</th><th className="px-3 py-2 font-medium">Etapa</th>
            <th className="px-3 py-2 font-medium">Veículo</th><th className="px-3 py-2 text-right font-medium">Valor</th>
            <th className="px-3 py-2 font-medium">Cidade</th><th className="px-3 py-2 font-medium">Parceiro</th>
            <th className="px-3 py-2 font-medium">Execução</th><th className="px-3 py-2 font-medium">Sem contato</th>
            <th className="px-3 py-2 font-medium">Responsável</th><th className="px-3 py-2 font-medium">NF</th>
          </tr>
        </thead>
        {grupos.map(([dia, ls]) => (
          <tbody key={dia}>
            <tr className="bg-muted/20"><td colSpan={10} className="px-3 py-1.5 text-xs font-semibold">
              {fmtDia(dia, true)} <span className="font-normal text-muted-foreground">· {ls.length} · {fmtBRL(ls.reduce((s, l) => s + (l.valor ?? 0), 0))}</span>
            </td></tr>
            {ls.map((l) => (
              <tr key={l.id} onClick={() => abrir(l.id)} className="cursor-pointer border-t hover:bg-muted/30">
                <td className="px-3 py-2 font-medium">{l.nome}</td>
                <td className="px-3 py-2"><span className="inline-flex items-center gap-1.5 text-xs"><span className="h-2 w-2 rounded-full" style={{ background: COR_ETAPA[l.etapa] }} />{ROTULO_ETAPA[l.etapa]}</span></td>
                <td className="px-3 py-2 text-muted-foreground">{l.modelo ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtBRL(l.valor)}</td>
                <td className="px-3 py-2 text-muted-foreground">{l.cidade ? `${l.cidade}${l.uf ? "/" + l.uf : ""}` : "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{l.parceiro ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums">{l.agendado_para ? `${fmtDia(diaDe(l.agendado_para))} ${fmtHora(l.agendado_para)}` : "—"}</td>
                <td className={cn("px-3 py-2 tabular-nums", estaParado(l) && "font-medium text-amber-600")}>{diasSemContato(l)}d</td>
                <td className="px-3 py-2 text-muted-foreground">{nomeDe(l.responsavel_id) ?? "—"}</td>
                <td className="px-3 py-2">{l.pos_venda_nf ? "✓" : ""}</td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
      {leads.length > limite && (
        <div className="border-t p-2 text-center"><Button variant="ghost" size="sm" onClick={() => setLimite((n) => n + 150)}>Mostrar mais</Button></div>
      )}
    </div>
  );
}

const DIAS_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function Agenda({ leads, nomeDe, abrir, semana, setSemana }: {
  leads: MvLead[]; nomeDe: (id: string | null) => string | null; abrir: (id: string) => void;
  semana: string; setSemana: (s: string) => void;
}) {
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(semana, i));
  const hj = hoje();
  const doDia = useMemo(() => {
    const m = new Map<string, MvLead[]>();
    for (const l of leads) {
      if (!l.agendado_para || l.etapa === "perdido") continue;
      const d = diaDe(l.agendado_para);
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(l);
    }
    m.forEach((ls) => ls.sort((a, b) => a.agendado_para!.localeCompare(b.agendado_para!)));
    return m;
  }, [leads]);
  const semData = leads.filter((l) => l.etapa === "agendado" && !l.agendado_para).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => setSemana(somarDias(semana, -7))}><ChevronLeft className="h-4 w-4" /></Button>
        <Button variant="outline" size="sm" onClick={() => setSemana("")}>Esta semana</Button>
        <Button variant="outline" size="icon" onClick={() => setSemana(somarDias(semana, 7))}><ChevronRight className="h-4 w-4" /></Button>
        <span className="text-sm font-medium">{fmtDia(dias[0])} – {fmtDia(dias[6], true)}</span>
        {semData > 0 && <span className="ml-auto text-xs text-amber-600">{semData} agendado(s) sem data</span>}
      </div>
      <div className="grid gap-2 lg:grid-cols-7">
        {dias.map((d, i) => {
          const ls = doDia.get(d) ?? [];
          return (
            <div key={d} className={cn("min-h-[120px] rounded-xl border bg-card p-2 lg:min-h-[calc(100dvh-24rem)]", d === hj && "border-primary/60 bg-primary/5")}>
              <div className="mb-2 flex items-baseline gap-1.5 text-xs">
                <span className="font-semibold">{DIAS_SEMANA[i]}</span>
                <span className="text-muted-foreground">{fmtDia(d)}</span>
                {ls.length > 0 && <span className="ml-auto rounded-full bg-muted px-1.5 tabular-nums">{ls.length}</span>}
              </div>
              <div className="space-y-1.5">
                {ls.map((l) => (
                  <button key={l.id} type="button" onClick={() => abrir(l.id)}
                    className="block w-full rounded-lg border-l-4 bg-muted/40 px-2 py-1.5 text-left text-xs hover:bg-muted"
                    style={{ borderLeftColor: COR_ETAPA[l.etapa] }}>
                    <div className="font-semibold tabular-nums">{fmtHora(l.agendado_para!)}</div>
                    <div className="truncate font-medium">{l.nome}</div>
                    {l.local_execucao && <div className="flex items-center gap-0.5 truncate text-muted-foreground"><MapPin className="h-3 w-3 shrink-0" />{l.local_execucao}</div>}
                    <div className="flex items-center gap-1 text-muted-foreground"><Wrench className="h-3 w-3" />{nomeDe(l.tecnico_id) ?? "Sem técnico"}</div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MaquinaVendas() {
  const { user } = useAuth();
  const [ver, setVer] = useParamUrl("ver", "quadro");
  const [leadParam, setLeadParam] = useParamUrl("lead");
  const [etapaParam, setEtapaParam] = useParamUrl("etapa");
  const [busca, setBusca] = useParamUrl("busca", "", { replace: true });
  const [resp, setResp] = useParamUrl("responsavel", TODOS);
  const [tec, setTec] = useParamUrl("tecnico", TODOS);
  const [semanaParam, setSemana] = useParamUrl("semana");
  const [arq, setArq] = useParamUrl("arquivados");

  const leadsQ = useMvLeads(arq === "1");
  const pessoasQ = useMvPessoas();
  const atualizar = useMvAtualizar();
  const pessoas: Pessoa[] = pessoasQ.data ?? [];
  const nomeDe = useMemo(() => {
    const m = new Map(pessoas.map((p) => [p.id, p.nome]));
    return (id: string | null) => (id ? m.get(id) ?? null : null);
  }, [pessoas]);

  const todos = leadsQ.data ?? [];
  const eu = user?.id ?? "";
  const filtrados = useMemo(() => todos.filter((l) =>
    casaBusca(l, busca)
    && (resp === TODOS || l.responsavel_id === (resp === "eu" ? eu : resp))
    && (tec === TODOS || l.tecnico_id === (tec === "eu" ? eu : tec)),
  ), [todos, busca, resp, tec, eu]);
  const resumo = useMemo(() => resumir(todos), [todos]);

  const semana = /^\d{4}-\d{2}-\d{2}$/.test(semanaParam) ? segundaDa(semanaParam) : segundaDa(hoje());
  const leadAberto = leadParam && leadParam !== "novo" ? todos.find((l) => l.id === leadParam) ?? null : null;
  const painelAberto = leadParam === "novo" || !!leadAberto;

  const abrir = (id: string) => { setEtapaParam(null); setLeadParam(id); };
  const novo = (e?: Etapa) => { setEtapaParam(e && e !== "contato" ? e : null); setLeadParam("novo"); };
  const fechar = () => { setLeadParam(null); setEtapaParam(null); };

  function mover(l: MvLead, e: Etapa) {
    // Agendar sem data abre o lead: a coluna mentiria na agenda do técnico (o banco também recusa).
    if (faltaParaEtapa(l, e)) { abrir(l.id); return; }
    if (e === "perdido") { abrir(l.id); return; }
    atualizar.mutate({ id: l.id, campos: { etapa: e } });
  }

  const pessoaFiltro = (valor: string, onChange: (v: string) => void, rotulo: string) => (
    <Select value={valor} onValueChange={(v) => onChange(v === TODOS ? null as unknown as string : v)}>
      <SelectTrigger className="h-9 w-[170px]"><span className="truncate text-xs text-muted-foreground">{rotulo}:&nbsp;</span><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={TODOS}>Todos</SelectItem>
        <SelectItem value="eu">Eu</SelectItem>
        {pessoas.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  const VISOES = [
    { id: "quadro", rotulo: "Quadro", Icon: KanbanSquare },
    { id: "lista", rotulo: "Lista", Icon: List },
    { id: "agenda", rotulo: "Agenda", Icon: CalendarDays },
  ];

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <CarboPageHeader title="Máquina de Vendas" icon={KanbanSquare}
        actions={<Button onClick={() => novo()}><Plus className="mr-1.5 h-4 w-4" />Novo lead</Button>} />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Kpi rotulo="Em negociação" valor={String(resumo.emNegociacao)} sub={fmtBRL(resumo.valorEmAberto)} />
        <Kpi rotulo="Parados" valor={String(resumo.parados)} sub="3 dias ou mais sem contato" alerta={resumo.parados > 0} />
        <Kpi rotulo="Agendados na semana" valor={String(resumo.agendadosSemana)} />
        <Kpi rotulo="Executados no mês" valor={String(resumo.executadosMes)} sub={fmtBRL(resumo.faturadoMes)} />
        <Kpi rotulo="Pago à CarboVAPT" valor={fmtBRL(resumo.porPago.carbovapt)} sub="no mês" />
        <Kpi rotulo="Pago ao licenciado" valor={fmtBRL(resumo.porPago.licenciado)} sub="no mês" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border p-0.5">
          {VISOES.map(({ id, rotulo, Icon }) => (
            <button key={id} type="button" onClick={() => setVer(id === "quadro" ? null : id)}
              className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm", ver === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              <Icon className="h-4 w-4" />{rotulo}
            </button>
          ))}
        </div>
        <div className="relative min-w-[200px] flex-1 lg:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value || null)} placeholder="Buscar nome, telefone, cidade…" className="h-9 pl-8" />
        </div>
        {pessoaFiltro(resp, setResp, "Responsável")}
        {pessoaFiltro(tec, setTec, "Técnico")}
        <Button variant={arq === "1" ? "secondary" : "ghost"} size="sm" onClick={() => setArq(arq === "1" ? null : "1")}>Arquivados</Button>
      </div>

      {leadsQ.isLoading ? (
        <div className="flex gap-3">{ETAPAS.map((e) => <Skeleton key={e.id} className="h-96 w-72 shrink-0 rounded-xl" />)}</div>
      ) : leadsQ.isError ? (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />{erroDeLeitura(leadsQ.error)}
        </div>
      ) : ver === "lista" ? (
        <Lista leads={filtrados} nomeDe={nomeDe} abrir={abrir} />
      ) : ver === "agenda" ? (
        <Agenda leads={filtrados} nomeDe={nomeDe} abrir={abrir} semana={semana} setSemana={(s) => setSemana(s || null)} />
      ) : (
        <Quadro leads={filtrados} nomeDe={nomeDe} abrir={abrir} novo={novo} mover={mover} />
      )}

      <LeadPainel
        aberto={painelAberto}
        lead={leadAberto}
        etapaInicial={ehEtapa(etapaParam) ? etapaParam : undefined}
        pessoas={pessoas}
        onFechar={fechar}
        onCriado={(id) => abrir(id)}
      />
      {leadParam && leadParam !== "novo" && !leadsQ.isLoading && !leadAberto && (
        <p className="text-sm text-muted-foreground">Lead não encontrado. <Link to="/maquina-de-vendas" className="underline">Voltar ao quadro</Link></p>
      )}
    </div>
  );
}
