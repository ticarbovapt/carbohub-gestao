// Fixtures da área "esteira" (ver areas.ts): Esteira do On-line (os três
// quadros) e Mensagens ao cliente. Tudo FICTÍCIO — nenhum cliente, pedido,
// telefone ou rastreio é real.
//
// ⚠️ O mock ignora `.lt()`/`.not()`, então a consulta dos "travados antes do
// período" recebe o mesmo que o quadro. Ela é a SEGUNDA leitura de
// `bling2_esteira` ao abrir a tela (o quadro é a primeira): a função alterna —
// chamada ímpar devolve tudo (o quadro recorta pela janela com gte/lte, que o
// mock aplica), chamada par devolve só os antigos.
import { PAPEL, U, EU } from "./pessoas";
void PAPEL; void U; void EU;

const agora = Date.now();
const pad = (n: number) => String(n).padStart(2, "0");
const diaLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Dia (YYYY-MM-DD) `n` dias atrás (negativo = futuro). */
const dia = (n: number) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - n); return diaLocal(d); };
/** Instante `m` minutos atrás (negativo = futuro). */
const min = (m: number) => new Date(agora - m * 60000).toISOString();
const hrs = (h: number) => min(h * 60);
const dias = (d: number) => min(d * 1440);
const url = () => { try { return location.search; } catch { return ""; } };

const NUM_SERVICO = "1255756280958635";
const NUM_CLUBE = "1274076859132981";
const NUM_LOJA = "1347087218483622";

// ── Esteira de entrega (bling2_esteira) ─────────────────────────────────────
const base = {
  pedido_numero: null, loja_id: 1, e_online: true, cliente_doc: "12345678909",
  entrega_endereco: "Rua das Acácias, 120", entrega_bairro: "Centro", entrega_cep: "59000-000",
  nf_numero: null, nf_chave: null, nf_situacao: null, nf_data: null, nf_pdf: null,
  transportadora: null, servico: null, rastreio: null, volumes: 1, peso_kg: 0.6,
  items: [{ quantidade: 1, descricao: "CarboZé 100ml - Kit 5 frascos", valor: 149.5 }],
  carboze_order_id: null, carboze_order_number: null, tem_status_da_plataforma: true,
  rastreio_origem: null, me_situacao: null, me_gerado_em: null, me_expirado_em: null, me_tem_ativo: null,
};
let seq = 0;
const ped = (bling_id: number, cliente: string, canal: string, cidade: string, uf: string, total: number,
             diasAtras: number, etapa: string, extra: Record<string, unknown> = {}) => {
  seq++;
  return {
    ...base, bling_id, cliente, canal, entrega_cidade: cidade, entrega_uf: uf, total,
    data_pedido: dia(diasAtras), etapa,
    pedido_numero: String(24100 + seq), pedido_loja: canal === "PayT" ? `PAYT_EXEMPLO_${bling_id}` : String(3300 + seq),
    pedido_codigo: `CZ2026100${String(100 + seq)}`,
    cliente_fone: "84991230000".replace(/0000$/, String(1000 + seq)),
    ...extra,
  };
};
const comNF = (n: string, d: number) => ({ nf_numero: n, nf_situacao: "Autorizada", nf_data: dia(d), nf_chave: "24261036060692000100550010000" + n + "1234567890", nf_pdf: "https://exemplo.com.br/danfe.pdf" });

