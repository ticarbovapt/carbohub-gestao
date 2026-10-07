# carbohub-gestao — Instruções para o Claude

## ⚠️ Estrutura em transição: monólito → monorepo (CRM/ERP/Portais)

Este repo está sendo reorganizado em monorepo (ver `docs/ARQUITETURA-SEPARACAO.md`).
Layout atual:

```
/ (raiz)        = sistema ATUAL "controle" (monólito, VIVO no ar). src/, supabase/.
apps/crm/       = sistema novo CRM (app standalone, próprio package.json/build).
apps/erp/       = (futuro)
packages/       = compartilhados entre apps:
                  chat, call, shell (UI/infra)
                  posvenda (etapas do Rastreio de venda — Ops + Sales)
                  demandas (tipos de demanda do TI — os 6 apps + quadro do TI)
```

### `packages/posvenda` — etapas do pós-venda
Fonte ÚNICA da lista de etapas do Rastreio. Ops **controla** as etapas, Sales só
**acompanha**; antes cada um declarava a sua lista e o Sales tinha 7 das 11 —
pedido parado numa etapa ausente **sumia do quadro** em vez de aparecer numa
coluna vazia. Etapa nova entra aqui **e** no CHECK de `fulfillment_stage` em
`carboze_orders` (migração), nesta ordem.

### `packages/demandas` — tipos de demanda do TI
Fonte ÚNICA de `KINDS`. O `BugButton.tsx` existe nos **seis** apps (arquivos byte
a byte idênticos) e o quadro do TI é o sétimo consumidor — sete cópias divergem, e
divergir aqui tira a opção da tela de alguém sem dar erro. Tipo novo entra aqui,
**e** no CHECK de `kind` em `carbo_bug_reports`, **e** em `carbo_bug_kind_label`
(senão a notificação chega como "novo bug"). Ao editar o `BugButton`, edite o do
`apps/ti` e copie para os outros cinco — eles devem continuar idênticos.

### Tela `/vender` — o CRM é a base, os outros copiam
O `pages/Vender.tsx` existe nos **sete** apps (⚠️ `atendimento` entrou em
28/08/2026) e deve ser byte a byte idêntico.
A raiz (`controle`) está fora — ela tem `/orders/new`, outra tela, congelada.

**Fonte da verdade = `apps/crm`** (o app do Sales). Edite lá e copie para
`admin`, `ops`, `ti`, `financas`, `mkt`. Junto vão os hooks que a tela usa:
`useVendas`, `useCarbozeVendas`, `useLeadOrcamento`, `useDescarbOS` — também
idênticos nos seis.

Duas armadilhas já pagas, não repita:
1. **`useOS` significa duas coisas.** No `crm` é `licenciados.service_orders` via
   RPC `os_create`; no `ops` é `crm_os` no schema public. Copiar um por cima do
   outro quebra `Alertas`, `Agendamentos` e `OrdensServico` do Ops **sem erro de
   compilação**. Por isso o Vender importa `useCreateOSFromSale` de
   `@/hooks/useDescarbOS` (nome neutro, idêntico nos seis), nunca de `useOS`.
2. **`isGestor` é alias.** O Vender canônico usa `isGestor`; fora do CRM o
   `AuthContext` chamava isso de `canAdmin` (e `gestor` no financas). Os três são
   `isManager(profile, fnMap)` — a mesma expressão. O alias `isGestor` existe nos
   seis só para a tela poder ser idêntica. Não duplique a regra.

### `/vender`: CarboZé e CarboVAPT são vendas SEPARADAS (29/09/2026)
O seletor "Tipo de Operação" deixou de ser **Venda / Ação Promocional** e passou
a ser **CARBOZÉ / CARBOVAPT** — e pela primeira vez ele GOVERNA a tela. Até aqui
`mode` era decorativo: `buildOrderFields` nunca leu `input.tipo`, não há coluna
nem CHECK, e o valor só sobrevivia dentro do `quote_form_snapshot`.

```
CarboZé    Endereço de Entrega · Itens do Pedido · Como o produto sai ·
           Data de entrega combinada · Recorrência          NF-e pelo Bling
CarboVAPT  Endereço de Faturamento · Itens de Serviço ·
           Previsão de Execução                    NFS-e pelo Portal Nacional
```

Comum aos dois, no topo: responsável, busca por documento, cliente, endereço,
pagamento, dados estratégicos e observações.

1. ⚠️ **Uma venda é de UM tipo só**, porque a NF sai por caminhos diferentes.
   Medido ANTES de fechar a regra: **zero** pedidos no histórico misturam item
   de produto com item de serviço — não há passado a tratar, e foi isso que
   permitiu a regra ser dura em vez de tolerante.
2. ⚠️ **Esconder NÃO é a regra — é a aparência dela.** A regra mora em
   `erroDeModo()`, no submit, que é o único lugar por onde os três caminhos
   (orçamento, e-mail, venda) passam. `trocarModo` limpa os itens do outro tipo
   e DIZ que limpou; a guarda é o cinto. Mesmo princípio da dedução de estoque
   morar na RPC e não na tela.
3. ⚠️ **O endereço muda de RÓTULO, nunca de COLUNA.** No CarboVAPT não há
   entrega e o endereço serve para faturar, mas ele continua indo para
   `delivery_address/city/state/zip`: redirecionar serviço para
   `billing_address` mudaria o que outras telas mostram, e isso precisa ser
   medido antes, não suposto.
4. ⚠️ **Campo escondido que continua preenchido vai junto no payload.** O
   endereço de faturamento separado some no CarboVAPT (a seção inteira já é
   ele), então `enderecoFaturamentoOuNulo()` decide num lugar só, por onde os
   TRÊS usos passam — o payload e os dois PDFs. Três condições iguais em três
   lugares são três condições que divergem depois.
5. ⚠️ **"Ação Promocional" morreu, mas o valor antigo continua no snapshot.**
   `normalizarModo` o trata olhando as LINHAS, não o rótulo: `"venda"`/`"promo"`
   valiam para produto e serviço igualmente, então orçamento antigo só de
   serviço reabre em **CarboVAPT**. Sem isso a guarda de submit o recusaria e
   ele ficaria impossível de editar. `VendaTipo` e `TIPO_LABEL` guardam os
   QUATRO valores pelo mesmo motivo.
6. **O seletor B2C/B2B/Frota SAIU**, mas o VALOR ficou: `service_type` e
   `person_type` são parâmetros da RPC que cria a OS, e a OS é o que vai para o
   portal de licenciados. Quem decide agora é o DOCUMENTO — CNPJ ⇒ b2b, CPF ⇒
   b2c (`servicoPadraoPorDoc`), que já era o padrão.
   ⚠️ **Consequência ASSUMIDA:** `frota` deixou de ser escolhível, então a trava
   "Frota exige a previsão de execução" não dispara mais em venda nova. Se ela
   precisar voltar, volta como CAMPO DA OS — quem sabe se a ida tem vários
   carros é quem executa, não quem vende.
   ⚠️ `serviceTypeTocado` continua existindo e NÃO é resto: orçamento antigo
   guardou a escolha manual (inclusive `frota`), e sem essa trava o documento a
   sobrescreveria ao reabrir.
7. **Serviços que ACOMPANHAM** (Laudo de Opacidade, Medição de Ruído) são
   checkbox e entram no orçamento como **bonificação a R$ 0,00**. Lista em
   `packages/shell/src/descarb.ts` (`DESCARB_EXTRAS`).
   ⚠️ Eles são **ITEM DO PEDIDO, não campo do snapshot**: o PDF é regerado a
   partir do pedido GRAVADO (`Vendas.tsx`), então campo que só existisse no
   snapshot sumiria do papel na segunda via, calado — a família do
   `discount_amount`. Como `is_bonificacao` já atravessa aquele `map`, isto
   chega ao PDF sem uma linha de código lá.
   ⚠️ `kind: "service"`, nunca um terceiro tipo: `so_servico` é
   `items.every(i => i.kind === "service")`, e é ele que diz que o pedido nunca
   vai ser faturado nem expedido.
   ⚠️ Extra NÃO torna a venda válida — `erroDeModo()` exige
   `validServiceItems()`, senão nasceria pedido de R$ 0,00. E eles não viram
   vaga de veículo na OS: laudo não é carro para descarbonizar.
8. **Itens de Serviço nasce com UMA linha**, como o `rows` do CarboZé — inclusive
   ao TROCAR de modo, senão quem volta ao CarboVAPT acha a seção fechada de novo.

⚠️ **PENDENTE (fase 2), e decidido pelo dono do processo:** vários locais de
execução moram **na OS, não na venda** — a OS do CarboVAPT vai para o portal de
licenciados, onde os funcionários registram e executam. Isso atravessa DOIS
repositórios. Pôr o local em `carboze_orders` criaria a segunda verdade sobre
onde o serviço acontece.

### FAIXA DE PREÇO por tipo de cliente — é PRODUTO, igual à bonificação
Pedido do dono do processo em 29/09/2026: o mesmo produto tem três preços
conforme quem compra.

```
compra esporádica     R$ 15,60   CZ100        o preço de sempre
ponto de venda        R$ 13,00   CZ100-PDV    revende o nosso produto
microdistribuidor     R$ 11,50   CZ100-MD     compra em volume, revende como quiser
```

⚠️ **A exigência que define o desenho é FISCAL**, e está nas palavras dele:
*"a NF vai receber o valor de 11,50 e não 15,60 − 4,10 = 11,50, que vai dar
muito desconto na NF, e o imposto é no momento da NF"*. **Não é desconto** — o
unitário sai CHEIO na nota. Vender a 15,60 com 4,10 de desconto e vender a 11,50
dão o mesmo total e notas fiscais diferentes.

⚠️ **E o produto FÍSICO continua sendo um só:** *"quando for vendido e precisar
produzir, ainda vão produzir o CarboZé sachê ou o CarboZé 100ml"*. Logo estoque,
produção e MRP olham o PAI.

É o **mesmo mecanismo do gêmeo de bonificação** (`20260900`): um produto irmão
que aponta para o pai, com o estoque baixando do pai. A única diferença é o
preço — lá zero, aqui cheio.

```
carbo_faixa_preco                  as faixas, CADASTRO (codigo, rotulo, sufixo, hint, ordem)
mrp_products.preco_de              aponta o PAI
mrp_products.faixa_preco           qual faixa (anda SEMPRE junto com preco_de)
carbo_preco_faixa_criar(uuid,text) cria sob demanda, idempotente
supabase/migrations/20261019000000_faixa_de_preco_por_tipo_de_cliente.sql
```

1. ⚠️ **DUAS colunas, não uma.** Pôr a faixa em `bonificacao_de` faria a tela
   travar 100% de desconto na linha — o oposto do que precisa acontecer. Um
   CHECK impede as duas preenchidas juntas: seriam dois donos para "quem é o
   meu pai", o erro do `bling_nf_id`.
2. ⚠️ **As faixas são CADASTRO, nunca CHECK** — faixa nova é um INSERT, sem
   deploy. A lição de "plataforma nova entra em TRÊS CHECKs".
3. ⚠️ **`carbo_bonificacao_auto` teve de aprender a pular `preco_de`.** SEM
   ISSO A MIGRAÇÃO CRIA LIXO SOZINHA: o gatilho dispara em todo Produto Final
   novo com `bonificacao_de is null`, e a linha de faixa é exatamente isso —
   criar "CarboZé 100ml - PDV" criaria junto o "- bonificação" dele. Bonificação
   não tem faixa: é de graça nas três.
4. ⚠️ **`sale_price` NASCE NULO** — o oposto do gêmeo de bonificação, que nasce
   0. Lá zero é o preço CERTO; aqui zero seria resposta inventada e o `/vender`
   venderia de graça sem reclamar. Nulo significa NÃO PRECIFICADO e a tela
   recusa a venda. A lição do `('CZ100', 0)` da `20260969`.
5. **Criação SOB DEMANDA, produto a produto**, por botão em `/comercial/precos`.
   Criar as duas faixas para os 22 produtos de uma vez encheria o dropdown com
   44 linhas que ninguém pediu, a maioria sem preço e portanto invendáveis.
6. ⚠️ **Quem filtra `.is("bonificacao_de", null)` tem de filtrar `preco_de`
   junto** — `useStock`, `useMrpProducts`, `useSkuMapeamento` (Ops) e a view
   `vendedor_estoque`. Sem isso a grade de Suprimentos ganha uma linha ZERADA
   por produto POR FAIXA.
8. ⚠️ **TELA também tem de resolver o pai, não só o banco** (06/10/2026). A
   dedução sempre esteve certa, mas o Rastreio do Ops conferia estoque e criava
   a OP pelo `product_id` CRU: "CarboZé 100ml - PDV" aparecia com estoque 0 (o
   saldo é do pai) e o portão mandava PRODUZIR o que estava na prateleira.
   Hoje `useEstoqueDoPedido` e `ensureProductionOrderForOrder` (`usePosVenda`)
   chamam `carbo_itens_para_estoque` — a MESMA função da dedução —, e o
   `faltaNaCaixa` do `/vender` resolve `preco_de`. Lugar novo que leia item de
   pedido para estoque ou produção passa pela função, nunca pelo id do item.
9. ⚠️ **PENDENTE, e é decisão do dono do processo:** nada impede o vendedor
   escolher "Microdistribuidor" para quem compra uma vez. A faixa é propriedade
   do CLIENTE e virou propriedade do PRODUTO — foi o que ele pediu, e o custo é
   este. A trava possível é o `/vender` só oferecer a faixa compatível com o
   cadastro do cliente. Enquanto não existe, a mitigação é o hint aparecer na
   tela DEPOIS do clique ("Preço de Microdistribuidor — compra em volume…").

### Quem APARECE no dropdown do /vender — `aparece_no_vender`
Medido em 29/09/2026: **11 produtos reais e 11 gêmeos de bonificação = 22
linhas**, mais as faixas. Metade da lista é gêmeo, e gêmeo é usado numa venda a
cada muitas. Queixa do dono do processo: *"o dropdown lotado de coisa, difícil
de achar os itens"*. Interruptor por linha em `/comercial/precos`
(`carbo_produto_no_vender`, migração `20261020`). ✅ Resultado: 24 → **10**.

1. ⚠️ **COLUNA NOVA, NUNCA `is_active`.** Aquele governa o sistema TODO — MRP,
   produção, grade de Suprimentos, caixa de vendedor, mapa de SKU. Desativar um
   produto para tirá-lo do dropdown o tiraria do ESTOQUE junto, e o saldo que
   existe na prateleira sumiria da tela sem erro nenhum.
2. ⚠️ **E não é `sale_price is null`.** "Não tem preço" é lacuna de
   configuração; "não quero na lista" é decisão. Juntar as duas faria esconder
   um produto virar apagar o preço dele.
3. ⚠️ **`default true`** — nasce APARECENDO. O contrário esconderia o catálogo
   inteiro no instante da migração e o `/vender` ficaria sem produto nenhum.
4. ⚠️ **O `/vender` NÃO filtra cegamente:** a lista é
   `p.aparece_no_vender || p.id === r.productId`. Sem o segundo termo, reabrir
   um orçamento cujo produto foi escondido depois mostraria a linha VAZIA
   carregando um produto real — e salvar perderia o item, calado.
5. **O rótulo na tela é "No /vender", não "Ativo".** Chamar de ativo faria
   alguém desligar um produto que tem saldo na prateleira achando que só estava
   limpando a lista.
6. ⚠️ **Produto novo nasce aparecendo, e o gêmeo dele também** — cada Produto
   Final cadastrado acrescenta DUAS linhas ao dropdown, não uma.

### O dropdown de produto é AGRUPADO — e a bonificação não mostra preço
1. ⚠️ **A bonificação mostrava o preço do pai e é GRÁTIS.** "CarboPRO 100ml -
   bonificação — R$ 15,60" lia-se como "custa 15,60"; a linha sai com 100% de
   desconto travado. O preço espelhado existe por um motivo bom — no PDF o
   cliente vê `R$ 133,68 × 10 · −100% · R$ 0,00`, que mostra o tamanho do brinde
   —, mas no dropdown aquele número não tem esse contexto e vira número errado
   sobre DINHEIRO. Hoje diz **"grátis"**.
2. **O nome do produto é CABEÇALHO do grupo** e sumiu das opções. Ele aparecia
   em 4 linhas e o que as distinguia era o SUFIXO — a parte mais difícil de ler.
3. ⚠️ **A ordem era ACIDENTAL.** Alfabética, então "CarboZé 1 Litro" vinha antes
   de "CarboZé 100ml"; e a bonificação cair logo abaixo do pai era SORTE
   (`- b` < `- M` < `- P`). Hoje é explícita: padrão → faixas na ordem do
   CADASTRO → bonificação por ÚLTIMO (ela não é opção de preço, é a exceção).
4. ⚠️ **UMA informação por opção, e ela é o PREÇO.** A primeira versão levava
   chip colorido + preço + a dica da faixa na mesma linha: o texto estourava a
   largura e era cortado à direita. A dica virou linha ABAIXO do campo, que
   aparece DEPOIS do clique — ali cabe, e confirma o que foi escolhido.
5. ⚠️ **O CAMPO FECHADO mostra o nome COMPLETO**, não o rótulo da opção. Sem
   isso ele dizia só "Microdistribuidor R$ 11,50" — e de qual produto? Dentro do
   menu o nome está no cabeçalho; no campo fechado não há cabeçalho nenhum.
   **Só apareceu renderizando:** nem o `tsc` nem o build sabem o que o Radix
   desenha ali.
6. `useFaixasPreco` é consulta SEPARADA, não embed: embed do PostgREST depende
   do cache de esquema e, ao falhar, derrubaria a consulta inteira — dropdown
   vazio. A reserva é o NOME do produto (reserva de APRESENTAÇÃO, nunca de
   identidade; o código cru nunca aparece na tela).

### ⚠️ CarboVAPT por PORTE: tentado, MEDIDO e removido (29/09/2026)
A ideia era segmentar o faturamento de CarboVAPT em P/M/G a partir da NFS-e.
**Não funciona, e o dado prova.** A `20261017` foi revertida e a seção saiu do
`/comercial/dashboard`.

```
total            R$ 727.615,56
classificado     R$ 110.800,00   15,2%
não classificado R$ 616.815,56   84,8%
```

1. ⚠️ **O PORTE NÃO ESTÁ NA NOTA.** A palavra nunca aparece nas 342 notas, e o
   detalhe estruturado da descrição (`texto|qtd|unit|total#`) acaba em 30/04 —
   trocaram de emissor, a numeração reiniciou (2120 → 50).
2. ⚠️ **A nota traz o TOTAL do serviço, não o preço de um veículo.** R$ 800 × 19
   notas = dois P; R$ 3.200 × 22 = oito P **ou** 400 + 4×700; R$ 4.200 = três G
   **ou** seis M. Alargar faixa não resolveria: chamaria de "um M" o que são
   dois P, e o número sairia plausível e errado.
3. ⚠️ **A seção chegou a ser MERGEADA sem o SQL ter rodado**, e ficou no ar
   lendo uma view inexistente: cabeçalho e legenda renderizando com a grade
   VAZIA, sem erro. Seção que não consegue mostrar número é pior que seção
   nenhuma — quem olha não sabe se é "não vendeu" ou "não carregou".
4. **O caminho que funciona é o porte ser GRAVADO no ato da venda.** O `/vender`
   já guarda `modality` (P/M/G) em cada linha de serviço; o que falta é essa
   informação chegar ao dashboard. Deduzir da nota depois é o que não dá.

### Estoque do vendedor / pronta entrega
Cada vendedor tem uma caixa física: um `warehouse` com `kind='vendedor'` e
`owner_id`. Reusar `warehouses` (e não criar tabela nova) é o que faz o fluxo
já vir pronto — `warehouse_stock`, `stock_movements`, `stock_transfers` e
`ops_stock_min` giram todos em torno de `warehouse_id`.

```
supabase/migrations/20260898000000_estoque_vendedor.sql   caixas, trigger, view (BLOCOS)
supabase/migrations/20260899000000_pronta_entrega.sql     dedução/estorno/esteira (BLOCOS)
apps/ops/src/pages/compras/EstoqueVendedores.tsx          ver e abastecer
apps/*/src/hooks/useMeuEstoque.ts                         saldo do vendedor (nos SEIS)
```

1. **As caixas ficam FORA da lista `HUBS`** do `stockData.ts`, de propósito:
   ela vira uma coluna cada na grade de Suprimentos, e quinze vendedores a
   tornariam ilegível. O `useStock.ts` ignora código desconhecido
   (`if (!hubId) continue`), então elas não aparecem lá — e não devem.
2. **O envio tem duas etapas.** `ops_transfer_register` tira de Natal e põe em
   trânsito; só `ops_transfer_confirm` credita a caixa. Creditar na saída faria
   o vendedor vender a pronta entrega o que ainda está na estrada.
3. **O estorno lê `estoque_warehouse_id`**, com fallback no HUB-RN para o
   histórico. Antes tinha `'HUB-RN'` escrito no código — cancelar uma venda de
   pronta entrega devolveria a Natal um produto que está na van do vendedor.
4. **A dedução trava a linha (`FOR UPDATE`) antes de conferir saldo.** Sem
   isso, duas vendas simultâneas do mesmo vendedor leem o mesmo saldo e as
   duas passam: estoque negativo, sem erro.
5. **`carbo_itens_para_estoque` soma `bonificacao`.** O caminho antigo
   (`pos_venda_deduct_stock`, HUB-RN) lê só `quantity` e ainda tem esse furo —
   medido: 1 pedido, 40 unidades. Corrigir isso é passo separado, porque mexe
   no saldo de todas as vendas normais.
6. **A regra mora no BANCO, não na tela**, porque o `/vender` existe em seis
   apps — na tela seriam seis cópias para divergir. A tela só avisa antes do
   clique; quem recusa é a RPC.

⚠️ **`useVendas.ts` E `useCarbozeVendas.ts` NÃO são idênticos nos sete.** O CRM
filtra venda de marketplace da tela do vendedor (`FILTRO_VENDA_DO_TIME`), e
`lib/vendaDoTime.ts` só existe lá — os **dois** hooks o importam, não só o
primeiro (medido ao criar o `atendimento`). A divergência é intencional: copiar o do CRM por cima dos outros
quebra o build deles e muda o que mostram. Edite os seis com a MESMA alteração
mínima, em vez de sobrescrever.

### Bonificação é PRODUTO, não campo
O switch "Tem bonificação" saiu do `/vender`. Cada Produto Final tem um
**gêmeo** no catálogo (`CarboZé 100ml - bonificação`), ligado ao pai por
`mrp_products.bonificacao_de`. Escolher o gêmeo aplica 100% de desconto,
travado. Antes eram dois passos — somar a quantidade e depois abater o valor —
e dois lugares de errar.

1. **O estoque baixa do PAI.** `carbo_itens_para_estoque` resolve
   `bonificacao_de`: é a mesma garrafa da mesma prateleira. Olhar o id do gêmeo
   exigiria saldo de um SKU que nunca é produzido — e toda venda de pronta
   entrega com bonificação seria recusada.
2. **O gêmeo não é produto para o resto do sistema.** Sem saldo, sem produção,
   fora do MRP. Filtrado com `.is("bonificacao_de", null)` no `useStock.ts` e
   no `useMrpProducts.ts` do Ops, e na view `vendedor_estoque`. Sem isso a
   grade ganha uma linha zerada por produto.
3. **O preço do gêmeo ESPELHA o do pai** (trigger `trg_bonificacao_espelha_preco`).
   Preço zero funcionaria, mas apagaria o que dá sentido comercial ao brinde:
   o orçamento mostra `R$ 133,68 × 10 · −100% · R$ 0,00` e o cliente vê o
   tamanho do que ganhou.
4. **A linha de bonificação sai da base de rateio no `quotePdf.ts`.** Ela já é
   grátis; mantê-la em `brutoTotal` encolheria o fator e TODAS as outras linhas
   receberiam desconto a menos — o total deixaria de fechar.
5. **`bonus_quantity` continua sendo lido.** O histórico foi gravado no modelo
   antigo, e estorno de pedido velho tem de devolver o que saiu. No modelo novo
   ele é sempre 0 e a marca é `is_bonificacao` no item — explícita, nunca
   inferida de "total zero".
6. **Serviço de descarbonização ficou fora**: não é produto de catálogo, não
   tem gêmeo e não move estoque. O switch de bonificação dele permanece.

### Envio do Hub Natal para LICENCIADO — o crédito é no ACEITE
Pedido do dono do processo em 25/09/2026. O "Registrar envio" do Ops oferece os
licenciados como destino; o saldo sai de Natal e o licenciado só conta o que
recebeu depois do aceite, na tela dele.

```
public.warehouses  kind='licenciado' + licenciado_loja_id   o armazém de cada loja
carbo_licenciado_recebimentos(uuid)   a fila do app deles (roda como DONO)
carbo_licenciado_estoque_meu(uuid)    o estoque por produto (idem)
ops_transfer_confirm                  o aceite — e o ROTEAMENTO do crédito
licenciados.app_settings              chave `reagente_product_id` (CADASTRO)
supabase/migrations/20261009000000_envio_para_licenciado.sql
supabase/migrations/20261010000000_licenciado_novo_ganha_armazem.sql
carbohub-licenciados  src/components/stock/Recebimentos.tsx   (OUTRO repo)
```

1. **Reusa `warehouses`, não cria tabela nova** — a mesma decisão das caixas de
   vendedor, e pelo mesmo motivo: `warehouse_stock`, `stock_movements` e
   `stock_transfers` já giram em torno de `warehouse_id`, então saída, trânsito,
   aceite, estorno e auditoria vêm prontos. `ops_transfer_register` resolve por
   `code` e não filtra `kind` — não precisou ser tocada.
2. ⚠️ **DUAS CASAS, e cada produto tem UMA.** Reagente vai para
   `licenciados.reagent_stock` (é o que `register_service` debita e o
   `/inventory` deles lê); os demais vão para `warehouse_stock`. Frasco de
   reagente em `warehouse_stock` a OS **nunca veria** — o licenciado receberia
   carga e continuaria "sem reagente". Creditar nos DOIS criaria o par que
   diverge. Qual produto é o reagente é CADASTRO, e **chave ausente RECUSA o
   aceite**: creditar no lugar errado some com a carga sem erro.
3. ⚠️ **A fila sai de FUNÇÃO própria, nunca de `grant` em
   `carbo_transferencias`.** Aquela view é `security_invoker` sobre
   `stock_transfers` e `warehouses`: liberá-la mostraria a logística inteira da
   Carbo a outra empresa — o furo da `bling2_esteira`, que o portal de lojas e o
   de licenciados enxergariam por usarem a MESMA `profiles`. As duas funções
   rodam como dono, se guardam no próprio corpo e **ignoram o `p_loja` de quem
   não manda**.
4. ⚠️ **TRÊS tropeços de banco, todos medidos, e todos silenciosos de um jeito
   diferente:**
   - `warehouses_owner_coerente` é um SEGUNDO CHECK ("vendedor tem dono, hub não
     tem") e um terceiro tipo **não cabe** nele. O BLOCO 0 já o mostrava — mas o
     SQL Editor exibe só o resultado da ÚLTIMA consulta do bloco, então a saída
     que importava não foi vista. **Consulta de medição acompanhada de outras no
     mesmo bloco é consulta que ninguém lê.**
   - `create or replace view` só aceita coluna nova **no fim**: no meio, ele
     recusa com `42P16 cannot change name of view column`.
   - ⚠️ `RETURNS TABLE` exige `::text` em toda coluna de texto — `warehouses.name`
     e companhia são `varchar`. Sem o cast a função é **criada sem reclamar** e
     falha só na CHAMADA, com `structure of query does not match function result
     type`.
5. ⚠️ **Falha de consulta não pode virar "nada".** A primeira versão do card
   devolvia `[]` quando a RPC errava, e a tela ficava idêntica a "não há envio
   nenhum". Três hipóteses foram gastas nesse escuro (cache de esquema, guarda,
   bundle antigo) — todas erradas. Quem resolveu foi a tela passar a MOSTRAR o
   erro do banco.
6. **O aceite mora na LINHA do licenciado**, com o selo "N a aceitar" visível
   ANTES do clique. Um card solto no meio da página não foi achado — e, sem
   envio pendente, ele nem renderizava: "não subiu" ficava igual a "não há
   nada". Uma leitura só alimenta o selo e o popup, então eles não têm como
   discordar.
7. **Licenciado novo ganha armazém sozinho** (gatilho em `licenciados.lojas`),
   e o nome do armazém acompanha o da loja. Sem isso, loja renomeada apareceria
   no seletor com o nome antigo e quem envia escolheria errado, sem erro.

### Estoque do vendedor / pronta entrega
Base: o briefing de domínio "Carbo Core · Comercial NE · v1". As fases são
ordenadas e **antecipar produz tela sem dado**. Fase 1 = registro de visita
(check-in, conferência, check-out). Roteirização, curva ABC, sell-out e
previsão são fases 3 a 6 — não implemente por conta própria.

```
supabase/migrations/20260896000000_rtm_fase1_visita.sql   tabelas, RPCs, views, RLS
supabase/migrations/20260897000000_rtm_fotos_bucket.sql   bucket privado (rode em BLOCOS)
apps/crm/src/lib/rtmFila.ts      a fila offline (IndexedDB)
apps/crm/src/lib/rtmFoto.ts      compressão na captura
apps/crm/src/hooks/useRtm.ts     leitura do banco — NUNCA escrita
apps/crm/src/pages/rtm/          Agenda.tsx · Visita.tsx
```

⚠️ **Arquivo de RTM não é replicado nos seis apps.** A visita é do vendedor em
campo, e o Sales é o app dele. Copiar para admin/ops criaria a sétima cópia de
um fluxo que ainda vai mudar toda semana.

Cinco decisões que custam caro se forem desfeitas sem entender:
1. **Geo SINALIZA, nunca bloqueia.** A distância do check-in até o PDV é
   gravada e exibida; não impede nada. GPS erra, posto tem cobertura de bomba,
   e boa parte das coordenadas veio de geocodificação de endereço — o erro mais
   provável é do CADASTRO. Sistema que acusa vendedor honesto é desinstalado.
2. **A escrita passa SÓ pela fila local.** `useRtm.ts` lê; quem grava é o
   `rtmFila.ts`. Dois caminhos de escrita criariam duas verdades sobre a mesma
   visita, e a que vale é a do bolso de quem está no PDV.
3. **A fila enfileira a VISITA, não cada ação.** Os passos são encadeados
   (fechar exige foto e checklist no servidor; foto exige o id da visita). Cada
   passo é idempotente, e o `abrir` devolve a visita já fechada quando houve
   reenvio — sem essa checagem o retry bate no trigger de congelamento e falha
   para sempre.
4. **Visita fechada é imutável, e a regra está no BANCO** (trigger, e sem
   policy de DELETE em nenhuma tabela de registro). Correção é linha nova com
   `ajuste_de_id`. Imutabilidade que mora no front é imutabilidade que o
   próximo app esquece de copiar.
5. **Motivo é lista fechada** (`rtm_motivos`), e o checklist é tabela
   (`rtm_checklist_itens`), não enum — item de campanha entra com INSERT, sem
   deploy. Desative, nunca apague: visita antiga aponta para a linha.

⚠️ Etapa nova de conferência entra em `rtm_checklist_itens`. Motivo novo entra
em `rtm_motivos`. Nenhum dos dois em código.

### Cadastro de PDV — a chave é o CNPJ, e o nome NÃO é chave
O cadastro nasceu de planilha (`20260814000000_pdvs_carga.sql`) e continua sendo
atualizado por planilha. Três regras que já custaram caro:

1. **Casar por `regexp_replace(cnpj, '\D', '', 'g')`, nos DOIS lados.** A
   planilha traz o documento em formatos diferentes — uma linha veio
   `42.431.461.0001.69`, com pontos no lugar de `/` e `-`. Comparar o texto
   formatado deixa o PDV de fora **sem erro**.
2. **Nome não identifica PDV.** Cada CNPJ é uma filial independente dentro da
   mesma rede (Posto Amigo tem 6, Via Diesel 2, Postos RCM 19), e a planilha
   renomeia: o banco tem `Posto RF Afogados`, ela escreve `Postos RCM
   (Afogados)`. Casar por nome mistura endereço de filial. Os PDVs **sem
   documento** são a única exceção — e mesmo eles só quando o nome bate com
   exatamente UMA linha; batendo com duas, a migração não escolhe e **não
   insere**, senão criaria a terceira cópia e enterraria a ambiguidade.
3. ⚠️ **A comparação de nome é sem acento e minúscula.** A carga de agosto
   gravou tudo em ASCII (`Posto Sao Francisco`, `Alem Mar`); `name = 'Posto São
   Francisco'` não casa nada, e não casar passa calado — foi assim que esse PDV
   ficou sem abertura, sem dono e sem mix na `20260816`. Hoje existe
   `public.carbo_nome_chave(text)` para isso.

**Importar planilha nunca sobrescreve com vazio** (`coalesce(planilha, banco)`
campo a campo): cinco linhas chegam sem endereço, e gravar o vazio por cima
apaga cadastro bom. `legal_name` só PREENCHE o que está nulo — a razão social
boa é a da nota fiscal (`carboze_orders.customer_name`), não a da planilha.

**PDV novo entra como `'registered'`, nunca `'active'`**: é o status criado para
"existe na planilha e ainda não vende". Marcar de ativo infla a contagem de PDVs
ativos, que é o número que a diretoria olha.

⚠️ **`pages/Pdvs.tsx` é byte a byte idêntico entre `crm` e `admin`** (a ponte de
auth `isGestor`/`canAdmin` é o que permite isso). Editou um, copie o outro na
MESMA tarefa — é a lista de arquivos replicados que ninguém mantém que produz
divergência silenciosa, como no `quotePdf.ts` do `mkt`.

⚠️ **Importar o dado não o coloca na tela.** A `20260941` gravou endereço em 70
PDVs e a tela continuou mostrando só cidade/UF — a coluna, a busca e a modal
não sabiam que o campo existia. Ao trazer campo novo por migração, o passo
seguinte é sempre: onde ele APARECE e onde ele é BUSCÁVEL.

⚠️ **Conferência de importação compara com a FOTO do antes.** A
`20260941000000_pdvs_enderecos.sql` guarda `cidade_antes`/`rua_antes` na tabela
de staging antes do UPDATE; sem isso o relatório compararia a planilha com o
que ela mesma acabou de gravar e diria sempre "nada mudou" — um relatório que
só sabe concordar consigo mesmo. Foi ele que expôs a troca conhecida entre
Cidade Nova e Cidade das Rosas, e `AMG Garage` cadastrada em Barueri.

### `lib/quotePdf.ts` — o PDF do orçamento, nos seis
Byte a byte idêntico nos **seis** apps. Fonte da verdade = `apps/crm`. A raiz
está fora: o `controle` tem outro template, mais simples e antigo, sem desconto
no tipo — e está congelado.

