# Descarbonização — mapeamento ponta a ponta e plano de correção

Dois apps, um banco. Este documento mapeia o que existe hoje entre **Carbo Sales**
(`carbohub-gestao/apps/*`) e **Licenciados/Carbox** (`carbohub-licenciados`), e
propõe o plano para os dois coexistirem sem quebrar.

> **Este arquivo é a fonte de verdade do andamento.** Toda entrega marca o passo
> na tabela abaixo, no mesmo commit em que o código vai. Se não está marcado,
> não foi feito.

---

## 0. Placar

Legenda: ⬜ não começou · 🟡 em andamento · ✅ entregue · ⏸️ adiado

| # | Fase | Onde | Estado |
|---|---|---|---|
| **0** | Mapeamento e decisão de modelagem | `docs/` | ✅ |
| **1** | Comissão dobrada em venda mista | gestão (SQL) | ✅ |
| **2** | Banco da OS: porte, vagas e elo com a venda | licenciados (SQL) | ✅ |
| **3** | `/vender` grava a OS certa | gestão (5 apps) | ✅ |
| **4** | Sales lê a OS de volta | gestão (crm) | 🟡 |
| **5** | Execução parcial: a OS sabe quando acabou | ambos | ✅ |
| **6** | Execução compartilhada nos dois apps | ambos | ⬜ |

Detalhe de cada fase, com os passos individuais, na seção 4.

### Registro de entregas

| Data | Fase | O que entrou | Commit |
|---|---|---|---|
| 2026-07-25 | 0 | Mapeamento das 4 telas + 12 defeitos + modelo de vagas | `7706c41` |
| 2026-07-26 | 1 | Comissão: base de produto sem os itens de serviço | `e21457a` |
| 2026-07-26 | 2 | OS com vagas por unidade vendida + elo com a venda | `ea3b5ca` (lic.) |
| 2026-07-26 | 3 | /vender manda quantidade, bonificação e tipo de serviço | `f85e3ab` |
| 2026-07-26 | 4 | Sales lê a OS: progresso, portes, elo e reconciliação | `f55e64c` |
| 2026-07-26 | 5 | Execução parcial: vaga executada, OS fecha sozinha, saldo vira OS nova | `1e7dd1a` (lic.) |

---

## 1. Mapa atual

### 1.1 A venda — `/vender`

Existe em **5 cópias idênticas**: `apps/crm`, `apps/ops`, `apps/admin`,
`apps/financas`, `apps/ti`. Só a do CRM tem modo de edição (`?edit=`).
Qualquer mudança no fluxo precisa ser replicada nas cinco.

O bloco "Itens de Serviço" (`Vender.tsx`) coleta por linha:

| Campo | Observação |
|---|---|
| Modalidade | `P` R$400 · `M` R$700 · `G` R$1.400 — tabela hardcoded (`DESCARB_MODALIDADES`) |
| Quantidade | livre |
| Bonificação | qtd bonificada; sai em linha separada a R$ 0,00 no PDF |
| Desconto | % ou R$, por linha |

Fora do bloco: **Previsão de execução** (`executionDate`), habilitada só quando
existe item de serviço válido.

### 1.2 O que é gravado — `public.carboze_orders`

Uma linha só, misturando produto e serviço. Serviço vai no JSONB `items[]`:

```json
{ "name": "Descarbonização G", "kind": "service", "modality": "G",
  "quantity": 3, "unit_price": 1400, "bonificacao": 0,
  "discount_amount": 0, "total": 4200, "product_id": null }
```

Colunas relevantes:

- `total` / `subtotal` — **produto + serviço somados**
- `execution_date` — previsão de execução
- `descarb_os_id` — id da OS criada
- `status` — `pending` (venda) ou `quote` (orçamento)

Migração: `supabase/migrations/20260724000000_descarbonizacao_venda.sql`.

### 1.3 A OS — schema `licenciados`

`createDescarbOSForSale()` chama **`licenciados.os_create`**, que grava em:

- **`service_orders`** — `os_stage='nova'`, `os_number = OS-AAAA-#####`,
  amarrada à única loja interna (Carbox), `scheduled_at` = previsão de execução
- **`os_customers`** — upsert por telefone (PF) ou CNPJ (PJ)
- **`os_vehicles`** — **1 linha, vazia**, porque o `/vender` não envia placa/modelo

Tipo derivado do documento: CNPJ → `b2b`, CPF → `b2c`. **Nunca `frota`.**

