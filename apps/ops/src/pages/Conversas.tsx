import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  MessagesSquare, Send, Loader2, AlertTriangle, Clock, ArrowLeft, Lock, Paperclip,
  Image as ImageIcon, Video, Mic, FileText, MapPin, User,
  File as FileIcon, HelpCircle,
  Search, SearchX, X, Package, ArrowUpRight, CornerDownLeft, Megaphone,
  BellRing, BellOff, Check, CheckCheck, Inbox, Undo2, Sparkles, UserCheck, Tag as TagIcon, Plus,
  CalendarClock, Trash2, Square, Play, Pause, Download, StickyNote, EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import {
  useConversas, useConversasAoVivo, useResponder, janelaAberta, faltaDaJanela,
  nivelDaJanela, fracaoDaJanela, type NivelJanela,
  useNotificaveis, useMarcarNotificado, useResolverConversa,
  useAgendadas, useAgendar, useCancelarAgendada, useEnviarMidia, useMidia,
  useNotas, useAnotar, useApagarNota, type Nota,
  useDefinirStatus, useDefinirResponsavel, useAtendentes,
  useTags, useCriarTag, useMarcarTag,
  type StatusAtendimento, type TagConversa,
  type Conversa, type MensagemConversa, type EstadoConversa,
} from "@/hooks/useConversas";

/**
 * Conversas do WhatsApp oficial.
 *
 * ⚠️ Esta tela não é conveniência: é o ÚNICO lugar onde essas mensagens
 * existem. Número da Cloud API não aparece na Caixa de Entrada do Meta Business
 * Suite — aquela tela só aceita número do aplicativo WhatsApp Business — e a
 * Cloud API não tem endpoint de histórico. Sem aqui, a resposta do cliente
 * existe só no celular dele.
 *
 * ── O relógio é a informação principal ─────────────────────────────────────
 *
 * Texto livre só passa enquanto a janela de 24 h estiver aberta, e ela abre
 * quando o CLIENTE escreve. Fechada, a Meta recusa com 131047 e nenhum dos seis
 * templates da esteira serve para responder dúvida. Por isso o tempo restante
 * aparece em cada linha da lista, anda sozinho (sem F5) e muda de cor conforme
 * aperta: uma pergunta que ninguém viu a tempo não tem segunda chance.
 */

const hora = (s: string) =>
  new Date(s).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

/** Só o relógio. O `hora()` traz dia/mês porque a LISTA da esquerda mostra uma
 *  linha por conversa e lá a data é a única pista; dentro da conversa o dia já
 *  vem no separador, e repeti-lo em cada balão é ruído. */
const soHora = (s: string) =>
  new Date(s).toLocaleString("pt-BR", {
    hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
  });

/** O dia em Brasília, não em UTC — mesma armadilha do `ordered_at::date`:
 *  mensagem das 21h cairia no dia seguinte e o separador mentiria. */
const diaEmSP = (s: string) =>
  new Date(s).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

/**
 * Força a tela a se redesenhar de tempos em tempos.
 *
 * ⚠️ O relógio da janela ANDA SOZINHO, e depender do `refetchInterval` para
 * isso é frágil: rede lenta ou aba em segundo plano deixariam o contador
 * parado, e um contador parado é pior que nenhum — ele afirma um tempo que não
 * é mais verdade, e alguém decide não responder por causa dele.
 *
 * 30 s porque o menor passo exibido é o minuto: tique de 1 s redesenharia a
 * árvore inteira sessenta vezes para mudar nada na tela.
 */
