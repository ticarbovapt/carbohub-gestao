import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  MessagesSquare, Send, Loader2, AlertTriangle, Clock, ArrowLeft, Lock, Paperclip,
  Image as ImageIcon, Video, Mic, FileText, MapPin, User, File, HelpCircle,
  Search, SearchX, X, Package, ArrowUpRight, CornerDownLeft, Megaphone,
} from "lucide-react";
import { toast } from "sonner";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  useConversas, useConversasAoVivo, useResponder, janelaAberta, faltaDaJanela,
  nivelDaJanela, fracaoDaJanela, type NivelJanela,
  type Conversa, type MensagemConversa,
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

type FiltroConversa = "todas" | "esperando" | "aberta";
const FILTROS: { id: FiltroConversa; rotulo: string }[] = [
  { id: "todas", rotulo: "Todas" },
  { id: "esperando", rotulo: "Esperando" },
  { id: "aberta", rotulo: "Janela aberta" },
];

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
  | { kind: "msg"; m: MensagemConversa; primeira: boolean; ultima: boolean };

/**
 * Intercala separadores de dia e marca começo/fim de cada bloco.
 *
 * ⚠️ Puro e sem estado: é a MESMA lista que veio do `agruparConversas` (já
 * ordenada), reescrita para a tela. Nada aqui decide o que é mensagem nova,
 * some com linha ou muda ordem — quem ordena é o `lib/conversas.ts`, e ter duas
 * ordenações seria ter duas verdades sobre a mesma conversa.
 */
function montarLinhaDoTempo(msgs: MensagemConversa[]): LinhaDaConversa[] {
  const linhas: LinhaDaConversa[] = [];
  msgs.forEach((m, i) => {
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
  return linhas;
}

/** O ícone diz o que chegou antes de a pessoa ler o rótulo. `File` é o padrão
 *  porque tipo novo da Meta não pode virar quadrado vazio. */
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
  const IconeAnexo = ICONE_MIDIA[m.tipo] ?? File;

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
          <div className="mb-1.5 flex items-center gap-2 rounded-md border border-dashed
                          bg-background/40 px-2 py-1.5">
            <IconeAnexo className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-[11px] font-medium leading-tight">
                {NOME_MIDIA[m.tipo] ?? m.tipo}
                <Paperclip className="h-2.5 w-2.5 text-muted-foreground" />
              </p>
              <p className="truncate text-[10px] leading-tight text-muted-foreground">
                arquivo não baixado — só o id ficou guardado
              </p>
            </div>
          </div>
        )}

        {m.texto ? (
          <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">
            {m.texto}
          </p>
        ) : anexo ? (
          <p className="text-[11px] italic text-muted-foreground">sem legenda</p>
        ) : (
          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-500">
            <HelpCircle className="mt-px h-3 w-3 shrink-0" />
            <span>
              Mensagem do tipo <strong>“{m.tipo}”</strong> — a tela ainda não sabe
              mostrar este formato. O conteúdo está gravado.
            </span>
          </p>
        )}

        {/* O horário só na ÚLTIMA do bloco: repetido em cada balão ele vira
            carimbo e some da vista justamente quando importa. */}
        {ultima && (
          <p className={`mt-1 text-[10px] leading-none text-muted-foreground/70 ${
            nossa ? "text-right" : ""}`}>
            {soHora(m.ocorrido_em)}
          </p>
        )}
        {desconhecida && <span className="sr-only">{hora(m.ocorrido_em)}</span>}
      </div>
    </div>
  );
}

