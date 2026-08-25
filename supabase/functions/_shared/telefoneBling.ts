// ─────────────────────────────────────────────────────────────────────────────
// Telefone para o Bling — normaliza, e RECUSA em vez de mandar lixo
//
// ⚠️ O caso real que originou este arquivo (25/08/2026, cliente BILL AUTOPECAS,
// pedido de R$ 15.200): o telefone gravado era `0843215585` e o `bling-sync`
// mandava a string CRUA, só com `.trim()`. O Bling recusou o CONTATO inteiro:
//
//     VALIDATION_ERROR — "O contato não pode ser salvo"
//     {"msg":"É necessário preencher corretamente o campo Telefone",
//      "element":"fone","namespace":"CONTATOS"}
//
// E como o contato não é salvo, o PEDIDO não é criado. Ou seja: um campo que
// não tem efeito fiscal nenhum travava o faturamento inteiro.
//
// ── A decisão que este arquivo toma ───────────────────────────────────────
//
// Telefone impossível de consertar é OMITIDO, não enviado. O Bling aceita
// contato sem telefone; não aceita contato com telefone inválido. Entre
// faturar sem o telefone e não faturar, faturar ganha — mas a omissão vira
// AVISO na tela, nunca silêncio. Sumir com o dado calado é como o cadastro
// fica errado sem ninguém saber.
//
// ⚠️ E ele NÃO inventa dígito. `0843215585` tem 9 dígitos úteis (DDD 84 + 7),
// e fixo brasileiro tem 8 — falta um. Completar com zero, ou repetir o último,
// produziria um telefone VÁLIDO no formato e ERRADO na vida real: alguém
// ligaria para um estranho achando que era o cliente.
// ─────────────────────────────────────────────────────────────────────────────

/** DDDs que existem no Brasil. Fora desta lista o número é lixo, não formato. */
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

export interface TelefoneBling {
  /** O que mandar ao Bling. `null` = não mandar o campo. */
  valor: string | null;
  /** Motivo, quando `valor` é null e havia algo escrito. Vira aviso na tela. */
  aviso: string | null;
}

/**
 * Normaliza um telefone brasileiro para o Bling.
 *
 * Aceita e conserta:
 *   · pontuação de qualquer forma — (84) 3215-5585, 84.3215.5585
 *   · o `0` de interurbano na frente — 08432155585 → 8432155585
 *   · o `55` de país na frente — 558432155585 → 8432155585
 *
 * Recusa (devolve `valor: null` + aviso):
 *   · menos de 10 ou mais de 11 dígitos depois de limpar
 *   · DDD que não existe
 *   · celular de 11 dígitos cujo nono dígito não é 9
 *   · sequência repetida (0000000000, 9999999999) — placeholder, não telefone
 */
export function telefoneParaBling(bruto: unknown): TelefoneBling {
  const texto = String(bruto ?? "").trim();
  if (!texto) return { valor: null, aviso: null };   // vazio não é erro

  let d = texto.replace(/\D/g, "");
  if (!d) return { valor: null, aviso: `Telefone "${texto}" não tem dígito nenhum — enviado sem telefone.` };

  // ⚠️ O 55 do país sai ANTES do 0 de interurbano. Na ordem inversa, um
  // "055 84..." perderia o 0 e depois o 55 seria lido como DDD 55 (Santa Maria).
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if (d.length > 10 && d.startsWith("0")) d = d.slice(1);
  // "084..." vira "84..." mesmo com 10 dígitos: o 0 nunca faz parte do DDD.
  else if (d.startsWith("0")) d = d.slice(1);

  if (d.length < 10 || d.length > 11) {
    return {
      valor: null,
      aviso: `Telefone "${texto}" tem ${d.length} dígito(s) — o Bling exige 10 (fixo) ou 11 (celular). ` +
             `O cliente será criado SEM telefone; corrija o cadastro depois.`,
    };
  }

  const ddd = Number(d.slice(0, 2));
  if (!DDDS.has(ddd)) {
    return {
      valor: null,
      aviso: `Telefone "${texto}" tem DDD ${d.slice(0, 2)}, que não existe. ` +
             `O cliente será criado SEM telefone; corrija o cadastro depois.`,
    };
  }

  // Celular com 11 dígitos tem de começar com 9 depois do DDD. Um "84 81234567"
  // com 11 dígitos é erro de digitação, não número.
  if (d.length === 11 && d[2] !== "9") {
    return {
      valor: null,
      aviso: `Telefone "${texto}" tem 11 dígitos mas o nono não é 9 — não é celular válido. ` +
             `O cliente será criado SEM telefone; corrija o cadastro depois.`,
    };
  }

  // Placeholder digitado para "preencher o campo".
  if (/^(\d)\1+$/.test(d.slice(2))) {
    return {
      valor: null,
      aviso: `Telefone "${texto}" é uma sequência repetida — o cliente será criado SEM telefone.`,
    };
  }

  // ⚠️ Formatado, não cru. O Bling aceita os dois, mas o contato fica legível
  // no painel dele — e é de lá que a operação liga para o cliente.
  const corpo = d.slice(2);
  const meio = corpo.length === 9 ? corpo.slice(0, 5) : corpo.slice(0, 4);
  const fim = corpo.length === 9 ? corpo.slice(5) : corpo.slice(4);
  return { valor: `(${d.slice(0, 2)}) ${meio}-${fim}`, aviso: null };
}
