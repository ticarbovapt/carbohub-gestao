// Fixtures da área "conversas" (ver areas.ts): a tela /conversas.
// Tudo FICTÍCIO — nenhum cliente, telefone, pedido ou mensagem é real. Os
// nomes e números de pedido são os MESMOS da fixture da Esteira, para o card
// do pedido abrir com dado coerente.
//
// ⚠️ `carbo_wa_numeros`, `carbo_wa_nao_contatar` e `bling2_esteira` também
// são definidas pela área "esteira", que vem ANTES em areas.ts. Aqui elas
// respondem por ROTA: em /conversas, os dados desta área; fora, os da esteira.
import { PAPEL, U, EU } from "./pessoas";
import { FX as FX_ESTEIRA } from "./fx_esteira";
void PAPEL; void EU;

const agora = Date.now();
const min = (m: number) => new Date(agora - m * 60000).toISOString();
const hrs = (h: number) => min(h * 60);
const naConversas = () => { try { return location.pathname.startsWith("/conversas"); } catch { return false; } };
const daEsteira = (t: string) => {
  const f = FX_ESTEIRA[t];
  return typeof f === "function" ? (f as () => unknown)() : f ?? [];
};
const porRota = (t: string, meu: () => unknown) => () => (naConversas() ? meu() : daEsteira(t));

export const NUM_SERVICO = "1255756280958635";
export const NUM_CLUBE = "1274076859132981";
export const NUM_LOJA = "1347087218483622";

const NUMEROS = [
  { phone_number_id: NUM_SERVICO, rotulo: "CarboZé", numero_exibicao: "(84) 90000-0001", funcao: "servico", cor: "#3BC770", ordem: 1, ativo: true },
  { phone_number_id: NUM_CLUBE, rotulo: "CarboZé Clube", numero_exibicao: "(84) 90000-0002", funcao: "recompra", cor: "#8B5CF6", ordem: 2, ativo: true },
  { phone_number_id: NUM_LOJA, rotulo: "CarboZé Loja", numero_exibicao: "(84) 90000-0003", funcao: "carrinho", cor: "#F59E0B", ordem: 3, ativo: true },
];

// ── As mensagens ────────────────────────────────────────────────────────────
type Msg = Record<string, unknown>;
let seq = 0;
const base = (numero_id: string, wa_id: string, cliente: string, bling_id: number | null, etapa: string | null) =>
  ({ numero_id, wa_id, cliente_pedido: cliente, bling_id, sobre_a_etapa: etapa, vinculo_exato: true, nome_whatsapp: null });
/** Aviso automático (template da esteira ou do comercial). */
const aviso = (b: Msg, m: number, etapa: string, texto: string, extra: Msg = {}): Msg => ({
  ...b, wamid: `wamid.${++seq}`, cliente: null, direcao: "saida", tipo: "template", texto, midia_id: null,
  ocorrido_em: min(m), sobre_a_etapa: etapa, enviado_por_nome: null, botao_rastreio: null, status: "lido", ...extra,
});
/** O cliente escreveu. */
const dele = (b: Msg, m: number, texto: string | null, extra: Msg = {}): Msg => ({
  ...b, wamid: `wamid.${++seq}`, cliente: b.cliente_pedido, direcao: "entrada", tipo: "text", texto, midia_id: null,
  ocorrido_em: min(m), enviado_por_nome: null, botao_rastreio: null, status: null, ...extra,
});
/** Alguém do time respondeu. */
const nossa = (b: Msg, m: number, quem: string, texto: string, extra: Msg = {}): Msg => ({
  ...b, wamid: `wamid.${++seq}`, cliente: null, direcao: "saida", tipo: "text", texto, midia_id: null,
  ocorrido_em: min(m), enviado_por_nome: quem, botao_rastreio: null, status: "lido", ...extra,
});