const ESTEIRA = [
  ped(9001, "Juliana Prado", "Nuvemshop", "Natal", "RN", 149.5, 1, "confirmado"),
  ped(9002, "Carlos Menezes", "Mercado Livre", "Recife", "PE", 89.7, 2, "confirmado", { cliente_fone: null }),
  ped(9003, "Patrícia Lopes", "Nuvemshop", "Mossoró", "RN", 299.0, 10, "nf_emitida", { ...comNF("000412", 9), transportadora: "Jadlog", servico: ".Package" }),
  ped(9004, "Rodrigo Alves", "PayT", "Fortaleza", "CE", 179.5, 3, "nf_emitida", { ...comNF("000415", 2), cliente_fone: "8488123456", me_situacao: "rascunho", me_tem_ativo: true }),
  ped(9005, "Fernanda Rocha", "Nuvemshop", "João Pessoa", "PB", 149.5, 4, "etiqueta", {
    ...comNF("000408", 3), transportadora: "Jadlog", servico: ".Package", rastreio: "ME2600EXEMPLO1BR",
    rastreio_origem: "melhorenvio", me_situacao: "gerado", me_gerado_em: dias(2), me_expirado_em: min(-2 * 1440 - 60), me_tem_ativo: true,
  }),
  ped(9006, "Marcos Teixeira", "Amazon", "Campinas", "SP", 119.6, 5, "etiqueta", {
    ...comNF("000403", 4), transportadora: "Correios", servico: "PAC", rastreio: "AA000000001BR", tem_status_da_plataforma: false,
  }),
  ped(9007, "Luana Ribeiro", "Nuvemshop", "Parnamirim", "RN", 239.0, 6, "em_transito", {
    ...comNF("000399", 5), transportadora: "Jadlog", servico: ".Package", rastreio: "ME2600EXEMPLO2BR", rastreio_origem: "melhorenvio",
    me_situacao: "postado", me_tem_ativo: true,
    items: [{ quantidade: 2, descricao: "CarboZé 100ml - Kit 5 frascos", valor: 119.5 }],
  }),
  ped(9008, "Thiago Martins", "Mercado Livre", "Salvador", "BA", 59.9, 9, "em_transito", {
    ...comNF("000390", 8), transportadora: "Mercado Envios", servico: "Normal", rastreio: "MEL40000000001FMDOF01", cliente_fone: null,
  }),
  ped(9009, "Beatriz Nunes", "PayT", "Caruaru", "PE", 149.5, 7, "em_transito", {
    ...comNF("000395", 6), transportadora: "Correios", servico: "SEDEX", rastreio: "AA000000002BR",
  }),
  ped(9010, "Gustavo Pereira", "Nuvemshop", "Natal", "RN", 149.5, 12, "entregue", {
    ...comNF("000370", 11), transportadora: "Jadlog", servico: ".Package", rastreio: "ME2600EXEMPLO3BR",
  }),
  ped(9011, "Aline Castro", "Mercado Livre", "Teresina", "PI", 89.7, 14, "entregue", {
    ...comNF("000362", 13), transportadora: "Mercado Envios", servico: "Normal", rastreio: "MEL40000000002FMDOF01", cliente_fone: null,
  }),
  ped(9012, "Renato Dias", "PayT", "Maceió", "AL", 269.1, 15, "entregue", {
    ...comNF("000358", 14), transportadora: "Correios", servico: "PAC", rastreio: "AA000000003BR",
  }),
  ped(9013, "Sérgio Lima", "Nuvemshop", "Natal", "RN", 149.5, 8, "cancelado"),
];
// Anteriores à janela de 30 dias e ainda sem "Entregue".
const ANTIGOS = [
  ped(8001, "Edson Freitas", "Nuvemshop", "Natal", "RN", 59.9, 45, "etiqueta", {
    ...comNF("000201", 44), transportadora: "Jadlog", servico: ".Package", rastreio: "ME2600EXEMPLO9BR",
    me_situacao: "vencido", me_tem_ativo: false,
  }),
  ped(8002, "Mirela Santos", "PayT", "Recife", "PE", 149.5, 38, "nf_emitida", comNF("000233", 37)),
];
let leituras = 0;
const esteira = () => (leituras++ % 2 === 0 ? [...ESTEIRA, ...ANTIGOS] : ANTIGOS);

