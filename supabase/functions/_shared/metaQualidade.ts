// ─────────────────────────────────────────────────────────────────────────────
// Qualidade do número e conferência dos modelos — as REGRAS, puras e testadas
// (src/test/whatsapp-meta/qualidade.test.ts). Quem fala com a Meta é o
// `whatsapp-meta`; aqui só se decide.
//
// Pedido do dono do processo em 20/11/2026, ao ligar a régua de 7 dias:
// *"garantir a qualidade do número nosso"* e *"ver os modelos certinho para
// sair corretamente"*.
// ─────────────────────────────────────────────────────────────────────────────

/** A nota que a Meta dá ao número (`quality_rating`). */
export type Qualidade = "GREEN" | "YELLOW" | "RED";

const ORDEM: Record<string, number> = { GREEN: 0, YELLOW: 1, RED: 2 };

/** O que a Meta devolveu, já reduzido ao que importa. Desconhecido vira `null`. */
export function lerQualidade(bruto: unknown): Qualidade | null {
  const s = String(bruto ?? "").toUpperCase();
  return s in ORDEM ? (s as Qualidade) : null;
}

/**
 * O comercial (recompra, carrinho) deste número está PAUSADO?
 *
 * ⚠️ Pausa a partir do LIMIAR do cadastro (`carbo_wa_numeros.pausa_qualidade`):
 * `YELLOW` pausa no amarelo e no vermelho; `RED`, só no vermelho; nulo, nunca.
 * A Meta derruba o limite diário e chega a bloquear o número quando a nota
 * cai, e quem mais pesa nela é mensagem de MARKETING: parar a oferta no
 * amarelo é o que deixa a nota voltar ao verde sem perder o número.
 *
 * ⚠️ Qualidade DESCONHECIDA (leitura falhou, a Meta mandou `NA`/`UNKNOWN`) NÃO
 * pausa. Fechar aqui pararia a régua toda vez que o token não pudesse ler a
 * nota — para sempre e calado. A falha de leitura fica registrada
 * (`qualidade_erro`) e aparece na conferência; quem PROTEGE de verdade é o
 * próprio número da Meta mais a pausa manual (`comercial_pausado`).
 *
 * Os avisos da esteira (NF, saiu para entrega…) NÃO passam por aqui: são
 * serviço que o cliente comprou, e saem por outro número.
 */
export function comercialPausado(
  qualidade: unknown, limiar: unknown, pausaManual: boolean,
): { pausado: boolean; motivo: string | null } {
  if (pausaManual) return { pausado: true, motivo: "pausa manual (comercial_pausado)" };
  const q = lerQualidade(qualidade);
  const l = lerQualidade(limiar);
  if (!q || !l) return { pausado: false, motivo: null };
  if (ORDEM[q] >= ORDEM[l]) {
    return { pausado: true, motivo: `qualidade do número ${NOME_COR[q]} na Meta` };
  }
  return { pausado: false, motivo: null };
}

export const NOME_COR: Record<Qualidade, string> = { GREEN: "VERDE", YELLOW: "AMARELA", RED: "VERMELHA" };

// ── Conferência do modelo ────────────────────────────────────────────────────

/** Um template como a API de gestão da Meta o devolve. */
export interface TemplateMeta {
  name: string;
  status?: string;
  language?: string;
  category?: string;
  parameter_format?: string;
  quality_score?: { score?: string } | null;
  components?: Array<{
    type: string; format?: string; text?: string;
    buttons?: Array<{ type: string; text?: string; url?: string }>;
  }>;
}

/** Um template como está em `carbo_msg_templates`. */
export interface TemplateNosso {
  etapa: string;
  meta_template_nome: string | null;
  meta_idioma: string | null;
  meta_variaveis: Array<{ nome: string; fallback?: string }> | null;
  meta_botao_url_de: string | null;
  meta_status: string | null;
  texto: string | null;
}

export interface Conferencia {
  etapa: string;
  template: string | null;
  /** Nada que impeça a mensagem de sair como aprovada. */
  ok: boolean;
  /** O que faria o envio FALHAR ou sair diferente do aprovado. */
  problemas: string[];
  /** O que não impede o envio, mas merece olho (rodapé, texto do espelho…). */
  avisos: string[];
  qualidade_modelo: string | null;
  rodape_na_meta: string | null;
}

/** As variáveis `{{x}}` de um texto, na ordem em que aparecem. */
export function variaveisDoTexto(texto: string | null | undefined): string[] {
  return [...String(texto ?? "").matchAll(/\{\{\s*([^}\s]+)\s*\}\}/g)].map((m) => m[1]);
}

/** Texto comparável: quebras de linha da Meta (\r\n) e espaços nas pontas. */
const normalizar = (s: string | null | undefined) =>
  String(s ?? "").replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();

/**
 * Compara o modelo APROVADO na Meta com o que o sistema vai mandar.
 *
 * ⚠️ É a pergunta que o envio não faz: o `whatsapp-meta` monta o payload a
 * partir do NOSSO cadastro, e a Meta só diz que ele não bate quando recusa a
 * mensagem de um cliente de verdade (132000, 132012…). Aqui a recusa vira
 * linha de relatório ANTES de sair.
 */