const luana = base(NUM_SERVICO, "5584991231007", "Luana Ribeiro", 9007, "em_transito");
const patricia = base(NUM_SERVICO, "5584991231003", "Patrícia Lopes", 9003, "nf_emitida");
const rodrigo = base(NUM_SERVICO, "558488123456", "Rodrigo Alves", 9004, "nf_emitida");
const fernanda = base(NUM_SERVICO, "5584991231005", "Fernanda Rocha", 9005, "etiqueta");
const beatriz = { ...base(NUM_SERVICO, "5584991231009", "Beatriz Nunes", 9009, "em_transito"), vinculo_exato: false };
const gustavo = base(NUM_SERVICO, "5584991231010", "Gustavo Pereira", 9010, "entregue");
const marcos = base(NUM_SERVICO, "5519991231006", "Marcos Teixeira", 9006, "etiqueta");
const juliana = base(NUM_SERVICO, "5584991231001", "Juliana Prado", 9001, "confirmado");
const renato = base(NUM_CLUBE, "5582998761212", "Renato Dias", 9012, "recompra");
const debora = base(NUM_CLUBE, "5584998761234", "Débora Freire", null, "recompra");
const heitor = base(NUM_LOJA, "5581996541275", "Heitor Campos", -7011, "carrinho_1");

const MSGS: Msg[] = [
  // Luana — a conversa aberta nos prints: pergunta nova, sem responsável.
  aviso(luana, 60 * 50, "etiqueta", "Luana, a etiqueta do seu pedido CZ2026100107 foi gerada. Ele segue pela Jadlog, código ME2600EXEMPLO2BR.", { botao_rastreio: "ME2600EXEMPLO2BR" }),
  aviso(luana, 60 * 26, "em_transito", "Luana, seu pedido CZ2026100107 está a caminho! Previsão de entrega: quinta-feira. Acompanhe pelo botão abaixo.", { botao_rastreio: "ME2600EXEMPLO2BR" }),
  dele(luana, 60 * 23, "Oi! Recebi o aviso, obrigada"),
  nossa(luana, 60 * 23 - 12, "Rafael Costa", "Imagina, Luana! Qualquer dúvida é só chamar por aqui. 😊"),
  dele(luana, 42, null, { tipo: "audio", midia_id: "midia-audio-1" }),
  dele(luana, 25, "Meu pedido chega até sexta? Vou viajar no sábado cedo"),
  // Patrícia — "obrigada 👍" com a janela quase fechando.
  aviso(patricia, 60 * 30, "nf_emitida", "Patrícia, a nota fiscal 000412 do seu pedido CZ2026100103 foi emitida. Em breve ele sai para a transportadora."),
  dele(patricia, 60 * 23 + 20, "Recebi, obrigada! 👍"),
  // Rodrigo — em atendimento comigo (Rafael), com mensagem agendada.
  aviso(rodrigo, 60 * 52, "nf_emitida", "Rodrigo, a nota fiscal 000415 do seu pedido CZ2026100104 foi emitida. Em breve ele sai para a transportadora."),
  dele(rodrigo, 125, "Boa tarde! Dá pra trocar o kit de 5 frascos pelo de sachês?"),
  dele(rodrigo, 124, null, { tipo: "document", midia_id: "midia-doc-1", texto: "comprovante-pix.pdf" }),
  nossa(rodrigo, 62, "Rafael Costa", "Dá sim, Rodrigo! Vou confirmar com a logística e te retorno ainda hoje.", { status: "entregue" }),
  // Fernanda — aguardando o comprovante, com a Ana.
  aviso(fernanda, 60 * 30, "etiqueta", "Fernanda, a etiqueta do seu pedido CZ2026100105 foi gerada. Ele segue pela Jadlog, código ME2600EXEMPLO1BR.", { botao_rastreio: "ME2600EXEMPLO1BR" }),
  dele(fernanda, 60 * 4, "Paguei a diferença do frete, vou te mandar o comprovante"),
  nossa(fernanda, 60 * 4 - 8, "Ana Souza", "Combinado, Fernanda! Assim que chegar eu libero o envio."),
  // Beatriz — resolvida e REABERTA, com vínculo provável.
  aviso(beatriz, 60 * 30, "em_transito", "Beatriz, seu pedido CZ2026100109 está a caminho! Previsão de entrega: sexta-feira. Acompanhe pelo botão abaixo.", { botao_rastreio: "AA000000002BR" }),
  dele(beatriz, 60 * 5, "Oi, o pedido vai pra casa da minha mãe né?"),
  nossa(beatriz, 60 * 5 - 15, "Marina Alves", "Isso, Beatriz — está indo para a Rua das Acácias, 120."),
  dele(beatriz, 30, "Ah, esqueci de perguntar: dá pra mudar o endereço?"),
  // Gustavo — resolvida, janela fechada.
  aviso(gustavo, 60 * 51, "entregue", "Gustavo, seu pedido CZ2026100110 foi entregue. Chegou tudo certo? Qualquer coisa, é só responder aqui."),
  dele(gustavo, 60 * 49, "Chegou certinho, obrigado!"),
  nossa(gustavo, 60 * 48, "Ana Souza", "Que bom, Gustavo! Obrigada pela compra. 💚"),
  // Marcos — só o aviso automático: sem pendência.
  aviso(marcos, 60 * 20, "etiqueta", "Marcos, a etiqueta do seu pedido CZ2026100106 foi gerada. Ele segue pela Correios, código AA000000001BR.", { botao_rastreio: "AA000000001BR" }),
  // Juliana — pergunta sem ninguém.
  aviso(juliana, 130, "confirmado", "Oi, Juliana! Seu pedido CZ2026100101 foi confirmado e já está sendo separado. Avisamos aqui a cada passo."),
  dele(juliana, 55, "Oi! Qual o prazo pra chegar em Natal?"),
  // CarboZé Clube — recompra.
  aviso(renato, 60 * 48, "recompra", "Oi, Renato! Já faz um mês que seu CarboZé chegou. Que tal repor antes de acabar? Bora repor?"),
  dele(renato, 180, "Bora! Me manda o link do kit de 5 de novo"),
  aviso(debora, 60 * 26, "recompra", "Oi, Débora! Já faz um mês que seu CarboZé chegou. Que tal repor antes de acabar? Bora repor?"),
  dele(debora, 60 * 5, "Não quero mais receber essas ofertas, por favor"),
  nossa(debora, 60 * 5 - 10, "Rafael Costa", "Tudo bem, Débora! Tirei seu número das ofertas. Os avisos dos seus pedidos continuam chegando."),
  // CarboZé Loja — carrinho.
  aviso(heitor, 40, "carrinho_1", "Oi, Heitor! Vi que você começou um pedido com CarboZé 100ml - Kit 5 frascos. Ele continua salvo: https://loja.exemplo.com.br/checkout/carrinho"),
  dele(heitor, 12, "Tive problema no cartão, dá pra pagar no Pix?"),
];

