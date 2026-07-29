# Dashboards comerciais — de onde vem cada número

Este documento explica **quais telas mostram faturamento, de onde tiram o dado
e o que exatamente entra na conta**. Ele existe porque o sistema chegou a ter
~14 definições diferentes de "venda que conta" espalhadas por 26 lugares, e o
mesmo mês aparecia com valores diferentes dependendo da tela.

Última revisão: 2026-07-29.

---

## 1. A regra única

Tudo que é faturamento agora sai de **uma view só**:

```
public.carbo_vendas_metrica
```

Ela é `carboze_orders` + a NF vinculada (`bling_nfe`), com três colunas que
não existiam:

| Coluna | O que é |
|---|---|
| `conta_metrica` | `true` se a venda entra no faturamento |
| `motivo_fora` | quando não entra, **por quê** (em texto) |
| `data_efetiva` | `coalesce(sale_date, created_at::date)` |

### O que conta

Uma venda conta quando **todas** valem:

1. Status **não** é `quote` (orçamento) nem `cancelled`
2. **Não** está marcada como `excluir_metricas`
3. **Não** tem NF sabidamente inválida (Cancelada, Denegada, Rejeitada, Bloqueada)
4. E: **tem NF válida** (Emitida DANFE, Autorizada, Registrada) **ou** o status é
   `invoiced` / `shipped` / `delivered`

### Por que a condição 4 aceita "entregue sem NF"

Não é leniência. São 13 pedidos (~R$ 65 mil) **nascidos no Bling** cuja nota
existe e foi emitida, mas **nunca foi vinculada** ao pedido no sistema.

O casamento automático (`matchNFesToOrders`, em `supabase/functions/bling-sync/index.ts`)
procura o código do pedido — `V2026070001` ou `PED-2026-00001` — dentro da
**observação da nota fiscal**. Pedido criado no nosso sistema põe esse código lá.
Pedido que nasceu no Bling **não tem esse código**, então nunca casa sozinho.

Mercadoria entregue foi faturada; o que falta é o vínculo, não a nota. Excluir
esses pedidos apagaria faturamento real do histórico.

**Consequência prática:** quando o financeiro vincular essas notas, **o número
não muda** — elas já contavam. O conserto dos vínculos melhora a rastreabilidade,
não o valor.

### Os motivos de exclusão

| `motivo_fora` | Significado |
|---|---|
| `orcamento` | Proposta; ainda não virou pedido |
| `cancelado` | Pedido cancelado |
| `excluido_manualmente` | Alguém marcou "excluir das métricas" (ex.: transferência entre filiais) |
| `nf_invalida` | Nota cancelada/rejeitada — não vale como faturamento |
| `aguardando_nf` | Pedido real, ainda sem nota emitida |

### Segurança

A view é `security_invoker = true`: a **RLS de `carboze_orders` continua
valendo**. Quem só enxerga as próprias vendas continua enxergando só as dele.
Sem isso, a view seria um bypass de permissão com cara de conveniência.

---

## 2. Status do pedido

Os valores da coluna `status` são do banco (enum `order_status`) e apareciam
crus na tela. Tradução oficial:

| Banco | Tela |
|---|---|
| `quote` | Orçamento |
| `pending` | Pendente |
| `confirmed` | Confirmado |
| `invoiced` | Faturado |
| `shipped` | Enviado |
| `delivered` | Entregue |
| `cancelled` | Cancelado |

⚠️ **`status` não é a mesma coisa que "tem NF".** Um pedido pode estar
`delivered` sem nota vinculada, e pode ter nota estando `pending`. Quem manda
para faturamento é a NF, não o status — por isso a regra olha os dois.

---

## 3. As telas, uma a uma

### `/comercial/dashboard` · Dashboard Comercial (Admin)
- **Hooks:** `useDashComercial`, `useComercialCanais`, `useCanalMetas`
- **Fonte:** `carbo_vendas_metrica` (`conta_metrica = true`)
- **Mostra:** evolução mensal, crescimento anual vs meta, quebra por canal
- **Meta:** vem de `crm_metas_resolvidas_ano` (metas de vendedor) e da tabela
  `canal_metas` (metas por canal). Meta **não** sai de `carboze_orders`.
- **Era assim antes:** os KPIs do topo excluíam orçamento e **ignoravam**
  `excluir_metricas`; a aba Canais fazia o **inverso** — contava orçamento e
  respeitava exclusão. Cada um acertava metade, e o total nunca fechava com a
  soma dos canais.

### `/comercial/dados` · Dados Comerciais (fonte)
- **Hook:** `useComercialOrders`
- **Fonte:** `carbo_vendas_metrica`
- **Mostra:** linha a linha dos pedidos, com NF, canal e origem; e a visão
  agregada por cliente
- **Coluna Status:** rótulo em português + **número da NF** ao lado (verde se
  válida, vermelha com a situação se não). Quando o pedido não conta, a linha
  diz o motivo.
- **Coluna Conta?:** reflete `conta_metrica`
- **Era assim antes:** o hook calculava `contaMetrica` e os KPIs somavam por
  `contaPedido` — o card "Excluídos das métricas" era decorativo e o total
  incluía os excluídos.

