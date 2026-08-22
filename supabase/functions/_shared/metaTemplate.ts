// ─────────────────────────────────────────────────────────────────────────────
// metaTemplate — montar o payload de template da WhatsApp Cloud API
//
// Módulo PURO, sem rede e sem banco, porque é aqui que moram as regras que
// quebram envio em silêncio. O edge function faz IO; as decisões ficam neste
// arquivo, que os testes cobrem.
//
// ── As quatro regras da Meta que recusam a mensagem ──────────────────────────
//
//   132000  parâmetro vazio, ou número de parâmetros diferente do template
//   132007  parâmetro com \n, tab ou 4+ espaços seguidos
//   132001  template não existe nesse idioma
//   131026  número não tem WhatsApp
//
// As duas primeiras são nossas para evitar, e as duas são consequência de uma
// mesma coisa: no texto livre um valor vazio era um detalhe, e aqui é uma
// recusa. Por isso `faltando` existe — ele é a diferença entre "manda torto" e
// "espera o dado".
// ─────────────────────────────────────────────────────────────────────────────

/** Uma variável do corpo, como está em `carbo_msg_templates.meta_variaveis`. */
export interface VarTemplate {
  /** `parameter_name` que vai no payload. */
  nome: string;
  /** Coluna de `carbo_msg_fila` que alimenta. */
  de: string;
  /**
   * Texto de reserva quando o valor está vazio.
   *
   * ⚠️ A AUSÊNCIA deste campo é a regra, não um esquecimento: sem fallback a
   * variável é obrigatória e o envio ESPERA. O padrão é o seguro.
   */
  fallback?: string;
}

export interface PayloadMontado {
  /** O corpo do POST, pronto. `null` quando falta variável obrigatória. */
  body: Record<string, unknown> | null;
  /** Nomes das variáveis obrigatórias sem valor. Vazio = dá para enviar. */
  faltando: string[];
  /** O que foi resolvido, para o ensaio mostrar sem precisar ler o payload. */
  valores: Record<string, string>;
}

/**
 * Telefone brasileiro em E.164 sem `+`.
 *
 * ⚠️ Mais rígida que a normalização antiga do `kanban-n8n`, e de propósito. A
 * anterior aceitava qualquer coisa entre 12 e 13 dígitos DEPOIS de prefixar o
 * 55 — o que deixa passar um número de 13 dígitos que já vinha errado. Aqui o
 * DDI é retirado primeiro e o que sobra tem de ser um telefone brasileiro de
 * 10 ou 11 dígitos. Fora disso é `null`, e `null` vira "ignorado" com motivo,
 * nunca uma chamada à Meta que vai falhar.
 *
 * O 9º dígito NÃO é corrigido aqui. A Meta normaliza melhor do que qualquer
 * tabela de DDD que a gente mantivesse, e a resposta do envio traz o `wa_id`
 * real — é ele que deve ser guardado e usado nos próximos envios.
 */
