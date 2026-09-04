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

O desconto do orçamento é do **pedido**, não do item (`QuoteItem` não tem campo
de desconto): ele é rateado por linha na proporção do valor. ⚠️ O arredondamento
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

### ⚠️ `Select` do shadcn tem DOIS `max-h`, e a menor manda
Em `components/ui/select.tsx` a altura aparece no `SelectContent` **e** no
`Viewport`. Estavam `max-h-60` (240px) e `max-h-48` (192px): com item de ~32px,
o teto real era **seis opções**, e ninguém sabia disso. Um menu de 6 itens media
200px e rolava por **8 pixels** — o Radix ligava as duas setas de scroll e o
menu parecia cortado sem ter o que mostrar.

Hoje as duas são `min(22rem,60vh)`. Ao mexer numa, mexa na outra: deixá-las
diferentes recria o teto invisível.

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
exposta era pequena. A `carbo_msg_fila` não tem data de corte em lugar nenhum.

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
```

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