Falha aqui **não derruba a venda** — só um toast.

### 1.4 Execução — Licenciados/Carbox

`/os` (`OSBoardPage`) → kanban de 3 colunas (`nova → em_execucao → concluida`,
+ `cancelada` fora). Botão "Avançar" por card. **Sem Realtime** (só `useQuery`).

`/os/:id` (`OSDetailPage`) → o coração da operação. Já suporta **N veículos por
OS** (`os_vehicles`, `addOsVehicle`/`removeOsVehicle`), e por veículo:

- placa / modelo / ano · tipo carro ou caminhão
- 7–9 slots de foto (frente, traseira, painel antes/depois, mangueira,
  decibéis, opacidade se caminhão)
- OCR de placa/modelo e de KM do odômetro
- medições: nº de frota, opacidade antes/depois, decibéis antes/depois, KM
- painel: luzes acesas antes/depois → "apagaram"
- relatório PDF individual + zip de fotos

`/sales/new` (`NewSalePage`) → registro da descarbonização que **baixa o
estoque de reagente**. Wizard: combustível → porte → fotos.

- `PRECOS = { P: 400, M: 700, G: 1400 }` — **a mesma tabela do `/vender`, duplicada**
- `PORTES_BY_FUEL = { flex: [P, M], diesel: [M, G] }` — **G implica diesel**
- `FRASCOS = { flex: {P:1, M:1}, diesel: {M:1, G:2} }` — consumo de reagente
- `ServiceOsLink` — **anexa opcionalmente** uma OS existente da mesma loja.
  Anexar move a OS para `em_execucao` (`attach_os_moves_kanban`).

### 1.5 Quem lê no Sales

| Tela | Fonte | O que faz |
|---|---|---|
| `/descarbonizacao/os` | `licenciados.service_orders` + Realtime | espelho **read-only** de 3 colunas |
| `/descarbonizacao/agendamentos` | idem, por `scheduled_at` | calendário + próximos 6 |
| `/campo/os` (ops) | idem | mesmo espelho |
| `/comissionamento` (financas) | RPC `crm_comissao_descarb` | base de descarb. com % próprio |
| `/pedidos` | `carboze_orders` | lista a venda, inclusive as só-de-serviço |
| Pós-venda / Produção (ops) | `carboze_orders.items[]` | **exclui** serviço: não entra em rastreio nem gera OP |

### 1.6 Permissões

`20260703140000_os_sales_integration.sql` definiu: o Sales **cria e lê**; a
**execução é exclusiva do Licenciados**. Concretamente:

- `os_create` → `can_use_os() OR is_carbo_sales()`
- `os_advance_stage`, `os_cancel`, fotos, `os_vehicle_*` → **só `can_use_os()`**
- policies de SELECT aditivas para o Sales em `service_orders`, `os_customers`,
  `os_vehicles`
- Realtime publicado nas três tabelas

---

## 2. Os defeitos

**D1 — Comissão dobrada em venda mista faturada.**
`crm_comissao_agregado` soma `o.total` (que **inclui o serviço**) para todo
pedido com `bling_nf_id`; `crm_comissao_descarb` soma os itens `kind=service`
independentemente de NF. Venda que mistura CarboZé + descarbonização e recebe NF
comissiona a descarbonização **duas vezes, com dois percentuais**.

**D2 — Quantidade é ignorada.** 5P + 3M + 1G viram **uma OS com um veículo
vazio**. Não há onde registrar 9 carros.

**D3 — A OS nasce cega.** `os_create` não recebe porte, quantidade nem valor.
Quem executa não sabe o que foi vendido.

**D4 — `descarb_os_id` e `execution_date` são escrita-morta.** Nenhuma tela lê.
Da venda não se chega na OS; da OS não se chega na venda, no valor nem no vendedor.

**D5 — Bonificação some.** Existe no pedido e no PDF, mas nunca vira carro a executar.

**D6 — `frota` nunca é criada.** O tipo sai do CPF/CNPJ. Todo pedido de empresa
vira `b2b`, mesmo com 9 carros.

**D7 — Pedido só de serviço preso em `/pedidos`** com vocabulário de logística
(Pendente → Faturado → Enviado → Entregue) que nunca vai avançar.

**D8 — Nada volta.** OS concluída não marca a venda; venda cancelada não cancela
a OS; falha ao criar a OS só emite um toast e não existe tela de reconciliação.

