import { useMemo, useState } from "react";
import { AlertTriangle, Gauge, Loader2, Lock, Settings2 } from "lucide-react";
import { useParamUrl, intervaloDoAtalho } from "@carbo/shell";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PeriodoFiltro, type Periodo } from "@/components/ui/PeriodoFiltro";
import { lerErroDoPainel, usePainelAtendimento, type PainelNumero } from "@/hooks/usePainelAtendimento";
import { fmtHora } from "@/lib/painelAtendimento";
import { Bolinha, useAgora } from "@/components/painel/comum";
import { FaixaAgora, Indicadores, type Aba, type Ver } from "@/components/painel/Indicadores";
import { VisaoGeral } from "@/components/painel/VisaoGeral";
import { FilaAgora } from "@/components/painel/Fila";
import { Atendentes } from "@/components/painel/Atendentes";
import { DetalhePessoaSheet } from "@/components/painel/DetalhePessoa";
import { Excecoes } from "@/components/painel/Excecoes";
import { Horarios } from "@/components/painel/Horarios";
import { ConfigDialog } from "@/components/painel/ConfigDialog";

// ─────────────────────────────────────────────────────────────────────────────
// Painel do atendimento — a tela do GESTOR (06/11/2026). `/painel`.
//
// ⚠️ A tela NÃO calcula métrica: tudo vem de `carbo_atendimento_painel`
// (migração 20261148). Aqui só se divide para taxa, formata e desenha.
//
// O estado mora na URL (F5 e link mandado no chat abrem a MESMA tela):
//   ?aba=fila|atendentes|excecoes|horarios   (ausente = visão geral)
//   ?de=&ate=                                 (ausente = últimos 30 dias)
//   ?numero=<phone_number_id>                 (ausente = todos)
//   ?pessoa=<chave>                           o detalhe aberto
//   ?ver=corrido                              (ausente = horário útil)
//   ?assunto=&risco=1                         filtros da fila
// ─────────────────────────────────────────────────────────────────────────────

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "geral", rotulo: "Visão geral" },
  { id: "fila", rotulo: "Fila agora" },
  { id: "atendentes", rotulo: "Atendentes" },
  { id: "excecoes", rotulo: "Exceções" },
  { id: "horarios", rotulo: "Horários e assuntos" },
];
const DIA = /^\d{4}-\d{2}-\d{2}$/;

function AcessoRestrito() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted"><Lock className="h-5 w-5 text-muted-foreground" /></span>
      <h1 className="text-lg font-semibold">Acesso restrito</h1>
      <p className="max-w-sm text-sm text-muted-foreground">O painel do atendimento é só para gestores.</p>
    </div>
  );
}

function Esqueleto() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[84px] rounded-xl" />)}
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-[118px] rounded-xl" />)}
      </div>
      <Skeleton className="h-10 w-full max-w-xl" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-xl lg:col-span-2" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}

function Erro({ titulo, mensagem }: { titulo: string; mensagem?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-red-500/40 bg-red-500/[0.06] p-8 text-center">
      <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
      <p className="font-semibold">{titulo}</p>
      {mensagem && <p className="max-w-xl break-words text-sm text-muted-foreground">{mensagem}</p>}
    </div>
  );
}

