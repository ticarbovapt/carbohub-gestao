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
  /** ⚠️ Por qual NÚMERO NOSSO ela passou. Desde 02/10/2026 o WABA tem três
   *  (serviço, CarboZé Clube/recompra e carrinho), e a janela de 24 h da Meta é
   *  por PAR — nosso número ↔ cliente. A mesma pessoa em dois números são DUAS
   *  conversas, com janelas, status e etiquetas independentes. */
  numero_id?: string | null;
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
  /** ⚠️ Quem CLICOU em enviar. Nulo em entrada (é o cliente) e em aviso
   *  automático da esteira (é o sistema) — nos dois casos nulo é informação,
   *  não falta de dado, e por isso a tela não escreve "—" no lugar. */
  enviado_por_nome?: string | null;
  /** O nome do CADASTRO. Existe desde o primeiro aviso, muito antes de a pessoa
   *  responder — é ele que tira a lista de "vinte números soltos". */
  cliente_pedido: string | null;
  /** O nome que a PESSOA escolheu no perfil do WhatsApp. Só existe depois que
   *  ela escreve, e diverge do cadastro com frequência (apelido, empresa). */
  nome_whatsapp: string | null;
  /** O sufixo do botão URL que foi enviado — o código de rastreio. A base
   *  (rastreio.carboze.com.br/rastreio/) está no template aprovado, não aqui.
   *  Null nos templates sem botão e em toda mensagem que não é da esteira. */
  botao_rastreio: string | null;
  /** ⚠️ O que a Meta disse DEPOIS de aceitar o envio. Aceitar não é entregar: o
   *  áudio que ninguém recebeu voltou com `falhou` pelo webhook, e enquanto
   *  isso não chegava à tela o balão ficava idêntico ao que deu certo — quem
   *  atendeu ia embora achando que respondeu. Null = ainda sem status (e toda
   *  mensagem de entrada é assim). */
  status?: string | null;
  erro_codigo?: number | null;
  erro_detalhe?: string | null;
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
/**
 * O status de atendimento da conversa.
 *
 * ⚠️ DOIS deles são calculados e DOIS são clicados, e essa divisão é a decisão
 * mais importante desta tela:
 *
 *   aberto          cliente falou por último  → sai da conversa, ninguém clica
 *   em_atendimento  gente nossa falou por último → idem
 *   aguardando      esperando o cliente ou outro setor → decisão humana
 *   resolvido       encerrado até o cliente voltar     → decisão humana
 *
 * Deixar "aberto" e "em atendimento" na mão de alguém cria a doença conhecida
 * dessas ferramentas: o status manual briga com a realidade, e quem lê a fila
 * passa a não confiar nela. Ninguém mantém etiqueta à mão a cada mensagem que
 * chega — mas o sistema sabe, sem falhar, quem falou por último.
 *
 * E o contrário também vale: "estou esperando o cliente mandar o comprovante"
 * não está escrito em lugar nenhum da conversa. Isso só uma pessoa sabe, e por
 * isso esses dois são clicados.
 */
export type StatusAtendimento = "aberto" | "em_atendimento" | "aguardando" | "resolvido";

export interface Atendimento {
  wa_id: string;
  status: StatusAtendimento;
  /** Quando a decisão foi tomada — é com isto que a reabertura é comparada. */
  desde: string;
  responsavel: string | null;
  responsavel_nome: string | null;
}

export interface TagConversa {
  id: string;
  nome: string;
  cor: string;
}

/**
 * O status que VALE agora.
 *
 * ⚠️ `aguardando` e `resolvido` REABREM quando o cliente escreve depois da
 * decisão. Os dois significam "não estou mexendo nisso agora", e uma pergunta
 * nova não pode ficar escondida atrás de uma decisão de ontem. É a mesma regra
 * que fez `resolvido_ate` ser data e não booleano.
 *
 * ⚠️ `em_atendimento` NÃO reabre: ele significa que alguém está cuidando, e
 * mensagem nova do cliente é justamente o que se espera durante um
 * atendimento. Rebaixá-lo para "aberto" tiraria a conversa da mão de quem está
 * nela e faria outra pessoa responder por cima.
 *
 * Sem atendimento registrado, o status sai da realidade: há pergunta pendente
 * → `aberto`; não há → `null`, que a tela mostra como conversa sem pendência.
 * Marcar tudo como "aberto" encheria a fila de conversa que ninguém precisa
 * abrir, que é o mesmo que não ter fila.
 */