export function conferirTemplate(nosso: TemplateNosso, meta: TemplateMeta | null): Conferencia {
  const problemas: string[] = [];
  const avisos: string[] = [];
  const base: Conferencia = {
    etapa: nosso.etapa, template: nosso.meta_template_nome, ok: false,
    problemas, avisos, qualidade_modelo: null, rodape_na_meta: null,
  };

  if (!nosso.meta_template_nome) {
    problemas.push("a etapa não tem nome de template cadastrado");
    return base;
  }
  if (!meta) {
    problemas.push(`não existe na Meta um modelo "${nosso.meta_template_nome}" no idioma ${nosso.meta_idioma ?? "pt_BR"}`);
    return base;
  }

  const status = String(meta.status ?? "").toUpperCase();
  if (status !== "APPROVED") problemas.push(`na Meta o modelo está ${status || "sem status"}, não APPROVED`);
  if (String(nosso.meta_status ?? "").toUpperCase() !== status && status) {
    avisos.push(`o banco diz ${nosso.meta_status ?? "nada"} e a Meta diz ${status}`);
  }
  if (meta.language && nosso.meta_idioma && meta.language !== nosso.meta_idioma) {
    problemas.push(`idioma na Meta é ${meta.language}, o envio manda ${nosso.meta_idioma}`);
  }
  base.qualidade_modelo = meta.quality_score?.score ?? null;
  const qm = lerQualidade(base.qualidade_modelo);
  if (qm && qm !== "GREEN") avisos.push(`qualidade DESTE modelo na Meta: ${NOME_COR[qm]}`);

  const comps = meta.components ?? [];
  const corpo = comps.find((c) => c.type?.toUpperCase() === "BODY");
  const header = comps.find((c) => c.type?.toUpperCase() === "HEADER");
  const rodape = comps.find((c) => c.type?.toUpperCase() === "FOOTER");
  const botoes = comps.find((c) => c.type?.toUpperCase() === "BUTTONS");
  base.rodape_na_meta = rodape?.text ?? null;

  // ── As variáveis do corpo ─────────────────────────────────────────────────
  // ⚠️ O envio manda parâmetro NOMEADO, a não ser que as variáveis do banco
  // tenham nome de NÚMERO ("1", "2"…) — aí manda posicional (`montarPayload`).
  // Formato diferente do aprovado recusa a mensagem inteira.
  const naMeta = variaveisDoTexto(corpo?.text);
  const nossas = (nosso.meta_variaveis ?? []).map((v) => v.nome);
  const posicional = String(meta.parameter_format ?? "").toUpperCase() === "POSITIONAL"
    || naMeta.some((v) => /^\d+$/.test(v));
  const nossasPorNumero = nossas.length > 0 && nossas.every((v) => /^\d+$/.test(v));
  if (posicional && naMeta.length && !nossasPorNumero) {
    problemas.push(`o modelo foi aprovado com variáveis por NÚMERO (${naMeta.map((v) => `{{${v}}}`).join(", ")}); o envio manda por NOME`);
  } else if (!posicional && nossasPorNumero) {
    problemas.push("o envio manda variáveis por NÚMERO e o modelo da Meta foi aprovado por NOME");
  } else if (posicional && naMeta.length) {
    const esperadas = [...new Set(naMeta)].sort((a, b) => Number(a) - Number(b));
    const nossasOrd = [...nossas].sort((a, b) => Number(a) - Number(b));
    if (esperadas.join() !== nossasOrd.join()) {
      problemas.push(`a Meta espera ${esperadas.map((v) => `{{${v}}}`).join(", ")} e o envio manda ${nossasOrd.map((v) => `{{${v}}}`).join(", ") || "nenhuma"}`);
    }
  } else {
    const faltamNoEnvio = naMeta.filter((v) => !nossas.includes(v));
    const sobramNoEnvio = nossas.filter((v) => !naMeta.includes(v));
    if (faltamNoEnvio.length) problemas.push(`a Meta espera ${faltamNoEnvio.map((v) => `{{${v}}}`).join(", ")} e o envio não manda`);
    if (sobramNoEnvio.length) problemas.push(`o envio manda ${sobramNoEnvio.join(", ")} e o modelo da Meta não tem essa variável`);
    if (!faltamNoEnvio.length && !sobramNoEnvio.length && naMeta.join() !== nossas.join()) {
      avisos.push(`as variáveis estão em ordem diferente (Meta: ${naMeta.join(", ")} · envio: ${nossas.join(", ")})`);
    }
  }

  // ── Cabeçalho e botão ─────────────────────────────────────────────────────
  if (header && variaveisDoTexto(header.text).length) {
    problemas.push("o cabeçalho do modelo tem variável, e o envio não manda cabeçalho");
  } else if (header && header.format && header.format.toUpperCase() !== "TEXT") {
    problemas.push(`o cabeçalho do modelo é ${header.format}, e o envio não manda mídia`);
  }
  const botaoComVariavel = (botoes?.buttons ?? []).some((b) =>
    b.type?.toUpperCase() === "URL" && /\{\{/.test(String(b.url ?? "")));
  if (botaoComVariavel && !nosso.meta_botao_url_de) {
    problemas.push("o modelo tem botão de link com variável, e o envio não manda o parâmetro do botão");
  }
  if (!botaoComVariavel && nosso.meta_botao_url_de) {
    problemas.push("o envio manda parâmetro de botão, e o modelo da Meta não tem botão com variável");
  }

  // ── O espelho de conferência ──────────────────────────────────────────────
  // Não impede o envio (o que sai é o texto da Meta), mas é o que a tela de
  // Conversas mostra no balão: divergindo, a tela mostra uma coisa e o
  // cliente recebe outra.
  if (corpo?.text && normalizar(corpo.text) !== normalizar(nosso.texto)) {
    const a = normalizar(corpo.text), b = normalizar(nosso.texto);
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    avisos.push(`o texto do banco difere do aprovado a partir de "${a.slice(Math.max(0, i - 15), i + 25).replace(/\n/g, "⏎")}"`);
  }
  if (rodape?.text) avisos.push(`o modelo na Meta tem rodapé: "${rodape.text}"`);

  base.ok = problemas.length === 0;
  return base;
}
