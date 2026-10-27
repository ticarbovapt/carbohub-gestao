import type { Secao } from "./tipos";
import { SECOES_BASE } from "./secoes/base";
import { SECOES_VENDER, SECOES_FIM } from "./secoes/comuns";
import { SECOES_COMERCIAL } from "./secoes/comercial";
import { SECOES_CONTAS } from "./secoes/contas";
import { SECOES_VENDAS } from "./secoes/vendas";
import { SECOES_COMPRAS } from "./secoes/compras";
import { SECOES_CONFIG } from "./secoes/config";

// ─────────────────────────────────────────────────────────────────────────────
// Conteúdo da Documentação do Carbo Finanças — uma seção por tela, em
// `secoes/*.ts`. `comuns.ts` (Vender, Bugs, Perfil) e `comercial.ts` (Minha
// Equipe, Chat) vêm do Sales — mudou a tela, mude o texto nos apps que a
// documentam.
//
// ⚠️ O número `n` de cada item é o MESMO marcador desenhado no print (`chave`)
// — quem mede a posição é o harness de prints (`docs-prints/`), que usa a mesma
// numeração. Mudou um botão de lugar ou de nome: refaça o print e confira.
// ⚠️ `papel: "gestor"` some para o colaborador (seção, bloco, print ou item).
// ─────────────────────────────────────────────────────────────────────────────

const TODAS = [...SECOES_BASE, ...SECOES_CONTAS, ...SECOES_VENDAS, ...SECOES_COMPRAS,
  ...SECOES_CONFIG, ...SECOES_VENDER, ...SECOES_COMERCIAL, ...SECOES_FIM];

/** A ordem do índice: a do menu. Seção que não estiver aqui vai para o fim. */
const ORDEM = ["comece", "navegacao", "inicio-fin", "chat",
  "pagar", "nova-conta", "baixa", "assinaturas", "receber", "fluxo-caixa", "painel-financeiro",
  "faturamento", "criar-no-bling", "nfse-emitir", "comissionamento", "pedidos",
  "compras", "suprimentos", "fornecedores", "formas-pagamento",
  "funcionarios", "bling-conexao", "bling1", "bling2", "nfse",
  "vender", "equipe", "bugs", "perfil"];
const pos = (id: string) => (ORDEM.indexOf(id) === -1 ? ORDEM.length : ORDEM.indexOf(id));

export const SECOES: Secao[] = [...TODAS].sort((a, b) => pos(a.id) - pos(b.id));
