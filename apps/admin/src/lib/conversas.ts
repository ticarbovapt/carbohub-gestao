/**
 * As conversas do WhatsApp oficial — as regras, sem IO.
 *
 * ⚠️ Módulo separado do hook DE PROPÓSITO: o hook importa o cliente do
 * Supabase, e importar o cliente num teste derruba a suíte antes da primeira
 * asserção. Mesma razão pela qual `melhorEnvioParse.ts` e `metaTemplate.ts`
 * são módulos puros — a regra que decide alguma coisa fica onde o teste
 * alcança.
 *
 * ⚠️ Este é o ÚNICO lugar onde elas existem. Número da Cloud API não aparece na
 * Caixa de Entrada do Meta Business Suite (aquela tela só aceita número do
 * aplicativo WhatsApp Business), e a Cloud API não tem endpoint de histórico.
 * O que o webhook não gravou existe só no celular do cliente.
 *
 * Ler vem da view `carbo_wa_conversas`; responder vai pela edge function
 * `whatsapp-responder`, que confere a janela de 24 h antes de chamar a Meta.
 */

/** ⚠️ A janela de 24 h é a regra central do atendimento oficial.
 *
 * Ela abre quando o CLIENTE escreve. Dentro dela dá para responder em texto
 * livre; fora, a Meta recusa com 131047 e nenhum dos seis templates da esteira
 * serve para responder dúvida — eles avisam sobre o pedido, não conversam.
 *
 * Por isso o relógio é a informação mais importante da tela, não um detalhe. */
export const JANELA_MS = 24 * 60 * 60 * 1000;

export interface MensagemConversa {
  wamid: string;
  wa_id: string;
  cliente: string | null;
  direcao: "entrada" | "saida";
  tipo: string;
  texto: string | null;
  midia_id: string | null;
  ocorrido_em: string;
  bling_id: number | null;
  sobre_a_etapa: string | null;
  /** ⚠️ `false` significa que o pedido foi DEDUZIDO do último aviso enviado
   *  àquele número, não lido do `context.id` da resposta. Quase sempre certo,
   *  mas a tela precisa dizer qual dos dois — aproximação que se passa por
   *  certeza é como alguém responde sobre o pedido errado. */
  vinculo_exato: boolean;
  /** O sufixo do botão URL que foi enviado — o código de rastreio. A base
   *  (rastreio.carboze.com.br/rastreio/) está no template aprovado, não aqui.
   *  Null nos templates sem botão e em toda mensagem que não é da esteira. */
  botao_rastreio: string | null;
}

/**
 * O estado da conversa para quem atende.
 *
 * ⚠️ Três, e não dois. "Tem mensagem do cliente" e "precisa de resposta" são
 * coisas diferentes — metade das respostas é "Ok recebido", o cliente
 * ENCERRANDO a conversa. Tratar as duas como uma faz a pendência de verdade se
 * perder no meio dos agradecimentos, com a janela de 24 h correndo em cima
 * justamente dela.
 */
export type EstadoConversa = "precisa_resposta" | "resolvida" | "sem_pendencia";

export interface Conversa {
  wa_id: string;
  cliente: string | null;
  ultima_em: string;
  ultima_texto: string | null;
  ultima_direcao: "entrada" | "saida";
  /** Quantas mensagens do cliente ainda não foram respondidas por nós. */
  aguardando: number;
  /** Quando a janela fecha. `null` = o cliente nunca escreveu. */
  janela_ate: string | null;
  bling_id: number | null;
  sobre_a_etapa: string | null;
  mensagens: MensagemConversa[];
  estado: EstadoConversa;
  /** Quando alguém marcou como tratada. Null = nunca foi marcada. */
  resolvido_ate: string | null;
  /** ⚠️ SUGESTÃO, não decisão. A última mensagem do cliente parece só um
   *  agradecimento — a tela oferece resolver com um clique, e não resolve
   *  sozinha. Aproximação que se passa por certeza é como uma pergunta de
   *  verdade some da fila. */
  parece_encerrada: boolean;
}

export function janelaAberta(janela_ate: string | null): boolean {
  return !!janela_ate && new Date(janela_ate).getTime() > Date.now();
}

