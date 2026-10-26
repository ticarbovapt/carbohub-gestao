import type { Secao } from "./tipos";
import { SECOES_BASE } from "./secoes/base";
import { SECOES_VENDER, SECOES_FIM } from "./secoes/comuns";
import { SECOES_CONVERSAS } from "./secoes/conversas";
import { SECOES_ESTEIRA } from "./secoes/esteira";
import { SECOES_COMERCIAL } from "./secoes/comercial";

// ─────────────────────────────────────────────────────────────────────────────
// Conteúdo da Documentação do Carbo Atendimento — uma seção por tela, em
// `secoes/*.ts`. `comuns.ts` (Vender, Bugs, Perfil) e `comercial.ts` (Chat)
// vêm do Sales; `esteira.ts` é a MESMA tela do Admin e do Marketing — mudou a
// tela, mude o texto nos apps que a documentam.
//
// ⚠️ O número `n` de cada item é o MESMO marcador desenhado no print (`chave`)
// — quem mede a posição é o harness de prints (`docs-prints/`), que usa a mesma
// numeração. Mudou um botão de lugar ou de nome: refaça o print e confira.
// ⚠️ `papel: "gestor"` some para o colaborador (seção, bloco, print ou item).
// ─────────────────────────────────────────────────────────────────────────────

const TODAS = [...SECOES_BASE, ...SECOES_CONVERSAS, ...SECOES_ESTEIRA, ...SECOES_VENDER,
  ...SECOES_COMERCIAL, ...SECOES_FIM];

/** A ordem do índice: a do menu. Seção que não estiver aqui vai para o fim. */
const ORDEM = ["comece", "inicio", "navegacao", "chat", "conversas", "conversa-aberta", "esteira", "mensagens",
  "vender", "bugs", "perfil"];
const pos = (id: string) => (ORDEM.indexOf(id) === -1 ? ORDEM.length : ORDEM.indexOf(id));

export const SECOES: Secao[] = [...TODAS].sort((a, b) => pos(a.id) - pos(b.id));