// ── Rastreio dos códigos ────────────────────────────────────────────────────
const ev = (m: number, descricao: string, cidade: string, uf: string) => ({ ocorrido_em: min(m), descricao, status: null, cidade, uf });
const rast = (codigo: string, extra: Record<string, unknown>) => ({
  codigo, fonte: "melhorenvio", fonte_id: null, transportadora: null, servico: null, status: null, status_descricao: null,
  previsao_entrega: null, postado_em: null, entregue_em: null, ultimo_evento_em: null,
  url_rastreio: `https://rastreio.exemplo.com.br/${codigo}`, consultado_em: min(35), erro: null, atrasado: false,
  qtd_eventos: 0, eventos: [], ...extra,
});
const RASTREIO = [
  rast("ME2600EXEMPLO2BR", {
    previsao_entrega: dia(-2), postado_em: dias(4),
    eventos: [
      ev(60 * 7, "Em trânsito para a unidade de destino", "Natal", "RN"),
      ev(60 * 30, "Saiu do centro de distribuição", "Recife", "PE"),
      ev(60 * 70, "Postado — coletado pela transportadora", "São Paulo", "SP"),
    ],
  }),
  rast("MEL40000000001FMDOF01", {
    fonte: "mercadolivre", previsao_entrega: dia(2), atrasado: true, postado_em: dias(7),
    eventos: [ev(60 * 50, "Em trânsito", "Salvador", "BA")],
  }),
  rast("AA000000002BR", { previsao_entrega: dia(-1), eventos: [ev(60 * 20, "Objeto em trânsito — por favor aguarde", "Caruaru", "PE")] }),
  rast("ME2600EXEMPLO3BR", { entregue_em: dias(8), eventos: [ev(60 * 24 * 8, "Entregue ao destinatário", "Natal", "RN")] }),
  rast("MEL40000000002FMDOF01", { entregue_em: dias(10), eventos: [ev(60 * 24 * 10, "Entregue", "Teresina", "PI")] }),
  rast("AA000000003BR", { entregue_em: dias(11), eventos: [ev(60 * 24 * 11, "Objeto entregue ao destinatário", "Maceió", "AL")] }),
];

// ── Avisos (carbo_msg_envios) — uma linha por (pedido/carrinho, etapa) ─────
const envio = (bling_id: number, etapa: string, status: string, extra: Record<string, unknown> = {}) => ({
  bling_id, etapa, status, detectado_em: hrs(3 + (bling_id % 7)), enviado_em: status === "pendente" || status === "ignorado" ? null : hrs(3 + (bling_id % 7)),
  telefone: "5584991231001", mensagem: null, motivo: null, canal: "meta", erro_codigo: null, entregue_em: null, lido_em: null, ...extra,
});
const ENVIOS = [
  envio(9001, "confirmado", "lido", { lido_em: hrs(2) }),
  envio(9003, "confirmado", "lido"),
  envio(9003, "nf_emitida", "enviado"),
  envio(9004, "confirmado", "enviado"),
  envio(9004, "nf_emitida", "falhou", { erro_codigo: 131026, motivo: "Meta 131026 — o número não recebe WhatsApp", telefone: "558488123456" }),
  envio(9005, "confirmado", "lido"),
  envio(9005, "nf_emitida", "lido"),
  envio(9005, "etiqueta", "pendente", { motivo: "esperando: rastreio" }),
  envio(9007, "confirmado", "lido"),
  envio(9007, "nf_emitida", "lido"),
  envio(9007, "etiqueta", "lido"),
  envio(9007, "em_transito", "lido", { lido_em: hrs(5) }),
  envio(9009, "em_transito", "entregue"),
  envio(9010, "entregue", "lido"),
  envio(9012, "entregue", "entregue"),
  // Régua de recompra
  envio(7004, "recompra", "lido"),
  envio(7005, "recompra", "falhou", { erro_codigo: 131026, motivo: "o número não recebe WhatsApp" }),
  envio(7007, "recompra", "entregue", { enviado_em: dias(5) }),
  // Carrinho
  envio(5002, "carrinho_1", "lido"),
  envio(5003, "carrinho_1", "entregue"), envio(5003, "carrinho_2", "entregue"),
  envio(5004, "carrinho_1", "lido"), envio(5004, "carrinho_2", "lido"), envio(5004, "carrinho_3", "entregue"),
  envio(5005, "carrinho_1", "lido"), envio(5005, "carrinho_2", "lido"),
  envio(5009, "carrinho_1", "falhou", { erro_codigo: 131026, motivo: "o número não recebe WhatsApp" }),
];

// ── Pago, ainda fora do Bling ───────────────────────────────────────────────
const AGUARDANDO = [
  { platform: "payt", pedido_loja: "7KQ2XEMP", canal: "PayT", data_pedido: dia(0), ordered_at: hrs(3.2), total: 179.5, itens: 2,
    produtos: "CarboZé 100ml - Kit 5 frascos", cliente: "Vanessa Moura", cliente_fone: "(84) 99123-4567", cliente_email: "vanessa@exemplo.com.br", minutos_parado: 192 },
  { platform: "nuvemshop", pedido_loja: "3321", canal: "Nuvemshop", data_pedido: dia(0), ordered_at: min(22), total: 149.5, itens: 1,
    produtos: "CarboZé 100ml - Kit 5 frascos", cliente: "Otávio Brandão", cliente_fone: "(83) 98877-6655", cliente_email: null, minutos_parado: 22 },
  { platform: "mercadolivre", pedido_loja: "2000099990001", canal: "Mercado Livre", data_pedido: dia(0), ordered_at: min(9), total: 59.9, itens: 1,
    produtos: "CarboZé 100ml", cliente: "Comprador ML", cliente_fone: null, cliente_email: null, minutos_parado: 9 },
];

