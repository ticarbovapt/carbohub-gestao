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
6. ⚠️ **O sinal NÃO substitui a trava.** Realtime fora do ar ⇒ a aba cai na
   renovação do token, como antes: o pior caso volta a ser o de ontem, nunca
   "continua entrando". Aviso que falha ABERTO é pior que aviso nenhum.
7. ⚠️ **O `BloqueioAoVivo` monta ao lado do `<App />`, dentro do
   `AuthProvider`** (`main.tsx`), NUNCA dentro do `Layout` ou de uma rota: o
   `signOut` troca a tela para o login, e lá dentro o componente desmontaria
   junto — o aviso sumiria no instante em que aparece.
8. ⚠️ **Ele escuta `onAuthStateChange`, não o `useAuth()` do app.** Os sete
   `AuthContext` divergem entre si; amarrar um deles faria as sete cópias do
   arquivo deixarem de ser idênticas.
9. ⚠️ **Realtime não reentrega o que passou.** Aba dormindo, notebook fechado
   ou queda de rede perdem o evento PARA SEMPRE — daí a conferência na volta do
   foco (`focus` **e** `visibilitychange`, porque nem todo navegador dispara os
   dois). E ela lê a ÚLTIMA linha: "existe algum bloqueio?" derrubaria quem já
   foi desbloqueado, para sempre.
10. **Bloqueado NÃO some da lista de Usuários** — fica marcado no nome, e o chip
   "Bloqueados" é filtro, não gaveta. Esconder quem perdeu o acesso é como se
   descobre meses depois que ele continuava liberado.
11. ⚠️ **Os dois PORTAIS ficaram de fora** (outro repo): login deles ainda
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
