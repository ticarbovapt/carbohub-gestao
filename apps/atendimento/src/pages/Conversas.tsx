import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  MessagesSquare, Send, Loader2, AlertTriangle, Clock, ArrowLeft, Lock, Paperclip,
  Image as ImageIcon, Video, Mic, FileText, MapPin, User,
  File as FileIcon, HelpCircle,
  Search, SearchX, X, Package, ArrowUpRight, Megaphone,
  BellRing, BellOff, Check, CheckCheck, Inbox, Undo2, Sparkles, UserCheck, Tag as TagIcon, Plus,
  CalendarClock, Trash2, Square, Play, Pause, Download, StickyNote, EyeOff, Copy,
  Maximize2, SlidersHorizontal, ChevronDown, MessageSquarePlus,
} from "lucide-react";
import { toast } from "sonner";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
// ⚠️ O card do pedido é o DA ESTEIRA, importado — nunca uma segunda versão.
import { Detalhe } from "@/pages/EsteiraOnline";
import { useEsteiraPedido, useAvisosDoPedido, useRastreios } from "@/hooks/useEsteiraOnline";
import { useTemplatesMsg } from "@/hooks/useMensagensCliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import {
  useConversas, useConversasAoVivo, useResponder, janelaAberta, faltaDaJanela,
  useNumeros, type NumeroWa,
  // ⚠️ Puras e na `lib`, não aqui: dá para conferir o recorte sem montar tela.
  aplicarFiltrosDaCaixa, quantosFiltrosAtivos, FILTROS_VAZIOS,
  type FiltrosDaCaixa as TipoFiltros,
  nivelDaJanela, fracaoDaJanela, type NivelJanela,
  useNotificaveis, useMarcarNotificado,
  useAgendadas, useAgendar, useCancelarAgendada, useEnviarMidia, useMidia,
  useBuscaNaConversa, useGaleriaDaConversa,
  // A barra `/atalho`: as frases que o time repete todo dia.
  useRespostasRapidas, useSalvarResposta, useApagarResposta,
  termoDaBarra, filtrarRespostas, normalizarAtalho, atalhoValido,
  type RespostaRapida,
  type AchadoNaConversa, type ItemDaGaleria,
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

/** Dia e hora, para a busca e a galeria: ali NÃO há separador de dia, e o
 *  achado pode ser de qualquer época — só a hora não localiza nada.
 *  ⚠️ `timeZone` escrito, como em todo o resto do arquivo. */
const fmtDataHora = (s: string) =>
  new Date(s).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
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

/** "Hoje" / "Ontem" / "Seg., 28/09" — e com o ano só quando ele é outro.
 *
 *  ⚠️ "Ontem" sai de subtrair 24 h do agora e comparar o dia resultante em SP —
 *  não de aritmética de calendário.
 *
 *  ⚠️ A primeira letra é posta em maiúscula AQUI, e não com `capitalize` no CSS
 *  do separador: aquela classe capitaliza CADA palavra, e era ela que escrevia
 *  "Segunda-Feira", que não é português. O `capitalize` saiu do
 *  `SeparadorDeDia` junto com esta mudança.
 *
 *  ⚠️ O ano só aparece quando NÃO é o ano corrente. A conversa carrega 30 dias,
 *  então ele é o mesmo em todos os separadores — e repetido é carimbo, não
 *  informação. Mesma razão por que o horário só sai na última do bloco. */
