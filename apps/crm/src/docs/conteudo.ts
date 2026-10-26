import type { Secao } from "./tipos";
import { SECOES_BASE } from "./secoes/base";
import { SECOES_VENDER, SECOES_FIM } from "./secoes/comuns";

// ─────────────────────────────────────────────────────────────────────────────
// Conteúdo da Documentação do Carbo Sales — uma seção por tela, em
// `secoes/*.ts` (as telas que existem em vários apps ficam em `comuns.ts`).
//
// ⚠️ O número `n` de cada item é o MESMO marcador desenhado no print (`chave`)
// — quem mede a posição é o harness de prints (`docs-prints/`), que usa a mesma
// numeração. Mudou um botão de lugar ou de nome: refaça o print e confira.
// ⚠️ `papel: "gestor"` some para o colaborador (seção, bloco, print ou item).
// ─────────────────────────────────────────────────────────────────────────────

const TODAS = [...SECOES_BASE, ...SECOES_VENDER, ...SECOES_FIM];

/** A ordem do índice: a do menu. Seção que não estiver aqui vai para o fim. */
const ORDEM = ["comece", "navegacao", "pipeline", "vender", "vendas", "bugs", "perfil"];
const pos = (id: string) => (ORDEM.indexOf(id) === -1 ? ORDEM.length : ORDEM.indexOf(id));

export const SECOES: Secao[] = [...TODAS].sort((a, b) => pos(a.id) - pos(b.id));