const PARADOS = [
  { bling_id: 9003, etapa: "nf_emitida", dias_parado: 9, limite_dias: 5, etiqueta_morta: false, diagnostico: "nota emitida há 9 dias e nenhuma etiqueta" },
];

// ── Régua de recompra ───────────────────────────────────────────────────────
const rec = (bling_id: number, cliente: string, canal: string, cidade: string, uf: string, total: number,
             d: number, coluna: string, extra: Record<string, unknown> = {}) => ({
  bling_id, pedido_loja: String(bling_id), canal, cliente, cliente_fone: `8499876${String(bling_id).slice(-4)}`, cpf_cnpj: null,
  total, entrega_cidade: cidade, entrega_uf: uf, entregue_em: dias(d), origem_da_data: "rastreio",
  ofertado_em: null, recomprou: false, dias_desde_entrega: d, coluna, ...extra,
});
const RECOMPRA = [
  rec(7001, "Juliana Prado", "Nuvemshop", "Natal", "RN", 149.5, 12, "entregue"),
  rec(7011, "Heitor Campos", "PayT", "Recife", "PE", 179.5, 20, "entregue"),
  rec(7002, "Carlos Menezes", "Mercado Livre", "Recife", "PE", 89.7, 18, "entregue", { cliente_fone: null }),
  rec(7003, "Patrícia Lopes", "Nuvemshop", "Mossoró", "RN", 299.0, 31, "ofertar"),
  rec(7012, "Igor Sales", "Nuvemshop", "Natal", "RN", 149.5, 34, "ofertar"),
  rec(7004, "Luana Ribeiro", "Nuvemshop", "Parnamirim", "RN", 239.0, 33, "ofertado", { ofertado_em: dias(2) }),
  rec(7005, "Gustavo Pereira", "PayT", "Natal", "RN", 149.5, 32, "ofertado", { ofertado_em: dias(1) }),
  rec(7006, "Aline Castro", "Nuvemshop", "Teresina", "PI", 269.1, 40, "recomprou", { recomprou: true }),
  rec(7007, "Renato Dias", "PayT", "Maceió", "AL", 149.5, 41, "sem_retorno", { ofertado_em: dias(5) }),
  rec(7008, "Débora Freire", "Nuvemshop", "Natal", "RN", 149.5, 35, "ofertar", { cliente_fone: "84998761234" }),
  rec(7009, "Wagner Souto", "Nuvemshop", "Natal", "RN", 149.5, 120, "historico", { origem_da_data: "historico" }),
  rec(7010, "Rita Valença", "Nuvemshop", "Fortaleza", "CE", 299.0, 110, "historico", { origem_da_data: "historico" }),
];
const NAO_CONTATAR = [{ chave: "8498761234" }];