export function normalizarBR(bruto: string | null | undefined): string | null {
  let d = String(bruto ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  d = d.replace(/^0+/, "");
  if (d.length < 10 || d.length > 11) return null;
  return "55" + d;
}

/**
 * Deixa o valor aceitável como parâmetro de template.
 *
 * Quebra de linha, tab e espaços múltiplos são recusa 132007. Colapsar em um
 * espaço é o que preserva a frase; cortar o valor a mutilaria.
 */
export function limparParametro(v: unknown): string {
  return String(v ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Formata o valor cru da fila para leitura humana.
 *
 * Só uma regra, e ela é a data: `previsao` vem de `rastreio_card` como
 * `2026-08-26` e o template foi aprovado com o exemplo `26/08/2026`. Mandar
 * ISO não seria recusado pela Meta — seria pior: chegaria ao cliente assim.
 *
 * ⚠️ Sem `new Date()`. Uma data pura interpretada como UTC e exibida em
 * Brasília volta um dia — a previsão de 26 vira 25. Aqui é troca de posição de
 * texto, que não tem fuso.
 */
export function formatarValor(v: unknown): string {
  const s = String(v ?? "");
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return s;
}

/**
 * Monta o POST de `/{PHONE_NUMBER_ID}/messages` para um template.
 *
 * @param to        telefone já normalizado (E.164 sem `+`)
 * @param nome      nome do template aprovado
 * @param idioma    `pt_BR`
 * @param vars      mapeamento ORDENADO, como está no banco
 * @param linha     a linha de `carbo_msg_fila`
 * @param botaoDe   coluna que alimenta o botão URL, ou null/undefined
 */
export function montarPayload(
  to: string,
  nome: string,
  idioma: string,
  vars: VarTemplate[],
  linha: Record<string, unknown>,
  botaoDe?: string | null,
): PayloadMontado {
  const faltando: string[] = [];
  const valores: Record<string, string> = {};
  const parametros: Array<Record<string, string>> = [];

  // ⚠️ A ORDEM é a do array, não a das chaves do objeto. O formato é nomeado
  // (`parameter_name`), o que protege de trocar rastreio por número do pedido,
  // mas a Meta ainda espera os parâmetros na ordem em que aparecem no corpo.
  for (const v of vars ?? []) {
    let texto = limparParametro(formatarValor(linha?.[v.de]));
    if (!texto) {
      // `fallback` só conta se ele próprio não for vazio — um fallback em
      // branco no banco reproduziria exatamente o 132000 que ele evita.
      const reserva = limparParametro(v.fallback ?? "");
      if (!reserva) { faltando.push(v.nome); continue; }
      texto = reserva;
    }
    valores[v.nome] = texto;
    parametros.push({ type: "text", parameter_name: v.nome, text: texto });
  }

  // ⚠️ O botão é POSICIONAL mesmo com o corpo nomeado, e o parâmetro é só o
  // SUFIXO — a base https://rastreio.carboze.com.br/rastreio/ está no template
  // aprovado. Mandar a URL inteira geraria .../rastreio/https://...
  let botao: Record<string, unknown> | null = null;
  if (botaoDe) {
    const sufixo = limparParametro(linha?.[botaoDe]);
    // Sem sufixo o botão apontaria para a base sozinha, e o cliente clicaria
    // para cair numa página de erro. Falta obrigatória, como qualquer outra.
    if (!sufixo) faltando.push(`botao:${botaoDe}`);
    else {
      valores[`botao:${botaoDe}`] = sufixo;
      botao = {
        type: "button", sub_type: "url", index: "0",
        parameters: [{ type: "text", text: sufixo }],
      };
    }
  }

  if (faltando.length) return { body: null, faltando, valores };

  const components: Array<Record<string, unknown>> = [];
  if (parametros.length) components.push({ type: "body", parameters: parametros });
  if (botao) components.push(botao);

  return {
    body: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name: nome,
        language: { code: idioma || "pt_BR" },
        ...(components.length ? { components } : {}),
      },
    },
    faltando: [],
    valores,
  };
}

/**
 * A falha é transitória (vale repetir) ou definitiva (não vale)?
 *
 * ⚠️ A distinção não é cosmética: repetir uma definitiva é mandar a mesma
 * mensagem de novo para quem já a recusou, e desistir de uma transitória é
 * perder um aviso por causa de um soluço de rede.
 */
export function ehTransitorio(status: number, codigo?: number | null): boolean {
  if (status >= 500 || status === 429) return true;
  // 130429 = rate limit da Cloud API; 131056 = muitas mensagens para o mesmo
  // par em pouco tempo. As duas passam sozinhas.
  return codigo === 130429 || codigo === 131056;
}

/**
 * A mensagem de erro que serve para alguma coisa.
 *
 * `error.message` é genérico ("Parameter value is not valid"); quem diz QUAL
 * campo está errado é `error_data.details`. Ler só o primeiro é o que faz uma
 * falha de um parâmetro parecer uma falha da integração inteira.
 */
export function detalheDoErro(json: unknown): string {
  const e = (json as { error?: Record<string, unknown> } | null)?.error;
  if (!e) return "";
  const dados = e.error_data as { details?: string } | undefined;
  return String(dados?.details ?? e.message ?? "").slice(0, 500);
}