**D9 — Preço duplicado.** `{P:400, M:700, G:1400}` em `Vender.tsx` (×5) e em
`NewSalePage.tsx`. Divergem em silêncio.

**D10 — Regra de combustível desconhecida no Sales.** `G` só existe em diesel;
`P` só em flex. O vendedor pode vender uma combinação inexecutável.

**D11 — Board do Licenciados sem Realtime.** O Sales recebe push; o Licenciados
não. "Reflete ao vivo" hoje só vale num sentido.

**D12 — Dupla contagem operacional.** `licenciados.services` (baixa de estoque)
e `service_orders` (execução) se ligam por vínculo **opcional**. Existe OS
executada sem `services` e `services` sem OS.

**D14 — Nada fechava a OS.** (achado na fase 5) `attach_os_to_service` movia
para `em_execucao` no primeiro carro e parava; o único caminho para `concluida`
era o botão "Avançar", manual, que não sabia quantos carros a OS tinha. Uma OS
de 9 carros executada ao longo de dias ou ficava pendente para sempre, ou era
fechada no primeiro dia levando 6 carros junto. E `services.service_order_id`
apontava para a OS, não para a vaga — com 9 vagas e 3 serviços, ninguém sabia
quais 3. **Corrigido na fase 5.**

**D13 — A criação da OS pela venda provavelmente nunca funcionou.**
(achado na fase 2) `os_create` aceita `is_carbo_sales()`, mas chama
`os_upsert_customer` por dentro — e essa guarda com `can_use_os()`, que **não**
inclui o Sales. `SECURITY DEFINER` não troca o `auth.uid()`, então o vendedor
levava exceção no meio da criação. Só passava quem fosse admin ou tivesse
`portal_licenciado`. Combinado com o D8 (falha só emite toast), o efeito é uma
venda sem OS e ninguém sabendo. **Corrigido na fase 2.**

---

## 3. A decisão de modelagem

**Uma venda → uma OS → N vagas de veículo, uma por unidade vendida
(incluindo bonificações), cada vaga carregando o seu porte.**

5P + 3M + 1G + 2 bonificadas P = **1 OS com 11 vagas** (7×P, 3×M, 1×G).

**Vale para todo tipo de serviço, sem exceção** (decidido em 2026-07-25): B2C que
compra 3 unidades também gera 1 OS com 3 vagas. Não há regra especial por B2C /
B2B / frota — a quantidade vendida manda, sempre.

Por que assim, e não N OSs:

- é o que o `OSDetailPage` já faz — `os_vehicles` é uma lista, com fotos,
  medições, painel e PDF **por veículo**. Nada precisa ser inventado.
- frota é literalmente esse caso: uma ida, vários carros, um agendamento.
- a conciliação com a venda fica trivial: vagas executadas / vagas vendidas.

As vagas nascem **vazias** (sem placa). O Carbox preenche na execução, como já
faz hoje — só que agora a quantidade certa já está lá esperando.

---

## 4. Plano

As fases estão na ordem de execução. Cada uma só depende das anteriores, e cada
uma é entregável sozinha — dá pra parar entre duas sem deixar o sistema pior do
que estava.

---

### Fase 1 — Comissão dobrada ✅

**Repo:** `carbohub-gestao` · **Tipo:** SQL · **Depende de:** nada
**Resolve:** D1
**Migration:** `20260728000000_comissao_base_produto_sem_servico.sql`

- [x] 1.1 `crm_comissao_agregado`: base de produto vira
      `o.total − carboze_valor_servico(o.items)`. Pedido que zerar (era 100%
      serviço) sai da base e da contagem
- [x] 1.2 `crm_metas_board` recebe a mesma correção — a migration
      `20260715160000` alinhou meta e comissão de propósito, e sem isso o
      alinhamento quebraria
- [x] 1.3 Rodado em produção 2026-07-26

**Aberto, não decidido nesta fase:** se descarbonização *deve* contar na meta do
vendedor. Hoje não conta (meta exige NF, serviço não tem NF); a correção só
removeu a inclusão acidental que acontecia no pedido misto.

*Isolada de propósito: é dinheiro saindo errado hoje e não depende de nenhuma
decisão de modelagem.*

---

### Fase 2 — Banco da OS ✅

