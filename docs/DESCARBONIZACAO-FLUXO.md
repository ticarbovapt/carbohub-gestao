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
| **1** | Comissão dobrada em venda mista | gestão (SQL) | 🟡 |
| **2** | Banco da OS: porte, vagas e elo com a venda | licenciados (SQL) | ⬜ |
| **3** | `/vender` grava a OS certa | gestão (5 apps) | ⬜ |
| **4** | Sales lê a OS de volta | gestão (crm) | ⬜ |
| **5** | Fechar o ciclo OS ↔ venda | ambos | ⬜ |
| **6** | Execução compartilhada nos dois apps | ambos | ⬜ |

Detalhe de cada fase, com os passos individuais, na seção 4.

### Registro de entregas

| Data | Fase | O que entrou | Commit |
|---|---|---|---|
| 2026-07-25 | 0 | Mapeamento das 4 telas + 12 defeitos + modelo de vagas | `7706c41` |

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

### Fase 1 — Comissão dobrada 🟡

**Repo:** `carbohub-gestao` · **Tipo:** SQL · **Depende de:** nada
**Resolve:** D1
**Migration:** `20260728000000_comissao_base_produto_sem_servico.sql`

- [x] 1.1 `crm_comissao_agregado`: base de produto vira
      `o.total − carboze_valor_servico(o.items)`. Pedido que zerar (era 100%
      serviço) sai da base e da contagem
- [x] 1.2 `crm_metas_board` recebe a mesma correção — a migration
      `20260715160000` alinhou meta e comissão de propósito, e sem isso o
      alinhamento quebraria
- [ ] 1.3 Rodar em produção e conferir o impacto (query de verificação no fim
      da migration)

**Aberto, não decidido nesta fase:** se descarbonização *deve* contar na meta do
vendedor. Hoje não conta (meta exige NF, serviço não tem NF); a correção só
removeu a inclusão acidental que acontecia no pedido misto.

*Isolada de propósito: é dinheiro saindo errado hoje e não depende de nenhuma
decisão de modelagem.*

---

### Fase 2 — Banco da OS ⬜

**Repo:** `carbohub-licenciados` · **Tipo:** SQL · **Depende de:** nada
**Resolve:** base de D2, D3, D4, D5

- [ ] 2.1 `os_vehicles` ganha `porte text check (porte in ('P','M','G'))` e
      `fuel_type text` (nullable — o operador confirma na execução)
- [ ] 2.2 `service_orders` ganha o elo de volta: `sale_order_id uuid`,
      `sale_order_number text`, `sale_total numeric`
- [ ] 2.3 Índice em `service_orders(sale_order_id)`
- [ ] 2.4 RPC `licenciados.os_create_from_sale(...)` — cliente + tipo +
      agendamento + `p_items jsonb` (`[{porte, qty, bonus}]`); cria a OS e
      `sum(qty + bonus)` linhas em `os_vehicles`, `position` 1..N, cada uma com
      o seu porte. Reaproveita `os_upsert_customer`.
      Permissão: `can_use_os() OR is_carbo_sales()`
- [ ] 2.5 Policy de SELECT do Sales em `os_photos` (hoje só `service_orders`,
      `os_customers` e `os_vehicles`) — necessária pra fase 4 mostrar progresso

*Só adiciona colunas e uma função nova. `os_create` continua existindo intacta,
então o `/vender` atual segue funcionando enquanto a fase 3 não sobe.*

---

### Fase 3 — `/vender` grava a OS certa ⬜

**Repo:** `carbohub-gestao` · **Tipo:** front, **5 cópias**
(`crm`, `ops`, `admin`, `financas`, `ti`) · **Depende de:** fase 2
**Resolve:** D2, D3, D5, D6, D9, D10

- [ ] 3.1 Extrair `DESCARB_MODALIDADES` para um módulo único compartilhado,
      alinhado com `PRECOS` do Licenciados
- [ ] 3.2 Seletor explícito de tipo de serviço (B2C / B2B / Frota), com default
      derivado do documento. Frota exige previsão de execução
- [ ] 3.3 Aviso quando a combinação de portes for inexecutável
      (`G` só existe em diesel, `P` só em flex)
- [ ] 3.4 Trocar `os_create` por `os_create_from_sale`, passando os itens de
      serviço **com bonificação** e o `sale_order_id` / número / total
- [ ] 3.5 Replicar nas 5 cópias e conferir uma a uma (o CRM tem modo de edição;
      as outras quatro só criam)

---

### Fase 4 — Sales lê a OS de volta ⬜

**Repo:** `carbohub-gestao` (`apps/crm`) · **Depende de:** fase 3
**Resolve:** D4, D7, D8 (parte)

- [ ] 4.1 `/descarbonizacao/os`: card com progresso de veículos (`3/11`),
      portes, nº do pedido e valor, com link pro pedido
- [ ] 4.2 `/descarbonizacao/agendamentos`: evento mostra quantos carros e o porte
- [ ] 4.3 `/pedidos`: pedido só de serviço exibe o estágio da **OS**, não o de
      logística
- [ ] 4.4 Reconciliação "Vendas de descarbonização sem OS" — mata a falha
      silenciosa de hoje (toast perdido = venda sem OS pra sempre)

---

### Fase 5 — Fechar o ciclo ⬜

**Repos:** ambos · **Depende de:** fase 4
**Resolve:** D8, D12

- [ ] 5.1 OS concluída marca a venda (trigger ou coluna derivada)
- [ ] 5.2 Venda cancelada cancela a OS
- [ ] 5.3 `licenciados.services` (baixa de estoque) passa a exigir OS quando a
      OS veio de venda — hoje o vínculo é opcional e os dois divergem

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