function useRelogio(ms = 30_000) {
  const [, setTique] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTique((t) => t + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

/** "Hoje" / "Ontem" / "terça-feira, 12/08/2026".
 *
 *  ⚠️ "Ontem" sai de subtrair 24 h do agora e comparar o dia resultante em SP —
 *  não de aritmética de calendário. */
function rotuloDoDia(s: string): string {
  const dia = diaEmSP(s);
  const agora = Date.now();
  if (dia === diaEmSP(new Date(agora).toISOString())) return "Hoje";
  if (dia === diaEmSP(new Date(agora - 86_400_000).toISOString())) return "Ontem";
  return new Date(s).toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "2-digit", year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
}

const NOME_ETAPA: Record<string, string> = {
  confirmado: "Compra identificada", nf_emitida: "Nota fiscal emitida",
  etiqueta: "Aguardando coleta", em_transito: "A caminho",
  saiu_entrega: "Saiu para entrega", entregue: "Entregue",
};

/** Cor por nível, num lugar só: o badge, a barra e a lista têm de contar a
 *  mesma história — badge verde com barra vermelha é pior que nenhum dos dois. */
const TOM_JANELA: Record<NivelJanela, { texto: string; barra: string; borda: string; fundo: string }> = {
  folgada:   { texto: "text-emerald-500",      barra: "bg-emerald-500",          borda: "border-carbo-green/30", fundo: "bg-carbo-green/5" },
  apertando: { texto: "text-amber-500",        barra: "bg-amber-500",            borda: "border-amber-500/40",   fundo: "bg-amber-500/10" },
  urgente:   { texto: "text-red-500",          barra: "bg-red-500",              borda: "border-red-500/40",     fundo: "bg-red-500/10" },
  fechada:   { texto: "text-muted-foreground", barra: "bg-muted-foreground/40",  borda: "border-border",         fundo: "bg-muted/40" },
};

/** Inicial do avatar. A Cloud API não expõe foto de perfil, então a letra é o
 *  que dá rosto à conversa. Cai nos últimos dígitos do número quando não há
 *  nome — distingue duas conversas anônimas melhor que um "#" igual para todas. */
function inicialDe(cliente: string | null, wa_id: string): string {
  const base = (cliente ?? "").trim();
  return base ? base[0].toUpperCase() : wa_id.slice(-2);
}

/** Busca sem acento e sem caixa: quem digita "jose" tem de achar "José". */
const normalizar = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Número de WhatsApp se digita como se quer — com DDI, traço, parênteses.
 *  Comparar só os dígitos evita que "(84) 99999" não ache "5584999999999". */
const soDigitos = (s: string) => s.replace(/\D/g, "");

/**
 * As abas da caixa de entrada.
 *
 * ⚠️ FIXAS e visíveis, não escondidas atrás de um menu. Filtro dentro de menu é
 * filtro que ninguém usa e — pior — que fica ligado sem a pessoa perceber, e aí
 * a conversa "sumiu do sistema".
 *
 * As três primeiras são as que abrem o turno de trabalho: o que ninguém
 * respondeu, o que é meu, e o que não é de ninguém. "Todas" significa TODAS,
 * inclusive resolvidas — a queixa clássica dessas ferramentas é a conversa que
 * some até da aba que promete mostrar tudo.
 */
type FiltroConversa = "pendentes" | "minhas" | "sem_dono" | "aberta" | "todas";
const FILTROS: { id: FiltroConversa; rotulo: string }[] = [
  { id: "pendentes", rotulo: "Não respondidas" },
  { id: "minhas", rotulo: "Minhas" },
  { id: "sem_dono", rotulo: "Sem responsável" },
  { id: "aberta", rotulo: "Janela aberta" },
  { id: "todas", rotulo: "Todas" },
];

/** Como cada status se mostra. Um lugar só — chip da linha, cabeçalho de grupo
 *  e painel da direita contam a mesma história. */
const STATUS: Record<StatusAtendimento, { rotulo: string; grupo: string; classe: string }> = {
  aberto:         { rotulo: "Aberto",         grupo: "Abertas — ninguém respondeu",
                    classe: "border-amber-500/40 bg-amber-500/10 text-amber-500" },
  em_atendimento: { rotulo: "Em atendimento", grupo: "Em atendimento",
                    classe: "border-sky-500/40 bg-sky-500/10 text-sky-400" },
  aguardando:     { rotulo: "Aguardando",     grupo: "Aguardando o cliente",
                    classe: "border-violet-500/40 bg-violet-500/10 text-violet-400" },
  resolvido:      { rotulo: "Resolvido",      grupo: "Resolvidas",
                    classe: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" },
};

/** ⚠️ A ordem é a da urgência. "Sem pendência" (status nulo) fica por último:
 *  é histórico, não trabalho. */
const ORDEM_STATUS: (StatusAtendimento | null)[] =
  ["aberto", "em_atendimento", "aguardando", "resolvido", null];

/** A cor da etiqueta sai de uma paleta fechada, não de hexadecimal livre: cor
 *  solta produz etiqueta ilegível no tema escuro e ninguém percebe. */
const COR_TAG: Record<string, string> = {
  cinza:    "border-muted-foreground/30 bg-muted/50 text-muted-foreground",
  verde:    "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
  azul:     "border-sky-500/40 bg-sky-500/10 text-sky-400",
  ambar:    "border-amber-500/40 bg-amber-500/10 text-amber-500",
  vermelho: "border-red-500/40 bg-red-500/10 text-red-500",
  roxo:     "border-violet-500/40 bg-violet-500/10 text-violet-400",
};

/** Como cada estado se apresenta. Um lugar só — o cabeçalho de grupo, o chip da
 *  linha e a cor do avatar contam a mesma história. */
const ESTADO: Record<EstadoConversa, { rotulo: string; grupo: string; cor: string }> = {
  precisa_resposta: { rotulo: "sem resposta", grupo: "Precisam de resposta", cor: "text-amber-500" },
  resolvida:        { rotulo: "resolvida",    grupo: "Resolvidas",           cor: "text-emerald-500" },
  sem_pendencia:    { rotulo: "",             grupo: "Sem pendência",        cor: "text-muted-foreground" },
};

/** ⚠️ A ordem dos grupos é a da urgência, não a alfabética. "Sem pendência" é
 *  quase toda a lista (um aviso da esteira que ninguém respondeu) e fica por
 *  último: ela é histórico, não trabalho. */
const ORDEM_GRUPOS: EstadoConversa[] = ["precisa_resposta", "resolvida", "sem_pendencia"];

// ─── A linha do tempo da conversa ────────────────────────────────────────────

/** Duas mensagens do mesmo lado em menos disso viram um bloco só. Cinco minutos
 *  é o intervalo em que a pessoa ainda está escrevendo a MESMA ideia em três
 *  mensagens — repetir o horário nas três só polui. */
const JANELA_BLOCO_MS = 5 * 60 * 1000;

const mesmoBloco = (a?: MensagemConversa, b?: MensagemConversa) =>
  !!a && !!b &&
  a.direcao === b.direcao &&
  // ⚠️ Aviso da esteira nunca agrupa com mensagem digitada: são coisas de
  // naturezas diferentes saindo do mesmo lado, e juntá-las faria o template
  // parecer parte do que o atendimento escreveu.
  (a.tipo === "template") === (b.tipo === "template") &&
  diaEmSP(a.ocorrido_em) === diaEmSP(b.ocorrido_em) &&
  new Date(b.ocorrido_em).getTime() - new Date(a.ocorrido_em).getTime() <= JANELA_BLOCO_MS;

type LinhaDaConversa =
  | { kind: "dia"; chave: string; rotulo: string }
  | { kind: "msg"; m: MensagemConversa; primeira: boolean; ultima: boolean }
  | { kind: "nota"; n: Nota };

/**
 * Intercala separadores de dia e marca começo/fim de cada bloco.
 *
 * ⚠️ Puro e sem estado: é a MESMA lista que veio do `agruparConversas` (já
 * ordenada), reescrita para a tela. Nada aqui decide o que é mensagem nova,
 * some com linha ou muda ordem — quem ordena é o `lib/conversas.ts`, e ter duas
 * ordenações seria ter duas verdades sobre a mesma conversa.
 */
function montarLinhaDoTempo(msgs: MensagemConversa[], notas: Nota[] = []): LinhaDaConversa[] {
  const linhas: LinhaDaConversa[] = [];

  /* ⚠️ O recado entra NA HORA em que foi escrito, não no fim da lista. Ele
     quase sempre comenta a mensagem logo acima ("esse já teve dois estornos"),
     e jogado no rodapé perde a única coisa que o torna útil: o lugar. */
  let iNota = 0;
  const notasAte = (quando: string) => {
    while (iNota < notas.length && notas[iNota].criado_em <= quando) {
      linhas.push({ kind: "nota", n: notas[iNota] });
      iNota++;
    }
  };

  msgs.forEach((m, i) => {
    notasAte(m.ocorrido_em);
    const ant = msgs[i - 1];
    const prox = msgs[i + 1];
    if (!ant || diaEmSP(ant.ocorrido_em) !== diaEmSP(m.ocorrido_em)) {
      linhas.push({
        kind: "dia",
        chave: `dia-${diaEmSP(m.ocorrido_em)}-${m.wamid}`,
        rotulo: rotuloDoDia(m.ocorrido_em),
      });
    }
    linhas.push({
      kind: "msg", m,
      primeira: !mesmoBloco(ant, m),
      ultima: !mesmoBloco(m, prox),
    });
  });
  // Os recados escritos depois da última mensagem — o caso comum de quem anota
  // ao terminar o atendimento.
  while (iNota < notas.length) { linhas.push({ kind: "nota", n: notas[iNota] }); iNota++; }
  return linhas;
}

/** O ícone diz o que chegou antes de a pessoa ler o rótulo. `FileIcon` é o
 *  padrão porque tipo novo da Meta não pode virar quadrado vazio.
 *  ⚠️ Importado com apelido: `File` sem apelido sombreia o construtor do
 *  navegador, e a gravação de áudio precisa dele. */
const ICONE_MIDIA: Record<string, typeof Paperclip> = {
  image: ImageIcon, sticker: ImageIcon, video: Video,
  audio: Mic, voice: Mic, ptt: Mic,
  document: FileText, location: MapPin, contacts: User,
};

const NOME_MIDIA: Record<string, string> = {
  image: "Imagem", sticker: "Figurinha", video: "Vídeo",
  audio: "Áudio", voice: "Áudio", ptt: "Áudio",
  document: "Documento", location: "Localização", contacts: "Contato",
};

/**
 * O nome do arquivo que o próprio sistema gerou ao gravar.
 *
 * ⚠️ Ele foi parar no campo de texto da mensagem (é o que sobrou quando não há
 * legenda), e aparecia embaixo do player como se fosse algo que alguém
 * escreveu. `audio-1787495498124.ogg` não diz nada a ninguém.
 */
const ehNomeDeGravacao = (t: string) => /^audio-\d+\.(ogg|m4a|webm|mp4)$/i.test(t.trim());

/**
 * O recado interno.
 *
 * ⚠️ Ele NÃO pode parecer um balão. Balão é o que o cliente vê ou viu; recado é
 * o contrário disso, e a distinção não pode depender de ler o texto. Por isso
 * ele fica no meio, sem lado, com moldura tracejada âmbar e o olho cortado
 * dizendo "só o time vê" — a mesma lógica do contorno tracejado do aviso
 * automático, que existe para ninguém confundir sistema com gente.
 */
function Recado({ n, apagar }: { n: Nota; apagar: () => void }) {
  return (
    <div className="my-3 flex justify-center">
      <div className="group w-[92%] rounded-lg border border-dashed border-amber-500/40
                      bg-amber-500/5 px-3 py-2 sm:w-[80%]">
        <p className="flex items-center gap-1.5 text-[10px] font-medium text-amber-500/90">
          <StickyNote className="h-3 w-3" />
          recado interno
          <EyeOff className="h-3 w-3" />
          <span className="text-muted-foreground">só o time vê</span>
          <button type="button" onClick={apagar}
                  className="ml-auto opacity-0 transition-opacity group-hover:opacity-100
                             hover:text-red-500"
                  aria-label="Apagar recado">
            <Trash2 className="h-3 w-3" />
          </button>
        </p>
        <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed">
          {n.texto}
        </p>
        <p className="mt-1 text-[10px] leading-none text-muted-foreground/70">
          {n.autor_nome ?? "alguém do time"} · {hora(n.criado_em)}
        </p>
      </div>
    </div>
  );
}

/** mm:ss — e `--:--` enquanto a duração não veio, em vez de "NaN:NaN". */
function relogioDoAudio(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "--:--";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

/**
 * O reprodutor de áudio.
 *
 * ⚠️ O `<audio controls>` nativo não serve aqui, e não é questão de gosto: ele
 * tem largura mínima própria e o balão se ajusta ao conteúdo — num áudio sem
 * legenda o balão fica estreito, o controle nativo encolhe até virar aquele
 * retângulo com três pontinhos e a barra some. A pessoa via um player que não
 * dava para clicar.
 *
 * Este tem o tamanho que precisa ter: botão grande de tocar, barra que dá para
 * arrastar, e o tempo do lado — a gramática que quem usa WhatsApp já conhece.
 *
 * ⚠️ A duração pode chegar `Infinity` em arquivo gravado ao vivo (o cabeçalho
 * é escrito antes de o áudio terminar). Por isso ela é relida no
 * `durationchange` e no fim, e o relógio mostra `--:--` em vez de `NaN`
 * enquanto não sabe.
 */
function Reprodutor({ url }: { url: string }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [tocando, setTocando] = useState(false);
  const [agora, setAgora] = useState(0);
  const [total, setTotal] = useState(NaN);

  const duracao = (a: HTMLAudioElement) => {
    if (Number.isFinite(a.duration) && a.duration > 0) setTotal(a.duration);
  };

  return (
    <div className="mb-1.5 flex w-[15rem] items-center gap-2 rounded-md border
                    bg-background/40 px-2 py-1.5 sm:w-[17rem]">
      <button type="button" aria-label={tocando ? "Pausar" : "Tocar"}
              onClick={() => {
                const a = ref.current;
                if (!a) return;
                if (a.paused) { void a.play(); } else { a.pause(); }
              }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full
                         bg-carbo-green/20 text-carbo-green hover:bg-carbo-green/30">
        {tocando ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>

      <div className="min-w-0 flex-1">
        <input type="range" min={0} max={Number.isFinite(total) ? total : 0} step={0.05}
               value={agora}
               onChange={(e) => {
                 const a = ref.current;
                 if (a) { a.currentTime = Number(e.target.value); setAgora(a.currentTime); }
               }}
               className="h-1 w-full cursor-pointer accent-carbo-green"
               aria-label="Posição do áudio" />
        <p className="mt-0.5 text-[10px] leading-none text-muted-foreground">
          {relogioDoAudio(agora)} / {relogioDoAudio(total)}
        </p>
      </div>

      <audio ref={ref} src={url} preload="metadata"
             onPlay={() => setTocando(true)}
             onPause={() => setTocando(false)}
             onLoadedMetadata={(e) => duracao(e.currentTarget)}
             onDurationChange={(e) => duracao(e.currentTarget)}
             onTimeUpdate={(e) => setAgora(e.currentTarget.currentTime)}
             onEnded={(e) => {
               duracao(e.currentTarget);
               setTocando(false);
               // Volta ao início: parar no fim faz o próximo clique parecer
               // que não funcionou.
               e.currentTarget.currentTime = 0;
               setAgora(0);
             }} />
    </div>
  );
}

/**
 * O anexo — e agora ele ABRE.
 *
 * ⚠️ Carrega no clique, não sozinho. O arquivo está na Meta e sai de lá em duas
 * chamadas com o nosso token (a ponte é a `whatsapp-midia-baixar`); uma conversa
 * com quinze áudios abriria trinta chamadas ao Graph toda vez que a Realtime
 * reabrisse a lista — e ela reabre o tempo todo.
 *
 * ⚠️ E a falha aparece com a FRASE. O 404 aqui é quase sempre a retenção de ~30
 * dias da Meta, e "não foi possível baixar" faria alguém procurar bug onde não
 * há: o arquivo simplesmente não existe mais lá.
 */
function Anexo({ mediaId, tipo, nome, Icone }: {
  mediaId: string; tipo: string; nome: string | null;
  Icone: typeof Paperclip;
}) {
  const rotulo = NOME_MIDIA[tipo] ?? tipo;
  const imagem = tipo === "image" || tipo === "sticker";
  const som = tipo === "audio" || tipo === "voice" || tipo === "ptt";

  /**
   * ⚠️ IMAGEM carrega sozinha; áudio e documento esperam o clique.
   *
   * Não é inconsistência — é o que cada um É. Uma foto que exige clique para
   * aparecer não é uma foto: quem atende olha a conversa para VER o que o
   * cliente mandou (o rótulo do produto, o print do erro), e "toque para abrir"
   * esconde justamente o conteúdo. Áudio ninguém escuta de relance, e baixar
   * todos ao abrir a tela gastaria chamadas ao Graph por nada.
   *
   * O custo de carregar sozinha é pago uma vez: a busca é GET com cache de um
   * dia no navegador, então reabrir a conversa e dar F5 não rebaixam.
   */
  const [abrir, setAbrir] = useState(imagem);
  const { data, isFetching, error } = useMidia(mediaId, abrir);

  // Enquanto a foto vem, um retângulo do tamanho dela evita o pulo do layout
  // que joga a conversa para cima no meio da leitura.
  if (imagem && !data && isFetching) {
    return (
      <div className="mb-1.5 flex h-32 w-48 items-center justify-center rounded-md
                      border border-dashed bg-background/40">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (data) {
    if (imagem) {
      return (
        <a href={data.url} target="_blank" rel="noreferrer" className="mb-1.5 block">
          <img src={data.url} alt={rotulo}
               className="max-h-64 w-auto rounded-md border object-contain" />
        </a>
      );
    }
    if (som) return <Reprodutor url={data.url} />;
    return (
      <a href={data.url} download={nome || `${rotulo}`} target="_blank" rel="noreferrer"
         className="mb-1.5 flex items-center gap-2 rounded-md border bg-background/40 px-2 py-1.5
                    text-[11px] font-medium hover:bg-background/70">
        <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{nome || rotulo}</span>
      </a>
    );
  }

  return (
    <button type="button" onClick={() => setAbrir(true)} disabled={isFetching}
            className="mb-1.5 flex w-full items-center gap-2 rounded-md border border-dashed
                       bg-background/40 px-2 py-1.5 text-left hover:bg-background/70
                       disabled:opacity-60">
      <Icone className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="flex items-center gap-1 text-[11px] font-medium leading-tight">
          {rotulo}
          <Paperclip className="h-2.5 w-2.5 text-muted-foreground" />
        </p>
        <p className={`truncate text-[10px] leading-tight ${
          error ? "text-amber-500" : "text-muted-foreground"}`}>
          {isFetching ? "baixando…"
            : error ? (error as Error).message
            : som ? "toque para ouvir" : "toque para abrir"}
        </p>
      </div>
    </button>
  );
}

/** Separador de dia, grudado no topo enquanto se rola aquele dia: numa conversa
 *  longa, quem chega no meio precisa saber "de quando é isto?" sem subir. */
function SeparadorDeDia({ rotulo }: { rotulo: string }) {
  return (
    <div className="sticky top-0 z-10 flex justify-center py-1.5">
      <span className="rounded-full border bg-muted/80 px-2.5 py-0.5 text-[10px]
                       font-medium capitalize text-muted-foreground backdrop-blur">
        {rotulo}
      </span>
    </div>
  );
}

/**
 * Um balão da conversa.
 *
 * Três naturezas, e a tela precisa distingui-las:
 *   template  aviso automático da esteira — saiu por sistema, não por gente
 *   saida     o que o atendimento digitou
 *   entrada   o cliente
 *
 * ⚠️ Mídia NÃO é baixada — o webhook guarda só o `midia_id`, e o link da Meta
 * expira. Por isso o anexo é desenhado como anexo INDISPONÍVEL: a tela precisa
 * dizer que chegou um áudio E que ele não está aqui. Fingir que não chegou nada
 * é o único erro caro; parecer feio, não.
 */
function Balao({ m, primeira, ultima }: {
  m: MensagemConversa; primeira: boolean; ultima: boolean;
}) {
  const automatica = m.tipo === "template";
  const nossa = m.direcao === "saida";
  const anexo = !!m.midia_id;
  const desconhecida = !m.texto && !anexo && !automatica;
  const IconeAnexo = ICONE_MIDIA[m.tipo] ?? FileIcon;

  // ⚠️ O aviso mostra a MENSAGEM que o cliente recebeu, não o nome do template.
  // Ela é reconstruída no banco a partir do corpo aprovado + os parâmetros que
  // foram enviados — a mesma substituição que a Meta faz, não uma segunda
  // redação. Quem atende precisa conferir QUAL código de rastreio foi mandado;
  // saber apenas que "houve um aviso" faz perguntar ao cliente uma informação
  // que nós mesmos mandamos.
  //
  // O contorno tracejado e o rótulo continuam: a pessoa tem de distinguir o que
  // saiu por sistema do que alguém digitou.
  if (automatica) {
    return (
      <div className={`flex justify-end ${primeira ? "mt-3 first:mt-0" : "mt-0.5"}`}>
        <div className="max-w-[85%] rounded-lg border border-dashed bg-muted/30 px-3 py-2 sm:max-w-[70%]">
          <p className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
            <Megaphone className="h-3 w-3" /> aviso automático da esteira
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed">
            {m.texto}
          </p>
          {/* O botão não faz parte do corpo, mas faz parte do que o cliente
              recebeu — e é justamente o código que o atendimento vai conferir. */}
          {m.botao_rastreio && (
            <p className="mt-1.5 flex items-center gap-1 rounded-md border bg-background/40 px-2 py-1
                          text-[10px] text-muted-foreground">
              <ArrowUpRight className="h-3 w-3 shrink-0" />
              <span>botão <strong className="text-foreground">Acompanhar pedido</strong> →</span>
              <span className="truncate font-mono">{m.botao_rastreio}</span>
            </p>
          )}
          <p className="mt-1 text-right text-[10px] leading-none text-muted-foreground/70">
            {soHora(m.ocorrido_em)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${nossa ? "justify-end" : "justify-start"} ${
      /* Bloco novo respira; mensagem colada na anterior quase encosta — é isso
         que faz três mensagens seguidas lerem como uma fala só. */
      primeira ? "mt-3 first:mt-0" : "mt-0.5"}`}>
      <div className={`max-w-[85%] rounded-lg px-3 py-2 sm:max-w-[70%] ${
        nossa
          ? `bg-carbo-green/10 ${ultima ? "rounded-br-sm" : ""}`
          : `border bg-muted/40 ${ultima ? "rounded-bl-sm" : ""}`}`}>

        {anexo && (
          <Anexo mediaId={m.midia_id!} tipo={m.tipo}
                 nome={m.texto ?? null} Icone={IconeAnexo} />
        )}

        {m.texto && !ehNomeDeGravacao(m.texto) ? (
          <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">
            {m.texto}
          </p>
        ) : anexo ? (
          /* ⚠️ Nada aqui. Antes vinha "sem legenda" em itálico — informação que
             não é informação: áudio quase nunca tem legenda, e a linha aparecia
             em todo balão de voz repetindo o óbvio. O player já diz o que é. */
          null
        ) : (
          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-500">
            <HelpCircle className="mt-px h-3 w-3 shrink-0" />
            <span>
              Mensagem do tipo <strong>“{m.tipo}”</strong> — a tela ainda não sabe
              mostrar este formato. O conteúdo está gravado.
            </span>
          </p>
        )}

        {/* ⚠️ O fracasso do envio aparece SEMPRE, e não só na última do bloco.
            Aceitar não é entregar: a Meta devolve `wamid`, o balão nasce igual
            ao que deu certo, e o `failed` chega depois pelo webhook. Sem esta
            linha quem atendeu vai embora achando que respondeu. */}
        {nossa && m.status === "falhou" && (
          <p className="mt-1 flex items-start gap-1 text-[10px] leading-tight text-red-500">
            <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
            <span>
              não chegou ao cliente
              {m.erro_codigo ? ` (erro ${m.erro_codigo})` : ""}
              {m.erro_detalhe ? ` — ${m.erro_detalhe}` : ""}
            </span>
          </p>
        )}

        {/* O horário só na ÚLTIMA do bloco: repetido em cada balão ele vira
            carimbo e some da vista justamente quando importa. */}
        {ultima && (
          <p className={`mt-1 text-[10px] leading-none text-muted-foreground/70 ${
            nossa ? "text-right" : ""}`}>
            {soHora(m.ocorrido_em)}
            {/* Um tique para enviado, dois para entregue/lido — a mesma
                gramática do WhatsApp, para não haver um segundo idioma. */}
            {nossa && m.status === "enviado" && <Check className="ml-1 inline h-3 w-3" />}
            {nossa && (m.status === "entregue" || m.status === "lido") && (
              <CheckCheck className={`ml-1 inline h-3 w-3 ${
                m.status === "lido" ? "text-sky-400" : ""}`} />
            )}
          </p>
        )}
        {desconhecida && <span className="sr-only">{hora(m.ocorrido_em)}</span>}
      </div>
    </div>
  );
}

/** `datetime-local` fala em hora LOCAL sem fuso, e o banco em ISO com fuso.
 *  ⚠️ Converter na mão com `toISOString()` daria 3 h de diferença: o navegador
 *  está em Brasília e o ISO sai em UTC. `Date` interpreta a string sem fuso
 *  como local, então construir e serializar resolve — mas só se a string vier
 *  no formato exato do input. */
const paraIso = (local: string) => new Date(local).toISOString();

/** O contrário, para preencher o input com um horário calculado. */
function paraInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
       + `T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Gravação de áudio no navegador.
 *
 * ⚠️ O formato é uma aposta que o navegador faz por nós. A Meta aceita
 * `audio/ogg` SÓ com codec opus; o Firefox grava ogg/opus e o Chrome grava
 * `audio/webm;codecs=opus` — mesmo codec, contêiner que ela não aceita.
 *
 * Por isso a preferência é explícita: ogg primeiro, webm em seguida — o webm é
 * reempacotado como ogg no servidor (`webmParaOgg.ts`), mesmo codec, sem perda.
 *
 * ⚠️ O `audio/mp4` ficou por ÚLTIMO, e por medição: o mp4 do MediaRecorder é
 * fragmentado e a Meta o recusa com 131053 — "uploaded with mimetype as
 * audio/mp4, however on processing it is of type application/octet-stream".
 * Ele estava antes do webm nesta lista e era exatamente por isso que o áudio
 * saía da tela e nunca chegava ao cliente. E não há remux que o salve: ali o
 * codec é AAC, não Opus.
 */
const FORMATOS_AUDIO = [
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
];

function formatoDeAudio(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return FORMATOS_AUDIO.find((f) => MediaRecorder.isTypeSupported(f)) ?? null;
}

function Conversa({ c }: { c: Conversa }) {
  const responder = useResponder();
  const notas = useNotas(c.wa_id);
  const anotar = useAnotar();
  const apagarNota = useApagarNota();
  const [recado, setRecado] = useState("");
  const [aba, setAba] = useState<"responder" | "nota">("responder");
  const [previa, setPrevia] = useState<{ arquivo: File; url: string; som: boolean } | null>(null);
  const [legendaPrevia, setLegendaPrevia] = useState("");

  // O objectURL da prévia é revogado ao trocar ou sair: sem isso cada gravação
  // descartada deixa um blob preso na aba, que fica aberta o dia inteiro.
  useEffect(() => () => { if (previa) URL.revokeObjectURL(previa.url); }, [previa]);

  const descartarPrevia = () => { setPrevia(null); setLegendaPrevia(""); };

  const enviarPrevia = () => {
    if (!previa) return;
    mandarArquivo(previa.arquivo, previa.som ? undefined : legendaPrevia);
    setPrevia(null);
    setLegendaPrevia("");
  };

  const anotarAgora = () => {
    if (!recado.trim()) return;
    anotar.mutate({ wa_id: c.wa_id, texto: recado }, {
      onSuccess: () => { setRecado(""); setAba("responder"); toast.success("Anotado"); },
      onError: (e) => toast.error((e as Error).message),
    });
  };
  const resolver = useResolverConversa();
  const { data: agendadas } = useAgendadas(c.wa_id);
  const agendar = useAgendar();
  const cancelarAgendada = useCancelarAgendada();
  const enviarMidia = useEnviarMidia();
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [gravando, setGravando] = useState(false);
  const gravadorRef = useRef<MediaRecorder | null>(null);
  const pedacosRef = useRef<BlobPart[]>([]);
  const [verAgendar, setVerAgendar] = useState(false);
  const [quando, setQuando] = useState("");
  const [texto, setTexto] = useState("");
  const fim = useRef<HTMLDivElement>(null);
  const aberta = janelaAberta(c.janela_ate);

  /**
   * Ctrl+V com print na área de transferência.
   *
   * ⚠️ O ouvinte é do DOCUMENTO, não do campo de texto, e é de propósito: quem
   * acabou de recortar a tela clica na conversa e cola — não vai primeiro
   * posicionar o cursor dentro da caixa de resposta. Preso ao campo, o atalho
   * funcionaria só para quem já sabia que precisava focar nele.
   *
   * ⚠️ E ele só INTERCEPTA quando há imagem: colar texto continua colando
   * texto, no lugar onde o cursor está. Chamar `preventDefault()` sempre
   * roubaria o Ctrl+V da tela inteira — inclusive o de copiar um código de
   * rastreio para dentro da resposta.
   *
   * A imagem cai na MESMA prévia do anexo e da gravação: nada sai antes de
   * alguém olhar. Print errado é o mais fácil de mandar sem querer, porque a
   * área de transferência guarda o que foi recortado há dez minutos.
   */
  useEffect(() => {
    if (!aberta) return;                       // janela fechada: não há o que enviar
    const colar = (e: ClipboardEvent) => {
      const itens = Array.from(e.clipboardData?.items ?? []);
      const img = itens.find((i) => i.kind === "file" && i.type.startsWith("image/"));
      if (!img) return;                        // texto segue o caminho normal
      const arquivo = img.getAsFile();
      if (!arquivo) return;
      e.preventDefault();
      if (previa) { toast.error("Envie ou descarte o anexo atual antes de colar outro."); return; }

      // ⚠️ Nome próprio. O que vem da área de transferência costuma chegar como
      // "image.png", e três prints na mesma conversa ficariam indistinguíveis
      // para quem for procurar depois.
      const ext = (arquivo.type.split("/")[1] || "png").replace("jpeg", "jpg");
      const comNome = new File([arquivo], `print-${Date.now()}.${ext}`, { type: arquivo.type });
      setPrevia({ arquivo: comNome, url: URL.createObjectURL(comNome), som: false });
    };
    document.addEventListener("paste", colar);
    return () => document.removeEventListener("paste", colar);
  }, [aberta, previa]);
  const nivel = nivelDaJanela(c.janela_ate);
  const tom = TOM_JANELA[nivel];
  const fracao = fracaoDaJanela(c.janela_ate);

  /* ⚠️ Qual mensagem trouxe o pedido — precisamos DELA, não só do `bling_id`,
     porque é nela que mora o `vinculo_exato`. `false` = o pedido foi DEDUZIDO
     do último aviso enviado ao número, não lido do `context.id` da resposta.
     Aproximação que se passa por certeza é como alguém responde sobre o pedido
     errado — por isso a marca aparece, discreta, mas aparece. */
  const msgDoPedido = [...c.mensagens].reverse().find((m) => m.bling_id != null);
  const vinculoProvavel = c.bling_id != null && msgDoPedido?.vinculo_exato === false;

  /* O contador só existe perto do teto (4096 é o limite da Cloud API). Mostrar
     "3/4096" o tempo todo é ruído; mostrar nada até estourar é surpresa. */
  const perto = texto.length >= 3_500;

  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [c.mensagens.length]);

  const mandarArquivo = (arquivo: File, legenda?: string) => {
    enviarMidia.mutate({ wa_id: c.wa_id, arquivo, legenda: legenda?.trim() || undefined }, {
      onSuccess: () => { toast.success("Enviado"); },
      onError: (e) => toast.error((e as Error).message),
    });
  };

  const gravar = async () => {
    if (gravando) { gravadorRef.current?.stop(); return; }
    const formato = formatoDeAudio();
    if (!formato) { toast.error("Este navegador não grava áudio."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, { mimeType: formato });
      pedacosRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) pedacosRef.current.push(e.data); };
      rec.onstop = () => {
        // ⚠️ Solta o microfone. Sem isto o navegador continua mostrando a luz
        // de gravação e a aba fica com o áudio "em uso" para sempre.
        stream.getTracks().forEach((t) => t.stop());
        setGravando(false);
        const blob = new Blob(pedacosRef.current, { type: formato });
        if (!blob.size) return;
        const ext = formato.includes("ogg") ? "ogg" : formato.includes("mp4") ? "m4a" : "webm";

        // ⚠️ Parar NÃO envia. Antes o áudio saía no instante em que a pessoa
        // soltava o botão — e áudio é a única coisa que não dá para reler antes
        // de mandar: quem grava não sabe se ficou baixo, se cortou o começo ou
        // se o cachorro latiu no meio. Aqui ele fica em prévia até alguém
        // decidir. Descartar é o caminho barato; "desenviar" não existe.
        setPrevia({
          arquivo: new File([blob], `audio-${Date.now()}.${ext}`, { type: formato }),
          url: URL.createObjectURL(blob),
          som: true,
        });
      };
      rec.start();
      gravadorRef.current = rec;
      setGravando(true);
    } catch {
      // Permissão negada é o caso comum, e "erro ao gravar" não diria o que
      // fazer a respeito.
      toast.error("Não consegui acessar o microfone. Verifique a permissão do navegador.");
    }
  };

  const enviar = () => {
    const t = texto.trim();
    if (!t) return;
    responder.mutate({ wa_id: c.wa_id, texto: t }, {
      onSuccess: () => { setTexto(""); toast.success("Enviada"); },
      onError: (e) => toast.error((e as Error).message),
    });
  };

  return (
    <CarboCard className="flex h-full min-h-0 flex-col">
      <CarboCardContent className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-2.5">
          <div className="flex min-w-0 items-start gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full
                            border border-carbo-green/30 bg-carbo-green/10
                            text-[11px] font-semibold uppercase text-emerald-500">
              {inicialDe(c.cliente, c.wa_id)}
            </div>

            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold leading-tight">
                {c.cliente ?? c.wa_id}
              </h3>

              {/* ⚠️ O nome do WhatsApp em linha própria, e só quando difere do
                  cadastro. Alguém que conhece o cliente como "advmauro166" não
                  o encontra por "Mauro Silva" — e vice-versa. */}
              {c.nome_whatsapp && (
                <p className="truncate text-[10px] leading-tight text-muted-foreground/70">
                  no WhatsApp: {c.nome_whatsapp}
                </p>
              )}

              {/* O número é identificador, não título: monoespaçado e mais
                  apagado que o nome. Antes os dois tinham o mesmo peso. */}
              <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5
                              text-[10px] text-muted-foreground/80">
                <span className="font-mono tracking-tight">{c.wa_id}</span>
                {c.sobre_a_etapa && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{NOME_ETAPA[c.sobre_a_etapa] ?? c.sobre_a_etapa}</span>
                  </>
                )}
              </div>

              {c.bling_id != null && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {/* Quem atende quase sempre precisa ver o pedido antes de
                      responder. O chip leva direto para a esteira em vez de
                      obrigar a decorar o número e procurar lá. */}
                  <Link to="/ecommerce/esteira"
                        className="inline-flex items-center gap-1 rounded-md border bg-muted/40
                                   px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground
                                   transition-colors hover:bg-muted/70 hover:text-foreground">
                    <Package className="h-3 w-3" />
                    <span className="font-mono">#{c.bling_id}</span>
                    <ArrowUpRight className="h-3 w-3 opacity-60" />
                  </Link>

                  {vinculoProvavel && (
                    <span
                      title="Pedido deduzido do último aviso enviado a este número, não da resposta do cliente. Confirme antes de tratar como certo."
                      className="inline-flex items-center gap-1 rounded-md border border-amber-500/30
                                 bg-amber-500/5 px-1.5 py-0.5 text-[10px] text-amber-500">
                      <HelpCircle className="h-3 w-3" /> provável
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1.5">
          {/* ⚠️ Resolver é o botão mais usado desta tela: a maioria das
              respostas é "Ok recebido", e sem ele a única forma de tirar a
              conversa da fila seria mandar um "de nada" ao cliente. */}
          {c.estado === "precisa_resposta" ? (
            <Button size="sm" variant="outline"
                    className="h-8 gap-1.5 text-emerald-500"
                    disabled={resolver.isPending}
                    onClick={() => resolver.mutate({ wa_id: c.wa_id, resolver: true }, {
                      onSuccess: () => toast.success("Conversa marcada como resolvida"),
                      onError: (e) => toast.error((e as Error).message),
                    })}>
              {resolver.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <CheckCheck className="h-3.5 w-3.5" />}
              Marcar resolvida
            </Button>
          ) : c.estado === "resolvida" ? (
            <Button size="sm" variant="ghost"
                    className="h-8 gap-1.5 text-[11px] text-muted-foreground"
                    disabled={resolver.isPending}
                    onClick={() => resolver.mutate({ wa_id: c.wa_id, resolver: false }, {
                      onError: (e) => toast.error((e as Error).message),
                    })}>
              <Undo2 className="h-3.5 w-3.5" /> Reabrir
            </Button>
          ) : null}

          {/* O relógio: badge + barra. A barra é a informação que o texto não
              dava — "23h59" e "12 min" liam-se igual. */}
          <div className="w-[9.5rem]">
            {aberta ? (
              <>
                <CarboBadge variant="secondary"
                            className={`w-full justify-center gap-1 text-[11px] font-medium ${tom.texto}`}>
                  <Clock className="h-3 w-3" /> {faltaDaJanela(c.janela_ate)} de janela
                </CarboBadge>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted/40">
                  <div className={`h-full rounded-full transition-all ${tom.barra}`}
                       style={{ width: `${Math.round(fracao * 100)}%` }} />
                </div>
                {nivel === "urgente" && (
                  <p className="mt-1 text-center text-[10px] text-red-500">
                    fecha em menos de 1 h
                  </p>
                )}
              </>
            ) : (
              <CarboBadge variant="secondary"
                          className="w-full justify-center gap-1 text-[11px] text-muted-foreground">
                <Lock className="h-3 w-3" /> janela fechada
              </CarboBadge>
            )}
          </div>
          </div>
        </div>

        {/* ⚠️ SUGESTÃO, e ela diz que é sugestão. A última mensagem parece só um
            agradecimento — mas quem decide é quem lê. Esconder sozinho seria
            arriscar sumir com uma pergunta de verdade; não dizer nada deixaria a
            pessoa abrir vinte conversas para ler vinte "ok". */}
        {c.parece_encerrada && (
          <div className="-mt-1 flex flex-wrap items-center gap-2 rounded-md border
                          border-emerald-500/20 bg-carbo-green/5 px-2.5 py-1.5">
            <Sparkles className="h-3 w-3 shrink-0 text-emerald-500" />
            <span className="text-[11px] text-muted-foreground">
              A última mensagem parece só um agradecimento — provavelmente não
              precisa de resposta.
            </span>
            <Button size="sm" variant="ghost"
                    className="ml-auto h-6 gap-1 px-2 text-[11px] text-emerald-500"
                    disabled={resolver.isPending}
                    onClick={() => resolver.mutate({ wa_id: c.wa_id, resolver: true }, {
                      onError: (e) => toast.error((e as Error).message),
                    })}>
              <CheckCheck className="h-3 w-3" /> Resolver
            </Button>
          </div>
        )}

        {/* ⚠️ A reabertura é DITA, não silenciosa.
            Quem marcou "resolvido" e vê a conversa de volta na fila sente que o
            sistema desfez o trabalho dele — é a queixa clássica dessas
            ferramentas. O comportamento está certo; o que faltava era o motivo
            aparecer. */}
        {c.reaberta && (
          <p className="flex items-center gap-1.5 rounded-md border border-amber-500/30
                        bg-amber-500/5 px-2 py-1.5 text-[11px] text-amber-500">
            <Undo2 className="h-3 w-3 shrink-0" />
            Reaberta — o cliente escreveu de novo
            {c.ultima_entrada_em ? ` às ${soHora(c.ultima_entrada_em)}` : ""}.
          </p>
        )}

        {/* `space-y` saiu: o espaçamento agora é do BLOCO (no próprio balão),
            porque mensagem colada e mensagem nova precisam de distâncias
            diferentes — um `space-y` único achatava as duas no mesmo valor. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-0.5 pb-1 pr-1">
          {montarLinhaDoTempo(c.mensagens, notas.data ?? []).map((l) =>
            l.kind === "dia"
              ? <SeparadorDeDia key={l.chave} rotulo={l.rotulo} />
              : l.kind === "nota"
                ? <Recado key={l.n.id} n={l.n}
                          apagar={() => apagarNota.mutate({ id: l.n.id, wa_id: c.wa_id })} />
                : <Balao key={l.m.wamid} m={l.m} primeira={l.primeira} ultima={l.ultima} />,
          )}
          <div ref={fim} />
        </div>

        {/* ⚠️ Os agendamentos ficam VISÍVEIS o tempo todo, inclusive os que
            falharam. Quem agendou foi embora achando que estava resolvido — a
            falha não aparece na cara de ninguém como num envio manual. Se não
            estiver aqui, não está em lugar nenhum. */}
        {!!agendadas?.length && (
          <div className="space-y-1">
            {agendadas.map((a) => (
              <div key={a.id}
                   className={`flex flex-wrap items-center gap-2 rounded-md border px-2.5 py-1.5 ${
                     a.status === "falhou"
                       ? "border-red-500/30 bg-red-500/5"
                       : "border-sky-500/25 bg-sky-500/5"}`}>
                {a.status === "falhou"
                  ? <AlertTriangle className="h-3 w-3 shrink-0 text-red-500" />
                  : <CalendarClock className="h-3 w-3 shrink-0 text-sky-500" />}
                <span className={`text-[11px] font-medium ${
                  a.status === "falhou" ? "text-red-500" : "text-sky-500"}`}>
                  {a.status === "falhou"
                    ? "Não foi enviada"
                    : `Agendada para ${hora(a.enviar_em)}`}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                  “{a.texto}”
                </span>
                {a.status === "falhou" && a.motivo && (
                  <span className="w-full text-[10px] text-muted-foreground">{a.motivo}</span>
                )}
                {a.status === "pendente" && (
                  <Button size="sm" variant="ghost"
                          className="h-6 gap-1 px-2 text-[11px] text-muted-foreground"
                          disabled={cancelarAgendada.isPending}
                          onClick={() => cancelarAgendada.mutate({ id: a.id, wa_id: c.wa_id }, {
                            onError: (e) => toast.error((e as Error).message),
                          })}>
                    <Trash2 className="h-3 w-3" /> Cancelar
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {previa && (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border
                          border-carbo-green/40 bg-carbo-green/5 p-2">
            <p className="w-full text-[10px] font-medium text-muted-foreground">
              {previa.som
                ? "Ouça antes de mandar — ainda não foi enviado."
                : "Confira antes de mandar — ainda não foi enviado."}
            </p>
            {previa.som ? (
              <Reprodutor url={previa.url} />
            ) : previa.arquivo.type.startsWith("image/") ? (
              <img src={previa.url} alt="prévia"
                   className="max-h-32 w-auto rounded-md border object-contain" />
            ) : (
              <p className="flex items-center gap-2 rounded-md border bg-background/40
                            px-2 py-1.5 text-[11px] font-medium">
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="max-w-[14rem] truncate">{previa.arquivo.name}</span>
              </p>
            )}
            {/* ⚠️ A legenda vive AQUI, não no campo de resposta: ela pertence à
                foto ("é este o rótulo?"), e sai junto, num balão só. Antes o
                texto que estivesse escrito na resposta ia como legenda sem
                ninguém pedir — e uma frase começada para outra coisa saía
                grudada num arquivo.
                Áudio não tem: a Meta IGNORA legenda em áudio, em silêncio, e
                oferecer um campo que some faria quem atende achar que disse
                algo que o cliente nunca leu. */}
            {!previa.som && (
              <Input value={legendaPrevia} onChange={(e) => setLegendaPrevia(e.target.value)}
                     placeholder="Legenda (opcional)" maxLength={1024}
                     className="h-8 w-full text-xs sm:w-64"
                     onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); enviarPrevia(); } }} />
            )}
            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" variant="ghost" className="h-8 gap-1.5"
                      disabled={enviarMidia.isPending} onClick={descartarPrevia}>
                <Trash2 className="h-3.5 w-3.5" /> Descartar
              </Button>
              <Button size="sm" className="h-8 gap-1.5"
                      disabled={enviarMidia.isPending} onClick={enviarPrevia}>
                {enviarMidia.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Send className="h-3.5 w-3.5" />}
                {previa.som ? "Enviar áudio" : "Enviar arquivo"}
              </Button>
            </div>
          </div>
        )}

        {/* ⚠️ ABA, não botão solto no meio da conversa.
            O recado interno é um MODO de escrever, não uma ação avulsa — é o
            mesmo campo, com outro destino. Como botão flutuante ele não dizia
            o que ia acontecer ao ser clicado, e ficava boiando entre a
            conversa e o campo de resposta sem pertencer a nenhum dos dois.
            Em aba, a pergunta "isso vai para o cliente?" é respondida ANTES de
            escrever, que é quando importa. */}
        <div className="mb-1.5 flex items-center gap-1">
          {([
            { id: "responder", rotulo: "Responder" },
            { id: "nota", rotulo: "Recado interno" },
          ] as const).map((t) => (
            <button key={t.id} type="button" onClick={() => setAba(t.id)}
                    className={`flex items-center gap-1.5 rounded-t-md border-b-2 px-2.5 py-1
                                text-[11px] font-medium transition-colors ${
                      aba === t.id
                        ? t.id === "nota"
                          ? "border-amber-500 text-amber-500"
                          : "border-carbo-green text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t.id === "nota" && <EyeOff className="h-3 w-3" />}
              {t.rotulo}
            </button>
          ))}
        </div>

        {aba === "nota" ? (
          /* ⚠️ O recado NÃO depende da janela de 24 h: ele não passa pela Meta.
             E é justamente na conversa fechada que anotar mais importa — é o
             que sobra para registrar o combinado quando não dá para responder. */
          <div className="rounded-lg border border-dashed border-amber-500/40
                          bg-amber-500/5 p-2">
            <Textarea
              value={recado} onChange={(e) => setRecado(e.target.value)}
              placeholder="Recado para o time — o cliente não vê." rows={3} maxLength={2000}
              className="resize-y border-0 bg-transparent px-1 py-0.5 text-xs shadow-none
                         focus-visible:ring-0 focus-visible:ring-offset-0"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); anotarAgora(); }
              }}
            />
            <div className="mt-1.5 flex items-center justify-between gap-2 border-t
                            border-amber-500/20 pt-1.5">
              <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <EyeOff className="h-3 w-3 shrink-0" />
                só o time vê — não vai para o WhatsApp
              </p>
              <Button size="sm" className="h-8 gap-1.5"
                      disabled={!recado.trim() || anotar.isPending}
                      onClick={anotarAgora}>
                {anotar.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <StickyNote className="h-3.5 w-3.5" />}
                Anotar
              </Button>
            </div>
          </div>
        ) : aberta ? (
          <div className={`rounded-lg border bg-muted/40 p-2 transition-colors ${
                            responder.isPending ? "opacity-70" : ""}`}>
            <Textarea
              value={texto} onChange={(e) => setTexto(e.target.value)}
              placeholder="Responder…" rows={3} maxLength={4096}
              className="resize-y border-0 bg-transparent px-1 py-0.5 text-xs shadow-none
                         focus-visible:ring-0 focus-visible:ring-offset-0"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); enviar(); }
              }}
            />
            <div className="mt-1.5 flex items-center justify-between gap-2 border-t pt-1.5">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                {/* O atalho vira tecla: numa linha de texto apagada ninguém lia. */}
                <kbd className="rounded border bg-background px-1 py-px font-sans text-[10px]">⌘/Ctrl</kbd>
                <span aria-hidden="true">+</span>
                <kbd className="rounded border bg-background px-1 py-px font-sans text-[10px]">
                  <CornerDownLeft className="inline h-2.5 w-2.5" />
                </kbd>
                <span>envia</span>
                <span className="mx-1 text-muted-foreground/40">·</span>
                <kbd className="rounded border bg-background px-1 py-px font-sans text-[10px]">⌘/Ctrl</kbd>
                <span aria-hidden="true">+</span>
                <kbd className="rounded border bg-background px-1 py-px font-sans text-[10px]">V</kbd>
                <span>cola print</span>
              </div>
              <div className="flex items-center gap-2">
                {perto && (
                  <span className={`text-[10px] tabular-nums ${
                    texto.length >= 4096 ? "text-red-500" : "text-amber-500"}`}>
                    {texto.length}/4096
                  </span>
                )}
                {/* Anexo e microfone: a janela está aberta, então o WhatsApp
                    inteiro está disponível — limitar a atendimento a texto é
                    desperdiçar o canal. */}
                <input ref={arquivoRef} type="file" className="hidden"
                       accept="image/jpeg,image/png,application/pdf,text/plain"
                       onChange={(e) => {
                         const f = e.target.files?.[0];
                         e.target.value = "";
                         // ⚠️ Também passa pela prévia. Escolher arquivo erra
                         // igual a gravar: é um clique numa lista de nomes
                         // parecidos, e o print errado sai antes de a pessoa
                         // ver o que mandou. Só o `image (1).png` na conversa
                         // já contou essa história.
                         if (f) setPrevia({ arquivo: f, url: URL.createObjectURL(f), som: false });
                       }} />
                <Button size="sm" variant="outline" className="h-8 w-8 p-0"
                        title="Enviar foto ou documento"
                        disabled={enviarMidia.isPending || gravando || !!previa}
                        onClick={() => arquivoRef.current?.click()}>
                  {enviarMidia.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Paperclip className="h-3.5 w-3.5" />}
                </Button>
                <Button size="sm" variant="outline"
                        className={`h-8 gap-1.5 ${gravando ? "border-red-500/50 text-red-500" : "w-8 p-0"}`}
                        // ⚠️ "Parar", não "Parar e enviar": parar leva à prévia.
                        title={gravando ? "Parar" : "Gravar áudio"}
                        disabled={enviarMidia.isPending || !!previa}
                        onClick={gravar}>
                  {gravando
                    ? <><Square className="h-3.5 w-3.5 fill-current" /> Parar</>
                    : <Mic className="h-3.5 w-3.5" />}
                </Button>

                {/* ⚠️ Agendar só existe com texto escrito: um agendamento
                    vazio não é nada, e o botão aceso sem conteúdo convida ao
                    clique que não faz nada. */}
                <Button size="sm" variant="outline" className="h-8 gap-1.5"
                        disabled={!texto.trim() || agendar.isPending}
                        onClick={() => {
                          // Sugestão de horário: uma hora à frente, ou o fim da
                          // janela quando falta menos que isso.
                          const daquiUmaHora = Date.now() + 3_600_000;
                          const limite = c.janela_ate ? new Date(c.janela_ate).getTime() : 0;
                          setQuando(paraInput(new Date(Math.min(daquiUmaHora, limite - 60_000))));
                          setVerAgendar((v) => !v);
                        }}>
                  <CalendarClock className="h-3.5 w-3.5" /> Agendar
                </Button>
                <Button size="sm" className="h-8 gap-1.5"
                        disabled={!texto.trim() || responder.isPending} onClick={enviar}>
                  {responder.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Send className="h-3.5 w-3.5" />}
                  Enviar
                </Button>
              </div>
            </div>

            {verAgendar && (
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2">
                <span className="text-[11px] text-muted-foreground">enviar em</span>
                <Input type="datetime-local" value={quando}
                       onChange={(e) => setQuando(e.target.value)}
                       /* ⚠️ O `max` é o fim da janela, não uma data qualquer.
                          Depois dela a Meta recusa com 131047, e um agendamento
                          que nasce condenado é pior que nenhum: quem marcou vai
                          embora achando que está resolvido. */
                       min={paraInput(new Date(Date.now() + 60_000))}
                       max={c.janela_ate ? paraInput(new Date(new Date(c.janela_ate).getTime() - 60_000)) : undefined}
                       className="h-8 w-[13rem] text-xs" />
                <Button size="sm" className="h-8 gap-1.5"
                        disabled={!quando || agendar.isPending}
                        onClick={() => {
                          const iso = paraIso(quando);
                          if (c.janela_ate && new Date(iso) >= new Date(c.janela_ate)) {
                            toast.error("Esse horário já está fora da janela de 24 h.");
                            return;
                          }
                          agendar.mutate({ wa_id: c.wa_id, texto: texto.trim(), enviar_em: iso }, {
                            onSuccess: () => {
                              setTexto(""); setVerAgendar(false);
                              toast.success(`Agendada para ${hora(iso)}`);
                            },
                            onError: (e) => toast.error((e as Error).message),
                          });
                        }}>
                  {agendar.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <CalendarClock className="h-3.5 w-3.5" />}
                  Confirmar
                </Button>
                <span className="text-[10px] text-muted-foreground">
                  no máximo até {c.janela_ate ? hora(c.janela_ate) : "—"}, quando a janela fecha
                </span>
              </div>
            )}
          </div>
        ) : (
          /* ⚠️ Sem campo de texto quando a janela fechou. Deixá-lo ali, para
             falhar no clique, é pior do que não ter: a pessoa escreve a
             resposta inteira antes de descobrir que não vai. */
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <div className="flex items-start gap-2">
              <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center
                               rounded-full bg-amber-500/10">
                <AlertTriangle className="h-3 w-3 text-amber-500" />
              </span>
              <div className="min-w-0 space-y-1">
                <p className="text-[11px] font-medium text-amber-500">
                  Janela de 24 h fechada — não dá para responder por aqui
                </p>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Passaram-se mais de 24 h desde a última mensagem do cliente. A Meta
                  só aceita <strong className="font-medium text-foreground">template aprovado</strong> agora,
                  e nenhum dos seis da esteira serve para responder dúvida.
                </p>
                <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground/80">
                  <Lock className="h-3 w-3 shrink-0" />
                  A janela reabre sozinha quando o cliente escrever de novo. Até lá,
                  use outro canal.
                </p>
              </div>
            </div>
          </div>
        )}
      </CarboCardContent>
    </CarboCard>
  );
}

/**
 * Quem recebe o aviso de mensagem nova.
 *
 * ⚠️ A lista NASCE VAZIA e ninguém é avisado até alguém marcar. É a mesma
 * escolha do `meta_status` e do `CRON_SECRET`: a ausência fecha. O contrário —
 * avisar todo mundo por padrão — foi o que estava no ar por algumas horas hoje,
 * e vira ruído no dia em que os clientes começarem a responder de verdade.
 * Aviso ruidoso treina a equipe a ignorar o sininho, que é o oposto do que ele
 * existe para fazer.
 */
function QuemRecebe({ aoFechar }: { aoFechar: () => void }) {
  const { data: pessoas, isLoading, error } = useNotificaveis();
  const marcar = useMarcarNotificado();
  const [busca, setBusca] = useState("");

  const lista = pessoas ?? [];
  const ligados = lista.filter((p) => p.recebe).length;
  const filtradas = useMemo(() => {
    const alvo = normalizar(busca.trim());
    if (!alvo) return lista;
    return lista.filter((p) => normalizar(p.full_name ?? "").includes(alvo));
  }, [lista, busca]);

  return (
    <CarboCard className="mb-3">
      <CarboCardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <BellRing className="h-4 w-4" /> Quem recebe o aviso
            </h3>
            <p className="mt-0.5 max-w-xl text-[11px] text-muted-foreground">
              Toast e sininho quando um cliente responde, em qualquer app.
              {ligados === 0
                ? " Ninguém está marcado — hoje o aviso não sai para pessoa nenhuma."
                : ` ${ligados} ${ligados === 1 ? "pessoa marcada" : "pessoas marcadas"}.`}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground/70">
              Só aparece quem tem acesso interno. Lojista e licenciado não podem ser
              marcados.
            </p>
          </div>
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={aoFechar}>
            <X className="h-3.5 w-3.5" /> Fechar
          </Button>
        </div>

        {error && (
          <p className="mt-3 flex items-start gap-1.5 text-xs text-red-500">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
            Não consegui carregar: {(error as Error).message}
          </p>
        )}

        {!error && (
          <>
            <div className="relative mt-3 max-w-xs">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)}
                     placeholder="Buscar pessoa…" className="h-8 pl-7 text-xs" />
            </div>

            {isLoading ? (
              <p className="mt-3 text-xs text-muted-foreground">Carregando…</p>
            ) : (
              <div className="mt-3 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {filtradas.map((p) => (
                  <button
                    key={p.user_id} type="button"
                    disabled={marcar.isPending}
                    onClick={() => marcar.mutate(
                      { user_id: p.user_id, recebe: !p.recebe },
                      { onError: (e) => toast.error((e as Error).message) },
                    )}
                    className={`flex items-center gap-2 rounded-md border p-2 text-left transition-colors disabled:opacity-60 ${
                      p.recebe ? "border-carbo-green/50 bg-carbo-green/5"
                               : "border-transparent hover:border-border hover:bg-muted/40"}`}>
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                      p.recebe ? "border-carbo-green/50 bg-carbo-green/20 text-emerald-500"
                               : "border-border"}`}>
                      {p.recebe && <Check className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">
                        {p.full_name ?? "sem nome"}
                      </span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {p.recebe ? "recebe o aviso" : "não recebe"}
                      </span>
                    </span>
                  </button>
                ))}
                {filtradas.length === 0 && (
                  <p className="text-xs text-muted-foreground">Ninguém com esse nome.</p>
                )}
              </div>
            )}
          </>
        )}
      </CarboCardContent>
    </CarboCard>
  );
}

/**
 * O painel do contato — o que o time sabe sobre esta conversa.
 *
 * ⚠️ A ordem não é estética: identidade → ações → etiquetas → pedido. Quem abre
 * o painel está fazendo uma destas três coisas, nesta frequência: conferir com
 * quem está falando, mudar o estado do atendimento, ou achar o pedido. Campo de
 * cadastro bonito no topo empurraria as ações para baixo da dobra.
 *
 * ⚠️ E o telefone fica GRANDE e selecionável. Ele é o que se copia para procurar
 * no Bling, e um número em cinza de 10px vira erro de digitação.
 */
function PainelContato({ c, meuId }: { c: Conversa; meuId: string | null }) {
  const definirStatus = useDefinirStatus();
  const definirResponsavel = useDefinirResponsavel();
  const marcarTag = useMarcarTag();
  const criarTag = useCriarTag();
  const { data: atendentes } = useAtendentes();
  const { data: tags } = useTags();
  const [novaTag, setNovaTag] = useState("");
  const [verTags, setVerTags] = useState(false);

  const minhas = new Set(c.tags.map((t) => t.id));
  const souEu = !!meuId && c.responsavel === meuId;

  return (
    <CarboCard className="hidden min-h-0 xl:flex xl:flex-col">
      <CarboCardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">

        {/* ── Identidade ───────────────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-1.5 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full
                           border border-carbo-green/30 bg-carbo-green/5 text-lg
                           font-semibold text-carbo-green">
            {inicialDe(c.cliente, c.wa_id)}
          </span>
          <p className="text-sm font-semibold leading-tight">{c.cliente ?? "Sem nome"}</p>
          {c.nome_whatsapp && (
            <p className="text-[11px] leading-tight text-muted-foreground">
              no WhatsApp: {c.nome_whatsapp}
            </p>
          )}
          {/* `select-all` para o clique triplo pegar o número inteiro. */}
          <p className="select-all font-mono text-[13px] tabular-nums text-foreground">
            {c.wa_id}
          </p>
        </div>

        {/* ── Ações ────────────────────────────────────────────────────── */}
        <div className="space-y-2 border-t pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Atendimento
          </p>

          {/* ⚠️ Só DOIS botões, e são os dois status que uma pessoa decide.
              "Aberto" e "Em atendimento" não têm botão de propósito: eles saem
              de quem falou por último, e um botão para eles seria um jeito de
              mentir para a própria fila. */}
          <div className="flex gap-1.5">
            <Button size="sm" variant={c.status === "aguardando" ? "default" : "outline"}
                    className="h-8 flex-1 gap-1.5 text-[11px]"
                    disabled={definirStatus.isPending}
                    onClick={() => definirStatus.mutate(
                      { wa_id: c.wa_id, status: c.status === "aguardando" ? "aberto" : "aguardando" },
                      { onError: (e) => toast.error((e as Error).message) })}>
              <Clock className="h-3.5 w-3.5" />
              {c.status === "aguardando" ? "Retomar" : "Aguardando"}
            </Button>
            <Button size="sm" variant={c.status === "resolvido" ? "default" : "outline"}
                    className="h-8 flex-1 gap-1.5 text-[11px]"
                    disabled={definirStatus.isPending}
                    onClick={() => definirStatus.mutate(
                      { wa_id: c.wa_id, status: c.status === "resolvido" ? "aberto" : "resolvido" },
                      { onError: (e) => toast.error((e as Error).message) })}>
              {c.status === "resolvido"
                ? <><Undo2 className="h-3.5 w-3.5" /> Reabrir</>
                : <><CheckCheck className="h-3.5 w-3.5" /> Resolver</>}
            </Button>
          </div>

          {/* ── Responsável ───────────────────────────────────────────── */}
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground">Responsável</p>
            <select
              value={c.responsavel ?? ""}
              onChange={(e) => {
                const id = e.target.value || null;
                const nome = (atendentes ?? []).find((a) => a.user_id === id)?.full_name ?? null;
                definirResponsavel.mutate({ wa_id: c.wa_id, user_id: id, nome },
                  { onError: (err) => toast.error((err as Error).message) });
              }}
              className="h-8 w-full rounded-md border bg-background px-2 text-xs">
              <option value="">— sem responsável —</option>
              {(atendentes ?? []).map((a) => (
                <option key={a.user_id} value={a.user_id}>{a.full_name ?? a.user_id}</option>
              ))}
            </select>
            {/* ⚠️ Atalho para assumir. Em time pequeno, puxar da fila é o
                modelo certo — rodízio automático atribui conversa para quem
                está almoçando, e ninguém mais mexe porque "já tem dono". */}
            {!souEu && (
              <Button size="sm" variant="ghost" className="h-7 w-full gap-1.5 text-[11px]"
                      disabled={definirStatus.isPending}
                      onClick={() => definirStatus.mutate(
                        { wa_id: c.wa_id, status: "em_atendimento", assumir: true },
                        { onError: (e) => toast.error((e as Error).message) })}>
                <UserCheck className="h-3.5 w-3.5" /> Assumir esta conversa
              </Button>
            )}
          </div>
        </div>

        {/* ── Etiquetas ────────────────────────────────────────────────── */}
        <div className="space-y-2 border-t pt-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase
                        tracking-wide text-muted-foreground">
            <TagIcon className="h-3 w-3" /> Etiquetas
          </p>

          <div className="flex flex-wrap gap-1.5">
            {c.tags.map((t) => (
              <button key={t.id} type="button"
                      title="Tirar esta etiqueta"
                      onClick={() => marcarTag.mutate({ wa_id: c.wa_id, tag_id: t.id, marcar: false })}
                      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5
                                  text-[11px] ${COR_TAG[t.cor] ?? COR_TAG.cinza}`}>
                {t.nome} <X className="h-2.5 w-2.5" />
              </button>
            ))}
            <button type="button" onClick={() => setVerTags((v) => !v)}
                    className="inline-flex items-center gap-1 rounded-md border border-dashed
                               px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground">
              <Plus className="h-2.5 w-2.5" /> etiqueta
            </button>
          </div>

          {verTags && (
            <div className="space-y-1.5 rounded-md border bg-muted/30 p-2">
              {(tags ?? []).filter((t) => !minhas.has(t.id)).map((t) => (
                <button key={t.id} type="button"
                        onClick={() => marcarTag.mutate({ wa_id: c.wa_id, tag_id: t.id, marcar: true })}
                        className="flex w-full items-center gap-1.5 rounded px-1 py-0.5
                                   text-left text-[11px] hover:bg-muted/60">
                  <span className={`h-2 w-2 rounded-full border ${COR_TAG[t.cor] ?? COR_TAG.cinza}`} />
                  {t.nome}
                </button>
              ))}
              <div className="flex gap-1 pt-1">
                <Input value={novaTag} onChange={(e) => setNovaTag(e.target.value)}
                       placeholder="Nova etiqueta" className="h-7 text-[11px]"
                       onKeyDown={(e) => {
                         if (e.key !== "Enter" || !novaTag.trim()) return;
                         e.preventDefault();
                         criarTag.mutate({ nome: novaTag, cor: "cinza" }, {
                           onSuccess: (t) => {
                             setNovaTag("");
                             marcarTag.mutate({ wa_id: c.wa_id, tag_id: t.id, marcar: true });
                           },
                           onError: (err) => toast.error((err as Error).message),
                         });
                       }} />
              </div>
            </div>
          )}
        </div>

        {/* ── O pedido ─────────────────────────────────────────────────── */}
        {c.bling_id && (
          <div className="space-y-1.5 border-t pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Pedido
            </p>
            <Link to={`/ecommerce/esteira?pedido=${c.bling_id}`}
                  className="flex items-center gap-1.5 text-[11px] text-carbo-green hover:underline">
              <Package className="h-3.5 w-3.5" /> #{c.bling_id}
              <ArrowUpRight className="h-3 w-3" />
            </Link>
            {c.sobre_a_etapa && (
              <p className="text-[11px] text-muted-foreground">
                {NOME_ETAPA[c.sobre_a_etapa] ?? c.sobre_a_etapa}
              </p>
            )}
          </div>
        )}
      </CarboCardContent>
    </CarboCard>
  );
}

export default function Conversas() {
  // Quem sou eu — é o que faz a aba "Minhas" significar alguma coisa.
  const { user } = useAuth();
  const meuId = user?.id ?? null;
  const [params, setParams] = useSearchParams();
  const voltar = params.get("voltar") || "/ecommerce/mensagens";

  /**
   * ⚠️ A conversa aberta mora na URL, não no estado do componente.
   *
   * Com estado, todo F5 devolvia a pessoa para a primeira conversa da lista —
   * e num atendimento se dá F5 o tempo todo (para conferir se chegou resposta,
   * porque a aba ficou horas aberta, porque alguém mandou o link). Perder o
   * lugar a cada recarga é perder o fio da conversa que se estava lendo.
   *
   * E vira endereço: dá para mandar `?de=5584...` para outra pessoa do time e
   * ela abre exatamente a mesma conversa.
   *
   * `replace` e não `push`: cada clique na lista não pode virar um passo no
   * histórico, senão o botão Voltar do navegador percorre vinte conversas
   * antes de sair da tela.
   */
  const aberta = params.get("de");
  const abrir = (wa_id: string) => {
    const p = new URLSearchParams(params);
    p.set("de", wa_id);
    setParams(p, { replace: true });
  };

  // ⚠️ Antes de qualquer coisa que leia a hora: é o que faz o relógio da janela
  // andar sem F5 e sem depender da rede.
  useRelogio();
  // E a mensagem nova chega sozinha, sem esperar o intervalo de 30 s.
  useConversasAoVivo();

  const { data: conversas, isLoading, error } = useConversas();

  const lista = conversas ?? [];
  const atual = useMemo(
    () => lista.find((c) => c.wa_id === aberta) ?? lista[0] ?? null,
    [lista, aberta],
  );

  /* ⚠️ Busca e filtro são LOCAIS e só escondem linhas. A ordenação vem pronta
     do hook (quem espera resposta primeiro) e não é tocada aqui: reordenar na
     tela criaria uma segunda regra de prioridade competindo com a do
     `agruparConversas`. E `atual` sai da lista COMPLETA — filtrar não pode
     fechar a conversa que já está aberta na direita. */
  const [busca, setBusca] = useState("");
  /* ⚠️ Abre em "Pendentes", não em "Todas". Com 22 conversas e 2 pendências,
     "Todas" faz a pessoa procurar o trabalho no meio do histórico — e a caixa
     de entrada existe para mostrar o trabalho. O contador ao lado de cada
     filtro diz o que há nos outros, então nada fica escondido. */
  const [filtro, setFiltro] = useState<FiltroConversa>("pendentes");
  const [verQuemRecebe, setVerQuemRecebe] = useState(false);
  const { data: notificaveis } = useNotificaveis();
  const quantosRecebem = (notificaveis ?? []).filter((p) => p.recebe).length;

  const contagens = useMemo(() => ({
    todas: lista.length,
    pendentes: lista.filter((c) => c.status === "aberto").length,
    minhas: lista.filter((c) => c.responsavel && c.responsavel === meuId).length,
    sem_dono: lista.filter((c) => !c.responsavel && c.status !== "resolvido").length,
    aberta: lista.filter((c) => janelaAberta(c.janela_ate)).length,
  }), [lista, meuId]);

  const filtradas = useMemo(() => {
    const termo = busca.trim();
    const alvoTexto = normalizar(termo);
    const alvoNumero = soDigitos(termo);
    return lista.filter((c) => {
      if (filtro === "pendentes" && c.status !== "aberto") return false;
      if (filtro === "minhas" && c.responsavel !== meuId) return false;
      // ⚠️ Resolvida sem dono não é trabalho parado: ela sairia como "ninguém
      // pegou" e encheria a aba de conversa encerrada.
      if (filtro === "sem_dono" && (c.responsavel || c.status === "resolvido")) return false;
      if (filtro === "aberta" && !janelaAberta(c.janela_ate)) return false;
      if (!termo) return true;
      // ⚠️ Os DOIS nomes: quem procura pelo que viu no WhatsApp tem de achar,
      // e quem procura pelo do cadastro também.
      const nomes = normalizar(`${c.cliente ?? ""} ${c.nome_whatsapp ?? ""}`);
      if (alvoTexto && nomes.includes(alvoTexto)) return true;
      // Número só casa com número: sem isso, um termo com letras viraria string
      // vazia de dígitos e casaria com TODO mundo.
      if (alvoNumero && soDigitos(c.wa_id).includes(alvoNumero)) return true;
      return false;
    });
  }, [lista, busca, filtro, meuId]);

  /* O cabeçalho é o placar da caixa INTEIRA, não da lista filtrada: um filtro na
     coluna não pode fazer o número de urgências parecer menor. */
  const esperando = lista.filter((c) => c.estado === "precisa_resposta").length;
  const urgentes = lista.filter(
    (c) => c.estado === "precisa_resposta" && janelaAberta(c.janela_ate)).length;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <CarboPageHeader
        icon={MessagesSquare}
        title="Conversas"
        description="As respostas dos clientes no WhatsApp oficial. É o único lugar onde elas existem — número da Cloud API não aparece na Caixa de Entrada da Meta."
        actions={
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {urgentes > 0 && (
              <span className="text-xs font-medium text-amber-500">
                {urgentes} esperando resposta
              </span>
            )}
            {esperando > urgentes && (
              <span className="text-[11px] text-muted-foreground">
                {esperando - urgentes} com a janela já fechada
              </span>
            )}
            {/* ⚠️ Zero recebendo não é um detalhe de configuração: é ninguém
                sendo avisado enquanto a janela de 24 h corre. Por isso o estado
                aparece no botão, e em âmbar quando é zero. */}
            <Button size="sm" variant="outline"
                    className={`h-8 gap-1.5 ${quantosRecebem === 0 ? "text-amber-500" : ""}`}
                    onClick={() => setVerQuemRecebe((v) => !v)}>
              {quantosRecebem === 0
                ? <><BellOff className="h-3.5 w-3.5" /> Ninguém recebe aviso</>
                : <><BellRing className="h-3.5 w-3.5" /> {quantosRecebem} recebem aviso</>}
            </Button>
            <Button asChild size="sm" variant="outline" className="h-8 gap-1.5">
              <Link to={voltar}><ArrowLeft className="h-3.5 w-3.5" /> Voltar</Link>
            </Button>
          </div>
        }
      />

      {verQuemRecebe && <QuemRecebe aoFechar={() => setVerQuemRecebe(false)} />}

      {/* ⚠️ Erro e vazio são coisas diferentes, e mostrá-los igual já custou
          caro nesta base: a tela de estoque dos vendedores dizia "ninguém tem
          caixa" quando o que havia era falha de permissão. */}
      {error && (
        <CarboCard>
          <CarboCardContent className="p-4">
            <p className="flex items-start gap-1.5 text-xs text-red-500">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              Não consegui carregar: {(error as Error).message}
            </p>
          </CarboCardContent>
        </CarboCard>
      )}

      {!error && isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}

      {!error && !isLoading && lista.length === 0 && (
        <CarboCard>
          <CarboCardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">Nenhuma conversa ainda.</p>
            <p className="mx-auto mt-1 max-w-lg text-[11px] text-muted-foreground/80">
              Ela aparece assim que um aviso da esteira for enviado, ou quando um
              cliente escrever para o número — mesmo sem nunca ter recebido nada.
            </p>
          </CarboCardContent>
        </CarboCard>
      )}

      {/* ⚠️ Três colunas a partir do XL, duas no lg: o painel do contato é o
          primeiro a sair quando falta espaço — sem ele dá para atender, sem a
          conversa não. */}
      {lista.length > 0 && (
        <div className="grid gap-3 lg:h-[calc(100vh-13rem)] lg:grid-cols-[20rem_1fr] xl:grid-cols-[20rem_1fr_19rem]">
          <CarboCard className="min-h-0 overflow-hidden">
            <CarboCardContent className="flex h-full min-h-0 flex-col gap-0 p-0">
              {/* Busca e filtro ficam FORA da área que rola: com 40 conversas,
                  um campo que sobe junto com a lista é um campo que ninguém
                  encontra na hora em que precisa dele. */}
              <div className="shrink-0 space-y-2 border-b p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={busca} onChange={(e) => setBusca(e.target.value)}
                         placeholder="Buscar por nome ou número…"
                         className="h-8 pl-7 pr-7 text-xs" />
                  {busca && (
                    <button type="button" onClick={() => setBusca("")} aria-label="Limpar busca"
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {FILTROS.map((f) => {
                    const ativo = filtro === f.id;
                    return (
                      <button key={f.id} type="button" onClick={() => setFiltro(f.id)}
                              className={`flex-1 rounded-md border px-1.5 py-1 text-[10px] font-medium transition-colors ${
                                ativo ? "border-carbo-green/50 bg-carbo-green/5 text-foreground"
                                      : "border-transparent text-muted-foreground hover:bg-muted/40"}`}>
                        {f.rotulo}
                        {/* A contagem fica do lado do rótulo para o filtro dizer,
                            antes do clique, se vale a pena clicar. */}
                        <span className={ativo ? "ml-1 text-muted-foreground" : "ml-1 text-muted-foreground/60"}>
                          {contagens[f.id]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="max-h-[20rem] min-h-0 flex-1 space-y-1 overflow-y-auto p-2 lg:max-h-none">
                {/* ⚠️ "Nada casou com a busca" é diferente de "não há conversa".
                    O segundo vive fora daqui; este só precisa mostrar a saída —
                    senão a lista some e parece que os dados sumiram. */}
                {filtradas.length === 0 ? (
                  <div className="px-3 py-8 text-center">
                    <SearchX className="mx-auto h-5 w-5 text-muted-foreground/60" />
                    <p className="mt-2 text-xs text-muted-foreground">
                      Nenhuma conversa com esse filtro.
                    </p>
                    <p className="mx-auto mt-1 max-w-[15rem] text-[10px] text-muted-foreground/80">
                      {busca.trim()
                        ? <>Nada casou com “{busca.trim()}”. São {lista.length} conversas no total.</>
                        : <>São {lista.length} conversas no total — troque o filtro para vê-las.</>}
                    </p>
                    {(busca.trim() || filtro !== "todas") && (
                      <Button size="sm" variant="outline" className="mt-3 h-7 text-[11px]"
                              onClick={() => { setBusca(""); setFiltro("todas"); }}>
                        Limpar busca e filtro
                      </Button>
                    )}
                  </div>
                ) : (
                  /* ⚠️ Agrupado por ESTADO, não uma lista corrida. Com 22
                     conversas dá para varrer; com 200, a pendência se perde no
                     meio dos avisos que ninguém respondeu. O cabeçalho de grupo
                     é o que faz a lista ter tamanho legível para sempre. */
                  ORDEM_STATUS.flatMap((estado) => {
                    const doGrupo = filtradas.filter((c) => c.status === estado);
                    if (!doGrupo.length) return [];
                    return [
                      <p key={`g-${estado ?? "sem"}`}
                         className="sticky top-0 z-10 bg-background/95 px-1 pb-1 pt-2 text-[10px]
                                    font-semibold uppercase tracking-wide text-muted-foreground
                                    backdrop-blur first:pt-0">
                        {estado ? STATUS[estado].grupo : "Sem pendência"}
                        <span className="ml-1 font-normal text-muted-foreground/60">
                          {doGrupo.length}
                        </span>
                      </p>,
                      ...doGrupo.map((c) => {
                    const nivelC = nivelDaJanela(c.janela_ate);
                    const tomC = TOM_JANELA[nivelC];
                    const abertoC = janelaAberta(c.janela_ate);
                    const selecionada = atual?.wa_id === c.wa_id;

                    return (
                      <button key={c.wa_id} type="button" onClick={() => abrir(c.wa_id)}
                              className={`w-full rounded-md border p-2 text-left transition-colors ${
                                selecionada ? "border-carbo-green/50 bg-carbo-green/5"
                                            : "border-transparent hover:border-border hover:bg-muted/40"}`}>
                        <div className="flex items-start gap-2">
                          {/* A borda do avatar repete o sinal do relógio, para a
                              urgência ser visível na varredura vertical. */}
                          <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${tomC.borda} ${tomC.fundo} ${tomC.texto}`}>
                            {inicialDe(c.cliente, c.wa_id)}
                          </span>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              {/* O nome é o que se procura: única coisa em peso
                                  normal de leitura. Prévia e horário descem um
                                  degrau cada. */}
                              <span className="truncate text-[13px] font-semibold leading-tight">
                                {c.cliente ?? c.wa_id}
                              </span>
                              <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
                                {hora(c.ultima_em)}
                              </span>
                            </div>

                            {c.nome_whatsapp && (
                              <p className="truncate text-[10px] leading-tight text-muted-foreground/60">
                                no WhatsApp: {c.nome_whatsapp}
                              </p>
                            )}

                            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                              {c.ultima_direcao === "saida" && (
                                <span className="text-muted-foreground/60">você: </span>
                              )}
                              {c.ultima_texto ?? "(arquivo)"}
                            </p>

                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              {/* ── O relógio ──────────────────────────────
                                  Fora da janela a Meta recusa texto livre e não
                                  há template que responda dúvida. Por isso é uma
                                  pastilha com ícone, e não o fim de uma terceira
                                  linha cinza. Fechada fica APAGADA de propósito:
                                  chamar atenção para o que não tem ação treina a
                                  pessoa a ignorar cor. */}
                              {abertoC ? (
                                <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${tomC.borda} ${tomC.fundo} ${tomC.texto}`}>
                                  <Clock className="h-3 w-3" /> {faltaDaJanela(c.janela_ate)}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                  <Lock className="h-3 w-3" /> janela fechada
                                </span>
                              )}

                              {/* ── Status ────────────────────────────────
                                  Ele responde "em que pé está?", que é a
                                  pergunta que a lista existe para responder.
                                  Aberto e Em atendimento saem de quem falou por
                                  último; Aguardando e Resolvido são decisão de
                                  gente. */}
                              {c.status && (
                                <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5
                                                  text-[10px] font-medium ${STATUS[c.status].classe}`}>
                                  {STATUS[c.status].rotulo}
                                </span>
                              )}

                              {/* ⚠️ O responsável no PRIMEIRO nome. A lista é de
                                  varredura; nome completo empurraria o resto
                                  para fora da linha. */}
                              {c.responsavel_nome && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <UserCheck className="h-3 w-3" />
                                  {c.responsavel_nome.split(" ")[0]}
                                </span>
                              )}

                              {/* ⚠️ No máximo DUAS etiquetas + "+N". Uma conversa
                                  com seis tags quebraria a linha e empurraria o
                                  relógio para fora da vista — e o relógio é o
                                  que não pode sumir. */}
                              {c.tags.slice(0, 2).map((t) => (
                                <span key={t.id}
                                      className={`inline-flex max-w-[7rem] items-center truncate rounded-md
                                                  border px-1.5 py-0.5 text-[10px] ${COR_TAG[t.cor] ?? COR_TAG.cinza}`}>
                                  {t.nome}
                                </span>
                              ))}
                              {c.tags.length > 2 && (
                                <span className="text-[10px] text-muted-foreground/70">
                                  +{c.tags.length - 2}
                                </span>
                              )}

                              {/* O número sozinho não dizia de que era. Com a
                                  palavra, some a dúvida entre "3 mensagens" e
                                  "pedido nº 3". */}
                              {c.estado === "precisa_resposta" && (
                                <CarboBadge variant="secondary"
                                            className={`shrink-0 gap-1 px-1.5 py-0 text-[10px] font-medium ${
                                              abertoC ? "text-amber-500" : "text-muted-foreground"}`}>
                                  {c.parece_encerrada && <Sparkles className="h-2.5 w-2.5" />}
                                  {c.aguardando} sem resposta
                                </CarboBadge>
                              )}
                              {c.estado === "resolvida" && (
                                <CarboBadge variant="secondary"
                                            className="shrink-0 gap-1 px-1.5 py-0 text-[10px] text-emerald-500">
                                  <CheckCheck className="h-2.5 w-2.5" /> resolvida
                                </CarboBadge>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  }),
                    ];
                  })
                )}
              </div>
            </CarboCardContent>
          </CarboCard>

          {atual && <Conversa key={atual.wa_id} c={atual} />}
          {atual && <PainelContato key={`p-${atual.wa_id}`} c={atual} meuId={meuId} />}
        </div>
      )}
    </div>
  );
}
