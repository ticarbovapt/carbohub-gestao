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
O `pages/Vender.tsx` existe nos **seis** apps e deve ser byte a byte idêntico.
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

⚠️ **`useVendas.ts` NÃO é idêntico nos seis.** O CRM filtra venda de
marketplace da tela do vendedor (`FILTRO_VENDA_DO_TIME`), e `lib/vendaDoTime.ts`
só existe lá. A divergência é intencional: copiar o do CRM por cima dos outros
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

### Esteira do On-line — admin manda, Ops espelha
**Cinco** arquivos byte a byte idênticos entre `admin` e `ops`, não dois. Fonte
da verdade = `apps/admin`; no Ops as páginas moram em `pages/logistica/` e a
rota é `/logistica/esteira`.

```
pages/EsteiraOnline.tsx          hooks/useEsteiraOnline.ts
pages/MensagensCliente.tsx       hooks/useMensagensCliente.ts
components/ConexaoWhatsApp.tsx
```

⚠️ Os três últimos entraram sem serem registrados aqui, e ficaram meses fora de
qualquer lista — que é **exatamente** como o `useVendas` divergiu: um arquivo
que ninguém sabe que precisa ser copiado só é copiado por acaso. Se você editar
qualquer um dos cinco, copie para o outro app na mesma tarefa.

A tela não calcula etapa: quem calcula é a view `public.bling2_esteira`. Regra
nova entra lá, e as duas telas mudam juntas.

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

### Regras anti-confusão (OBRIGATÓRIAS)
1. **Todo pedido nomeia o alvo.** "no CRM" → `apps/crm`; "no controle"/"atual" → raiz (`src/`).
2. **Na dúvida, PERGUNTE — nunca adivinhe.** Se a tela existe em mais de um app, liste os candidatos antes de mexer.
3. **Congelamento do `controle`:** raiz só recebe correção crítica. Funcionalidade nova vai pros apps novos.
4. **Mudança em `packages/`** → avise que afeta vários apps antes de aplicar.
5. **Cada app é autossuficiente.** `apps/crm` tem build/lockfile próprio; NÃO mexer no `package.json` da raiz (3 lockfiles frágeis — risco ao deploy do controle).

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