function rotuloDoDia(s: string): string {
  const dia = diaEmSP(s);
  const agora = Date.now();
  const hoje = diaEmSP(new Date(agora).toISOString());
  if (dia === hoje) return "Hoje";
  if (dia === diaEmSP(new Date(agora - 86_400_000).toISOString())) return "Ontem";
  // ⚠️ A comparação de ano é sobre o dia JÁ em Brasília (`dd/mm/aaaa`), nunca
  // `getFullYear()`: aquele é hora local do navegador, e às 21h de 31/12 ele
  // diria um ano que em SP ainda não começou — a armadilha de fuso do
  // `ordered_at::date`.
  const opcoes: Intl.DateTimeFormatOptions = {
    weekday: "short", day: "2-digit", month: "2-digit",
    timeZone: "America/Sao_Paulo",
  };
  if (dia.slice(-4) !== hoje.slice(-4)) opcoes.year = "numeric";
  const r = new Date(s).toLocaleDateString("pt-BR", opcoes);
  return r.charAt(0).toUpperCase() + r.slice(1);
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
 * ele fica no meio, sem lado, com moldura tracejada âmbar e a frase "só o time
 * vê" ACIMA do texto — a mesma lógica do contorno tracejado do aviso
 * automático, que existe para ninguém confundir sistema com gente.
 *
 * ⚠️ O sigilo NUNCA foi a cor nem o ícone: é a tabela separada
 * (`carbo_wa_notas`), que nenhum caminho de envio lê. A tela só precisa dizer o
 * fato uma vez, bem — eram DOIS ícones (bloco de notas + olho cortado) e DOIS
 * rótulos ("recado interno" e "só o time vê") para um único fato, mais uma
 * terceira linha só para autor e hora.
 *
 * ⚠️ `soHora`, não `hora`: o dia já está no separador logo acima, e repeti-lo em
 * cada recado é o mesmo carimbo que o horário dos balões evita.
 */
function Recado({ n, apagar }: { n: Nota; apagar: () => void }) {
  return (
    <div className="my-3 flex justify-center">
      <div className="group w-[92%] rounded-lg border border-dashed border-amber-500/40
                      bg-amber-500/5 px-3 py-2 sm:w-[80%]">
        <p className="flex items-center gap-1.5 text-[10px] leading-none text-amber-500/90">
          <StickyNote className="h-3 w-3 shrink-0" />
          <span className="shrink-0 font-medium">recado interno · só o time vê</span>
          <span className="ml-auto min-w-0 truncate text-muted-foreground/70">
            {n.autor_nome ?? "alguém do time"} · {soHora(n.criado_em)}
          </span>
          <button type="button" onClick={apagar}
                  className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100
                             hover:text-red-500"
                  aria-label="Apagar recado">
            <Trash2 className="h-3 w-3" />
          </button>
        </p>
        <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed">
          {n.texto}
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
  const video  = tipo === "video";
  const som = tipo === "audio" || tipo === "voice" || tipo === "ptt";
  // Imagem e vídeo são a MESMA coisa para quem atende: conteúdo para OLHAR.
  const visual = imagem || video;
  const [amplo, setAmplo] = useState(false);

  // Esc fecha a tela cheia. ⚠️ Sem isto o overlay só sairia com o clique, e o
  // reflexo de quem usa o computador o dia inteiro é apertar Esc — ficar preso
  // numa foto em tela cheia parece a tela ter travado.
  useEffect(() => {
    if (!amplo) return;
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === "Escape") setAmplo(false); };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [amplo]);

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
  const [abrir, setAbrir] = useState(visual);
  const { data, isFetching, error } = useMidia(mediaId, abrir);

  // Enquanto a foto vem, um retângulo do tamanho dela evita o pulo do layout
  // que joga a conversa para cima no meio da leitura.
  if (visual && !data && isFetching) {
    return (
      <div className="mb-1.5 flex h-32 w-48 items-center justify-center rounded-md
                      border border-dashed bg-background/40">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (data) {
    if (visual) {
      return (
        <>
          <div className="group relative mb-1.5 w-fit">
            {video ? (
              /* ⚠️ Toca AQUI, não baixa. O vídeo caía no ramo de documento e
                 virava um link de download: quem atende precisava salvar no
                 computador e abrir noutro programa para ver o que o cliente
                 filmou — no meio de um atendimento sobre embalagem violada.
                 `controls` nativo já traz play, linha do tempo, volume e o
                 botão de tela cheia do próprio navegador. */
              <video
                src={data.url} controls playsInline preload="metadata"
                className="max-h-64 w-auto rounded-md border bg-black"
              />
            ) : (
              <img src={data.url} alt={rotulo}
                   className="max-h-64 w-auto rounded-md border object-contain" />
            )}
            {/* Expandir para a tela inteira. Fica discreto até o mouse chegar —
                a conversa é o conteúdo principal, o botão não. */}
            <button
              type="button" onClick={() => setAmplo(true)}
              title="Abrir em tela cheia"
              className="absolute right-1.5 top-1.5 rounded-md bg-black/55 p-1.5 text-white
                         opacity-0 transition-opacity hover:bg-black/75
                         focus-visible:opacity-100 group-hover:opacity-100"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {amplo && (
            /* Sem componente de Dialog: este overlay não é um formulário, e
               fechar no clique de fora / no Esc é tudo que ele precisa fazer. */
            <div
              role="dialog" aria-modal="true" aria-label={rotulo}
              onClick={() => setAmplo(false)}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
            >
              <button
                type="button" onClick={() => setAmplo(false)} title="Fechar"
                className="absolute right-4 top-4 rounded-md bg-white/10 p-2 text-white hover:bg-white/20"
              >
                <X className="h-5 w-5" />
              </button>
              {/* ⚠️ `stopPropagation` na mídia: sem isso, mexer no volume ou
                  arrastar a linha do tempo do vídeo fecharia o overlay. */}
              {video ? (
                <video
                  src={data.url} controls autoPlay playsInline
                  onClick={(e) => e.stopPropagation()}
                  className="max-h-full max-w-full rounded-md"
                />
              ) : (
                <img
                  src={data.url} alt={rotulo}
                  onClick={(e) => e.stopPropagation()}
                  className="max-h-full max-w-full rounded-md object-contain"
                />
              )}
            </div>
          )}
        </>
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
 *  longa, quem chega no meio precisa saber "de quando é isto?" sem subir.
 *
 *  ⚠️ SEM `capitalize`. Aquela classe maiusculiza CADA palavra e produzia
 *  "Segunda-Feira"; quem decide a maiúscula é o `rotuloDoDia`, que põe só a
 *  primeira letra. */
function SeparadorDeDia({ rotulo }: { rotulo: string }) {
  return (
    <div className="sticky top-0 z-10 flex justify-center py-1.5">
      <span className="rounded-full border bg-muted/80 px-2.5 py-0.5 text-[10px]
                       font-medium text-muted-foreground backdrop-blur">
        {rotulo}
      </span>
    </div>
  );
}

/**
 * Procurar dentro da conversa.
 *
 * ⚠️ A busca é do SERVIDOR, não do que está na tela — e o rodapé diz isso com
 * todas as letras. A tela carrega 30 dias; quem procura um comprovante de
 * junho e recebe "nada" concluiria que ele não existe.
 */
function BuscaNaConversa({ waId, aoFechar, aoAbrir }: {
  waId: string;
  aoFechar: () => void;
  aoAbrir: (a: AchadoNaConversa) => void;
}) {
  const [termo, setTermo] = useState("");
  const { data: achados = [], isFetching } = useBuscaNaConversa(waId, termo);
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => { campo.current?.focus(); }, []);
  const curto = termo.trim().length < 2;

  return (
    <div className="shrink-0 border-b bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          ref={campo} value={termo} onChange={(e) => setTermo(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") aoFechar(); }}
          placeholder="Procurar nesta conversa…"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        <button type="button" onClick={aoFechar} aria-label="Fechar a busca"
                className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ⚠️ O mínimo de dois caracteres é DITO. Campo que não reage sem dizer
          por quê parece quebrado — e com um caractere o `ilike` varreria a
          conversa inteira para devolver quase tudo. */}
      {curto ? (
        termo.length > 0 && (
          <p className="mt-1.5 text-[11px] text-muted-foreground">Digite ao menos 2 letras.</p>
        )
      ) : !isFetching && (
        <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border bg-background">
          {achados.length === 0 ? (
            <p className="px-3 py-3 text-center text-[11px] text-muted-foreground">
              Nada com esse termo — e a procura foi na conversa INTEIRA, não só no
              que está na tela.
            </p>
          ) : (
            <>
              {achados.map((a) => (
                <button key={a.wamid} type="button" onClick={() => aoAbrir(a)}
                        className="flex w-full items-start gap-2 border-b px-3 py-2 text-left
                                   last:border-b-0 hover:bg-muted/50">
                  <span className="shrink-0 pt-px text-[10px] uppercase tracking-wide text-muted-foreground">
                    {a.direcao === "saida" ? "nós" : "cliente"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs">{destacar(a.texto, termo)}</span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                      {fmtDataHora(a.ocorrido_em)}
                    </span>
                  </span>
                </button>
              ))}
              {/* ⚠️ O teto é DITO quando é atingido. Lista cortada em silêncio é
                  a doença do teto de 1.000 do PostgREST: a resposta parece
                  completa e não é. */}
              {achados.length >= 50 && (
                <p className="px-3 py-2 text-center text-[10px] text-muted-foreground">
                  Mostrando as 50 mais recentes — refine o termo para ver as outras.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** O termo em negrito dentro do trecho: sem isto, numa mensagem longa a pessoa
 *  ainda tem de procurar o que procurou. */
function destacar(texto: string | null, termo: string) {
  const t = termo.trim();
  const txt = texto ?? "";
  if (!t) return txt;
  const i = txt.toLowerCase().indexOf(t.toLowerCase());
  if (i < 0) return txt;
  return (
    <>
      {txt.slice(0, i)}
      <mark className="bg-carbo-green/30 text-foreground">{txt.slice(i, i + t.length)}</mark>
      {txt.slice(i + t.length)}
    </>
  );
}

/**
 * Os arquivos da conversa, num lugar só.
 *
 * ⚠️ É uma LISTA, não uma grade de miniaturas, e isso é decisão. A mídia aqui
 * não é baixada — o webhook guarda só o `midia_id` e o link da Meta expira, e
 * cada arquivo passa pela `whatsapp-midia-baixar` com o nosso token. Uma grade
 * baixaria vinte arquivos no clique de abrir; quem abre a galeria quer UM.
 * Clicar abre pelo mesmo caminho do balão.
 */
function GaleriaDaConversa({ waId, aoFechar }: { waId: string; aoFechar: () => void }) {
  const { data: itens = [], isFetching } = useGaleriaDaConversa(waId, true);
  const [aberto, setAberto] = useState<ItemDaGaleria | null>(null);

  useEffect(() => {
    const t = (e: KeyboardEvent) => { if (e.key === "Escape") { if (aberto) setAberto(null); else aoFechar(); } };
    window.addEventListener("keydown", t);
    return () => window.removeEventListener("keydown", t);
  }, [aoFechar, aberto]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
         onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
      <div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-xl border bg-background shadow-lg">
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Arquivos da conversa</p>
            <p className="text-[11px] text-muted-foreground">
              {isFetching ? "Buscando…"
                : `${itens.length} ${itens.length === 1 ? "arquivo" : "arquivos"}, do mais novo para o mais antigo`}
            </p>
          </div>
          <button type="button" onClick={aoFechar} aria-label="Fechar a galeria"
                  className="rounded p-1 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {isFetching ? (
            <div className="grid place-items-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : itens.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted-foreground">
              Nenhuma foto, áudio ou arquivo nesta conversa ainda.
            </p>
          ) : (
            <div className="space-y-1">
              {itens.map((i) => {
                const Icone = ICONE_MIDIA[i.tipo] ?? FileIcon;
                return (
                  <button key={i.wamid} type="button" onClick={() => setAberto(i)}
                          className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left
                                     transition-colors hover:bg-muted/50">
                    <Icone className="h-4 w-4 shrink-0 text-carbo-green" />
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {i.texto || (NOME_MIDIA[i.tipo] ?? i.tipo)}
                    </span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {i.direcao === "saida" ? "nós" : "cliente"}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {fmtDataHora(i.ocorrido_em)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* O item escolhido abre pelo MESMO componente do balão — um caminho só
            para baixar mídia, em vez de dois que divergem. */}
        {aberto && (
          <div className="shrink-0 border-t p-3">
            <Anexo mediaId={aberto.midia_id} tipo={aberto.tipo}
                   nome={aberto.texto ?? null} Icone={ICONE_MIDIA[aberto.tipo] ?? FileIcon} />
          </div>
        )}
      </div>
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
function Balao({ m, primeira, ultima, mostrarComoReenviar }: {
  m: MensagemConversa; primeira: boolean; ultima: boolean;
  /** ⚠️ Só na mensagem não entregue MAIS RECENTE da conversa. Não dá para usar
   *  `ultima`: ela marca fim de BLOCO, e as sete do mesmo cliente caíram em
   *  dias diferentes — o texto de ação voltaria a aparecer em todas, que é
   *  exatamente o que esta mudança corrige. */
  mostrarComoReenviar?: boolean;
}) {
  const automatica = m.tipo === "template";
  const nossa = m.direcao === "saida";
  const anexo = !!m.midia_id;
  const desconhecida = !m.texto && !anexo && !automatica;
  const IconeAnexo = ICONE_MIDIA[m.tipo] ?? FileIcon;
  // ⚠️ `unsupported` NÃO é "um formato que a tela não conhece" — é a META
  // dizendo que ELA não processou a mensagem. O payload vem com
  // `errors[].code = 131051` e `unsupported: { type: "unknown" }`, e SEM
  // conteúdo nenhum (medido em 30/09/2026: 7 mensagens, texto e mídia nulos
  // nas sete). Não há o que mostrar e não vai haver.
  const naoEntregue = m.tipo === "unsupported";
  // ⚠️ `reaction` chega COM texto (o emoji), então ela caía no ramo de texto e
  // aparecia como se o cliente tivesse ENVIADO a mensagem "👍". Não enviou —
  // reagiu a uma mensagem nossa. Medido: 28 reações de 21 clientes, contra 7
  // `unsupported` de 1. O defeito de maior alcance era este, e ninguém o via
  // porque ele não parece defeito: parece uma resposta curta.
  const reacao = m.tipo === "reaction" && !!m.texto;

  // ⚠️ O aviso mostra a MENSAGEM que o cliente recebeu, não o nome do template.
  // Ela é reconstruída no banco a partir do corpo aprovado + os parâmetros que
  // foram enviados — a mesma substituição que a Meta faz, não uma segunda
  // redação. Quem atende precisa conferir QUAL código de rastreio foi mandado;
  // saber apenas que "houve um aviso" faz perguntar ao cliente uma informação
  // que nós mesmos mandamos.
  //
  // O contorno tracejado e a palavra "automático" CONTINUAM: a pessoa tem de
  // distinguir o que saiu por sistema do que alguém digitou, e essa distinção
  // não é estética — aviso automático NÃO conta como atendimento
  // (`statusEfetivo`, em `lib/conversas.ts`, olha `tipo === "template"`).
  if (automatica) {
    // ⚠️ O código de rastreio vinha DUAS VEZES: no corpo (o template o manda
    // como parâmetro do texto) e no rodapé do botão, em monoespaçado, logo
    // abaixo. O mesmo dado a três centímetros de distância, e o do rodapé
    // chamando mais atenção que a própria mensagem.
    //
    // ⚠️ E a regra NÃO pode ser "esconder o do rodapé": há template com botão
    // cujo corpo não cita o código, e ali o rodapé é a ÚNICA fonte. Quem decide
    // é a comparação com o texto de verdade, mensagem por mensagem — ausência
    // disfarçada de resposta é a doença conhecida deste repo.
    const codigoJaNoTexto = !!m.botao_rastreio && !!m.texto
      && m.texto.includes(m.botao_rastreio);
    // O nome da ETAPA diz QUAL aviso é, em menos espaço do que "aviso
    // automático da esteira" gastava sem informar nada. Cru quando é etapa que
    // o mapa não conhece (recompra, carrinho), e nulo quando o envio não
    // guardou etapa — e aí o rótulo volta a ser "aviso automático".
    const etapa = m.sobre_a_etapa
      ? (NOME_ETAPA[m.sobre_a_etapa] ?? m.sobre_a_etapa)
      : null;
    return (
      <div className={`flex justify-end ${primeira ? "mt-3 first:mt-0" : "mt-0.5"}`}>
        <div className="max-w-[85%] rounded-lg border border-dashed bg-muted/30 px-3 py-2 sm:max-w-[70%]">
          {/* ⚠️ O rótulo fica ACIMA do texto: ele responde "isto foi gente ou
              sistema?", e essa pergunta se responde ANTES de ler a mensagem. A
              hora vem na mesma linha porque ela sobrava vazia à direita — e
              assim o balão perde uma linha inteira sem perder nada. */}
          <p className="flex items-center gap-1.5 text-[10px] font-medium leading-none text-muted-foreground">
            <Megaphone className="h-3 w-3 shrink-0" />
            <span className="min-w-0 truncate">
              {etapa ? `automático · ${etapa}` : "aviso automático"}
            </span>
            <span className="ml-auto shrink-0 font-normal text-muted-foreground/70">
              {soHora(m.ocorrido_em)}
            </span>
          </p>
          <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed">
            {m.texto}
          </p>
          {/* O botão não faz parte do corpo, mas faz parte do que o cliente
              recebeu — por isso ele continua dito. O CÓDIGO só aparece aqui
              quando o corpo não o tem. */}
          {m.botao_rastreio && (
            <p className="mt-1.5 flex items-center gap-1 rounded-md border bg-background/40 px-2 py-1
                          text-[10px] text-muted-foreground">
              <ArrowUpRight className="h-3 w-3 shrink-0" />
              <span className="shrink-0">
                botão <strong className="font-medium text-foreground">Acompanhar pedido</strong>
              </span>
              {!codigoJaNoTexto && (
                <span className="min-w-0 truncate font-mono">{m.botao_rastreio}</span>
              )}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Não entregue pelo WhatsApp ────────────────────────────────────────────
  //
  // ⚠️ DESESCALADO em 30/09/2026, no mesmo dia. A primeira versão era um balão
  // amarelo do tamanho de uma mensagem, com o texto de ação repetido em TODAS
  // as linhas. O dono do processo abriu a tela e leu aquilo como *"segue com
  // erro aqui"* — e estava certo na leitura, ainda que o sistema estivesse
  // certo no conteúdo: quatro tarjas grandes repetindo o mesmo aviso gritam
  // mais que uma mensagem de verdade, e aviso que parece erro faz abrir
  // ticket contra um sistema que está funcionando. É a mesma lição da tarja
  // de status: vermelho sem motivo ensina o time a ignorar o vermelho.
  //
  // O FATO continua dito em toda linha (a mensagem existiu e não chegou), mas
  // pequeno. A AÇÃO — pedir o reenvio — aparece UMA vez, na última do bloco:
  // repetir "peça para reenviar" quatro vezes não faz ninguém pedir quatro
  // vezes, faz parar de ler.
  if (naoEntregue) {
    return (
      <div className={`flex ${nossa ? "justify-end" : "justify-start"} ${primeira ? "mt-3 first:mt-0" : "mt-0.5"}`}>
        <div className="max-w-[85%] sm:max-w-[70%]">
          <div className="flex items-center gap-1.5 rounded-full border border-dashed bg-muted/20 px-2.5 py-1">
            <AlertTriangle className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">
              mensagem não entregue pelo WhatsApp · {soHora(m.ocorrido_em)}
            </span>
          </div>
          {mostrarComoReenviar && (
            <p className="mt-1 pl-2.5 text-[10px] leading-snug text-muted-foreground/80">
              O WhatsApp não entrega esse formato por esta API — o conteúdo não chegou
              até nós. Peça para reenviar como texto, foto ou áudio.
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Reação ────────────────────────────────────────────────────────────────
  // Desenhada pequena e sem balão: ela não é uma fala, é um gesto sobre uma
  // fala anterior. Com o balão normal, um 👍 ocupava o mesmo espaço e o mesmo
  // peso de uma pergunta — e quem atende lia como resposta.
  //
  // ⚠️ O emoji fica GRANDE e o "reagiu" pequeno, nessa ordem: o que importa é
  // QUAL foi a reação. Escrever `reagiu com "👍"` entre aspas faria parecer
  // texto digitado, que é justamente a confusão que isto corrige.
  if (reacao) {
    return (
      <div className={`flex ${nossa ? "justify-end" : "justify-start"} ${primeira ? "mt-3 first:mt-0" : "mt-0.5"}`}>
        <div className="flex items-center gap-1.5 rounded-full border bg-muted/30 px-2.5 py-1">
          <span className="text-base leading-none">{m.texto}</span>
          <span className="text-[10px] text-muted-foreground">
            {nossa ? "reagimos" : "reagiu"} · {soHora(m.ocorrido_em)}
          </span>
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
          /* ⚠️ SÃO DUAS PERGUNTAS DIFERENTES e antes as duas caíam na mesma
             frase amarela, que afirmava duas coisas que a tela não sabia:
             "a tela ainda não sabe mostrar este formato" (sugere defeito
             nosso, corrigível) e "O conteúdo está gravado" (o PAYLOAD está;
             o conteúdo não existe).

             Quem lê isso não pede o reenvio — e o reenvio é a única coisa que
             recupera a mensagem. Ausência disfarçada de resposta, de novo. */
          /* ⚠️ Aqui só chega FORMATO QUE A TELA NÃO CONHECE — `unsupported`
             sai antes, no seu próprio ramo. São perguntas diferentes e antes
             caíam na mesma frase amarela, que afirmava duas coisas que a tela
             não sabia: "a tela ainda não sabe mostrar" (sugeria defeito nosso,
             corrigível) e "O conteúdo está gravado" (o PAYLOAD está; o
             conteúdo, não). Aqui as duas são verdade — é formato novo da Meta,
             e o payload cru realmente tem o que mostrar. */
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
            {/* ⚠️ QUEM ENVIOU, e só na saída de gente. O cliente NÃO vê isto —
                é coluna interna, nenhum caminho de envio a lê. Fica junto do
                horário porque é a mesma pergunta ("quando e por quem"), e na
                ÚLTIMA do bloco pelo mesmo motivo do horário: repetido em cada
                balão vira carimbo e some da vista.
                Aviso automático da esteira não tem autor e não ganha rótulo —
                escrever "sistema" ali seria dizer o óbvio em toda linha. */}
            {nossa && m.enviado_por_nome && (
              <span className="mr-1">{m.enviado_por_nome} ·</span>
            )}
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

/**
 * O painel que a barra `/` abre, logo acima do campo de resposta.
 *
 * ⚠️ Ele ABRE, mas quem manda nas setas e no Enter é o campo de texto — o foco
 * nunca sai de lá. Painel que rouba o foco obrigaria a pessoa a voltar ao campo
 * com o mouse depois de escolher, que é o contrário de um atalho de teclado.
 */
function PainelDaBarra({ itens, indice, aoEscolher }: {
  itens: RespostaRapida[]; indice: number; aoEscolher: (r: RespostaRapida) => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);

  // A destacada tem de ficar VISÍVEL ao descer com a seta: passando de umas
  // seis respostas o painel rola, e sem isto a seleção desce para fora da caixa
  // e a pessoa tecla no escuro.
  useEffect(() => {
    caixa.current?.querySelector<HTMLElement>(`[data-i="${indice}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [indice]);

  if (itens.length === 0) {
    return (
      <div className="mb-1.5 rounded-lg border border-dashed border-border/60 bg-muted/30
                      px-3 py-2 text-[11px] text-muted-foreground">
        {/* ⚠️ Diz ONDE se cria. "Nenhuma resposta" sozinho deixa a pessoa
            achando que o recurso está quebrado. */}
        Nenhuma resposta com esse atalho — as respostas se criam no botão
        <MessageSquarePlus className="mx-1 inline h-3 w-3" />aqui embaixo.
      </div>
    );
  }

  return (
    <div ref={caixa} className="mb-1.5 max-h-56 overflow-y-auto rounded-lg border bg-background shadow-lg">
      {itens.map((r, i) => (
        <button key={r.id} type="button" data-i={i}
                /* ⚠️ `mousedown` e não `click`: o clique tira o foco do campo
                   de resposta antes de disparar, e o painel fecharia antes de
                   chegar aqui. */
                onMouseDown={(e) => { e.preventDefault(); aoEscolher(r); }}
                className={`flex w-full items-start gap-2 px-3 py-2 text-left transition-colors ${
                  i === indice ? "bg-carbo-green/10" : "hover:bg-muted/60"}`}>
          <span className="shrink-0 rounded bg-carbo-green/15 px-1.5 py-px font-mono
                           text-[10px] font-semibold text-carbo-green">
            /{r.atalho}
          </span>
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
            {r.corpo}
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * O botão de gerenciar: ver o que existe, acrescentar e apagar.
 *
 * ⚠️ DUAS portas para a mesma lista, e a divisão é proposital: a BARRA é o
 * caminho de quem está atendendo (`/frete`, Enter, texto colado, mão no
 * teclado); este painel é o caminho de quem está organizando. Ninguém cadastra
 * frase no meio de um atendimento, e ninguém quer abrir painel para colar uma.
 */
function GerenciadorDeRespostas({ lista, aoUsar }: {
  lista: RespostaRapida[]; aoUsar: (r: RespostaRapida) => void;
}) {
  /* ⚠️ Pergunta ao `useAuth()` aqui dentro, em vez de receber por prop: o
     componente que o monta (`Conversa`) não conhece o usuário, e passar um id
     por três níveis só para decidir a visibilidade de um ícone seria um prop
     atravessando a árvore inteira. */
  const { user } = useAuth();
  const meuId = user?.id ?? null;
  const salvar = useSalvarResposta();
  const apagar = useApagarResposta();
  const [aberto, setAberto] = useState(false);
  const [criando, setCriando] = useState(false);
  const [atalho, setAtalho] = useState("");
  const [corpo, setCorpo] = useState("");
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  const limpo = normalizarAtalho(atalho);
  const podeSalvar = atalhoValido(atalho) && !!corpo.trim() && !salvar.isPending;

  return (
    <div ref={caixa} className="relative">
      <Button size="sm" variant="outline" className="h-8 w-8 p-0"
              title="Respostas rápidas — ou digite / no campo de resposta"
              aria-label="Respostas rápidas" aria-expanded={aberto}
              onClick={() => setAberto((v) => !v)}>
        <MessageSquarePlus className="h-3.5 w-3.5" />
      </Button>

      {aberto && (
        /* `bottom-10`: o painel abre para CIMA. O campo de resposta fica no pé
           da tela, e para baixo ele sairia da janela. */
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
                <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">
                  Atalho
                </span>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-sm text-muted-foreground">/</span>
                  <Input value={atalho} onChange={(e) => setAtalho(e.target.value)}
                         placeholder="frete" maxLength={24}
                         className="h-7 min-w-0 flex-1 font-mono text-xs" />
                </div>
                {/* ⚠️ Mostra o que vai ser GRAVADO enquanto se digita. Quem
                    escreve "Frete " não erra — o gatilho do banco normaliza —,
                    mas descobriria só depois que o atalho é outro. */}
                {!!atalho.trim() && (
                  <span className={`mt-1 block text-[10px] ${
                    atalhoValido(atalho) ? "text-muted-foreground" : "text-amber-500"}`}>
                    {atalhoValido(atalho)
                      ? <>vai ser chamada por <span className="font-mono">/{limpo}</span></>
                      : "só letras, números, hífen e _ — até 24, sem espaço"}
                  </span>
                )}
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">
                  Texto
                </span>
                <Textarea value={corpo} onChange={(e) => setCorpo(e.target.value)}
                          rows={3} maxLength={4096}
                          placeholder="Me manda o CEP que eu calculo o frete pra você."
                          className="resize-none text-xs" />
              </label>
              <Button size="sm" className="h-7 w-full gap-1.5 text-xs" disabled={!podeSalvar}
                      onClick={() => salvar.mutate({ atalho, corpo }, {
                        onSuccess: () => {
                          toast.success(`Resposta salva. Chame por /${limpo}`);
                          setAtalho(""); setCorpo(""); setCriando(false);
                        },
                        onError: (e) => toast.error((e as Error).message),
                      })}>
                {salvar.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                Salvar
              </Button>
            </div>
          )}

          {lista.length === 0 ? (
            <p className="py-4 text-center text-[11px] text-muted-foreground">
              Nenhuma resposta ainda. As frases que o time repete todo dia moram
              aqui — e saem com <span className="font-mono">/atalho</span> no campo
              de resposta.
            </p>
          ) : (
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {lista.map((r) => (
                <div key={r.id} className="group flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/60">
                  <button type="button" className="min-w-0 flex-1 text-left"
                          onClick={() => { aoUsar(r); setAberto(false); }}>
                    <span className="block font-mono text-[11px] font-semibold text-carbo-green">
                      /{r.atalho}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-[11px] text-muted-foreground">
                      {r.corpo}
                    </span>
                  </button>
                  {/* ⚠️ O botão some para quem não escreveu, mas quem RECUSA é a
                      policy — esconder é a aparência da regra, não a regra. E a
                      chefia apaga qualquer uma: sem isso, a resposta de quem saiu
                      da empresa ficaria para sempre (`criado_por` vira null). */}
                  {!!meuId && r.criado_por === meuId && (
                    <button type="button" aria-label={`Apagar a resposta /${r.atalho}`}
                            className="shrink-0 rounded p-1 text-muted-foreground opacity-0
                                       transition-opacity hover:text-red-500 group-hover:opacity-100"
                            onClick={() => apagar.mutate(r.id, {
                              onError: (e) => toast.error((e as Error).message),
                            })}>
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Conversa({ c, onVerPedido }: {
  c: Conversa;
  /** Abre o card do pedido. ⚠️ Vem de FORA: esta tela e o painel do contato
   *  mostram o MESMO pedido, e dois estados locais abririam duas janelas. */
  onVerPedido: (blingId: number) => void;
}) {
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
    anotar.mutate({ wa_id: c.wa_id, numero_id: c.numero_id, texto: recado }, {
      onSuccess: () => { setRecado(""); setAba("responder"); toast.success("Anotado"); },
      onError: (e) => toast.error((e as Error).message),
    });
  };
  // ⚠️ RESOLVER PASSA PELO STATUS, não pela tabela antiga.
  //
  // `useResolverConversa` escreve em `carbo_wa_resolvidas`, e a migração
  // 20260935 mudou a FONTE DA VERDADE para `carbo_wa_atendimento` — o
  // `useConversas` deixou de ler a tabela antiga e o comentário dele diz isso
  // com todas as letras ("agora ele sai do ATENDIMENTO, não da tabela antiga").
  //
  // O lado da LEITURA migrou; estes três botões não. Resultado: o toast subia
  // ("Conversa marcada como resolvida"), a linha era gravada, e a conversa
  // continuava aberta — porque ninguém mais lia onde ela foi gravada. Meia
  // migração é o modo de falha mais caro deste projeto: não dá erro, dá tela
  // que discorda de si mesma.
  const resolver = useDefinirStatus();
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

  /* ── A barra `/atalho` ────────────────────────────────────────────────────
     ⚠️ TDZ: tudo isto roda no RENDER (`useMemo`), então depende de `texto` já
     estar declarado acima. É a armadilha que derrubou o /vender nos seis apps
     e que nem o `tsc` nem o build pegam. */
  const respostas = useRespostasRapidas();
  const termoBarra = termoDaBarra(texto);
  const sugestoes = useMemo(
    () => (termoBarra === null ? [] : filtrarRespostas(respostas.data ?? [], termoBarra)),
    [respostas.data, termoBarra]);
  const [iBarra, setIBarra] = useState(0);
  /* ⚠️ Escape FECHA sem apagar o que foi digitado. Sem isto, quem escreveu "/"
     de propósito (uma data, um "e/ou") ficaria com o painel aberto por cima da
     conversa e sem saída a não ser apagar o texto. Ele se rearma sozinho na
     próxima tecla, porque o termo muda. */
  const [barraFechada, setBarraFechada] = useState(false);
  useEffect(() => { setIBarra(0); setBarraFechada(false); }, [termoBarra]);
  const barraAberta = termoBarra !== null && !barraFechada;
  /** ⚠️ COLA, nunca envia — ver a migração `20261021`. A resposta quase sempre
   *  precisa do nome do cliente ou de um ajuste, e enviar direto faria um Enter
   *  a mais mandar a frase errada para o cliente. */
  const colarResposta = (r: RespostaRapida) => { setTexto(r.corpo); setBarraFechada(true); };

  // Busca e galeria: as duas respondem "onde foi que ele mandou aquilo?" por
  // caminhos diferentes — pelo que foi escrito e pelo que foi anexado.
  const [buscando, setBuscando] = useState(false);
  const [galeria, setGaleria] = useState(false);
  // ⚠️ O achado destaca a mensagem NA TELA quando ela está carregada. Quando
  // não está (a conversa carrega 30 dias, o achado pode ser de junho), a tela
  // diz isso em vez de rolar para lugar nenhum — rolagem que não acontece é
  // indistinguível de clique que não funcionou.
  const [realce, setRealce] = useState<string | null>(null);
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
    enviarMidia.mutate({ wa_id: c.wa_id, numero_id: c.numero_id, arquivo, legenda: legenda?.trim() || undefined }, {
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
    responder.mutate({ wa_id: c.wa_id, numero_id: c.numero_id, texto: t }, {
      onSuccess: () => { setTexto(""); toast.success("Enviada"); },
      onError: (e) => toast.error((e as Error).message),
    });
  };

  return (
    <CarboCard className="flex h-full min-h-0 flex-col">
      <CarboCardContent className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        {/* ── Cabeçalho da conversa ─────────────────────────────────────────
            ⚠️ O que é do CONTATO mora no painel da direita (avatar, nome, nome
            do WhatsApp, telefone, card do pedido). Aqui ele aparece com
            `xl:hidden` — e a condição NÃO é estilo, é MEDIDA: o `PainelContato`
            é `hidden … xl:flex` e a terceira coluna do grid só existe a partir
            do `xl`. ABAIXO DE 1280 px O PAINEL NÃO EXISTE, então esconder sem a
            condição apagaria o nome do cliente em notebook de 1366 — onde não
            há painel nenhum para repeti-lo. A duplicação da queixa é só no `xl`.

            O que SOBRA em qualquer largura é o que é da CONVERSA: a janela de
            24 h, a dúvida sobre o vínculo do pedido, e as ações. */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-2.5">

          {/* No `xl` sobra aqui só o aviso de vínculo provável — e vazio é o
              estado CERTO: significa "não há dúvida sobre de que pedido é esta
              conversa". */}
          <div className="flex min-w-0 items-start gap-2.5">

            {/* Identidade do contato: só abaixo do `xl`. O painel mostra o mesmo
                avatar em 64 px, o mesmo nome e o telefone copiável. */}
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full
                            border border-carbo-green/30 bg-carbo-green/10
                            text-[11px] font-semibold uppercase text-emerald-500
                            xl:hidden">
              {inicialDe(c.cliente, c.wa_id)}
            </div>

            <div className="min-w-0">
              <div className="xl:hidden">
                <h3 className="truncate text-sm font-semibold leading-tight">
                  {c.cliente ?? c.wa_id}
                </h3>

                {/* ⚠️ O nome do WhatsApp em linha própria, e só quando existe.
                    Alguém que conhece o cliente como "advmauro166" não o
                    encontra por "Mauro Silva" — e vice-versa. */}
                {c.nome_whatsapp && (
                  <p className="truncate text-[10px] leading-tight text-muted-foreground/70">
                    no WhatsApp: {c.nome_whatsapp}
                  </p>
                )}

                {/* O número é identificador, não título: monoespaçado e mais
                    apagado que o nome. A ETAPA vem junto dele aqui; no `xl` quem
                    a mostra é o card de Pedido do painel, como subtítulo do
                    número — que é o lugar certo, porque ela é atributo do
                    PEDIDO, não do contato. */}
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

                {/* O chip neutro do pedido: abre o card sem sair da conversa.
                    Fica no bloco `xl:hidden` porque, no `xl`, o painel tem o
                    card inteiro — número, etapa e o mesmo clique. */}
                {c.bling_id != null && !vinculoProvavel && (
                  <div className="mt-1.5">
                    <button type="button" onClick={() => onVerPedido(c.bling_id!)}
                            title="Ver o pedido sem sair da conversa"
                            className="inline-flex items-center gap-1 rounded-md border bg-muted/40
                                       px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground
                                       transition-colors hover:bg-muted/70 hover:text-foreground">
                      <Package className="h-3 w-3" />
                      <span className="font-mono">#{c.bling_id}</span>
                      <Maximize2 className="h-3 w-3 opacity-60" />
                    </button>
                  </div>
                )}
              </div>

              {/* ⚠️ ESTE fica em TODA largura, e é a única coisa do pedido que
                  sobrevive no `xl`: o painel da direita NÃO diz "provável" em
                  lugar nenhum — o card dele mostra só número e etapa. O aviso
                  carrega o número de propósito ("provável" sozinho não diz
                  provável o quê) e continua abrindo o card, porque a dúvida só
                  se resolve olhando o pedido. `vinculo_exato = false` significa
                  que o pedido foi DEDUZIDO do último aviso enviado ao número,
                  não lido do `context.id` da resposta. Aproximação que se passa
                  por certeza é como alguém responde sobre o pedido errado. */}
              {vinculoProvavel && (
                <button type="button" onClick={() => onVerPedido(c.bling_id!)}
                        title="Pedido deduzido do último aviso enviado a este número, não da resposta do cliente. Confirme antes de tratar como certo."
                        className="mt-1.5 inline-flex items-center gap-1 rounded-md border
                                   border-amber-500/30 bg-amber-500/5 px-1.5 py-0.5
                                   text-[10px] font-medium text-amber-500 transition-colors
                                   hover:bg-amber-500/10 xl:mt-0">
                  <HelpCircle className="h-3 w-3 shrink-0" />
                  <span className="font-mono">#{c.bling_id}</span>
                  <span className="font-normal">· vínculo provável</span>
                  <Maximize2 className="h-3 w-3 opacity-60" />
                </button>
              )}
            </div>
          </div>

          {/* ── Lado direito: as AÇÕES da conversa e o relógio ──────────────
              Procurar, arquivos e resolver na MESMA linha: eram duas, e o
              cabeçalho ficou uma linha mais baixo sem perder nada. */}
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <div className="flex items-center gap-1">
              {/* Procurar e ver os arquivos ficam JUNTOS: as duas são a mesma
                  pergunta ("onde está aquilo?") por caminhos diferentes. */}
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0"
                      title="Procurar nesta conversa"
                      onClick={() => { setBuscando((v) => !v); setRealce(null); }}>
                <Search className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0"
                      title="Arquivos da conversa"
                      onClick={() => setGaleria(true)}>
                <Paperclip className="h-3.5 w-3.5" />
              </Button>

              {/* ⚠️ Resolver é o botão mais usado desta tela: a maioria das
                  respostas é "Ok recebido", e sem ele a única forma de tirar a
                  conversa da fila seria mandar um "de nada" ao cliente. Ele FICA
                  em toda largura — abaixo do `xl` é o único que existe. */}
              {c.estado === "precisa_resposta" ? (
                <Button size="sm" variant="outline"
                        className="h-8 gap-1.5 text-emerald-500"
                        disabled={resolver.isPending}
                        onClick={() => resolver.mutate({ wa_id: c.wa_id, numero_id: c.numero_id, status: "resolvido" }, {
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
                        /* ⚠️ Reabrir é voltar para "aberto", e não apagar a linha.
                           `aberto` não entra no ramo de decisão humana do
                           `statusEfetivo`, então o status volta a ser DERIVADO de
                           quem falou por último — que é o comportamento original. */
                        onClick={() => resolver.mutate({ wa_id: c.wa_id, numero_id: c.numero_id, status: "aberto" }, {
                          onError: (e) => toast.error((e as Error).message),
                        })}>
                  <Undo2 className="h-3.5 w-3.5" /> Reabrir
                </Button>
              ) : null}
            </div>

            {/* ⚠️ O relógio é a REGRA CENTRAL da tela, não enfeite de canto:
                texto livre só passa com a janela aberta, e ela abre quando o
                CLIENTE escreve. Markup IDÊNTICO ao de antes — badge, barra e o
                aviso de menos de 1 h —, e com o lado esquerdo mais leve ele ficou
                MAIS visível, não menos. A barra é a informação que o texto não
                dava: "23h59" e "12 min" liam-se igual. */}
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
                    onClick={() => resolver.mutate({ wa_id: c.wa_id, numero_id: c.numero_id, status: "resolvido" }, {
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
        {/* A barra de busca fica ENTRE o cabeçalho e as mensagens, empurrando
            a lista para baixo em vez de sobrepô-la: sobreposta, ela cobriria
            justamente o topo do histórico, que é para onde a pessoa olha
            enquanto lê o resultado. */}
        {buscando && (
          <BuscaNaConversa
            waId={c.wa_id}
            aoFechar={() => { setBuscando(false); setRealce(null); }}
            aoAbrir={(a) => {
              const alvo = document.getElementById(`msg-${a.wamid}`);
              if (alvo) {
                alvo.scrollIntoView({ block: "center", behavior: "smooth" });
                setRealce(a.wamid);
              } else {
                // ⚠️ DIZ que não está carregada em vez de não fazer nada. A
                // conversa na tela é de 30 dias; achado de junho não tem para
                // onde rolar, e clique sem efeito lê-se como botão quebrado.
                setRealce(null);
                toast.info(`Mensagem de ${fmtDataHora(a.ocorrido_em)} — fora do período carregado na tela.`);
              }
            }}
          />
        )}

        {galeria && <GaleriaDaConversa waId={c.wa_id} aoFechar={() => setGaleria(false)} />}

        <div className="min-h-0 flex-1 overflow-y-auto px-0.5 pb-1 pr-1">
          {(() => {
            const linhas = montarLinhaDoTempo(c.mensagens, notas.data ?? []);
            // ⚠️ "Peça para reenviar" UMA vez, na mensagem não entregue mais
            // RECENTE. Repetir a instrução em cada linha não faz ninguém pedir
            // mais de uma vez — faz parar de ler, que é a doença do sininho
            // com 70 itens não lidos.
            const ultimoNaoEntregue = [...linhas].reverse()
              .find((l) => l.kind === "msg" && l.m.tipo === "unsupported");
            const alvo = ultimoNaoEntregue && ultimoNaoEntregue.kind === "msg"
              ? ultimoNaoEntregue.m.wamid : null;
            return linhas.map((l) =>
              l.kind === "dia"
                ? <SeparadorDeDia key={l.chave} rotulo={l.rotulo} />
                : l.kind === "nota"
                  ? <Recado key={l.n.id} n={l.n}
                            apagar={() => apagarNota.mutate({ id: l.n.id, wa_id: c.wa_id })} />
                  : <div key={l.m.wamid} id={`msg-${l.m.wamid}`}
                         className={realce === l.m.wamid
                           ? "rounded-lg ring-2 ring-carbo-green/60 transition-shadow"
                           : undefined}>
                      <Balao m={l.m} primeira={l.primeira} ultima={l.ultima}
                             mostrarComoReenviar={l.m.wamid === alvo} />
                    </div>,
            );
          })()}
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
              placeholder="Recado para o time…" rows={3} maxLength={2000}
              className="resize-y border-0 bg-transparent px-1 py-0.5 text-xs shadow-none
                         focus-visible:ring-0 focus-visible:ring-offset-0"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); anotarAgora(); }
              }}
            />
            <div className="mt-1.5 flex items-center justify-between gap-2 border-t
                            border-amber-500/20 pt-1.5">
              {/* ⚠️ Este é o aviso que FICA, porque está colado no botão: é aqui
                  que acontece o clique irreversível. O `placeholder` dizia a
                  mesma coisa e desaparece na primeira tecla; a aba selecionada
                  já diz "Recado interno" com o olho cortado. Ficou a metade que
                  diz a CONSEQUÊNCIA — "só o time vê" é a mesma frase na voz
                  passiva. */}
              <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <EyeOff className="h-3 w-3 shrink-0" />
                não vai para o WhatsApp
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
            {barraAberta && (
              <PainelDaBarra itens={sugestoes} indice={iBarra} aoEscolher={colarResposta} />
            )}
            <Textarea
              value={texto} onChange={(e) => setTexto(e.target.value)}
              placeholder="Responder…" rows={3} maxLength={4096}
              className="resize-y border-0 bg-transparent px-1 py-0.5 text-xs shadow-none
                         focus-visible:ring-0 focus-visible:ring-offset-0"
              onKeyDown={(e) => {
                /* ⚠️ A barra vem ANTES do envio. Com o painel aberto o campo tem
                   só `/frete` escrito: Ctrl+Enter ali mandaria "/frete" para o
                   cliente, que é a pior coisa que este recurso poderia fazer. */
                if (barraAberta) {
                  if (e.key === "Escape") { e.preventDefault(); setBarraFechada(true); return; }
                  if (sugestoes.length > 0) {
                    if (e.key === "ArrowDown") {
                      e.preventDefault(); setIBarra((i) => (i + 1) % sugestoes.length); return;
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setIBarra((i) => (i - 1 + sugestoes.length) % sugestoes.length); return;
                    }
                    /* Enter SOZINHO escolhe. Aqui ele não conflita com o envio,
                       que é Ctrl+Enter — e nem com a quebra de linha, porque
                       ninguém quebra linha no meio de um `/atalho`. */
                    if (e.key === "Enter") {
                      e.preventDefault(); colarResposta(sugestoes[iBarra]); return;
                    }
                  }
                }
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); enviar(); }
              }}
            />
            <div className="mt-1.5 flex items-center justify-between gap-2 border-t pt-1.5">
              {/* ⚠️ Ficaram os DOIS atalhos que ninguém descobre sozinho: a barra
                  `/` e o colar de print. O `⌘/Ctrl + ↵` saiu daqui e virou o
                  `title` do botão Enviar — ele é convenção de qualquer caixa de
                  texto, e com o mesmo peso dos outros dois roubava a atenção de
                  quem precisava ser anunciado. Três dicas com o mesmo peso é
                  nenhuma dica.
                  ⚠️ O que NÃO pode sair: recurso que só existe para quem foi
                  avisado é recurso que metade do time nunca usa — e aqui o custo
                  disso é a frase ser redigitada diferente a cada vez, que é o
                  problema inteiro. O `/` vem na frente por ser o de maior uso. */}
              <div className="flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground/70">
                <kbd className="rounded border bg-background px-1 py-px font-mono text-[10px]">/</kbd>
                <span className="shrink-0">resposta pronta</span>
                <span className="mx-0.5 shrink-0 text-muted-foreground/40">·</span>
                <kbd className="shrink-0 rounded border bg-background px-1 py-px font-sans text-[10px]">⌘/Ctrl</kbd>
                <span className="shrink-0" aria-hidden="true">+</span>
                <kbd className="shrink-0 rounded border bg-background px-1 py-px font-sans text-[10px]">V</kbd>
                <span className="truncate">cola print</span>
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
                <GerenciadorDeRespostas lista={respostas.data ?? []} aoUsar={colarResposta} />
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
                {/* ⚠️ O atalho de envio mora AQUI, no `title`, e não mais na
                    barra de dicas: é nesta tecla que a pessoa olha quando se
                    pergunta como manda. */}
                <Button size="sm" className="h-8 gap-1.5" title="Enviar — ⌘/Ctrl + Enter"
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
                          agendar.mutate({ wa_id: c.wa_id, numero_id: c.numero_id, texto: texto.trim(), enviar_em: iso }, {
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
 * A linha da lista de conversas.
 *
 * ⚠️ `memo` com comparador EXPLÍCITO, nunca o raso. O raso não serviria aqui:
 * o `useConversas` remonta as conversas a cada refetch e a cada evento do
 * Realtime, devolvendo OBJETOS NOVOS com o mesmo conteúdo — `prev.c !== next.c`
 * seria sempre verdade, e as 241 linhas se redesenhariam inteiras a cada
 * mensagem que chega e a cada tecla digitada na busca.
 *
 * A comparação é pelo que a linha REALMENTE desenha: campo que ela não mostra
 * pode mudar à vontade sem custar repaint nenhum.
 *
 * ⚠️ Campo NOVO na linha entra AQUI junto. Esquecer é a falha silenciosa deste
 * padrão — a linha simplesmente para de atualizar aquele dado, sem erro, e o
 * sintoma (um nome velho na lista e o certo dentro da conversa) parece defeito
 * de cache do banco.
 */
/**
 * O card do pedido — O MESMO da Esteira, aberto aqui dentro.
 *
 * Quem atende quase sempre precisa ver o pedido antes de responder. Antes, o
 * chip mandava para `/ecommerce/esteira` e a pessoa tinha de achar o card no
 * meio do quadro — e nem isso acontecia: o link ia com `?pedido=`, e a Esteira
 * só lê `?card=`. Ela abria na home do quadro e o card não abria, sem erro
 * nenhum. É a armadilha que já estava escrita no CLAUDE.md, cometida de novo.
 *
 * ⚠️ Mas trocar o nome do parâmetro NÃO era a correção certa: mandar quem está
 * atendendo para outra tela é convite a abandonar o atendimento pela metade, e
 * a volta depende de um `?voltar=` que só a Esteira sabe montar. O card vem
 * para cá.
 *
 * ⚠️ E é o componente `Detalhe` da PRÓPRIA Esteira, importado, nunca uma
 * segunda versão dele. Duas cópias divergiriam em silêncio — a doença do
 * `quotePdf.ts` do `mkt`, que passou meses mostrando outro PDF e ninguém viu,
 * porque divergir não dá erro: dá dois cards diferentes sobre o mesmo pedido.
 */
function CardDoPedido({ blingId, onClose }: { blingId: number; onClose: () => void }) {
  const { data: row, isLoading, error } = useEsteiraPedido(blingId);
  const { data: avisos } = useAvisosDoPedido([blingId]);
  const { data: templates } = useTemplatesMsg();
  /* Um código só, e só depois que a linha chegou — `useRastreios` já sai
     desligado com a lista vazia. */
  const { data: mapaRastreio } = useRastreios(row?.rastreio ? [row.rastreio] : []);

  if (row) {
    return (
      <Detalhe row={row} rastreio={row.rastreio ? mapaRastreio?.get(row.rastreio) : undefined}
               avisos={avisos} templates={templates} onClose={onClose} />
    );
  }

  /* ⚠️ Carregando, erro e "não está na esteira" são TRÊS respostas, e a tela
     diz qual é. Colapsá-las num diálogo vazio repetiria o defeito que acabou
     de ser corrigido: o clique "não faz nada", e quem clicou não sabe se o
     pedido sumiu, se a consulta falhou ou se é para esperar. */
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="w-[min(28rem,calc(100vw-2rem))] max-w-none">
        <DialogHeader>
          <DialogTitle className="font-mono text-base">#{blingId}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <p className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando o pedido…
          </p>
        ) : error ? (
          <p className="flex items-start gap-1.5 py-4 text-xs text-red-500">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
            Não consegui carregar: {(error as Error).message}
          </p>
        ) : (
          <div className="py-4 text-xs text-muted-foreground">
            <p className="flex items-start gap-1.5 text-amber-500">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              Este pedido não está na Esteira do On-line.
            </p>
            {/* ⚠️ Dizer POR QUÊ, porque os motivos pedem ações diferentes: o
                aviso é gravado com o `bling_id` no instante do envio, e o
                pedido pode ter saído da esteira depois (venda de balcão, que a
                esteira não mostra) ou nunca ter chegado ao Bling. */}
            <p className="mt-2 leading-relaxed text-muted-foreground/80">
              O aviso foi enviado com este número, então ele existiu. Ou a venda
              não é de canal on-line — a esteira só mostra esses —, ou o pedido
              ainda não chegou ao Bling.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const LinhaDaConversa = memo(function LinhaDaConversa({ c, selecionada, comBusca, onAbrir }: {
  c: Conversa; selecionada: boolean; comBusca: boolean; onAbrir: (wa_id: string) => void;
}) {
  const nivelC = nivelDaJanela(c.janela_ate);
  const tomC = TOM_JANELA[nivelC];
  const abertoC = janelaAberta(c.janela_ate);
  /* "Não respondida" engrossa nome e prévia — a mesma gramática do WhatsApp.
     Sai de `aguardando`, que já é a conta do banco. */
  const naoRespondida = c.aguardando > 0;
  /* ⚠️ O segundo nome só aparece com BUSCA ativa: é ele que explica por que a
     linha casou (a busca olha os dois nomes). Fora da busca era uma terceira
     linha permanente para um dado que o cabeçalho da conversa já mostra. */
  const mostrarApelido = comBusca && !!c.nome_whatsapp;

  return (
    <button type="button" onClick={() => onAbrir(c.wa_id)}
            className={`relative w-full border-b border-border/60 px-3 py-2.5 text-left
                        transition-colors last:border-b-0 ${
              selecionada
                ? "bg-muted/60 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-carbo-green before:content-['']"
                : "hover:bg-muted/30"}`}>
      <div className="flex items-start gap-3">

        {/* Avatar NEUTRO. A borda colorida por nível saiu: era a segunda cópia
            do relógio, que muda de cor logo ao lado.

            ⚠️ E continua sendo INICIAL, não foto. A Cloud API oficial não tem
            endpoint para a foto de perfil do cliente — só para a do nosso
            próprio número. */}
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center
                         rounded-full border border-border bg-muted/60
                         text-[13px] font-semibold uppercase text-muted-foreground">
          {inicialDe(c.cliente, c.wa_id)}
        </span>

        {/* ⚠️ NÃO existe mais trilho direito. A hora morava numa coluna fixa à
            direita, e ela custava aquela largura em TODA linha — inclusive nas
            que não tinham nada para pôr ali. Com a hora aqui dentro, no topo,
            os chips de baixo ganharam a faixa inteira e pararam de quebrar em
            duas linhas. É o desenho do pacote do /atendimento, e o motivo é o
            mesmo: numa coluna de 320px, coluna fixa é largura que some. */}
        <div className="min-w-0 flex-1">

          {/* ── Nome · relógio da janela · hora ─────────────────────────────
              ⚠️ São DOIS tempos e eles não são a mesma coisa: `faltaDaJanela` é
              quanto ainda dá para responder (some quando fecha, e vira
              cadeado); `hora` é quando foi a última mensagem. Confundi-los faz
              alguém achar que tem seis horas para responder uma conversa de
              ontem. */}
          <div className="flex items-baseline gap-1.5">
            <span className={`min-w-0 truncate text-[13px] leading-tight ${
              naoRespondida ? "font-semibold text-foreground"
                            : "font-medium text-foreground/90"}`}>
              {c.cliente ?? c.wa_id}
            </span>

            {abertoC ? (
              /* ⚠️ `folgada` fica CINZA, não verde: trinta relógios verdes
                 ensinam a ignorar a cor justamente antes de ela ficar
                 vermelha. Os cortes continuam sendo os do `nivelDaJanela` —
                 muda o destaque, não a regra. */
              <span title={`Janela de 24 h fecha em ${faltaDaJanela(c.janela_ate)}`}
                    className={`shrink-0 text-[10px] leading-none tabular-nums ${
                      nivelC === "folgada" ? "text-muted-foreground/70"
                                           : `${tomC.texto} font-semibold`}`}>
                {faltaDaJanela(c.janela_ate)}
              </span>
            ) : (
              /* Fechada: cadeado, não pastilha. Pastilha grande em dois terços
                 das linhas destacava justamente onde não há ação possível. */
              <Lock className="h-3 w-3 shrink-0 self-center text-muted-foreground/50"
                    aria-label="Janela de 24 h fechada" />
            )}

            <span className="ml-auto shrink-0 text-[10px] leading-none tabular-nums
                             text-muted-foreground/60">
              {hora(c.ultima_em)}
            </span>
          </div>

          {/* Prévia. `truncate` mora no span interno: num flex ele não funciona
              no contêiner. */}
          <p className={`mt-0.5 flex min-w-0 items-center gap-1 text-xs leading-snug ${
            naoRespondida ? "text-foreground/75" : "text-muted-foreground"}`}>
            {c.parece_encerrada && (
              <Sparkles className="h-3 w-3 shrink-0 text-emerald-500"
                        aria-label="Parece só um agradecimento" />
            )}
            {c.ultima_direcao === "saida" && (
              <span className="shrink-0 text-muted-foreground/60">você:</span>
            )}
            {/* ⚠️ A prévia diz o que É, não "(arquivo)" para tudo que tem texto
                nulo. `unsupported` não tem arquivo — a Meta não entregou nada —,
                e prometer um anexo faz alguém abrir a conversa procurando o que
                não existe. */}
            <span className="truncate">
              {c.ultima_texto
                ?? (c.ultima_tipo === "unsupported"
                      ? "(não entregue pelo WhatsApp)"
                      : `(${(NOME_MIDIA[c.ultima_tipo] ?? "arquivo").toLowerCase()})`)}
            </span>
          </p>

          {/* ── Qualificadores: estado, etiqueta, dono e o contador ──────────
              ⚠️ Esta faixa QUEBRA linha, nunca recorta. Já foi `overflow-hidden`
              com tudo `shrink-0`, e o que não coubesse era cortado no MEIO —
              sobrava um `;` ou um `(` solto no fim, dado pela metade parecendo
              sujeira de render. Quem caía fora era sempre o último, e o último
              era o DONO, que é justamente o que diz se a conversa precisa de
              alguém. */}
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
            {/* ⚠️ O ESTADO vem primeiro: ele diz se esta linha precisa de alguém
                agora. Etiqueta e dono dizem quem é a pessoa.

                E em caixa NORMAL. "EM ATENDIMENTO" com `tracking-wide` media
                ~110px de uma coluna de 320 e sozinho empurrava o dono para uma
                segunda linha; a caixa alta existia para o chip competir com o
                nome quando ele morava à direita. Aqui embaixo ele não precisa
                gritar. */}
            {c.status && (
              <span className={`shrink-0 whitespace-nowrap rounded-full border px-1.5
                                text-[10px] font-medium leading-[15px]
                                ${STATUS[c.status].classe}`}>
                {STATUS[c.status].rotulo}
              </span>
            )}

            {mostrarApelido && (
              <span className="min-w-0 truncate text-[10px] text-muted-foreground/60">
                no WhatsApp: {c.nome_whatsapp}
              </span>
            )}

            {c.tags.slice(0, 1).map((t) => (
              /* ⚠️ A ETIQUETA é quem encolhe, não o dono: entre os dois, o dono
                 é o que diz se a linha precisa de alguém. */
              <span key={t.id}
                    className={`min-w-0 max-w-[6.5rem] truncate rounded-full border
                                px-1.5 py-px text-[9px] leading-[14px] ${
                      COR_TAG[t.cor] ?? COR_TAG.cinza}`}>
                {t.nome}
              </span>
            ))}
            {c.tags.length > 1 && (
              <span className="shrink-0 text-[9px] text-muted-foreground/60">
                +{c.tags.length - 1}
              </span>
            )}

            {c.responsavel_nome ? (
              <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground/70">
                <UserCheck className="h-3 w-3" />
                {c.responsavel_nome.split(" ")[0]}
              </span>
            ) : (
              /* ⚠️ "sem dono" é DITO, não deixado em branco. Campo vazio se lê
                 como "não carregou"; o que ele significa aqui é que ninguém
                 assumiu — trabalho parado, e o único estado desta linha sobre o
                 qual dá para agir sem abrir a conversa. */
              <span className="shrink-0 rounded border border-dashed border-border px-1
                               text-[9px] leading-[14px] text-muted-foreground/60">
                sem dono
              </span>
            )}

            {/* ⚠️ `ml-auto`: o contador vai para a ponta da faixa, não para o
                fim dos chips. Ele é o único número da linha e precisa cair
                sempre na mesma coluna — no meio do fluxo, obriga a reler linha
                a linha para achá-lo.

                E ele substitui o "N sem resposta" E o antigo badge "✓
                resolvida": círculo cheio já se lê sem legenda, e o chip de
                estado ao lado já nomeia o resto. Três sinais para o mesmo fato
                era o que deixava a linha ilegível. */}
            {naoRespondida && (
              <span className="ml-auto flex h-[1.1rem] min-w-[1.1rem] items-center justify-center
                               rounded-full bg-amber-500 px-1 text-[10px] font-semibold
                               leading-none tabular-nums text-background">
                {c.aguardando}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}, (a, b) =>
  a.selecionada === b.selecionada
  && a.comBusca === b.comBusca
  && a.onAbrir === b.onAbrir
  && a.c.wa_id === b.c.wa_id
  && a.c.cliente === b.c.cliente
  && a.c.nome_whatsapp === b.c.nome_whatsapp
  && a.c.ultima_em === b.c.ultima_em
  && a.c.ultima_texto === b.c.ultima_texto
  && a.c.ultima_tipo === b.c.ultima_tipo
  && a.c.ultima_direcao === b.c.ultima_direcao
  && a.c.aguardando === b.c.aguardando
  && a.c.janela_ate === b.c.janela_ate
  && a.c.status === b.c.status
  && a.c.responsavel_nome === b.c.responsavel_nome
  && a.c.parece_encerrada === b.c.parece_encerrada
  && a.c.tags.map((t) => t.id).join("\u0000") === b.c.tags.map((t) => t.id).join("\u0000"));

/**
 * O painel do contato — a FONTE ÚNICA de quem é esta pessoa, e o que fazer com
 * esta conversa.
 *
 * ⚠️ Identidade e pedido moram AQUI, e por isso o cabeçalho da conversa não os
 * repete no `xl`. Nome, apelido do WhatsApp, telefone, estado e número do pedido
 * apareciam nos DOIS lugares — e informação duplicada em duas pilhas é
 * informação que divergiu no dia em que alguém mexeu numa delas. A regra é a
 * mesma do `quotePdf.ts` e da `bling2_esteira`: um lugar decide, o resto lê.
 *
 * ⚠️ E a condição de largura NÃO é estilo: este painel é `hidden … xl:flex` e a
 * terceira coluna do grid só existe a partir do `xl`. ABAIXO DE 1280 px ELE NÃO
 * EXISTE — por isso o cabeçalho esconde a identidade com `xl:hidden` em vez de
 * apagá-la, senão o nome do cliente sumiria em notebook de 1366.
 *
 * ⚠️ A ordem não é estética: identidade → ação → etiquetas → pedido. Quem abre o
 * painel está fazendo uma destas três coisas, nesta frequência: conferir com
 * quem está falando, mudar o estado do atendimento, ou achar o pedido. O PEDIDO
 * fica por último de propósito — ele leva para OUTRA tela, e o que leva embora
 * não pode ficar no caminho de quem ainda está atendendo.
 *
 * ⚠️ E NÃO há cabeçalho de seção em caixa alta. Havia QUATRO (`ATENDIMENTO`,
 * `RESPONSÁVEL`, `ETIQUETAS`, `PEDIDO`) para um a três controles cada, mais uma
 * caixa com borda dentro da primeira: mais moldura que conteúdo, e foi o que o
 * dono do processo chamou de "informação demais". Hoje quem separa é o
 * agrupamento — uma caixa para o que exige AÇÃO, e o resto em fluxo.
 *
 * ⚠️ O telefone fica GRANDE e selecionável, e NÃO é formatado: ele é o que se
 * copia para procurar no Bling, e máscara com espaços sobrevive à cópia e vira
 * busca que não acha. Por isso continuam existindo as DUAS coisas — o
 * `select-all` e o botão de copiar —, e o número NÃO virou um botão só:
 * envolvê-lo num `<button>` mataria a seleção à mão, que é o caminho que
 * funciona quando a API de clipboard é recusada (sem HTTPS, sem permissão) e
 * falha calada.
 *
 * ⚠️ Os botões de estado continuam sendo DOIS, e são os dois que uma pessoa
 * decide. `aberto` e `em_atendimento` saem de quem falou por último
 * (`statusEfetivo`, em `lib/conversas.ts`) e NÃO podem ganhar botão — status
 * manual brigando com a realidade é a doença conhecida dessas ferramentas, e
 * produz fila em que ninguém confia.
 */
function PainelContato({ c, meuId, onVerPedido }: {
  c: Conversa; meuId: string | null; onVerPedido: (blingId: number) => void;
}) {
  const definirStatus = useDefinirStatus();
  const definirResponsavel = useDefinirResponsavel();
  const marcarTag = useMarcarTag();
  const criarTag = useCriarTag();
  const { data: atendentes } = useAtendentes();
  const { data: tags } = useTags();
  const [novaTag, setNovaTag] = useState("");
  const [verTags, setVerTags] = useState(false);
  /* ⚠️ O seletor de responsável é o caminho DE EXCEÇÃO e fica fechado. Ele e o
     botão "Assumir" eram dois controles de largura cheia, empilhados, para a
     MESMA decisão — e o dropdown dizia "— sem responsável —" ao lado de um botão
     que dizia "Assumir esta conversa". Aberto só sob demanda, o repouso tem um
     gesto só e o rótulo "Passar para" devolve sentido único ao `Sem
     responsável`, que é a opção de REMOVER o dono, não o estado da conversa. */
  const [verResponsavel, setVerResponsavel] = useState(false);

  const minhas = new Set(c.tags.map((t) => t.id));
  const souEu = !!meuId && c.responsavel === meuId;
  const disponiveis = (tags ?? []).filter((t) => !minhas.has(t.id));

  /* ⚠️ Só quando ACRESCENTA. Imprimir o mesmo nome duas vezes gasta uma linha e
     faz o painel parecer com defeito. */
  const outroNome =
    c.nome_whatsapp && c.nome_whatsapp !== c.cliente ? c.nome_whatsapp : null;

  /* O primeiro nome de quem já atende, para o BOTÃO poder dizer de quem se está
     assumindo. Sem isso, com o seletor fechado, o painel em repouso não diria o
     nome do dono em lugar nenhum — e "quem está com isto" é a pergunta que faz
     alguém assumir ou não. Primeiro nome só, como na lista da esquerda: o nome
     inteiro estoura um controle de ~16rem e sai cortado. */
  const donoPrimeiroNome = c.responsavel_nome
    ? c.responsavel_nome.trim().split(" ")[0]
    : null;

  const criar = () => {
    if (!novaTag.trim()) return;
    criarTag.mutate({ nome: novaTag, cor: "cinza" }, {
      onSuccess: (t) => {
        setNovaTag("");
        marcarTag.mutate({ wa_id: c.wa_id, numero_id: c.numero_id, tag_id: t.id, marcar: true });
      },
      onError: (err) => toast.error((err as Error).message),
    });
  };

  /* Copiar COMPLEMENTA a seleção, não substitui: sem HTTPS ou sem permissão a
     API falha calada, e o `select-all` continua sendo o caminho. */
  const copiarNumero = () => {
    navigator.clipboard?.writeText(c.wa_id)
      .then(() => toast.success("Número copiado"))
      .catch(() => toast.error("Não consegui copiar — selecione e copie à mão."));
  };

  return (
    <CarboCard className="hidden min-h-0 xl:flex xl:flex-col">
      <CarboCardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto p-0">

        {/* ── Identidade ──────────────────────────────────────────────────
            ⚠️ `sticky`: o painel rola quando a conversa tem muitas etiquetas, e
            o número é justamente o que se quer alcançar em qualquer ponto da
            rolagem.

            ⚠️ E ALINHADA À ESQUERDA, não centralizada. Centralizado, o avatar de
            64px mais nome, apelido, telefone e selo empilhados consumiam ~190px
            de altura antes do primeiro botão — as ações caíam abaixo da dobra em
            telas de 768px, que é o que o comentário antigo deste componente
            prometia evitar e o layout fazia. Avatar de 44px ao lado do nome
            custa 44px e diz a mesma coisa. */}
        <div className="sticky top-0 z-10 space-y-2 border-b border-border
                        bg-background/95 px-4 pb-3 pt-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center
                             rounded-full border border-carbo-green/30 bg-carbo-green/5
                             text-[15px] font-semibold uppercase text-carbo-green">
              {inicialDe(c.cliente, c.wa_id)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold leading-tight">
                {c.cliente ?? "Sem nome"}
              </p>
              {outroNome && (
                <p className="truncate text-[11px] leading-tight text-muted-foreground">
                  no WhatsApp: {outroNome}
                </p>
              )}
            </div>
          </div>

          {/* O telefone como OBJETO de cópia: pílula + botão. Sem máscara, porque
              é ele que se cola na busca do ERP. ⚠️ A pílula NÃO é um botão (ver o
              doc acima): o `select-all` tem de continuar funcionando. */}
          <div className="flex items-center gap-1 rounded-md border border-border
                          bg-muted/40 px-2 py-1">
            <span className="min-w-0 flex-1 select-all font-mono text-[15px]
                             tracking-tight tabular-nums text-foreground">
              {c.wa_id}
            </span>
            <button type="button" onClick={copiarNumero} title="Copiar número"
                    aria-label="Copiar número"
                    className="shrink-0 rounded-sm p-1 text-muted-foreground
                               transition-colors hover:text-carbo-green">
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="space-y-3 px-4 pb-4">

          {/* ── O que exige AÇÃO ────────────────────────────────────────────
              Uma caixa, sem cabeçalho. Ela era uma seção com título em caixa
              alta MAIS uma caixa com borda por dentro MAIS um segundo título em
              caixa alta para o responsável: três molduras para quatro controles.
              O que diz "isto é acionável" é o fundo, não o texto. */}
          <div className="space-y-2.5 rounded-lg border border-border bg-muted/40 p-3">

            {/* ⚠️ O estado é a PRIMEIRA linha da caixa de ação, e não um selo
                solto junto da identidade. Colado nos botões, ele lê como "é
                isto, e aqui se muda"; colado no nome, lia como um terceiro
                atributo do contato — e o contato não tem estado, a conversa tem.

                ⚠️ E status nulo é DITO. Em branco ele ficava igual a "não
                carregou"; "Sem pendência" é o mesmo rótulo que o agrupamento da
                lista já usa para `status === null`, então os dois contam a mesma
                história. */}
            <div className="flex items-center">
              {c.status ? (
                <span className={`inline-flex items-center rounded-md border px-2 py-0.5
                                  text-[10px] font-medium ${STATUS[c.status].classe}`}>
                  {STATUS[c.status].rotulo}
                </span>
              ) : (
                <span className="inline-flex items-center rounded-md border border-dashed
                                 border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                  Sem pendência
                </span>
              )}
            </div>

            {/* ⚠️ Só DOIS botões, e são os dois status que uma pessoa decide.
                "Aberto" e "Em atendimento" não têm botão de propósito: eles saem
                de quem falou por último, e um botão para eles seria um jeito de
                mentir para a própria fila. */}
            <div className="grid grid-cols-2 gap-1.5">
              <Button size="sm" variant={c.status === "aguardando" ? "default" : "outline"}
                      className="h-9 w-full gap-1.5 text-[11px]"
                      disabled={definirStatus.isPending}
                      onClick={() => definirStatus.mutate(
                        { wa_id: c.wa_id, numero_id: c.numero_id, status: c.status === "aguardando" ? "aberto" : "aguardando" },
                        { onError: (e) => toast.error((e as Error).message) })}>
                <Clock className="h-3.5 w-3.5" />
                {c.status === "aguardando" ? "Retomar" : "Aguardando"}
              </Button>
              <Button size="sm" variant={c.status === "resolvido" ? "default" : "outline"}
                      className="h-9 w-full gap-1.5 text-[11px]"
                      disabled={definirStatus.isPending}
                      onClick={() => definirStatus.mutate(
                        { wa_id: c.wa_id, numero_id: c.numero_id, status: c.status === "resolvido" ? "aberto" : "resolvido" },
                        { onError: (e) => toast.error((e as Error).message) })}>
                {c.status === "resolvido"
                  ? <><Undo2 className="h-3.5 w-3.5" /> Reabrir</>
                  : <><CheckCheck className="h-3.5 w-3.5" /> Resolver</>}
              </Button>
            </div>

            {/* ── Responsável: UM gesto, e o resto atrás do `⌄` ──────────────
                ⚠️ Em time pequeno, puxar da fila é o modelo certo — rodízio
                automático atribui conversa para quem está almoçando, e ninguém
                mais mexe porque "já tem dono". Quando JÁ sou eu, o lugar não
                fica vazio: o buraco de 28px era o que fazia o cartão parecer
                desmontado.

                ⚠️ E quando o dono é OUTRA pessoa, o nome dela vai DENTRO do
                botão ("Assumir de Maria"). Com o seletor fechado, era ali que o
                nome do dono deixaria de aparecer — e "quem está com isto" é
                justamente a pergunta que decide se alguém assume. */}
            <div className="flex items-center gap-1.5">
              {souEu ? (
                <p className="flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5
                              rounded-md border border-carbo-green/30 bg-carbo-green/5
                              px-2 text-[11px] font-medium text-carbo-green">
                  <Check className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Você é o responsável</span>
                </p>
              ) : (
                <Button size="sm" variant="outline"
                        className="h-9 min-w-0 flex-1 gap-1.5 border-carbo-green/40
                                   text-[11px] text-carbo-green hover:bg-carbo-green/5
                                   hover:text-carbo-green"
                        disabled={definirStatus.isPending}
                        title={donoPrimeiroNome
                          ? `Assumir esta conversa de ${c.responsavel_nome}`
                          : "Assumir esta conversa"}
                        onClick={() => definirStatus.mutate(
                          { wa_id: c.wa_id, numero_id: c.numero_id, status: "em_atendimento", assumir: true },
                          { onError: (e) => toast.error((e as Error).message) })}>
                  <UserCheck className="h-3.5 w-3.5 shrink-0" />
                  {/* ⚠️ "Assumir esta conversa" NÃO cabe: renderizado, saía
                      "Assumir esta con…" ao lado do `⌄`, que lê como tela
                      quebrada. O rótulo curto cabe inteiro e o `title` guarda a
                      frase — e quando há dono, o NOME é a parte que não pode
                      sumir, porque é ela que decide se alguém assume. */}
                  <span className="truncate">
                    {donoPrimeiroNome ? `Assumir de ${donoPrimeiroNome}` : "Assumir"}
                  </span>
                </Button>
              )}

              <button type="button" onClick={() => setVerResponsavel((v) => !v)}
                      aria-expanded={verResponsavel}
                      title="Passar para outra pessoa"
                      aria-label="Passar para outra pessoa"
                      className={`flex h-9 w-9 shrink-0 items-center justify-center
                                  rounded-md border border-border transition-colors ${
                        verResponsavel ? "bg-muted/60 text-foreground"
                                       : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"}`}>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${
                  verResponsavel ? "rotate-180" : ""}`} />
              </button>
            </div>

            {verResponsavel && (
              /* ⚠️ `Sem responsável` é a opção de REMOVER o dono, e só faz
                 sentido sob este rótulo. Em repouso, no campo fechado, ela se
                 lia como o estado da conversa ao lado de um botão "Assumir" —
                 dois controles dizendo a mesma coisa, que é a queixa que este
                 desenho responde. */
              <div className="flex items-center gap-2 border-t border-border pt-2.5">
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  Passar para
                </span>
                <select
                  value={c.responsavel ?? ""}
                  disabled={definirResponsavel.isPending}
                  onChange={(e) => {
                    const id = e.target.value || null;
                    const nome = (atendentes ?? []).find((a) => a.user_id === id)?.full_name ?? null;
                    definirResponsavel.mutate({ wa_id: c.wa_id, numero_id: c.numero_id, user_id: id, nome },
                      { onError: (err) => toast.error((err as Error).message) });
                    setVerResponsavel(false);
                  }}
                  className="h-9 min-w-0 flex-1 rounded-md border border-border
                             bg-background px-2 text-[11px] text-foreground
                             disabled:opacity-60">
                  <option value="">Sem responsável</option>
                  {(atendentes ?? []).map((a) => (
                    <option key={a.user_id} value={a.user_id}>{a.full_name ?? a.user_id}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* ── Etiquetas: os CHIPS são o rótulo ────────────────────────────
              O cabeçalho `ETIQUETAS` saiu: um chip colorido com um `X` no hover
              e um botão tracejado "+ etiqueta" ao lado não precisam de legenda,
              e o ícone de etiqueta mudou do título para dentro do próprio botão
              — que é onde ele continua nomeando a coisa, inclusive quando a
              conversa não tem etiqueta nenhuma.

              Chips no repouso; formulário só sob demanda. O `X` aparece no hover
              para a área ler como informação, e não como uma fileira de botões
              de excluir. */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {c.tags.map((t) => (
                <button key={t.id} type="button" title="Tirar esta etiqueta"
                        onClick={() => marcarTag.mutate({ wa_id: c.wa_id, numero_id: c.numero_id, tag_id: t.id, marcar: false })}
                        className={`group inline-flex items-center gap-1 rounded-md border
                                    px-2 py-1 text-[11px] font-medium transition-opacity
                                    hover:opacity-80 ${COR_TAG[t.cor] ?? COR_TAG.cinza}`}>
                  {t.nome}
                  <X className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              ))}
              <button type="button" onClick={() => setVerTags((v) => !v)}
                      aria-expanded={verTags}
                      className={`inline-flex items-center gap-1 rounded-md border border-dashed
                                  border-border px-2 py-1 text-[11px] transition-colors ${
                        verTags ? "bg-muted/60 text-foreground"
                                : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"}`}>
                <TagIcon className="h-2.5 w-2.5" /> + etiqueta
              </button>
            </div>

            {verTags && (
              <div className="space-y-2 rounded-md border border-border bg-background/60 p-2">
                {disponiveis.length > 0 ? (
                  <div className="space-y-0.5">
                    {disponiveis.map((t) => (
                      <button key={t.id} type="button"
                              onClick={() => marcarTag.mutate({ wa_id: c.wa_id, numero_id: c.numero_id, tag_id: t.id, marcar: true })}
                              className="flex w-full items-center gap-2 rounded px-1.5 py-1
                                         text-left text-[11px] transition-colors hover:bg-muted/60">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full border
                                          ${COR_TAG[t.cor] ?? COR_TAG.cinza}`} />
                        <span className="truncate">{t.nome}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  /* Dizer que acabou é melhor que mostrar só o campo de criar e
                     deixar a pessoa achar que a lista não carregou. */
                  <p className="px-1 py-0.5 text-[10px] text-muted-foreground">
                    Todas as etiquetas já estão nesta conversa.
                  </p>
                )}

                {/* ⚠️ Botão ao lado do campo. Só Enter é affordance invisível:
                    quem não sabe, não cria — e aí ninguém cria etiqueta.
                    ⚠️ E o nome é digitado, mas a COR sai de paleta fechada
                    (`cinza`): `carbo_wa_tags` é tabela com cor de paleta, e
                    hexadecimal livre produz etiqueta ilegível no tema escuro. */}
                <div className="flex items-center gap-1 border-t border-border pt-2">
                  <Input value={novaTag} onChange={(e) => setNovaTag(e.target.value)}
                         placeholder="Nova etiqueta"
                         className="h-8 flex-1 border-border text-[11px]"
                         onKeyDown={(e) => {
                           if (e.key !== "Enter") return;
                           e.preventDefault();
                           criar();
                         }} />
                  <Button size="sm" variant="outline" className="h-8 shrink-0 px-2 text-[11px]"
                          disabled={!novaTag.trim() || criarTag.isPending}
                          onClick={criar}>
                    Criar
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* ── Pedido ──────────────────────────────────────────────────────
              Por último porque é o CONTEXTO, não a ação: quem abre a conversa
              vem responder, e o pedido é o que ele confere antes. ⚠️ Já foi um
              link para a Esteira, e por isso ficava aqui embaixo — sair da tela
              no meio do atendimento é como a resposta fica pela metade. Agora
              abre o card aqui mesmo, e a ordem continua certa pelo outro motivo.

              ⚠️ O cabeçalho `PEDIDO` saiu e a palavra entrou NO CARD, na mesma
              linha do número: o título ocupava uma linha inteira para rotular um
              único elemento que já traz o ícone de caixa. */}
          {c.bling_id && (
            <button type="button" onClick={() => onVerPedido(c.bling_id!)}
                    className="flex w-full items-center gap-2.5 rounded-lg border border-border
                               bg-muted/40 p-3 text-left transition-colors
                               hover:border-carbo-green/40 hover:bg-carbo-green/5">
              <Package className="h-4 w-4 shrink-0 text-carbo-green" />
              {/* ⚠️ O NÚMERO vem primeiro e SOZINHO na linha principal. Com a
                  palavra "Pedido" na frente ele saía cortado ("#26970326…") na
                  largura real do painel — e número cortado é a mesma doença do
                  dropdown do /vender que dizia só "Microdistribuidor R$ 11,50":
                  identificador pela metade não identifica nada. A palavra desceu
                  para o subtítulo, onde pode truncar sem custo.
                  ⚠️ Só apareceu RENDERIZANDO: nem o `tsc` nem o build sabem onde
                  o texto estoura. */}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-[13px] font-semibold
                                 leading-tight tabular-nums text-carbo-green">
                  #{c.bling_id}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  Pedido{c.sobre_a_etapa
                    ? ` · ${NOME_ETAPA[c.sobre_a_etapa] ?? c.sobre_a_etapa}`
                    : ""}
                </span>
              </span>
              <Maximize2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          )}
        </div>
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

  /* ── Qual NÚMERO esta caixa está mostrando ─────────────────────────────
     ⚠️ Desde 02/10/2026 o WABA tem três números (serviço, CarboZé Clube /
     recompra e carrinho), e a janela de 24 h da Meta é por PAR — nosso número
     ↔ cliente. A mesma pessoa em dois números são DUAS conversas, com janelas,
     status e etiquetas independentes. Misturá-las faria a tela oferecer texto
     livre que a Meta recusa com 131047, depois de a pessoa ter escrito a
     resposta inteira.

     ⚠️ Mora na URL, como o resto do estado desta família de telas: sem isso o
     F5 devolve a caixa do serviço com a conversa do Clube aberta, e não dá
     para mandar "olha essa conversa" para alguém. */
  const { data: numeros, error: erroNumeros, isLoading: carregandoNumeros } = useNumeros();
  const numeroDaUrl = params.get("numero");
  /* ⚠️ A reserva é o PRIMEIRO da ordem do cadastro (serviço), nunca uma
     constante aqui: número novo passa a existir com um INSERT, e um literal
     nesta linha seria mais uma cópia do cadastro. E `null` enquanto o cadastro
     não chega NÃO consulta — o hook tem `enabled`, porque consulta sem filtro
     voltaria a misturar as caixas. */
  const numeroId = numeroDaUrl
    ?? (numeros?.[0]?.phone_number_id ?? null);
  const trocarNumero = (id: string) => {
    const p = new URLSearchParams(params);
    p.set("numero", id);
    /* ⚠️ Fecha a conversa aberta: `?de=` é um `wa_id`, e o MESMO `wa_id` em
       outro número é outra conversa. Levar o parâmetro junto abriria uma
       conversa que não existe naquela caixa, ou — pior — a conversa certa da
       pessoa errada no contexto errado. */
    p.delete("de");
    setParams(p, { replace: true });
  };

  const { data: conversas, isLoading, error } = useConversas(30, numeroId);

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
  /* ⚠️ O card do pedido mora AQUI, e não dentro de cada chip: a conversa e o
     painel do contato mostram o mesmo pedido, e dois estados locais abririam
     duas janelas sobre ele. Nulo = fechado, e ele NÃO entra na URL — a URL
     desta tela guarda qual CONVERSA está aberta, e empilhar o card ali faria o
     "voltar" do navegador fechar a conversa junto. */
  const [verPedido, setVerPedido] = useState<number | null>(null);
  /* ⚠️ Abre em "Pendentes" QUANDO HÁ pendência — e em "Todas" quando não há.
     A regra original era só a primeira metade, e ela quebrou no dia em que a
     caixa cresceu: com 243 conversas e ZERO pendentes, a tela abria dizendo
     "Nenhuma conversa com esse filtro" numa caixa cheia. Quem chega não lê
     isso como "está tudo respondido" — lê como sistema fora do ar, e é a
     mesma doença do erro que se disfarça de vazio.

     A intenção continua de pé: a caixa de entrada existe para mostrar o
     TRABALHO, e o contador ao lado de cada aba diz o que há nas outras.
     `null` = ninguém escolheu ainda; quem escolhe a primeira vez é o efeito
     abaixo, uma vez só. */
  const [filtro, setFiltro] = useState<FiltroConversa | null>(null);
  const abaDecidida = useRef(false);
  const [filtros, setFiltros] = useState<TipoFiltros>(FILTROS_VAZIOS);
  const [painelFiltros, setPainelFiltros] = useState(false);
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

  /* ⚠️ UMA VEZ SÓ, e depois que a lista chegou. Sem a trava, a contagem sai de
     zero durante o carregamento, a aba seria decidida como "Todas" e trocaria
     sozinha para "Pendentes" quando o dado chegasse — a lista mudando debaixo
     do cursor de quem já começou a ler. E sem `lista.length` no teste, a caixa
     legitimamente vazia congelaria a decisão no instante errado. */
  useEffect(() => {
    if (abaDecidida.current || isLoading || lista.length === 0) return;
    abaDecidida.current = true;
    setFiltro(contagens.pendentes > 0 ? "pendentes" : "todas");
  }, [isLoading, lista.length, contagens.pendentes]);

  /* Antes de a decisão acontecer a tela mostra TODAS — nunca uma aba que pode
     estar vazia. Vazio no primeiro quadro é indistinguível de tela quebrada. */
  const aba: FiltroConversa = filtro ?? "todas";

  const filtradas = useMemo(() => {
    const termo = busca.trim();
    const alvoTexto = normalizar(termo);
    const alvoNumero = soDigitos(termo);
    return lista.filter((c) => {
      if (aba === "pendentes" && c.status !== "aberto") return false;
      if (aba === "minhas" && c.responsavel !== meuId) return false;
      // ⚠️ Resolvida sem dono não é trabalho parado: ela sairia como "ninguém
      // pegou" e encheria a aba de conversa encerrada.
      if (aba === "sem_dono" && (c.responsavel || c.status === "resolvido")) return false;
      if (aba === "aberta" && !janelaAberta(c.janela_ate)) return false;
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
  }, [lista, busca, aba, meuId]);

  /* ⚠️ Os filtros entram DEPOIS da aba e da busca, e a ordem importa: a aba diz
     DE QUE FILA a pessoa está tratando, a busca é a pergunta pontual, o filtro
     é o recorte dentro dela. Aplicá-los antes faria a contagem das abas — que
     mede a caixa INTEIRA — deixar de bater com o que a lista mostra, e o placar
     viraria decoração. */
  const visiveis = useMemo(
    () => aplicarFiltrosDaCaixa(filtradas, filtros), [filtradas, filtros]);
  const filtrosAtivos = quantosFiltrosAtivos(filtros);

  /* As opções saem do que EXISTE nas conversas carregadas, nunca de uma lista
     fixa: etiqueta que ninguém usou não deve aparecer para ser escolhida e
     devolver zero — opção que só leva a lista vazia é a doença do relatório
     que discorda para sempre do que o sistema faz. */
  const opcoesResponsavel = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of lista) if (c.responsavel) m.set(c.responsavel, c.responsavel_nome ?? "sem nome");
    return [...m].map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [lista]);
  const opcoesTag = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of lista) for (const t of c.tags) m.set(t.id, t.nome);
    return [...m].map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [lista]);
  const opcoesEtapa = useMemo(() => {
    const vistas = new Set<string>();
    for (const c of lista) if (c.sobre_a_etapa) vistas.add(c.sobre_a_etapa);
    // Ordem da ESTEIRA, não alfabética: "A caminho" antes de "Entregue" é como
    // quem atende pensa o pedido.
    return Object.keys(NOME_ETAPA).filter((k) => vistas.has(k));
  }, [lista]);

  /* O cabeçalho é o placar da caixa INTEIRA, não da lista filtrada: um filtro na
     coluna não pode fazer o número de urgências parecer menor. */
  const esperando = lista.filter((c) => c.estado === "precisa_resposta").length;
  const urgentes = lista.filter(
    (c) => c.estado === "precisa_resposta" && janelaAberta(c.janela_ate)).length;

  return (
    /* ⚠️ `h-full` + coluna flex, para o quadro das três colunas poder pedir "o
       que sobrou" em vez de uma conta. Ver o comentário do grid, abaixo. */
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-6">
      <CarboPageHeader
        icon={MessagesSquare}
        title="Conversas"
        /* ⚠️ Uma linha, e ela guarda a cláusula que MANDA: estas mensagens não
           existem em outro lugar. O MECANISMO (o número da Cloud API não
           aparece na Caixa de Entrada da Meta, e a Cloud API não guarda
           histórico) saiu do cabeçalho porque é explicação, não algo que alguém
           faça a respeito — e foi para o card de caixa vazia, que é lido por
           quem chega sem contexto em vez de a cada abertura da tela. */
        description="As respostas dos clientes no WhatsApp oficial — o único lugar onde elas existem."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {/* ── O SELETOR DE NÚMERO ──────────────────────────────────────
                ⚠️ Só aparece com DOIS ou mais: com um número ele seria um botão
                que não faz nada, e controle que não muda nada ensina a ignorar
                os que mudam. Hoje são dois ativos (serviço e Clube) — o de
                carrinho não está registrado na Meta e o `useNumeros` o esconde,
                porque oferecer um número que não envia é prometer o que a Graph
                API recusa com erro genérico.

                ⚠️ E ele mostra TODOS os números, não só o aberto: "qual caixa
                estou vendo?" e "quais caixas existem?" são a mesma pergunta
                para quem atende, e um dropdown esconderia a segunda. */}
            {(numeros?.length ?? 0) > 1 && (
              <div className="flex items-center gap-1 rounded-lg border border-border
                              bg-muted/40 p-0.5">
                {(numeros ?? []).map((n: NumeroWa) => {
                  const ativo = n.phone_number_id === numeroId;
                  return (
                    <button key={n.phone_number_id} type="button"
                            onClick={() => trocarNumero(n.phone_number_id)}
                            title={`${n.rotulo} · ${n.numero_exibicao ?? ""}`}
                            aria-pressed={ativo}
                            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1
                                        text-[11px] font-medium transition-colors ${
                              ativo ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"}`}>
                      {/* A cor vem do CADASTRO, não de um mapa aqui: número novo
                          entra com um INSERT e já chega com a cor dele. */}
                      <span className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: n.cor ?? "#64748B" }} />
                      {n.rotulo}
                    </button>
                  );
                })}
              </div>
            )}
            {/* ⚠️ UM placar, não dois números soltos — mas as DUAS contas
                continuam na tela, porque elas pedem coisas OPOSTAS: janela
                aberta ainda dá para responder; janela fechada a Meta recusa
                (131047), e nenhum dos seis templates da esteira serve para
                responder dúvida. Fundi-las num total só apagaria exatamente a
                regra central desta tela.
                ⚠️ E o placar é da caixa INTEIRA, não da lista filtrada: filtro
                na coluna não pode fazer a urgência parecer menor. */}
            {esperando > 0 && (
              <span
                title="Conversas que precisam de resposta. A segunda conta é a das que já estão fora da janela de 24 h — nelas a Meta recusa texto livre."
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1
                            text-[11px] leading-none ${
                  urgentes > 0
                    ? "border-amber-500/30 bg-amber-500/5 font-medium text-amber-500"
                    : "border-border bg-muted/40 text-muted-foreground"}`}>
                <Clock className="h-3.5 w-3.5 shrink-0" />
                {urgentes > 0 && (
                  <span className="tabular-nums">{urgentes} esperando resposta</span>
                )}
                {urgentes > 0 && esperando > urgentes && (
                  <span aria-hidden="true" className="text-muted-foreground/60">·</span>
                )}
                {esperando > urgentes && (
                  <span className={`tabular-nums ${
                    urgentes > 0 ? "font-normal text-muted-foreground" : ""}`}>
                    {esperando - urgentes} com a janela fechada
                  </span>
                )}
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
                : <><BellRing className="h-3.5 w-3.5" /> {quantosRecebem} {quantosRecebem === 1 ? "recebe" : "recebem"} aviso</>}
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
      {/* ⚠️ CADASTRO VAZIO NÃO PODE VIRAR TELA BRANCA. `carbo_wa_numeros` é
          guardada por `carbo_e_time_interno()`, e quem não estiver nessa lista
          recebe ZERO linhas — sem erro. Sem este aviso, a caixa não consultaria
          nada (o hook tem `enabled`) e a tela ficaria vazia para sempre,
          exatamente como a `bling2_esteira` ficava "travada na primeira coluna"
          para quem não tinha leitura. Falha de consulta não pode virar "nada". */}
      {!carregandoNumeros && !erroNumeros && (numeros?.length ?? 0) === 0 && (
        <CarboCard>
          <CarboCardContent className="p-4">
            <p className="flex items-start gap-1.5 text-xs text-amber-500">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              Nenhum número de WhatsApp disponível para o seu acesso. O cadastro
              (<span className="font-mono">carbo_wa_numeros</span>) é lido só por
              quem está no time interno — não é a caixa que está vazia.
            </p>
          </CarboCardContent>
        </CarboCard>
      )}

      {(error || erroNumeros) && (
        <CarboCard>
          <CarboCardContent className="p-4">
            <p className="flex items-start gap-1.5 text-xs text-red-500">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              Não consegui carregar: {((error ?? erroNumeros) as Error).message}
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
        /* ⚠️ A altura é O QUE SOBROU (`flex-1 min-h-0`), nunca uma conta. Era
           `h-[calc(100vh-13rem)]`, e o `13rem` era um chute sobre cabeçalho
           mais respiro: a tarja de status, que monta ACIMA desta tela e
           aparece e some sozinha, já fazia a conta errar — a coluna ficava uns
           40px mais alta que o espaço real e a página inteira passava a rolar.
           Conta sobre altura de cabeçalho erra toda vez que alguém acrescenta
           um aviso, e ninguém liga uma coisa à outra.

           ⚠️ E `100vh` estava errado no celular por um segundo motivo: no
           Safari e no Chrome de telefone ele INCLUI a barra de endereço, então
           o pé da lista ficava atrás dela, inalcançável. */
        <div className="grid min-h-0 gap-3 lg:flex-1 lg:grid-cols-[20rem_1fr] xl:grid-cols-[20rem_1fr_19rem]">
          <CarboCard className="min-h-0 overflow-hidden">
            <CarboCardContent className="flex h-full min-h-0 flex-col gap-0 p-0">
              {/* Busca e filtro ficam FORA da área que rola: com 40 conversas,
                  um campo que sobe junto com a lista é um campo que ninguém
                  encontra na hora em que precisa dele. */}
              <div className="shrink-0 space-y-2 border-b p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5
                                     -translate-y-1/2 text-muted-foreground" />
                  <Input value={busca} onChange={(e) => setBusca(e.target.value)}
                         placeholder="Buscar por nome ou número…"
                         className="h-9 border-border bg-muted/40 pl-8 pr-8 text-xs
                                    placeholder:text-muted-foreground/70" />
                  {busca && (
                    <button type="button" onClick={() => setBusca("")} aria-label="Limpar busca"
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-1
                                       text-muted-foreground transition-colors hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* ⚠️ O escopo da busca DITO em texto. Os contadores das abas são
                    da caixa inteira — se obedecessem à busca, cada tecla mexeria
                    nos cinco números e o contador deixaria de ser placar. Com
                    busca ativa a aba pode dizer "3" e a lista mostrar zero; sem
                    esta linha isso parece defeito. */}
                {busca.trim() && (
                  <p className="px-0.5 text-[10px] leading-none text-muted-foreground">
                    {filtradas.length} de {lista.length} com “{busca.trim()}”
                  </p>
                )}

                {/* ⚠️ Grade de 2 colunas, não uma fila de 5. Em 20rem cada aba de
                    uma fila fica com ~58px e "Não respondidas" quebra em duas
                    linhas com o contador órfão embaixo. Aqui cada célula tem
                    ~148px: nada quebra, nada é abreviado e nada fica escondido
                    atrás de menu — filtro escondido fica ligado sem a pessoa
                    perceber, e aí "a conversa sumiu do sistema".

                    "Todas" ocupa a linha inteira por SIGNIFICADO, não por sobra:
                    ela não é a quinta irmã, é a saída — mostra tudo, inclusive
                    resolvidas. */}
                <div className="grid grid-cols-2 gap-1">
                  {FILTROS.map((f) => {
                    const ativo = aba === f.id;
                    const n = contagens[f.id];
                    // Pendentes é a única aba que mede trabalho parado: fica âmbar
                    // mesmo inativa, na mesma cor do placar do cabeçalho da página.
                    const alerta = f.id === "pendentes" && n > 0 && !ativo;
                    return (
                      <button key={f.id} type="button" aria-pressed={ativo}
                              onClick={() => setFiltro(f.id)}
                              className={`flex items-center justify-between gap-1.5 rounded-md border
                                          px-2 py-1.5 text-[11px] font-medium leading-none
                                          transition-colors ${f.id === "todas" ? "col-span-2" : ""} ${
                                ativo
                                  ? "border-carbo-green/40 bg-carbo-green/10 text-foreground"
                                  : "border-border/60 bg-muted/40 hover:bg-muted/70 hover:text-foreground " +
                                    (alerta ? "text-amber-500" : "text-muted-foreground")}`}>
                        <span className="truncate">{f.rotulo}</span>
                        {/* `tabular-nums` + largura mínima: sem isso, 9 → 10
                            empurra o rótulo e a grade "respira" a cada mensagem
                            que chega pelo Realtime. Zero fica APAGADO — número em
                            destaque numa aba vazia convida ao clique que não leva
                            a lugar nenhum. */}
                        <span className={`min-w-[1.5rem] shrink-0 rounded px-1 py-0.5 text-center
                                          text-[10px] font-semibold tabular-nums ${
                          n === 0 ? "text-muted-foreground/40"
                          : ativo ? "bg-carbo-green/20 text-carbo-green"
                          : alerta ? "bg-amber-500/10 text-amber-500"
                          : "bg-background text-muted-foreground"}`}>
                          {n}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* ── Filtros ────────────────────────────────────────────────
                    ⚠️ NASCE FECHADO, e o botão diz quantos estão ativos. Quatro
                    seletores abertos o tempo todo empurrariam a primeira
                    conversa para fora da tela — o oposto do que uma caixa de
                    entrada precisa fazer. O selo com o número é o que impede o
                    outro defeito: filtro ligado que ninguém lembra de ter
                    ligado, e aí "a conversa sumiu do sistema".

                    ⚠️ E eles NÃO repetem as abas. "Minhas", "Sem responsável" e
                    "Janela aberta" estão logo acima; repetir aqui seria dois
                    lugares para a mesma pergunta. */}
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
                  {/* ⚠️ Limpar aparece MESMO com o painel fechado: é justamente
                      fechado que a pessoa esquece que filtrou. */}
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
                    {[
                      { rot: "Responsável", val: filtros.responsavel,
                        set: (v: string) => setFiltros((f) => ({ ...f, responsavel: v || null })),
                        ops: opcoesResponsavel.map((o) => [o.id, o.nome] as const) },
                      { rot: "Etiqueta", val: filtros.tag,
                        set: (v: string) => setFiltros((f) => ({ ...f, tag: v || null })),
                        ops: opcoesTag.map((o) => [o.id, o.nome] as const) },
                      { rot: "Etapa do aviso", val: filtros.etapa,
                        set: (v: string) => setFiltros((f) => ({ ...f, etapa: v || null })),
                        ops: opcoesEtapa.map((k) => [k, NOME_ETAPA[k] ?? k] as const) },
                      { rot: "Status", val: filtros.status,
                        set: (v: string) => setFiltros((f) => ({ ...f, status: (v || null) as TipoFiltros["status"] })),
                        ops: ORDEM_STATUS.filter((e): e is NonNullable<typeof e> => !!e)
                          /* ⚠️ O rótulo sai do MESMO `STATUS` do chip e do
                             cabeçalho de grupo: uma segunda tabela aqui diria
                             "Aberto" num lugar e outra coisa no outro. */
                          .map((e) => [e, STATUS[e].rotulo] as const) },
                    ].map((sel) => (
                      /* ⚠️ Seletor com ZERO opção não é mostrado. Um "Etiqueta:
                         qualquer" sozinho, sem nada para escolher, ocupa altura
                         e promete um recorte que não existe. */
                      sel.ops.length === 0 ? null : (
                        <select key={sel.rot} aria-label={sel.rot}
                                value={sel.val ?? ""} onChange={(e) => sel.set(e.target.value)}
                                className="w-full rounded-md border border-border/60 bg-muted/40 px-2 py-1.5
                                           text-[11px] outline-none focus:border-carbo-green/40">
                          {/* ⚠️ O RÓTULO vai dentro de cada opção, não só no
                              "qualquer". Campo fechado só mostra a opção
                              escolhida: sem isso ele dizia "Carla Reis" — e
                              Carla Reis é o quê, responsável ou etiqueta? É o
                              mesmo defeito do dropdown de produto do /vender,
                              que dizia "Microdistribuidor R$ 11,50" sem o nome
                              do produto, e que só apareceu renderizando. */}
                          <option value="">{sel.rot}: qualquer</option>
                          {sel.ops.map(([v, r]) => (
                            <option key={v} value={v}>{sel.rot}: {r}</option>
                          ))}
                        </select>
                      )
                    ))}
                    <select aria-label="Ordenar" value={filtros.ordem}
                            onChange={(e) => setFiltros((f) => ({ ...f, ordem: e.target.value as TipoFiltros["ordem"] }))}
                            className="w-full rounded-md border border-border/60 bg-muted/40 px-2 py-1.5
                                       text-[11px] outline-none focus:border-carbo-green/40">
                      <option value="recentes">Mais recentes primeiro</option>
                      <option value="antigas">Mais antigas primeiro</option>
                    </select>
                    {/* ⚠️ A ordem vale DENTRO de cada grupo, e a tela diz isso.
                        Os grupos seguem a urgência ("Abertas" antes de
                        "Resolvidas") e não mudam de lugar — sem esta linha,
                        escolher "Mais antigas" e ver "Abertas" continuar no
                        topo se lê como filtro que não funcionou. */}
                    <p className="px-0.5 text-[10px] leading-tight text-muted-foreground/70">
                      A ordem vale dentro de cada grupo.
                    </p>
                  </div>
                )}
              </div>

              <div className="max-h-[20rem] min-h-0 flex-1 overflow-y-auto p-0 lg:max-h-none">
                {/* ⚠️ "Nada casou com a busca" é diferente de "não há conversa".
                    O segundo vive fora daqui; este só precisa mostrar a saída —
                    senão a lista some e parece que os dados sumiram. */}
                {visiveis.length === 0 ? (
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
                    {/* ⚠️ Ele limpa os TRÊS recortes — aba, busca e filtros.
                        Antes zerava só os dois primeiros, e a lista ficava
                        vazia depois do clique quando quem a esvaziou tinha sido
                        um filtro: um botão que promete desfazer e não desfaz é
                        pior que botão nenhum, porque a pessoa conclui que não
                        há conversa nenhuma. Pela mesma razão ele aparece também
                        quando só há filtro ativo. */}
                    {(busca.trim() || aba !== "todas" || filtrosAtivos > 0) && (
                      <Button size="sm" variant="outline" className="mt-3 h-7 text-[11px]"
                              onClick={() => { setBusca(""); setFiltro("todas"); setFiltros(FILTROS_VAZIOS); }}>
                        Limpar busca e filtros
                      </Button>
                    )}
                  </div>
                ) : (
                  /* ⚠️ Agrupado por ESTADO, não uma lista corrida. Com 22
                     conversas dá para varrer; com 200, a pendência se perde no
                     meio dos avisos que ninguém respondeu. O cabeçalho de grupo
                     é o que faz a lista ter tamanho legível para sempre. */
                  ORDEM_STATUS.flatMap((estado) => {
                    const doGrupo = visiveis.filter((c) => c.status === estado);
                    if (!doGrupo.length) return [];
                    return [
                      <p key={`g-${estado ?? "sem"}`}
                         /* Sticky continua: com 36 linhas, quem rola no meio precisa
                            saber em que grupo está sem subir. */
                         className="sticky top-0 z-10 flex items-baseline justify-between gap-2
                                    border-b border-border/60 bg-background/95 px-3 pb-1.5 pt-3
                                    backdrop-blur first:pt-2">
                        {/* ⚠️ Sem negrito e mais apagado que a prévia: é placa de
                            seção, não conteúdo. Competir com o nome do cliente
                            inverteria a hierarquia da coluna inteira. E o
                            espacejamento existe porque caixa alta em 10px sem ele
                            fecha as letras e vira borrão. */}
                        <span className="min-w-0 truncate text-[10px] font-medium uppercase
                                         tracking-[0.08em] text-muted-foreground/60">
                          {estado ? STATUS[estado].grupo : "Sem pendência"}
                        </span>
                        {/* A contagem à DIREITA, na mesma coluna do trilho das linhas:
                            empilhadas, elas viram o placar da caixa sem nenhum
                            elemento novo. Colada no rótulo, lia-se como título. */}
                        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/40">
                          {doGrupo.length}
                        </span>
                      </p>,
                      ...doGrupo.map((c) => (
                        <LinhaDaConversa key={c.wa_id} c={c}
                                         selecionada={atual?.wa_id === c.wa_id}
                                         comBusca={!!busca.trim()} onAbrir={abrir} />
                      )),
                    ];
                  })
                )}
              </div>
            </CarboCardContent>
          </CarboCard>

          {atual && <Conversa key={atual.wa_id} c={atual} onVerPedido={setVerPedido} />}
          {atual && <PainelContato key={`p-${atual.wa_id}`} c={atual} meuId={meuId}
                                   onVerPedido={setVerPedido} />}
        </div>
      )}

      {/* ⚠️ FORA do grid das três colunas, e é de propósito: ele é um diálogo
          e o grid tem `min-h-0` com colunas que rolam — montado lá dentro, o
          card herdaria aquele recorte e a parte de baixo dele ficaria cortada
          sem barra de rolagem, que é o modo de falhar do `min-h-0` ao
          contrário. */}
      {verPedido != null && (
        <CardDoPedido blingId={verPedido} onClose={() => setVerPedido(null)} />
      )}
    </div>
  );
}