### `/dashboards/estrategico` · Estratégico (Admin)
- **Hook:** `useDashEstrategico`
- **Fonte:** `carbo_vendas_metrica`
- **Era assim antes:** somava `total` com filtro **só de data**. Orçamento e
  cancelado entravam como receita.

### Cockpit do CEO (Admin/TI) e Dashboard do CEO (Controle)
- **Hooks:** `useCeoCockpit` (apps/admin, apps/ti) · `CeoDashboard` (src/)
- **Fonte:** `carbo_vendas_metrica`
- **Era assim antes:** liam `carboze_orders_secure` com filtro só de data. Essa
  view **mascara PII mas não filtra nada** — então a "receita do mês" da
  diretoria incluía orçamento em aberto e pedidos cancelados. Era a maior
  distorção numérica do sistema.
- **Alerta "aguardando NF":** agora usa `motivo_fora = 'aguardando_nf'`, que
  pega `pending` **e** `confirmed`. Antes olhava só `confirmed` com
  `invoice_number` nulo, então pedido pendente sem nota ficava invisível.

### Home · Visão do Ecossistema (Controle)
- **Componente:** `EcosystemOverview`
- **Fonte:** `carbo_vendas_metrica`, últimos 30 dias
- **Era assim antes:** sem filtro de status.

### `/vendas` · Vendas e Orçamentos (Sales)
- **Hook:** `useCarbozeVendas`
- **Fonte:** `carboze_orders` direto — **de propósito**
- **Por quê:** esta tela **precisa** mostrar orçamento e cancelado; ela separa
  "Total faturado", "Aguardando faturamento" e "Em orçamento" em cards
  distintos. Não é um dashboard de faturamento, é a lista operacional.
- **Busca:** `carbo_vendas_busca` — quando há termo, varre todo o histórico e
  ignora os filtros de período e vendedor.

### Metas e comissão
- **Funções:** `crm_metas_board`, `crm_comissao_agregado`, `crm_comissao_detalhe`,
  `crm_comissao_descarb`
- **Fonte:** `carboze_orders` com regra própria (exigem `bling_nf_id IS NOT NULL`)
- **Ainda não migradas para a view.** São a regra mais restrita do sistema, e
  foi delas que a regra única saiu. Migrar muda valor de comissão, então exige
  fechamento de mês.
- ⚠️ **`crm_comissao_descarb` NÃO exige NF de propósito** — descarbonização é
  serviço e não gera nota. Qualquer regra global que exija NF tem que manter
  essa exceção, senão a comissão de serviço zera.

---

## 4. Como a NF chega no pedido

```
Bling ──(cron de hora em hora)──> bling_nfe ──(match por observação)──> carboze_orders
```

1. `syncNFe` baixa as notas do Bling para `bling_nfe` (cron `bling-nfe-sync`,
   de hora em hora)
2. `matchNFesToOrders` procura o código do pedido na observação da nota
3. Casando, grava **nos dois lados**: `bling_nfe.order_id` e
   `carboze_orders.bling_nf_id` / `nf_access_key` / `invoice_number`

**Pedidos são sincronizados 2×/dia** (07h e 13h BRT), notas **de hora em hora**.
Então é normal existir uma janela em que o pedido está no sistema e a nota
ainda não apareceu.

### Fragilidades conhecidas deste fluxo

- **Pedido nascido no Bling nunca casa sozinho** (não tem o código na
  observação). Depende de vínculo manual.
- **Não há constraint** garantindo que os dois lados concordam. Em julho/2026
  foram encontrados 5 pedidos onde o pedido apontava para uma nota e a nota
  apontava para outro pedido — incluindo um pedido de R$ 55.380 carregando uma
  nota de R$ 1.820, e um pedido carregando a nota fiscal de **outra empresa**.
- **Nota cancelada não é desvinculada.** A sincronização atualiza
  `bling_nfe.situacao` para "Cancelada" e nada mais acontece. A regra da view
  compensa isso na leitura, mas o vínculo continua lá.
- **O desvínculo de NF só existe no monólito** (`src/pages/BlingNFsPage.tsx`).
  Não há equivalente em `apps/financas` nem em `apps/mkt`.
- **`invoiced_at` nunca é preenchida** por nenhum código. Não dá para medir
  faturamento pela data da nota; só `bling_nfe.data_emissao` tem essa
  informação, e nenhuma tela cruza.

---

## 5. Regra para quem for mexer

**Não reimplemente o filtro.** Se precisar de faturamento, leia
`carbo_vendas_metrica` e use `conta_metrica`. Foi reimplementar em cada tela
que criou as 14 versões.

Se a regra precisar mudar, mude **na view** — não no hook.

---

## 6. O que ainda está fora da fonte única

| Onde | Situação |
|---|---|
| `crm_metas_board`, `crm_comissao_*` | regra própria, mais restrita; migrar muda valor de comissão |
| `ops_comercial_dashboard` | ignora `excluir_metricas`; aceita `status IS NULL` |
| `crm_acompanhamento` | traz valor de orçamento sem filtro nenhum |
| `useSalesTargets` (admin) | conta orçamento como realizado e ignora `excluir_metricas`; a cópia da raiz respeita |
| `useFaturamento`, `useReceivables` | lista positiva de status própria — são filas operacionais, não métricas |
| `intelligence-engine`, `forecast-engine` | edge functions sem filtro de status |
| `calculate-licensee-gamification` | lista positiva própria, sem `confirmed` |
