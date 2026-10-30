import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useParamUrl } from "@carbo/shell";
import {
  MessagesSquare, AlertTriangle, Search, BellOff, BellRing, ArrowLeft,
  SlidersHorizontal, ChevronDown, SearchX, Clock, CheckCheck, UserCheck, Undo2, Check,
  Tag as TagIcon, EyeOff, Send, User, X, StickyNote, Plus, Paperclip, Mic, Square,
  CalendarClock, MessageSquarePlus, Copy, Trash2, FileText,
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

type Resposta = { atalho: string; corpo: string };
type Agendada = { id: number; texto: string; quando: string };

/** "2026-10-14T15:30" no fuso local — o formato do `datetime-local`. */
function paraInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function hora(v: string) {
  return new Date(v).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** As respostas rápidas — o mesmo painel da tela de Conversas, só que local. */
function RespostasRapidas({ lista, aoCriar, aoApagar, aoUsar }: {
  lista: Resposta[];
  aoCriar: (r: Resposta) => void;
  aoApagar: (atalho: string) => void;
  aoUsar: (r: Resposta) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [criando, setCriando] = useState(false);
  const [atalho, setAtalho] = useState("");
  const [corpo, setCorpo] = useState("");
  const caixa = useRef<HTMLDivElement>(null);
  const limpo = atalho.trim().toLowerCase().replace(/^\//, "");
  const valido = /^[a-z0-9_-]{1,24}$/.test(limpo);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  return (
    <div ref={caixa} className="relative">
      <Button size="sm" variant="outline" className="h-8 w-8 p-0"
              title="Respostas rápidas"
              aria-label="Respostas rápidas" aria-expanded={aberto}
              onClick={() => setAberto((v) => !v)}>
        <MessageSquarePlus className="h-3.5 w-3.5" />
      </Button>
      {aberto && (
        <div className="absolute bottom-10 right-0 z-30 w-80 rounded-xl border bg-background p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold">Respostas rápidas</p>
            <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[10px]"
                    onClick={() => setCriando((v) => !v)}>
              {criando ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
              {criando ? "Cancelar" : "Nova"}
            </Button>
          </div>
          {criando && (
            <div className="mb-3 space-y-2 rounded-lg border bg-muted/40 p-2">
              <label className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">Atalho</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-sm text-muted-foreground">/</span>
                  <Input value={atalho} onChange={(e) => setAtalho(e.target.value)}
                         placeholder="apresentacao" maxLength={24}
                         className="h-7 min-w-0 flex-1 font-mono text-xs" />
                </div>
                {!!atalho.trim() && (
                  <span className={`mt-1 block text-[10px] ${valido ? "text-muted-foreground" : "text-amber-500"}`}>
                    {valido
                      ? <>vai ser chamada por <span className="font-mono">/{limpo}</span></>
                      : "só letras, números, hífen e _ — até 24, sem espaço"}
                  </span>
                )}
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">Texto</span>
                <Textarea value={corpo} onChange={(e) => setCorpo(e.target.value)} rows={3} maxLength={4096}
                          placeholder="Oi! Aqui é da Carbo, falo em nome do seu fornecedor…"
                          className="resize-none text-xs" />
              </label>
              <Button size="sm" className="h-7 w-full gap-1.5 text-xs" disabled={!valido || !corpo.trim()}
                      onClick={() => {
                        aoCriar({ atalho: limpo, corpo: corpo.trim() });
                        toast.success(`Resposta salva. Chame por /${limpo}`);
                        setAtalho(""); setCorpo(""); setCriando(false);
                      }}>
                Salvar
              </Button>
            </div>
          )}
          {lista.length === 0 ? (
            <p className="py-4 text-center text-[11px] text-muted-foreground">
              Nenhuma resposta ainda.
            </p>
          ) : (
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {lista.map((r) => (
                <div key={r.atalho} className="group flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/60">
                  <button type="button" className="min-w-0 flex-1 text-left"
                          onClick={() => { aoUsar(r); setAberto(false); }}>
                    <span className="block font-mono text-[11px] font-semibold">/{r.atalho}</span>
                    <span className="line-clamp-2 block text-[11px] text-muted-foreground">{r.corpo}</span>
                  </button>
                  <button type="button" title="Apagar" aria-label="Apagar resposta"
                          onClick={() => aoApagar(r.atalho)}
                          className="shrink-0 rounded-sm p-1 text-muted-foreground opacity-0
                                     transition-opacity hover:text-red-500 group-hover:opacity-100">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** "Quem recebe o aviso" — na tela de Conversas é a lista do time interno;
 *  aqui, sem banco, é só você. */
function QuemRecebe({ recebo, alternar, aoFechar }: {
  recebo: boolean; alternar: () => void; aoFechar: () => void;
}) {
  return (
    <CarboCard>
      <CarboCardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <BellRing className="h-4 w-4" /> Quem recebe o aviso
          </h3>
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={aoFechar}>
            <X className="h-3.5 w-3.5" /> Fechar
          </Button>
        </div>
        <div className="mt-3 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          <button type="button" onClick={alternar}
                  className={`flex items-center gap-2 rounded-md border p-2 text-left transition-colors ${
                    recebo ? "border-carbo-green/50 bg-carbo-green/5"
                           : "border-transparent hover:border-border hover:bg-muted/40"}`}>
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
              recebo ? "border-carbo-green/50 bg-carbo-green/20 text-emerald-500" : "border-border"}`}>
              {recebo && <Check className="h-3 w-3" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">Você</span>
              <span className="block truncate text-[10px] text-muted-foreground">
                {recebo ? "recebe o aviso" : "não recebe"}
              </span>
            </span>
          </button>
        </div>
      </CarboCardContent>
    </CarboCard>
  );
}

/** O aviso de que não há número — no meio da coluna da conversa (no celular,
 *  na lista, onde a conversa não aparece). */
function SemNumero() {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full border
                       border-amber-500/30 bg-amber-500/10">
        <AlertTriangle className="h-5 w-5 text-amber-500" />
      </span>
      <p className="text-sm font-medium text-amber-500">
        Nenhum número de WhatsApp ativo para o <span className="whitespace-nowrap">Pré-Vendas</span>.
      </p>
    </div>
  );
}

export default function Atendimento() {
  const [verQuemRecebe, setVerQuemRecebe] = useState(false);
  const [buscandoNaConversa, setBuscandoNaConversa] = useState(false);
  const [verArquivos, setVerArquivos] = useState(false);
  const [respostas, setRespostas] = useState<Resposta[]>([]);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [gravando, setGravando] = useState(false);
  const [verAgendar, setVerAgendar] = useState(false);
  const [quando, setQuando] = useState("");
  const [agendadas, setAgendadas] = useState<Agendada[]>([]);
  const [confirmarParar, setConfirmarParar] = useState(false);
  const [semOfertas, setSemOfertas] = useState(false);
  // Aba e busca na URL (`?aba=pendentes&busca=`), como na tela de Conversas do
  // Atendimento: o F5 não devolve a caixa para "Todas".
  const [abaUrl, setAbaUrl] = useParamUrl("aba", "todas");
  const aba = (ABAS.some((a) => a.id === abaUrl) ? abaUrl : "todas") as Aba;
  const setAba = (v: Aba) => setAbaUrl(v);
  const [busca, setBusca] = useParamUrl("busca", "", { replace: true });
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
  const enviar = () => {
    if (!texto.trim() && !arquivo) return;
    toast.error(SEM_NUMERO);
  };
  const usarResposta = (r: Resposta) => setTexto((t) => (t.trim() ? `${t}\n${r.corpo}` : r.corpo));
  const abrirAgendar = () => {
    setQuando(paraInput(new Date(Date.now() + 3_600_000)));
    setVerAgendar((v) => !v);
  };
  const confirmarAgendar = () => {
    if (!quando) return;
    if (new Date(quando).getTime() <= Date.now()) {
      toast.error("Escolha um horário no futuro.");
      return;
    }
    setAgendadas((a) => [...a, { id: Date.now(), texto: texto.trim(), quando }]);
    setTexto("");
    setVerAgendar(false);
    toast.success(`Agendada para ${hora(quando)}`);
  };
  const sugestoes = texto.startsWith("/") && !texto.includes(" ")
    ? respostas.filter((r) => r.atalho.startsWith(texto.slice(1).toLowerCase()))
    : [];
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
        className="md:flex-col md:items-stretch lg:flex-row lg:items-center"
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="outline"
                    className={`h-8 gap-1.5 ${recebo ? "" : "text-amber-500"}`}
                    onClick={() => setVerQuemRecebe((v) => !v)}>
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

      {verQuemRecebe && (
        <QuemRecebe recebo={recebo} aoFechar={() => setVerQuemRecebe(false)}
                    alternar={() => setRecebo((v) => !v)} />
      )}


      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[20rem_1fr] 2xl:grid-cols-[20rem_1fr_19rem]">
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
              <SearchX className={`mx-auto h-5 w-5 text-muted-foreground/60 ${recortado ? "" : "hidden lg:block"}`} />
              {recortado ? (
                <>
                  <p className="mt-2 text-xs text-muted-foreground">Nenhuma conversa com esse filtro.</p>
                  <Button size="sm" variant="outline" className="mt-3 h-7 text-[11px]" onClick={limparTudo}>
                    Limpar busca e filtros
                  </Button>
                </>
              ) : (
                <>
                  <div className="hidden lg:block">
                    <p className="mt-2 text-xs text-muted-foreground">Nenhuma conversa ainda.</p>
                  </div>
                  {/* Abaixo do `lg` a coluna da conversa some: o aviso vem para cá. */}
                  <div className="mt-2 lg:hidden"><SemNumero /></div>
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
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-muted-foreground">Nenhuma conversa aberta</p>
                <p className="truncate text-[11px] text-muted-foreground/70">Janela de 24 h fechada</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button size="sm" variant={buscandoNaConversa ? "secondary" : "ghost"} className="h-8 w-8 p-0"
                        title="Procurar nesta conversa"
                        onClick={() => setBuscandoNaConversa((v) => !v)}>
                  <Search className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant={verArquivos ? "secondary" : "ghost"} className="h-8 w-8 p-0"
                        title="Arquivos da conversa"
                        onClick={() => setVerArquivos((v) => !v)}>
                  <Paperclip className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-emerald-500" title="Resolver"
                        onClick={() => { setStatus("resolvido"); toast.success("Conversa marcada como resolvida"); }}>
                  <CheckCheck className="h-3.5 w-3.5" /> <span className="hidden xl:inline">Resolver</span>
                </Button>
              </div>
            </div>

            {buscandoNaConversa && (
              <div className="flex items-center gap-2 border-b border-border px-4 py-2">
                <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <Input autoFocus placeholder="Procurar nesta conversa…"
                       className="h-8 flex-1 border-0 bg-transparent px-0 text-xs shadow-none
                                  focus-visible:ring-0 focus-visible:ring-offset-0" />
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">0 de 0</span>
                <button type="button" onClick={() => setBuscandoNaConversa(false)} aria-label="Fechar a busca"
                        className="shrink-0 rounded-sm p-1 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {verArquivos && (
              <div className="border-b border-border px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold">Arquivos da conversa</p>
                  <button type="button" onClick={() => setVerArquivos(false)} aria-label="Fechar a galeria"
                          className="rounded-sm p-1 text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Nenhuma foto, áudio ou documento nesta conversa.
                </p>
              </div>
            )}

            {/* O aviso de "sem número" mora AQUI, no meio da conversa, e não numa
                tarja no topo: é a resposta para "por que não há nada", e no lugar
                onde a conversa apareceria ele se explica sozinho. */}
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <SemNumero />
            </div>

            {agendadas.length > 0 && (
              <div className="space-y-1 border-t border-border px-4 py-2">
                <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.08em]
                              text-muted-foreground/70">
                  <CalendarClock className="h-3 w-3" /> Agendadas
                </p>
                {agendadas.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 rounded-md border border-dashed
                                             border-border bg-muted/30 px-2 py-1.5">
                    <span className="shrink-0 text-[10px] font-medium tabular-nums text-carbo-green">
                      {hora(a.quando)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px]">{a.texto}</span>
                    <button type="button" title="Cancelar agendamento"
                            onClick={() => { setAgendadas((x) => x.filter((y) => y.id !== a.id)); toast.success("Agendamento cancelado"); }}
                            className="shrink-0 rounded-sm p-1 text-muted-foreground hover:text-red-500">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

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
                <div className="relative rounded-lg border bg-muted/40 p-2">
                  {sugestoes.length > 0 && (
                    <div className="absolute bottom-full left-2 z-20 mb-1 w-72 rounded-lg border bg-background p-1 shadow-xl">
                      {sugestoes.map((r) => (
                        <button key={r.atalho} type="button"
                                onClick={() => setTexto(r.corpo)}
                                className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-muted/60">
                          <span className="block font-mono text-[11px] font-semibold">/{r.atalho}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">{r.corpo}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {arquivo && (
                    <div className="mb-1.5 flex items-center gap-2 rounded-md border bg-background/60 px-2 py-1.5">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-[11px]">{arquivo.name}</span>
                      <button type="button" onClick={() => setArquivo(null)} aria-label="Tirar o arquivo"
                              className="shrink-0 rounded-sm p-1 text-muted-foreground hover:text-foreground">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  {gravando && (
                    <p className="mb-1.5 flex items-center gap-1.5 text-[11px] text-red-500">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> Gravando áudio…
                    </p>
                  )}
                  <Textarea value={texto} onChange={(e) => setTexto(e.target.value)}
                            placeholder="Responder…" rows={3} maxLength={4096}
                            className="resize-y border-0 bg-transparent px-1 py-0.5 text-base shadow-none sm:text-xs
                                       focus-visible:ring-0 focus-visible:ring-offset-0"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); enviar(); }
                            }} />
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-1.5">
                    <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
                      <input ref={arquivoRef} type="file" className="hidden"
                             accept="image/jpeg,image/png,application/pdf,text/plain"
                             onChange={(e) => {
                               const f = e.target.files?.[0];
                               e.target.value = "";
                               if (f) setArquivo(f);
                             }} />
                      <RespostasRapidas lista={respostas} aoUsar={usarResposta}
                                        aoCriar={(r) => setRespostas((x) => [...x.filter((y) => y.atalho !== r.atalho), r])}
                                        aoApagar={(a) => setRespostas((x) => x.filter((y) => y.atalho !== a))} />
                      <Button size="sm" variant="outline" className="h-8 w-8 p-0"
                              title="Enviar foto ou documento" disabled={gravando}
                              onClick={() => arquivoRef.current?.click()}>
                        <Paperclip className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline"
                              className={`h-8 gap-1.5 ${gravando ? "border-red-500/50 text-red-500" : "w-8 p-0"}`}
                              title={gravando ? "Parar" : "Gravar áudio"}
                              onClick={() => {
                                if (gravando) { setGravando(false); toast.error(SEM_NUMERO); }
                                else setGravando(true);
                              }}>
                        {gravando
                          ? <><Square className="h-3.5 w-3.5 fill-current" /> Parar</>
                          : <Mic className="h-3.5 w-3.5" />}
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 gap-1.5"
                              disabled={!texto.trim()} onClick={abrirAgendar}>
                        <CalendarClock className="h-3.5 w-3.5" /> Agendar
                      </Button>
                      <Button size="sm" className="h-8 gap-1.5" title="Enviar"
                              disabled={!texto.trim() && !arquivo} onClick={enviar}>
                        <Send className="h-3.5 w-3.5" /> Enviar
                      </Button>
                    </div>
                  </div>
                  {verAgendar && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2">
                      <span className="text-[11px] text-muted-foreground">enviar em</span>
                      <Input type="datetime-local" value={quando}
                             onChange={(e) => setQuando(e.target.value)}
                             min={paraInput(new Date(Date.now() + 60_000))}
                             className="h-8 w-full text-xs sm:w-[13rem]" />
                      <Button size="sm" className="h-8 gap-1.5" disabled={!quando} onClick={confirmarAgendar}>
                        <CalendarClock className="h-3.5 w-3.5" /> Confirmar
                      </Button>
                      <span className="text-[10px] text-muted-foreground">
                        no máximo até o fim da janela de 24 h
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CarboCardContent>
        </CarboCard>

        {/* ── Painel do contato ─────────────────────────────────────────── */}
        <CarboCard className="hidden min-h-0 2xl:flex 2xl:flex-col">
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
              <div className="flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1">
                <span className="min-w-0 flex-1 font-mono text-[15px] tracking-tight text-muted-foreground/50">
                  —
                </span>
                <button type="button" title="Copiar número" aria-label="Copiar número"
                        onClick={() => toast.error("Nenhuma conversa aberta — não há número para copiar.")}
                        className="shrink-0 rounded-sm p-1 text-muted-foreground transition-colors hover:text-carbo-green">
                  <Copy className="h-3.5 w-3.5" />
                </button>
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

                <div className="border-t border-border pt-2.5">
                  {semOfertas ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-purple-500/30
                                       bg-purple-500/10 px-2 py-1 text-[10px] font-medium text-purple-400">
                        <BellOff className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">Não recebe ofertas desde {new Date().toLocaleDateString("pt-BR")}</span>
                      </span>
                      <button type="button" onClick={() => { setSemOfertas(false); toast.success("Volta a receber ofertas."); }}
                              className="shrink-0 text-[11px] text-muted-foreground underline-offset-2
                                         hover:text-foreground hover:underline">
                        Voltar a enviar
                      </button>
                    </div>
                  ) : confirmarParar ? (
                    <div className="space-y-2">
                      <p className="text-[11px] leading-snug text-muted-foreground">
                        Este posto deixa de receber mensagens comerciais, em todos os números.
                      </p>
                      <div className="grid grid-cols-2 gap-1.5">
                        <Button size="sm" variant="outline" className="h-8 text-[11px]"
                                onClick={() => setConfirmarParar(false)}>
                          Cancelar
                        </Button>
                        <Button size="sm" className="h-8 bg-purple-600 text-[11px] text-white hover:bg-purple-700"
                                onClick={() => { setSemOfertas(true); setConfirmarParar(false); toast.success("Não recebe mais ofertas."); }}>
                          Parar ofertas
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmarParar(true)}
                            className="flex w-full items-center gap-1.5 text-left text-[11px] text-muted-foreground
                                       hover:text-foreground">
                      <BellOff className="h-3.5 w-3.5 shrink-0" />
                      Parar de enviar ofertas a este posto
                    </button>
                  )}
                </div>
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
