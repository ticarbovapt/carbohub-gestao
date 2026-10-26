import type { Secao } from "./tipos";
import { SECOES_BASE } from "./secoes/base";
import { SECOES_VENDER, SECOES_FIM } from "./secoes/comuns";
import { SECOES_PAINELCOM } from "./secoes/painelcom";
import { SECOES_PAINEIS } from "./secoes/paineis";
import { SECOES_ECOMMERCE } from "./secoes/ecommerce";
import { SECOES_ESTEIRA } from "./secoes/esteira";
import { SECOES_COMERCIAL } from "./secoes/comercial";

// ─────────────────────────────────────────────────────────────────────────────
// Conteúdo da Documentação do Carbo Admin — uma seção por tela, em
// `secoes/*.ts`. `comuns.ts` (Vender, Bugs, Perfil) e `comercial.ts` (Minha
// Equipe, Chat) vêm do Sales; `ecommerce.ts` e `esteira.ts` são as MESMAS
// telas do Marketing — mudou a tela, mude o texto nos apps que a documentam.
//
// ⚠️ O número `n` de cada item é o MESMO marcador desenhado no print (`chave`)
// — quem mede a posição é o harness de prints (`docs-prints/`), que usa a mesma
// numeração. Mudou um botão de lugar ou de nome: refaça o print e confira.
// ⚠️ `papel: "gestor"` some para o colaborador (seção, bloco, print ou item).
// ─────────────────────────────────────────────────────────────────────────────

const TODAS = [...SECOES_BASE, ...SECOES_PAINELCOM, ...SECOES_PAINEIS, ...SECOES_ECOMMERCE,
  ...SECOES_ESTEIRA, ...SECOES_VENDER, ...SECOES_COMERCIAL, ...SECOES_FIM];

/** A ordem do índice: a do menu. Seção que não estiver aqui vai para o fim. */
const ORDEM = ["comece", "navegacao", "chat",
  "dashboard-comercial", "dados-comerciais", "aprovacoes", "precos",
  "mapa-conquista", "painel-lojas", "painel-licenciados", "painel-metas", "painel-suprimentos",
  "vendas-online", "esteira", "mensagens", "metas-ecommerce", "anuncios",
  "configurar-metas", "vender", "equipe", "bugs", "perfil"];
const pos = (id: string) => (ORDEM.indexOf(id) === -1 ? ORDEM.length : ORDEM.indexOf(id));

export const SECOES: Secao[] = [...TODAS].sort((a, b) => pos(a.id) - pos(b.id));