**Repo:** `carbohub-licenciados` · **Tipo:** SQL · **Depende de:** nada
**Resolve:** base de D2, D3, D4, D5 · **+ D13** (achado durante a fase)
**Migration:** `20260728100000_os_from_sale_vagas.sql`

- [x] 2.0 **D13 — `os_upsert_customer` guardava com `can_use_os()`**, que não
      inclui `is_carbo_sales()`. Como `os_create` chama essa função por dentro,
      e `SECURITY DEFINER` não troca o `auth.uid()`, o vendedor do Sales levava
      exceção no meio da criação. Guarda passa a aceitar o Sales
- [x] 2.1 `os_vehicles` ganha `porte` (check P/M/G) e `fuel_type`
      (check flex/diesel) — ambos nullable
- [x] 2.2 `service_orders` ganha `sale_order_id`, `sale_order_number`,
      `sale_total`. Sem FK: `carboze_orders` é de outro schema e produto, e uma
      venda apagada não pode derrubar OS já executada
- [x] 2.3 Índice em `service_orders(sale_order_id)`
- [x] 2.4 RPC `licenciados.os_create_from_sale(...)` — `p_items jsonb`
      (`[{porte, qty, bonus}]`) gera `sum(qty + bonus)` vagas em `os_vehicles`,
      `position` 1..N, cada uma com o seu porte. Recusa zero vagas e mais de 200
- [x] 2.5 Policy aditiva de SELECT do Sales em `os_photos`
- [x] 2.6 Rodado em produção 2026-07-26 — conferência `2 · 3 · 1 · 1`

*Só adiciona colunas e uma função nova. `os_create` continua intacta, então o
`/vender` atual segue funcionando enquanto a fase 3 não sobe.*

---

### Fase 3 — `/vender` grava a OS certa ✅

**Repo:** `carbohub-gestao` · **Tipo:** front, **5 cópias**
(`crm`, `ops`, `admin`, `financas`, `ti`) · **Depende de:** fase 2
**Resolve:** D2, D3, D5, D6, D9, D10

- [x] 3.1 Tabela de preços vai para `packages/shell/src/descarb.ts`
      (`@carbo/shell`), com faixa de motor e combustível por porte
- [x] 3.2 Seletor de tipo de serviço (B2C / B2B / Frota); o documento só dá o
      palpite inicial e para de mandar assim que o vendedor escolhe. Frota sem
      data é bloqueada antes de salvar
- [x] 3.3 **Reformulado:** não existe combinação inexecutável — misturar portes
      numa OS é normal. O risco real é vender P para um caminhão, então cada
      porte mostra faixa de motor e combustível na opção e na linha
- [x] 3.4 `os_create_from_sale` no lugar de `os_create`, com bonificação,
      `sale_order_id`, número e total; resumo "1 OS com N veículo(s)" na tela
- [x] 3.5 Replicado nas 5 cópias — `ops`/`admin`/`ti` byte a byte idênticos,
      `financas` difere só na linha do `useAuth`, `crm` no modo de edição
- [x] 3.6 `useCreateOS` (OS sem vagas) removido dos 4 apps onde ficou órfão;
      segue só no `crm`, usado pelo "Nova Descarbonização" manual
- [x] 3.7 Build dos 5 apps passando

---

### Fase 4 — Sales lê a OS de volta 🟡

**Repo:** `carbohub-gestao` (`apps/crm`) · **Depende de:** fase 3
**Resolve:** D4, D7, D8 (parte)

**Migration:** `20260729000000_descarb_vendas_sem_os.sql`

- [x] 4.1 `/descarbonizacao/os`: card e lista mostram `3/9 identificado(s)`,
      quebra de portes (`5P · 3M · 1G`), barra de progresso, nº do pedido e
      valor. **Ver ressalva sobre "identificado" abaixo**
- [x] 4.2 `/descarbonizacao/agendamentos`: evento do calendário mostra `9×`,
      "Próximos" traz veículos + portes + nº do pedido, rodapé soma os veículos
      do mês
- [x] 4.3 `/pedidos`: pedido 100% serviço exibe o estágio da OS
      (OS aberta / Em execução / Executada) e `3/9 veículo(s)`, com badge
      vermelho **Sem OS** quando não há vínculo
- [x] 4.4 Aviso de reconciliação no topo de `/descarbonizacao/os` com a lista
      de vendas sem OS (pedido, cliente, vendedor, valor, datas)
- [ ] 4.5 Rodar a migration em produção