export function statusEfetivo(
  at: Atendimento | null | undefined,
  ultimaEntradaEm: string | null,
  aguardando: number,
  respondidaPorGente: boolean,
): StatusAtendimento | null {
  // ── Primeiro a decisão humana, se ainda valer ────────────────────────────
  //
  // ⚠️ `aguardando` e `resolvido` REABREM quando o cliente escreve depois delas.
  // Os dois significam "não estou mexendo nisso agora", e uma pergunta nova não
  // pode ficar escondida atrás de uma decisão de ontem. É a mesma regra que fez
  // `resolvido_ate` ser data e não booleano.
  if (at && (at.status === "aguardando" || at.status === "resolvido")) {
    const reabriu = !!ultimaEntradaEm &&
      new Date(ultimaEntradaEm).getTime() > new Date(at.desde).getTime();
    if (!reabriu) return at.status;
  }

  // ── O resto sai da conversa, não de um clique ────────────────────────────
  //
  // Cliente falou por último → aberto. Gente nossa falou por último → em
  // atendimento. Ninguém precisa manter isso à mão, e por isso ele nunca fica
  // desatualizado.
  if (aguardando > 0) return "aberto";

  // ⚠️ Aviso automático da esteira NÃO é atendimento. Uma conversa em que só
  // saiu o "nota fiscal emitida" e o cliente nunca respondeu viraria
  // "em atendimento" sem ninguém ter atendido — e a fila do time encheria de
  // trabalho que não existe.
  return respondidaPorGente ? "em_atendimento" : null;
}

/**
 * A conversa foi REABERTA pelo cliente?
 *
 * ⚠️ Existe para a tela poder DIZER isso. Reabertura silenciosa é a queixa
 * clássica dessas ferramentas: quem marcou resolvido acha que o sistema desfez
 * o trabalho dele. O comportamento está certo; o que faltava era o aviso.
 */
export function foiReaberta(
  at: Atendimento | null | undefined,
  ultimaEntradaEm: string | null,
): boolean {
  if (!at || (at.status !== "aguardando" && at.status !== "resolvido")) return false;
  return !!ultimaEntradaEm &&
    new Date(ultimaEntradaEm).getTime() > new Date(at.desde).getTime();
}

export type EstadoConversa = "precisa_resposta" | "resolvida" | "sem_pendencia";

