import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  MessagesSquare, AlertTriangle, Search, MessageCircle, BellOff, BellRing, ArrowLeft,
  SlidersHorizontal, ChevronDown, SearchX, Clock, CheckCheck, UserCheck, Undo2, Check,
  Tag as TagIcon, EyeOff, Send, User, X, StickyNote, Plus,
} from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

/**
 * Atendimento do Pré-Vendas — a CASCA da tela de Conversas do Carbo
 * Atendimento (pedido do dono do processo, 14/10/2026).
 *
 * O time de pré-venda atende hoje pelo WhatsApp Web, sem número da Cloud API.
 * A tela existe para eles verem onde o atendimento vai morar: tudo é
 * CLICÁVEL (abas, busca, filtros, status, responsável, etiquetas, campo de
 * resposta), mas só mexe em estado LOCAL — nada vai a lugar nenhum, e enviar
 * avisa que não há número ativo. Quando houver um número para o Pré-Vendas,
 * ela passa a ler como a do Atendimento.
 *
 * O desenho é o MESMO da `Conversas.tsx` do `apps/atendimento`, copiado à mão:
 * lá cada pedaço depende de hooks de banco, aqui nada depende.
 *
 * ⚠️ NÃO lê banco nenhum, e isso é a regra, não preguiça: `carbo_wa_numeros`
 * e `carbo_wa_conversas` são as caixas da EMPRESA (serviço, Clube, loja). Ligar
 * esta tela a elas mostraria ao SDR as conversas dos clientes do e-commerce.
 * Número próprio do Pré-Vendas entra no cadastro com `funcao` própria, e a
 * leitura filtra por ele — nunca "todos os números".
 */
const ABAS = [
  { id: "pendentes", rotulo: "Não respondidas" },
  { id: "minhas", rotulo: "Minhas" },
  { id: "sem_dono", rotulo: "Sem responsável" },
  { id: "janela", rotulo: "Janela aberta" },
  { id: "todas", rotulo: "Todas" },
] as const;
type Aba = (typeof ABAS)[number]["id"];

type Filtros = { responsavel: string; tag: string; etapa: string; status: string; ordem: "recentes" | "antigas" };
const FILTROS_VAZIOS: Filtros = { responsavel: "", tag: "", etapa: "", status: "", ordem: "recentes" };

type Status = "aberto" | "aguardando" | "resolvido";
const SEM_NUMERO = "Nenhum número de WhatsApp ativo para o Pré-Vendas — nada foi enviado.";

const CLASSE_FILTRO = `w-full rounded-md border border-border/60 bg-muted/40 px-2 py-1.5
                       text-[11px] outline-none focus:border-carbo-green/40`;

