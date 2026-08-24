import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek,
  format, isSameMonth, startOfMonth, startOfWeek, subDays,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CalendarDays, MapPin, Plus, Play, CloudOff, RefreshCw, Loader2, Navigation,
  CircleAlert, Check, Ban, List, CalendarRange, ChevronLeft, ChevronRight,
  Phone, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { usePdvs } from "@/hooks/usePdvs";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import {
  useRtmAgenda, useRtmAgendaDia, usePlanejarVisita, useCancelarPlanejada,
  useRtmFila, pegarLocal, diaLocal, RTM_SITUACAO_LABEL, RTM_RESULTADO_LABEL,
  type RtmAgendaRow, type RtmSituacaoAgenda, type RtmDiaResumo,
} from "@/hooks/useRtm";
import { rtmAbrirLocal, rtmCompletarLocal, rtmUltimoSucesso } from "@/lib/rtmFila";
import {
  chaveDia, doDia, contar, aderenciaDe, resumirMes, agruparJanela,
} from "@/lib/rtmAgenda";

// ─────────────────────────────────────────────────────────────────────────────
// RTM · Agenda do dia — Fase 1
//
// Responde à segunda das cinco perguntas do briefing: "quem deveria ser
// visitado hoje — e foi?". As duas metades da pergunta estão na tela ao mesmo
// tempo de propósito: o plano e o que aconteceu com ele. Uma tela que só
// mostrasse as visitas feitas responderia metade, e é a metade fácil.
//
// ⚠️ Por isso a linha "não cumprida" é a mais importante daqui. Ela é o único
// registro do que deixou de acontecer, e é dela que sai a aderência.
// ─────────────────────────────────────────────────────────────────────────────

const CORES: Record<RtmSituacaoAgenda, string> = {
  pendente:     "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  em_andamento: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  concluida:    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  nao_cumprida: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  cancelada:    "bg-muted text-muted-foreground",
};

const hora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";

type Visao = "lista" | "mes";
const CHAVE_VISAO = "rtm.agenda.visao";

const rotuloDia = (s: string) =>
  format(doDia(s), "EEE, d 'de' MMMM", { locale: ptBR });

/** ⚠️ Semana começa na SEGUNDA. O `ptBR` do date-fns começa no domingo, mas
 *  roteiro de campo roda de segunda a sábado — com domingo na frente, a semana
 *  de trabalho fica partida nas duas pontas da linha. */
const DIAS_SEMANA = ["S", "T", "Q", "Q", "S", "S", "D"];