// ── Recuperação de carrinho ─────────────────────────────────────────────────
const car = (checkout_id: number, cliente: string, total: number, minutosParado: number, coluna: string,
             extra: Record<string, unknown> = {}) => ({
  checkout_id, abandonado_em: min(minutosParado), completado_em: null, cliente,
  telefone: `(84) 99654-${String(1000 + Math.abs(checkout_id) % 1000)}`, email: `${(cliente ?? "x").split(" ")[0].toLowerCase()}@exemplo.com.br`,
  total, itens: 1, produtos: "CarboZé 100ml - Kit 5 frascos ×1", link: "https://loja.exemplo.com.br/checkout/carrinho",
  msg1_em: null, msg2_em: null, msg3_em: null, recuperado: false, tem_telefone: true, tem_mais_novo: false,
  minutos_parado: minutosParado, proxima_em: null, coluna, ...extra,
});
const CARRINHO = [
  car(5001, "Paula Guedes", 149.5, 6, "aberto", { proxima_em: min(-9) }),
  car(5010, "Rafaela Torres", 299.0, 11, "aberto", { proxima_em: min(-4), produtos: "CarboZé 100ml - Kit 5 frascos ×2" }),
  car(5002, "Henrique Barros", 59.9, 60 * 5, "msg1", { msg1_em: hrs(4.7), proxima_em: min(-60 * 14), produtos: "CarboZé 100ml ×1" }),
  car(-5003, "Lívia Carvalho", 179.5, 60 * 30, "msg2", { msg1_em: hrs(29), msg2_em: hrs(6), proxima_em: min(-60 * 40) }),
  car(5004, "Diego Araújo", 149.5, 60 * 80, "msg3", { msg1_em: hrs(79), msg2_em: hrs(56), msg3_em: hrs(8) }),
  car(5005, "Camila Rezende", 149.5, 60 * 28, "msg2", { msg1_em: hrs(27), msg2_em: hrs(4) }),
  car(5006, "Bruna Leal", 149.5, 60 * 26, "recuperado", { recuperado: true, completado_em: hrs(20) }),
  car(5007, "Fábio Nogueira", 89.7, 60 * 24 * 6, "perdido"),
  car(5008, null as unknown as string, 149.5, 60 * 3, "sem_telefone", { cliente: null, telefone: null, email: "comprador@exemplo.com.br", tem_telefone: false }),
  car(5009, "Márcio Pinto", 149.5, 60 * 9, "msg1", { msg1_em: hrs(8.7) }),
];
const RESPOSTAS = [{ checkout_id: 5005, wa_id: "5584996541005", numero_id: NUM_LOJA, respondeu_em: hrs(3) }];

// ── Templates de mensagem (carbo_msg_templates) ─────────────────────────────
const v = (nome: string, de: string, fallback?: string) => (fallback ? { nome, de, fallback } : { nome, de });
const tpl = (etapa: string, titulo: string, ativo: boolean, numero_id: string, nome: string, texto: string,
             vars: unknown[], botao: string | null = null) => ({
  etapa, instancia: null, ativo, titulo, texto, atraso_min: etapa === "entregue" ? 120 : 0, atualizado_em: dias(10),
  canal_envio: "meta", meta_template_nome: nome, meta_status: "APPROVED", meta_variaveis: vars, meta_botao_url_de: botao, numero_id,
});
const TEMPLATES = [
  tpl("confirmado", "Pedido confirmado", true, NUM_SERVICO, "pedido_confirmado",
    "Oi, {{primeiro_nome}}! Seu pedido {{pedido}} foi confirmado e já está sendo separado. Avisamos aqui a cada passo.",
    [v("primeiro_nome", "primeiro_nome", "tudo bem"), v("pedido", "pedido")]),
  tpl("nf_emitida", "Nota fiscal emitida", true, NUM_SERVICO, "nota_fiscal_emitida",
    "{{primeiro_nome}}, a nota fiscal {{nf}} do seu pedido {{pedido}} foi emitida. Em breve ele sai para a transportadora.",
    [v("primeiro_nome", "primeiro_nome", "tudo bem"), v("nf", "nf"), v("pedido", "pedido")]),
  tpl("etiqueta", "Etiqueta gerada", true, NUM_SERVICO, "etiqueta_gerada",
    "{{primeiro_nome}}, a etiqueta do seu pedido {{pedido}} foi gerada. Ele segue pela {{transportadora}}, código {{rastreio}}.",
    [v("primeiro_nome", "primeiro_nome", "tudo bem"), v("pedido", "pedido"), v("transportadora", "transportadora", "transportadora"), v("rastreio", "rastreio")], "rastreio"),
  tpl("em_transito", "Pedido a caminho", true, NUM_SERVICO, "pedido_em_transito",
    "{{primeiro_nome}}, seu pedido {{pedido}} está a caminho! Previsão de entrega: {{previsao}}. Acompanhe pelo botão abaixo.",
    [v("primeiro_nome", "primeiro_nome", "tudo bem"), v("pedido", "pedido"), v("previsao", "previsao", "em breve")], "rastreio"),
  tpl("saiu_entrega", "Saiu para entrega", true, NUM_SERVICO, "saiu_para_entrega",
    "{{primeiro_nome}}, seu pedido {{pedido}} saiu para entrega hoje! Fique de olho.",
    [v("primeiro_nome", "primeiro_nome", "tudo bem"), v("pedido", "pedido")], "rastreio"),
  tpl("entregue", "Pedido entregue", true, NUM_SERVICO, "pedido_entregue",
    "{{primeiro_nome}}, seu pedido {{pedido}} foi entregue. Chegou tudo certo? Qualquer coisa, é só responder aqui.",
    [v("primeiro_nome", "primeiro_nome", "tudo bem"), v("pedido", "pedido")]),
  tpl("recompra", "Hora de repor", false, NUM_CLUBE, "recompra_lembrete",
    "Oi, {{primeiro_nome}}! Já faz um mês que seu CarboZé chegou. Que tal repor antes de acabar? Bora repor?",
    [v("primeiro_nome", "primeiro_nome", "tudo bem")]),
  tpl("carrinho_1", "Carrinho — lembrete 1", false, NUM_LOJA, "carrinho_lembrete_1",
    "Oi, {{primeiro_nome}}! Vi que você começou um pedido com {{produtos}}. Ele continua salvo: {{link_carrinho}}",
    [v("primeiro_nome", "primeiro_nome", "tudo bem"), v("produtos", "produtos", "os produtos que você escolheu"), v("link_carrinho", "link_carrinho")]),
  tpl("carrinho_2", "Carrinho — lembrete 2", false, NUM_LOJA, "carrinho_lembrete_2",
    "{{primeiro_nome}}, seu carrinho de {{valor}} com {{produtos}} continua esperando por você: {{link_carrinho}}",
    [v("primeiro_nome", "primeiro_nome", "tudo bem"), v("valor", "valor", "compras"), v("produtos", "produtos", "os produtos que você escolheu"), v("link_carrinho", "link_carrinho")]),
  tpl("carrinho_3", "Carrinho — lembrete 3", false, NUM_LOJA, "carrinho_lembrete_3",
    "{{primeiro_nome}}, última chamada: seu carrinho ainda está salvo aqui {{link_carrinho}}",
    [v("primeiro_nome", "primeiro_nome", "tudo bem"), v("link_carrinho", "link_carrinho")]),
];
const NUMEROS = [
  { phone_number_id: NUM_SERVICO, rotulo: "CarboZé", numero_exibicao: "(84) 90000-0001" },
  { phone_number_id: NUM_CLUBE, rotulo: "CarboZé Clube", numero_exibicao: "(84) 90000-0002" },
  { phone_number_id: NUM_LOJA, rotulo: "CarboZé Loja", numero_exibicao: "(84) 90000-0003" },
];