const doNumero = (n: unknown) => MSGS.filter((m) => m.numero_id === n);

// ── Janela (última mensagem do cliente), status, etiquetas ─────────────────
const ultimaEntrada = (wa: string) => {
  const e = MSGS.filter((m) => m.wa_id === wa && m.direcao === "entrada").map((m) => m.ocorrido_em as string).sort();
  return e.length ? e[e.length - 1] : null;
};
const CONTATOS = [...new Set(MSGS.map((m) => `${m.numero_id}|${m.wa_id}`))].map((k) => {
  const [numero_id, wa_id] = k.split("|");
  return { numero_id, wa_id, last_inbound_at: ultimaEntrada(wa_id) };
});

const at = (b: Msg, status: string, desde: string, quem: { id: string; full_name: string } | null) => ({
  numero_id: b.numero_id, wa_id: b.wa_id, status, desde, responsavel: quem?.id ?? null, responsavel_nome: quem?.full_name ?? null,
});
const ATENDIMENTO = [
  at(rodrigo, "em_atendimento", min(118), U.colab),
  at(fernanda, "aguardando", min(60 * 4 - 9), U.vend2),
  at(beatriz, "resolvido", min(60 * 3), U.gestor),
  at(gustavo, "resolvido", min(60 * 47), U.vend2),
  at(debora, "em_atendimento", min(60 * 5 - 11), U.colab),
];

const TAGS = [
  { id: "t-prazo", nome: "Prazo de entrega", cor: "ambar", ativo: true },
  { id: "t-troca", nome: "Troca", cor: "vermelho", ativo: true },
  { id: "t-comprovante", nome: "Comprovante", cor: "azul", ativo: true },
  { id: "t-recompra", nome: "Quer recomprar", cor: "verde", ativo: true },
  { id: "t-endereco", nome: "Mudança de endereço", cor: "roxo", ativo: true },
  { id: "t-elogio", nome: "Elogio", cor: "cinza", ativo: true },
];
const tag = (b: Msg, id: string) => ({ numero_id: b.numero_id, wa_id: b.wa_id, tag_id: id, carbo_wa_tags: TAGS.find((t) => t.id === id) });
const CONVERSA_TAG = [
  tag(luana, "t-prazo"),
  tag(rodrigo, "t-troca"), tag(rodrigo, "t-comprovante"),
  tag(fernanda, "t-comprovante"),
  tag(beatriz, "t-endereco"),
  tag(gustavo, "t-elogio"),
  tag(renato, "t-recompra"),
];