⚠️ O arquivo ficou fora de qualquer lista e o `mkt` **divergiu sozinho**: passou
meses com a bonificação como sufixo no nome do produto (`(+2 bonif.)`) enquanto
os outros cinco já mostravam linha separada a R$ 0,00. Ninguém percebeu porque
divergir aqui não dá erro — dá um PDF diferente na mão do cliente.

⚠️ **São SETE cópias desde 28/08/2026** — o `atendimento` entrou e o texto acima
dizia seis. Conferido em 10/09: as sete estavam idênticas.

⚠️ **O desconto tem DOIS modos, e o rateio é o de reserva** (corrigido em
10/09/2026). O item SEMPRE teve desconto próprio — `discount_type`,
`discount_value`, `discount_amount`, gravados no ato da venda e visíveis em
`VendaItem` —, e o PDF ignorava os três: pegava o desconto do PEDIDO e rateava
por todas as linhas. Medido no `V2026090056`: R$ 416,00 dados **só** no CarboZé
100ml saíram no papel como R$ 230,40 no 1 Litro e R$ 185,60 no 100ml. **O total
fechava e a realidade não** — e o cliente lê o papel, não o total.

Hoje: se as linhas declaram desconto e a soma delas **fecha com o do pedido**,
usa o valor de cada linha; senão, rateia. A conferência não é firula — pedido
antigo só tem desconto no cabeçalho, e sem o rateio o PDF do histórico mostraria
linha sem desconto e rodapé com desconto, que é o defeito oposto e pior.

⚠️ **O elo que faltava não estava no PDF, e sim no `Vendas.tsx`**: o mapeamento
que remonta o pedido para regerar o papel **descartava** `discount_amount` — e
`is_bonificacao` junto, o que também jogava a linha de brinde de volta na base
de rateio. Campo que o PDF passou a ler tem de atravessar esse `map`.

⚠️ **Riscar só faz sentido quando HÁ valor cheio para riscar** (29/09/2026).
`riscar` era `true` fixo para toda linha de bonificação, e isso está certo para
o gêmeo de PRODUTO — ele espelha o preço do pai, e o R$ 133,68 riscado é o que
mostra o tamanho do brinde. Mas os **serviços que acompanham** o CarboVAPT
(laudo, medição) entram a R$ 0,00 de verdade: não têm gêmeo no catálogo e não
espelham preço nenhum, e o traço sobre "R$ 0,00" diria que eles ficaram mais
baratos — exatamente o que o comentário do `didDrawCell` logo abaixo já
proibia. Hoje é `riscar.push(unit > 0)`.

⚠️ **A sobra de centavo não pode cair em linha SEM desconto.** Ela ia para a de
menor quantidade; no modo por item isso inventaria centavos de desconto num
produto que não recebeu nenhum — o mesmo defeito em miniatura. Hoje a sobra só
escolhe entre linhas que já têm desconto.

O desconto rateado (modo de reserva) é do **pedido**, não do item: distribuído
por linha na proporção do valor. ⚠️ O arredondamento
é do **unitário**, nunca do total da linha — ratear pelo total faz o "Unit. c/
desc." sair de uma divisão e não fechar com a própria linha (R$ 133,68 × 10 =
1.336,80 contra um total impresso de 1.336,78). E sobra centavo: o desconto de
uma linha é sempre múltiplo da quantidade, então nem todo desconto de pedido é
alcançável com todas as linhas exatas. A sobra cai na linha de **menor
quantidade** — erro máximo (qtd − 1) centavos, zero quando há item de 1 unidade.

### ⚠️ Como verificar de verdade (o typecheck que engana)
Os `tsconfig.json` dos apps são solution-style: `"files": []` + `references`.
Por isso `tsc --noEmit -p tsconfig.json` **passa sem checar arquivo nenhum** —
retorna 0 sempre, inclusive com a tela quebrada. Já custou um deploy: uma função
inexistente (`fmtBRL`) foi para produção com "seis apps OK" no relatório.

Use, dentro de `apps/<app>`:
```
npx tsc -b --force     # checa de verdade (segue as references)
npm run build          # o que de fato vai para o ar
```
O repo **não** passa limpo no `tsc -b`: há erros pré-existentes (tipos do Vite
para `import.meta.env` e `@/assets/*.png`). Filtre pelos arquivos que você mexeu
em vez de esperar saída vazia.

`npm run build` NÃO substitui o `tsc`: o esbuild não checa tipos e deixa passar
identificador inexistente numa boa.

### Bloquear usuário — a trava é o AUTH, o popup é só o aviso
Pedido do dono do processo em 22/09/2026: tirar o acesso de quem saiu **sem
apagar os dados**, e devolver depois **com a mesma senha**. Antes só existia
`delete_user`, irreversível, e ele era usado por falta de outro.

```
auth.users.banned_until               a TRAVA  (Admin API, `ban_duration`)
carbo_usuario_bloqueio_log            o HISTÓRICO — e o SINAL do Realtime
carbo_usuarios_bloqueados (view)      quem está bloqueado AGORA, para a tela
create-team-member  block_user/unblock_user
apps/*/src/components/BloqueioAoVivo.tsx   o popup — REPLICADO nos SETE
```

1. ⚠️ **A trava mora no Auth, nunca numa coluna de `profiles`.** Coluna de
   perfil exigiria que os sete apps, o Hub e os dois portais lembrassem de
   checá-la — e o que esquecer deixa entrar, calado. Banido no GoTrue é
   recusado ANTES de existir sessão, em todo o ecossistema. Mesma razão da
   dedução de estoque morar na RPC e não no `/vender`.
2. **A senha não é tocada**, e é isso que faz desbloquear devolver o acesso
   como era. Nada é apagado: `profiles`, `user_roles`, `org_chart_nodes`,
   vendas, leads e OS ficam onde estão.
3. ⚠️ **O log é HISTÓRICO, não estado.** Quem responde "está bloqueado?" é o
   `banned_until`. Guardar o estado ali também criaria o par que diverge — a
   tela dizendo bloqueado e o login deixando entrar, sem erro. E ele é
   append-only: **nenhuma** policy de INSERT/UPDATE/DELETE, senão dá para
   forjar auditoria (e forjar um `desbloqueado` que o Auth não tem).
4. ⚠️ **A view roda como DONO** — é como ela alcança `auth.users`, que o
   PostgREST não expõe. Por isso lista as colunas UMA A UMA (com `*` sairiam
   `encrypted_password` e tokens de recuperação) e se guarda no próprio
   `WHERE`. Ligar `security_invoker` a esvazia e a tela passa a dizer "ninguém
   bloqueado" para sempre. Mesmo molde da `ml_accounts_public`.
5. ⚠️ **O Auth NÃO avisa ninguém** — essa é a origem da janela de 1 h. O GoTrue
   só confere o banimento quando alguém bate na porta (login ou renovação de
   token), e `auth.users` não é publicada no Realtime. Por isso o aviso sai da
   tabela NOSSA, que a mesma função já escrevia no mesmo instante (`20261000`
   publicou a tabela e abriu a própria linha a cada um, com
   `user_id = auth.uid()`). Tabela separada só para avisar seria uma segunda
   verdade sobre o mesmo fato.
7. ⚠️ **O sinal NÃO substitui a trava.** Realtime fora do ar ⇒ a aba cai na
   renovação do token, como antes: o pior caso volta a ser o de ontem, nunca
   "continua entrando". Aviso que falha ABERTO é pior que aviso nenhum.
8. ⚠️ **O `BloqueioAoVivo` monta ao lado do `<App />`, dentro do
   `AuthProvider`** (`main.tsx`), NUNCA dentro do `Layout` ou de uma rota: o
   `signOut` troca a tela para o login, e lá dentro o componente desmontaria
   junto — o aviso sumiria no instante em que aparece.
9. ⚠️ **Ele escuta `onAuthStateChange`, não o `useAuth()` do app.** Os sete
   `AuthContext` divergem entre si; amarrar um deles faria as sete cópias do
   arquivo deixarem de ser idênticas.
10. ⚠️ **Realtime não reentrega o que passou.** Aba dormindo, notebook fechado
   ou queda de rede perdem o evento PARA SEMPRE — daí a conferência na volta do
   foco (`focus` **e** `visibilitychange`, porque nem todo navegador dispara os
   dois). E ela lê a ÚLTIMA linha: "existe algum bloqueio?" derrubaria quem já
   foi desbloqueado, para sempre.
10. **Bloqueado SAI da lista de Usuários e mora no chip "Bloqueados"**
   (decisão do dono do processo, 07/10/2026 — antes ficava na lista, marcado).
   Uma lista OU a outra: o clique alterna. ⚠️ O chip fica à vista com a
   contagem enquanto houver bloqueado — é o que impede quem perdeu o acesso de
   sumir da cabeça de quem revisa.
   A barra é FILTRO em tudo, com a mesma forma: abas **Ativos | Bloqueados**,
   abas **Todos os níveis | Gestores**, e pílulas de **Sistema** (uma escolha;
   cor só na bolinha). Cada número é contado com os OUTROS filtros aplicados e
   o dele solto (`passa(p, menos)`), senão a opção contaria a si mesma.
12. ⚠️ **Os dois PORTAIS ficaram de fora** (outro repo): login deles ainda
   mostraria `User is banned` em inglês, e não têm o popup. A trava vale lá
   igual — o que falta é a tradução e o aviso.

### Notificação de venda online — nos sete
Venda do e-commerce toca som e mostra toast em QUALQUER app que a pessoa esteja
usando. Três arquivos, replicados: `public/sounds/venda-online.mp3`,
`src/lib/sfxVenda.ts` e `src/hooks/useEcommerceNotifications.ts`, montado no
Layout (no CRM é o `SalesShell`).

Fonte da verdade = **raiz**. Os seis apps são idênticos entre si; a raiz difere
só pelo import do `toast` e pelo link "Ver dashboard", que aponta para uma rota
que só ela tem.

Quem decide o que é venda nova é o **banco**, e só ele:
1. **O hook escuta `notifications`, NUNCA `ecommerce_orders`.** A versão antiga
   escutava a tabela de pedidos e julgava sozinha. Não tinha como acertar: o
   Realtime não entrega o registro ANTERIOR (depende de `REPLICA IDENTITY
   FULL`), então a tela não distinguia "virou pago" de "o sync de 15 min
   regravou a linha". Dava três toasts de venda depois de um F5, para pedidos de
   dias atrás, com o sininho — corretamente — vazio. O gatilho
   `trg_ecommerce_sale_notify` tem `OLD.status` e a janela de 12h; a tela só
   reage ao que ele decidiu. Uma regra governa som, toast e sininho.
2. **Quem recebe: todo o time interno.** O gatilho chama `notify_time_interno`
   (não `notify_admin_users`, que era só `carbo_admin`) — decisão de deixar todo
   mundo ver o crescimento. ⚠️ O filtro de interface interna **não é
   decoração**: o portal de lojas e o de licenciados usam a MESMA tabela
   `profiles`, e sem ele o lojista recebe o faturamento da Carbo no sininho.
3. **Um som só, num lugar só.** Havia uma moedinha **sintetizada** (Web Audio)
   nos hooks do sino (`useLiveNotifications`, `useFinanceRealtime`): era ELA que
   se ouvia, não o MP3 — e por isso parecia que o arquivo instalado estava
   errado. Hoje esses hooks só atualizam o sininho no `ecommerce_sale`. O
   `avisarVendaOnline` (em `sfxVenda.ts`) dedupe pelo id do pedido. **Não volte
   a tocar som de venda fora do `sfxVenda.ts`.**
4. **O áudio precisa ser destravado.** Navegador só toca depois de um gesto do
   usuário, e a venda chega por Realtime, fora de qualquer clique. O
   `sfxVenda.ts` destrava no primeiro clique da sessão com um play mudo; sem
   isso o `play()` é recusado **sem erro visível**. Destrava com `muted = true`,
   não `volume = 0`: a política de autoplay do Chrome olha a propriedade
   `muted`.
5. **Falha de áudio não pode ser silenciosa.** `play()` recusado e 404 no MP3
   davam o mesmo sintoma (nada) porque o `catch` era vazio. Hoje os dois
   aparecem no console, e há `__somVenda.estado()` / `__somVenda.testar()`.

### Unidades: são DUAS perguntas, e trocá-las erra nos dois sentidos
O kit não tem "um" número de unidades. Tem dois, e eles divergem:

```
display_units_per_pack   quantas unidades o CLIENTE levou    → telas de VENDA
unidades_por_venda       quantos itens saem da PRATELEIRA    → só o ESTOQUE

SKU 120 → KIT-CARB-SACH-10ML   cliente leva 10 · prateleira perde 1
SKU 124 → CZ100                cliente leva  5 · prateleira perde 5
```

O kit de sachês entrega **dez sachês** e tira **um kit fechado**, porque a
LogHouse guarda kits (saldo 1.253) e **zero** sachês soltos. No CZ100 os dois
valem 5 e a diferença some — foi essa coincidência que fez a `20260955` unificar
os campos, e o sachê desmentiu no dia seguinte. **Não volte a juntá-los.**

Trocar um pelo outro erra em direções opostas: no painel, um kit vira 1 unidade
vendida; na dedução, **10 kits baixados**.

```
carbo_ecommerce_sku_resolve        estoque    lê unidades_por_venda
carbo_ecommerce_unidades_exibidas  telas      lê display_units_per_pack
apps/admin/src/lib/skuUnidades.ts  o espelho no front (regra idêntica)
src/lib/skuUnidades.ts             cópia na raiz — fonte da verdade é o admin
```

1. **Fator desconhecido devolve `null`, nunca 1.** O `×1` que aparecia no kit de
   5 não vinha de mapa errado: a linha vinha **sem SKU**, nunca consultava o
   mapa, e um `Math.round(unidades/pedidos)` **inventava** o 1. Ausência
   disfarçada de resposta é pior que ausência — some da lista de trabalho.
2. **A chave do mapa é (plataforma, SKU).** Indexado só por SKU, o desempate era
   a ordem que o PostgREST devolvesse: o fator da Nuvemshop podia ser aplicado a
   uma linha da Shopee, e mudar entre execuções.
3. ⚠️ **Fator conhecido multiplica `quantity`, NUNCA `units_real`.** A Nuvemshop
   já multiplica na ESCRITA (`enrichUnitsReal`, em `_shared/nuvemshop.ts`);
   reusar aquele valor daria ×25 num kit de 5. `units_real` só entra quando não
   há fator.
⚠️ **O ENSAIO tem de aplicar as MESMAS travas da função** (`20260979`). Ele
nasceu perguntando "esta linha resolve para um produto?" e chamando a resposta
de "o que a dedução faria" — sem o marco zero e sem o ledger. Medido em 09/09:
**718 linhas como `deduziria`, das quais 135 já estavam no ledger e 582 eram
anteriores ao marco. 717 das 718 eram ficção.** O cron rodava havia onze dias e
deduzia uma.

Lista de trabalho que nunca esvazia é lista que ninguém abre — e é o inverso da
doença da `20260941`: em vez de só concordar consigo mesma, ela discordava para
sempre do que o sistema faz.

⚠️ **`anterior ao marco zero` e `já deduzido` são vereditos SEPARADOS**, e
juntá-los recria o erro de 31/08: um pergunta se a venda é ANTIGA (data), o
outro se a saída já foi CONTADA (ledger). Coincidem no primeiro dia e divergem
depois.

⚠️ **`deduziria` não precisa ser ZERO**: o cron roda a cada 10 min, então venda
recém-chegada aparece ali legitimamente. O que se confere é se a pendente é
RECENTE — uma de dias atrás é que é sinal.

⚠️ O texto `SEM MAPEAMENTO` é CONTRATO com a aba do Ops, que filtra por
`ilike '%SEM MAPEAMENTO%'`. Mudar a string esvazia a aba sem erro nenhum.

4. **`ecommerce_raw_summary` NÃO recebe a regra.** Ela é a visão crua do que está
   gravado, e é a **divergência** entre ela e o Histórico que denuncia mapa
   faltando. Um relatório que só sabe concordar consigo mesmo é a doença da
   `20260941`.
5. ⚠️ **A tela de cadastro só EDITA `unidades_por_venda`.** O
   `display_units_per_pack`, que é o número dos painéis, é somente leitura no
   Ops — ninguém consegue corrigi-lo pela interface, e display novo entra por
   SQL. Pendente, e é o próximo passo da tela.

Medido em 28/08/2026, agosto: o ML reportava **96** unidades e o cliente levou
**580**; a Amazon, 8 contra 50. Faturamento não mudou — o erro era só a
contagem.

### O mapa SKU→produto é CADASTRO, não código
`sku_product_mappings`, editável em **Ops → Suprimentos → CD SP → Mapeamento
SKU**. Produto novo entra por ali; nenhum deploy.

1. **`platform = null` vale para todas as plataformas**, e o mapa específico
   vence. Foi o que zerou 111 linhas órfãs de uma vez: o ML e a Amazon vendem os
   MESMOS SKUs (`124`, `120`) que a Nuvemshop, e os mapas estavam presos ao
   canal.
2. **`product_id` é o que está FISICAMENTE NA PRATELEIRA**, não o item unitário
   por princípio. `CZ100` fica avulso (kit de 5 = 5 frascos); o sachê fica em
   kit fechado (kit de 10 = 1 kit). Confira `warehouse_stock` do HUB-SP antes de
   escolher: apontar para produto com saldo sempre zero manda a dedução ao
   negativo na primeira venda.
3. ⚠️ **Não há fallback por `product_code`.** SKU sem linha não resolve, e o
   sintoma é `SEM MAPEAMENTO` no ensaio — nunca um erro. O comentário da
   `20260955` prometia essa rede; a `20260958` desfez a promessa.
4. **SKU vazio na origem é problema de CADASTRO da plataforma.** A Shopee
   passou meses com `item_sku`/`model_sku` em branco no anúncio: o código lia os
   dois campos corretamente e os dois vinham `""`. Resolveu-se preenchendo `124`
   no painel da Shopee — zero código. ⚠️ Anúncio NOVO sem SKU volta ao mesmo
   buraco, calado; a aba "SKUs vendidos sem mapa" é o único lugar onde isso
   aparece, e por isso ela MOSTRA a linha sem SKU em vez de escondê-la.

### E-commerce: dedução de estoque — por canal, com marco zero
A dedução já existiu, deduzia do mesmo HUB-SP e foi desligada em 03/08/2026
(`20260834`) sem motivo registrado. Voltou na `20260956`, com o que faltava.

```
carbo_canal_estoque      qual galpão, e se o canal deduz (nasce ativo=false)
carbo_estoque_consumo    o ledger — e o índice único é a TRAVA
carbo_estoque_ensaio     o que a dedução FARIA, sem fazer
carbo_ecommerce_deduzir_estoque / _estornar_estoque    cron 8-59/10
```

1. ⚠️ **`deduz_a_partir_de` é MARCO ZERO, e nulo NÃO deduz** mesmo com
   `ativo = true`. Sem ele a primeira rodada baixaria 90 dias de uma vez: 1.664
   unidades sobre um saldo de 345, indo a −1.319 em segundos. E 402 delas já
   saíram pelo caminho antigo — o índice único não pega isso, porque aquelas
   baixas nunca passaram pela tabela nova. Mesma lição do
   `carbo_carrinho_config.inicio_em`.
2. **Função em cron, não trigger.** Idempotente (o índice único decide) e
   re-executável: rodada interrompida se completa na seguinte. Trigger dá uma
   chance por evento. O trigger antigo continua existindo e inerte — trocá-lo
   pediria `AccessExclusiveLock` em `ecommerce_orders`, que o webhook escreve a
   qualquer hora.
3. **Saldo negativo NÃO trava.** A venda já aconteceu; recusar não devolve a
   garrafa à prateleira, só faz o espelho divergir em silêncio. O negativo é a
   informação: diz que a contagem do galpão está atrás.
4. **O estorno APAGA a linha do ledger**, não a marca. É a linha que significa
   "já contabilizado", então removê-la é o que deixa o pedido elegível de novo
   se voltar a ficar pago. Um booleano faria o pedido ressuscitado nunca mais
   deduzir.
5. **A baixa vira linha auditável em Movimentações** (`stock_movements`, aba do
   CD SP). Duas colunas existem só para isso: `ref_externa` guarda o pedido
   (`nuvemshop:1234-5678`), porque `order_id` é FK de `carboze_orders` e não
   aceita texto — e `executor` (`cron:ecommerce`) faz a tela escrever
   "Automático" em vez de "—", que é o que ela mostra quando **não se sabe**
   quem fez. A observação carrega o CÁLCULO (`3 × 5 un · SKU 124`); o
   identificador fica na coluna, para dar para filtrar e copiar.
6. **Saldo negativo em ruptura é O NÚMERO, não um defeito.** Confirmado pelo
   dono do processo em 28/08/2026: a LogHouse zerou e as vendas continuam; o
   negativo é quanto ela deve empacotar quando o lote chegar. ⚠️ Ao lançar a
   reposição, o ajuste da tela recebe o **saldo final contado**, não o que
   chegou — digitar "800" com saldo em −200 gera entrada de 1.000 e conta a
   dívida duas vezes.
7. ⚠️ **"Venda online ⇒ saiu da LogHouse" é PREMISSA, não dado.** Em ML Full e
   Amazon FBA a mercadoria já está com a plataforma e nada sai daqui. Nuvemshop,
   ML e Amazon estão ligados porque o dono do processo confirmou despacho
   próprio (28/08/2026) — **adotou Full, DESLIGA no mesmo dia**, senão a venda e
   a remessa de reposição contam a mesma saída duas vezes.
8. ⚠️ **A pegada da etiqueta do Melhor Envio só mede a Nuvemshop.** ML, Amazon e
   Shopee deram 0% e isso **não** prova Full: prova que não passam pelo Melhor
   Envio (Mercado Envios, logística da Amazon, SPX). `0 de 102` é limpo demais
   para ser comportamento comercial — é um teste que não se aplica.

### ⚠️ Três armadilhas medidas em 31/08, todas silenciosas

**1. Procurar CHECK não é procurar restrição.** A dedução ficou TRÊS DIAS
abortando a cada 10 min com `Origem de movimento inválida: ecommerce`. Eu tinha
procurado um CHECK na coluna `origem`, não achei nenhum, e concluí que não havia
restrição — ela era um TRIGGER (`validate_stock_movement`). Cheguei a ler a
função, vi que validava `tipo`, e presumi que era só isso. Trigger, RULE e
domínio fazem o mesmo trabalho por outros meios; pergunte por
`pg_get_functiondef` nos gatilhos da tabela, não só por `pg_constraint`.
⚠️ E o sintoma foi mudo do jeito conhecido: `cron.job_run_details` marcando
`failed` de 10 em 10 minutos, e ninguém olha aquilo.

**2. Campo que vem da plataforma NÃO se corrige no banco.** Preenchemos o SKU
da Shopee com `update` e ele sumiu: o `ecommerce-sync` faz upsert a cada 5 min e
regrava o vazio por cima. As linhas de 21/08 mantiveram o valor (fora da janela
que ele relê) e as de 26 e 27 voltaram a nulo — o padrão prova o mecanismo.
Correção que dura é na ORIGEM (preencher o SKU no anúncio).
O gatilho `ecommerce_nao_apaga_com_vazio` passou a impedir que vazio apague dado
bom em `product_sku`, `product_name`, `cliente_nome`, `cliente_fone`,
`cliente_email` e `platform_order_number` — é a MESMA regra que a carga de PDV
por planilha já seguia (`coalesce(planilha, banco)`), que existia no repo e não
tinha sido aplicada aqui.

**3. Marco zero precisa ANDAR quando o ponto de partida muda.** Com o gatilho
corrigido, a primeira rodada deduziu os 3 dias acumulados — em cima de um saldo
que tinha acabado de ser ajustado à mão pela contagem física da LogHouse. A
mesma saída foi contada duas vezes.

⚠️ **Mas a conclusão "o marco vai junto" estava ERRADA, e foi revista em 31/08.**
Marco zero é filtro por DATA (`ordered_at > deduz_a_partir_de`): ele pergunta se
a venda é ANTIGA, não se ela já foi contabilizada. As duas coisas coincidem no
primeiro dia e divergem depois — avançá-lo pega por engano todo pedido feito
antes da contagem que ainda **não é venda**: a mercadoria estava na prateleira,
ENTROU na contagem, e quando for paga sai de verdade **sem nunca ser
descontada**. Medido no dia: 50 pedidos pendentes, 68 itens.

Quem impede a dupla contagem é o **ledger** (`carbo_estoque_consumo`), que
pergunta a coisa certa: "esta saída já está contabilizada?". Com ele em dia
— `carbo_ecommerce_deduzir_estoque()` voltando vazio — **o marco não precisa
andar**, e andar só criaria o vazamento. Ele fica para o que foi feito: impedir
que religar um canal baixe 90 dias de uma vez.

⚠️ **E o ajuste de saldo precisa do INSTANTE da contagem.** `quantity =
<contado>` é absoluto, mas a contagem descreve a prateleira num instante e o
cron deduz a cada 10 min: contar 800 às 16:30, o cron baixar 5 às 16:38 e rodar
o ajuste às 17:10 **apaga** aquela venda. É a dupla contagem ao contrário. A
`20260969` desconta sozinha o que saiu depois do instante informado.

⚠️ **Valor de exemplo em bloco destrutivo tem de RECUSAR rodar.** A primeira
versão da `20260969` trazia `('CZ100', 0)` como exemplo; rodada sem edição,
zerou 275 e 1.145 sem reclamar — e não podia reclamar, porque `0` é um saldo
válido (`CARB-SACH-10ML` tem 0 de verdade). Exemplo indistinguível de resposta é
a mesma doença do `Math.round` inventando `×1`. Hoje o exemplo é `null`, o bloco
é plpgsql e a primeira coisa que ele faz é abortar dizendo qual produto falta.
Produto não contado: **apague a linha**, nunca escreva 0 — "não contei" e
"contei zero" são respostas diferentes.

⚠️ **A consulta que guarda as três garantias** (só venda deduz, cancelada
devolve, pendente não deduz) é uma só, e vale rodar de tempos em tempos:

```sql
select count(*) as consumos_indevidos
from public.carbo_estoque_consumo k
join public.ecommerce_orders o on o.platform || ':' || o.order_id = k.origem_chave
where k.origem_tipo = 'ecommerce'
  and not public.ecommerce_status_e_venda(o.status);
```

`ecommerce_status_e_venda` é a lista branca ÚNICA — o ensaio, o estorno, o
sininho e o resumo mensal leem dela. A `carbo_estoque_ensaio` já teve uma cópia
sem `lower()`: um status `Paid` contaria como venda no painel e não baixaria
estoque.

### ⚠️ A contagem física é um TERCEIRO relógio, e o ledger é quem o respeita
Auditoria de 28/09/2026, nos cinco canais que deduzem. O gatilho foi a Shopee:
o anúncio `58264919957` ("CarboZé Kit 5 Frascos 100ml") estava **sem SKU no
painel**, então 9 vendas não resolviam para produto nenhum — não deduziam, e os
painéis contavam 1 unidade onde o cliente levou 5.

⚠️ **Preencher o SKU do passado NÃO é a correção; é a limpeza.** O que dura é
preencher `124` no painel da Shopee — anúncio NOVO sem SKU volta ao mesmo
buraco, calado. A aba "SKUs vendidos sem mapa" é o único lugar onde isso
aparece, e é por isso que ela MOSTRA a linha sem SKU com o botão desabilitado.

⚠️ **E o `update` no banco só dura porque o `trg_ecommerce_nao_apaga_com_vazio`
existe.** Ele impede que vazio apague dado bom em `product_sku`, então o
`pullShopee` de 5 em 5 min não regrava `null` por cima. Sem ele seria agosto de
novo. **Conferido no banco (`pg_get_functiondef`), não na memória** — aquele
gatilho é citado no repo e não está definido em migração nenhuma.

⚠️ **`product_sku` é o que NÓS gravamos; `raw->'_item'` é o que a plataforma
MANDOU — e confundi-los inverteu a conclusão** (29/09/2026). O anúncio voltou
à aba "sem mapa" e eu li a coluna: 13 de 16 linhas com `124`, 3 vazias, e
concluí "o painel funcionou e regrediu". O payload cru desmentiu: `item_sku`
vem **vazio nas DEZESSEIS**, inclusive nas treze com `124`. Aqueles `124` eram
**nossos**, da limpeza da `20261014`; as três de 29/09 entraram depois dela.
Não houve regressão nem defeito de escrita — o campo sempre veio vazio da
origem. Perguntar à coluna o que a origem mandou é o relatório que só sabe
concordar consigo mesmo, na versão mais barata de cometer.

⚠️ **O anúncio tem id ESTÁVEL e ele já está gravado**: `raw->'_item'->>'item_id'`
(e `model_id` para variação), que é inclusive o sufixo do `order_id`. Se a
Shopee continuar mandando SKU vazio mesmo com o painel preenchido, o caminho é
mapear por ANÚNCIO — nunca pelo `product_name`, que é texto livre do anunciante
e muda com SEO. Mapa por nome é a lição já paga no cadastro de PDV, e a NFS-e
mostrou o mesmo com `SERVO=IÇO DE DESACRBONIZAÇÃO` digitado à mão.
⚠️ Isso **não** revoga o "sem fallback" da `20260958`: aquilo proibia inferência
implícita (casar SKU com `product_code` e torcer). Mapa por `item_id` seria
CADASTRO explícito, com a propriedade que importa mantida — anúncio novo
continua aparecendo na aba até alguém mapear.

**O que a auditoria ensinou, e vale para qualquer canal:**

1. ⚠️ **Existem TRÊS perguntas, não duas.** O marco zero pergunta se a venda é
   ANTIGA (data); o ledger, se a saída já foi CONTADA. A **contagem física** é a
   terceira, e ela responde a segunda pergunta por fora do sistema: venda que
   saiu antes do ajuste manual **já está** no saldo contado. Deduzi-la depois é
   a dupla contagem de 31/08.
   Medido: ajuste em `stock_movements` no HUB-SP em 24/09 16:19 (`saida 690`,
   `origem = 'ajuste'`). Das 8 vendas pendentes da Shopee, **6 eram anteriores**
   a ele. Proteção = linha em `carbo_estoque_consumo`, **sem tocar em
   `warehouse_stock`**: o saldo já reflete, o que faltava era o sistema saber.
2. ⚠️ **Proteção retroativa precisa de PISO no marco zero.** A primeira versão
   do insert tinha só o teto (o instante da contagem) e pegou junto 3 vendas de
   agosto — fundindo `anterior ao marco zero` com `já deduzido`, que é
   exatamente a fusão proibida. Não mudou saldo, mas o ledger passou a afirmar
   15 unidades contabilizadas que o sistema nunca deduziu.
3. ⚠️ **NUNCA mover o marco zero para resolver isso.** Ele é filtro por data e
   avançá-lo deixa passar pedido feito antes da contagem que ainda não é venda.
   Quem sabe responder é o ledger.
4. **A aritmética que fecha é a melhor conferência.** Somando os vereditos do
   ensaio com os cancelados de cada canal, bate exato com o total de linhas da
   plataforma — nos seis. Dois números que deveriam bater e batem.

✅ **Estado em 28/09/2026:** `consumos_indevidos = 0`; 125 pedidos cancelados,
**zero** ainda no ledger (o estorno funciona nos cinco); cron
`ecommerce-deduz-estoque-10min` com 432 execuções em 3 dias, todas `succeeded` —
e aqui isso SIGNIFICA algo, porque é SQL puro, não `net.http_post`.

✅ **A PayT passou a deduzir** (`20261014`), com marco zero em `now()`: ela
vendia desde 28/08 sem linha em `carbo_canal_estoque`, e o ensaio a marcava
`canal sem configuração de galpão` — veredito honesto, diferente de
"desligada". As 3 vendas antigas são anteriores à contagem de 24/09 e ficam
fora, corretamente.

⚠️ **PENDENTE, medido: o ML Full leva `429 local_rate_limited` no
`/orders/search`.** As duas contas sincronizam com ~1 s de diferença
(`15:20:09.029` e `15:20:09.975`), mesmo `client_id` — `local_rate_limited` é
limite por aplicação, então é a segunda batendo em cima da primeira. Não custa
estoque (o Full não deduz), custa PEDIDO: a chamada é feita **sem paginação**,
teto de 50 do ML, e o `last_synced_at` avança mesmo na rodada barrada — a
janela perdida não é relida. A correção é ESPAÇAR as duas contas, nunca
aumentar retry.

⚠️ **E `last_error` é GRUDENTO: só o `ml_token_trocar` o limpa.** Rodada de
sync bem-sucedida não zera nada, então o campo mede "houve erro desde a última
renovação", não "está com erro agora" — e a tela lê a segunda coisa. É a doença
conhecida ao contrário: erro velho disfarçado de erro atual.
⚠️ **Comparar `updated_at > last_synced_at` NÃO separa os dois** — tentei, e o
dado matou: a própria rodada de sync carimba os dois com 30 ms de diferença,
então a comparação é sempre verdadeira, inclusive na conta com `last_error`
nulo. Quem separa é o `last_refresh_at`: erro presente com renovação ANTERIOR a
ele significa que o erro foi escrito depois dela.

### ⚠️ Aviso de webhook não é pedido
ML e Amazon mandam só "o pedido X mudou", sem itens, valor ou SKU. O código
gravava mesmo assim uma linha com `quantity 1`, `units_real 1`, `total 0`,
contando com o sync para completá-la. Ele não completa: as duas pontas montam
`order_id` de formas diferentes (`resource` URL vs `<id>-<item>`), o upsert é
por `(platform, order_id)`, e a linha do aviso **nunca é sobrescrita**. Ficaria
para sempre valendo 1 unidade a R$ 0,00 em toda contagem — e no ML,
`ecommerce_pedido_raiz` corta no primeiro hífen, então uma URL vira um PEDIDO a
mais. Hoje as duas funções devolvem `[]`.

### PayT — checkout próprio, e o pedido é o CARRINHO
Entrou em 28/08/2026, substituindo a aba desativada do TikTok. É **push-only**:
não tem OAuth nem endpoint de consulta, então postback perdido é venda que
**nunca entra**, para sempre. Por isso `payt_eventos` guarda o corpo cru de todo
evento (append-only, `body_hash` único) antes de qualquer interpretação.

```
supabase/functions/_shared/paytPedido.ts   o parser (puro, 61 testes)
src/test/payt/fixtures/                    payloads REAIS de produção
supabase/migrations/20260963…              payt_eventos, o log cru
supabase/migrations/20260970…              o pedido passa a ser o carrinho
```

⚠️ **`platform_order_number` é o `cart_id`, NUNCA o `transaction_id`.** Medido
em 01/09 no primeiro pedido que chegou ao Bling: o Bling criou **um** pedido
(nº 615, R$ 269,10) para **duas** transações nossas — a venda (`PK2279K`,
R$ 149,50) e o order bump (`2877EQV`, R$ 119,60). O bump é transação separada na
PayT e o Bling funde as duas. Com a transação ali, a coluna "Pago" mostrava dois
cards para uma compra só.