function Conversa({ c }: { c: Conversa }) {
  const responder = useResponder();
  const [texto, setTexto] = useState("");
  const fim = useRef<HTMLDivElement>(null);
  const aberta = janelaAberta(c.janela_ate);
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

          {/* O relógio: badge + barra. A barra é a informação que o texto não
              dava — "23h59" e "12 min" liam-se igual. */}
          <div className="w-[9.5rem] shrink-0">
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

        {/* `space-y` saiu: o espaçamento agora é do BLOCO (no próprio balão),
            porque mensagem colada e mensagem nova precisam de distâncias
            diferentes — um `space-y` único achatava as duas no mesmo valor. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-0.5 pb-1 pr-1">
          {montarLinhaDoTempo(c.mensagens).map((l) =>
            l.kind === "dia"
              ? <SeparadorDeDia key={l.chave} rotulo={l.rotulo} />
              : <Balao key={l.m.wamid} m={l.m} primeira={l.primeira} ultima={l.ultima} />,
          )}
          <div ref={fim} />
        </div>

        {aberta ? (
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
              </div>
              <div className="flex items-center gap-2">
                {perto && (
                  <span className={`text-[10px] tabular-nums ${
                    texto.length >= 4096 ? "text-red-500" : "text-amber-500"}`}>
                    {texto.length}/4096
                  </span>
                )}
                <Button size="sm" className="h-8 gap-1.5"
                        disabled={!texto.trim() || responder.isPending} onClick={enviar}>
                  {responder.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Send className="h-3.5 w-3.5" />}
                  Enviar
                </Button>
              </div>
            </div>
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

export default function Conversas() {
  const [params] = useSearchParams();
  const voltar = params.get("voltar") || "/ecommerce/mensagens";

  // ⚠️ Antes de qualquer coisa que leia a hora: é o que faz o relógio da janela
  // andar sem F5 e sem depender da rede.
  useRelogio();
  // E a mensagem nova chega sozinha, sem esperar o intervalo de 30 s.
  useConversasAoVivo();

  const { data: conversas, isLoading, error } = useConversas();
  const [aberta, setAberta] = useState<string | null>(null);

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
  const [filtro, setFiltro] = useState<FiltroConversa>("todas");

  const contagens = useMemo(() => ({
    todas: lista.length,
    esperando: lista.filter((c) => c.aguardando > 0).length,
    aberta: lista.filter((c) => janelaAberta(c.janela_ate)).length,
  }), [lista]);

  const filtradas = useMemo(() => {
    const termo = busca.trim();
    const alvoTexto = normalizar(termo);
    const alvoNumero = soDigitos(termo);
    return lista.filter((c) => {
      if (filtro === "esperando" && c.aguardando === 0) return false;
      if (filtro === "aberta" && !janelaAberta(c.janela_ate)) return false;
      if (!termo) return true;
      const nome = normalizar(c.cliente ?? "");
      if (alvoTexto && nome.includes(alvoTexto)) return true;
      // Número só casa com número: sem isso, um termo com letras viraria string
      // vazia de dígitos e casaria com TODO mundo.
      if (alvoNumero && soDigitos(c.wa_id).includes(alvoNumero)) return true;
      return false;
    });
  }, [lista, busca, filtro]);

  /* O cabeçalho é o placar da caixa INTEIRA, não da lista filtrada: um filtro na
     coluna não pode fazer o número de urgências parecer menor. */
  const esperando = lista.filter((c) => c.aguardando > 0).length;
  const urgentes = lista.filter((c) => c.aguardando > 0 && janelaAberta(c.janela_ate)).length;

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
            <Button asChild size="sm" variant="outline" className="h-8 gap-1.5">
              <Link to={voltar}><ArrowLeft className="h-3.5 w-3.5" /> Voltar</Link>
            </Button>
          </div>
        }
      />

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

      {lista.length > 0 && (
        <div className="grid gap-3 lg:h-[calc(100vh-13rem)] lg:grid-cols-[20rem_1fr]">
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
                  filtradas.map((c) => {
                    const nivelC = nivelDaJanela(c.janela_ate);
                    const tomC = TOM_JANELA[nivelC];
                    const abertoC = janelaAberta(c.janela_ate);
                    const selecionada = atual?.wa_id === c.wa_id;

                    return (
                      <button key={c.wa_id} type="button" onClick={() => setAberta(c.wa_id)}
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

                              {/* O número sozinho não dizia de que era. Com a
                                  palavra, some a dúvida entre "3 mensagens" e
                                  "pedido nº 3". */}
                              {c.aguardando > 0 && (
                                <CarboBadge variant="secondary"
                                            className={`shrink-0 gap-1 px-1.5 py-0 text-[10px] font-medium ${
                                              abertoC ? "text-amber-500" : "text-muted-foreground"}`}>
                                  {c.aguardando} sem resposta
                                </CarboBadge>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </CarboCardContent>
          </CarboCard>

          {atual && <Conversa key={atual.wa_id} c={atual} />}
        </div>
      )}
    </div>
  );
}