/** Quanto falta, em texto curto. Vazio quando já fechou. */
export function faltaDaJanela(janela_ate: string | null): string {
  if (!janela_ate) return "";
  const ms = new Date(janela_ate).getTime() - Date.now();
  if (ms <= 0) return "";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`;
}

/**
 * A última mensagem do cliente é só um "ok"?
 *
 * ⚠️ Serve para SUGERIR, nunca para esconder. O método é subtrativo: tira do
 * texto todas as palavras de encerramento conhecidas e vê se sobrou alguma
 * coisa. "Ok recebido" fica vazio; "Ok mas não chegou" sobra "mas nao chegou",
 * e não é encerramento.
 *
 * Assim um agradecimento com uma pergunta grudada NUNCA passa por
 * agradecimento — que é o erro que não se pode cometer aqui. O contrário
 * (deixar de sugerir) custa um clique.
 */
const ENCERRAMENTOS = [
  "ok", "okay", "oki", "blz", "beleza", "certo", "combinado", "fechado",
  "obrigado", "obrigada", "obg", "vlw", "valeu", "grato", "grata",
  "recebi", "recebido", "chegou", "entendi", "perfeito", "otimo", "excelente",
  "show", "top", "joia", "tudo", "bem", "bom", "boa", "sim", "isso", "eh",
  "de", "nada", "ate", "mais", "abraco", "bs", "abs", "att",
];

/** ⚠️ Emoji de aprovação é encerramento; emoji qualquer NÃO é. `👍` sozinho é
 *  um "ok"; `🤔` sozinho é uma dúvida, e sugerir fechar ali seria o erro que
 *  esta função não pode cometer. Por isso a lista é explícita, e o que não
 *  está nela não vira sugestão. */
const EMOJI_OK = ["👍", "👌", "🙏", "✅", "❤️", "❤", "💚", "😊", "🙂", "😉", "🤝", "👏", "🚀"];

export function pareceEncerramento(texto: string | null): boolean {
  if (!texto) return false;
  const t = texto.trim();
  // Pergunta explícita nunca é encerramento, por mais curta que seja.
  if (t.includes("?")) return false;
  // Texto longo raramente é só um "ok", e o custo de errar cresce com o
  // tamanho: uma reclamação de três linhas não pode virar sugestão de fechar.
  if (t.length > 60) return false;

  // Tira os emoji de aprovação ANTES de limpar, guardando que existiam: é o que
  // distingue "só um joinha" de "só um símbolo qualquer".
  let base = t;
  let temEmojiOk = false;
  for (const e of EMOJI_OK) {
    if (base.includes(e)) { temEmojiOk = true; base = base.split(e).join(" "); }
  }

  const limpo = base
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    // Emoji, pontuação e símbolos somem: 👍 e "!!!" são encerramento tanto
    // quanto "ok".
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  // Sobrou nada: vale como encerramento só se o que havia era emoji de
  // aprovação.
  if (!limpo.length) return temEmojiOk;
  return limpo.every((palavra) => ENCERRAMENTOS.includes(palavra));
}

/**
 * Agrupa as mensagens por pessoa.
 *
 * ⚠️ Agrupar por `wa_id` e não por pedido é deliberado: a janela é da PESSOA.
 * Quem tem dois pedidos abertos tem uma conversa só, e separar por pedido faria
 * a tela mostrar duas caixas onde só uma pode receber resposta.
 */
export function agruparConversas(
  linhas: MensagemConversa[],
  janelas: Record<string, string | null>,
  resolvidos: Record<string, string> = {},
): Conversa[] {
  const porPessoa = new Map<string, MensagemConversa[]>();
  for (const l of linhas) {
    if (!porPessoa.has(l.wa_id)) porPessoa.set(l.wa_id, []);
    porPessoa.get(l.wa_id)!.push(l);
  }

  const conversas: Conversa[] = [];
  for (const [wa_id, msgs] of porPessoa) {
    const ordenadas = [...msgs].sort(
      (a, b) => new Date(a.ocorrido_em).getTime() - new Date(b.ocorrido_em).getTime());
    const ultima = ordenadas[ordenadas.length - 1];

    // ⚠️ DOIS cortes, e vale o mais recente: a nossa última resposta e a marca
    // de "resolvida". Sem o segundo, "Ok obrigado" ficaria pendente para sempre
    // — a única forma de zerar seria responder um "de nada" ao cliente.
    const ultimaNossa = [...ordenadas].reverse().find((m) => m.direcao === "saida");
    const corteResposta = ultimaNossa ? new Date(ultimaNossa.ocorrido_em).getTime() : 0;
    const resolvidoAte = resolvidos[wa_id] ?? null;
    const corteResolvido = resolvidoAte ? new Date(resolvidoAte).getTime() : 0;
    const corte = Math.max(corteResposta, corteResolvido);

    const pendentes = ordenadas.filter(
      (m) => m.direcao === "entrada" && new Date(m.ocorrido_em).getTime() > corte);
    const aguardando = pendentes.length;

    const estado: EstadoConversa =
      aguardando > 0 ? "precisa_resposta"
      : corteResolvido >= corteResposta && corteResolvido > 0 ? "resolvida"
      : "sem_pendencia";

    // A sugestão olha só a ÚLTIMA pendente: é ela que a pessoa vai ler ao abrir.
    const parece_encerrada =
      aguardando > 0 && pareceEncerramento(pendentes[pendentes.length - 1].texto);

    // O pedido vem da mensagem mais recente que tenha um — a conversa é da
    // pessoa, mas o assunto é o do último contato.
    const comPedido = [...ordenadas].reverse().find((m) => m.bling_id != null);

    conversas.push({
      wa_id,
      cliente: ordenadas.find((m) => m.cliente)?.cliente ?? null,
      ultima_em: ultima.ocorrido_em,
      ultima_texto: ultima.texto,
      ultima_direcao: ultima.direcao,
      aguardando,
      janela_ate: janelas[wa_id] ?? null,
      bling_id: comPedido?.bling_id ?? null,
      sobre_a_etapa: comPedido?.sobre_a_etapa ?? null,
      mensagens: ordenadas,
      estado,
      resolvido_ate: resolvidoAte,
      parece_encerrada,
    });
  }

  // ⚠️ Quem espera resposta primeiro, e dentro disso o mais recente. Ordenar só
  // por data deixaria uma pergunta de ontem com a janela quase fechando abaixo
  // de uma conversa já resolvida de agora.
  return conversas.sort((a, b) => {
    if ((a.aguardando > 0) !== (b.aguardando > 0)) return a.aguardando > 0 ? -1 : 1;
    return new Date(b.ultima_em).getTime() - new Date(a.ultima_em).getTime();
  });
}

/**
 * Milissegundos que faltam da janela. Negativo ou zero = fechada.
 *
 * ⚠️ Existe ao lado de `faltaDaJanela` porque aquela devolve TEXTO e devolve
 * vazio quando já fechou — serve para mostrar, não para decidir. A cor e a
 * barra dependem de quão perto do fim está, e isso é número. As duas fazem a
 * mesma conta; quem decide se está aberta continua sendo `janelaAberta`.
 */
export function msDaJanela(janela_ate: string | null): number {
  if (!janela_ate) return 0;
  return new Date(janela_ate).getTime() - Date.now();
}

/**
 * O relógio da janela em forma de INTENSIDADE.
 *
 * ⚠️ `23h59` e `12 min` tinham exatamente a mesma aparência, e é aqui que a
 * tela precisa gritar: janela fechada não tem segunda chance — a Meta recusa
 * texto livre com 131047 e nenhum dos seis templates da esteira serve para
 * responder dúvida.
 *
 * Os cortes são de OPERAÇÃO, não de estatística: acima de 6 h dá para responder
 * depois do almoço; abaixo de 1 h é agora.
 *
 * ⚠️ E existe UM só. A lista da esquerda e o cabeçalho da conversa mostram a
 * mesma urgência; dois cortes diferentes fariam a mesma conversa parecer
 * tranquila num lugar e urgente no outro.
 */
export type NivelJanela = "folgada" | "apertando" | "urgente" | "fechada";

export function nivelDaJanela(janela_ate: string | null): NivelJanela {
  const ms = msDaJanela(janela_ate);
  if (ms <= 0) return "fechada";
  if (ms <= 3_600_000) return "urgente";
  if (ms <= 6 * 3_600_000) return "apertando";
  return "folgada";
}

/** Quanto da janela ainda resta, de 0 a 1 — a largura da barrinha.
 *  Preso em [0,1] porque `janela_ate` vem do banco e um relógio adiantado no
 *  navegador produziria barra maior que a caixa. */
export function fracaoDaJanela(janela_ate: string | null): number {
  return Math.max(0, Math.min(1, msDaJanela(janela_ate) / JANELA_MS));
}