E casar por transação **não** resolveria: sairia o `PK2279K` e o `2877EQV`
ficaria órfão para sempre, porque o Bling não o referencia em lugar nenhum —
troca de duplicado por órfão permanente, que é pior, porque duplicado alguém vê.
A transação continua no `order_id` (`<transação>-<code>`), que é a chave do
upsert.

⚠️ **O elo com o Bling é `numero_loja = 'PAYT_<seller_id>_<transação>'**
(`seller_id` = `LYK2ZA`), e o id puro aparece também em `observacoes` e em
`raw_detalhe->numeroPedidoCompra`. A `ecommerce_aguardando_bling` casa por aí
(`20260971`), exigindo o prefixo `PAYT_` — sem ele, `split_part` de um número
comum devolve a string inteira e casa por acaso. O que autorizou aplicar com UM
caso foi o total FECHAR exato (269,10 = 269,10), que é identidade e não
semelhança. ✅ **Corroborado em 04/09 com TRÊS pedidos** (`PK2279K`, `O96XVN9`,
`ZYG6M5M`), todos `situacao_id = 9` e todos casando pela terceira posição do
`split_part`. ⚠️ Se um pedido PayT não sair sozinho da coluna "Pago", o formato
mudou: **revise a regra, não afrouxe a comparação** — afrouxar sem apertar
unicidade troca "não casa nunca" por "casa errado".

⚠️ **DINHEIRO filtra por status; IDENTIDADE, nunca.** A `20260971` pôs
`ecommerce_status_e_venda` no CTE que agrega o pedido — certo para a soma — mas
o array `transacoes`, que é a CHAVE do elo com o Bling, era calculado DENTRO
desse mesmo CTE. Resultado: o carrinho `32BXNEP` ficou **100 h travado em
"Pago"** com a nota já emitida, porque o pedido no Bling se chama
`PAYT_LYK2ZA_PK2279K` e a transação `PK2279K` **foi cancelada depois** — saiu do
array, o `= any(...)` virou falso e o vínculo evaporou.

Um pedido não deixa de ser o mesmo pedido porque uma transação dele foi
cancelada. A `20260975` move o array para um CTE PRÓPRIO, sem filtro de status;
a soma continua só com linha de venda. ⚠️ Vínculo que depende de status evapora
no dia do estorno — que é justamente o dia em que alguém está olhando.

⚠️ **A view soma SÓ linha que é venda**, e isso não é detalhe da PayT. O CTE
agrega tudo e só depois filtra pelo `avanco` MÁXIMO, então transação cancelada
dentro de um pedido pago entrava de carona: medido R$ 418,60 num pedido de
R$ 269,10. Valia para qualquer canal com item cancelado no meio; só não aparecia
porque, com um card por transação, a cancelada virava card próprio e era
descartada inteira. Agrupar por carrinho a trouxe para dentro.
⚠️ Medido em 01/09: nos 30 dias, **só a PayT** tinha o caso — o risco era de
todos, o número errado era um. Um canal com cancelamento parcial teria caído
nele na primeira vez, calado.

⚠️ **Casar por valor + data é lixo, e foi medido.** Com R$ 149,50 sendo o preço
de quase tudo, a tentativa ligou `Leandro Teodolino` a `Mauro Nishimoto` e um
carrinho PayT a um pedido do ML. Mesma lição do CPF que servia a vários
destinatários na conciliação do Melhor Envio.

Três pendências conhecidas, todas medidas:
1. ⚠️ **`loja_id = 0`** no Bling (venda direta) — a ponte só marca
   `segmento = 'online'` com loja ≠ 0, então **venda PayT não conta como
   on-line**. Ou cria-se uma loja "PayT" no Bling, ou a ponte ganha exceção.
2. ✅ **`ordered_at` está CERTO — a suspeita foi descartada com dado cru.**
   Três transações com o mesmo segundo pareciam fallback; o log mostrou
   `started_at = 09:13:10` gravado como `12:13:10+00`, exatamente Brasília. Elas
   coincidem porque são o **mesmo carrinho**, e `started_at` é do checkout, não
   da transação. O aviso `PAYT_SEM_DATA` fica como guarda e não está disparando.
   ⚠️ Repetição não é prova de invenção — confira o payload cru em
   `payt_eventos` antes de concluir, que foi o passo que faltou.
   ⚠️ Consequência real de usar `started_at`: carrinho recuperado dias depois
   fica com a data do abandono, não a da venda. Não medido ainda.
3. **A PayT não está em `carbo_canal_estoque`** — venda dela não deduz nada.
   Decisão pendente, não esquecimento.

⚠️ **`total_price` NÃO é faturamento**: inclui os juros do parcelamento (medido:
296.616 = 12 × 24.718, contra 233.331 de produto). A soma das linhas é que bate
com o valor dos produtos. E `product.items[]` são os COMPONENTES do kit — contá-
los multiplica quantidade e receita pelo tamanho do kit.

### Seletor de período do e-commerce — "este mês" ≠ "mês fechado"
`EcommercePeriod` tem os dois, e a diferença NÃO é detalhe:

```
month  dia 1 → HOJE            mês corrente, parcial ("como vai o mês")
mes    dia 1 → ÚLTIMO dia      mês fechado, ancorado em `custom.from`
```

Chamar os dois de "mês" faz a mesma palavra valer dois números — comparar agosto
fechado com setembro-até-agora e concluir que setembro caiu 60%. Por isso o
rótulo na tela é **"Este mês (até hoje)"**, não "Este mês".

⚠️ **`mes` reusa `custom.from` como âncora** em vez de ganhar campo próprio: os
quatro hooks já dependem de `custom?.from`/`custom?.to`, então o mês refaz a
consulta pelo caminho que já existia. E a âncora é montada com `T12:00:00`, não
`T00:00:00` — à meia-noite um fuso negativo joga a data para o dia anterior e o
mês âncora vira o ANTERIOR, o mesmo erro de fuso do `ordered_at::date`.

⚠️ **A tela viva é só `apps/admin`.** A raiz (`DashEcommerceVendas.tsx`) é
congelada e nem expõe `custom`; `apps/ops/src/pages/ecommerce/VendasOnline.tsx`
é mock NÃO roteado. Não há espelho a manter aqui.

⚠️ **O estado da tela mora na URL**: `?aba=&periodo=&de=&ate=`. Antes era
`useState` puro e o F5 devolvia "Últimos 7 dias" — com a ABA voltando do
`localStorage`, ou seja, a mesma aba com outro período, e o número "mudando"
sozinho para quem atualizava. Também não dava para mandar "olha agosto" a
alguém.

A **aba** mantém o `localStorage` como reserva, o **período não**, e a diferença
é proposital: aba é preferência ("eu trabalho no Comparativo"), período é
pergunta ("como foi agosto"). Período grudento traria agosto meses depois com
cara de dado atual. O `de` serve aos dois modos (intervalo livre e âncora do
mês); o `ate` só existe no intervalo livre, senão haveria dois lugares dizendo
qual é o fim do mês.

⚠️ **Intervalo pela metade não existe**: `normalizarCustom()` completa as duas
pontas na troca de modo, e é a MESMA função que lê a URL. Antes os campos
nasciam vazios, o `getRange` completava com "hoje" calado (o seletor dizia "Por
período…" e a tela respondia 30 dias), e digitar só a data inicial já disparava
uma consulta `de → hoje` com número errado no meio do caminho.

⚠️ O mês corrente é derivado de `getRange("today")`, que é hora LOCAL — nunca
de `new Date().toISOString()`, que é UTC: às 21h do dia 31 o mês âncora viraria
o seguinte.

### ⚠️ Duas datas para "quando foi a venda" — e a lista escondia pedido
O filtro de `/vendas` (mês e "por período") perdia vendas, e o defeito era a
tela e o banco olharem datas DIFERENTES:

```ts
.gte("created_at", qStart)                 // o BANCO recortava por CRIAÇÃO
...
const eff = row.sale_date ?? row.created_at.substring(0,10);
return eff >= rangeStart && eff <= rangeEnd;   // a TELA, por data da VENDA
```

Enquanto as duas coincidiam, ninguém via. Desde que `sale_date` passou a
seguir o **faturamento**, elas se separaram — e o pedido que nasceu fora da
janela do banco **nunca chegava** para ser recortado. Sumia do mês em que foi
faturado *e* do mês em que foi criado.

⚠️ **No modo "por período" não havia colchão nenhum**: `qStart`/`qEnd` eram as
datas digitadas, então todo pedido criado antes do início e faturado dentro do
intervalo desaparecia. No modo mês havia ±1 mês, que só adiava o problema.

Hoje o filtro é `data_efetiva` (`coalesce(sale_date, created_at::date)`, coluna
da `carbo_vendas_metrica`) — a MESMA data nos dois lados, e o recorte em
memória foi REMOVIDO. Refiltrar no front não protegia de nada: o que faltava
nunca chegava; só mantinha viva a segunda definição de "data da venda".

⚠️ Some junto um erro de fuso: comparava `"2026-09-01T00:00:00.000Z"` (UTC)
com dia de Brasília. `data_efetiva` é DATE — não há hora para deslocar.

⚠️ São **SETE** cópias de `useCarbozeVendas.ts` e elas NÃO são idênticas (só o
CRM tem `FILTRO_VENDA_DO_TIME`). A mesma alteração mínima nas sete, nunca
sobrescrever — como já está escrito na seção do `/vender`.

### ⚠️ Consulta SEM `.limit()` não devolve tudo — devolve 1.000 e não avisa
O Dashboard Comercial (`/comercial/dashboard`) mostrava **865 pedidos de 1.170**,
com **out/25 até jun/26 zerados**, e parecia que o histórico da empresa tinha
sumido. A consulta era:

```ts
.from("carbo_vendas_metrica")
.select(...)
.order("data_efetiva", { ascending: false });   // sem .limit(), sem .range()
```

O PostgREST aplica um teto de **1.000 linhas** e **não sinaliza**: não há erro,
não há campo "truncado", a resposta parece completa. Com `ascending: false`, o
que chega são as 1.000 **mais recentes** — o histórico cai fora em silêncio.

⚠️ **O defeito é invisível até a tabela passar do teto**, e é por isso que
ninguém sabe dizer "quando quebrou". Nasceu sem teto em 31/08/2026; enquanto
havia ~500 linhas vinha tudo e a tela estava certa **por coincidência**. Os 541
pedidos de ago/26 cruzaram as 1.000 e os meses antigos começaram a cair um a um,
do mais velho para o mais novo.

A correção é `lib/lerTudo.ts` (páginas via `.range()`), replicado em `admin` e
`ti`. Três coisas para não desfazer:

1. ⚠️ **Ordem ESTÁVEL é obrigatória ao paginar.** `data_efetiva` é DATE e tem
   dezenas de empates por dia; sem um desempate único (`.order("id")`) a mesma
   linha volta em duas páginas e outra não volta nenhuma. O erro sairia como
   número **ligeiramente** errado — pior que tela vazia, porque ninguém nota.
2. ⚠️ **`ascending: true` sem teto é a MESMA doença ao contrário**, e estava no
   `useComercialCanais` (admin e ti): traz as 1.000 mais ANTIGAS, então aquela
   tela perdia os meses recentes. Mesma causa, sintomas invertidos, nenhum erro.
   Quando duas telas do mesmo dado discordam, suspeite do teto.
3. **`lerTudo` não é filtro.** Ele lê tudo o que a consulta seleciona; conjunto
   grande se encolhe no `where`. O teto de sanidade (200 mil linhas) existe para
   filtro esquecido falhar alto em vez de travar a aba.

⚠️ Continuam sem teto e são da mesma família — medir antes de mexer:
`useFaturamento` (financas), `useCeoCockpit`, `useDashEstrategico`. Não caíram
ainda porque filtram por status ou por data, mas o teto não sabe disso.

⚠️ **Autoria: o rodapé `Claude-Session:` distingue SESSÕES, o nome do autor não.**
Todo commit do Claude sai como `Claude <noreply@anthropic.com>`, então "foi outra
sessão?" não se responde por `%an`. Responde-se por
`git log --format="%(trailers:key=Claude-Session,valueonly)"`.

### ⚠️ Ordem ASCENDENTE com `.limit()` devolve o COMEÇO, não o fim
O Carbo Chat mostrava o grupo Suporte TI parado em 02/09, com a lista lateral
exibindo a mensagem das 09:30 do mesmo dia. A consulta era:

```ts
.order("created_at", { ascending: true }).limit(200)   // as 200 MAIS ANTIGAS
```

⚠️ **E o defeito é invisível até o canal passar do teto.** Abaixo de 200
mensagens vem tudo e parece certo; o grupo mais movimentado congela numa data e
**nunca mais mostra mensagem nova** — nem ao vivo, porque o Realtime invalida o
cache e o refetch traz as mesmas 200 velhas. Só um canal aparece quebrado, o que
faz procurar defeito naquele canal em vez de na consulta.

O certo é `ascending: false` + `.limit()` + `reverse()` na tela — que é o que o
ramo do `focusAt`, logo acima no mesmo arquivo, sempre fez. ⚠️ E um segundo
critério (`id`): com duas mensagens no mesmo instante, `order` de coluna única
não é estável e a janela pode cortar no meio do empate.

⚠️ A contradição entre DUAS consultas da mesma tela (a lista lateral trazia a
última, o corpo não) é o sinal — quando duas visões do mesmo dado discordam, a
errada é quase sempre a que tem teto.

### ⚠️ `Select` do shadcn tem DOIS `max-h`, e a menor manda
Em `components/ui/select.tsx` a altura aparece no `SelectContent` **e** no
`Viewport`. Estavam `max-h-60` (240px) e `max-h-48` (192px): com item de ~32px,
o teto real era **seis opções**, e ninguém sabia disso. Um menu de 6 itens media
200px e rolava por **8 pixels** — o Radix ligava as duas setas de scroll e o
menu parecia cortado sem ter o que mostrar.

⚠️ **E o texto acima dizia "hoje as duas são `min(22rem,60vh)`" — era verdade
em UM app de sete** (medido em 29/09/2026). A correção tinha sido feita só no
`admin`; o `crm`, `ops`, `ti`, `financas`, `mkt` e `atendimento` seguiram com
`max-h-60`/`max-h-48`, ou seja com o teto de 192px, **inclusive o `crm`, que é
o app do VENDEDOR**. O sintoma reapareceu no dropdown de produto do `/vender`:
ele cortava "Microdistribuidor" no meio, e ninguém ligou isso ao `select.tsx`.

Hoje os **sete** têm `min(28rem,70vh)` = 448px (medido com o menu aberto no
navegador, não estimado) e os sete `select.tsx` estão byte a byte iguais.

1. **Ao mexer numa altura, mexa na outra** — deixá-las diferentes recria o teto
   invisível.
2. ⚠️ **E mexa nos SETE.** `select.tsx` não estava em lista de arquivo
   replicado nenhuma, e foi assim que ele divergiu: divergir ali não dá erro —
   dá um menu cortado num app e inteiro no outro, e nada liga uma coisa à
   outra.
3. ⚠️ **Registro que afirma estado do código envelhece.** Esta seção descrevia
   uma correção como concluída enquanto ela valia para 1/7. Ao escrever "hoje
   é X" aqui, diga **em quantos apps** — e confira, não presuma.

### E-commerce: a tabela tem uma linha por ITEM, não por pedido
`ecommerce_orders` grava `order_id = '<pedido>-<item>'` — de propósito, porque
(platform, order_id) é a chave do upsert e assim webhook e sync podem rodar em
qualquer ordem sem duplicar. Consequência: **`count(*)` conta itens**. Um pedido
com dois produtos virava duas vendas — a loja dizia 4 no dia e o painel, 8.

Para contar pedido use `public.ecommerce_pedido_raiz(platform, order_id)` no
banco ou `pedidoRaiz()` em `useDashEcommerce.ts` (as duas são a mesma regra;
mudou uma, mude a outra). ⚠️ Não corte no último hífen: o número da Amazon já
tem hífens (`123-4567890-1234567`) e pedido de item único vai sem sufixo —
cortar cegamente funde dois pedidos Amazon diferentes.

Receita, quantidade e unidades continuam somando linha a linha. Isso sempre
esteve certo; o errado era só a contagem.

**E o dia é o de Brasília.** `ordered_at::date` e `ordered_at.slice(0, 10)` dão
o dia em UTC: pedido das 21h entra no dia seguinte, e "hoje" traz três horas de
ontem. A view usa `AT TIME ZONE 'America/Sao_Paulo'` e o front converte com
`new Date(...)` antes de comparar. O `useMetaEcommerce.ts` usa `diaLocal()` /
`mesLocal()` pelo mesmo motivo — lá o erro jogava o faturamento do dia 31 para
o mês seguinte, fechando a meta errada nas duas pontas.

### Bling 2 — espelho, MENOS os pedidos faturados
A segunda conta Bling (`bling2-sync`, tabelas `bling2_*`) é espelho: a função
não escreve fora de `bling2_*`, não emite pedido, não alimenta faturamento.
Isso continua valendo — **com uma exceção**, decidida pelo dono do processo
quando a operação online passou a rodar na conta 2: pedido ATENDIDO
(`situacao_id = 9`) atravessa para `carboze_orders` pela função
`bling2_bridge_pedidos_faturados()` (cron a cada 2 min — ver "Cadência" abaixo).

- Namespace `BLING2-*` — os dois Blings numeram do zero; sem isso, colidem.
- Canal vem de `bling2_lojas`: loja ≠ 0 e não ignorada → `segmento = 'online'`.
  Loja 0 é venda direta. ⚠️ `'online'` teve de entrar no CHECK de `segmento`,
  que só aceitava consumo/revenda — valor novo ali é INSERT falhando calado.
- **A NF manda, e o vínculo é exato.** Cancelar a NF no Bling NÃO cancela o
  pedido — ele segue "Atendido". Um cliente tinha 12 pedidos importados com 11
  notas canceladas. O vínculo está em `raw_detalhe->notaFiscal->id` (coluna
  gerada `bling2_orders.nf_bling_id`); a ponte exige situação na lista branca
  (`bling2_nf_e_valida`). ⚠️ Nota cancelada SOME da listagem `/nfe`, então o
  espelho congela em "Emitida DANFE" — é a entidade `nfe_recheck` que
  reconfere pelo id, e só `/nfe/{id}` funciona para nota cancelada.
- A ponte é SQL, não código de edge function, porque ela é banco→banco (a do
  Bling 1 também é). Entra rodando a migração, sem depender de deploy.
- Cancelamento anda numa direção só: situação 12 cancela aqui; nada tira um
  pedido de `cancelled`. Mesma lição do `bling-sync`, onde venda cancelada
  ressuscitava a cada rodada.

### Esteira do On-line — admin manda, Ops e Atendimento espelham
**Cinco** arquivos byte a byte idênticos, agora em **três** apps. Fonte da
verdade = `apps/admin`. No Ops as páginas moram em `pages/logistica/` e a rota
da esteira é `/logistica/esteira`; no Atendimento (28/08/2026) as páginas ficam
em `pages/` e as rotas repetem as do admin.

```
pages/EsteiraOnline.tsx          hooks/useEsteiraOnline.ts
pages/MensagensCliente.tsx       hooks/useMensagensCliente.ts
components/ConexaoWhatsApp.tsx
```

⚠️ **A ROTA faz parte do espelho, porque os links moram DENTRO do arquivo.**
O `EsteiraOnline` linka para `/ecommerce/mensagens` e o `Conversas` linka para
`/ecommerce/esteira` — caminhos escritos no código. Montar a mesma tela noutro
caminho não dá erro: o link cai no catch-all e a **home** aparece no lugar do
pedido. Foi o que aconteceu no Ops, onde a esteira virou `/logistica/esteira` e
o chip "ver pedido" das Conversas **nunca funcionou**. O próprio Ops já
contornava isso em `/ecommerce/mensagens`, que ele manteve igual ao admin.
Por isso o Atendimento monta as duas em `/ecommerce/...` — nome estranho para o
app, e ainda assim melhor que link morto.

⚠️ **O Ops tem um APELIDO `/ecommerce/esteira` → `/logistica/esteira`** (31/08),
e ele preserva a query. O `MensagensCliente` é idêntico nos três e cai no padrão
do admin quando não recebe `?voltar=` — link direto, favorito, aba restaurada.
Sem o apelido, esse botão levava para a **home** do Ops. O redirecionamento
copia o `search` de propósito: `<Navigate>` descarta a query, e é o `?card=` que
abre o pedido.

⚠️ **O parâmetro que abre o card chama-se `card`**, e só ele: a Esteira lê
`params.get("card")` e IGNORA qualquer outro nome. Um link com `?pedido=` abre a
tela com o card fechado e não dá erro — foi assim que o chip novo de
Movimentações (`Suprimentos.tsx` do Ops) nasceu quebrado. O nome é o mesmo que o
botão "Copiar link" da Esteira gera; mudou um, confira o outro.

⚠️ **Conversas do WhatsApp mudou de casa** (28/08/2026): saiu do `admin` e do
`ops`, existe SÓ em `apps/atendimento` (`/conversas`). Não é mais arquivo
replicado — se voltar a ser, volta a precisar de lista.

⚠️ Os três últimos entraram sem serem registrados aqui, e ficaram meses fora de
qualquer lista — que é **exatamente** como o `useVendas` divergiu: um arquivo
que ninguém sabe que precisa ser copiado só é copiado por acaso. Se você editar
qualquer um dos cinco, copie para o outro app na mesma tarefa.

A tela não calcula etapa: quem calcula é a view `public.bling2_esteira`. Regra
nova entra lá, e as duas telas mudam juntas.

### A Esteira enxerga DUAS contas Bling desde 21/09/2026
`bling2_esteira` virou UNIÃO: o ramo do Bling 2 (filial) mais o que é **on-line
no Bling 1** (matriz). Existe porque o **ML Full fatura na matriz** — confirmado
por IDENTIDADE, não semelhança: 12 dos 14 `platform_order_number` batem exato
com `numero_loja` da loja `206270703`.

Sintoma antes: **14 cards presos na coluna "Pago"**, todos do Full, o mais antigo
de 14/09, e ZERO dele em qualquer outra etapa — enquanto os outros canais não
apareciam em "Pago". Crescia ~13 por semana.
✅ Depois: 10 confirmado · 7 em_transito · 4 entregue, **andando sozinhos**.

⚠️ **Quatro coisas que NÃO se copiam de um ramo para o outro**, e cada uma foi
medida antes de escrever:

1. **`situacao_id in (9,12)` esconderia TODOS.** No Bling 1 o Full está em
   **15** ("Em andamento", ver `mapBlingStatus`). Id de situação é cadastro de
   CADA conta — a mesma suposição que já custou caro com `bling_id` de produto.
   O ramo da conta 1 **não filtra por situação**.
2. ⚠️ **`carbo_pedido_codigo` e `melhorenvio_envio_vigente` casam por
   `bling_id`, e as duas contas numeram do zero.** O join traria rastreio do
   pedido de OUTRA empresa para dentro do card. No ramo 1 esses campos são
   **nulos** — e nulo é honesto.
3. ⚠️ **`bling_id` é chave de `carbo_msg_envios`** (`bling_id:etapa`), do card e
   do `?card=`. Colisão hoje é ZERO (medido), mas vai acontecer. Por isso o
   Bling 1 entra **NEGATIVO**: `abs()` recupera o original, e consulta que o
   leve à tabela errada não acha nada em vez de achar o pedido alheio.
4. **Lista branca de NF por conta**: `carbo_nf_valida` no ramo 1,
   `bling2_nf_e_valida` no ramo 2.

**`bling_orders` não tem `raw_detalhe`** (o `bling-sync` guarda só a listagem),
então endereço, transportadora, volumes e peso vêm nulos no ramo 1. **O card
anda mesmo assim**: quem o move é o CTE `plataforma` — o status do
`ecommerce_orders`. Foi essa a aposta do desenho, e ela se confirmou.

⚠️ **O corte é `join` (não `left`) em `bling_lojas` com `e_online is true`.**
Balcão (loja 0) e venda da equipe (`206071309`, `206071288`) estão `false` e
ficam fora; loja NOVA sem classificação também — o lado seguro.

⚠️ **PENDENTE, e é decisão do dono do processo, não de código:** os pedidos do
Full estão sem NF (**21 pedidos, R$ 3.215,22**, `conta_metrica = false`, motivo
`aguardando_nf`). Isso faz `/ecommerce/vendas-online` e `/comercial/dashboard`
**discordarem sobre as mesmas vendas** — nenhuma tela está com defeito, o dado
fiscal é que não existe. Ou o pedido avança para Atendido no Bling, ou a
`carbo_vendas_metrica` aprende a contar o canal sem exigir NF.

⚠️ A coluna **"Pago"** NÃO esvazia com isso: ela vem de
`ecommerce_aguardando_bling`, outra view. Os pedidos passam a aparecer nos DOIS
lugares até alguém decidir tirá-los de lá.

### ⚠️ REGRA PERMANENTE: a Esteira do On-line mostra SÓ venda on-line
Dito pelo dono do processo mais de uma vez, e ficou meses sem estar escrito
aqui — por isso voltou. **Venda de balcão / venda direta (loja 0 no Bling) NÃO
aparece na esteira.** Não é preferência de tela: a esteira é o painel do
comércio eletrônico, e pedido que não veio de canal on-line ali é ruído que
compete com o que precisa de ação.

A PayT **é** on-line e fica, apesar de chegar com `loja_id = 0` — é a pendência
nº 1 dela, e o que a distingue de uma venda de balcão é o `numero_loja`
(`PAYT_<seller_id>_<transação>`).

⚠️ **E a regra alcança o WhatsApp junto** (`20260978`). Eu tinha separado as
duas — "sumir da tela" e "parar de avisar o cliente" — e escolhido só a
primeira, por conta própria. O dono do processo decidiu as duas: *"não é para ir
para esteira essas vendas diretas, logo, não devem receber whatsapp"*. Como
`carbo_msg_fila` lê a `bling2_esteira`, o filtro mora no **`WHERE` da view** e
as duas coisas andam juntas — que é o oposto do que a `20260976` fez.

⚠️ Isso NÃO revoga a lição da `20260976`: tirar linha do `WHERE` de uma view que
alimenta fila de mensagens **para o envio**, e ali seria acidente. Aqui é o
objetivo. A regra que sobrevive é *saber* que o `WHERE` decide as duas coisas —
não "nunca filtrar ali".

⚠️ **O corte de "só on-line" mora no `WHERE` da view** (`20260976` + `20260978`).
Venda de balcão (loja 0 no Bling) aparecia na Esteira do On-line como "Venda
direta (sem canal)", e a PayT ia junto — ela também chega com `loja_id = 0`
(pendência #1 da PayT), então herdava o nome da loja 0. A view ganhou `canal`
dizendo **PayT** quando `numero_loja like 'PAYT_%'`, e a coluna `e_online`.

A `20260976` filtrou só na TELA, para não mexer na `carbo_msg_fila`; a `20260978`
levou a MESMA expressão para o `WHERE`, por decisão do dono do processo — some
da esteira e da fila juntas. A coluna `e_online` ficou (hoje sempre `true`)
porque o hook dos três apps filtra por ela e `create or replace` não remove
coluna.

⚠️ O `e_online !== false` do hook não é estilo: numa ordem em que o front suba
antes da migração, a coluna não existe e o campo vem `undefined` — ausência tem
de MOSTRAR, nunca esvaziar a tela.

⚠️ **`justify-center` num quadro que rola CORTA a primeira coluna** (medido em
03/09, com a sidebar aberta em 1366/1440). Quando as colunas estouram a largura,
centralizar empurra a primeira para fora da borda esquerda e não há como rolar
de volta — foi isso que fatiava o card "Pago" e parecia "tela quebrada". O
quadro usa `grow basis-0` (preenche quando cabe) + `justify-start` (rola da
primeira quando estoura), NUNCA `justify-center`. No celular a coluna vai a
`~86vw` com `snap-mandatory` (uma coluna cheia por arraste); acima de `sm` volta
aos 240–400px. Os três pipelines (entrega, recompra, carrinho) compartilham
essas classes — mude os três, e a tela é espelhada nos três apps.

**Três pipelines no mesmo seletor**, e cada uma tem a SUA view de coluna:

```
Da venda à entrega        bling2_esteira            anda em minutos
Régua de recompra         carbo_recompra_pipeline   anda em dias
Recuperação de carrinho   carbo_carrinho_pipeline   anda em horas
```

A terceira só existe na **loja própria**: ML e Amazon fazem a própria
recuperação e não expõem o contato de quem abandonou. `nuvemshop_carrinhos` é
espelho de `/checkouts`, escrito só pela função `nuvemshop-carrinhos`.

⚠️ Três travas, e nenhuma é decoração — desfazer qualquer uma manda WhatsApp
para quem não pediu:
1. **Marco zero por DATA** (`carbo_carrinho_config.inicio_em`), não por marcação
   linha a linha: a tabela nasce vazia e a enxurrada viria na primeira rodada do
   sync, depois da migração.
2. **O relógio de cada passo começa no passo ANTERIOR** (1ª conta do abandono,
   2ª da 1ª, 3ª da 2ª). Contando todas do abandono, um carrinho que aparecesse
   já velho teria as três janelas vencidas juntas e a pessoa receberia três
   mensagens seguidas.
3. **`recuperado` é a primeira condição do CASE**, e o cruzamento é frouxo de
   propósito (qualquer pedido do mesmo e-mail depois do abandono). Falso
   positivo custa uma recuperação perdida; falso negativo manda "esqueceu algo?"
   para quem já pagou.

⚠️ `sem_telefone` é **coluna própria**, não um carrinho aberto qualquer: ele
nunca avança sozinho, e escondê-lo faria a conta de recuperação parecer melhor
do que é. É também a medida do que a loja perde por não pedir o telefone antes
do fim do checkout.

**A `carbo_msg_fila` tem QUATRO origens**: etapa da esteira, `saiu_entrega` (do
rastreio), régua de recompra, e os três passos do carrinho. Ela ganhou
`prioridade` — serviço (0) antes de comercial (1) — porque o `kanban-n8n` pega
20 por rodada, e uma manhã de carrinhos abandonados empurraria o "saiu para
entrega" para meia hora depois.

⚠️ Os envios do carrinho vão para `carbo_msg_envios` com `bling_id` = id do
**checkout**. Não colide: a chave é (bling_id, etapa) e as etapas `carrinho_*`
são exclusivas desta pipeline. É o oposto do erro do `bling_nf_id`, onde duas
coisas disputavam a MESMA coluna com o MESMO significado.

⚠️ **"Sai de Pago" e "entra na esteira" são a MESMA condição** (`20260991`).
`ecommerce_aguardando_bling` é o COMPLEMENTO da `bling2_esteira`, e complemento
só funciona com a mesma régua. Divergir erra dos dois lados:

```
condicao de Pago mais FROUXA   -> pedido nas DUAS colunas
condicao de Pago mais APERTADA -> pedido em NENHUMA, e some do painel
```

Aconteceu em 21/09/2026, minutos depois da `20260990`: os mesmos pedidos do ML
Full em "Pago" (14) e em "Confirmado" (5), com o contador do topo somando os
dois. Por isso o `not exists` da conta 1 é **cópia literal** do `join` do ramo 1
da esteira — e, pelo mesmo motivo, **não** herda o `situacao_id in (9,12)` do
teste do Bling 2, que é justamente o filtro que esconderia o Full (situação 15).

⚠️ **Coluna "Pago" VAZIA é resposta, não defeito.** Depois da `20260991` ela
ficou em zero — porque os 14 cards eram todos do Full e os outros canais já
casavam no Bling 2. Vazio ali significa "todo pedido pago chegou ao Bling";
encher de novo é que é sinal.

⚠️ A **primeira** coluna ("Pago") é a exceção: ela NÃO vem da `bling2_esteira`,
e sim de `ecommerce_aguardando_bling`, que lê a plataforma direto. Existe porque
a esteira só enxerga pedido `situacao_id in (9,12)` — Atendido — e pedido novo
nasce "Em aberto" no Bling; nenhuma frequência de sync resolveria isso, porque
não é latência, é estado de negócio. A view é separada de propósito: a
`bling2_esteira` alimenta `carbo_msg_fila`, e jogar esses pedidos lá dentro
seria apertar o gatilho de um envio em massa de WhatsApp.

⚠️ **O menu do Ops tem DOIS lugares** e esquecer um deixa a tela invisível sem
erro nenhum: o registro em `src/lib/opsNav.ts` **e** a lista de caminhos do
grupo em `src/components/Layout.tsx`. Já aconteceu antes.

### Alerta no sininho é MULTIPLICADO por 30 — conte antes de ligar
`notify_time_interno` faz fan-out para todo o time interno. Uma notificação por
pedido parecia razoável até a primeira rodada: **70 pedidos × 30 pessoas =
2.100 linhas** em `notifications`, e 70 itens não lidos no sininho de cada um.

Isso não é alerta — é o que ensina o time a fechar o sininho sem ler, e aí
nenhum aviso funciona, nem o novo nem o de venda online, que mora no mesmo sino.

A regra que ficou (`20260952`): **um RESUMO por dia** (quantos, quanto, o mais
antigo), e notificação individual **só quando ela nomeia uma ação** — etiqueta
morta pede "comprar outra"; "parado há 4 dias" só descreve um estado e pertence
ao resumo. **Sem nada parado, não manda nada**: aviso diário de rotina treina a
pessoa a ignorar.

⚠️ **Limiar se MEDE, não se supõe.** Escolhi 3 dias para "etiqueta comprada e
não postada" por raciocínio; a distribuição real tinha ~40 pedidos com 3-4 dias
— etiqueta gerada na sexta é postada na segunda. Com 7 sobraram 6, e os 6 eram
reais. Limiar que dispara no fluxo normal é ruído com custo extra.

Os limiares moram em `carbo_esteira_limite` (tabela) e o relógio é **por
etapa**: `nf_emitida` conta da emissão da NF, `etiqueta` de quando foi gerada,
`em_transito` da postagem. Contar da data do pedido mistura demora de
faturamento com demora de expedição.

### Tarja de status — SÃO DUAS, e a separação é a decisão inteira
Pedido do dono do processo em 28/09/2026, depois de uma queda em que os apps
ficaram girando sem explicação: *"ja sobe a tarja vermelha em cima em todos os
apps falando que há instabilidade … evitava das pessoas virem perguntar, abrir
ticket"*.

```
Supabase fora                     -> tarja AUTOMATICA  mede sozinha, nao le nada
Bling fora, manutencao, lentidao  -> tarja DECLARADA   carbo_status_aviso
```

```
packages/shell/src/StatusTarja.tsx          a tarja — arquivo ÚNICO, nos sete
apps/*/src/components/Layout.tsx            montada logo ABAIXO do <TopBar/>
apps/ti/src/pages/StatusAvisos.tsx          /status — onde o TI declara
supabase/functions/status-sonda             recebe a sonda externa
.github/workflows/status-sonda.yml          a sonda, a cada 5 min
carbohub-landing  src/pages/Status.tsx      carbohub.com.br/status (OUTRO repo)
supabase/migrations/20261011000000_status_aviso.sql
supabase/migrations/20261012000000_status_sonda.sql
supabase/migrations/20261013000000_status_aviso_normalizado.sql
```

1. ⚠️ **O aviso declarado NÃO cobre a queda do Supabase**, e isso é
   construção, não esquecimento: ele mora no Supabase, que é o que caiu. Quem
   cobre aquele caso é a detecção automática, que não pergunta nada a ninguém.
   Aviso que depende do que ele anuncia é aviso que falha calado — a mesma
   lição do `BloqueioAoVivo`, onde o sinal do Realtime não substitui a trava.
2. ⚠️ **"A minha internet caiu" e "o sistema caiu" têm a MESMA cara.** Quando a
   sonda do Supabase falha, uma SEGUNDA sonda bate no endereço do próprio app
   (outro provedor). As duas falhando = é a rede de quem olha, e a tarja diz
   isso em cinza. Acusar o sistema nesse caso manda gente abrir ticket contra
   um sistema que está de pé.
3. **Duas falhas seguidas para acender, UMA resposta para apagar.** Um pico de
   rede não pode pintar sete apps de vermelho: tarja vermelha sem motivo ensina
   o time a ignorá-la, que é a doença do sininho com 70 itens não lidos.
4. ⚠️ **Ela fica ABAIXO do cabeçalho, em FLUXO — nunca `fixed`.** A primeira
   versão era sobreposta no topo e cobria a `TopBar` dos sete apps; o dono do
   processo apontou no mesmo dia. Como o Layout de todos eles é `h-screen flex
   flex-col`, basta montá-la logo após o `<TopBar/>`: ela ocupa a própria
   altura e o corpo encolhe sozinho. Empurrar por fora (`padding-top` no
   `body`) NÃO resolve — o cabeçalho é `sticky top-0` e voltaria a passar por
   baixo dela no primeiro scroll.
5. ⚠️ **NÃO dá para fechar**, por decisão do dono do processo. Aviso de
   indisponibilidade que a pessoa esconde volta a produzir exatamente o que
   ele existe para evitar: a pergunta no chat e o ticket. Quem tira a tarja é
   o TI, encerrando — ou o próprio sistema, voltando a responder.
   ⚠️ **E encerrar não apaga na hora: vira VERDE** por `normalizado_minutos`
   (`20261013`). "Sumiu a tarja" e "nunca houve tarja" são indistinguíveis
   para quem chega depois, e quem passou a manhã travado precisa LER que
   normalizou. O prazo é do TI, nunca constante no código — incidente de 5 min
   e de meio dia não pedem a mesma permanência.
   ⚠️ A policy de leitura teve de deixar de ser `using (ativo)`, senão a linha
   sai da vista no instante do clique e o verde nunca aparece. E a janela é
   conferida DE NOVO na tela (`noVerde`): o TI enxerga o histórico inteiro por
   uma segunda policy de SELECT, e sem essa conta ele veria o verde de um
   incidente de semanas atrás.
6. ⚠️ **É UM arquivo, não sete.** Mora em `packages/shell` e cada **Layout**
   passa só a própria chave (`app="ti"`). A chave vem escrita ali e NÃO de
   `appKeyAtual()`, que devolve `null` fora de produção — em dev a tarja
   ficaria muda.
   ⚠️ O prop de cliente é ESTRUTURAL (`SupabaseLite`), não `SupabaseClient`:
   os apps têm cópias próprias de `@supabase/supabase-js` e o tipo nominal
   falharia nos sete, como já falha no `ChatProvider` ao lado.
7. ⚠️ **A lista de apps da tela do TI sai de `HUB_APPS`.** Lista própria seria
   a oitava cópia do catálogo, e app novo ficaria fora do aviso, calado.
8. ⚠️ **`apps` VAZIO = todos**, de propósito: o caso comum é o sistema inteiro,
   e obrigar a marcar dez caixinhas para o caso comum é como se esquece uma.
9. ⚠️ **`previsao_fim` é PREVISÃO, nunca interruptor.** A tarja não apaga
   sozinha na hora marcada: manutenção que se estende é exatamente quando o
   aviso mais importa, e sumir no horário combinado deixaria o sistema instável
   e a tela limpa. Quem apaga é o TI, mudando `ativo`.
10. ⚠️ **Leitura aberta a `anon`.** A tarja precisa aparecer ANTES do login —
   quem não consegue entrar é quem mais precisa saber. E **sem policy de
   DELETE**: o aviso é a prova de que o sistema esteve fora.
11. ⚠️ **A sonda externa NÃO registra a queda do Supabase** — ela grava no
   Supabase. O sinal é o BURACO na série ("sem medição desde HH:MM"), e a
   página de status lê exatamente assim. Prometer o contrário seria um
   relatório que só sabe concordar consigo mesmo (a doença da `20260941`).
12. ⚠️ **O workflow manda o `CRON_SECRET`, não a service role.** Escrever
   direto no PostgREST exigiria a chave que lê o banco inteiro — tokens do ML e
   notas fiscais inclusive — num secret do GitHub. A função `status-sonda`
   existe para o GitHub guardar o segredo MENOR, e ela FECHA sem ele
   (401/500), nunca abre.
13. ⚠️ **Falta UM passo manual:** o secret `CRON_SECRET` em GitHub → Settings →
   Secrets → Actions, com o mesmo valor que já está em Supabase → Edge
   Functions → Secrets. Sem ele o job falha ALTO a cada 5 min, que é o modo
   certo — sonda que falha calada é pior que sonda nenhuma.

### ⚠️ O destino é sempre a `main` — mergear é parte da tarefa, não um passo à parte
Dito pelo dono do processo em 21/09/2026, com estas palavras: *"manda o merge na
main, já deveria ter feito inclusive sem eu pedir — sempre na main"*.

Trabalho que fica na branch **não existe para quem usa o sistema**. É a mesma
doença do SQL que fica no arquivo em vez de ir para o chat: a tela continua a de
ontem, o app compila, builda e sobe, e ninguém vê erro nenhum. Aconteceu nesta
mesma tarefa — a aba do ML Full seguiu mostrando o cartão âmbar que eu já tinha
removido, e eu escrevi "está corrigido" sobre código que não estava no ar.

**Terminou e conferiu, mergeia.** Não pergunte, não deixe para depois, não
entregue com "falta subir para a main".

⚠️ **E isso torna a conferência OBRIGATÓRIA antes**, não opcional: o push em
`main` deploya as edge functions (abaixo). Mergear cedo é o modo de ir ao ar com
o que não foi medido.

### ⚠️ Push em `main` DEPLOYA as edge functions — não existe "só commitei"
`.github/workflows/deploy-functions.yml` roda em `push: [main]`. Toda função da
lista `dep` sobe, em sequência, com 3 tentativas. Função que **não** está na
lista nunca sobe — a lista é manual.

Consequência que já custou 20 h: o `ecommerce-sync` ganhou portaria de
`CRON_SECRET` num commit, foi ao ar no push, e o cron só recebeu a chave no dia
seguinte. No meio disso ele levou **401 a cada 5 min**, e o `pg_cron` marcou
`succeeded` o tempo todo — porque o sucesso dele é ter POSTADO.

**Mudança que fecha uma porta e mudança que entrega a chave têm de ir no MESMO
push, com a chave primeiro.** E antes de afirmar "está deployado" ou "não
está", olhe `cron.job_run_details` e os runs do Actions — não a sua memória do
que você mandou.

### `SUPABASE_ACCESS_TOKEN` mora no GitHub, não no Supabase
Três coisas com nomes parecidos, e confundi-las custa tempo:

```
Supabase → Edge Functions → Secrets   CRON_SECRET, NUVEMSHOP_CLIENT_SECRET…
                                      o que as funções leem RODANDO
GitHub → Settings → Secrets           SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_ID
                                      o que o workflow usa para DEPLOYAR
```

O deploy não depende de token na sessão do Claude: o Actions já faz.

### Conciliação do Melhor Envio — a fronteira do espelho
O espelho do Bling 2 começa em **12/06/2026**. As quatro portas da
`carbo_melhorenvio_conciliar()` partem de `bling2_orders`, então envio de pedido
da MATRIZ (Bling 1) nunca vincula — não é defeito, é fronteira. Esses ficam
`vinculo_status = 'ignorado'`, `vinculo_via = 'fora_do_espelho_bling2'`, e por
isso **`orfaos_reais` mede trabalho de verdade**: órfão novo é sinal.

⚠️ **Documento também não é chave.** Um CPF serviu a vários destinatários
(etiqueta de "Peterson Oliveira" com o CPF que no Bling é de "Pablo Chacon", com
9 pedidos). Foi o `count(distinct bling_id) = 1` da porta 4 que impediu ligar
uma etiqueta de junho a um pedido de agosto de outra pessoa — e vínculo errado
dispara fulfillment da Nuvemshop e WhatsApp para o cliente trocado. Afrouxar
comparação sem apertar unicidade troca "não casa nunca" por "casa errado".

⚠️ **`insurance_value` ≠ `total` do pedido.** A porta 4 comparava o valor
declarado do conteúdo com o total COM frete: **0 acertos em 36**. Aceita os dois
valores agora, com unicidade sobre o conjunto.

⚠️ **CHECK: pergunte ao BANCO, não à migração que criou a tabela.** Afirmei que
a porta 1 nunca gravara porque `'bling_id_ref'` faltava no CHECK — a `20260918`
já o acrescenta, e produção tinha 391 envios casados por ela. Use
`pg_get_constraintdef`, não a definição de nascimento.

### Cancelamento da LOJA — a esteira não enxergava, e o card não tinha saída
`avanco` é uma escada que só SOBE (`delivered` 3 · `shipped` 2 · `paid` 1 ·
resto 0), então `cancelled` cai no mesmo **0** de `pending` — indistinguíveis. E
o CASE só sabia cancelar por `situacao_id = 12` (no BLING) ou por NF inválida,
e nenhum dos dois acontece quando quem cancela é a **loja**. Pedido cancelado na
Nuvemshop ficava em "Confirmado" **para sempre**, igual ao `32BXNEP`. Medido em
04/09: 5 cards, o mais velho de 30/06, um deles já com etiqueta gerada.

A `20260977` exporta `cancelado_na_loja` do CTE `plataforma`. Três decisões, e
as três foram medidas:

1. ⚠️ **A POSIÇÃO no CASE é a regra inteira.** A condição entra DEPOIS de
   `entregue` e `em_transito`: carimbo de postagem e de entrega é FATO e não
   deixa de ser verdade porque cancelaram depois — a mesma lição da etiqueta
   morta (`20260947`). Medido: **2 entregues e 1 em trânsito** estão cancelados
   na Nuvemshop; subir a linha apagaria a entrega dos três.
2. ⚠️ **Lista EXPLÍCITA, nunca `not ecommerce_status_e_venda(...)`.** Aquela
   função devolve false também para `pending` — a regra marcaria como cancelado
   todo pedido ainda não pago. Medido: o vocabulário é UMA palavra (`cancelled`)
   nas cinco plataformas; `refunded`/`voided`/`estornado` ficam como rede.
3. ⚠️ **`bool_and`, nunca `bool_or`.** A tabela tem uma linha por ITEM: com
   `bool_or`, um item cancelado dentro de um pedido pago cancelaria o card
   inteiro — a mesma armadilha dos R$ 418,60 num pedido de R$ 269,10 da PayT.

⚠️ **O que isto NÃO resolve, e não pode:** pedido que o cliente refez por fora e
que ninguém cancelou na loja continua `paid` e continua na esteira (o 480, do
Miramon). Não é falha de leitura — o dado não existe. Cancelar na loja é o que o
tira daqui. É o caso "premissa, não dado".

⚠️ **Ao medir isso, `left join` com `platform_order_number` MENTE para a PayT**
(o `pedido_loja` é `PAYT_..._...` e o `platform_order_number` é o carrinho — o
join nunca casa) e para venda direta (`numero_loja` null). `not e_venda(null)`
foi contado como cancelado e inflou a primeira medição: 3 de 3 na PayT, todos
falsos. Separe `sem_correspondencia` de `cancelado` — ausência disfarçada de
resposta é a doença do `Math.round` inventando `×1`.

### Etiqueta morta na esteira — a tela mostra, a MENSAGEM não promete
A `20260946` tirou `and e.ativo` da `melhorenvio_envio_vigente` (etiqueta vencida
parou de sumir). Mas a `bling2_esteira` decide etapa por **carimbo cru**, então a
etiqueta morta passou a poder mover o card — inclusive para `em_transito`, que
dispara "saiu para entrega" com código cancelado.

A regra que ficou (`20260947`): **o CASE continua lendo carimbo** — postagem é
fato e não deixa de ser verdade porque a etiqueta foi cancelada depois. Quem cede
é a fila: `carbo_msg_fila` segura `em_transito` quando a etiqueta eleita está
`cancelado`. Mostrar na tela se desfaz; anunciar, não. **Vencida não é travada**
— etiqueta com `postado_em` foi usada.

`me_tem_ativo` na esteira separa "não vai sair e ninguém refez" (`false`) de
"pedido sem envio no ME" (`null`) — e os dois **não** são a mesma coisa.

⚠️ **Toda migração que MOVE card grava `'ignorado'` em `carbo_msg_envios` ANTES
de republicar a view.** A `20260946` esqueceu; deu sorte porque a população
exposta era pequena.

### ⚠️ A fila estourou o timeout e o WhatsApp parou por 18 DIAS, calado
Medido em 28/09/2026. `select * from carbo_msg_fila` levava **39.069 ms**
(`Buffers: shared hit=12.349.021`), e o `whatsapp-meta` devolvia, de minuto em
minuto desde **10/09**:

```
500 {"error": "fila: canceling statement due to statement timeout"}
```

⚠️ **O `pg_cron` marcou `succeeded` as 1.440 execuções do dia** — o sucesso
dele é ter POSTADO (`net.http_post` é assíncrono). Quem tinha o desfecho real
era `net._http_response`, e ninguém olha aquilo. É a terceira vez que esta
mesma cegueira custa dias neste repo (o `CRON_SECRET` sumido, os 401 do
`ecommerce-sync`). **Fonte que dispara mensagem, confira em
`net._http_response`, nunca em `cron.job_run_details`.**

O plano nomeou o culpado sem ambiguidade — 38,6 s dos 39 num só ramo:

```
Subquery Scan on "*SELECT* 3"        o ramo da RECOMPRA
  Nested Loop ... Rows Removed by Join Filter: 251909
  Index Scan using bling2_nfe_bling_id_key ... loops=299574
```

⚠️ **A `bling2_esteira` estava sendo montada DUAS vezes, uma delas dentro de um
laço.** O ramo fazia `from bling2_esteira e join carbo_recompra_pipeline p on
p.bling_id = e.bling_id` — e a pipeline **já é** a esteira (CTE `entregue`)
cruzada com `bling2_orders` e o carimbo de entrega. View é inlinada, então a
união das DUAS contas Bling (desde a `20260990`) era reavaliada por linha.

⚠️ **E o segundo `join` não trazia nada.** A pipeline já carrega `pedido_loja`,
`canal`, `cliente`, `cliente_fone`, `total`, `entrega_cidade` e `entrega_uf`, e
o template de recompra usa **uma** variável (`{{primeiro_nome}}`). A esteira
inteira era lida para devolver NF, transportadora e rastreio que a mensagem
descarta. Hoje o ramo lê SÓ a pipeline (`20261016`) — **não recoloque o join.**

⚠️ **Invisível até o volume cruzar**, como o teto de 1.000 do PostgREST e o
`.limit(200)` do chat: a esteira tinha poucas centenas de cards e hoje tem
**1.021** (427 nos últimos 30 dias, 594 mais velhos, o mais antigo de 12/06).

**E o marco zero foi JUNTO, na mesma migração** (`carbo_msg_config.inicio_em`,
molde do `carbo_carrinho_config`): a fila nunca teve data de corte, então
publicar a view rápida sozinha seria consertar o relógio e apertar o gatilho no
mesmo instante — os 594 cards antigos voltam a ser candidatos a qualquer etapa
que eles ainda não tenham em `carbo_msg_envios`.

⚠️ **O corte é de 7 dias, e "hoje" está ERRADO** — eu tinha recomendado hoje e
revi: hoje desliga a operação VIVA (pedido de ontem que emite NF amanhã nunca
mais seria anunciado, e não há nada de errado com ele). O congelamento em
`carbo_msg_envios` já cobriu os 309 que estavam parados; o marco zero é para o
que vier. Na recompra ele olha a **entrega**, não a data do pedido — a régua
conta 30 dias dali, e cortar por data de pedido esvaziaria o ramo para sempre.

### Melhor Envio — a etiqueta que nunca voltou para o Bling
Etiqueta comprada DIRETO no painel do Melhor Envio não volta para o Bling: o
card ficava em "NF emitida" com a encomenda já a caminho (79 pedidos assim). O
espelho `melhorenvio_envios` fecha o buraco, e a `bling2_esteira` passou a ler
dele — **sem tirar o Bling do lugar**: o Bling vence quando tem o dado, o ME
preenche o silêncio.

```
supabase/migrations/20260916000000_melhorenvio_envios.sql       espelho + envio vigente
supabase/migrations/20260918000000_melhorenvio_conciliacao.sql  as 4 portas (RECONSTITUÍDA)
supabase/migrations/20260919000000_esteira_ve_o_melhor_envio.sql  a view (RECONSTITUÍDA)
supabase/functions/_shared/melhorEnvioParse.ts                  puro, testado
```

1. **Sem vínculo, o card NÃO anda.** `melhorenvio_envio_vigente` casa por
   `bling_id`, e quem preenche é `carbo_melhorenvio_conciliar()` (cron 5 min,
   SQL puro). Envio `ambiguo`/`sem_match` fica invisível para a esteira — e não
   existe tela para resolver isso: mede-se por consulta.
2. **`melhorenvio_envio_vigente`, nunca a tabela crua.** Etiqueta cancelada e
   refeita gera `me_id` novo; sem a view, o envio cancelado moveria o card.
3. **`situacao = 'gerado'`, não `gerado_em is not null`.** Etiqueta vencida
   continua tendo `generated_at` e prometeria um envio que não vai acontecer.
4. ⚠️ **Fases 2 e 4 rodaram pelo SQL Editor e ficaram FORA do repositório** por
   um dia. Os arquivos `20260918`/`20260919` são reconstituição. SQL entregue no
   chat vira arquivo na MESMA tarefa — repo que não descreve a produção é a
   mesma doença do arquivo replicado que ninguém sabe que precisa ser copiado.
5. ⚠️ **`CREATE OR REPLACE VIEW` sem `WITH` APAGA as reloptions.** Ele aplica
   `AT_ReplaceRelOptions`, e lista vazia substitui. Foi assim que a
   `bling2_esteira` perdeu o `security_invoker = true` e passou a rodar com os
   privilégios do dono, RLS ignorada, com o `grant to authenticated` intacto —
   ou seja, lojista e licenciado (mesma tabela `profiles`) lendo a esteira
   inteira da Carbo pelo PostgREST. **Toda republicação de view repete a
   cláusula.** Confira com `select relname, reloptions from pg_class`.

⚠️ **E a REGRA IRMÃ, paga em 29/09/2026: escreva a view a partir do BANCO
(`pg_get_viewdef`), nunca da migração que a criou.** A `20261019` republicava
a `vendedor_estoque` copiada da `20260900` e levou
`42P16: cannot drop columns from view` — a definição viva era a da `20260915`,
com duas colunas a mais.

**O erro foi SORTE, não cuidado**, e é isso que importa: se as colunas tivessem
batido, o `create or replace` teria PASSADO e removido, calado, as duas coisas
que a `20260915` acrescentou e que quem escrevia não sabia que existiam —
`carbo_pode_ver_caixa(w.owner_id)` (o gate de quem enxerga qual caixa) e o
`with (security_invoker = false)`. Sem o gate, qualquer autenticado passaria a
ver a caixa de estoque de todo vendedor. Um vazamento inteiro, dentro de uma
migração cujo objetivo era esconder duas linhas zeradas.

É a MESMA lição do CHECK da `20260918` ("pergunte ao `pg_get_constraintdef`,
não à definição de nascimento"), e as duas custaram o mesmo tipo de engano:
afirmar o estado de produção a partir do repositório.

### ⚠️ `security_invoker` na esteira tem OUTRO lado: quem opera precisa ler
Fechar o vazamento da `bling2_esteira` (view sem `security_invoker` roda com os
privilégios do dono e ignora RLS) fez aparecer o problema oposto: as quatro
tabelas que ela lê — `bling2_orders`, `bling2_nfe`, `bling2_contacts`,
`bling2_lojas` — nasceram com leitura só para **admin/CEO/gestor**.

Sintoma: em qualquer outro perfil a esteira mostrava **tudo travado na primeira
coluna**. Não era a tela: a view voltava vazia, e a única coluna com card era a
"Pago", que vem de `ecommerce_aguardando_bling` (lê `ecommerce_orders`, aberta a
qualquer autenticado).

A correção (migração `20260936`) é política de leitura **somada**, com
`carbo_e_time_interno()` — policies de SELECT combinam com OR, então gestor não
perde nada. ⚠️ Voltar para `using (true)` reabriria o vazamento inteiro: o
portal de lojas e o de licenciados usam a MESMA tabela `profiles`.

⚠️ Continuam abertas a qualquer autenticado, e é a mesma família de furo:
`melhorenvio_envios`, `rastreio_envios`, `carbo_pedido_codigo`. Não foram
fechadas porque a página pública de rastreio pode ler daí — cliente sem
rastreio é pior que o vazamento. Medir a origem das leituras antes de fechar.

### Shopee — canal novo, e a esteira só anda até a etiqueta
`bling2_lojas.bling_id = 206191275`. O cadastro **não é cosmético**: é ele que
faz a ponte marcar `segmento = 'online'`.

1. **A Shopee não passa pelo Melhor Envio** (logística própria, SPX). O
   `rastreio-sync` corta o canal na `montarFila()` — sem isso o código entra na
   fila, não é encontrado e grava um erro no card de hora em hora, para sempre.
   Mesmo caso da Mandaê.
2. **Sem integração de plataforma, não há `ecommerce_orders` da Shopee** — o
   CTE `plataforma` não casa, `tem_status_da_plataforma` é falso e o card
   **para em "etiqueta"**: nada o leva a em trânsito ou entregue. Enquanto a
   integração não existir, esse avanço é manual.
3. **Pedido Shopee ainda não Atendido é invisível.** A coluna "Pago" vem de
   `ecommerce_aguardando_bling`, que lê a plataforma — e a Shopee não está lá.
4. ⚠️ **A `carbo_msg_fila` não filtra canal**: pedido Shopee entra na fila de
   WhatsApp como qualquer outro. A Shopee intermedia o contato do comprador —
   confira se o telefone é real antes de deixar um template ativo alcançar o
   canal.

### Bling 2 pode parar SEM deixar log — e o cron nem percebe
Aconteceu: 15 h de espelho parado, `pg_cron` marcando `succeeded` o tempo todo,
`bling2_sync_log` sem uma linha sequer no período. A causa foi
`bling2_integration.is_active = false` com UMA linha só na tabela.

1. **Sem integração ativa, a função desiste ANTES de abrir o log.** Por isso não
   há erro para ler: o silêncio é o sintoma. Comece o diagnóstico por
   `select is_active, expires_at from bling2_integration`, não pelo log.
2. ⚠️ **`bling2-auth` desativa a conexão antiga na ENTRADA do fluxo.** Uma
   reconexão iniciada em `/integracoes/bling2` e não concluída deixa exatamente
   este estado — desativada, sem nova no lugar. O sistema não distingue
   "reconectando" de "desconectado".
3. **Reativar a linha é o teste barato**: `update bling2_integration set
   is_active = true`. Se o `refresh_token` ainda valer (duram muito mais que as
   6 h do access token), o cron do minuto seguinte volta a logar. Se ele
   morreu, o `refreshToken` desativa de novo e diz o motivo no log — e aí só
   reconectando pelo OAuth até o fim.
4. **O `order_details` para junto e do mesmo jeito** (mudo, sem log). Depois de
   religar, confira `items is null or raw_detalhe is null`: sem `raw_detalhe`
   não há `nf_bling_id` e o pedido fica preso em "Confirmado". Ele drena 60 por
   rodada de 10 min — espere UMA rodada antes de concluir que não drenou.
5. **A fila de mensagens NÃO acumula rajada**: `carbo_msg_fila` é view do estado
   ATUAL, uma etapa por pedido. Pedido que andou três etapas na queda gera uma
   mensagem, não três — e `saiu_entrega` exige entrega em aberto.
6. ⚠️ **O alarme de `fontes_saude` é PASSIVO**: alguém precisa abrir a esteira.
   Para uma fonte que dispara WhatsApp, 15 h é muito — ligar isso no sininho
   continua pendente.

### Mercado Livre não tem telefone — e a esteira não avisa esses clientes
Medido: **91 de 93** pedidos do ML sem `cliente_fone` (97,8%). Amazon tem em
todos os 11; Nuvemshop, 3 de 397. Os poucos do ML que têm são exceções sem
motivo conhecido — o ML anonimiza o contato do comprador.

⚠️ A `carbo_msg_fila` exige `cliente_fone` não vazio, então esses pedidos
**saem da fila em silêncio**: andam na esteira, o card fica normal, e o cliente
não recebe aviso nenhum. São ~18% dos pedidos.

Consequência para quem lê o painel: **"avisos enviados" mede menos operação do
que parece** — praticamente só a loja própria. Buscar telefone no ML foi
descartado (não existe no dado).

✅ **A ausência JÁ é visível no card** (conferido em 31/08): o `EsteiraOnline`
mostra "sem telefone" em âmbar com `BellOff`, e essa checagem vem **antes** de
"sem aviso" — a ordem é a informação, porque as duas coisas têm a mesma cara e
causas opostas. O `ignorado` por marco zero é distinguido do `ignorado` por
telefone pelo prefixo do `motivo`. A face do card também escreve "sem telefone
na plataforma" em vez de deixar o campo vazio. Não refaça isso.

⚠️ O que **não** existe é o TAMANHO do buraco num lugar só: para saber quantos
por cento da operação não pode ser avisada, é consulta, não tela — e enquanto
for consulta, ninguém olha. Se um dia o painel ganhar um número de "avisos
enviados", ele precisa vir ao lado de "não avisáveis", senão vira a mesma
doença do relatório que só sabe concordar consigo mesmo.

### Cadência das automações — a esteira dispara mensagem, então ela é ao vivo
Enquanto a esteira era painel para olhar, meia hora de atraso não custava nada.
Desde que cada mudança de etapa manda WhatsApp para o cliente, custa: "saiu para
entrega" chegando 40 min depois é pior que não chegar. E o atraso nunca foi de
um job — era a **soma de filas em série**, que ninguém mede.

```
bling2-sync-incremental      * * * * *        orders_recente + nfe_recente
bling2-order-details-10min   3-59/10 * * * *  order_details  ← sem ele não há NF
bling2-bridge                */2 * * * *      SQL puro, banco→banco
ecommerce-sync-5min          */5 * * * *      envio/entrega da plataforma
rastreio-sync-5min           */5 * * * *      rede de segurança do webhook
nuvemshop-carrinhos-15min    4-59/15 * * * *  checkouts abandonados
kanban-n8n-1min              * * * * *        Evolution: recompra e carrinho
whatsapp-meta-1min           * * * * *        Meta oficial: as seis da esteira
bling2-nfe-recheck-20min     7-59/20 * * * *  nota cancelada some da listagem
melhor-envio-envios-15min    6-59/15 * * * *  espelho das etiquetas do painel
melhorenvio-conciliar-5min   */5 * * * *      SQL puro — sem vínculo, card parado
ml-token-refresh-30min       9-59/30 * * * *  token do ML, independente do sync
ml-estoque-full-15min        11-59/15 * * * * espelho do Fulfillment do ML
```

⚠️ **O `ml-estoque-full` nasceu de hora em hora e virou 15 min** (`20260993`),
a pedido do dono do processo. E a lição não é o número: **"ao vivo" são DUAS
coisas**, e acelerar só uma piora.

```
o CRON busca no ML          ← o que torna o dado FRESCO
a TELA relê o nosso banco   ← o que faz o número MUDAR sozinho
```

Acelerar só a tela dá sensação de tempo real sobre um número de uma hora atrás
— pior que não acelerar nada, porque a pessoa passa a confiar mais num dado que
não melhorou. O `useMlFull.ts` ganhou `refetchInterval` de 1 min na MESMA tarefa.

⚠️ **O limiar de "espelho velho" vai JUNTO com o agendamento.** Ele era 3 h,
calibrado para o cron de 1 h; mantido, a tela levaria duas horas e meia para
acusar um espelho parado. Hoje é 45 min. Mudou a cadência, mude o limiar — é a
mesma doença dos comentários de cron que já não valem.

⚠️ **Esta tabela é PARCIAL.** A grade real tinha **29 jobs** em 21/09/2026 —
`select jobid, jobname, schedule, active from cron.job order by jobname`. Dois
que faltavam e importam: **`bling-sync-morning 0 10 * * *` e
`bling-sync-afternoon 0 16 * * *`** — o Bling 1 sincroniza **duas vezes por
dia**, então toda NF de ML que chega pela matriz tem até 6 h de atraso.

⚠️ **Minuto ÍMPAR e fora da grade cheia** para job novo. Ocupados hoje: `:00` e
todos os **pares** (`bling2-bridge` é `*/2`), `:05` e múltiplos (os três `*/5`),
`:03` order_details, `:04` carrinhos, `:06` melhor-envio, `:07` nfe_recheck,
`:08` deduz-estoque. Empilhar não dá erro — dá dois picos que ninguém liga a nada.

⚠️ **O carrinho é de 15 min, não de 1.** A menor janela dessa pipeline é de 60
min; sincronizar de minuto em minuto só gastaria cota de API relendo carrinho
que não mudou, e 15 min sobre uma janela de 60 não muda nada para quem recebe.
Minuto :04 para não empilhar com o `order_details` (:03) nem com o `nfe_recheck`
(:07).

⚠️ **`order_details` é fase separada e não pode entrar no job de 1 min.** Ela é
uma chamada de API por pedido (teto 60, ~70 s); em cada minuto as rodadas se
atropelariam e dobrariam as chamadas ao Bling. E ela é indispensável: a listagem
não traz `raw_detalhe`, e sem ele não existe `nf_bling_id` — a nota chega ao
espelho órfã e o pedido fica preso em "Confirmado". Rodava 1×/dia e ninguém
tinha ligado uma coisa à outra.

⚠️ Comentários de migrações antigas explicam horários que **não valem mais**
(a `20260838` justifica ":15 e :45" para não colidir com o `bling-nfe-sync` do
minuto :00). O raciocínio era correto na época; a grade acima é a atual. Ao
mudar agendamento, marque a migração antiga como superada em vez de deixar duas
explicações vivas.

### WhatsApp: a esteira vai pela Meta, o comercial fica na Evolution
O transporte é propriedade da **etapa** (`carbo_msg_templates.canal_envio`), não
do sistema. As seis da esteira (`confirmado`, `nf_emitida`, `etiqueta`,
`em_transito`, `saiu_entrega`, `entregue`) vão pela Cloud API oficial; recompra
e os três passos do carrinho seguem na Evolution, pelo n8n.

```
WABA ID          1777955220017913   gestão de templates
Phone Number ID  1255756280958635   ENVIO   ⚠️ os dois NÃO se trocam
Graph API        v25.0 · pt_BR · categoria UTILITY
```

1. **A redação sai do nosso banco.** Aprovado o template, o texto é o da Meta.
   `carbo_msg_templates.texto` vira espelho de conferência nas etapas `meta` —
   editar na tela não muda o que sai. Sem isso a tela mostra uma coisa e o
   cliente recebe outra, que é a doença do `quotePdf.ts` no `mkt`.
2. ⚠️ **"Variável vazia apaga a linha" MORREU.** Era boa no texto livre; a Meta
   recusa parâmetro vazio (132000) e não aceita `\n`, tab ou 4+ espaços
   (132007). A substituta é `meta_variaveis`: com `fallback` manda a reserva,
   **sem `fallback` SEGURA o envio** até o dado existir. O padrão é o seguro.
   `rastreio` não tem fallback — botão apontando para URL sem código é pior que
   esperar dez minutos.
3. **O botão é POSICIONAL mesmo com o corpo nomeado** (`index: "0"`), e o
   parâmetro é só o **sufixo** do código, nunca a URL inteira.
4. ⚠️ **O PDF da NF não vai mais junto.** Os seis foram aprovados com
   `header: null`, e header se declara na APROVAÇÃO. Recuperar isso é template
   novo com header DOCUMENT e fila de aprovação de novo.
5. **`meta_status` é TRAVA, não informação.** A fila não entrega etapa `meta`
   sem `APPROVED` — ligar `ativo` cedo produz nada, em vez de uma rajada de
   132001. Mesmo padrão do "ausência FECHA" do `CRON_SECRET`.
6. **O envio vai DIRETO para o Graph API**, sem passar pelo n8n: o ganho da API
   oficial é o `wamid` e o webhook `sent → delivered → read → failed`. Pelo n8n
   o wamid fica lá e "enviado" continua significando "o POST foi aceito" — o
   mesmo sinal fraco do `pg_cron` marcando `succeeded`.
7. **O status só ANDA** (`carbo_msg_status_meta`). A Meta reentrega e não
   garante ordem; um `delivered` atrasado não pode rebaixar um `read`. `failed`
   é a única exceção, e mesmo ela não vence uma entrega já registrada.
8. **Guarde o `wa_id` que a Meta devolve**, não só o número que mandamos: no
   Brasil o 9º dígito varia por DDD e por idade do cadastro.

### Conversas do WhatsApp — a tela é o único lugar onde elas existem
Número da **Cloud API não aparece na Caixa de Entrada do Meta Business Suite**
(aquela tela só aceita número do aplicativo WhatsApp Business), e a Cloud API
**não tem endpoint de histórico**. O que o webhook não gravar existe só no
celular do cliente.

```
carbo_wa_mensagens    o conteúdo, por wamid
carbo_wa_conversas    a mensagem já ligada ao pedido de que trata
apps/atendimento/src/lib/conversas.ts      as REGRAS (puras)
apps/atendimento/src/hooks/useConversas.ts só IO
apps/atendimento/src/pages/Conversas.tsx   /conversas
supabase/functions/whatsapp-responder      texto livre, chamado pelo NAVEGADOR
```

⚠️ **Mora num app SÓ, desde 28/08/2026.** Estava replicada em `admin` e `ops`
(duas cópias idênticas) e foi movida inteira para o `apps/atendimento` — página,
hook e lib. Não é mais arquivo replicado, e não deve voltar a ser: quem atende
tem o app dele.

⚠️ `FUNCTIONS_URL` precisa existir no `client.ts` do app que hospedar a tela. O
`useConversas` o usa para foto, documento e áudio: `functions.invoke` serializa
o corpo como JSON e o `FormData` chegaria vazio do outro lado.

1. **A janela de 24 h é a regra central**, não um detalhe: texto livre só passa
   enquanto ela está aberta, e ela abre quando o **cliente** escreve. Fechada, a
   Meta recusa com 131047 e nenhum dos seis templates da esteira serve para
   responder dúvida. Por isso o relógio aparece em cada linha da lista, e o
   campo de resposta **some** quando fecha — deixá-lo ali para falhar no clique
   faria a pessoa escrever a resposta inteira antes de descobrir.
2. **Agrupa por `wa_id`, não por pedido.** A janela é da PESSOA: quem tem dois
   pedidos abertos tem uma conversa só.
3. **`vinculo_exato` não é enfeite.** O pedido vem do `context.id` da resposta
   (exato) ou, na falta, do último aviso enviado àquele número (aproximado).
   Aproximação que se passa por certeza é como alguém responde sobre o pedido
   errado.
4. **Só grava o que SAIU.** Tentativa que falhou não vira balão na tela — quem
   atende responderia como se já tivesse dito aquilo.
5. **`whatsapp-responder` sobe SEM `--no-verify-jwt`**, como a
   `evolution-instancia`: quem chama é gente logada. E confere `interface
   interna` no perfil — sem isso um lojista logado escreveria pelo número da
   CarboZé, porque o portal usa a MESMA tabela `profiles`.
6. ⚠️ **No Ops o arquivo é `pages/Conversas.tsx`, não `pages/logistica/`.** A
   rota é `/logistica/conversas` e o resto da logística mora naquela pasta, o
   que torna o engano natural — e ele custou meio dia: três commits foram
   copiados para um `pages/logistica/Conversas.tsx` que **ninguém importa**,
   enquanto a tela viva seguia com a versão antiga. Não deu erro em lugar
   nenhum: o app compila, builda e sobe, mostrando código de ontem. Confira o
   import do `App.tsx` antes de copiar, sempre.
7. **Recado interno mora em OUTRA TABELA** (`carbo_wa_notas`), não numa coluna
   `interna` em `carbo_wa_mensagens`. É isso — e não a cor âmbar na tela — que
   garante que ele nunca chegue ao cliente: nenhum caminho de envio lê essa
   tabela, então não há SELECT futuro que possa esquecer o filtro. Ele também
   funciona com a janela FECHADA, que é quando anotar mais importa.
8. **Status: DOIS calculados, DOIS clicados.** `aberto` e `em_atendimento` saem
   de quem falou por último (`statusEfetivo`, em `lib/conversas.ts`); só
   `aguardando` e `resolvido` são decisão humana, e os dois REABREM quando o
   cliente escreve depois. Dar botão para os dois primeiros criaria a doença
   conhecida dessas ferramentas — status manual brigando com a realidade, e
   fila em que ninguém confia. ⚠️ Aviso automático da esteira NÃO conta como
   atendimento: sem essa distinção toda conversa que recebeu "nota fiscal
   emitida" apareceria como "em atendimento" sem ninguém ter atendido.
9. **Reabertura é DITA na tela** (`foiReaberta` → faixa âmbar). Reabrir em
   silêncio faz quem marcou resolvido achar que o sistema desfez o trabalho
   dele — o comportamento está certo, o que faltava era o motivo aparecer.
10. **Etiqueta é TABELA** (`carbo_wa_tags` + `carbo_wa_conversa_tag`), com cor
   de paleta fechada. Texto livre viraria "orçamento", "Orçamento" e "orcamento"
   na mesma semana e o filtro passaria a mentir; enum exigiria migração por tag
   nova, e aí ninguém cria tag. Desative, nunca apague.
11. ⚠️ **`carbo_e_time_interno()`** guarda `carbo_wa_mensagens` e
   `carbo_wa_contatos`. A lista de interfaces é a mesma do `notify_time_interno`
   — duas listas divergem, e divergir aqui ABRE acesso em vez de fechar.

### Segredo de função: FECHE quando ele não existe
Padrão obrigatório em toda edge function chamada por máquina:

```ts
if (!SEGREDO || informado !== SEGREDO) return 401;   // certo
if (SEGREDO && informado !== SEGREDO) return 401;    // ERRADO: sem secret, aceita tudo
```

O `CRON_SECRET` já sumiu uma vez neste projeto — 25 h de sincronismo morto, com
`pg_cron` marcando `succeeded` o tempo todo, porque `net.http_post` é assíncrono
e o sucesso dele é ter POSTADO. Naquela vez a ausência travou tudo, que é o modo
seguro. Na forma errada acima ela **abriria** — e no `kanban-n8n` isso é
qualquer pessoa disparando WhatsApp para a base.

Separe as recusas: **401** para segredo errado (problema de quem chama), **500**
com mensagem explícita para segredo ausente no servidor (problema nosso). Um 401
para os dois faz a falha de configuração se disfarçar de chamada indevida — foi
esse disfarce que custou o dia de diagnóstico.

⚠️ **`WEBHOOK_OBSERVAR=1` é a porta destrancada do `ecommerce-webhook`**, e ela
existe de propósito: os cinco validadores hoje FECHAM sem segredo, e virar isso
às cegas derrubaria a entrada de pedido de quem está vendendo. O modo de
observação registra a recusa e deixa passar, para se ler o log antes de fechar.

O defeito era o INCENTIVO INVERTIDO: só havia rastro quando algo era recusado —
ou seja, o sinal aparecia exatamente quando ainda **não** se devia fechar, e
sumia quando se **devia**. Um dia limpo era indistinguível de "a variável já foi
removida", e é assim que provisório vira definitivo. Desde 31/08 a porta se
anuncia a cada requisição: **`grep PORTA_ABERTA` nos logs responde "está
ligado?"** sem abrir o painel do Supabase.

Fechar = remover o secret e fazer deploy. ⚠️ E o deploy é o push em `main`
(`ecommerce-webhook` está na lista `dep`) — remover o secret sozinho não basta
se a função no ar for antiga.

### Regras anti-confusão (OBRIGATÓRIAS)
1. **Todo pedido nomeia o alvo.** "no CRM" → `apps/crm`; "no controle"/"atual" → raiz (`src/`).
2. **Na dúvida, PERGUNTE — nunca adivinhe.** Se a tela existe em mais de um app, liste os candidatos antes de mexer.
3. **Congelamento do `controle`:** raiz só recebe correção crítica. Funcionalidade nova vai pros apps novos.
   ⚠️ **A raiz NÃO conhece PayT nem Shopee, e isso é decisão, não esquecimento**
   (medido em 31/08). Ela lista os canais em seis arquivos
   (`useDashEcommerce`, `useMetaEcommerce`, `skuUnidades`, `SkuMappingConfig`,
   `DashEcommerceVendas`, `MetaEcommercePage`) e o `DashEcommerceVendas` marca
   `tiktok` e `shopee` como `disabled: true`. **Nenhum número da raiz fica
   errado por causa disso**: não existe visão "todos os canais" — cada tela é de
   UM canal (`useDashEcommerce(platform, …)`) e o Comparativo só soma o que foi
   selecionado. Ou seja, a falta aparece como **aba ausente**, não como total
   menor — que é o estado aceitável para um app congelado. Acrescentar canal ali
   seria funcionalidade nova em seis arquivos de um monólito vivo, para uma tela
   que o `apps/admin` já cobre melhor. Se um dia a raiz ganhar um total geral,
   isso deixa de valer e vira número mentindo.
4. **Mudança em `packages/`** → avise que afeta vários apps antes de aplicar.
5. **Cada app é autossuficiente.** `apps/crm` tem build/lockfile próprio; NÃO mexer no `package.json` da raiz (3 lockfiles frágeis — risco ao deploy do controle).

### App novo no hub — os QUATRO lugares que precisam aprender a interface
Criar a pasta do app é a parte fácil. O que faz um app existir é a flag em
`profiles.allowed_interfaces` (ex.: `carbo_atendimento`) ser reconhecida em
quatro lugares — e **cada um falha calado de um jeito diferente**:

```
apps/{admin,ti,<novo>}/src/lib/interfaces.ts   a caixinha na tela do Admin
packages/shell/src/apps.ts                     o seletor de apps
carbohub-landing/src/lib/apps.ts               o azulejo do Hub (OUTRO repo)
carbo_interface_e_interna()  (migração)        quem é "time interno"
```

1. **Sem o `interfaces.ts`**, ninguém consegue liberar o acesso a ninguém: o app
   sobe e fica inacessível. ⚠️ As cópias do `admin` e do `ti` **já estavam
   divergentes** — a do `ti` não tinha `carbo_ti`, então pelo app do TI não dava
   para liberar o próprio TI. Mesma doença do `quotePdf.ts` do `mkt`.
2. **Sem `INTERFACE_TO_APPS`** (nos dois repos), a resolução é ESTRITA: a pessoa
   tem a flag e o app não aparece no switcher nem no Hub. Sem erro.
3. ⚠️ **Sem entrar em `carbo_interface_e_interna`**, quem só tem aquele app não
   recebe notificação nenhuma **e é barrado pela RLS** em `carbo_wa_mensagens`,
   `sku_product_mappings`, `carbo_canal_estoque` e outras — a tela abre e volta
   **vazia**. Mesmo sintoma da `bling2_esteira`.
4. ⚠️ **A lista de internos também vivia COPIADA em TypeScript** nas três edge
   functions do WhatsApp (`whatsapp-responder`, `-midia`, `-midia-baixar`), com
   um comentário dizendo que duplicar ali era "inevitável (o SQL não alcança
   daqui)". Não era: elas têm cliente com service role e o Postgres responde por
   RPC. Hoje as três usam `_shared/interfacesInternas.ts`, que pergunta ao banco
   e **só nega** quando cai na rede local — rede que abre transforma falha de
   rede em porta destrancada.

⚠️ **O azulejo do ADMIN era a EXCEÇÃO do mapa, e ninguém sabia** (corrigido em
09/09/2026). Ele não estava em `INTERFACE_TO_APPS`: o Hub o mostrava por PERFIL
(`seesEverything` — department `command`/`ti_suporte`, funcao `head`/`ceo`),
enquanto o `ProtectedRoute` do app Admin exige só a flag `carbo_admin`. Duas
regras para a MESMA porta, discordando nos dois sentidos e sempre calado:

```
flag sem perfil → o azulejo nunca aparece; liberar no Admin não adianta nada
perfil sem flag → o azulejo aparece e o clique dá "Acesso restrito"
```

Medido: Leticia (`ops`/`estagiario`) e Lígia (`ops`/`gerente`), as duas com
`carbo_admin` gravado e sem entrada nenhuma.

⚠️ E eram **TRÊS** cópias da mesma pergunta, não duas — o seletor de apps do
`packages/shell` tinha o MESMO `seesEverything`, então o Admin também não
aparecia no switcher de nenhum dos sete. Hoje as três leem a flag:

```
apps/admin/src/contexts/AuthContext.tsx   hasAdminInterface   ENTRADA no app
packages/shell/src/apps.ts                temFlagAdmin        seletor de apps
carbohub-landing/src/lib/apps.ts          mostraAdmin         azulejo do Hub
```

Mudou uma, confira as outras duas. ⚠️ E `seesEverything` continua existindo nos
três arquivos para outras perguntas — ela **não** governa mais o Admin.

⚠️ E o comentário do `apps/admin/src/lib/interfaces.ts` afirmava o OPOSTO do
código: dizia que a flag "controla APENAS a exibição do card" e que a entrada
vinha do perfil. Descrevia um `ProtectedRoute` que já não existia. Quem foi
liberar acesso leu na própria tela que marcar não adiantava.

### O md entrou no Hub em 10/09/2026 — e por que só em TRÊS dos quatro

O `md.carbohub.com.br` estava no ar desde 02/09 sem azulejo em lugar
nenhum. O custo apareceu ao investigar por que o Peterson não acessava:
ele tem `portal_pdv`, passa em TODAS as portas do banco, e mesmo assim
não tinha por onde chegar — o `LoginPage` do md barra interno de
propósito ("entre pelo Hub") e o Hub não mostrava o md. Chave no bolso,
nenhuma fechadura.

Feitos: `packages/shell/src/apps.ts`, `carbohub-landing/src/lib/apps.ts`
e o rótulo da caixinha nas duas cópias do `interfaces.ts`.

⚠️ **O quarto lugar NÃO foi feito, e é decisão.** Não existe flag
`portal_micro`, e não se criou uma: o md nunca ganhou chave própria —
quem não tem linha em `produtos.profiles` entra lá por
`produtos.is_carbo_admin()`, que lê exatamente `portal_pdv`. Uma
caixinha nova no Admin abriria porta nenhuma, que é o defeito descrito
no comentário do `mostraAdmin` do Hub. **O azulejo espelha o portão**;
quando o md ganhar chave própria, os dois mudam no mesmo dia.

⚠️ E `carbo_interface_e_interna()` continua sem o md pelo mesmo motivo
que exclui `portal_pdv` e `portal_licenciado`: são portais de PARCEIRO,
não interfaces internas. Microdistribuidor não é time interno.

⚠️ **A cor do md é `#C2410C`, e NÃO o `#F97316` do app.** É o mesmo
tropeço registrado abaixo, e desta vez foi medido em duas rodadas: na
grade de três colunas do Hub o Ops e o md caem um EM CIMA do outro, e
com `#EA580C` ainda liam como o mesmo laranja. Com `#C2410C` o Ops fica
dourado e o md, terracota. Precedente de que a cor do azulejo não
precisa ser a do app: o Portal de Vendas é verde no Hub e laranja
dentro dele.