const NOTAS = [
  { id: "nota1", wa_id: luana.wa_id, texto: "A Jadlog confirmou a previsão para quinta. Se ela perguntar de novo, pode garantir antes de sábado.", autor: U.gestor.id, autor_nome: "Marina Alves", criado_em: min(18), apagada_em: null },
];
const AGENDADAS = [
  { id: "ag1", wa_id: rodrigo.wa_id, texto: "Rodrigo, a troca foi aprovada! O kit de sachês sai amanhã.", enviar_em: new Date(agora + 150 * 60000).toISOString(), status: "pendente", motivo: null, erro_codigo: null, criado_em: min(30) },
];
const RESPOSTAS = [
  { id: "r1", atalho: "frete", corpo: "Me manda o CEP que eu calculo o frete pra você.", criado_por: U.colab.id, criado_em: min(60 * 24 * 20) },
  { id: "r2", atalho: "prazo", corpo: "O prazo começa a contar depois que a nota fiscal sai. Te aviso por aqui a cada passo!", criado_por: U.gestor.id, criado_em: min(60 * 24 * 30) },
  { id: "r3", atalho: "pix", corpo: "Pode pagar no Pix, sim! Vou te mandar o link do checkout com o Pix habilitado.", criado_por: U.vend2.id, criado_em: min(60 * 24 * 12) },
  { id: "r4", atalho: "troca", corpo: "Sem problema! Me conta o motivo da troca e me manda uma foto da embalagem, por favor.", criado_por: U.colab.id, criado_em: min(60 * 24 * 8) },
];
const NOTIFICAVEIS = [
  { user_id: U.gestor.id, full_name: "Marina Alves", allowed_interfaces: ["carbo_atendimento"], recebe: true, marcado_em: min(60 * 24 * 40) },
  { user_id: U.colab.id, full_name: "Rafael Costa", allowed_interfaces: ["carbo_atendimento"], recebe: true, marcado_em: min(60 * 24 * 40) },
  { user_id: U.vend2.id, full_name: "Ana Souza", allowed_interfaces: ["carbo_atendimento"], recebe: false, marcado_em: null },
  { user_id: U.closer.id, full_name: "Bruno Lima", allowed_interfaces: ["carbo_atendimento"], recebe: false, marcado_em: null },
];
const ATENDENTES = [U.gestor, U.colab, U.vend2, U.closer].map((u) => ({ user_id: u.id, full_name: u.full_name }));

/** A esteira inteira (a função dela alterna "tudo" e "só os antigos"). */
const esteiraInteira = () => {
  const a = daEsteira("bling2_esteira") as unknown[];
  const b = daEsteira("bling2_esteira") as unknown[];
  return a.length >= b.length ? a : b;
};

export const FX: Record<string, unknown> = {
  carbo_wa_numeros: porRota("carbo_wa_numeros", () => NUMEROS),
  carbo_wa_nao_contatar: porRota("carbo_wa_nao_contatar", () => [
    { chave: "8498761234", motivo: "marcado na conversa", marcado_em: min(60 * 5 - 9), removido_em: null },
  ]),
  bling2_esteira: porRota("bling2_esteira", esteiraInteira),
  carbo_wa_contatos: CONTATOS,
  carbo_wa_atendimento: ATENDIMENTO,
  carbo_wa_conversa_tag: CONVERSA_TAG,
  carbo_wa_tags: TAGS,
  carbo_wa_notas: NOTAS,
  carbo_wa_agendadas: AGENDADAS,
  carbo_wa_respostas: RESPOSTAS,
  carbo_wa_notificaveis: NOTIFICAVEIS,
  carbo_wa_atendentes: ATENDENTES,
  // Busca e galeria dentro de uma conversa leem a view direto (o mock ignora o
  // `ilike`, então a busca devolve a conversa inteira).
  carbo_wa_conversas: MSGS,
};

export const RPC_FX: Record<string, unknown> = {
  carbo_wa_caixa: (a: { p_numero_id?: string }) => doNumero(a.p_numero_id),
  carbo_wa_conversa_mensagens: (a: { p_numero_id?: string; p_wa_id?: string }) =>
    MSGS.filter((m) => m.numero_id === a.p_numero_id && m.wa_id === a.p_wa_id)
      .sort((x, y) => String(x.ocorrido_em).localeCompare(String(y.ocorrido_em))),
  carbo_wa_nomes_por_fone: [],
};
void hrs;