// Uma fonte parada só quando a URL pede (`&alarme=1`) — para o print do alarme.
const FONTES = () => url().includes("alarme")
  ? [
      { fonte: "Bling 2 (filial) — pedidos", ultima_rodada: min(95), minutos: 95, limite_min: 15, atrasada: true, observacao: null },
      { fonte: "Rastreio das transportadoras", ultima_rodada: min(8), minutos: 8, limite_min: 30, atrasada: false, observacao: null },
    ]
  : [{ fonte: "Bling 2 (filial) — pedidos", ultima_rodada: min(1), minutos: 1, limite_min: 15, atrasada: false, observacao: null }];

export const FX: Record<string, unknown> = {
  bling2_esteira: esteira,
  ecommerce_aguardando_bling: AGUARDANDO,
  carbo_esteira_parados: PARADOS,
  rastreio_card: RASTREIO,
  carbo_msg_envios: ENVIOS,
  carbo_recompra_pipeline: RECOMPRA,
  carbo_recompra_config: [{ dias_para_ofertar: 30, dias_para_desistir: 2 }],
  carbo_carrinho_pipeline: CARRINHO,
  carbo_carrinho_config: [{ minutos_1: 15, horas_2: 24, horas_3: 48, hora_2: 9, dias_2: 1, hora_3: 9, dias_3: 2, horas_desistir: 72, valor_minimo: 0, inicio_em: dias(30) }],
  carbo_carrinho_respostas: RESPOSTAS,
  carbo_wa_nao_contatar: NAO_CONTATAR,
  fontes_saude: FONTES,
  carbo_msg_templates: TEMPLATES,
  carbo_wa_numeros: NUMEROS,
  carbo_msg_fila: [{ bling_id: 9005 }, { bling_id: 9009 }, { bling_id: 9012 }],
};
export const RPC_FX: Record<string, unknown> = {};