**Ressalva — não existe "executado" por veículo.** `os_vehicles` não tem flag de
conclusão: o estágio (nova / em execução / concluída) é da OS inteira. O
progresso mostrado é **quantas vagas já têm placa**, que é o sinal real de que
alguém pegou aquele carro. Rotulado como "identificado", não "executado", de
propósito. Uma flag por veículo entra na fase 5 ou 6.

---

### Fase 5 — Execução parcial: a OS sabe quando acabou ✅

**Repos:** ambos · **Depende de:** fase 4
**Resolve:** D8, D11, D12 · **+ D14** (achado durante a fase)
**Migration:** `20260729100000_os_execucao_parcial.sql` (licenciados)

**Reescopada.** O plano dizia "OS concluída marca a venda". Ao mapear a
execução apareceu um problema maior: **uma OS de 9 carros é executada ao longo
de dias**, e nada no sistema sabia disso.

- [x] 5.0 **D14 — nada fechava a OS.** `attach_os_to_service` movia para
      `em_execucao` no primeiro carro e parava. O único caminho para
      `concluida` era o botão "Avançar", manual, que não sabia quantos carros
      existiam — clicar nele no primeiro dia fechava a OS com 6 carros por
      fazer. E `services` apontava para a OS, não para a vaga: com 9 vagas e 3
      serviços, ninguém sabia *quais* 3
- [x] 5.1 `os_vehicles` ganha `executed_at`, `service_id`, `cancelled_at`,
      `cancel_reason`
- [x] 5.2 **O estágio da OS passa a ser derivado das vagas** (`os_recalc_stage`
      + trigger): 0 executadas → nova · parcial → em execução · todas →
      concluída. A OS fecha sozinha quando o trabalho acaba
- [x] 5.3 RPC `os_vehicle_execute` — **executar a vaga É registrar a
      descarbonização**: grava o veículo, cria o `services` e baixa o reagente
      da loja da OS, num ato só. Usa a loja da OS e não `current_user_loja()`,
      que é nula para admin
- [x] 5.4 RPC `os_close_with_balance` — fecha com o que foi feito e **move** as
      vagas pendentes para uma OS nova ligada à mesma venda (o porte vai junto,
      a contagem continua batendo com o pedido)
- [x] 5.5 `os_advance_stage` recusa concluir com vaga pendente e aponta o
      fechamento com saldo — era o botão que apagava 6 carros num clique
- [x] 5.6 Licenciados: barra de progresso na OS, badge de porte por veículo,
      bloco "Executar descarbonização" (combustível + frascos + valor, com
      prefill pela combinação vendida e aviso quando porte e combustível não
      batem), botão "Fechar com saldo"
- [x] 5.7 **D11 — Realtime no board do Licenciados.** O Sales recebia push
      desde a integração; aqui faltava. Com os dois lados executando, sem isso
      as telas divergem na hora
- [x] 5.8 Sales troca "identificado" por **executado** de verdade nas três
      telas, e passa a ignorar vagas canceladas
- [x] 5.9 Rodado em produção 2026-07-26 — conferência `4 · 3 · 1`

**Adiado para a fase 6:** venda cancelada cancelar a OS. Depende de o Sales
poder escrever na OS, que é justamente o que a fase 6 abre.

---

### Fase 6 — Execução compartilhada ⬜

**Repos:** ambos · **Depende de:** fase 5 · **A maior e a mais arriscada**
**Resolve:** D11, e o pedido de "executar pelos dois lados"

Hoje o Sales é read-only por policy — `os_advance_stage`, `os_cancel`,
`os_vehicle_*` e upload de fotos exigem `can_use_os()`.

- [ ] 6.1 Realtime no board do Licenciados (hoje só o Sales assina; sem isso os
      dois lados divergem na tela assim que os dois executarem)
- [ ] 6.2 Guardas das RPCs de execução → `can_use_os() OR is_carbo_sales()`
- [ ] 6.3 Policies de INSERT/UPDATE em `os_vehicles` e `os_photos` para o Sales
- [ ] 6.4 Portar o `VehicleCard` do `OSDetailPage` (563 linhas: OCR, storage,
      PDF, medições, painel) para o Sales
- [ ] 6.5 Bucket de fotos acessível aos dois apps

*As fases 1–5 já entregam o fluxo correto com a execução onde ela está hoje.
Esta fase é sobre onde o trabalho pode ser feito, não sobre o dado estar certo.*