export default function RtmAgenda() {
  const navigate = useNavigate();
  const { user, isGestor } = useAuth();
  const [params, setParams] = useSearchParams();

  const [dia, setDia] = useState(() => params.get("d") || diaLocal());
  const [visao, setVisao] = useState<Visao>(() => {
    const daUrl = params.get("v");
    if (daUrl === "mes" || daUrl === "lista") return daUrl;
    // ⚠️ O localStorage só SEMEIA o valor inicial, e vem dentro de try/catch:
    // aba anônima e alguns WebViews lançam no acesso, e a tela não pode cair
    // por causa de uma preferência.
    try { return localStorage.getItem(CHAVE_VISAO) === "mes" ? "mes" : "lista"; }
    catch { return "lista"; }
  });

  // Gestor começa vendo o time inteiro; vendedor só se vê (e a RLS confirma).
  const [vendedor, setVendedor] = useState<string>(() => (isGestor ? "todos" : (user?.id ?? "")));
  const [novoOpen, setNovoOpen] = useState(false);
  const [iniciando, setIniciando] = useState<string | null>(null);
  const [filtroFalha, setFiltroFalha] = useState(false);
  const [abertoAtraso, setAbertoAtraso] = useState(true);
  const [diaAberto, setDiaAberto] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState<RtmAgendaRow | null>(null);

  const { emAndamento, pendentes, online, sincronizar } = useRtmFila();

  // ⚠️ Visita aberta manda mais que preferência salva: o calendário não tem
  // botão de continuar, e continuar é a única coisa que importa nessa hora.
  useEffect(() => { if (emAndamento) setVisao("lista"); }, [emAndamento?.client_uuid]);

  useEffect(() => {
    try { localStorage.setItem(CHAVE_VISAO, visao); } catch { /* sem persistência, tudo bem */ }
    // A URL é a fonte da verdade: o "voltar" do celular desfaz a navegação do
    // calendário para o dia, e dá para mandar um link que abre o mesmo lugar.
    setParams({ v: visao, d: dia }, { replace: true });
  }, [visao, dia]);

  // ── Janelas. Declaradas ANTES dos memos que as usam (TDZ: o callback de
  //    useMemo roda durante o render, e isso já derrubou o /vender). ─────────
  const hoje = diaLocal();
  const base = doDia(dia);
  const vend = vendedor === "todos" ? null : vendedor;

  // A lista é uma JANELA, não um dia: 7 dias atrás (as atrasadas) e o âncora
  // mais 6. Com "Todo o time" ela encolhe — 15 vendedores × 14 dias é payload
  // grande para um celular em 3G, e o gestor tem o calendário para a visão longa.
  const recuo = vend ? 7 : 3;
  const avanco = vend ? 6 : 3;
  const listaDe = chaveDia(subDays(base, recuo));
  const listaAte = chaveDia(addDays(base, avanco));

  // ⚠️ A grade do mês inclui os dias VIZINHOS (27/jul … 6/set para agosto).
  // Pedir só 01–31 deixaria a primeira linha do calendário mentindo vazio.
  const gradeDias = useMemo(() => eachDayOfInterval({
    start: startOfWeek(startOfMonth(base), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(base), { weekStartsOn: 1 }),
  }), [dia]);
  const gradeDe = chaveDia(gradeDias[0]);
  const gradeAte = chaveDia(gradeDias[gradeDias.length - 1]);

  const { data: agenda, isLoading, isError, refetch } = useRtmAgenda(listaDe, listaAte, vend);
  const { data: porDia } = useRtmAgendaDia(gradeDe, gradeAte, vend, visao === "mes");
  const { data: equipe } = useTeamMembers();

  const janela = agenda ?? [];
  const grupos = useMemo(() => agruparJanela(janela, dia, hoje), [janela, dia, hoje]);
  const linhas = grupos.doDia;

  const resumo = useMemo(() => contar(linhas), [linhas]);
  const aderencia = aderenciaDe(resumo, linhas.length);

  const resumoMes = useMemo(
    () => resumirMes(porDia ?? new Map(), hoje, (d) => isSameMonth(doDia(d), base)),
    [porDia, dia, hoje]);

  const semNada = !isLoading && !isError && janela.length === 0
    && (visao !== "mes" || (porDia?.size ?? 0) === 0);

  const visiveis = filtroFalha
    ? linhas.filter((l) => l.situacao === "nao_cumprida")
    : linhas;

  // "Sem enviar há X" em vez de um "online" que não significa nada: dentro do
  // posto o `navigator.onLine` diz que a INTERFACE está conectada, não que a
  // internet responde.
  const desdeSucesso = useMemo(() => {
    const iso = rtmUltimoSucesso();
    if (!iso) return null;
    return Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  }, [pendentes.length, online]);

  async function iniciar(l: RtmAgendaRow) {
    if (emAndamento) {
      toast.error("Você tem uma visita em aberto. Finalize antes de iniciar outra.");
      // ⚠️ COM o `?v=`: sem ele a tela caía em "Nenhuma visita selecionada",
      // com um botão para voltar à agenda de onde a pessoa acabou de sair.
      navigate(`/rtm/visita?v=${emAndamento.client_uuid}`);
      return;
    }
    setIniciando(l.planejada_id);
    try {
      // ⚠️ O check-in NÃO espera o GPS. Antes eram até 8 s de espera antes de
      // abrir a visita — justamente na porta do posto, debaixo da cobertura de
      // bomba, onde o GPS demora o máximo. A pessoa via um spinner e tocava de
      // novo. A coordenada chega depois; o gatilho de distância dispara no
      // update de `checkin_lat/lng` e não precisa dela na abertura.
      const v = await rtmAbrirLocal({
        vendedor_id: user!.id,
        pdv_id: l.pdv_id,
        pdv_nome: l.pdv_nome,
        visita_planejada_id: l.planejada_id,
        tipo: "roteiro",
        geo: null,
      });
      toast.success(`Check-in em ${l.pdv_nome}.`);
      navigate(`/rtm/visita?v=${v.client_uuid}`);
      // Segue tentando o GPS em segundo plano, sem segurar ninguém.
      void pegarLocal().then((geo) => { if (geo) void rtmCompletarLocal(v.client_uuid, geo); });
    } catch (e) {
      toast.error("Não deu para iniciar: " + ((e as { message?: string })?.message ?? ""));
    } finally {
      setIniciando(null);
    }
  }

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-4 max-w-[1200px] mx-auto">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <CarboPageHeader
            title="Agenda de visitas"
            description="Quem deveria ser visitado — e o que aconteceu"
            icon={CalendarDays}
          />
          <div className="flex items-center gap-2 flex-wrap">
            {/* ⚠️ Dois botões de 36px, não `Tabs` do shadcn: com dois itens o
                underline é discreto demais e a área de toque fica em ~28px — o
                polegar de quem segura o celular com a mesma mão erra. */}
            <div role="tablist" aria-label="Visão da agenda"
                 className="inline-flex rounded-lg border bg-muted/40 p-0.5">
              {([["lista", "Lista", List], ["mes", "Mês", CalendarRange]] as const).map(([v, rot, Icone]) => (
                <button key={v} role="tab" aria-selected={visao === v} onClick={() => setVisao(v)}
                  className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm font-medium transition-colors ${
                    visao === v ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
                  <Icone className="h-4 w-4" /> {rot}
                </button>
              ))}
            </div>

            {/* No mês a grade É o seletor de data — o input vira redundante. */}
            {visao === "lista" && (
              <Input type="date" value={dia} onChange={(e) => setDia(e.target.value || diaLocal())}
                className="w-[150px] h-9" />
            )}
            {dia !== hoje && (
              <Button size="sm" variant="ghost" className="h-9" onClick={() => setDia(hoje)}>Hoje</Button>
            )}

            {isGestor && (
              <Select value={vendedor} onValueChange={setVendedor}>
                <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todo o time</SelectItem>
                  {(equipe ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button size="sm" className="h-9 gap-1.5" onClick={() => setNovoOpen(true)}>
              <Plus className="h-4 w-4" /> Agendar
            </Button>
          </div>
        </div>

        {/* ── Estado da conexão e da fila ───────────────────────────────────
            Fica no topo e não some: o vendedor precisa saber que a visita está
            só no aparelho ANTES de sair do PDV, não depois. */}
        {(!online || pendentes.length > 0) && (
          <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
            online ? "border-amber-300 bg-amber-50 dark:bg-amber-950/40" : "border-slate-300 bg-muted"}`}>
            {online ? <RefreshCw className="h-4 w-4 shrink-0" /> : <CloudOff className="h-4 w-4 shrink-0" />}
            <span className="flex-1">
              {online
                ? `${pendentes.length} visita(s) aguardando envio${
                    desdeSucesso !== null && desdeSucesso > 5 ? ` · sem enviar há ${desdeSucesso} min` : ""}.`
                : "Sem conexão. As visitas ficam salvas no aparelho e sobem sozinhas quando o sinal voltar."}
            </span>
            {online && pendentes.length > 0 && (
              <Button size="sm" variant="outline" className="h-7"
                onClick={() => { void sincronizar(); toast.info("Enviando..."); }}>
                Enviar agora
              </Button>
            )}
          </div>
        )}

        {/* ⚠️ O ERRO da fila, dito. `RtmVisitaLocal.erro` existia, era preenchido
            e NENHUMA tela o lia: RLS, validação recusada e 403 do bucket tinham
            todos o mesmo sintoma que "estou sem sinal". É a versão RTM do catch
            vazio que já nos mordeu no som da venda e no pg_cron. */}
        {pendentes.filter((v) => v.erro).map((v) => (
          <div key={v.client_uuid}
               className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50
                          px-3 py-2 text-sm dark:border-red-900 dark:bg-red-950/40">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{v.pdv_nome} — o envio foi recusado</p>
              <p className="text-xs text-muted-foreground break-words">{v.erro}</p>
            </div>
          </div>
        ))}

        {emAndamento && (
          <button
            onClick={() => navigate(`/rtm/visita?v=${emAndamento.client_uuid}`)}
            className="w-full flex items-center gap-3 rounded-lg border-2 border-blue-400 bg-blue-50 dark:bg-blue-950/40 px-3 py-2.5 text-left"
          >
            <Play className="h-4 w-4 text-blue-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">Visita em andamento · {emAndamento.pdv_nome}</p>
              <p className="text-xs text-muted-foreground">
                Check-in às {hora(emAndamento.ts_dispositivo_checkin)} — toque para continuar
              </p>
            </div>
          </button>
        )}

        {/* ── Os quatro números, com o RECORTE dito ───────────────────────────
            Eles mudam de dia para mês conforme a visão. Quatro números sem
            legenda de período são quatro números em que ninguém confia. */}
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {visao === "mes"
              ? format(base, "MMMM 'de' yyyy", { locale: ptBR })
              : dia === hoje ? "Hoje" : rotuloDia(dia)}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {visao === "mes" ? (
              <>
                <Resumo label="Planejadas" valor={resumoMes.planejadas} />
                <Resumo label="Concluídas" valor={resumoMes.concluidas} />
                <Resumo label="Não cumpridas" valor={resumoMes.naoCumpridas}
                  alerta={resumoMes.naoCumpridas > 0} />
                {/* ⚠️ "até hoje": sobre o mês inteiro, no dia 3 a aderência diria
                    10% porque 27 dias não aconteceram — e um indicador sempre
                    vermelho ensina a ignorar a faixa toda. */}
                <Resumo label="Aderência (até hoje)"
                  valor={resumoMes.aderencia === null ? "—" : `${resumoMes.aderencia}%`} />
              </>
            ) : (
              <>
                <Resumo label="Planejadas" valor={linhas.length} />
                <Resumo label="Concluídas" valor={resumo.concluida} />
                {/* O número mais importante da tela agora leva a algum lugar. */}
                <Resumo label="Não cumpridas" valor={resumo.nao_cumprida}
                  alerta={resumo.nao_cumprida > 0} ativo={filtroFalha}
                  onClick={() => setFiltroFalha((v) => !v)} />
                <Resumo label="Aderência" valor={aderencia === null ? "—" : `${aderencia}%`} />
              </>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando agenda...
          </div>

        ) : isError ? (
          /* ⚠️ ERRO ANTES DE VAZIO. Isto não existia: sem sinal e sem cache, o
             vendedor lia "Nada planejado para este dia" e ia embora do PDV. */
          <CarboCard>
            <CarboCardContent className="py-8 text-center space-y-2">
              <CloudOff className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-sm font-medium">Não deu para carregar a agenda.</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {online ? "Tente de novo em instantes."
                        : "Sem conexão — o que está no aparelho continua salvo."}
              </p>
              <Button size="sm" variant="outline" onClick={() => void refetch()}>
                <RefreshCw className="h-4 w-4 mr-1.5" /> Tentar de novo
              </Button>
            </CarboCardContent>
          </CarboCard>

        ) : semNada ? (
          /* ⚠️ O texto NÃO afirma "você nunca planejou": a tela só sabe que a
             janela e a grade voltaram vazias. Afirmação que a tela não pode
             provar é o mesmo erro do vínculo aproximado que se passa por exato. */
          <CarboCard>
            <CarboCardContent className="py-10 text-center space-y-2">
              <CalendarDays className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-sm font-medium">
                {vend ? "Sua agenda está vazia."
                      : "Ninguém do time tem visita planejada nesta janela."}
              </p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Comece colocando os PDVs a visitar. A visita entra na agenda <strong>antes</strong> do
                dia — é isso que separa "não deu tempo" de "não estava no plano".
              </p>
              <Button size="sm" className="mt-1" onClick={() => setNovoOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> Agendar primeira visita
              </Button>
            </CarboCardContent>
          </CarboCard>

        ) : (
          <div className="lg:grid lg:grid-cols-[380px_1fr] lg:gap-4 lg:items-start">
            {/* A partir do lg as duas aparecem juntas: é a tela do gestor, que
                quer ver o mês e o dia ao mesmo tempo. */}
            <div className={visao === "mes" ? "block" : "hidden lg:block"}>
              <MesGrade
                base={base} dias={gradeDias} dia={dia} hoje={hoje} porDia={porDia}
                onMover={(n) => setDia(chaveDia(addMonths(base, n)))}
                onEscolher={(d) => { setDia(d); setVisao("lista"); }}
              />
              {visao === "mes" && resumoMes.planejadas === 0 && (
                <p className="text-center text-xs text-muted-foreground py-3">
                  Nenhuma visita planejada em {format(base, "MMMM", { locale: ptBR })}.{" "}
                  <button className="underline" onClick={() => setNovoOpen(true)}>Agendar</button>
                </p>
              )}
            </div>

            <div className={`${visao === "lista" ? "block" : "hidden lg:block"} space-y-4`}>
              {/* ⚠️ ATRASADAS PRIMEIRO, e só quando o âncora é hoje. É o único
                  registro do que deixou de acontecer, e numa lista que começa em
                  "hoje" a visita de terça só reaparece se alguém voltar o
                  seletor de data para terça. Ninguém volta. */}
              {grupos.atrasadas.length > 0 && dia === hoje && (
                <section className="space-y-2">
                  <CabecalhoGrupo titulo="Atrasadas" qtd={grupos.atrasadas.length}
                    aberto={abertoAtraso} onToggle={() => setAbertoAtraso((v) => !v)} />
                  {abertoAtraso && grupos.atrasadas.map((l) => (
                    <div key={l.planejada_id} className="space-y-1">
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 pl-1">
                        {rotuloDia(l.data_prevista)}
                      </p>
                      {/* Visita atrasada feita hoje é melhor que visita perdida. */}
                      <LinhaAgenda l={l} podeIniciar meu={l.vendedor_id === user?.id}
                        iniciando={iniciando === l.planejada_id}
                        onIniciar={() => iniciar(l)}
                        onAbrir={() => navigate(`/rtm/visita?v=${l.visita_id}&ver=1`)} />
                    </div>
                  ))}
                </section>
              )}

              <section className="space-y-2">
                <CabecalhoGrupo titulo={dia === hoje ? "Hoje" : rotuloDia(dia)}
                  qtd={linhas.length} aberto />
                {linhas.length === 0 ? (
                  <CarboCard>
                    <CarboCardContent className="py-10 text-center space-y-2">
                      <CalendarDays className="h-8 w-8 mx-auto text-muted-foreground" />
                      <p className="text-sm font-medium">Nada planejado para este dia.</p>
                      <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                        A visita precisa estar na agenda antes do dia — é o que permite
                        medir o que deixou de acontecer, não só o que aconteceu.
                      </p>
                      <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
                        <Button size="sm" variant="outline" onClick={() => setNovoOpen(true)}>
                          <Plus className="h-4 w-4 mr-1.5" /> Agendar visita
                        </Button>
                        {/* O dia vazio só assusta quando não se sabe que o plano
                            continua depois. */}
                        {grupos.proximos.length > 0 && (
                          <Button size="sm" variant="ghost" onClick={() => setDia(grupos.proximos[0][0])}>
                            Ir para {rotuloDia(grupos.proximos[0][0])} · {grupos.proximos[0][1].length} PDVs
                          </Button>
                        )}
                      </div>
                    </CarboCardContent>
                  </CarboCard>
                ) : visiveis.map((l) => (
                  <LinhaAgenda key={l.planejada_id} l={l}
                    podeIniciar={l.situacao === "pendente" || l.situacao === "nao_cumprida"}
                    meu={l.vendedor_id === user?.id}
                    iniciando={iniciando === l.planejada_id}
                    onIniciar={() => iniciar(l)}
                    onAbrir={() => navigate(`/rtm/visita?v=${l.visita_id}&ver=1`)}
                    onCancelar={() => setCancelando(l)} />
                ))}
              </section>

              {/* PRÓXIMOS DIAS — a pergunta do fim da tarde ("amanhã começo por
                  onde?") hoje exigia trocar a data e perder o dia da tela. */}
              {grupos.proximos.map(([d, ls]) => (
                <section key={d} className="space-y-2">
                  <CabecalhoGrupo titulo={rotuloDia(d)} qtd={ls.length}
                    aberto={diaAberto === d}
                    onToggle={() => setDiaAberto(diaAberto === d ? null : d)} />
                  {diaAberto === d && ls.map((l) => (
                    <LinhaAgenda key={l.planejada_id} l={l} podeIniciar={false}
                      meu={l.vendedor_id === user?.id} iniciando={false}
                      onIniciar={() => {}}
                      onAbrir={() => navigate(`/rtm/visita?v=${l.visita_id}&ver=1`)} />
                  ))}
                </section>
              ))}
            </div>
          </div>
        )}
      </div>

      <DialogAgendar open={novoOpen} onOpenChange={setNovoOpen} dia={dia} />
      <DialogCancelar linha={cancelando} onFechar={() => setCancelando(null)} />
    </div>
  );
}

/**
 * Cancelar visita planejada.
 *
 * ⚠️ O motivo é OBRIGATÓRIO, e não é burocracia: `cancelamento_motivo` existe
 * porque "não foi" sem porquê não vira aprendizado nenhum. E é ele que separa
 * "o cliente pediu para remarcar" de "não deu tempo" — a primeira sai do
 * denominador da aderência, a segunda não.
 */
function DialogCancelar({ linha, onFechar }: {
  linha: RtmAgendaRow | null; onFechar: () => void;
}) {
  const cancelar = useCancelarPlanejada();
  const [motivo, setMotivo] = useState("");

  useEffect(() => { if (linha) setMotivo(""); }, [linha?.planejada_id]);

  return (
    <Dialog open={!!linha} onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader><DialogTitle>Cancelar visita</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {linha?.pdv_nome} — a visita sai do plano do dia e <strong>não</strong> conta
            como não cumprida.
          </p>
          <div className="space-y-1.5">
            <Label>Por que não vai acontecer?</Label>
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)}
              placeholder="Cliente pediu para remarcar, loja em reforma…" rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Voltar</Button>
          <Button disabled={!motivo.trim() || cancelar.isPending}
            onClick={() => cancelar.mutate(
              { id: linha!.planejada_id, motivo: motivo.trim() },
              { onSuccess: onFechar })}>
            Cancelar visita
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Cabeçalho de grupo da lista. Colapsável quando há `onToggle`. */
function CabecalhoGrupo({ titulo, qtd, aberto, onToggle }: {
  titulo: string; qtd: number; aberto: boolean; onToggle?: () => void;
}) {
  const Tag = onToggle ? "button" : "div";
  return (
    <Tag onClick={onToggle}
      className="sticky top-0 z-10 w-full flex items-center gap-2 bg-background/95 backdrop-blur
                 py-1.5 text-left border-b">
      {onToggle && (
        <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${aberto ? "rotate-90" : ""}`} />
      )}
      <span className="text-xs font-semibold uppercase tracking-wide capitalize">{titulo}</span>
      <Badge variant="outline" className="text-[10px] ml-auto">{qtd}</Badge>
    </Tag>
  );
}

/**
 * O calendário do mês.
 *
 * ⚠️ Ele é um ÍNDICE, não um lugar de trabalho: não tem Check-in nem Rota, e a
 * única saída dele é a lista do dia. Pop-over dentro de uma célula de 44px seria
 * alvo de toque dentro de alvo de toque — e a lista do dia já existe, completa,
 * a um toque de distância.
 */
function MesGrade({ base, dias, dia, hoje, porDia, onEscolher, onMover }: {
  base: Date; dias: Date[]; dia: string; hoje: string;
  porDia: Map<string, RtmDiaResumo> | undefined;
  onEscolher: (d: string) => void; onMover: (n: number) => void;
}) {
  return (
    <CarboCard>
      <CarboCardContent className="p-2 md:p-3">
        <div className="flex items-center justify-between mb-2">
          <Button size="icon" variant="ghost" className="h-9 w-9"
            onClick={() => onMover(-1)} aria-label="Mês anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="text-sm font-semibold capitalize">
            {format(base, "MMMM 'de' yyyy", { locale: ptBR })}
          </p>
          <Button size="icon" variant="ghost" className="h-9 w-9"
            onClick={() => onMover(1)} aria-label="Próximo mês">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {DIAS_SEMANA.map((s, i) => (
            <span key={i} className="text-center text-[10px] text-muted-foreground">{s}</span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {dias.map((d) => {
            const chave = chaveDia(d);
            const r = porDia?.get(chave);
            const total = r?.planejadas ?? 0;
            const feitas = r?.concluidas ?? 0;
            const falhas = r?.nao_cumpridas ?? 0;
            // ⚠️ Cancelada NÃO entra na barra: ela sai do denominador da
            // aderência, e pintá-la faria o dia parecer cheio de trabalho que
            // ninguém precisa fazer.
            const abertas = (r?.pendentes ?? 0) + (r?.em_andamento ?? 0);
            const foraDoMes = !isSameMonth(d, base);

            return (
              <button key={chave} onClick={() => onEscolher(chave)}
                // A célula inteira é o alvo, com 56px de altura mínima (44 + folga).
                className={`relative flex flex-col items-center gap-1 min-h-[56px] md:min-h-[76px]
                  rounded-lg border px-0.5 pt-1.5 pb-1 transition-colors
                  ${foraDoMes ? "opacity-40" : ""}
                  ${chave === dia ? "border-primary ring-1 ring-primary" : "border-transparent"}
                  ${chave === hoje ? "bg-muted/70" : "hover:bg-muted/40"}`}
                aria-label={`${format(d, "d 'de' MMMM", { locale: ptBR })}: ${total} planejadas, ${feitas} concluídas, ${falhas} não cumpridas`}>
                <span className={`text-[13px] leading-none tabular-nums ${
                  chave === hoje ? "font-bold text-primary" : ""}`}>
                  {format(d, "d")}
                </span>

                {total > 0 ? (
                  <>
                    <span className="text-[11px] font-semibold leading-none">{total}</span>
                    {/* Barra de PROPORÇÃO, não de contagem: em 44px três números
                        não cabem, e o que se lê de relance é "quanto verde". O
                        numeral acima cobre o "quantos". */}
                    <span className="flex h-1 w-7 overflow-hidden rounded-full bg-slate-300 dark:bg-slate-700">
                      <i style={{ flexGrow: feitas }} className="bg-emerald-500" />
                      <i style={{ flexGrow: falhas }} className="bg-amber-500" />
                      <i style={{ flexGrow: abertas }} className="bg-slate-400 dark:bg-slate-600" />
                    </span>
                  </>
                ) : (
                  // ⚠️ Dia vazio fica VISÍVEL: é ele que mostra onde cabe visita
                  // nova. Esconder buraco de agenda é esconder o trabalho a fazer.
                  <span className="h-1 w-7" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-center gap-3 pt-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-emerald-500" /> concluída</span>
          <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-amber-500" /> não cumprida</span>
          <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-slate-400" /> a visitar</span>
        </div>
      </CarboCardContent>
    </CarboCard>
  );
}

function Resumo({ label, valor, alerta, ativo, onClick }: {
  label: string; valor: number | string; alerta?: boolean;
  ativo?: boolean; onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick}
      className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
        ativo ? "border-amber-500 ring-1 ring-amber-500"
        : alerta ? "border-amber-300 bg-amber-50 dark:bg-amber-950/30" : "bg-card"}`}>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-xl font-bold leading-tight">{valor}</p>
    </Tag>
  );
}

function LinhaAgenda({
  l, podeIniciar, meu, iniciando, onIniciar, onAbrir, onCancelar,
}: {
  l: RtmAgendaRow; podeIniciar: boolean; meu: boolean; iniciando: boolean;
  onIniciar: () => void; onAbrir: () => void; onCancelar?: () => void;
}) {
  const temCoord = l.pdv_lat != null && l.pdv_lng != null;
  return (
    <CarboCard>
      <CarboCardContent className="p-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm truncate">{l.pdv_nome}</p>
              <Badge variant="outline" className={`text-[10px] border-0 ${CORES[l.situacao]}`}>
                {RTM_SITUACAO_LABEL[l.situacao]}
              </Badge>
              {l.origem === "roteiro" && (
                <Badge variant="outline" className="text-[10px]">roteiro</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {[l.endereco, l.cidade, l.uf].filter(Boolean).join(" · ") || "Sem endereço cadastrado"}
            </p>
            {!meu && l.vendedor_nome && (
              <p className="text-[11px] text-muted-foreground mt-0.5">{l.vendedor_nome}</p>
            )}

            {l.situacao === "concluida" && (
              <p className="text-xs mt-1">
                <span className="text-muted-foreground">{hora(l.ts_checkin)}–{hora(l.ts_checkout)}</span>
                {l.resultado && <> · <strong>{RTM_RESULTADO_LABEL[l.resultado] ?? l.resultado}</strong></>}
              </p>
            )}
            {l.situacao === "cancelada" && l.cancelamento_motivo && (
              <p className="text-xs text-muted-foreground mt-1 italic">{l.cancelamento_motivo}</p>
            )}
            {l.observacao && (
              <p className="text-xs text-muted-foreground mt-1">{l.observacao}</p>
            )}
            {/* ⚠️ O contato já vinha na view (`contact_name`, `contact_phone`) e
                não aparecia em lugar nenhum. "Decisor ausente" é um dos motivos
                da lista fechada: ligar antes de entrar economiza uma viagem
                inteira — e a viagem, aqui, tem 200 km. */}
            {l.contact_name && (
              <p className="text-[11px] text-muted-foreground mt-1 truncate">
                {l.contact_name}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5 shrink-0">
            {podeIniciar && meu && (
              <Button size="sm" className="h-9 gap-1.5" onClick={onIniciar} disabled={iniciando}>
                {iniciando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                Check-in
              </Button>
            )}
            {(l.situacao === "concluida" || l.situacao === "em_andamento") && l.visita_id && (
              <Button size="sm" variant="outline" className="h-9" onClick={onAbrir}>Ver</Button>
            )}
            {temCoord && (
              // Abre o app de mapas do celular. É a função mais usada da tela
              // em campo e não depende de nada nosso.
              <a
                className="inline-flex items-center justify-center gap-1 h-9 px-2.5 rounded-md border text-xs"
                href={`https://www.google.com/maps/dir/?api=1&destination=${l.pdv_lat},${l.pdv_lng}`}
                target="_blank" rel="noreferrer"
              >
                <Navigation className="h-3.5 w-3.5" /> Rota
              </a>
            )}
            {/* Do mesmo tamanho do botão de Rota, e pelo mesmo motivo: os dois
                são o que se toca com o polegar antes de descer do carro. */}
            {l.contact_phone && (
              <a
                className="inline-flex items-center justify-center gap-1 h-9 px-2.5 rounded-md border text-xs"
                href={`tel:${l.contact_phone.replace(/\D/g, "")}`}
              >
                <Phone className="h-3.5 w-3.5" /> Ligar
              </a>
            )}
            {/* ⚠️ CANCELAR existia como hook (`useCancelarPlanejada`) e nunca foi
                ligado a botão nenhum. Não é cosmético: a view marca como
                `nao_cumprida` toda planejada de dia passado sem visita, e a
                aderência tira as canceladas do denominador. Sem este botão,
                "o cliente pediu para remarcar" conta como falha de execução do
                vendedor — o indicador de gestão nasce errado por falta de um
                diálogo. */}
            {podeIniciar && meu && onCancelar && (
              <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-muted-foreground"
                      onClick={onCancelar}>
                <Ban className="h-3.5 w-3.5" /> Cancelar
              </Button>
            )}
          </div>
        </div>
      </CarboCardContent>
    </CarboCard>
  );
}

// ── Agendar ──────────────────────────────────────────────────────────────────

function DialogAgendar({
  open, onOpenChange, dia,
}: { open: boolean; onOpenChange: (v: boolean) => void; dia: string }) {
  const { user, isGestor } = useAuth();
  const { data: pdvs } = usePdvs();
  const { data: equipe } = useTeamMembers();
  const planejar = usePlanejarVisita();

  const [pdvId, setPdvId] = useState("");
  const [vendedorId, setVendedorId] = useState(() => user?.id ?? "");
  const [data, setData] = useState(dia);
  const [obs, setObs] = useState("");
  const [busca, setBusca] = useState("");

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    // PDV inativo fica de fora: agendar visita a ponto fechado é ruído puro.
    const ativos = (pdvs ?? []).filter((p) => p.status !== "inactive");
    if (!t) return ativos.slice(0, 50);
    return ativos.filter((p) =>
      p.name.toLowerCase().includes(t) ||
      (p.address_city ?? "").toLowerCase().includes(t) ||
      p.pdv_code.toLowerCase().includes(t),
    ).slice(0, 50);
  }, [pdvs, busca]);

  function salvar() {
    if (!pdvId) { toast.error("Escolha o PDV."); return; }
    planejar.mutate(
      { pdv_id: pdvId, vendedor_id: vendedorId, data_prevista: data, observacao: obs.trim() || null },
      { onSuccess: () => { onOpenChange(false); setPdvId(""); setObs(""); setBusca(""); } },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Agendar visita</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Dia</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="h-9" />
          </div>

          {isGestor && (
            <div>
              <Label className="text-xs">Vendedor</Label>
              <Select value={vendedorId} onValueChange={setVendedorId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Escolha" /></SelectTrigger>
                <SelectContent>
                  {(equipe ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="text-xs">Ponto de venda</Label>
            <Input placeholder="Buscar por nome, cidade ou código..." value={busca}
              onChange={(e) => setBusca(e.target.value)} className="h-9 mb-1.5" />
            <div className="max-h-52 overflow-y-auto rounded-md border divide-y">
              {lista.length === 0 && (
                <p className="text-xs text-muted-foreground p-3 text-center">Nenhum PDV encontrado.</p>
              )}
              {lista.map((p) => (
                <button key={p.id} type="button" onClick={() => setPdvId(p.id)}
                  className={`w-full text-left px-2.5 py-2 text-sm flex items-center gap-2 ${
                    pdvId === p.id ? "bg-primary/10" : "hover:bg-muted"}`}>
                  {pdvId === p.id
                    ? <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                    : <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  <span className="flex-1 min-w-0">
                    <span className="block truncate">{p.name}</span>
                    <span className="block text-[11px] text-muted-foreground truncate">
                      {[p.address_city, p.address_state].filter(Boolean).join("/")} · {p.pdv_code}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs">Observação (opcional)</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2}
              placeholder="Levar material de PDV, falar com o gerente..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={planejar.isPending}>
            {planejar.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