**A cor do app aparece em quatro lugares** (acento do app, chip do
`interfaces.ts` nas três cópias, `packages/shell`, azulejo do Hub) e os quatro
têm de concordar. Escolha por MEDIDA, não por gosto: laranja `#F97316` foi
descartado no `atendimento` porque o Ops já é âmbar `#F59E0B` e, lado a lado no
switcher, são a mesma cor a um metro.

⚠️ **`ProtectedRoute` tem de barrar `profile == null`, não só a flag ausente.**
O portal de lojas e o de licenciados usam a MESMA tabela `profiles`. O
`apps/atendimento` cobre; os outros seis testam só a flag — pendente.

### Modelo de acesso dos sistemas novos (NÃO usar Role Matrix)
- Sem matriz tela-a-tela. Nível decide: **gestor** (vê tudo + botões de gestão) vs **membro** (próprio escopo).
- Escopo de dado reaproveitado: `proprio | equipe | departamento | global`.
- Crescimento via **capabilities** (`apps/crm/src/lib/access.ts`), nunca telas numa matriz.
- App Admin (futuro) espelha cada sistema via `access.manifest`.

---

## Regra obrigatória (LEGADO — só vale na raiz/controle): novas telas → Role Matrix

**Sempre que criar uma nova página com controle de acesso**, três arquivos devem ser atualizados juntos — sem exceção:

### 1. `src/App.tsx`
Adicionar rota com `screenId`:
```tsx
<Route path="/minha/rota"
  element={<ProtectedRoute screenId="meu-screen-id"><MinhaPage /></ProtectedRoute>}
/>
```

### 2. `src/constants/functionAccessConfig.ts` ← NUNCA ESQUECER
Registrar no grupo adequado dentro de `SCREEN_GROUPS`:
```ts
{
  id: "meu-grupo",
  label: "Meu Grupo",
  screens: [
    { id: "meu-screen-id", label: "Nome visível no Role Matrix", path: "/minha/rota" },
  ],
},
```
**Sem este passo a tela não aparece em `/role-matrix`** e o admin não consegue liberar o acesso para nenhum usuário.

### 3. Avisar o usuário
Após o deploy, informar que a nova tela aparece no `/role-matrix` no grupo correspondente para o admin liberar os acessos.

---

## Stack
- React + TypeScript + Vite
- Supabase (Postgres + Auth + RLS + Realtime)
- TanStack Query para data fetching
- shadcn/ui + Tailwind CSS
- Recharts para gráficos
- dnd-kit para kanban drag-and-drop
- Branch de desenvolvimento: `claude/pensive-hamilton-7ijq0`

## Estrutura de acesso
- `ProtectedRoute` com `screenId` → verifica `function_screen_access` no banco
- `src/constants/functionAccessConfig.ts` → lista todas as telas disponíveis no Role Matrix
- `/role-matrix` → interface do admin para liberar telas por departamento/função
- Telas **sem** `screenId` são acessíveis a qualquer usuário autenticado (sem controle)
- **`ti_suporte/head` é superusuário**: bypass total de `useCanSeeScreen` — vê todas as telas sem configuração, inclusive futuras. Implementado em `src/hooks/useFunctionAccess.ts`.

## Warehouses
- `HUB-RN` = Hub Natal (produção, estoque de insumos)
- `HUB-SP` = CD SP LogHouse
- `HUB-SP-VENDAS` = CD SP Vendas
- `warehouse_stock` é a fonte de verdade de estoque por hub (nunca usar `mrp_products.current_stock_qty` como fallback de exibição)

## Migrações
- Sempre criar arquivo em `supabase/migrations/` com timestamp sequencial
- Passar o SQL para o usuário rodar no Supabase SQL Editor quando necessário

### ⚠️ ENTREGAR SQL É MANDAR OS BLOCOS, NÃO AVISAR QUE ELES EXISTEM
O Claude **não tem acesso ao banco** — não há connection string, `.env` nem
service role neste ambiente. Quem roda é sempre o usuário, colando no SQL
Editor. Isso não é detalhe de logística: é o passo em que o trabalho ou vira
realidade ou não vira.

**Regra:** criou migração, **mande os blocos prontos para colar, na ordem, na
mesma mensagem.** Não escreva "a migração está no arquivo X, rode quando
quiser", não pergunte "quer que eu mande?", não mande um bloco e espere pedirem
o próximo. Já custou tempo mais de uma vez, e o usuário teve de cobrar duas
vezes com estas palavras: *"vc n mandou as coisas para rodar, n entendi"* e
*"manda o resto ai de uma vez, pare de me fazer pedir"*.

Cada bloco vai com: **o que ele faz**, **o que esperar de volta**, e **o que
significa se vier diferente**. Bloco destrutivo diz o que é preciso EDITAR antes.

⚠️ **Valor de exemplo em bloco destrutivo tem de RECUSAR rodar** (ver a
`20260969`): `0` é um saldo válido, então o exemplo `('CZ100', 0)` zerou 275
unidades sem reclamar. Use `null` + `plpgsql` que aborta dizendo o que falta.

⚠️ **Ler antes de escrever, sempre.** Todo bloco que altera dado vem depois de
um bloco que MEDE o estado — e o resultado da medição pode mudar o plano. Já
mudou três vezes numa tarde: o ensaio vazio apagou metade da `20260969`, e o
`0.d` (50 pedidos pendentes) inverteu a decisão sobre o marco zero.

### ⚠️ TDZ no `Vender.tsx`: `useMemo` roda no render
Derrubou o `/vender` em produção nos seis apps (`Cannot access '$i' before
initialization`). O callback de `useMemo`/`useCallback` executa **durante o
render**, então qualquer `const` que ele chame precisa estar declarado ACIMA.

O `tsc` **não pega**: ele não sabe quando o callback roda. O `npm run build`
também não — esbuild não checa nada disso. Passou por typecheck e por seis
builds antes de quebrar na tela.

Ao mexer no `Vender.tsx`, rode a checagem: para cada `useMemo`/`useCallback`,
confira se algum identificador usado no corpo é um `const` declarado depois.
`ehBonificacao` fica logo após `useProdutos()` por esse motivo, e
`faltaNaCaixa` fica depois de `validItems`.

### ⚠️ Nota de BONIFICAÇÃO não é faturamento — e a marca `-BON` não alcança tudo
Medido em 21/09/2026: **4 pedidos, R$ 5.523,00** somando dentro do faturamento
desde 06/11/2025. Sobre os R$ 899.540,38 que contavam, é **0,61%** — pequeno o
bastante para nunca chamar atenção, que é por que durou dez meses.
✅ Aplicada em 21/09: de 1.174 pedidos / R$ 899.540,38 para **1.170 /
R$ 894.017,38**.

⚠️ **E o número de conferência que eu escrevi estava errado** — dizia esperar
1.166 / R$ 888.494,38, porque subtraí os 4 de 1.170 sem notar que aquele 1.170
era o grupo `e_bonificacao = false` da medição inicial, que já os excluía. A
conferência voltou certa e eu quase a li como "não mudou nada". **Número de
referência copiado de um agrupamento tem de vir com o que aquele grupo
continha**, senão a conferência passa a testar a minha aritmética em vez do
sistema.

A `20260903` montou a arquitetura certa (pedido e NF próprios, nota em
`bling_nf_bonificacao_id`, gatilho `trg_bloqueia_remessa_bonificacao`). ⚠️ Mas a
marca daquela guarda é o **sufixo `-BON`**, e ela só alcança o que o NOSSO
sistema criou: não pega o que é anterior a 03/09/2026, nem pedido faturado
direto no painel do Bling — o `V2026090052` entrou em **11/09**, oito dias
DEPOIS do gatilho. Nos quatro, a nota de bonificação foi parar em `bling_nf_id`,
a coluna da nota PRINCIPAL, e por isso o valor contava.

**A régua passou a perguntar à NATUREZA** (`20260981`), via
`carbo_natureza_e_bonificacao(text)` + `carbo_config_fiscal`:

1. ⚠️ **O CFOP foi cogitado primeiro e o dado o descartou**: `naturezaOperacao`
   vem em **828/828** e **369/369** das notas; `itens` (onde mora o CFOP), em
   **219/828** e **11/369**. Sinal que falta em 3 de cada 4 notas não é sinal.
2. ⚠️ **A natureza SEPARA sem zona cinzenta**: dos 1.170 pedidos que contavam,
   **zero** usavam a natureza de bonificação. Foi essa medição que autorizou
   aplicar a regra a todos, e não só aos quatro conhecidos.
3. **Na VIEW, não marcando `excluir_metricas`.** A coluna existe (`20260630`) e
   as sete cópias de `useCarbozeVendas.ts` já a respeitam — marcar resolveria
   hoje. Não amanhã: a nota chega DEPOIS do pedido, então o gatilho moraria em
   `bling_nfe`, mais uma peça móvel que falha calada. Em `conta_metrica` a regra
   é calculada na LEITURA: vale para o passado e o futuro, sem nada rodar.
4. ⚠️ **A função é `SECURITY DEFINER` e isso não é folga.** `carbo_config_fiscal`
   tem RLS e a view é `security_invoker` — em invoker, um perfil sem leitura da
   config receberia "nenhuma natureza configurada" e veria o faturamento
   **inflado**, enquanto o gestor veria o certo. Dois valores para o mesmo
   número, conforme quem olha, é pior que o furo original.
5. ⚠️ **Casa por PADRÃO de chave** (`%natureza_bonificacao%`), nunca por lista de
   nomes: já são três chaves nessa família (`bling_`, `bling1_`, `bling2_`) e a
   quarta conta entraria com nome novo. Lista escrita no código é mais uma cópia
   de cadastro, e divergir dela não dá erro — dá bonificação contando receita.
6. ⚠️ **Aqui NÃO existe "ausência FECHA".** Sem natureza cadastrada a função
   devolve `false` e tudo continua contando; fechar significaria tratar toda
   nota como bonificação e **zerar o faturamento**. Quem protege é a conferência
   `(a)` da migração, que conta quantas naturezas estão configuradas — uma
   migração que não fez nada, sem erro, é o modo de falhar mais caro deste repo.
7. **A POSIÇÃO no `motivo_fora`**: depois de `orcamento`/`cancelado` (estado do
   PEDIDO) e antes de `nf_invalida`/`aguardando_nf` (estado da NOTA). Nota de
   bonificação válida não tem nada de inválida, e "aguardando emissão" mandaria
   alguém emitir a segunda.
8. ⚠️ **O número do PASSADO muda** — nov/25 −510, jan −1.950, mar −975, set
   −2.088. É o objetivo, mas quem fechou aqueles meses vê outro número. Nada é
   apagado: `total` fica, o pedido fica na lista, reverter é republicar a view.
9. ⚠️ **`motivo_fora` novo precisa de rótulo em DUAS telas** (`ComercialDados.tsx`
   do `admin` e do `ti`). O render tem fallback (`MOTIVO_FORA[x] ?? x`), então
   não quebra nem some — aparece cru, em linguagem de banco.

⚠️ Republicar `carbo_vendas_metrica` exige **DROP + recreate** (o `o.*` expandido
na criação) e derruba junto as dependentes. `CASCADE` as apagaria em silêncio e a
busca global do Sales sumiria sem motivo aparente. E **repita o
`with (security_invoker = true)`** — `CREATE VIEW` sem `WITH` apaga as reloptions.

⚠️ **São TRÊS dependentes, e a lista da `20260911` diz duas.** A
`carbo_vendas_nf_cancelada` nasceu na `20260912`, depois dela, e derrubou a
primeira tentativa da `20260981` com `2BP01`. Erro barato — a transação abortou
inteira — mas ele só aconteceu porque a lista foi lida do REPOSITÓRIO.
**Pergunte ao banco** (`pg_depend` + `pg_rewrite`, e `prorettype` para as funções
`returns setof`); o BLOCO 0 da `20260981` é essa consulta, pronta.
⚠️ E um `join` dentro de uma view **É** dependência: procurar só por
`create/replace view <alvo>` nas migrações posteriores deixa passar quem apenas
a lê — foi exatamente assim que essa escapou.

⚠️ **`motivo_fora` é RÓTULO de tela, não chave de filtro em SQL.** Ele é um CASE
com PRECEDÊNCIA: a `carbo_vendas_nf_cancelada` filtrava
`motivo_fora = 'nf_invalida'`, e inserir `'bonificacao'` acima disso tiraria
dela, calado, todo pedido de bonificação com nota cancelada — mudando o que
aquela lista significa por causa de um caso vizinho. A view expõe `nf_invalida`
como **coluna booleana própria**, calculada fora do CASE e imune à ordem; é por
ela que se filtra. Caso novo no CASE ⇒ confira quem filtra por string.

### ⚠️ O Bling NÃO devolve a observação que mandamos — e isso quebrou as DUAS notas
Medido em 22/09/2026, investigando por que a logística não conseguia imprimir a
nota de remessa no Rastreio.

Venda com brinde gera **duas notas**: a de venda, com valor cheio, e a remessa
em bonificação, que acompanha a caixa separada. A `20260903` desenhou o fluxo
certo — pedido `-BON` próprio no Bling, e o `bling-sync` lendo esse sufixo na
observação da NF para decidir em qual coluna gravar.

**O Bling não herda a observação.** Ele a substitui pelo texto fiscal padrão da
natureza, e o número do pedido reaparece no fim, em formatos variados:

```
REMESSA DE MERCADORIA EM BONIFICACAO,CONCEDIDA…COBRANCA.V2026090052 -
…COBRANCA. V2026090044 Vendedor: Weider Moura
…COBRANCA. <br />V2026080089-Vendedor: Weider Moura
```

Medição: **14 pedidos com remessa criada, `-BON` em ZERO notas.**

⚠️ **Um defeito, dois erros OPOSTOS, e qual aparecia era sorte.**
`bling_nf_bonificacao_id` ficou nulo em 100% dos casos (a logística nunca teve a
segunda nota) — e, quando as duas notas casavam com o mesmo pedido, **qual
ficava em `bling_nf_id` dependia da ordem em que o sync as encontrava**. Sete
pedidos deram sorte; no `V2026090052` a nota de bonificação (R$ 208,80) tomou o
lugar da de venda (R$ 2.088,00) e o pedido **caiu do faturamento** — porque a
régua da natureza, corretamente, exclui bonificação. O comentário do próprio
código previa esse modo de falha e ninguém tinha medido se ele acontecia.

Hoje quem decide é a **NATUREZA** (`bling-sync` + `20260996`): ela vem em 100%
das notas, é cadastro do Bling e **já governava o faturamento**. Um sinal para as
duas decisões, em vez de dois que podem discordar. O sufixo fica como rede.

1. ⚠️ **Sinal que depende de o terceiro devolver texto NOSSO é frágil por
   construção.** Não havia como o `-BON` sobreviver: ele competia com o campo que
   o próprio Bling preenche a partir do cadastro fiscal.
2. ✅ **A `20260996` corrigiu o passado e o faturamento SUBIU**: 1.196 →
   **1.197 pedidos**, R$ 897.977,02 → **R$ 900.065,02** (+R$ 2.088,00, o
   `V2026090052`). Migração de bonificação que aumenta faturamento parece
   contraditória — e é o sinal de que o defeito tinha dois lados.
3. ⚠️ **Ela só age onde há UMA nota de cada tipo.** Pedido com duas notas de
   venda é ambiguidade, e escolher uma enterraria a dúvida — a mesma regra da
   carga de PDV que não insere quando o nome bate com duas linhas.
4. ⚠️ **"ESPERADO: ZERO" na conferência estava errado** e voltaram três
   (`BLING-21`, `BLING-61`, `BLING-72`): pedidos **só de bonificação**, com uma
   nota e nenhuma de venda. Não há o que devolver, e eles seguem fora do
   faturamento corretamente. Número esperado escrito sem enumerar os casos vira
   falso alarme.
5. **A tela era a terceira vítima, não a causa.** `usePosVenda` monta a lista de
   colunas à mão e não trazia as três de bonificação — coluna ausente ali não dá
   erro, dá campo vazio. Hoje o Rastreio mostra as duas notas com DANFE e XML, e
   **diz em âmbar** quando o pedido tem item bonificado e a nota de remessa não
   está vinculada: despachar assim manda a caixa sem documento.
   ⚠️ O código de barras da etiqueta continua sendo o da nota de **venda** — a
   etiqueta identifica a carga faturada, a bonificação viaja junto.

### REMESSA de entrega futura — e o CATÁLOGO, que é a parte que importa
Achado em 01/10/2026 olhando um card parado da Brisanet, e o pedido do dono do
processo foi literal: *"consegue verificar para casos assim no futuro? dai não
fazemos algo apenas pontual, pq isso passa despercebido"*.

A nota **MÃE** fatura o contrato inteiro e as **FILHAS** só movimentam a
mercadoria, mês a mês, descontando dela. As duas contavam:

```
15110465964   MÃE      000232 R$ 55.380 · 000234 R$ 21.840      = R$ 77.220
15110465968   REMESSA  6 notas já emitidas                      = R$ 11.050  ← em dobro
                       14 parcelas até abr/27                   = R$ 25.480  ← viriam
```

✅ Aplicado: **1.303 → 1.297 pedidos**, R$ 941.094,52 → **R$ 930.044,52**.

O sinal que denunciou está no RODAPÉ e é identidade, não semelhança:
`NOTA FISCAL REFERENCIADA: ... 55 001 000000232`. **Nenhuma venda comum
referencia outra nota.**

1. ⚠️ **NÃO reusar `carbo_natureza_e_bonificacao`.** Mecanicamente bastava
   cadastrar o id sob uma chave `%natureza_bonificacao%` — sem mexer em view
   nenhuma. E seria errado: o `motivo_fora` passaria a dizer **"bonificacao"**
   para uma remessa de entrega futura, e esta tela é lida por quem fecha o mês.
   São conceitos IRMÃOS: `carbo_natureza_sem_faturamento()` é gêmea em forma e
   diferente em significado. Os dois tiram do faturamento, por razões
   diferentes, e a tela precisa dizer QUAL.
2. ⚠️ **`carbo_naturezas_fiscais` é a lista de trabalho, e é o entregável de
   verdade.** A bonificação levou DEZ meses para aparecer (0,61% do
   faturamento); a entrega futura, cinco (1,2%). **As duas foram achadas por
   acaso, olhando outra coisa.** O que faltava não era régua — era um lugar onde
   natureza NOVA aparece sozinha, com o dinheiro ao lado. Molde do
   `carbo_nfse_eventos_tipos`: desconhecido não faz nada e APARECE.
   `suspeita_de_remessa` marca natureza não classificada cujas notas referenciam
   outra nota. A consulta que vale rodar de tempos em tempos:

```sql
select * from public.carbo_naturezas_fiscais
where suspeita_de_remessa order by valor desc;
```

3. ⚠️ **Lista BRANCA, e aqui "ausência FECHA" NÃO vale.** Sem natureza
   cadastrada a função devolve `false` e tudo continua contando. Fechar
   significaria tratar toda natureza não classificada como remessa e **zerar o
   faturamento**. Quem protege contra o esquecimento é o catálogo, não a régua —
   é o oposto do `CRON_SECRET`, e de propósito.
4. ⚠️ **A view NÃO LIA a natureza da FILIAL**, e isso só apareceu em
   `pg_get_viewdef`: ela fazia `coalesce(n.raw_data->..., n2.raw_data->...)`, e o
   detalhe da conta 2 **nunca** traz `naturezaOperacao` (medido: 884 notas,
   zero). A natureza da filial mora em `n2.natureza_operacao`, do `<natOp>` do
   XML. Ou seja, a regra da `20260981` valia só para a matriz sem ninguém saber.
   ⚠️ **E a correção não consertou o passado — fechou uma porta.** As 2 notas de
   bonificação da filial estão em `bling2_nf_bonificacao_id`, a coluna certa, e
   o faturamento caiu exatamente os R$ 11.050 da remessa, nem um centavo da
   bonificação. O furo era FUTURO: vínculo manual em `bling2_nf_id` — que às
   vezes é legítimo — teria levado R$ 1.908,80 para dentro da receita, calado.
5. ⚠️ **A natureza é resolvida num `left join lateral` ÚNICO.** Ela aparecia
   QUATRO vezes no corpo da view (em `e_bonificacao`, em `conta_metrica` e duas
   no CASE). Quatro cópias de uma regra fiscal são quatro lugares para divergir,
   e divergir aqui não dá erro: dá dinheiro contado diferente conforme a coluna.
   A ORDEM do coalesce importa — `n2.natureza_operacao` vem ANTES do
   `n2.raw_data`, que fica como rede para o dia em que o Bling mandá-la.
6. ⚠️ **A POSIÇÃO no `motivo_fora`:** depois de `bonificacao` e antes de
   `nf_invalida`/`aguardando_nf`. Remessa não tem nada de inválida, e
   "aguardando emissão" mandaria alguém emitir uma segunda.
7. **Cadastro, nunca CHECK**: natureza nova entra com um INSERT em
   `carbo_config_fiscal` sob chave `%natureza_sem_faturamento%`, sem deploy.
   ⚠️ Chave fora do padrão entra na tabela sem erro e **não é lida por ninguém**
   — cadastro que parece feito e não vale nada.

### ⚠️ Nota NOSSA e nota de TERCEIRO: o catálogo acusou, e eu quase errei o rótulo
Dia seguinte ao catálogo nascer, e ele já valeu: apontou as duas naturezas acima.
Eu classifiquei **as duas** como `sem_faturamento`. O CNPJ dentro da chave
referenciada desmentiu metade.

