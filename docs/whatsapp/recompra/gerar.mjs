// Gera, a partir de textos.mjs, os três arquivos desta pasta.
//   node docs/whatsapp/recompra/gerar.mjs
// LINK_SACHE / LINK_FRASCO (opcionais) = o link real da Payt de cada kit, usado
// como EXEMPLO na aprovação da Meta. Sem eles, vai o endereço da loja.
//
// ⚠️ Recusa gerar se algum texto quebra uma regra da Meta que derrubaria a
// aprovação ou o envio: corpo > 1024, 4+ espaços seguidos, tab, variável
// colada em outra, variável no começo ou no fim do corpo, rodapé > 60.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TEXTOS, FLUXOS, RODAPE, nomeMeta, etapa } from "./textos.mjs";

const aqui = dirname(fileURLToPath(import.meta.url));
const LINK = {
  sache: process.env.LINK_SACHE || "https://carboze.com.br",
  frasco: process.env.LINK_FRASCO || "https://carboze.com.br",
};
const NOME_EXEMPLO = "Lucas";

const erros = [];
for (const [fluxo, dia, , corpo] of TEXTOS) {
  const n = nomeMeta(fluxo, dia);
  if ([...corpo].length > 1024) erros.push(`${n}: corpo com ${[...corpo].length} caracteres (> 1024)`);
  if (/ {4,}|\t/.test(corpo)) erros.push(`${n}: 4+ espaços ou tab`);
  if (/\}\}\s*\{\{/.test(corpo)) erros.push(`${n}: duas variáveis coladas`);
  if (/^\s*\{\{|\}\}\s*$/.test(corpo)) erros.push(`${n}: variável no começo ou no fim do corpo`);
  if (!corpo.includes("{{primeiro_nome}}") || !corpo.includes("{{link_checkout}}")) erros.push(`${n}: falta variável`);
  const outras = (corpo.match(/\{\{[^}]+\}\}/g) || []).filter((v) => v !== "{{primeiro_nome}}" && v !== "{{link_checkout}}");
  if (outras.length) erros.push(`${n}: variável desconhecida ${outras.join(",")}`);
}
if ([...RODAPE].length > 60) erros.push("rodapé > 60");
if (TEXTOS.length !== 14) erros.push(`esperava 14 textos, achei ${TEXTOS.length}`);
if (erros.length) { console.error(erros.join("\n")); process.exit(1); }

// 1. O corpo de cada template para a API (POST /{WABA_ID}/message_templates).
const api = TEXTOS.map(([fluxo, dia, , corpo]) => ({
  name: nomeMeta(fluxo, dia),
  language: "pt_BR",
  category: "MARKETING",
  parameter_format: "NAMED",
  components: [
    {
      type: "BODY",
      text: corpo,
      example: {
        body_text_named_params: [
          { param_name: "primeiro_nome", example: NOME_EXEMPLO },
          { param_name: "link_checkout", example: LINK[fluxo] },
        ],
      },
    },
    { type: "FOOTER", text: RODAPE },
  ],
}));
writeFileSync(join(aqui, "templates-meta-recompra.json"), JSON.stringify(api, null, 2) + "\n");

// 2. O espelho no banco (o `texto` de conferência, que a tela de Conversas mostra).
const sql = TEXTOS.map(([fluxo, dia, titulo, corpo]) =>
  `  ('${etapa(fluxo, dia)}', '${nomeMeta(fluxo, dia)}', '${FLUXOS[fluxo].rotulo} · Dia ${dia} · ${titulo}', $t$${corpo}\n\n${RODAPE}$t$)`,
).join(",\n");
writeFileSync(join(aqui, "espelho.sql"), `-- GERADO por gerar.mjs — não edite à mão.\n(values\n${sql}\n)\n`);

// 3. O prompt para o Claude no navegador.
const bloco = (fluxo, dia, titulo, corpo) => `### ${nomeMeta(fluxo, dia)}  —  ${FLUXOS[fluxo].rotulo} · Dia ${dia} · ${titulo}

- Nome: \`${nomeMeta(fluxo, dia)}\`
- Exemplo de \`primeiro_nome\`: \`${NOME_EXEMPLO}\`
- Exemplo de \`link_checkout\`: \`${LINK[fluxo]}\`

Corpo (colar EXATAMENTE, com as linhas em branco):

\`\`\`text
${corpo}
\`\`\`
`;

const prompt = `Você vai cadastrar 14 modelos (templates) de mensagem do WhatsApp no WhatsApp Manager da Meta e mandá-los para aprovação. Eu estou logado no Meta Business Suite no navegador.

## Onde

1. Abra https://business.facebook.com/wa/manage/message-templates/ (WhatsApp Manager → Gerenciar modelos).
2. No seletor de conta do WhatsApp, use a conta **CarboZé** — a WABA de id **1777955220017913**. Se aparecer outra conta selecionada, troque antes de criar qualquer coisa.
3. Antes de começar, procure na lista por \`carboze_recompra\`. Se algum dos 14 nomes abaixo já existir, NÃO crie de novo: anote o status dele e pule para o próximo.

## Como criar CADA um dos 14 (o mesmo passo a passo)

1. Clique em **Criar modelo**.
2. Categoria: **Marketing**. Tipo: **Padrão** (mensagem personalizada / "Default"). Avance.
3. Nome do modelo: o nome indicado (minúsculas e sublinhado, exatamente como está).
4. Idioma: **Português (BR)** — código \`pt_BR\`.
5. Tipo de variável: **Nome** (Name), NÃO "Número". As variáveis são \`{{primeiro_nome}}\` e \`{{link_checkout}}\`.
6. Cabeçalho: **nenhum**.
7. Corpo: cole o texto do bloco **exatamente** como está, com as quebras de linha e as linhas em branco, os emojis e os asteriscos (os asteriscos são o negrito do WhatsApp — não os apague). Não troque palavras, não corrija nada, não acrescente nada.
8. Exemplos das variáveis (a Meta pede): \`primeiro_nome\` = o exemplo indicado; \`link_checkout\` = o exemplo indicado.
9. Rodapé: \`${RODAPE}\`
10. Botões: **nenhum**. Não adicione botão de "Parar promoções", de link nem de resposta.
11. Confira a pré-visualização (o texto tem de bater com o bloco) e clique em **Enviar** / **Enviar para análise**.

## Regras

- Se a Meta sugerir mudar a categoria para "Utilidade", recuse e mantenha **Marketing**.
- Se a Meta recusar o envio por alguma regra (texto, variável, nome), NÃO reescreva a mensagem por conta própria: pare naquele modelo, anote a mensagem de erro exata e siga para o próximo.
- Não edite, não exclua e não reenvie nenhum outro modelo da conta.
- Não mude configurações da conta, do número ou do perfil.

## No fim, me devolva uma tabela

| nome | status na lista (Em análise / Ativo / Recusado / Já existia) | observação ou erro exato |

## Os 14 modelos

${TEXTOS.map(([f, d, t, c]) => bloco(f, d, t, c)).join("\n")}`;
writeFileSync(join(aqui, "PROMPT-CLAUDE-NAVEGADOR.md"), prompt);
console.log("ok: 14 templates, prompt e espelho gerados");
