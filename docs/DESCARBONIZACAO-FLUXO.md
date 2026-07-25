# Descarbonização — mapeamento ponta a ponta e plano de correção

Dois apps, um banco. Este documento mapeia o que existe hoje entre **Carbo Sales**
(`carbohub-gestao/apps/*`) e **Licenciados/Carbox** (`carbohub-licenciados`), e
propõe o plano para os dois coexistirem sem quebrar.

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

---

## 3. A decisão de modelagem

**Uma venda → uma OS → N vagas de veículo, uma por unidade vendida
(incluindo bonificações), cada vaga carregando o seu porte.**

5P + 3M + 1G + 2 bonificadas P = **1 OS com 11 vagas** (7×P, 3×M, 1×G).

Por que assim, e não N OSs:

- é o que o `OSDetailPage` já faz — `os_vehicles` é uma lista, com fotos,
  medições, painel e PDF **por veículo**. Nada precisa ser inventado.
- frota é literalmente esse caso: uma ida, vários carros, um agendamento.
- a conciliação com a venda fica trivial: vagas executadas / vagas vendidas.

As vagas nascem **vazias** (sem placa). O Carbox preenche na execução, como já
faz hoje — só que agora a quantidade certa já está lá esperando.

---

## 4. Plano

### Fase 1 — Banco (repo `carbohub-licenciados`)

1. `os_vehicles` ganha `porte text check (porte in ('P','M','G'))` e
   `fuel_type` (nullable — o operador confirma na execução).
2. `service_orders` ganha o elo de volta: `sale_order_id uuid`,
   `sale_order_number text`, `sale_total numeric`.
3. Nova RPC **`licenciados.os_create_from_sale(...)`** — recebe cliente + tipo +
   agendamento + `p_items jsonb` (`[{porte, qty, bonus}]`) e cria a OS com
   `sum(qty + bonus)` linhas em `os_vehicles`, `position` 1..N, cada uma com o
   seu porte. Reaproveita `os_upsert_customer`. Permissão:
   `can_use_os() OR is_carbo_sales()`.
4. Índice em `service_orders(sale_order_id)`.

*Reversível: colunas novas + função nova, nada é reescrito.*

### Fase 2 — Sales grava direito (5 cópias do `/vender`)

1. Trocar `os_create` por `os_create_from_sale`, passando os itens de serviço
   **com bonificação**.
2. Seletor explícito de **tipo de serviço** (B2C / B2B / Frota) no bloco de
   serviço, com default derivado do documento. Frota exige previsão de execução
   (`os_create` já levanta exceção sem `scheduled_at`).
3. Enviar `sale_order_id` / `order_number` / total.
4. Extrair `DESCARB_MODALIDADES` para um único módulo compartilhado e alinhar
   com `PRECOS` do Licenciados (**D9**).
5. Avisar no formulário quando a combinação de portes for inexecutável (**D10**).

### Fase 3 — Sales lê de volta

1. `/descarbonizacao/os`: card mostra **progresso de veículos** (`3/11
   executados`), portes, nº do pedido e valor, com link para o pedido.
2. `/descarbonizacao/agendamentos`: evento mostra quantos carros e o porte.
3. `/pedidos`: pedido só de serviço passa a exibir o estágio da **OS**, não o de
   logística (**D7**).
4. Tela/aba de reconciliação: **"Vendas de descarbonização sem OS"** — mata a
   falha silenciosa do **D8**.

### Fase 4 — Comissão e financeiro

1. Corrigir `crm_comissao_agregado`: somar só itens `kind != 'service'` em vez de
   `o.total` (**D1**). *Independe de todo o resto — pode ir primeiro.*
2. Decidir se descarbonização entra na meta (`crm_metas_board` hoje só conta com NF).

### Fase 5 — Execução compartilhada (o pedido de "os dois executam")

Hoje o Sales é read-only por policy. Para executar dos dois lados:

1. Trocar a guarda de `os_advance_stage`, `os_cancel`, `os_vehicle_*` e upload de
   fotos para `can_use_os() OR is_carbo_sales()`.
2. Policies de INSERT/UPDATE em `os_vehicles` e `os_photos` para o Sales.
3. Portar o `VehicleCard` do `OSDetailPage` para o Sales (é o arquivo mais
   pesado dos dois repos — 563 linhas, com OCR, storage e PDF).
4. Realtime no board do Licenciados (**D11**), senão os dois lados divergem na tela.

*Esta fase é a maior e a mais arriscada. As fases 1–4 já entregam o fluxo
correto com a execução onde ela está hoje.*

### Fase 6 — Fechar o ciclo

1. `licenciados.services` passa a exigir OS quando a OS veio de venda (**D12**).
2. OS concluída marca a venda; venda cancelada cancela a OS (**D8**).

---

## 5. Ordem sugerida

`Fase 4.1` (bug de dinheiro, isolado) → `Fase 1` → `Fase 2` → `Fase 3` →
`Fase 6` → `Fase 5`.