```
nossos CNPJs     36060692000100 (matriz) · 36060692000291 (filial)

000003 · 000005  →  36060692000100  NOSSA     15110656619  remessa   ✅ fica
000120           →  03793451000111  TERCEIRO  15109234302  devolução ❌ saiu
```

```
referencia nota NOSSA      a mãe é nossa e já faturou   remessa, entrega futura
referencia nota de TERCEIRO a nota é do fornecedor       devolução, retorno, conserto
```

1. ⚠️ **As duas saem do faturamento, e é por isso que confundi-las é caro.** O
   número ficaria certo e o `motivo_fora` diria `remessa_entrega_futura` para
   uma DEVOLUÇÃO — o mesmo rótulo mentindo que me fez recusar reusar
   `carbo_natureza_e_bonificacao` dois dias antes. **Rótulo errado com total
   certo não dá erro nenhum e é lido como fato meses depois.**
2. ⚠️ **O `delete` que eu ofereci primeiro apagava AS DUAS.** Ele teria levado a
   classificação certa junto com a errada, e o dono do processo não rodou porque
   não sabia o que era — acerto dele, não meu. Desfazer é cirúrgico: só a chave
   errada.
3. **Voltar para a lista de trabalho NÃO é regressão.** "Não classificado" é um
   estado honesto, e carregar o que ninguém decidiu é a função do catálogo.
4. ⚠️ **O que salvou foi ter medido o IMPACTO antes:** zero pedidos que contavam
   estavam nessas notas, então o faturamento ficou nos mesmos 1.297 /
   R$ 930.044,52 nas duas direções. Foi por caber tempo que deu para fazer a
   coisa certa em vez da conveniente. Sem a medição eu teria descoberto o erro
   pelo número mudando, e aí consertar é mexer em mês fechado.
5. ⚠️ **E o truque virou COLUNA, que é o ponto.** A pergunta que resolveu isto
   em uma consulta não podia ficar na cabeça de quem a fez:

```
carbo_nossos_cnpjs()                   derivado das posições 7..20 da chave
carbo_nf_referencia_nota_nossa(text)   true · false · NULL
suspeita_de_remessa                    APERTADO: exige nota nossa
suspeita_de_devolucao                  a segunda lista, outra decisão
```

6. ⚠️ **A lista de CNPJ é DERIVADA, nunca escrita no código.** Conta nova, CNPJ
   novo ou filial nova entram sozinhos ao emitir a primeira nota. Lista à mão
   seria mais uma cópia de cadastro, e divergir dela não daria erro — daria nota
   **nossa** classificada como de terceiro, calada.
7. ⚠️ **`null` NÃO é "terceiro".** Sem rodapé não há o que ler, e colapsar
   ausência em resposta é o `Math.round` inventando `×1`.
8. ⚠️ **Compara por CONTEÚDO, não por posição.** O rodapé é texto livre e o
   número da nota vem junto da chave (`NF 024.630: 2425 1203 ...`), então tirar
   os não-dígitos dá **50** dígitos e não 44 — corte por posição erraria. O
   risco aceito é um CNPJ de 14 dígitos coincidir dentro da tira, e o erro
   possível é no sentido de "achar que é nossa", que **mantém** a nota numa lista
   que alguém olha em vez de escondê-la.
9. ⚠️ **Coluna nova em `create or replace view` vai NO FIM** — no meio dá `42P16
   cannot change name of view column`. E `security_invoker = true` repetido.

⚠️ **PENDENTE, e é decisão fiscal do dono do processo:** `15109234302`
(1 nota, R$ 315,00, 15/12/2025) está em `suspeita_de_devolucao`. Se for
devolução, ela precisa de rótulo PRÓPRIO no `motivo_fora` — não do de remessa.
Não vale inventar um terceiro `when` antes de saber: R$ 315 em dez meses não
justifica adivinhar, e adivinhar é o que esta seção existe para não repetir.

### ⚠️ A remessa chegou e a nota de VENDA não — o aviso OPOSTO do que existia
Medido em 01/10/2026 no `V2026090001`: **R$ 2.600** (CarboPRO 100ml × 200, linha
**paga**), `fulfillment_stage = 'em_transporte'`, com a remessa de bonificação
`000940` vinculada e `bling2_nf_id` **nulo**. A carga saiu com nota de brinde e
sem nota de venda, e alguém moveu o card à mão passando por cima disso.

O aviso que já existia cobre *"tem item bonificado e falta a REMESSA"*. Mesma
dupla de notas, **faltas opostas** — um aviso só nunca ia pegar os dois.

1. ⚠️ **`temLinhaDeVenda` é a condição que importa, não "tem nota?".** Existem
   pedidos que NUNCA vão ter nota de venda: `BLING-21`, `BLING-61` e `BLING-72`
   são 100% bonificação, têm uma nota só e estão CERTOS assim (a `20260996` os
   deixou fora do faturamento de propósito). Sem essa condição o aviso piscaria
   nos três para sempre, e aviso que sempre pisca é aviso que ninguém lê — a
   doença do sininho com 70 itens.
2. ⚠️ **Mora no CARD, não na modal de etiqueta.** Aquela é de UMA etapa, e este
   pedido já tinha passado dela. Aviso que só aparece na etapa em que o erro
   ainda não aconteceu chega tarde.
3. **VERMELHO, não âmbar.** O aviso de cima é procedimento ("embale separado");
   este é documento fiscal faltando numa carga que pode já estar na rua. Mesma
   cor para as duas coisas faria a segunda ler como rotina.

### Nota sem pedido, pedido sem nota — e a lista que nasce MORTA
Pedido do dono do processo em 01/10/2026: *"verifica as nfs do bling 1 e 2, e os
pedidos que estão parados… verifica se tem nf fora que não está vinculada e
travando isso"*.

```
carbo_nf_sem_pedido    nota solta, com o veredito do porquê
carbo_pedido_sem_nota  a outra ponta, com o que poderia ser dela
carbo_nf_filial_vincular(text, bigint, text)   o vínculo manual
```

⚠️ **"Nota não ligada a `carboze_orders`" NÃO é "nota órfã".** A maioria
esmagadora das notas das duas contas é venda ON-LINE, que vive em
`bling_orders`/`bling2_orders` e nunca teve pedido nosso. Medido: **1.062 de
1.118** são `sem_codigo_no_rodape`. O que separa é o RODAPÉ — nota emitida pelo
NOSSO sistema carrega `V2026090081`.

⚠️ **E eu apliquei esse cuidado a UMA ponta só.** A fila de pedidos nasceu com
**1.108 linhas**, quase todas `BLING-*`/`BLING2-*` — pedido IMPORTADO, cuja nota
mora em `bling_orders.nf_bling_id`. O padrão denunciou sozinho: `BLING2-2 →
000027`, `BLING2-3 → 000028`, numeração sequencial e valor idêntico ao centavo.
A régua certa é a MESMA dos dois lados (`order_number ~ '^(V[0-9]{10}|…)$'`):
**a nota cita o pedido pelo NÚMERO dele**, então pedido com outro formato é
pedido que nota nenhuma consegue citar. Resultado: 1.108 → **54**.

1. ⚠️ **Nota EM VOO não é nota CANCELADA.** `Pendente` lida como cancelada fez a
   view dizer *"falta EMITIR"* para o `V2026090074`, cuja nota de R$ 6.900 estava
   sendo autorizada no mesmo minuto — e mandar emitir para quem acabou de emitir
   é como nasce a segunda nota do mesmo pedido. A régua JÁ EXISTIA na `20260813`
   (`carbo_nf_valida` **e** `carbo_nf_invalida`) e eu usei só a primeira; o que
   sobra entre as duas listas brancas é o balde `em_voo`, onde situação NOVA do
   Bling aparece em vez de ser classificada em silêncio.
2. ⚠️ **Unicidade dos DOIS lados.** A trava perguntava *"há uma nota solta para
   este documento?"* e nunca *"quantos pedidos disputam esta nota?"*. Medido: a
   NF 000107 (R$ 4.480) era oferecida a CINCO pedidos da M Construções e a
   000209 (R$ 28.000) a SEIS da Luck/NLAT — **onze pedidos, duas notas**. É o
   `count(distinct bling_id) = 1` do Melhor Envio aplicado pela metade. Disputa
   vira `AMBIGUO` e NÃO elege nenhuma: escolher enterraria a dúvida.
3. ⚠️ **VALOR não entra na régua** — casar por valor + data já ligou `Leandro
   Teodolino` a `Mauro Nishimoto` aqui. O valor aparece na saída para a pessoa
   CONFERIR, que é outra coisa.
4. ⚠️ **`carbo_nf_filial_vincular` tem TRÊS argumentos em produção** (`p_como`
   com default), e a migração no repo declara dois. E ela **recusa do SQL
   Editor**: ele roda como `postgres` sem JWT, `auth.uid()` é nulo e a guarda
   devolve `Sem permissão` — igual à `carbo_nfse_visao` voltar vazia por lá.
   Isso está CERTO; o caminho é a tela, ou um `update` que repita as travas
   (`bling2_nf_id is null`, situação lida AGORA, `bling_conta = 2` junto).

⚠️ **E o selo mentia ao lado do chip.** O `🧾 Liberado no Faturamento —
aguardando NF` lia só `fulfillment_stage`, então aparecia na mesma pilha do chip
`NF 000303`. **Destravar os cards não conserta isso** — o selo voltaria a mentir
no próximo pedido preso. Quando dois elementos da mesma pilha discordam, o
errado é o que não olhou o FATO.

⚠️ E a `20261027` destravou só a FILIAL porque a queixa daquele momento era
sobre a conta 2; os da MATRIZ ficaram presos — não por regra, por **recorte da
pergunta**.

### Entrega futura: o SALDO, e a mãe é DERIVADA
Confirmado pelo dono do processo: *"são duas notas mães"*. Dois contratos, cada
um com o próprio cronograma — a view agrupa por mãe e **nunca soma as duas**.

```
000232  BRISANET  R$ 55.380  6 remessas  R$ 27.690  saldo 27.690  50,00%
000234  BRISANET  R$ 21.840  6 remessas  R$ 10.920  saldo 10.920  50,00%
000247  CARBO     R$  1.930  1 remessa   R$  1.930  saldo      0  100%
000251  CARBO     R$  2.384  1 remessa   R$  2.384  saldo      0  100%
```

Os dois contratos na **metade exata** e a soma fechando com a contagem
independente das remessas: identidade, não semelhança. E as duas últimas são as
operações internas da natureza `15110656619` classificada no mesmo dia — a view
nasceu provando a decisão de três horas antes.

1. ⚠️ **A MÃE não é cadastro.** O caminho óbvio seria cadastrar a natureza dela
   ao lado da de remessa; seria pior. A mãe **se anuncia** — é a nota cuja chave
   as remessas referenciam. Derivar faz contrato NOVO aparecer sozinho, no dia
   da primeira remessa. Mesma decisão de `carbo_nossos_cnpjs()`. Só a natureza
   de REMESSA é cadastro, porque é ela que tira do faturamento.
2. ⚠️ **A chave casa por CONTEÚDO, nunca por posição.** Os rodapés reais trazem
   a chave em TRÊS formatos, e um deles põe o número da nota **com pontos** antes
   dela (`NF 024.630: 2425 1203 …`) — ancorar em `REFERENCIADA:` falha nesse caso
   **em silêncio**, devolvendo null como se não houvesse referência.
3. ⚠️ **A remessa não pode ser mãe de si mesma**: o rodapé contém a própria
   chave em alguns formatos, e sem o `is distinct from` o saldo se cancelaria.
4. **A aritmética que fecha é a conferência**: toda remessa válida em
   exatamente UMA mãe (14 = 14). Órfã e contada-duas-vezes passam caladas.
5. ⚠️ **O que isto NÃO responde:** qual pedido é qual parcela. As 14 vendas de
   R$ 1.820 são indistinguíveis por valor — o saldo diz quanto falta do
   CONTRATO, não a quem cada parcela pertence.

### ⚠️ "Parou de dar erro" pode significar "TROCOU de erro"
Três causas empilhadas sobre o MESMO sintoma (fila de natureza parada em 934), e
cada uma só apareceu quando a de cima saiu:

```
segredo errado no cron       401   20261036
fase ausente no PORTEIRO     400   bling2-auto-sync FASES
deploy ainda no ar           400   o cron disparou 30s depois do push
```

1. ⚠️ **O cron chama `bling2-auto-sync`, não `bling2-sync`.** Eu registrei a
   entidade `nfe_detalhe` no SEGUNDO (quem executa) e esqueci do PRIMEIRO (o
   porteiro) — e o aviso estava escrito DUAS LINHAS acima de onde eu devia ter
   mexido: *"Sem estar nesta lista, o auto-sync FILTRA a fase em silêncio"*.
2. ⚠️ **Segredo de cron se COPIA do banco, nunca se digita.** O valor é lido de
   um job que provadamente devolve 202 (`bling2-sync-incremental`), com `%L` em
   tudo — nunca impresso em consulta, nunca colado no chat. A conferência
   devolve BOOLEANO por job: `false` em mais de um é mais fonte muda levando 401.
   ⚠️ E o bloco **ABORTA** se não conseguir ler: reagendar com segredo nulo troca
   um job que falha ALTO por um que falha calado.
3. ⚠️ **Nesse ponto regerar backup de função é IMPOSSÍVEL** — as funções já não
   existem, `pg_get_functiondef` não tem o que devolver. A tabela é a ÚNICA
   cópia, e o conserto é `replace` no texto JÁ GRAVADO. **Rede que só funciona
   enquanto o que ela protege ainda existe não é rede.**
4. ⚠️ **`PUBLIC` não é um role com nome.** `role_routine_grants` o reporta como a
   string `PUBLIC` e `format('%I')` produz `"PUBLIC"` → `42704`. O `do` é
   atômico, então isso derrubou a recriação das DUAS funções com a view já
   republicada, e a busca global do Sales ficou fora do ar.
5. ⚠️ **Push em `main` deploya, e o cron não espera.** O deploy levou 89 s e a
   rodada do minuto seguinte pegou a função ANTIGA. Conferência feita antes do
   Actions terminar não mede nada — olhe o run, não o relógio.
6. ⚠️ **O número de ANTES envelhece em horas.** 1.302/R$ 940.937,41 num dia e
   1.303/R$ 941.094,52 no outro. Meça imediatamente antes.

⚠️ **E o padrão que se repetiu TRÊS vezes em um dia: metade do cuidado é zero
cuidado.** Filtro no lado da nota e não no do pedido (1.108 linhas);
`carbo_nf_valida` sem `carbo_nf_invalida` (nota em voo lida como cancelada);
unicidade de um lado só (uma nota oferecida a cinco pedidos). Nas três, a metade
que faltou era exatamente onde o erro morava.

### ⚠️ Republicar `carbo_vendas_metrica`: são TRÊS dependentes, e duas são FUNÇÃO
Pago duas vezes no mesmo dia (01/10/2026), e a segunda derrubou tela em
produção. O `CLAUDE.md` já dizia *"e `prorettype` para as funções `returns
setof`"* — eu perguntei só por `pg_depend` + `pg_rewrite`, que acha VIEWS.

```
carbo_vendas_nf_cancelada          view
carbo_vendas_busca(text, integer)  a busca global do Sales
carbo_pdv_pedidos(text)            os pedidos de um PDV
```

Esse erro é barato: `2BP01` aborta a transação inteira e nada muda. **E
`DROP ... CASCADE` continua fora de questão**, mesmo com o `HINT` do Postgres
sugerindo — cascade apaga as duas funções em silêncio e a busca do Sales sumiria
sem motivo aparente.

1. ⚠️ **NÃO transcreva corpo de função à mão.** Os dois são regex densos (`\s+`,
   `\D`, `\m`), e uma barra a mais quebra a busca de um jeito que nenhum build
   pega. O BANCO copia melhor: guarde `pg_get_functiondef` numa **tabela real**
   (não `temp` — o SQL Editor pode rodar cada bloco numa sessão diferente, e a
   temp levaria a única cópia) e reexecute com `execute`.
2. ⚠️ **Os GRANTS vão junto**, senão o PostgREST devolve "permission denied"
   para uma função que EXISTE. Casam por `specific_name` (= `proname || '_' ||
   oid`), nunca pelo nome — com sobrecarga o nome traz os grants da errada.
3. ⚠️ **`PUBLIC` não é um role com nome.** `role_routine_grants` reporta o
   grantee de um grant público como a string `PUBLIC`, e `format('%I')` a
   transforma em `"PUBLIC"` → `42704 role "PUBLIC" does not exist`. O `do` é
   atômico, então a falha no PRIMEIRO grant **derrubou a recriação das DUAS
   funções, com a view já republicada**: a busca global do Sales ficou fora do
   ar. Use `quote_ident` para role de verdade e a palavra crua para `PUBLIC`.
4. ⚠️ **E a lição é sobre a RECUPERAÇÃO, não sobre o `%I`:** nesse ponto regerar
   o backup é IMPOSSÍVEL — as funções já não existem, `pg_get_functiondef` não
   tem o que devolver e `role_routine_grants` não tem o que listar. A tabela é a
   ÚNICA cópia, e o conserto é um `replace` no texto JÁ GRAVADO. **Rede que só
   funciona enquanto o que ela protege ainda existe não é rede.**
5. ⚠️ **O número de ANTES envelhece em horas.** Medi 1.302 / R$ 940.937,41 num
   dia e 1.303 / R$ 941.094,52 no outro — entrou um pedido de R$ 157,11 no meio.
   Conferência contra número de ontem acusa diferença que não é a sua. Meça
   imediatamente antes.

### ⚠️ O Rastreio avança com a NF da FILIAL também
O gatilho `carboze_orders_nf_autostage` olhava SÓ `bling_nf_id` — é de
julho/2026, de quando só existia uma conta Bling, e o comentário dele dizia
"imune a por qual caminho a NF foi vinculada", o que era verdade na época.
Oito pedidos ficaram presos em "Gerar Nota Fiscal" com a nota já vinculada.

1. ⚠️ **Só a nota de VENDA avança o card.** `bling2_nf_bonificacao_id` está de
   fora de propósito: a remessa acompanha a carga mas não é o documento que
   libera a expedição, e a etiqueta carrega o número da nota de venda.
2. ⚠️ **Republicar a função não reprocessa o passado** — o gatilho é BEFORE
   UPDATE e reage à TRANSIÇÃO de nulo para preenchido, que já aconteceu. Precisa
   do `update` de destravamento, e ele exige `fulfillment_stage = 'gerar_nf'`:
   pedido que a logística já moveu à mão NÃO pode voltar.
3. **Um pedido pode ter DUAS notas** no mesmo pedido do sistema — uma de venda e
   uma de bonificação —, então o vínculo manual não pode recusar a segunda por
   já existir a primeira. Ele recusa **sobrescrever**, e diz qual nota já está
   lá. ⚠️ Isso só funciona porque a natureza da filial passou a ser reconhecida
   (`20261026`): sem isso a nota de bonificação caía no ramo de venda, encontrava
   a outra e era bloqueada — a recusa estava certa, a classificação é que não.

### ⚠️ A COMISSÃO tem definição PRÓPRIA de "pedido faturado"
`/comissionamento` não lê `carbo_vendas_metrica`. As duas RPCs
(`crm_comissao_agregado`, `crm_comissao_detalhe`) leem `carboze_orders` direto:

```sql
where o.vendedor_id is not null
  and o.bling_nf_id is not null          -- ⚠️ é ISTO que significa "faturado"
  and o.status not in ('quote','cancelled')
  and coalesce(o.excluir_metricas,false) = false
```

Consequência medida em 21/09/2026: a `20260981` tirou a bonificação do
faturamento e **não alcançou a comissão**. Nos quatro pedidos, a nota de
bonificação ocupa `bling_nf_id` — a coluna da nota PRINCIPAL —, e para a
comissão isso lê como venda faturada. Um deles comissionava de verdade
(`V2026090052`, Anderson Bruno, R$ 2.088,00); os outros três não têm vendedor.
Corrigido na `20260982`, com a MESMA regra nas duas funções.

1. ⚠️ **As DUAS, sempre.** O agregado alimenta os cartões e o detalhe vira
   `commission_statement_items` no fechamento. Filtrar só num faz o cartão e o
   extrato mostrarem números diferentes — e quem fecha o mês não sabe qual vale.
2. ⚠️ **`left join` no espelho de NF, nunca `join`.** A nota pode ainda não ter
   chegado ao espelho; join interno tiraria da comissão todo pedido cujo sync
   está atrasado. Aqui ausência tem de DEIXAR PASSAR — o oposto do CRON_SECRET,
   porque "fechar" aqui é não pagar quem vendeu.
3. **Só `bling_nfe` (conta 1)**, porque a função exige `bling_nf_id is not
   null`: pedido faturado só na filial nunca entra nessa base. Acrescentar
   `bling2_nfe` seria código morto disfarçado de cuidado.

⚠️ **PENDÊNCIA MEDIDA, não resolvida: a comissão paga sobre NF CANCELADA.** Ela
só testa se `bling_nf_id` está preenchido, nunca se a nota vale — enquanto o
faturamento tem `carbo_vendas_nf_cancelada` justamente para isso. Trocar a base
da comissão para a view resolveria os dois de uma vez, mas mexeria em comissão
já paga; é decisão do dono do processo, não efeito colateral de outra tarefa.

### Bling 1 também vende on-line (ML) — e a regra do Bling 2 NÃO serve aqui
Desde 28/08/2026 a matriz vende no Mercado Livre. O `bling-sync` **não gravava
`segmento`** — não errado: o campo não existia no insert. Canal nulo é
invisível para o `FILTRO_VENDA_DO_TIME` (`apps/crm/src/lib/vendaDoTime.ts`), que
só tira da tela o que é `segmento = 'online'` **E** sem vendedor. Resultado:
venda de marketplace aparecia no `/vendas` do vendedor, sem cidade e sem
vendedor, e somava no faturamento do TIME em vez de no do on-line.

⚠️ **Meu plano era copiar `loja ≠ 0 → online` do Bling 2, e a medição matou.**
Censo de `bling_orders.raw_data->'loja'->>'id'` em 21/09/2026:

```
0            176 ped.  R$ 437.217,80  numero_loja nulo   venda direta
206071309    145 ped.  R$ 398.081,88  numero_loja nulo   NAO e marketplace (PJ)
206071288     15 ped.  R$  43.078,40  numero_loja nulo   NAO e marketplace
206270703     19 ped.  R$   2.916,22  2000014753124269   Mercado Livre
206097294      2 ped.  R$     308,98  2000016905854286   formato de ML
206097284      1 ped.  R$      59,90  701-5334182-4091438 formato de Amazon
206093728     20 ped.  R$   3.059,91  100                nao classificada
```

`≠ 0` teria marcado **R$ 441 mil de venda da equipe** como on-line, sumindo com
ela da tela de quem vendeu. As duas contas numeram lojas do zero e têm cadastros
diferentes — "a regra que funciona lá funciona aqui" é a mesma suposição que já
custou caro com `bling_id` de produto e de contato.

A `20260983` faz o canal ser **DECLARADO** em `public.bling_lojas`:

1. **`e_online` tem TRÊS estados.** `true` vira `'online'`; `false` e `null` não
   mexem no canal — mas significam coisas diferentes: `false` é "olhei, não é",
   `null` é "ninguém olhou". Colapsar os dois faria loja nova nascer parecendo
   decidida, e é a loja nova que precisa aparecer na lista de trabalho.
2. ⚠️ **O lado seguro aqui é NÃO classificar.** Errar para on-line esconde venda
   do time da tela de quem a fez; errar para "não sei" gera ruído visível.
   Ruído se vê, venda sumida não. Por isso loja desconhecida segue como hoje.
3. **`bling_lojas_pendentes` parte de `bling_orders`, não do cadastro** — loja
   nova entra sozinha. Sem isso, canal novo repetiria este mesmo problema em
   silêncio.
4. ⚠️ **`raw_data` guarda o payload inteiro da listagem** (`raw_data: order`),
   então o id da loja **já está em todo pedido, inclusive nos antigos**. Não
   precisou re-sincronizar nada.
   ✅ **Histórico classificado em 21/09/2026** (`20260984`): 18 pedidos,
   R$ 2.766,72 — ago/26 −R$ 632,64 e set/26 −R$ 2.134,08, saindo do faturamento
   do TIME para o on-line. Total do canal ML na matriz: 19 pedidos /
   R$ 2.916,22.
   ⚠️ **Um deles já estava `online` antes**, e não foi a ponte: veio da herança
   de canal pelo histórico do CNPJ. É por isso que o backfill exige
   `segmento is null` — a mesma regra que a `20260814100000` já avisava ser
   OBRIGATÓRIA. Havia classificação viva nesses dados.
   ⚠️ E ele aborta se achar pedido **com vendedor**: marcar `online` tiraria a
   venda da tela de quem a fez. Medido: zero nos dois meses.
5. ⚠️ **O canal é gravado só no INSERT da ponte.** Regravar a cada rodada
   atropelaria classificação manual. E `null` ali é o valor certo: é ele que
   deixa `carbo_set_segmento_pdv` (BEFORE INSERT, só preenche quando nulo)
   continuar inferindo revenda pelo CNPJ.
6. **`bling-sync` está na lista `dep`** — o push em `main` deploya. A função é
   INERTE sem a tabela (`select` falha, `lojas` vem null, nada é classificado),
   então a ordem entre migração e deploy não quebra nada.

⚠️ **ML Full é outro canal, e não pode deduzir estoque.** Ao integrar a segunda
conta do Mercado Livre, ela precisa de `platform` PRÓPRIA em
`carbo_canal_estoque`, nascendo `ativo = false`: no Full a mercadoria já está no
galpão do ML, e quem tira da LogHouse é a REMESSA de reposição. Sob a mesma
chave `mercadolivre`, a venda e a remessa contariam a mesma saída duas vezes —
o erro de 31/08.

### ⚠️ Plataforma nova entra em TRÊS CHECKs, não um
Medido em 21/09/2026: acrescentei `mercadolivre_full` ao CHECK de
`ecommerce_orders`, presumi que era o único, e o bloco seguinte falhou com
`23514 … carbo_canal_estoque_platform_check`. São três tabelas, e **cada uma
falha num momento diferente**:

```
ecommerce_orders      ecommerce_orders_platform_check   o pedido nao entra    → na hora
carbo_canal_estoque   carbo_canal_estoque_platform_check o canal nao cadastra → na hora
sku_product_mappings  sku_platform_valida                o mapa nao salva     → MESES depois
```

⚠️ **A terceira é a perigosa.** Ninguém mapeia SKU no dia em que abre o canal: o
erro apareceria em Ops → Suprimentos → Mapeamento SKU, semanas depois, sem
ligação visível com a migração que o causou.

⚠️ E a busca certa procura pelo **VALOR**, não pelo nome da coluna — o nome do
constraint e o da coluna mudam de tabela para tabela:

```sql
select c.relname, con.conname, pg_get_constraintdef(con.oid)
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and con.contype = 'c'
  and pg_get_constraintdef(con.oid) ilike '%mercadolivre%'
order by 1;
```

⚠️ Ao reescrever o de `sku_product_mappings`, **mantenha `platform is null or …`**:
mapa com plataforma nula vale para TODAS as plataformas e foi ele que zerou 111
linhas órfãs de uma vez. Perder essa cláusula quebraria todo mapa genérico.

### Mercado Livre são DUAS contas — LogHouse e Full (21/09/2026)
`mercadolivre` = despacho NOSSO, sai da LogHouse. `mercadolivre_full` = a
mercadoria já está no galpão do ML.

**`platform` própria, não coluna de conta.** Todas as telas de e-commerce são
chaveadas por `platform` (`useDashEcommerce(platform, …)`, `PLATFORMS`,
`useMetaEcommerce`, mapas de taxa e rótulo); coluna de conta obrigaria a
agrupar por `(platform, conta)` em todas elas. ⚠️ O que se PERDE: o sistema
deixa de saber sozinho que os dois são o mesmo marketplace — somar "tudo que é
ML" exige listar as duas chaves. Numa terceira conta, reconsidere.

1. ⚠️ **O Full NÃO deduz estoque, e é essa a razão de ser canal separado.** A
   venda no Full não tira nada da LogHouse: quem tira é a REMESSA de reposição.
   Sob a mesma chave, venda e remessa contam a mesma saída duas vezes — o erro
   de 31/08. Nasce `ativo = false` **e** `deduz_a_partir_de` nulo em
   `carbo_canal_estoque` (duas travas independentes, de propósito).
2. ⚠️ **A taxa do Full é `null`, NUNCA o 0,16 do ML.** O Full cobra fulfillment
   além da comissão, e número plausível aparece na tela como comissão apurada —
   é literalmente o erro do `shopee: 0.12` que já foi corrigido. Entra pelo
   cartão "Comissão da Plataforma", que guarda a data de vigência.
3. ⚠️ **`MetaPlatform` é tipo PARALELO a `EcommercePlatform`**, e isso já mordeu:
   ao acrescentar o canal no `useDashEcommerce`, o `tsc` **não acusou nada** no
   `useMetaEcommerce` — as Metas ficariam sem o canal, caladas. Canal novo entra
   nos dois, na mesma tarefa, mais o `ROTULO_CURTO` do `EcommerceMetas.tsx`.
4. ⚠️ **A conta viaja no `state` do OAuth, nunca no `redirect_uri`.** O ML exige
   que o `redirect_uri` da troca de código seja idêntico ao do authorize;
   pendurar `?conta=` ali quebra a troca com erro genérico. E o padrão do
   `state` é a conta ANTIGA, para link já salvo não reconectar a conta errada.
5. ⚠️ **Guarda de vendedor duplicado no `saveTokens`.** Um app do ML aceita
   vários vendedores, então o mesmo `client_id` serve às duas contas — e nada
   impede autorizar a LogHouse na tela do Full. Sem a guarda, as vendas dela
   passariam a gravar como `mercadolivre_full`: canal errado e estoque deixando
   de ser deduzido. Sintoma: uma conta "parou de vender", a outra "dobrou".
6. **Checkpoint por conta** (`last_synced_at` em `system_tokens`, por `id`).
   Compartilhado, a conta que sincroniza primeiro avança o relógio da outra e a
   segunda perde a janela — pedido nunca buscado, sem erro.
7. **Conta não conectada não é erro**: o puller devolve `[]` e loga. Falhar ali
   derrubaria a rodada e levaria junto a conta que funciona.
8. **`ecommerce_pedido_raiz` não muda** — o Full cai no `else` (corte no 1º
   hífen), que já é a regra do ML. E `fonte: 'mercadolivre'` no rastreio também
   fica: ele identifica Mercado Envios, não a conta vendedora.
9. **Cor `#8B5CF6` (violeta), não um segundo amarelo.** Dois amarelos lado a
   lado leem como a mesma cor a um metro — a lição do laranja do `atendimento`
   contra o âmbar do Ops. Quem diz que os dois são ML é o RÓTULO.

⚠️ **PENDENTE e medido: a esteira só enxerga o Bling 2.** A coluna "Pago" vem de
`ecommerce_aguardando_bling` (lê a plataforma direto) e funciona para o Full
assim que ele sincronizar. O RESTO da esteira vem de `bling2_esteira`, que lê
`bling2_orders` — se o Full faturar no Bling **1**, o card fica preso em "Pago"
para sempre, exatamente como a Shopee. Decidir antes de prometer a tela.

### ⚠️ O `refresh_token` do ML é de USO ÚNICO — e isso derrubava a conta
Achado em 21/09/2026 a partir de um briefing externo, e **era um defeito vivo
com UMA conta só**. Cada renovação devolve um `refresh_token` novo e invalida o
anterior. Duas funções renovavam sem coordenação nenhuma:

```
ecommerce-sync   cron de 5 min, renova faltando < 5 min para expirar
ml-auth          renova a cada vez que alguém abre a tela de integrações
```

Lendo a linha antes de qualquer uma gravar, a segunda manda um token queimado e
recebe `invalid_grant`. ⚠️ E o desfecho era pior que a falha: o `ml-auth`
reagia **apagando a linha** (`// Refresh failed — mark as disconnected`). Uma
corrida de segundos desconectava a integração, e só voltava com OAuth manual.

A correção (`20260986` + `_shared/ml.ts`):

1. **Troca CONDICIONAL** (`ml_token_trocar`): o update só acerta a linha se ela
   ainda tiver o `refresh_token` que o chamador leu. Quem perde recebe `false` e
   **relê** — nunca tenta renovar de novo.
   ⚠️ Não é `advisory lock` de propósito: o lock exigiria manter uma transação
   ABERTA durante uma chamada HTTP ao ML, prendendo conexão do pool por dezenas
   de segundos — e isso só se descobre no dia do pico.
2. **Falha MARCA, nunca apaga** (`ml_conta_marcar_erro`). O `refresh_token` é a
   única coisa capaz de recuperar a conexão sozinha; apagá-lo troca "tente de
   novo" por "refaça o OAuth". E `invalid_grant` pode ser só a corrida — por
   isso o helper **relê antes de desistir**: se a linha já tem token novo e
   válido, não houve problema nenhum.
3. **`reauth_required` existe para PARAR de tentar.** Sem esse estado, conta com
   refresh morto bate na API a cada 5 min para sempre e o log vira ruído que
   ninguém lê — o mesmo mecanismo que escondeu o `CRON_SECRET` ausente por 25 h.
4. **Uma implementação só do refresh**, em `_shared/ml.ts`. Duas eram o defeito.
5. **`ml-token-refresh` (cron 30 min, janela de 90 min)** para o token não
   depender do sync estar rodando. Antes, sync parado = token vencendo calado, e
   o diagnóstico virava duplo: "por que o sync parou" e "por que desconectou",
   sendo a segunda consequência da primeira.

### ⚠️ "Nunca tentou" e "a API recusou" tinham a MESMA cara
Primeiro dia do ML Full (21/09/2026): a conta recém-conectada aparecia com
`last_synced_at` **nulo** e `last_error` **nulo**, e eu li isso como falha de
integração. Não era — ela tinha conectado 38 s DEPOIS da rodada das 15:15, e
simplesmente ainda não tivera um ciclo. Na rodada seguinte sincronizou.

⚠️ **O erro de método foi comparar um retrato contra um relógio que eu não
tinha.** Só vejo o que é colado no chat; `now()` tem de vir na MESMA consulta,
senão "o carimbo está em 15:15" vira "está congelado desde 15:15" sem base.

Mas o susto expôs um defeito verdadeiro: `pullMercadoLivre` fazia `return []`
mudo quando a API recusava, e o `marcarSync` fica no FIM da função — então
falha de API deixava exatamente os mesmos dois nulos. **Ausência disfarçada de
resposta**, a doença do `Math.round` inventando `×1`. Hoje o erro grava
`last_error` na conta, com `p_fatal: false` (429/500/rede não pedem OAuth
manual — só `invalid_grant`, e quem decide isso é o `getMlToken`).

**A prova de que a API respondeu é o próprio `last_synced_at`**: ele só é
gravado depois da chamada dar certo. Carimbo preenchido ⇒ o ML respondeu.

