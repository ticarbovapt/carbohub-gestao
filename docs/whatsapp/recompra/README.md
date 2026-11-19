# Régua de recompra de 7 dias

Os 14 templates do PDF "CarboZé · Recompra no WhatsApp" (Sachês e Frascos, Dia 1
a Dia 7) e o que os põe para rodar.

```
textos.mjs                      a FONTE ÚNICA dos 14 textos (copiados do PDF)
gerar.mjs                       node docs/whatsapp/recompra/gerar.mjs  → os três abaixo
templates-meta-recompra.json    o corpo de cada template para a API da Meta
PROMPT-CLAUDE-NAVEGADOR.md      o pedido para cadastrar no WhatsApp Manager
espelho.sql                     o texto de conferência que vai para carbo_msg_templates
teste-local/                    a migração 20261177 testada num Postgres 16 descartável
```

Variáveis nomeadas: `{{primeiro_nome}}` (sem nome: "amigo") e `{{link_checkout}}`
(o checkout da Payt com os 20% — um link por fluxo, cadastrado com
`carbo_recompra_definir_link`). O PDF escreve `{{1}}` e `{{2}}`; o texto que o
cliente lê é o mesmo.

## Para ligar

1. Cadastrar os 14 na Meta (o prompt). O webhook troca `meta_status` para
   APPROVED sozinho quando a Meta aprova.
2. Os dois links (`supabase/consultas/recompra_7_dias.sql`, BLOCO 5).
3. Ligar os 14 (BLOCO 6). A oferta antiga para sozinha no mesmo instante.

Texto mudou? Mude em `textos.mjs`, rode `gerar.mjs`, mande aprovar de novo na Meta
e atualize o `texto` (espelho) no banco.