export default function Atendimento() {
  const [aba, setAba] = useState<Aba>("todas");
  const [busca, setBusca] = useState("");
  const [painelFiltros, setPainelFiltros] = useState(false);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);
  const [recebo, setRecebo] = useState(false);

  const [modo, setModo] = useState<"responder" | "nota">("responder");
  const [texto, setTexto] = useState("");
  const [recado, setRecado] = useState("");

  const [status, setStatus] = useState<Status>("aberto");
  const [souResponsavel, setSouResponsavel] = useState(false);
  const [verResponsavel, setVerResponsavel] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [verTags, setVerTags] = useState(false);
  const [novaTag, setNovaTag] = useState("");

  const filtrosAtivos = (["responsavel", "tag", "etapa", "status"] as const)
    .filter((k) => filtros[k] !== "").length + (filtros.ordem !== "recentes" ? 1 : 0);
  const recortado = !!busca.trim() || aba !== "todas" || filtrosAtivos > 0;

  const limparTudo = () => { setBusca(""); setAba("todas"); setFiltros(FILTROS_VAZIOS); };
  const enviar = () => { if (!texto.trim()) return; toast.error(SEM_NUMERO); };
  const anotar = () => {
    if (!recado.trim()) return;
    toast.error("Nenhuma conversa aberta para anotar.");
  };
  const criarTag = () => {
    const t = novaTag.trim();
    if (!t || tags.includes(t)) return;
    setTags((x) => [...x, t]);
    setNovaTag("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 sm:gap-4 sm:p-4 md:p-6">
      <CarboPageHeader
        icon={MessagesSquare}
        title="Atendimento"
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="outline"
                    className={`h-8 gap-1.5 ${recebo ? "" : "text-amber-500"}`}
                    onClick={() => {
                      setRecebo((v) => !v);
                      toast.success(recebo ? "Você deixou de receber aviso" : "Você passa a receber aviso de mensagem nova");
                    }}>
              {recebo
                ? <><BellRing className="h-3.5 w-3.5" /> 1 recebe aviso</>
                : <><BellOff className="h-3.5 w-3.5" /> Ninguém recebe aviso</>}
            </Button>
            <Button asChild size="sm" variant="outline" className="h-8 gap-1.5">
              <Link to="/"><ArrowLeft className="h-3.5 w-3.5" /> Voltar</Link>
            </Button>
          </div>
        }
      />

      <CarboCard>
        <CarboCardContent className="p-4">
          <p className="flex items-start gap-1.5 text-xs text-amber-500">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
            Nenhum número de WhatsApp ativo para o Pré-Vendas.
          </p>
        </CarboCardContent>
      </CarboCard>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[20rem_1fr] xl:grid-cols-[20rem_1fr_19rem]">
        {/* ── Lista ─────────────────────────────────────────────────────── */}
        <CarboCard className="min-h-0 min-w-0 overflow-hidden p-0">
          <CarboCardContent className="flex h-full min-h-0 flex-col gap-0 p-0">
            <div className="shrink-0 space-y-2 border-b p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5
                                   -translate-y-1/2 text-muted-foreground" />
                <Input value={busca} onChange={(e) => setBusca(e.target.value)}
                       placeholder="Buscar por nome ou número…"
                       className="h-10 border-border bg-muted/40 pl-8 pr-8 text-base sm:h-9 sm:text-xs
                                  placeholder:text-muted-foreground/70" />
                {busca && (
                  <button type="button" onClick={() => setBusca("")} aria-label="Limpar busca"
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-1
                                     text-muted-foreground transition-colors hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {busca.trim() && (
                <p className="px-0.5 text-[10px] leading-none text-muted-foreground">
                  0 de 0 com “{busca.trim()}”
                </p>
              )}

              <div className="grid grid-cols-2 gap-1">
                {ABAS.map((f) => {
                  const ativo = aba === f.id;
                  return (
                    <button key={f.id} type="button" aria-pressed={ativo}
                            onClick={() => setAba(f.id)}
                            className={`flex items-center justify-between gap-1.5 rounded-md border
                                        px-2 py-1.5 text-[11px] font-medium leading-none
                                        transition-colors ${f.id === "todas" ? "col-span-2" : ""} ${
                              ativo
                                ? "border-carbo-green/40 bg-carbo-green/10 text-foreground"
                                : "border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground"}`}>
                      <span className="truncate">{f.rotulo}</span>
                      <span className="min-w-[1.5rem] shrink-0 rounded px-1 py-0.5 text-center
                                       text-[10px] font-semibold tabular-nums text-muted-foreground/40">
                        0
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setPainelFiltros((v) => !v)}
                        aria-expanded={painelFiltros}
                        className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border
                                    px-2 py-1.5 text-[11px] font-medium leading-none transition-colors ${
                          filtrosAtivos > 0
                            ? "border-carbo-green/40 bg-carbo-green/10 text-foreground"
                            : "border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted/70"}`}>
                  <SlidersHorizontal className="h-3 w-3" />
                  Filtros
                  {filtrosAtivos > 0 && (
                    <span className="rounded bg-carbo-green/20 px-1 py-0.5 text-[10px]
                                     font-semibold tabular-nums text-carbo-green">
                      {filtrosAtivos}
                    </span>
                  )}
                  <ChevronDown className={`h-3 w-3 transition-transform ${painelFiltros ? "rotate-180" : ""}`} />
                </button>
                {filtrosAtivos > 0 && (
                  <button type="button" onClick={() => setFiltros(FILTROS_VAZIOS)}
                          title="Limpar filtros"
                          className="shrink-0 rounded-md border border-border/60 bg-muted/40 p-1.5
                                     text-muted-foreground transition-colors hover:bg-muted/70">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {painelFiltros && (
                <div className="space-y-1">
                  {([
                    ["responsavel", "Responsável", [["eu", "Você"], ["ninguem", "Sem responsável"]]],
                    ["tag", "Etiqueta", tags.map((t) => [t, t])],
                    ["etapa", "Etapa do aviso",
                      [["primeiro_contato", "Primeiro contato"], ["qualificacao", "Qualificação"], ["agendamento", "Agendamento"]]],
                    ["status", "Status",
                      [["aberto", "Aberto"], ["em_atendimento", "Em atendimento"], ["aguardando", "Aguardando"], ["resolvido", "Resolvido"]]],
                  ] as const).map(([k, rot, ops]) => (
                    <select key={k} aria-label={rot} value={filtros[k]}
                            onChange={(e) => setFiltros((f) => ({ ...f, [k]: e.target.value }))}
                            className={CLASSE_FILTRO}>
                      <option value="">{rot}: qualquer</option>
                      {ops.map(([v, r]) => <option key={v} value={v}>{rot}: {r}</option>)}
                    </select>
                  ))}
                  <select aria-label="Ordenar" value={filtros.ordem}
                          onChange={(e) => setFiltros((f) => ({ ...f, ordem: e.target.value as Filtros["ordem"] }))}
                          className={CLASSE_FILTRO}>
                    <option value="recentes">Mais recentes primeiro</option>
                    <option value="antigas">Mais antigas primeiro</option>
                  </select>
                  <p className="px-0.5 text-[10px] leading-tight text-muted-foreground/70">
                    A ordem vale dentro de cada grupo.
                  </p>
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-8 text-center">
              <SearchX className="mx-auto h-5 w-5 text-muted-foreground/60" />
              {recortado ? (
                <>
                  <p className="mt-2 text-xs text-muted-foreground">Nenhuma conversa com esse filtro.</p>
                  <p className="mx-auto mt-1 max-w-[15rem] text-[10px] text-muted-foreground/80">
                    {busca.trim()
                      ? <>Nada casou com “{busca.trim()}”. São 0 conversas no total.</>
                      : <>São 0 conversas no total — troque o filtro para vê-las.</>}
                  </p>
                  <Button size="sm" variant="outline" className="mt-3 h-7 text-[11px]" onClick={limparTudo}>
                    Limpar busca e filtros
                  </Button>
                </>
              ) : (
                <>
                  <p className="mt-2 text-xs text-muted-foreground">Nenhuma conversa ainda.</p>
                  <p className="mx-auto mt-1 max-w-[15rem] text-[10px] text-muted-foreground/80">
                    Ela aparece quando houver um número ativo e um posto escrever para ele.
                  </p>
                </>
              )}
            </div>
          </CarboCardContent>
        </CarboCard>

        {/* ── Conversa ──────────────────────────────────────────────────── */}
        <CarboCard className="hidden min-h-0 min-w-0 lg:flex lg:flex-col">
          <CarboCardContent className="flex min-h-[24rem] flex-1 flex-col p-0">
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full
                               border border-border bg-muted/40 text-muted-foreground">
                <User className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-muted-foreground">Nenhuma conversa aberta</p>
                <p className="text-[11px] text-muted-foreground/70">Janela de 24 h fechada</p>
              </div>
            </div>

            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
              <MessageCircle className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Selecione uma conversa</p>
            </div>

            <div className="border-t border-border p-3">
              <div className="mb-1.5 flex items-center gap-1">
                {([
                  { id: "responder", rotulo: "Responder" },
                  { id: "nota", rotulo: "Recado interno" },
                ] as const).map((t) => (
                  <button key={t.id} type="button" onClick={() => setModo(t.id)}
                          className={`flex items-center gap-1.5 rounded-t-md border-b-2 px-2.5 py-1
                                      text-[11px] font-medium transition-colors ${
                            modo === t.id
                              ? t.id === "nota"
                                ? "border-amber-500 text-amber-500"
                                : "border-carbo-green text-foreground"
                              : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                    {t.id === "nota" && <EyeOff className="h-3 w-3" />}
                    {t.rotulo}
                  </button>
                ))}
              </div>

              {modo === "nota" ? (
                <div className="rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 p-2">
                  <Textarea value={recado} onChange={(e) => setRecado(e.target.value)}
                            placeholder="Recado para o time…" rows={3} maxLength={2000}
                            className="resize-y border-0 bg-transparent px-1 py-0.5 text-base shadow-none sm:text-xs
                                       focus-visible:ring-0 focus-visible:ring-offset-0"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); anotar(); }
                            }} />
                  <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-amber-500/20 pt-1.5">
                    <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <EyeOff className="h-3 w-3 shrink-0" /> não vai para o WhatsApp
                    </p>
                    <Button size="sm" className="h-8 gap-1.5" disabled={!recado.trim()} onClick={anotar}>
                      <StickyNote className="h-3.5 w-3.5" /> Anotar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border bg-muted/40 p-2">
                  <Textarea value={texto} onChange={(e) => setTexto(e.target.value)}
                            placeholder="Responder…" rows={3} maxLength={4096}
                            className="resize-y border-0 bg-transparent px-1 py-0.5 text-base shadow-none sm:text-xs
                                       focus-visible:ring-0 focus-visible:ring-offset-0"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); enviar(); }
                            }} />
                  <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-border/60 pt-1.5">
                    <p className="text-[10px] text-muted-foreground">Ctrl+Enter envia</p>
                    <Button size="sm" className="h-8 gap-1.5" disabled={!texto.trim()} onClick={enviar}>
                      <Send className="h-3.5 w-3.5" /> Enviar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CarboCardContent>
        </CarboCard>

        {/* ── Painel do contato ─────────────────────────────────────────── */}
        <CarboCard className="hidden min-h-0 xl:flex xl:flex-col">
          <CarboCardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto p-0">
            <div className="space-y-2 border-b border-border px-4 pb-3 pt-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full
                                 border border-carbo-green/30 bg-carbo-green/5 text-[15px]
                                 font-semibold text-carbo-green">
                  ?
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold leading-tight text-muted-foreground">
                    Sem contato
                  </p>
                  <p className="truncate text-[11px] leading-tight text-muted-foreground/70">
                    nenhuma conversa aberta
                  </p>
                </div>
              </div>
              <div className="rounded-md border border-border bg-muted/40 px-2 py-1 font-mono
                              text-[15px] tracking-tight text-muted-foreground/50">
                —
              </div>
            </div>

            <div className="space-y-3 px-4 pb-4">
              <div className="space-y-2.5 rounded-lg border border-border bg-muted/40 p-3">
                <div className="flex items-center">
                  {status === "aberto" ? (
                    <span className="inline-flex items-center rounded-md border border-dashed
                                     border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                      Sem pendência
                    </span>
                  ) : (
                    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium ${
                      status === "aguardando"
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
                        : "border-carbo-green/30 bg-carbo-green/10 text-carbo-green"}`}>
                      {status === "aguardando" ? "Aguardando" : "Resolvida"}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <Button size="sm" variant={status === "aguardando" ? "default" : "outline"}
                          className="h-9 w-full gap-1.5 text-[11px]"
                          onClick={() => setStatus((s) => (s === "aguardando" ? "aberto" : "aguardando"))}>
                    <Clock className="h-3.5 w-3.5" />
                    {status === "aguardando" ? "Retomar" : "Aguardando"}
                  </Button>
                  <Button size="sm" variant={status === "resolvido" ? "default" : "outline"}
                          className="h-9 w-full gap-1.5 text-[11px]"
                          onClick={() => setStatus((s) => (s === "resolvido" ? "aberto" : "resolvido"))}>
                    {status === "resolvido"
                      ? <><Undo2 className="h-3.5 w-3.5" /> Reabrir</>
                      : <><CheckCheck className="h-3.5 w-3.5" /> Resolver</>}
                  </Button>
                </div>
                <div className="flex items-center gap-1.5">
                  {souResponsavel ? (
                    <p className="flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md
                                  border border-carbo-green/30 bg-carbo-green/5 px-2 text-[11px]
                                  font-medium text-carbo-green">
                      <Check className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">Com você</span>
                    </p>
                  ) : (
                    <Button size="sm" variant="outline"
                            className="h-9 min-w-0 flex-1 gap-1.5 border-carbo-green/40 text-[11px]
                                       text-carbo-green hover:bg-carbo-green/5 hover:text-carbo-green"
                            onClick={() => setSouResponsavel(true)}>
                      <UserCheck className="h-3.5 w-3.5 shrink-0" /> Assumir
                    </Button>
                  )}
                  <button type="button" onClick={() => setVerResponsavel((v) => !v)}
                          aria-expanded={verResponsavel}
                          title="Passar para outra pessoa" aria-label="Passar para outra pessoa"
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border
                                      border-border transition-colors ${
                            verResponsavel ? "bg-muted/60 text-foreground"
                                           : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"}`}>
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${verResponsavel ? "rotate-180" : ""}`} />
                  </button>
                </div>
                {verResponsavel && (
                  <div className="flex items-center gap-2 border-t border-border pt-2.5">
                    <span className="shrink-0 text-[11px] text-muted-foreground">Passar para</span>
                    <select value={souResponsavel ? "eu" : ""}
                            onChange={(e) => { setSouResponsavel(e.target.value === "eu"); setVerResponsavel(false); }}
                            className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2
                                       text-[11px] text-foreground">
                      <option value="">Sem responsável</option>
                      <option value="eu">Você</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {tags.map((t) => (
                    <button key={t} type="button" title="Tirar etiqueta"
                            onClick={() => setTags((x) => x.filter((y) => y !== t))}
                            className="group inline-flex items-center gap-1 rounded-md border border-border
                                       bg-muted/40 px-1.5 py-0.5 text-[10px] text-foreground">
                      {t}
                      <X className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  ))}
                  <button type="button" onClick={() => setVerTags((v) => !v)}
                          className="inline-flex items-center gap-1 rounded-md border border-dashed border-border
                                     px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors
                                     hover:text-foreground">
                    <TagIcon className="h-2.5 w-2.5" /> + etiqueta
                  </button>
                </div>
                {verTags && (
                  <div className="flex items-center gap-1 rounded-md border border-border bg-background/60 p-2">
                    <Input value={novaTag} onChange={(e) => setNovaTag(e.target.value)}
                           placeholder="Nova etiqueta" maxLength={24}
                           onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); criarTag(); } }}
                           className="h-8 flex-1 border-border text-[11px]" />
                    <Button size="sm" variant="outline" className="h-8 shrink-0 px-2 text-[11px]"
                            disabled={!novaTag.trim()} onClick={criarTag}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CarboCardContent>
        </CarboCard>
      </div>
    </div>
  );
}