export interface Conversa {
  wa_id: string;
  /** De qual número NOSSO é esta conversa. Toda escrita (status, responsável,
   *  etiqueta, recado, resposta) precisa dele: as chaves viraram o PAR. */
  numero_id: string | null;
  cliente: string | null;
  ultima_em: string;
  ultima_texto: string | null;
  /** ⚠️ O TIPO da última mensagem, porque `ultima_texto` nulo não diz POR QUÊ.
   *  A lista escrevia "(arquivo)" para todo texto nulo — inclusive para
   *  `unsupported`, em que não há arquivo nenhum e nunca vai haver. Prévia que
   *  inventa um anexo faz alguém abrir a conversa procurando um arquivo. */
  ultima_tipo: string;
  ultima_direcao: "entrada" | "saida";
  /** Quantas mensagens do cliente ainda não foram respondidas por nós. */
  aguardando: number;
  /** Quando a janela fecha. `null` = o cliente nunca escreveu. */
  janela_ate: string | null;
  /** ⚠️ Segundo nome, mostrado numa linha discreta QUANDO diferente do
   *  principal. Quem procura pelo nome que viu no WhatsApp precisa achar; quem
   *  procura pelo do pedido também. */
  nome_whatsapp: string | null;
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
  /** O que o time decidiu — já com a reabertura aplicada. Null = sem status. */
  status: StatusAtendimento | null;
  responsavel: string | null;
  responsavel_nome: string | null;
  tags: TagConversa[];
  /** A última mensagem DO CLIENTE. É ela que reabre `aguardando`/`resolvido`. */
  ultima_entrada_em: string | null;
  /** ⚠️ O cliente escreveu depois de alguém marcar aguardando/resolvido. A tela
   *  DIZ isso — reabertura silenciosa faz quem marcou achar que o sistema
   *  desfez o trabalho dele. */
  reaberta: boolean;
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
  atendimentos: Record<string, Atendimento> = {},
  tagsPorConversa: Record<string, TagConversa[]> = {},
): Conversa[] {
  const porPessoa = new Map<string, MensagemConversa[]>();
  for (const l of linhas) {
    if (!porPessoa.has(l.wa_id)) porPessoa.set(l.wa_id, []);
    porPessoa.get(l.wa_id)!.push(l);
  }

  const conversas: Conversa[] = [];
  for (const [wa_id, msgs] of porPessoa) {
    // ⚠️ O número sai das MENSAGENS, não de um parâmetro: a lista já vem
    // filtrada por número, então todas as linhas do grupo têm o mesmo. Pegar o
    // primeiro não-nulo tolera linha antiga sem a coluna, que a migração
    // preencheu mas um cache velho poderia não ter.
    const numeroDaConversa = msgs.find((m) => m.numero_id)?.numero_id ?? null;
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

    // A última do CLIENTE — é ela que reabre `aguardando` e `resolvido`, e ela
    // existe mesmo quando já foi respondida (então não dá para reusar
    // `pendentes`, que só olha o que veio depois do corte).
    const ultimaEntrada = [...ordenadas].reverse().find((m) => m.direcao === "entrada");
    const ultimaEntradaEm = ultimaEntrada?.ocorrido_em ?? null;

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

    // ⚠️ O nome do PEDIDO na frente. Ele existe desde o primeiro aviso; o do
    // WhatsApp só depois que a pessoa escreve, e é ele que hoje deixa vinte
    // linhas como número puro.
    const doPedido = ordenadas.find((m) => m.cliente_pedido)?.cliente_pedido ?? null;
    const doWhats = ordenadas.find((m) => m.nome_whatsapp)?.nome_whatsapp ?? null;

    conversas.push({
      wa_id,
      numero_id: numeroDaConversa,
      cliente: doPedido ?? doWhats,
      // Só vale mostrar o segundo quando ele diz alguma coisa a mais.
      nome_whatsapp:
        doWhats && doPedido &&
        doWhats.trim().toLowerCase() !== doPedido.trim().toLowerCase()
          ? doWhats : null,
      ultima_em: ultima.ocorrido_em,
      ultima_texto: ultima.texto,
      ultima_tipo: ultima.tipo,
      ultima_direcao: ultima.direcao,
      aguardando,
      janela_ate: janelas[wa_id] ?? null,
      bling_id: comPedido?.bling_id ?? null,
      sobre_a_etapa: comPedido?.sobre_a_etapa ?? null,
      mensagens: ordenadas,
      estado,
      resolvido_ate: resolvidoAte,
      parece_encerrada,
      // ⚠️ `respondidaPorGente` olha o TIPO: aviso automático da esteira não é
      // atendimento, e sem essa distinção toda conversa que recebeu um
      // "nota fiscal emitida" apareceria como "em atendimento" sem ninguém ter
      // atendido.
      status: statusEfetivo(
        atendimentos[wa_id], ultimaEntradaEm, aguardando,
        !!ultimaNossa && ultimaNossa.tipo !== "template"),
      reaberta: foiReaberta(atendimentos[wa_id], ultimaEntradaEm),
      responsavel: atendimentos[wa_id]?.responsavel ?? null,
      responsavel_nome: atendimentos[wa_id]?.responsavel_nome ?? null,
      tags: tagsPorConversa[wa_id] ?? [],
      ultima_entrada_em: ultimaEntradaEm,
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

// ─────────────────────────────────────────────────────────────────────────────
// Filtros da caixa
//
// A busca livre resolve enquanto há cinco conversas. Com 241 — o número real em
// 30/09/2026 — a pergunta de quem atende deixa de ser "onde está o Fulano" e
// passa a ser "o que está marcado como orçamento", "o que é do Pedro", "o que
// ficou parado em Nota fiscal emitida". Nenhuma dessas se responde digitando
// um nome.
//
// ⚠️ TUDO NO NAVEGADOR, sobre a lista que já está carregada. Filtrar no
// servidor seria uma ida ao banco por clique, e a lista já vem inteira.
//
// ⚠️ E ELES NÃO REPETEM AS ABAS. "Não respondidas", "Minhas", "Sem
// responsável", "Janela aberta" e "Todas" já existem em cima da lista. Repetir
// "sem dono" e "não lidas" aqui criaria DOIS lugares para a mesma pergunta —
// e dois lugares que discordam é o defeito que este repositório mais paga.
// O que os filtros acrescentam é o que as abas não sabem perguntar:
// atendente ESPECÍFICO, etiqueta, etapa do aviso e status do atendimento.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ Só DUAS, e "quem espera resposta primeiro" foi tirada de propósito.
 *
 * A lista é renderizada AGRUPADA por status (`ORDEM_STATUS`), e a ordem dos
 * grupos já é a da urgência — "Abertas, ninguém respondeu" vem primeiro. Uma
 * ordenação por pendência só poderia agir DENTRO de cada grupo, onde ela é
 * quase sempre idêntica à que já está lá: no grupo `aberto` o cliente falou por
 * último, então praticamente todo mundo tem `aguardando > 0`.
 *
 * Seria um seletor que soma 1 no selo de filtros ativos e não muda uma linha da
 * tela — a mesma doença do relatório que só sabe concordar consigo mesmo, na
 * versão mais barata de cometer.
 */
export type OrdemDaCaixa = "recentes" | "antigas";

export interface FiltrosDaCaixa {
  /** Id do responsável. `null` = qualquer. As abas cobrem "minhas" e "sem dono". */
  responsavel: string | null;
  /** Id da etiqueta. */
  tag: string | null;
  /** Etapa do aviso da esteira sobre o qual a conversa fala. */
  etapa: string | null;
  /** Status do atendimento — o que o time decidiu. */
  status: StatusAtendimento | null;
  ordem: OrdemDaCaixa;
}

export const FILTROS_VAZIOS: FiltrosDaCaixa = {
  responsavel: null, tag: null, etapa: null, status: null, ordem: "recentes",
};

/** Quantos filtros estão de fato mudando o que se vê — é o número do selo.
 *  ⚠️ A ordenação PADRÃO não conta: ela não esconde nada, e contá-la faria o
 *  selo nascer com 1 e perder o significado. */
export function quantosFiltrosAtivos(f: FiltrosDaCaixa): number {
  return (f.responsavel ? 1 : 0) + (f.tag ? 1 : 0) + (f.etapa ? 1 : 0)
    + (f.status ? 1 : 0) + (f.ordem !== "recentes" ? 1 : 0);
}

/**
 * Aplica os filtros e a ordenação. Fora do componente, de propósito: dá para
 * conferir sem montar tela.
 *
 * ⚠️ A ordenação devolve lista NOVA (`[...]`) — ordenar no lugar mutaria o
 * array do cache do react-query, e o próximo render partiria de uma ordem que
 * ninguém escolheu.
 */
export function aplicarFiltrosDaCaixa(
  lista: Conversa[], f: FiltrosDaCaixa,
): Conversa[] {
  const filtrada = lista.filter((c) => {
    if (f.responsavel && c.responsavel !== f.responsavel) return false;
    if (f.tag && !c.tags.some((t) => t.id === f.tag)) return false;
    if (f.etapa && c.sobre_a_etapa !== f.etapa) return false;
    if (f.status && c.status !== f.status) return false;
    return true;
  });

  const quando = (c: Conversa) => new Date(c.ultima_em).getTime();

  if (f.ordem === "antigas") return [...filtrada].sort((a, b) => quando(a) - quando(b));
  return [...filtrada].sort((a, b) => quando(b) - quando(a));
}

// ─── Respostas rápidas: a barra `/atalho` ────────────────────────────────────
//
// As frases que o time repete todo dia. ⚠️ O texto é COLADO no campo, NUNCA
// enviado: quase toda resposta precisa do nome do cliente ou de um ajuste antes
// de sair, e enviar direto transformaria o atalho numa armadilha — um Enter a
// mais e o cliente recebeu a frase errada.
//
// ⚠️ Puras e aqui, não no componente: são elas que decidem QUANDO o painel
// abre, e isso é a parte que erra de um jeito difícil de enxergar na tela.
// ─────────────────────────────────────────────────────────────────────────────

export interface RespostaRapida {
  id: string;
  atalho: string;
  corpo: string;
  criado_por: string | null;
  criado_em: string;
}
// ⚠️ Sem o NOME do autor, de propósito. Trazê-lo pediria um embed
// `profiles(full_name)`, que depende do cache de esquema do PostgREST e, ao
// falhar, derruba a consulta INTEIRA — a lista de respostas viria vazia por
// causa de um rótulo decorativo. Mesma razão pela qual `useFaixasPreco` é
// consulta separada. O que a tela precisa de verdade é `criado_por`, para saber
// se mostra o botão de apagar.

/**
 * O que foi digitado depois da barra, ou `null` quando não é uma chamada.
 *
 * ⚠️ Só vale no COMEÇO do campo e sem espaço, e as duas condições são
 * necessárias:
 *
 *   · no MEIO do texto, "10/04" e "contato@x.com/br" abririam o painel no meio
 *     de uma frase — barra ali é pontuação, não gesto;
 *   · DEPOIS de um espaço, o painel ficaria aberto enquanto a pessoa continua
 *     escrevendo a resposta de verdade.
 *
 * Barra sozinha (`/`) devolve string VAZIA, não null: é o caso de quem quer ver
 * a lista inteira sem saber o nome de nenhum atalho. `null` e `""` significam
 * coisas diferentes aqui, e colapsá-los fecharia o painel justamente para quem
 * mais precisa dele.
 */
export function termoDaBarra(rascunho: string): string | null {
  const m = /^\/([a-zA-Z0-9_-]*)$/.exec(rascunho);
  return m ? m[1].toLowerCase() : null;
}

/**
 * As respostas que casam com o termo.
 *
 * Casa no atalho E no corpo: quem lembra da frase ("parcelamos em 3x") mas não
 * do atalho encontra do mesmo jeito. ⚠️ O atalho vem PRIMEIRO na ordem porque
 * ele é a busca deliberada; achar pelo corpo é o resgate, e inverter faria a
 * primeira linha — a que o Enter escolhe — ser a menos provável.
 */
export function filtrarRespostas(lista: RespostaRapida[], termo: string): RespostaRapida[] {
  const t = termo.trim().toLowerCase();
  if (!t) return lista;
  const porAtalho = lista.filter((r) => r.atalho.includes(t));
  const porCorpo = lista.filter(
    (r) => !r.atalho.includes(t) && r.corpo.toLowerCase().includes(t));
  return [...porAtalho, ...porCorpo];
}

/**
 * O atalho como ele vai ser GRAVADO — a mesma normalização do gatilho do banco.
 *
 * ⚠️ Espelho de APRESENTAÇÃO, nunca a regra: quem normaliza de verdade é o
 * `trg_carbo_wa_resposta_normaliza`, porque a tela é um lugar por onde se passa
 * e o banco é o único por onde TODO mundo passa. Isto existe só para o campo
 * poder mostrar, enquanto se digita, o que o `/` vai chamar depois — e para o
 * botão de salvar recusar antes de uma viagem ao banco.
 */
export function normalizarAtalho(bruto: string): string {
  return bruto.trim().replace(/^\/+/, "").trim().toLowerCase();
}

/** O mesmo CHECK da tabela, para a tela dizer "não serve" antes de tentar. */
export function atalhoValido(bruto: string): boolean {
  return /^[a-z0-9_-]{1,24}$/.test(normalizarAtalho(bruto));
}