### `ml_accounts` — multi-conta, e por que NÃO uma coluna em `ecommerce_orders`
`system_tokens.id` é chave de texto com uma linha por plataforma. Conectar a
segunda conta pelo fluxo antigo **sobrescrevia a primeira**, calada.

⚠️ A proposta alternativa (manter `platform = 'mercadolivre'` e distinguir por
`seller_account`) **quebra o estoque**: `carbo_canal_estoque` é chaveada por
`platform`, então a venda do Full deduziria da LogHouse — e como a REMESSA
também deduz, a mesma saída contaria duas vezes (o erro de 31/08). Para ela
funcionar, `carbo_canal_estoque`, `carbo_estoque_consumo`, o ensaio e o estorno
teriam TODOS de virar `(platform, seller_account)`.

A síntese: `ml_accounts` governa CONTA e TOKEN; `platform_key` (UNIQUE) liga
cada conta ao CANAL que o resto do sistema já entende.

1. ⚠️ **`ml_accounts` NÃO tem policy de SELECT para `authenticated`.** Ela
   guarda `access_token` e `refresh_token`: qualquer leitura ali entregaria a
   credencial do ML pelo PostgREST — e lojista e licenciado usam a MESMA tabela
   `profiles`. O front lê `ml_accounts_public`.
2. ⚠️ **A view lista as colunas UMA A UMA, nunca `select *`.** Com `*`, coluna
   de credencial criada amanhã entra sozinha e vaza sem ninguém escrever código.
3. **A migração só LÊ `system_tokens`** — a linha antiga fica como rollback — e
   o `_shared/ml.ts` tem **reserva** para ela. Assim a ordem entre rodar a
   migração e fazer o push não desconecta nada.
   ⚠️ Mas a reserva **não renova**: renovar ali seria a segunda implementação do
   refresh outra vez. Token vencido nessa janela significa "rode a migração", e
   o log diz isso com essas palavras.
4. **`on conflict do nothing` na cópia**: rodar de novo não sobrescreve um token
   já renovado pelo código novo com um mais velho da tabela antiga. Migração
   idempotente que anda para trás é pior que migração que falha.

⚠️ **Criar a tabela nova é METADE do trabalho — a outra metade é quem lia a
antiga** (medido em 21/09/2026, `20260992`). A aba ML Full mostrava
**"Aguardando integração"** com 13 vendas e R$ 1.944 exibidos logo abaixo, na
mesma tela. `platform_connection_status` é view sobre `system_tokens`, e a conta
Full **nunca passou pelo fluxo antigo** — sem linha lá, a plataforma não aparece
na view, e o front lê **ausência como desconectado**. A LogHouse não expôs isso
porque a linha velha dela continua existindo.

1. ⚠️ **O ramo antigo passou a EXCLUIR o que já está em `ml_accounts`.** Sem
   isso o `mercadolivre` viria nos dois ramos, e duplicata não deixa o selo
   errado — faz o `maybeSingle()` do front devolver **erro**, e o selo some nos
   DOIS canais de ML de uma vez. É o mesmo `where not exists` da `20260964`,
   na direção oposta.
2. ⚠️ **`status` entra na conta, não só o token.** `reauth_required` tem
   `access_token` ainda dentro da validade e está morta — o `refresh_token` é
   que queimou. Olhar só o token diria "Conectado" até o access vencer, que é
   exatamente o engano das 20 h de 401 da `20260954`.
3. ⚠️ **A view roda como DONO de propósito, e isso virou garantia.**
   `ml_accounts` não tem policy de SELECT para `authenticated` porque guarda
   credencial; é por rodar como dono que a view consegue lê-la. Por isso ela
   lista as colunas **uma a uma** — com `select *`, coluna de credencial criada
   amanhã entra sozinha. Ligar `security_invoker` aqui esvaziaria o selo para
   todo mundo (ver `20260954`/`20260964`).

⚠️ **Canal novo nasce SEM HISTÓRICO, e o card para sem erro nenhum** (medido em
21/09/2026). Sete cards do ML Full ficaram em "Confirmado" por até 24 dias —
28/08 a 12/09 — enquanto os outros 14 andavam normalmente. Não era a esteira: o
`ecommerce_orders` do Full **começava em 14/09**, que é quando a conta foi
conectada. Sem linha na plataforma, o CTE `plataforma` não casa, o card não tem
o que o mova, e fica. É o mesmo mecanismo da Shopee, com outra origem.

⚠️ **"Não tem linha" e "tem linha e está `paid`" têm a MESMA cara na tela** e
pedem coisas opostas — uma é buraco de sincronismo, a outra é o ML ainda não ter
despachado. A consulta que separa é um `left join` de `bling2_esteira` com
`ecommerce_orders` por `platform_order_number`, contando `sem_linha`. Medido: 7
sem linha, 3 legitimamente `paid`.

A correção é **rebobinar o checkpoint da conta**, sem deploy e sem código:

```sql
update public.ml_accounts set last_synced_at = '<data>'
where platform_key = 'mercadolivre_full';
```

✅ Resultado: 14 → 21 pedidos, e os cards se redistribuíram sozinhos
(confirmado 10 → 4, em_transito 7 → 8, entregue 4 → 9, `sem_linha` a zero).

1. **Ele se restaura sozinho**: o `pullMercadoLivre` grava `last_synced_at =
   now()` no fim da própria rodada. Não há o que desfazer.
2. ⚠️ **O teto é de 30 dias** (`maxLookback`), então isso NÃO recupera canal
   parado há mais tempo — ali seria paginação por data, outro caminho.
3. ⚠️ **Sem rajada de notificação**: `trg_ecommerce_sale_notify` tem janela de
   12 h sobre `ordered_at`, então pedido antigo não toca som nem enche o
   sininho — que é ×30 pessoas. Conferir essa janela é **obrigatório** antes de
   rebobinar qualquer canal; num canal sem essa guarda, o backfill vira spam.
4. ⚠️ **Sem dedução de estoque** porque o Full tem `ativo = false` e
   `deduz_a_partir_de` nulo. Num canal que DEDUZ, rebobinar o checkpoint baixa
   o histórico inteiro de uma vez — é o erro de 31/08 esperando acontecer.
5. ⚠️ **`/orders/search` é chamado SEM paginação** (teto de 50 pedidos do ML).
   21 cabe; canal com mais movimento perde o excedente **em silêncio**. Ao
   rebobinar, confira se a contagem fecha com o esperado.

⚠️ **A grade real de cron tem 29 jobs** (conferida em 21/09/2026 por
`select … from cron.job`) e a tabela de "Cadência" acima lista só parte dela.
Dois que faltavam e importam: **`bling-sync-morning 0 10 * * *` e
`bling-sync-afternoon 0 16 * * *`** — ou seja, **o Bling 1 sincroniza DUAS VEZES
POR DIA**. Toda NF de ML que chega pela matriz (inclusive a classificação de
canal da `20260983`) tem até 6 h de atraso. Não é defeito: era um sync de
faturamento. Vira defeito no dia em que alguém esperar a esteira ao vivo a
partir dele.

### Duas contas Bling na emissão — matriz e filial SP
`bling-sync` emite nas DUAS contas. O mapa `CONTAS` (no topo da função) resolve
tabela de apoio, token, natureza e colunas de destino por conta. Bling 1 =
matriz, Bling 2 = filial SP.

1. **Um mapa, nunca `if (conta === 2)` espalhado.** Cada conta tem catálogo de
   produtos, cadastro de contatos e naturezas próprios, e as duas numeram do
   zero — `bling_id` de uma não significa nada na outra. Tabela esquecida = NF
   com o produto (ou o cliente) de outra empresa.
2. **`external_ref` leva o prefixo da conta** (`bling-` / `bling2-`). É o que
   impede a ponte do Bling 2 de reimportar o pedido faturado em SP como pedido
   NOVO, com valor cheio — duplicaria faturamento dentro do cron, sem log.
   O gatilho `carbo_bloqueia_remessa_bonificacao` é o cinto disso.
3. **A NF da filial vai para colunas PRÓPRIAS** (`bling2_nf_id` etc.), nunca em
   `bling_nf_id`. Já foi tentado e revertido: `carbo_vendas_metrica` junta
   `bling_nfe` por esse id, e um id da conta 2 casaria com nota real da conta 1
   — nota cancelada de uma empresa derrubando venda da outra.
4. **O casamento da filial é por ID EXATO**, não regex: as notas da conta 2
   chegam com observação vazia. Caminho: `external_ref` → `bling2_orders` →
   `nf_bling_id` → `bling2_nfe` (`carbo_vincula_nf_filial`, cron 5 min).
   Depende do `bling2-order-details-10min`, que é quem traz `raw_detalhe`.
5. **A conta é sempre EXPLÍCITA**, no front e no servidor. Errar emite no CNPJ
   errado, e só se desfaz com cancelamento depois de o documento circular.

### NFS-e Nacional (ADN gov.br) — nota de serviço, emitida E recebida
Pedido do dono do processo em 23/09/2026: *"preciso integrar o portal nacional
com o sistema, fica no finanças igual com o bling"*, com as duas pontas.

```
supabase/functions/nfse-nacional      sonda + ingestão (o ÚNICO que escreve é ?ingerir=1)
carbo_nfse_dfe                        o log CRU, append-only, uma linha por NSU
carbo_nfse_notas / _eventos           leitura do XML (xpath com namespace do SPED)
carbo_nfse_visao                      papel + cancelamento + par de substituição
carbo_nfse_eventos_tipos              lista de trabalho: tipo de evento desconhecido
carbo_nfse_sync_log · _saude          a rodada, inclusive quando FALHA
apps/financas/src/pages/integracoes/NfseNacional.tsx    /integracoes/nfse
cron `nfse-nacional-1h`  13 * * * *
```

⚠️ **NÃO é webhook — é NSU, e isso muda tudo.** O ADN guarda uma fila por
interessado e devolve o que veio DEPOIS do número pedido. Quem guarda o último
lido é a gente, e aqui isso é `max(nsu)` do próprio log: tabela de checkpoint
à parte criaria o par que diverge, mudo nos DOIS sentidos — atrás reprocessa,
à frente **pula documento para sempre**.

⚠️ **A autenticação é o CERTIFICADO A1** (mTLS), não chave de API.
`NFSE_KEY_PEM` é a chave privada **sem senha** — quem a tem assina documento
fiscal no CNPJ da empresa. Ela mora só em Supabase → Edge Functions → Secrets.
O Deno não abre chave cifrada, e o sintoma disso é erro de TLS genérico que
manda procurar no ADN em vez de aqui; por isso a função testa `ENCRYPTED` e
recusa dizendo o que fazer.

Seis coisas que o XML REAL desmentiu, e cada uma mudou o desenho (medidas em
23/09 antes de existir qualquer tabela — foi para isso que a sonda existiu):

1. ⚠️ **O EVENTO não diz de quem é a nota.** Só tem `CNPJAutor` e `chNFSe` —
   sem `emit`, sem `toma`. Ele não se julga sozinho; só ganha sentido ligado à
   NFS-e pela chave. Logo, evento cuja nota não chegou é ÓRFÃO e é guardado
   assim mesmo (`carbo_nfse_eventos_orfaos`). Descartá-lo deixaria a nota
   valendo na tela depois de cancelada.
2. ⚠️ **`ChaveAcesso` NÃO é única** — o evento repete a chave da nota. Quem
   identifica a linha é o NSU. Índice único na chave recusaria o cancelamento.
3. ⚠️ **NSU não é ordem de emissão**: o NSU 1 é nota de fev/23 que o ADN gerou
   em mai/23. Checkpoint por DATA pularia documento antigo que chega hoje.
4. ⚠️ **Nome não identifica a empresa, CNPJ sim.** O `toma` vem com a razão
   social ANTIGA (`PPDB ASSESSORIA ADMINISTRATIVA LTDA`) enquanto o certificado
   diz `CARBO SOLUCOES LTDA` — e não é histórico: um fornecedor emitiu assim em
   **21/09/2026**. Mesma lição já paga no cadastro de PDV.
5. ⚠️ **São DOIS valores**: `vLiq` (líquido da nota) e `vServ` (do serviço).
   Divergem em **7 das 696**, com R$ 6.541,77 de retenção — coincidem no resto,
   e é a coincidência que convida a unificá-los, como no
   `display_units_per_pack`. Ficam separados.
6. ⚠️ **`ambGer` não separa produção de teste** (1 numa nota, 2 num evento, as
   duas com `TipoAmbiente: PRODUCAO`). Quem responde isso é o ambiente da
   CONSULTA.

⚠️ **São TRÊS tipos de evento, e DOIS cancelam.** Censo de 23/09:
`CONFIRMACAO_TOMADOR` 31 · `CANCELAMENTO` 27 · `CANCELAMENTO_POR_SUBSTITUICAO`
8. A primeira versão só conhecia o segundo — **8 notas apareciam válidas depois
de canceladas**, sem erro nenhum, e a mais recente era **do mesmo dia**.

O sinal que denunciou foi uma **aritmética que não fechou**: 66 eventos para 27
notas marcadas. Dois números que deveriam bater e não batiam. Sem essa
conferência a tela nasceria mostrando nota cancelada como boa.

⚠️ **Lista BRANCA explícita** (`carbo_nfse_evento_cancela`), nunca "tudo que não
é CONFIRMACAO_TOMADOR": a regra negativa faria tipo de evento novo cancelar nota
sozinho, calado — a lição de `cancelado_na_loja`. Tipo desconhecido não faz nada
e aparece em `carbo_nfse_eventos_tipos` com `conhecido = false`.
⚠️ E `CONFIRMACAO_TOMADOR` é o **oposto** de cancelamento; tratá-lo como um
inverteria o significado de 31 notas boas.

⚠️ **O erro da substituição era DUPLA CONTAGEM, não "contar algo cancelado".**
Substituição gera nota NOVA, e o ADN entrega as duas: a view antiga somava o par.
Medido — 6 das 8 tinham a substituta na base:

```
dupla contagem real      R$ 32.005,84   (o mesmo serviço, duas vezes)
cancelada sem substituta R$ 10.951,50   (1543 e 1544, de 16/04)
                         ────────────
                         R$ 42.957,34
```

⚠️ **O elo NÃO está no evento** — está na nota SUBSTITUTA, em `subst/chSubstda`,
apontando para trás. A alternativa seria casar por valor + data, que é lixo já
medido neste projeto (ligou `Leandro Teodolino` a `Mauro Nishimoto`).
⚠️ O xpath é `//n:subst`, não caminho fixo: o schema é nacional, mas cada
prefeitura preenche o que usa, e caminho fixo errado devolve null **sem erro** —
a coluna ficaria vazia parecendo "não houve substituição".

⚠️ **Emitida e recebida se comportam DIFERENTE na substituição** (medido):
emitida mantém o valor (5.000→5.000, 400→400) — corrige dado; recebida **abaixa**
(22.121,00→20.193,00 · 884,84→807,72), R$ 2.005,12 a menos em duas notas de
fornecedor. **Se alguém pagou o valor original, pagou a mais** — pendente de
cruzar com o contas a pagar.

⚠️ **As EMITIDAS só existem a partir de 07/01/2026**; as recebidas vão a
03/02/2023. Não é a empresa que não faturava — é quando ela passou a emitir pelo
sistema nacional. A tela AVISA isso ao filtrar ano anterior, porque zero se lê
como "não vendemos" e não como "o dado não existe no portal". Consequência: esta
tela **não serve** para comparar faturamento de serviço ano a ano.

Outras decisões que não se desfazem sem entender:
1. **Guarda o CRU, interpreta na LEITURA** (molde do `conta_metrica`): corrigir
   um entendimento é republicar view, sem rebuscar nada no gov.br — e o ADN
   entrega por NSU, que é justamente o que ele não facilita.
2. ⚠️ **HTTP 404 do ADN é FIM DA FILA, não falha** (`NENHUM_DOCUMENTO_LOCALIZADO`
   / `E2220` no corpo). Tratá-lo como erro geraria 24 linhas de erro por dia num
   log que existe para ser olhado quando algo quebra — o mecanismo que escondeu
   o `CRON_SECRET` ausente por 25 h. E o que separa isso de "o endereço mudou"
   é o CORPO, nunca o status.
3. ⚠️ **Teto de 20 lotes por rodada.** Não é medo de laço: a fila tem anos de
   histórico e o ADN pune consulta repetida. A fila se completa sozinha nas
   rodadas seguintes.
4. ⚠️ **Próximo NSU = o MAIOR do lote**, nunca `nsu + lote.length`: o ADN pula
   números, e somar o tamanho travaria o ponteiro antes do buraco — a integração
   pararia de avançar sem erro nenhum.
5. **`xml_ok`, não coluna do tipo `xml`**: documento malformado abortaria o lote
   e travaria o NSU naquele ponto, calado. Ele entra, sai das views, e é
   ANUNCIADO no cartão de saúde.
6. **`on conflict do nothing`**, nunca `do update`: documento fiscal não é
   reescrito; correção vem como evento, em linha nova.
7. ⚠️ **RLS: SELECT só para o time interno, e NENHUMA policy de escrita.** A nota
   traz CNPJ, endereço e telefone; o portal de lojas e o de licenciados usam a
   MESMA `profiles`. Quem grava é a service role, que passa por cima da RLS —
   sem policy não existe caminho pelo PostgREST para forjar documento fiscal.
8. ⚠️ **`carbo_nfse_cnpj()` é SECURITY DEFINER** pela razão da
   `carbo_natureza_e_bonificacao`: em invoker, quem não lê `carbo_config_fiscal`
   veria TODA nota como `indefinido` e o total mudaria conforme quem olha.
9. **`papel` tem TRÊS estados** — `indefinido` aparece. Colapsá-lo em "recebida"
   (o palpite natural) inventaria nota de fornecedor a partir de ausência. Hoje
   é zero em 696, e foi essa medição que autorizou confiar na régua.
10. ⚠️ **`lerTudo` desde o primeiro dia**, com 696 linhas — abaixo do teto de
   1.000 do PostgREST. São ~700 notas/ano: cruza em meses, e o defeito dessa
   família é invisível até cruzar.
11. **Nota cancelada sai do TOTAL mas FICA na lista.** Escondê-la faria o número
   fechar e a conferência ficar impossível — a razão de o usuário bloqueado não
   sumir da tela de Usuários.

⚠️ **O parse do XML é MATERIALIZADO** (`carbo_nfse_notas_mat`,
`carbo_nfse_eventos_mat`), e isso corrigiu um timeout real: com 697 notas a
tela dava `canceling statement due to statement timeout`. A conta que eu não
tinha feito ao defender "interpreta na leitura": ~20 `xpath` × 697 notas é
~14 mil parses por abertura, **mais** três `left join lateral` sobre uma view
que também parseia XML — reavaliada POR LINHA. É a família dos tetos
silenciosos daqui (`lerTudo`, o `.limit(200)` do chat): funciona até o volume
cruzar. Na sonda eram 50 documentos e era instantâneo.

Isso **não revoga** a regra: o guardado continua sendo o XML CRU e a
interpretação continua DERIVADA. Mudou o MOMENTO — na ingestão, não a cada
clique. O que se perde: a correção só vale depois de `carbo_nfse_atualizar()`,
e por isso o `carbo_nfse_gravar_lote` o chama **quando grava algo** (o cron é
de 1 h e quase sempre volta vazio; recalcular à toa pegaria o lock por nada).

⚠️ **MATVIEW NÃO TEM RLS nem aceita `security_invoker`.** Grant ali é
vazamento direto pelo PostgREST — CNPJ, endereço e telefone de fornecedor para
o portal de lojas e o de licenciados, que usam a MESMA `profiles`. Por isso as
matviews não têm grant nenhum, e as views de leitura **rodam como DONO** e se
guardam no próprio `WHERE` com `carbo_e_time_interno()` — molde de
`carbo_usuarios_bloqueados` e `ml_accounts_public`. É o INVERSO do que valia
antes nesta mesma integração, e inverter sem entender reabre o furo.

⚠️ **E os `lateral` leem as MATVIEWS, não as views.** View sobre view faria a
guarda ser avaliada por linha — exatamente a reavaliação que causou o timeout.

⚠️ **Consequência prática: `carbo_nfse_visao` volta VAZIA no SQL Editor**, e
isso NÃO é defeito. O editor roda como `postgres`, sem JWT, então `auth.uid()`
é nulo e a guarda devolve false. Para conferir por lá, pergunte à matview
(`carbo_nfse_notas_mat`), que o editor lê como dono. Confundir isso com "a
integração quebrou" é meia hora perdida.

⚠️ **`refresh` SEM `concurrently`**: função plpgsql já é uma transação, e o
`concurrently` é recusado dentro de bloco transacional. O índice único existe
assim mesmo, para o dia em que valer chamar de fora de uma função.

⚠️ **O menu do Finanças tem DOIS lugares, igual ao do Ops** — e eu caí nessa no
mesmo dia em que escrevi a regra para o Ops. Rota nova precisa de
`src/lib/financasNav.ts` (ícone e rótulo) **e** da lista de grupos em
`src/components/Layout.tsx`, que é quem realmente monta o menu. Só o primeiro:
a tela existe, a rota responde, o build passa — e **ninguém a encontra**. Foi o
que aconteceu com a `/integracoes/nfse`.

⚠️ **PENDENTE:** a raiz (`controle`) tem `/admin/nfse` com importação MANUAL de
XML (`nfse_imports`). Agora há duas telas sobre nota de serviço, com conjuntos
diferentes — nenhuma com defeito, e é o caso conhecido de duas telas discordando
sobre o mesmo dado. Decidir qual manda antes que alguém feche um mês por uma.

### ⏸️ CarboVAPT emitir NFS-e pelo DPS — PAUSADO em 02/10/2026, e por quê
Pedido do dono do processo: *"os pedidos de carbovapt no sistema não são como os
de carbozé/carbopro… quando for carbovapt não deve ir para o rastreio de venda,
ele deve apenas gerar no carbohub finanças para gerar a nf, mas essa nf não é no
bling, é a nf do portal nacional"*, e depois, mais estreito: *"o botão emitir no
portal nacional mande todos os dados preenchidos que já estão no sistema para o
usuário apenas confirmar no portal nacional e emitir a nf, preciso disso apenas,
nada a mais / além de enviar o rodapé com o número da venda e nome do vendedor
para fazer o cruzamento"*.

**Pausado porque o gov.br está com erro e não está sendo possível emitir NF.**
Retomar com o serviço de pé — ver "o que falta medir" no fim.

```
supabase/functions/nfse-dps-teste/index.ts                     a sonda (JÁ NO AR)
supabase/migrations/20261040000000_chamar_a_sonda_do_dps_pelo_sql_editor.sql
                                                   como disparar pelo SQL Editor
```

⚠️ **A ORDEM DAS FASES FOI CORRIGIDA PELO DONO DO PROCESSO, e ele estava certo:**
*"não teríamos que validar se é possível a fase 4 antes de fazer o restante? pq
se o 4 não for possível, o 1 ao 3 é desnecessário"*. Assinar o DPS é a pergunta
BINÁRIA e barata; tela, botão e cruzamento só existem se ela der sim. Eu tinha
montado da ponta errada.

⚠️ **O que NÃO se mexe enquanto isso: o CarboZé funciona como está.** Eu li
*"meu sistema já funciona"* como se valesse para os dois e ele corrigiu — *"eu
falei que funciona para o carbozé… realmente o carbovapt não funciona como está,
pq como está não funciona, se não eu não ia fazer isso"*. As 6 vendas de serviço
(R$ 50.400) estão `conta_metrica = false` com `motivo_fora = aguardando_nf`,
esperando uma NF do **Bling** que nunca vai sair — a nota delas é NFS-e.

#### O que JÁ está medido, e não precisa ser remedido
1. **A forma do `infDPS` veio do GABARITO, não de manual.** O ADN embute o DPS
   ORIGINAL dentro da NFS-e que devolve, então o `carbo_nfse_dfe` já tinha um
   DPS que o Sistema Nacional ACEITOU, do nosso CNPJ, para o serviço certo.
   Dali: `cTribNac 140101`, `cNBS 120013110`, `cLocEmi 2408102` (Natal),
   `regTrib` do Simples (`opSimpNac 3 · regApTribSN 1 · regEspTrib 0`) e — o que
   eu jamais teria adivinhado — o bloco **`IBSCBS`** da reforma tributária, hoje
   obrigatório. Sem ele a rejeição seria por schema, sem dizer o que falta.
2. ⚠️ **O `Id` tem forma fixa**, confirmada contra nota real:
   `DPS + município(7) + tipoInscrição(1) + CNPJ(14) + série(5) + nDPS(15)`.
3. ⚠️ **`infoCompl/xInfComp` mora DENTRO de `<serv>`, depois de `<cServ>`** — e
   já é usado para o pedido do cliente (`"Pedido 4500787362"`) e texto de CPOM.
   O rodapé do cruzamento **ACRESCENTA**, nunca substitui.
4. ⚠️ **`ja_citam_o_pedido = 0` nas 353 notas nossas.** Nenhuma NFS-e emitida até
   hoje cita o número da venda — é por isso que o cruzamento precisa ser
   construído, e não descoberto.
5. **Série 90000, NÃO a 70000 do emissor web.** `nDPS` é sequencial POR SÉRIE:
   usar a mesma faria o nosso contador competir com o de quem digita no portal,
   e duas fontes incrementando o mesmo número é nota duplicada no pior caso.
6. ⚠️ **Eu quase construí a assinatura com os algoritmos do GOVERNO.** Medi
   `exc-c14n#WithComments` + `rsa-sha256` no XML devolvido — e aquilo é a
   assinatura **do ADN** (cert CN `APP10853.PRODUCAO.NFSE.GOV.BR`, SERPRO): ele
   REMOVE a do contribuinte e põe a dele. O manual do contribuinte pede c14n
   **INCLUSIVA** (`REC-xml-c14n-20010315`). **Medir a coisa certa e ler como se
   respondesse outra pergunta é o erro mais barato de cometer e o mais caro de
   descobrir.**
7. ⚠️ **O hash é a ÚNICA coisa que não consegui medir** — NF-e/CT-e usam SHA-1
   historicamente, o ADN usa SHA-256, os dois são plausíveis. Por isso `algo`
   é PARÂMETRO e a sonda testa os dois: quem responde é a rejeição, não a minha
   opinião.
8. **O XML é gerado JÁ CANÔNICO**, com o `xmlns` MATERIALIZADO no `infDPS`. Não
   existe C14N pronto no Deno e canonicalização genérica erra em silêncio
   (digest diferente, rejeição que não diz onde) — gerando eu o XML, a
   canonicalização vira quase identidade.

#### Os três erros de rede, em ordem, e o que cada um PROVOU
```
1  endpoint requires HTTP/1.1              o Deno negocia h2 por ALPN; o SEFIN só fala 1.1
2  Connection reset by peer (os error 104) depois de http1: true, http2: false
3  ← e é AQUI que paramos
```
⚠️ **O erro nº 1 provou QUATRO coisas funcionando**, e é por isso que ele vale
mais que um sucesso vago: a `etapa` foi `fetch` e não `assinar`, e o erro é de
PROTOCOLO e não de TLS. Logo a `NFSE_KEY_PEM` está em PKCS#8 e importou, o
`SignedInfo` foi assinado, o cliente mTLS subiu e o **handshake TLS COMPLETOU**
com `189.9.67.145:443` — certificado recusado teria vindo como erro de TLS.

⚠️ **E o nº 2 NÃO está interpretado — essa é a pendência.** `Connection reset`
tem TRÊS causas com a MESMA cara (certificado recusado · caminho que não existe
· corpo do POST) e agora uma QUARTA: **o gov estar fora**, que é o que foi
informado no mesmo dia. Chamar o reset de "a nossa assinatura está errada" seria
inventar resposta a partir de ausência — a doença do `Math.round` inventando
`×1`.

#### ⚠️ A minha consulta de conferência ENTERROU a resposta, e isso é lição
`select … from net._http_response order by created desc limit 4`, **sem filtro**,
trouxe os quatro crons de minuto (`kanban-n8n`, `whatsapp-meta`,
`bling2-auto-sync`) e a resposta da sonda nunca apareceu. Quatro `200` que não
tinham nada a ver com a pergunta. **Resposta plausível sobre a coisa errada é
pior que resposta nenhuma.** Hoje filtra pela URL, com `left join
net.http_request_queue` (a tabela de resposta não guarda a URL).

#### O que falta medir ao RETOMAR, e já está pronto para rodar
`{"diagnostico": true}` roda 12 casos numa chamada só, e o que os torna
mensuráveis são os CONTROLES — sem eles o reset não prova nada:
```
A  CONTROLE+   adn/contribuintes/DFe/0 GET com cert   ← o que JÁ funciona
B  CONTROLE-   o mesmo, SEM cert                      ← o par que isola
C/D/E          o host do DPS fala HTTP com o cert?
F/G/H          o POST que reseta: corpo cheio / {} / sem cert
I/J/K/L        variações de CAMINHO e de HOST
```
**A leitura não é "qual deu 200" — é o PADRÃO:**
```
A responde e C/F resetam      o cert está OK; é host, caminho ou corpo
A resetar também              é a rede do Supabase OU o gov fora — nada abaixo prova nada
H/E responder e F/C resetar   o servidor está RECUSANDO o nosso certificado
A e B iguais                  a leitura não exige mTLS, e A não serve de controle
```
⚠️ **Rode o diagnóstico ANTES de qualquer conclusão**, e com o gov de pé —
medição feita durante indisponibilidade mede a indisponibilidade.

#### Travas que NÃO se afrouxam
1. ⚠️ **DUAS travas independentes contra emitir de verdade:** a URL é a de
   produção restrita (a de produção fica **COMENTADA** no código, para
   descomentar ser gesto deliberado e não parâmetro passado por engano) e
   `tpAmb = 2` dentro do XML. `producao: true` no corpo é **RECUSADO**. **DPS
   aceito em produção É NOTA FISCAL COM NÚMERO**, que só se desfaz com
   cancelamento.
2. ⚠️ **A lista de hosts é FECHADA**, como na `nfse-nacional`, e não é zelo:
   esta função APRESENTA O CERTIFICADO A1 DA EMPRESA em cada requisição. Um
   `&host=` livre a transformaria num proxy que assina, no CNPJ da Carbo, contra
   qualquer servidor que alguém escolher. E só hosts de produção RESTRITA —
   sondar produção com o certificado é bater na porta de quem emite de verdade.
3. ⚠️ **`nDPS` DIFERENTE a cada tentativa.** Repetir o número faz o ADN recusar
   por DUPLICIDADE em vez de por assinatura — responderia a pergunta errada com
   cara de resposta. Já usados: 1, 2 (sha256/sha1), 3, 4, e 900 no diagnóstico.
4. **A sonda não entra em cron nenhum**, e não deve entrar.

#### O plano B, se a assinatura não for viável
Mandar o DPS **pré-preenchido para o emissor web** em vez de assinar. É mais
perto do que foi pedido (*"apenas confirmar no portal nacional e emitir"*) e
**não exige a chave privada no servidor** — o que elimina o segredo mais
sensível do projeto de um caminho novo. Só não foi o caminho de partida porque
ninguém mediu se o emissor web aceita entrada pré-preenchida.

### TRÊS números no mesmo WABA — e a janela de 24 h é por PAR
Pedido do dono do processo em 02/10/2026: *"vou precisar colocar mais um número
aqui no Carbo atendimento que também é api oficial… vai haver um botão para
variar entre os números"*, e depois, com todas as letras: *"não pode se misturar
as conversas desse número com esse outro que já funciona"*.

```
98876-9187  CarboZé              serviço   1255756280958635  ativo
98174-7452  CarboZé Clube        recompra  1274076859132981  ativo
98175-8713  CarboZé Atendimento  carrinho  1347087218483622  DESLIGADO, não registrado
```

Mesmo WABA (`1777955220017913`) ⇒ **mesmo token, MESMO webhook**, e template
aprovado vale para os três. Quem separa no webhook é `metadata.phone_number_id`.

```
carbo_wa_numeros                       o CADASTRO (migração 20261041)
carbo_wa_mensagens.numero_id           por qual número NOSSO passou
carbo_msg_templates.numero_id          de qual número a ETAPA sai
apps/atendimento … useNumeros()        o seletor
```

1. ⚠️ **A JANELA DE 24 H É POR PAR** (nosso número ↔ cliente), e ela mora em
   `carbo_wa_contatos`, cuja PK era só `wa_id`. Com dois números vivos, o
   cliente que responde à OFERTA abriria no nosso banco a janela do número de
   SERVIÇO — e a tela ofereceria texto livre que a Meta recusa com **131047**,
   depois de a pessoa ter escrito a resposta inteira. As PKs de
   `carbo_wa_contatos`, `_atendimento`, `_resolvidas` viraram `(numero_id,
   wa_id)`, e a de `_conversa_tag`, `(numero_id, wa_id, tag_id)`.
2. ⚠️ **O `metadata` NUNCA foi gravado, e não dava para recuperar.** Ele fica no
   nível do `change.value`, não dentro da mensagem — medido: nulo nas **456**
   linhas, e as chaves presentes eram as da mensagem (`type`, `text`, `id`,
   `from`). O backfill por constante foi a única resposta honesta, e vale porque
   até 02/10/2026 só existia um número.
3. ⚠️ **A troca de chave e a troca de código NÃO cabem no mesmo momento.** O
   webhook gravava com `onConflict: "wa_id"`: trocar a PK antes do deploy quebra
   o upsert (e o que ele não grava existe só no celular do cliente); trocar o
   código antes do SQL aponta para um índice que não existe. A saída foi **a
   chave primeiro** — índice composto CONVIVENDO com a PK antiga, deploy, e só
   então o `drop constraint`.
   ⚠️ A janela em que a PK antiga ainda vivia era segura **só porque o Clube
   ainda não enviava nada**. Fazer isso depois de ligar a recompra seria perder
   mensagem de cliente.
4. ⚠️ **A CHAVE é o `phone_number_id` da META, nunca um uuid nosso**: é ele que
   chega no webhook e é ele que vai na URL de envio. Id sintético criaria uma
   segunda identidade com um mapa no meio para divergir.
5. ⚠️ **CADASTRO, nunca constante.** O id estava escrito em QUATRO edge
   functions (`whatsapp-meta`, `-responder`, `-midia`, `-agendadas`) com o mesmo
   `?? "1255756280958635"`. Hoje: a FILA decide no `whatsapp-meta`, a TELA nas
   duas do navegador, e a LINHA agendada na quarta.
   ⚠️ **A reserva ABRE, não fecha** — o INVERSO do `CRON_SECRET`. Lá a ausência
   trava porque o segredo é portaria; aqui "fechar" é não responder cliente por
   causa de um campo novo do front, ou parar o aviso de entrega por uma coluna
   nova. Quem FECHA sem número é o cadastro (`n.ativo` no `WHERE` da fila).