function Painel() {
  const padrao = intervaloDoAtalho("30d");
  const [deUrl, setDe] = useParamUrl("de", padrao.from);
  const [ateUrl, setAte] = useParamUrl("ate", padrao.to);
  const [de, ate] = DIA.test(deUrl) && DIA.test(ateUrl)
    ? (deUrl <= ateUrl ? [deUrl, ateUrl] : [ateUrl, deUrl])
    : [padrao.from, padrao.to];
  const trocarPeriodo = (p: Periodo) => { setDe(p.from); setAte(p.to); };

  const [abaUrl, setAba] = useParamUrl("aba", "geral");
  const aba: Aba = ABAS.some((a) => a.id === abaUrl) ? (abaUrl as Aba) : "geral";
  const [numero, setNumero] = useParamUrl("numero", "");
  const [pessoa, setPessoa] = useParamUrl("pessoa", "");
  const [verUrl, setVer] = useParamUrl("ver", "util");
  const ver: Ver = verUrl === "corrido" ? "corrido" : "util";
  const [assunto, setAssunto] = useParamUrl("assunto", "", { replace: true });
  const [riscoUrl, setRisco] = useParamUrl("risco", "", { replace: true });

  const [configAberta, setConfigAberta] = useState(false);
  const [focarPerdidas, setFocarPerdidas] = useState(0);
  const agora = useAgora();

  const q = usePainelAtendimento(de, ate, numero || null);
  const p = q.data;
  const numeros = useMemo(() => new Map<string, PainelNumero>((p?.numeros ?? []).map((n) => [n.id, n])), [p?.numeros]);
  const erro = q.error ? lerErroDoPainel(q.error) : null;

  if (erro?.tipo === "sem_permissao") return <AcessoRestrito />;

  const irPara = (a: Aba, extra?: Record<string, string>) => {
    setAba(a);
    if (extra?.risco) setRisco(extra.risco);
    if (extra?.ver_perdidas) setFocarPerdidas((n) => n + 1);
  };

  const fechadas = p?.kpis.atual?.fechadas_sem_resposta ?? 0;

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-[1600px] space-y-4">
        <CarboPageHeader
          title="Painel do atendimento"
          icon={Gauge}
          actions={
            <>
              {p && (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  {q.isFetching && <Loader2 className="h-3 w-3 animate-spin" />}
                  Atualizado às {fmtHora(p.gerado_em)}
                </span>
              )}
              {p && (
                <Button variant="outline" size="sm" onClick={() => setConfigAberta(true)}>
                  <Settings2 className="mr-1.5 h-4 w-4" /> Horário e metas
                </Button>
              )}
            </>
          }
        />

        <div className="flex flex-wrap items-center gap-2">
          <PeriodoFiltro value={{ from: de, to: ate }} onChange={trocarPeriodo} longos disableFuture className="w-full sm:w-auto" />
          <Select value={numero || "todos"} onValueChange={(v) => setNumero(v === "todos" ? "" : v)}>
            <SelectTrigger className="h-9 w-full text-sm sm:w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os números</SelectItem>
              {(p?.numeros ?? []).map((n) => (
                <SelectItem key={n.id} value={n.id}>
                  <span className="flex items-center gap-2"><Bolinha cor={n.cor} />{n.rotulo}</span>
                </SelectItem>
              ))}
              {numero && !numeros.has(numero) && <SelectItem value={numero}>{numero}</SelectItem>}
            </SelectContent>
          </Select>
          <div role="group" className="inline-flex h-9 rounded-md border p-0.5">
            {(["util", "corrido"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={ver === v} onClick={() => setVer(v)}
                className={cn("rounded px-3 text-sm font-medium transition-colors",
                  ver === v ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {v === "util" ? "Horário útil" : "Corrido"}
              </button>
            ))}
          </div>
        </div>

        {erro && !p ? (
          erro.tipo === "sem_funcao"
            ? <Erro titulo="O painel ainda não foi instalado no banco." />
            : <Erro titulo="Não foi possível carregar o painel." mensagem={erro.mensagem} />
        ) : !p ? <Esqueleto /> : (
          <>
            {erro && (
              <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="break-words">Não foi possível atualizar: {erro.mensagem}</span>
              </p>
            )}

            <FaixaAgora p={p} irPara={irPara} />
            <Indicadores p={p} ver={ver} />

            <Tabs value={aba} onValueChange={(v) => setAba(v)} className="space-y-3">
              <TabsList className="w-full justify-start sm:w-auto">
                {ABAS.map((a) => (
                  <TabsTrigger key={a.id} value={a.id} className="gap-1.5">
                    {a.rotulo}
                    {a.id === "fila" && p.agora.esperando > 0 && (
                      <span className={cn("rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                        p.agora.janela_ate_2h > 0 ? "bg-red-500 text-white" : "bg-foreground/10")}>{p.agora.esperando}</span>
                    )}
                    {a.id === "excecoes" && fechadas > 0 && (
                      <span className="rounded-full bg-orange-500/15 px-1.5 text-[11px] font-semibold tabular-nums text-orange-700 dark:text-orange-400">{fechadas}</span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="geral" className="mt-0">
                <VisaoGeral p={p} ver={ver} agora={agora} onNumero={(id) => setNumero(id)} />
              </TabsContent>
              <TabsContent value="fila" className="mt-0">
                <FilaAgora
                  p={p} agora={agora} numeros={numeros}
                  assunto={assunto} setAssunto={setAssunto}
                  soRisco={riscoUrl === "1"} setSoRisco={(v) => setRisco(v ? "1" : "")}
                  focarPerdidas={focarPerdidas}
                />
              </TabsContent>
              <TabsContent value="atendentes" className="mt-0">
                <Atendentes p={p} ver={ver} agora={agora} onPessoa={setPessoa} />
              </TabsContent>
              <TabsContent value="excecoes" className="mt-0">
                <Excecoes p={p} numeros={numeros} onPessoa={(c) => { setAba("atendentes"); setPessoa(c); }} />
              </TabsContent>
              <TabsContent value="horarios" className="mt-0">
                <Horarios p={p} />
              </TabsContent>
            </Tabs>

            {pessoa && (
              <DetalhePessoaSheet
                p={p} pessoa={pessoa} numero={numero || null} ver={ver} agora={agora} numeros={numeros}
                onFechar={() => setPessoa("")}
              />
            )}
            <ConfigDialog aberto={configAberta} onAberto={setConfigAberta} config={p.config} />
          </>
        )}
      </div>
    </div>
  );
}

export default function PainelAtendimento() {
  const { isGestor, acessoPronto } = useAuth();
  // ⚠️ `isGestor` é false até o mapa de funções chegar: esperar, senão o
  // gestor veria "Acesso restrito" piscar a cada F5. Quem não é gestor não
  // chega a consultar o banco.
  if (!acessoPronto) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (!isGestor) return <AcessoRestrito />;
  return <Painel />;
}