6. ⚠️ **`ativo` nasce FALSE e `registrado` é separado dele.** O número de
   carrinho está conectado e NÃO registrado na Cloud API, e enviar por número
   não registrado falha com erro genérico da Graph API — que manda procurar no
   lugar errado. "Não registrei" e "registrei e não quero usar" são respostas
   diferentes: a lição dos TRÊS estados de `e_online`.
   Índice único **parcial** em `funcao` (só onde `ativo`): dois ativos para a
   mesma função fariam o roteamento escolher por acaso.
7. ⚠️ **Duas coisas que só apareceram no `pg_get_viewdef`**, e que eu teria
   quebrado calado:
   - a `carbo_wa_conversas` casava o contato por `wa_id` — passou a casar pelo
     PAR, senão traria o nome e a janela do outro número;
   - o vínculo **aproximado** ("o último aviso enviado a este número") passou a
     exigir o MESMO número nosso. Sem isso, uma resposta no Clube seria ligada
     ao pedido anunciado pelo SERVIÇO — aproximação que atravessa canal e se
     passa por certeza.
8. ⚠️ **E a `carbo_wa_agendadas_fila` ia DUPLICAR mensagem.** Ela fazia `left
   join carbo_wa_contatos on c.wa_id = a.wa_id`; com a PK composta isso casa
   DUAS linhas quando a mesma pessoa escreve para dois números, a view devolve a
   agendada duas vezes e o cliente recebe duas vezes. Invisível até o Clube
   receber a primeira resposta de quem já falou com o serviço.
9. **Na TELA, a caixa é de UM número só**, e o seletor escolhe qual — assim o
   `wa_id` volta a ser único dentro da caixa e o `agruparConversas` não mudou.
   ⚠️ **AS QUATRO consultas** filtram pelo mesmo número; filtrar só a primeira
   traz a janela, o status e as etiquetas do outro número — o "balde de sobra"
   do `carbohub-produtos`. ⚠️ `numeroId` nulo **não é "todos"**: é "ainda não
   escolheu", e o hook tem `enabled`.
   ⚠️ **Trocar de número FECHA a conversa aberta**: `?de=` é um `wa_id`, e o
   mesmo `wa_id` no outro número é outra conversa.
10. ⚠️ **Cadastro vazio não pode virar tela branca.** `carbo_wa_numeros` é
   guardada por `carbo_e_time_interno()` e devolve ZERO linhas, sem erro, para
   quem está fora — e com o `enabled` a tela ficaria vazia para sempre. Por isso
   há um aviso explícito dizendo que o problema é o acesso, não a caixa. Mesmo
   sintoma da `bling2_esteira` "travada na primeira coluna".
11. **O seletor só aparece com DOIS ou mais**, e mostra TODOS — "qual caixa
   estou vendo?" e "quais caixas existem?" são a mesma pergunta para quem
   atende. A cor vem do cadastro, não de um mapa na tela.

### A recompra pela Meta — o que segura, e o que o número REALMENTE é
`recompra` saiu da Evolution e passou a sair pela Cloud API, pelo Clube, com o
`recompra_lembrete` (MARKETING, aprovado, variável `primeiro_nome`).

⚠️ **SÃO TRÊS NÚMEROS DIFERENTES, e planejar pelo primeiro é planejar por um que
não vai acontecer** (medido em 02/10/2026):

```
361  o que a Esteira mostra em "Hora de ofertar"
268  quem tem TELEFONE e ainda não recebeu — os ~93 que faltam são o
     "91 sem telefone" do próprio cabeçalho da Esteira, quase todo ML
  0  o que sairia ligando só o `ativo`
```

⚠️ **Ligar o `ativo` sozinho NÃO MANDA NADA**, e a tela diria "ligado" com a
fila vazia. São DOIS interruptores:

```sql
update public.carbo_msg_templates
   set liberar_anteriores = true, ativo = true
 where etapa = 'recompra';
```

1. ⚠️ **`liberar_anteriores` existe porque o marco zero exclui os 268 PARA
   SEMPRE.** O corte de 21/09 foi posto pela `20261016` para a fila travada não
   disparar de uma vez; o efeito colateral — excluir quem foi entregue antes —
   foi **herdado, nunca decidido**. A régua conta 30 dias da ENTREGA, e as 268
   entregas são de 30/06 a 02/09.
2. ⚠️ **O `teto_diario` foi uma hipótese minha que o DADO desmentiu.** Eu pus 40
   raciocinando que número novo começa no patamar de 250 da Meta e que 268 não
   caberia. O painel mostra **2.000/24 h** — e esse número estava a um clique no
   WhatsApp Manager. *Limiar se MEDE, não se supõe*, de novo.
   Hoje `teto_diario` é **null** na recompra. Ele continua existindo porque é a
   trava certa quando o patamar for o problema.
3. ⚠️ **A JANELA DE HORÁRIO não existia, e o dono do processo a expôs sem
   querer:** *"hoje é sexta 16h, o expediente encerra 17h… não posso disparar
   nada agora"*. Nada impedia a fila de disparar no sábado ou às 3h da manhã.
   `hora_inicio`/`hora_fim`/`dias_uteis` em `carbo_msg_templates`; recompra 9–18
   em dias úteis, carrinho 8–22 **sem** `dias_uteis` (carrinho abandonado no
   sábado é quando a loja vende).
   ⚠️ **A janela ATRASA, NUNCA PULA**: a fila é view do estado ATUAL e só ganha
   linha em `carbo_msg_envios` quando o envio acontece — quem não sai às 3h
   continua elegível às 9h. Ninguém é perdido.
   ⚠️ **As SEIS da esteira ficam SEM janela**, de propósito: "saiu para entrega"
   às 20h é serviço e é esperado; segurá-lo até as 9h é pior que mandá-lo. A
   janela é para o COMERCIAL, onde falar é uma ESCOLHA — mesma separação do
   teto.
4. ⚠️ **A oferta NÃO TEM LINK.** Ela termina em *"Bora repor?"*, e quem manda o
   link é uma PESSOA, dentro da janela de 24 h. Por isso a tela do Clube tinha
   de existir ANTES do envio — foi exatamente a condição que o dono do processo
   impôs: *"só podemos enviar as mensagens aos clientes quando essa tela estiver
   disponível, pois precisaremos ver as respostas"*. 268 ofertas são até 268
   conversas para responder, e cliente que respondeu "bora" e foi ignorado é
   pior que cliente não contactado.
5. ⚠️ **Template enviado NÃO abre a janela de 24 h** — quem abre é o CLIENTE
   respondendo. Então a conversa não aparece na tela só por ter sido enviada.
   Isso confunde no primeiro teste e precisa ser dito antes, não depois.
6. **`&etapa=` no `whatsapp-meta` manda a mensagem DE VERDADE para um número.**
   `hello_world` não serve para treinar: o time precisa ver o que o cliente vê.
   Ele passa pelo `montarPayload` real, então também testa variável nomeada,
   `fallback` e idioma — **teste que usa outro caminho prova o caminho errado**.
   ⚠️ A trava continua forte: só template que existe em `carbo_msg_templates` E
   está `APPROVED`. Mesmo com o segredo, o mais que se consegue é mandar uma
   mensagem NOSSA, já aprovada, para um número por vez.
   ⚠️ E o número sai do CADASTRO da etapa, não do `&numero_id=`: o treino tem de
   acontecer na MESMA caixa da operação.
   ✅ Conferido em 02/10/2026 às 16:22 — a oferta chegou pelo Clube com o
   `primeiro_nome` resolvido, antes de qualquer cliente real.
7. ⚠️ **Prove que um número novo FALA antes de ligar a etapa dele**
   (`?teste=<fone>&numero_id=<id>`, que manda `hello_world`). Sem isso, a
   primeira mensagem por um número novo é uma oferta real para um cliente real —
   e descobrir ali que ele não está registrado é descobrir tarde.

### ⚠️ A conversa nasce no ENVIO — mas a janela só abre quando o cliente escreve
Duas coisas que parecem uma, e confundi-las faz alguém achar que a tela quebrou.
Pergunta literal do dono do processo em 02/10/2026: *"espero que para os
clientes de verdade fique assim também, e não precise que eles respondam para
abrir a conversa"*.

```
a CONVERSA aparece   no instante do ENVIO     — e o balão da oferta junto
a JANELA de 24 h     só com a mensagem DELE   — a nossa NUNCA abre
```

Conferido no código, não suposto: o envio real grava em `carbo_msg_envios` com
`wamid`, `wa_id` e `numero_id`, e é o **segundo ramo** da `carbo_wa_conversas`
que lê dali. E o NOME também aparece — `agruparConversas` usa
`cliente_pedido ?? nome_whatsapp`, e `cliente_pedido` vem do pedido na esteira,
existindo muito antes de a pessoa escrever. A lista não vira "268 números
soltos".

⚠️ **Consequência para o TREINAMENTO, e ela precisa ser a primeira frase:** no
segundo seguinte ao disparo a tela tem 268 conversas **sem campo de resposta** —
e isso está CERTO. O campo some de propósito, porque a Meta recusa texto livre
com 131047 e deixá-lo ali faria a pessoa escrever a resposta inteira antes de
descobrir. O time **não responde a oferta**: ele espera. O trabalho começa
quando o cliente escreve.

⚠️ **A conta que prova que a tela não está mentindo por omissão**, e vale rodar
depois de ligar — os dois têm de BATER:

```sql
select count(*) from public.carbo_msg_envios
where etapa = 'recompra' and status in ('enviado','entregue','lido');

select count(distinct wa_id) from public.carbo_wa_conversas
where numero_id = '1274076859132981';
```

Ofertas subindo e conversas não = `wa_id` ou `numero_id` faltando no registro do
envio. ⚠️ Antes de ligar eles **não** batem de propósito (0 × 1): o modo de teste
grava em `carbo_wa_mensagens`, não no ledger.

### ⚠️ `&etapa=` — o teste manda a mensagem REAL, e os TRÊS erros que ele custou
`whatsapp-meta?teste=<fone>&etapa=<etapa>&nome=<nome>` manda o template de
verdade para UM número, pelo `montarPayload` da produção. Existe porque
`hello_world` não treina ninguém: o time precisa ver o que o CLIENTE vê.

⚠️ **Ele grava em `carbo_wa_mensagens`, NUNCA em `carbo_msg_envios`.** A PK
daquela é `(bling_id, etapa)` — *"uma mensagem por etapa por pedido, para
sempre"* — então o teste precisaria inventar um `bling_id`, e o inventado
**bloquearia o envio real daquele pedido** depois. Teste que consome a vaga do
que ele testa é pior que teste nenhum.
⚠️ Custo aceito: no teste o rótulo fica "aviso automático" sem o nome da etapa,
porque a etapa vem do ledger. No envio real sai `automático · recompra`.

**Os três erros, em ordem, e o terceiro escondia o segundo:**

1. **O balão não aparecia.** O modo mandava pelo Graph e não registrava em lugar
   nenhum — a conversa abria com a RESPOSTA do cliente e sem a oferta que a
   provocou. Treinar numa conversa a que falta o que NÓS dissemos é treinar para
   ler pela metade.
2. ⚠️ **O balão saiu VAZIO: `texto` não estava no `select`.** Eu fiz a função
   passar a LER `tpl.texto` e não acrescentei a coluna à consulta. Veio
   `undefined`, virou `""`, e a substituição das variáveis rodou sobre nada.
   **Campo que a função passou a ler tem de atravessar o `select`** — a mesma
   família do `map` do `Vendas.tsx` que descartava `discount_amount`.
3. ⚠️ **`sobre_a_etapa` NÃO É COLUNA de `carbo_wa_mensagens`** — ela é DERIVADA
   na `carbo_wa_conversas`, a partir de `carbo_msg_envios` pelos `lateral`. Eu a
   pus no `insert` achando que era coluna, e **o custo não foi o `42703`: foi o
   silêncio.** O insert falhava, o `console.error` engolia, a função devolvia
   `ok: true` e o balão simplesmente não era gravado — com tudo parecendo certo.
   Supor coluna é perguntar à migração em vez de ao banco; `console.error`
   sozinho é o `catch` vazio do `sfxVenda` outra vez.

Hoje as duas falhas APARECEM na resposta: texto vazio RECUSA dizendo o que
preencher, e falha de gravação volta `ok: false` com a frase que importa — *a
mensagem já foi para o cliente e quem ficou sem ela foi a tela*.

### ⏸️ Recompra: pronta e DESLIGADA — o que rodar na segunda
Decisão do dono do processo em 02/10/2026 (sexta, 16h): *"update só segunda"*.
Tudo configurado, **nada enviando**.

```
recompra  meta · 1274076859132981 · recompra_lembrete · APPROVED
          teto_diario NULL · 9–18 · dias_uteis · ativo FALSE
```

**O interruptor, com o time na mesa:**

```sql
update public.carbo_msg_templates
   set liberar_anteriores = true, ativo = true
 where etapa = 'recompra';
```

⚠️ **São DOIS, e ligar só o `ativo` manda ZERO** — o marco zero de 21/09 exclui
as 268 entregas de 30/06 a 02/09. Isso já está na seção acima e se repete aqui
porque é o erro que vai acontecer se alguém ligar com pressa.

Saem **268**, do mais antigo primeiro (Kristel SOUZA, entregue 30/06), ~20 por
rodada de 1 min ⇒ cerca de 15 minutos.

⚠️ **Rodar num sábado não manda nada** e a fila espera segunda: `dias_uteis` com
9–18. A janela ATRASA, NUNCA PULA.

⚠️ **E alguém precisa atender.** A oferta termina em *"Bora repor?"* sem link —
quem manda o link é uma pessoa, dentro da janela de 24 h.

### ⏸️ Carrinho abandonado pela Meta: pronto e DESLIGADO (05/10/2026)
A terceira pipeline saiu da Evolution e passou a sair pela Cloud API, pelo
número da LOJA. Testado com os três templates reais no celular do dono do
processo — os três chegaram, e o `R$ 149,00` do segundo saiu formatado.

```
carrinho_1  carrinho_lembrete_1  primeiro_nome · produtos · link_carrinho
carrinho_2  carrinho_lembrete_2  primeiro_nome · valor(brl) · produtos · link_carrinho
carrinho_3  carrinho_lembrete_3  primeiro_nome · link_carrinho
número      1347087218483622 · (84) 98175-8713 · "CarboZé Loja" no nosso cadastro
supabase/migrations/20261045000000_carrinho_sai_pela_meta.sql
```

**O interruptor, quando o dono do processo pedir:**

```sql
update public.carbo_carrinho_config
   set inicio_em = now() - interval '24 hours'
 where id;

update public.carbo_msg_templates
   set ativo = true
 where etapa in ('carrinho_1','carrinho_2','carrinho_3');
```

1. ⚠️ **O MARCO ZERO ANDA JUNTO, e sem ele saem 157 mensagens.** Carrinho com
   telefone que nunca recebeu aviso fica em `aberto` PARA SEMPRE — não há
   prazo de validade —, e o `inicio_em` era o de quando a tabela nasceu.
   Medido em 05/10: **157 abertos, o mais antigo de 08/08; com o marco em
   24 h, saem 2.** "Vi que você começou um pedido" sobre um carrinho de dois
   meses é spam com o nome da loja.
   ⚠️ Isto NÃO contradiz o "nunca mover o marco zero" da dedução de estoque:
   lá ele compete com o ledger; aqui ele é, por definição na própria tabela,
   "o que impede a primeira sincronização de virar rajada". E só foi seguro
   porque **nenhum carrinho estava no meio da sequência** (medido: zero linhas
   `carrinho_*` em `carbo_msg_envios`) — `historico` vem ANTES de `msg1`/`msg2`
   no CASE da pipeline, e um carrinho já avisado anterior ao marco perderia as
   próximas mensagens. **Mova o marco de novo só depois de medir isso de novo.**
2. ⚠️ **`valor` saía `149.00` pela Meta.** A fila entrega `numeric(12,2)` cru e
   a Evolution formatava à mão no `kanban-n8n`. Hoje `meta_variaveis` aceita
   `"formato": "brl"` POR VARIÁVEL (`_shared/metaTemplate.ts`). Declarado,
   nunca deduzido: "é número, logo é dinheiro" formataria quantidade e pedido.
3. **Reservas escolhidas lendo a frase inteira:** nome → "tudo bem", produtos →
   "os produtos que você escolheu", valor → "compras" ("Seu carrinho de compras
   continua salvo"). ⚠️ `link_carrinho` **não tem** reserva, de propósito: sem
   link a mensagem não serve, e o envio espera.
4. ⚠️ **O cliente vê "CarboZé Atendimento"**, que é o nome de exibição na
   META. "CarboZé Loja" é só o nosso rótulo (seletor de Conversas, aba de
   mensagens). Trocar o que o cliente vê é no WhatsApp Manager, com revisão.
5. ⚠️ **Na conversa de carrinho, `bling_id` é o id do CHECKOUT.** A tela de
   Conversas não abre card de pedido para etapa `carrinho_*`
   (`pedidoDaConversa`) — antes, toda conversa da caixa nova abriria com
   "Este pedido não está na Esteira". O carrinho está no próprio balão.
5b. ⚠️ **E o NOME também não vem da view.** `carbo_wa_conversas` busca o nome
   do cliente na esteira pelo `bling_id`, e checkout não está lá — a conversa
   nascia "Sem nome" até a pessoa responder. O `useConversas` completa
   `cliente_pedido` lendo `nuvemshop_carrinhos.cliente` para as etapas
   `carrinho_*`. O nome do WhatsApp só existe depois que o cliente ESCREVE
   (vem do webhook de entrada; a resposta do envio não traz perfil).
   ⚠️ **E a reserva GERAL é o telefone** (`carbo_wa_nomes_por_fone`,
   `20261057`): conversa sem nome por nenhum caminho (envio de teste, cliente
   que não respondeu) ganha o nome mais recente do mesmo `carbo_fone_chave` em
   `nuvemshop_carrinhos`/`ecommerce_orders`. Vale nas TRÊS caixas. Só
   apresentação — não liga a conversa a pedido. SECURITY DEFINER, guardada por
   `carbo_e_time_interno()` (no SQL Editor volta vazia, e está certo).
6. **O teste** é o `&etapa=carrinho_N` do `whatsapp-meta`, com exemplos
   coerentes (Kit 5 Frascos · R$ 149 · link Payt do mesmo kit), trocáveis por
   `&produtos=`, `&valor=`, `&link=`. Não grava no ledger, então não ocupa a
   vaga de carrinho nenhum.
7. `teto_diario = 60` por etapa veio de antes e ficou: com ~2 carrinhos novos
   por dia, nunca segura nada.

⚠️ **Com isso, NADA mais sai pela Evolution.** O cartão "Desconectado" da
Evolution em Mensagens ao cliente só aparece enquanto alguma etapa tiver
`canal_envio <> 'meta'` — e a linha "Sai pelo número" passou a ler `numero_id`
para etapa da Meta (ela dizia "carbo-comercial" na aba da Recompra enquanto as
ofertas saíam pelo Clube).

### Réguas de recompra e carrinho — o que a TELA calcula e o que o BANCO trava (07/10/2026)
Uma rodada de pedidos do dono do processo no mesmo dia. A regra que atravessa
todos: **a `carbo_recompra_pipeline`, a `carbo_carrinho_pipeline` e a
`carbo_msg_fila` NÃO foram republicadas** — as três alimentam o WhatsApp, e
mexer nelas é mexer no gatilho. O que mudou de lugar foi a TELA; o que mudou
de comportamento usa o freio que a fila JÁ respeita: linha `ignorado` em
`carbo_msg_envios` (a fila não entrega etapa com linha ≠ `pendente`).

```
colunas recolhidas     tela   Sem telefone · Erro ao enviar · Não contatar
Respondeu (carrinho)   20261051  carbo_carrinho_respostas + cron 1 min
PayT no carrinho       20261052  lost_cart → nuvemshop_carrinhos, cron 5 min
Não contatar           20261053  carbo_wa_nao_contatar + trava no whatsapp-meta
comprou na outra loja  20261053  passo 3 do carbo_payt_carrinhos_sincronizar
?pipeline=             tela   a régua escolhida mora na URL
```

1. **As colunas recolhidas são calculadas na TELA** (`colunaRecompraNaTela`,
   `colunaCarrinhoNaTela`, em `useEsteiraOnline.ts`), lendo `carbo_msg_envios`,
   `carbo_carrinho_respostas` e `carbo_wa_nao_contatar`. ⚠️ `recomprou`,
   `recuperado` e `historico` nunca mudam de lugar — comprar é desfecho. O
   trilho é um componente só (`ColunasRecolhidas`) para as duas réguas, e as
   fechadas dividem UM trilho estreito (lado a lado, a segunda caía fora da tela
   em 1366/1440).
2. ⚠️ **Por que a tela, e não a view, decide "Respondeu"**: o freio grava
   `ignorado` nas etapas que faltavam, e a view lê isso como mensagem enviada
   (`msg2_em = coalesce(enviado_em, detectado_em)`) — o card "andaria" para
   3ª mensagem e Perdido. Quem diz onde ele aparece é a tabela de respostas.
3. **Respondeu = qualquer resposta**, sem ler "sim/não" (a leitura erra, e o
   erro é uma mensagem a mais para quem disse não). Casamento por IDENTIDADE:
   `wa_id` devolvido pela Meta no envio + mesmo `numero_id` + resposta depois do
   primeiro envio. Cron, não gatilho em `carbo_wa_mensagens`: erro no gatilho
   abortaria a gravação da mensagem do cliente, que só existe no celular dele.
   Só na régua de CARRINHO — na recompra é uma mensagem só (decisão do dono).
4. **PayT no carrinho entra NA MESMA TABELA** (`nuvemshop_carrinhos`), com
   `checkout_id` NEGATIVO (hash do `cart_id`, mascarado em 52 bits — a tela é
   JavaScript e número acima de 2^53 perde dígitos calado) e `token =
   payt:<cart_id>`. ⚠️ Contato = o mais recente PREENCHIDO entre os avisos;
   abandono = o PRIMEIRO (reenvio não pode empurrar o relógio). A tela diz a
   loja pelo sinal do id. A recompra já tinha a PayT (ela passa pelo Bling 2).
5. **Não contatar vale para o COMERCIAL** (`recompra`, `carrinho_*`), nunca para
   os avisos do pedido. A trava mora no `whatsapp-meta` (único ponto por onde
   toda mensagem automática passa), e ⚠️ **lista ilegível SEGURA o comercial**,
   nunca o envia sem conferir — inclusive no intervalo entre o deploy e a
   migração. ⚠️ A chave é DDD + últimos 8 dígitos e é FROUXA DE PROPÓSITO: o 9º
   dígito varia entre o cadastro e o `wa_id`, e aqui errar é deixar de mandar,
   o lado seguro. Ela existe em TRÊS cópias: `carbo_fone_chave` (SQL),
   `chaveDoFone` em `_shared/metaTemplate.ts` e em `useEsteiraOnline.ts`.
   Mudou uma, mude as três. O botão mora em Conversas (app Atendimento), com
   confirmação na tela; desmarcar grava `removido_em`, nunca apaga.
   ⚠️ O prefixo `não contatar:` no `motivo` é CONTRATO com a Esteira.
6. **Comprou na outra loja**: a view só reconhecia compra NUVEMSHOP pelo e-mail.
   O passo 3 do `carbo_payt_carrinhos_sincronizar` preenche `completado_em` de
   qualquer carrinho cujo dono comprou pela PayT depois do abandono (e-mail ou
   chave do telefone). ⚠️ E `trg_carrinho_nao_descompleta` impede o sync da
   Nuvemshop (upsert a cada 15 min, sem saber da PayT) de apagar a marca — sem
   ele ela sumiria e voltaria 5 min depois, e nesse intervalo a mensagem saía.
7. `dias_para_desistir` foi para **2** (dono do processo, 07/10). Ele só decide
   a COLUNA (Ofertado → Sem retorno); nenhum envio depende dele.
9. **Cadência por HORA DO DIA** (`20261054`, pedido do dono do processo): 1ª
   15 min após o abandono · 2ª às 9h do dia seguinte ao da 1ª · 3ª às 9h de
   2 dias depois da 2ª (= D+1 e D+3 no caso comum). ⚠️ O dia conta da mensagem
   ANTERIOR, não do abandono: quem abandona às 22h30 recebe a 1ª às 8h, e
   contando do abandono a 2ª sairia uma hora depois. A conta mora em
   `carbo_carrinho_horas_ate()` e as DUAS views a usam no lugar de
   `horas_2`/`horas_3` — trocado no texto VIVO (`pg_get_viewdef`), com o antes
   guardado em `carbo_backup_viewdef`. `hora_2`/`hora_3` nulos voltam às horas
   corridas. O sync da Nuvemshop foi para 5 min (`alter_job`; o NOME do job
   continua "-15min"), senão a 1ª sairia com até ~30 min.
   ⚠️ **REVERTIDO no mesmo dia (`20261055`) — a fila estourou o timeout.** A
   função tem FROM no corpo, o planejador não a embute, e chamada por linha
   dentro da `carbo_msg_fila` levou a consulta de ~8 s para além do limite:
   23 timeouts em 30 min, e com a fila em timeout NENHUMA mensagem da Meta
   sai, nem as da esteira. **Fonte que dispara mensagem não ganha função por
   linha sem medir o tempo da fila antes e depois** (`explain analyze`).
   ⚠️ E a medição mostrou que a fila JÁ beirava o limite antes (1 a 4
   timeouts por meia hora desde a manhã) — é a doença dos 18 dias voltando.
   ✅ **A causa de fundo estava no `explain analyze`** (`20261056`): o CTE
   `base` da fila (esteira + recompra + carrinho) era reavaliado UMA VEZ POR
   TEMPLATE ATIVO (`Append ... loops=7`, ~430 ms cada, 3 s no total) — cada
   etapa ligada MULTIPLICAVA o custo. Hoje é `base AS MATERIALIZED`, e a
   cadência das 9h voltou escrita na consulta (subselect sobre `cfg`, sem
   função). ⚠️ **Etapa nova na fila: meça a fila com o template LIGADO.**
10. **Fora da régua vai para "Perdido" e só** (dono do processo, 07/10/2026):
   `historico`, `ignorado` e `duplicado` são desviados na TELA
   (`colunaCarrinhoNaTela`); a faixa "N fora da régua" e o aviso de "colunas
   vazias por causa do marco zero" saíram — poluíam a tela. A view não mudou,
   então a fila continua sem mandar nada para eles.
8. ⚠️ **Ligar a recuperação de carrinho** continua sendo os dois interruptores
   da seção "Carrinho abandonado pela Meta" (marco zero em 24 h + `ativo`). Os
   carrinhos da PayT anteriores ao marco caem em "fora da régua" junto com os
   da Nuvemshop.

### Carbo Pré-Vendas — o OITAVO app (06/10/2026)
`prevendas.carbohub.com.br`, flag `carbo_prevendas`, cor lima `#65A30D`. É o
app dos SDRs: qualificam o lead e repassam ao closer (que trabalha no Sales).
Nasceu como o `atendimento` nasceu: **só a casca**, sem tela de pré-venda —
as telas entram quando o dono do processo descrever a lógica.

```
apps/prevendas/                      cópia do atendimento SEM Conversas/Esteira/Mensagens
packages/shell/src/apps.ts           seletor (antes do Sales: pré-venda → venda)
apps/{admin,ti}/src/lib/interfaces.ts a caixinha de acesso
carbohub-landing/src/lib/apps.ts     o azulejo do Hub (OUTRO repo)
supabase/migrations/20261046…        carbo_interface_e_interna: É time interno
```

1. ⚠️ **Ele CARREGA cópias dos arquivos replicados**, e eles passam a ser
   OITO, não sete: `pages/Vender.tsx`, `lib/quotePdf.ts`, `useVendas`,
   `useCarbozeVendas`, `useLeadOrcamento`, `useDescarbOS`, `useMeuEstoque`,
   `BugButton`, `BloqueioAoVivo`, `sfxVenda`, `useEcommerceNotifications`,
   `ui/select.tsx` e `lib/sso.ts` — todos byte a byte iguais aos do
   `atendimento` no dia da criação (conferido por md5). As seções acima ainda
   dizem "sete"; **onde disser sete, conte este também.**
2. **A entrada é o MESMO portão do `atendimento`**: exige cadastro em `profiles`
   **e** a flag. `profile == null` não entra — lojista e licenciado usam a MESMA
   tabela. Liberar alguém é marcar "Carbo Pré-Vendas" no Admin; não há regra
   por perfil (head/TI) aqui, igual ao atendimento.
3. **Sem `lib/interfaces.ts` no app**, de propósito: a cópia do `atendimento`
   não é importada por nada (código morto, e já divergente das do admin/ti).
   Uma terceira cópia morta seria mais uma para divergir.
4. ⚠️ **Passos FORA do código, sem os quais ele não abre:** projeto no Vercel
   com Root Directory `apps/prevendas`; o DNS do subdomínio; e
   `https://prevendas.carbohub.com.br` em Supabase → Auth → URL Configuration →
   Redirect URLs.
5. A cor foi escolhida por MEDIDA de matiz (lima a 47° do Ops e 57° do Portal
   de Vendas; ciano caía a 10° do TI). Ela aparece em quatro lugares — Home do
   app, chip do `interfaces.ts`, `packages/shell`, azulejo do Hub — e os quatro
   têm de concordar.
6. ⚠️ **Conferido 1:1 contra o `atendimento` no dia seguinte, e havia um
   QUINTO lugar.** Edge function chamada pelo NAVEGADOR tem lista própria de
   origens (CORS), e duas que todo app usa estavam paradas no tempo:
   `call-token` (chamada de voz do Carbo Chat) e `send-email` ("enviar
   orçamento por e-mail" no `/vender`). Recusavam TI, Marketing, Atendimento e
   Pré-Vendas — `Failed to fetch`, sem linha no log. Hoje aceitam qualquer
   `https://*.carbohub.com.br` (a fronteira do SSO), como o `bling-sync` já
   fazia. As duas estavam FORA da lista `dep` — por isso a lista não aprendia
   app novo, e o `call-token` do repo nem compilava. ⚠️ O `_shared/cors.ts` do
   WhatsApp continua FECHADO de propósito (escreve pelo número da empresa); o
   Pré-Vendas não o usa.
7. **A pipeline dos SDRs é o `f14`, na MESMA tabela do Sales** (`crm_sales_leads`)
   — é isso que faz a coluna "Oportunidade Qualificada" repassar ao closer sem
   código novo (RPC `crm_sales_lead_repassar` → card no Inbound/f11).
   ```
   Prospecção · Primeiro Contato · Qualificação · Conexão com Decisor ·
   Agendamento · Reunião Realizada · Oportunidade Qualificada · Follow-up · Descartado
   ```
   ⚠️ **Os arquivos do CRM são IDÊNTICOS no `crm` e no `prevendas`** (14,
   conferidos por `cmp`): `types/crm.ts`, `pages/Pipelines.tsx`,
   `components/crm/*` (menos `LeadDrawer`), `components/kanban/KanbanDnd.tsx`,
   `useCRMLeads`, `useRepasse`, `useLeadPorId`, `useArquivarLead`, `lib/sfx.ts`.
   Fonte da verdade = `apps/crm`; editou lá, copie. A ÚNICA diferença mora em
   `lib/funisDoApp.ts`, PRÓPRIO de cada app: quais pipelines aparecem, a padrão,
   e o recorte da visão "Todos" (o Sales exclui o f14; o Pré-Vendas só o f14).
   ⚠️ Dois ids reaproveitados de propósito: `repassado` (= "Oportunidade
   Qualificada", é o que dispara o repasse) e `descartado` (pede motivo). Id novo
   ali daria a coluna sem o comportamento, calado.
   ⚠️ `funnel === "f12"` virou `isFunilDeSdr()` — descarte em vez de perda e o
   bloco de qualificação valem para os DOIS funis de SDR.
   ⚠️ Sem linha em `crm_stage_sla` para o f14: prazo por etapa é do gerente.
8. **O closer do Pré-Vendas é o `f15`** — as MESMAS etapas do Inbound
   (`STAGES_INBOUND`), numa pipeline independente do Sales. O repasse do f14
   cai no f15, nunca no Inbound: a RPC `crm_sales_lead_repassar` ganhou um
   CASE no destino (`20261048`, trocado no texto VIVO da função, com trava que
   aborta se ele não for o esperado), espelhado por `funilDoCloser()` em
   `types/crm.ts`. ⚠️ Mudou um, mude o outro. O Sales exclui f14 **e** f15 da
   visão "Todos" (`recorteDoApp`).
9. **"Dados de faturamento" do card = os campos do `/vender`**, na mesma ordem,
   inclusive Cidade e UF (antes: "ficam em Cliente / Contato", onde eram só
   leitura — não havia onde preenchê-las). E o "Gerar venda" do detalhe mandava
   endereço VAZIO escrito no código; hoje os dois caminhos usam
   `leadParaVender()`. Campo novo no faturamento precisa atravessar essa função
   e o efeito `fromLead` do `Vender.tsx`.
10. **`/vendas` do Pré-Vendas = a tela do Sales PORTADA**, com três diferenças e
    só elas: os dados vêm da RPC `carbo_prevendas_vendas` (`20261049`) — só o
    pedido ligado por `crm_lead_orders` a card f14/f15 —, as colunas "Vendedor /
    Criado por" viram **SDR / Closer**, e as duas aparecem para TODOS.
    ⚠️ **A tela do Sales NÃO muda**: a venda do Pré-Vendas aparece lá como
    qualquer outra (dono do processo, 06/10/2026).
    ⚠️ O recorte mora no BANCO, não na tela: a RLS de `carboze_orders` mostra ao
    colaborador só o que ele vendeu, e o SDR não é o vendedor — sem a função ele
    nunca veria a venda que originou. Gestor vê todas, SDR as que repassou,
    closer as que fechou. SECURITY DEFINER guardada por `carbo_e_time_interno()`.
    ⚠️ Ela é plpgsql e devolve `jsonb` para NÃO virar dependente da
    `carbo_vendas_metrica` (republicá-la já derrubou tela). Chamada no SQL
    Editor volta VAZIA — sem usuário, a guarda devolve nada; isso está certo.
    ⚠️ `pages/Vendas.tsx` do Pré-Vendas é CÓPIA divergente da do `crm`, não
    idêntica: corrigiu algo lá, traga para cá. A chave do hook começa com
    `carboze_vendas` para as mutações do `useCarbozeVendas` a invalidarem.
11. **`/resultados` do Pré-Vendas** — repassados, fechados, conversão, receita e
    tempo até fechar, por closer e por SDR. RPC `carbo_prevendas_repasses`
    (`20261050`), mesmo recorte e mesma guarda da `carbo_prevendas_vendas`.
    ⚠️ É COORTE pela data do REPASSE (o `created_at` do card f15): "dos que
    repassei em outubro, quantos fecharam", mesmo fechando em novembro. Filtrar
    pela data do fechamento misturaria meses e a taxa passaria de 100%.
    ⚠️ Quem não é gestor vê só o que ELE repassou, mesmo que a função também
    devolva o que ele pegou como closer — a visão do closer é outra tela,
    combinada para depois.
