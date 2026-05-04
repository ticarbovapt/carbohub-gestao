# Área Licenciados — Plano Completo de Evolução
> Atualizado: 2026-04-07 (Chat 7)
> Base: análise backend-carbovapt (Java/Spring Boot) + CarboHub atual

---

## 1. O QUE É O BACKEND ANTIGO (backend-carbovapt)

### Stack
- **Java 8 + Spring Boot 2.3.12 + JPA/Hibernate**
- **Banco:** PostgreSQL no DigitalOcean (`carbovapt` DB)
- **Pagamentos:** eRede (cartão crédito/débito)
- **Storage:** Google Cloud Storage (imagens de produtos)
- **Certificados:** Carboflix (API externa — certificado de descarbonização)
- **Auth:** JWT simples (sem Spring Security)
- **Deploy:** GitLab CI → SSH → VPS DigitalOcean

### 4 Schemas do Banco

| Schema | Conteúdo |
|--------|---------|
| `commercial` | Vendas, clientes, veículos, créditos, transações, teste de ruído |
| `institutional` | Filiais (= licenciados), empresa, máquinas |
| `showcase` | Produtos, categorias, preços, estoque por filial |
| `security` | Usuários (operadores + licenciados), investidores, logs |

### Entidades Principais

**Branch (= Licenciado no CarboHub)**
- `id`, `name`, `federalCode` (CNPJ), `city`, `state`, `address`
- `qnt_reagent`, `qnt_reagent_flex`, `qnt_reagent_diesel` — estoque de reagentes
- `check_machine` — contador de descarbonizações na máquina
- `credit`, `creditCurrentMonth` — saldo de créditos
- `plan` (PlanType enum: 23 valores — CREDIT_P, CREDIT_M, CREDIT_G, etc.)
- `isIndicator` (bool) — se é indicador ou licenciado pleno
- `noiseTest`, `carboflix` (bool) — módulos habilitados

**Sale (= OP de Descarbonização)**
- Venda vinculada a Branch (filial), Client (cliente), veículo
- `paymentType`: CREDIT, DEBIT, MONEY, TRANSFER, BILLET, LINK, INDICATOR, CARBOFLIX, VENDING_MACHINE
- `startsMachine` (bool) — se desconta reagente e incrementa check_machine
- `preSale` / `preSaleState` — pré-venda (agendamento)
- Itens: `SaleItem` (produto + quantidade)
- Veículos: `ClientCar` (placa, ano, modelo, km)

**User (= Operador / Licenciado)**
- `commission` — % sobre produtos
- `commissionTax` — % sobre taxa de serviço
- `licensedRelated` — FK para outro User (hierarquia licenciado → indicador)

**Product (= Serviço de Descarbonização)**
- `descarbType`: P (Leve), M (Intermediária), G (Pesada), G+ (OUTRO)
- `plan` — restrição por plano
- `productType`: PRODUCT | SERVICE

---

## 2. MAPEAMENTO: BACKEND ANTIGO → CARBOHUB

| Conceito Antigo | Tabela Antiga | Equivalente CarboHub | Status |
|----------------|--------------|---------------------|--------|
| Branch (filial/licenciado) | `institutional.Branch` | `licensees` | ✅ existe |
| Estoque reagente por filial | `Branch.qnt_reagent*` | ❌ não existe | 🔴 criar |
| Sale (venda/OP descarb) | `commercial.Sale` | `licensee_requests` (parcial) | ⚠️ incompleto |
| Client (cliente final) | `commercial.Client` | ❌ não existe | 🔴 criar |
| ClientCar (veículo) | `commercial.ClientCar` | ❌ não existe | 🔴 criar |
| NoiseTest (teste ruído) | `commercial.NoiseTest` | ❌ não existe | 🟡 futuramente |
| Product (modalidade) | `showcase.Product` | `service_catalog` (parcial) | ⚠️ ajustar |
| Storage (estoque produto) | `showcase.Storage` | `mrp_products` + `warehouse_stock` | ✅ existe |
| Credit (créditos mensais) | `commercial.Credit` | `licensee_wallets` | ✅ existe |
| Transaction (eRede) | `commercial.Transaction` | ❌ não existe | 🟡 integrar |
| Commission | `User.commission` | `licensee_commissions` | ✅ existe |
| Investor | `security.Investor` | ❌ não existe | 🟡 futuramente |
| Carboflix (certificado) | API externa | ❌ não existe | 🟡 integrar |
| Machine | `institutional.Machine` | `machines` | ✅ existe |
| Reagent check_machine | `Branch.check_machine` | `machines.units_dispensed` | ✅ existe |

---

## 3. STACK NOVA (padrão CarboHub)

**Abandonar:** Java Spring Boot + DigitalOcean VPS + eRede SDK Java

**Manter/usar:**
```
Frontend:     React 18 + TypeScript + Vite + Tailwind + shadcn/ui  [já existe]
Backend:      Supabase Edge Functions (Deno/TypeScript)             [já existe]
Banco:        Supabase PostgreSQL                                   [já existe]
Auth:         Supabase Auth + JWT                                   [já existe]
Pagamentos:   Stripe (substituir eRede) ou Asaas (melhor para BR)  [novo]
Storage:      Supabase Storage (substituir Google Cloud Storage)    [novo]
Realtime:     Supabase Realtime (subscriptions)                    [já existe]
```

**Edge Functions a criar** (Node.js/TypeScript via Deno):
- `process-descarb-sale` — processar venda de descarbonização
- `release-monthly-credits` — lançar créditos mensais por filial
- `process-payment` — gateway Stripe/Asaas
- `generate-certificate` — integração Carboflix
- `reagent-stock-alert` — alertas automáticos de reagente baixo

---

## 4. FLUXOS DA ÁREA LICENCIADOS (novo modelo)

### 4.1 Fluxo Principal: Atendimento de Descarbonização

```
[Gestor da Loja]
       │
       ├─► Registrar Cliente
       │     └─► nome, telefone, CPF/CNPJ, e-mail
       │
       ├─► Registrar Veículo
       │     └─► placa, marca, modelo, ano, km atual
       │
       ├─► Selecionar Modalidade
       │     └─► P (Leve) | M (Intermediária) | G (Pesada) | G+ (Pesada Superior)
       │
       ├─► Escolher Pagamento
       │     └─► Créditos do plano | Dinheiro | Cartão | PIX | Boleto
       │
       ├─► Confirmar Atendimento
       │     ├─► Desconta reagente do estoque da filial
       │     ├─► Incrementa contador da máquina
       │     ├─► Gera comissão para o licenciado
       │     ├─► (Opcional) Emite certificado Carboflix
       │     └─► 🔔 ALERTA → CarboOPS: "Nova descarbonização registrada"
       │
       └─► Histórico de Atendimentos
```

### 4.2 Fluxo de Estoque de Reagentes

```
[Licenciado vê estoque de reagente na tela]
       │
       ├─► Visualizar: qtd Flex / Diesel / Normal
       ├─► Solicitar Reposição → 🔔 ALERTA → CarboOPS: "Solicitação de reagente"
       └─► CarboOPS aprova → desconta do estoque central → registra entrega
```

### 4.3 Fluxo de Estoque de Produtos (CarboZé / CarboPRO)

```
[Licenciado monitora estoque de produtos]
       │
       ├─► Visualizar estoque CarboZé 100ml, CarboPRO 100ml, etc.
       ├─► Registrar venda de produto
       │     └─► desconta estoque + gera comissão
       ├─► Solicitar reposição → 🔔 ALERTA → CarboOPS
       └─► CarboOPS processa OP de produção → entrega ao licenciado
```

### 4.4 Fluxo de Agendamento (Pré-Venda)

```
[Cliente agenda online ou gestor registra]
       │
       ├─► Selecionar data/hora disponível
       ├─► Registrar como pré-venda (preSaleState = NOT)
       ├─► No dia: confirmar atendimento → converte em venda real
       └─► 🔔 ALERTA → CarboOPS se não confirmado em 24h
```

### 4.5 Fluxo de Comissões

```
[Automático após cada venda confirmada]
       │
       ├─► Calcula comissão: valor venda × commission%
       │    + taxa serviço × commissionTax%
       ├─► Status: pending → approved (gestor CarboOPS) → paid
       ├─► Indicadores: comissão repassada ao licenciado-pai
       └─► 🔔 ALERTA → CarboOPS: nova comissão para aprovar
```

### 4.6 Vista MasterAdmin 360°

```
[MasterAdmin no Carbo Controle]
       │
       ├─► /licensees — todos os licenciados com KPIs consolidados
       ├─► Por licenciado:
       │     ├─► Atendimentos do mês (P/M/G/G+)
       │     ├─► Estoque reagente atual
       │     ├─► Estoque produtos (CarboZé/CarboPRO)
       │     ├─► Comissões pendentes/pagas
       │     ├─► Máquina: check_machine, última manutenção
       │     └─► Alertas ativos
       └─► Dashboard consolidado: total atendimentos, receita, reagente consumido
```

---

## 5. TABELAS NOVAS A CRIAR NO SUPABASE

### 5.1 `descarb_clients` — Clientes dos Licenciados
```sql
CREATE TABLE descarb_clients (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  licensee_id     uuid NOT NULL REFERENCES licensees(id),
  name            text NOT NULL,
  federal_code    text,          -- CPF ou CNPJ
  phone           text,
  email           text,
  city            text,
  state           char(2),
  created_at      timestamptz DEFAULT now()
);
```

### 5.2 `descarb_vehicles` — Veículos
```sql
CREATE TABLE descarb_vehicles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid REFERENCES descarb_clients(id),
  licensee_id     uuid NOT NULL REFERENCES licensees(id),
  license_plate   text NOT NULL,
  brand           text,
  model           text,
  year            int,
  fuel_type       text,   -- flex, diesel, gasolina
  kilometer       numeric,
  created_at      timestamptz DEFAULT now()
);
```

### 5.3 `descarb_sales` — Atendimentos de Descarbonização
```sql
CREATE TABLE descarb_sales (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  licensee_id         uuid NOT NULL REFERENCES licensees(id),
  machine_id          uuid REFERENCES machines(id),
  client_id           uuid REFERENCES descarb_clients(id),
  vehicle_id          uuid REFERENCES descarb_vehicles(id),
  modality            text NOT NULL,  -- P, M, G, G+
  reagent_type        text NOT NULL,  -- flex, diesel, normal
  reagent_qty_used    numeric(8,3),
  payment_type        text NOT NULL,  -- credits, money, card, pix, invoice, indicator
  total_value         numeric(10,2),
  discount            numeric(10,2) DEFAULT 0,
  is_pre_sale         boolean DEFAULT false,
  pre_sale_status     text,           -- NOT, UNDONE, DONE
  preferred_date      date,
  executed_at         timestamptz,
  carboflix_cert_num  text,
  certificate_issued  boolean DEFAULT false,
  commission_id       uuid,
  notes               text,
  created_by          uuid REFERENCES auth.users(id),
  created_at          timestamptz DEFAULT now()
);
```

### 5.4 `licensee_reagent_stock` — Estoque de Reagentes por Filial
```sql
CREATE TABLE licensee_reagent_stock (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  licensee_id     uuid NOT NULL UNIQUE REFERENCES licensees(id),
  qty_normal      numeric(10,3) DEFAULT 0,
  qty_flex        numeric(10,3) DEFAULT 0,
  qty_diesel      numeric(10,3) DEFAULT 0,
  min_qty_alert   numeric(10,3) DEFAULT 5,
  updated_at      timestamptz DEFAULT now()
);
```

### 5.5 `reagent_movements` — Movimentações de Reagente
```sql
CREATE TABLE reagent_movements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  licensee_id     uuid NOT NULL REFERENCES licensees(id),
  descarb_sale_id uuid REFERENCES descarb_sales(id),
  tipo            text NOT NULL,   -- consumo, reposicao, ajuste
  reagent_type    text NOT NULL,   -- flex, diesel, normal
  quantidade      numeric(10,3),
  saldo_apos      numeric(10,3),
  motivo          text,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz DEFAULT now()
);
```

### 5.6 `licensee_product_stock` — Estoque de Produtos (CarboZé/CarboPRO)
```sql
CREATE TABLE licensee_product_stock (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  licensee_id     uuid NOT NULL REFERENCES licensees(id),
  mrp_product_id  uuid NOT NULL REFERENCES mrp_products(id),
  quantity        numeric(10,2) DEFAULT 0,
  min_qty_alert   numeric(10,2) DEFAULT 10,
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (licensee_id, mrp_product_id)
);
```

### 5.7 `ops_alerts` — Central de Alertas CarboOPS
```sql
CREATE TABLE ops_alerts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo            text NOT NULL,
  -- tipos: reagent_low, product_low, new_sale, new_replenishment_request,
  --        commission_pending, machine_alert, pre_sale_expired
  licensee_id     uuid REFERENCES licensees(id),
  machine_id      uuid REFERENCES machines(id),
  titulo          text NOT NULL,
  descricao       text,
  prioridade      text DEFAULT 'medium',  -- low, medium, high, critical
  status          text DEFAULT 'open',    -- open, in_progress, resolved
  source_table    text,
  source_id       uuid,
  assigned_to     uuid REFERENCES auth.users(id),
  resolved_at     timestamptz,
  resolved_by     uuid REFERENCES auth.users(id),
  created_at      timestamptz DEFAULT now()
);
```

---

## 6. EDGE FUNCTIONS A CRIAR

### `process-descarb-sale` (Node.js/TypeScript)
```
POST /functions/v1/process-descarb-sale
Body: { licensee_id, machine_id, client_id, vehicle_id, modality, reagent_type, payment_type, total_value, ... }

Ações:
1. Validar estoque de reagente (licensee_reagent_stock)
2. Inserir descarb_sales
3. Descontar reagente + inserir reagent_movements
4. Incrementar machines.units_dispensed
5. Se créditos: descontar licensee_wallets
6. Calcular e inserir licensee_commissions (pending)
7. Inserir ops_alerts (new_sale para CarboOPS)
8. Se carboflix habilitado: chamar API Carboflix
9. Verificar se estoque caiu abaixo do mínimo → inserir ops_alerts (reagent_low)
10. Retornar { sale_id, commission_id, certificate_num? }
```

### `release-monthly-credits` (cron mensal)
```
POST /functions/v1/release-monthly-credits
Ações:
1. Buscar todos licensees ativos com plano de crédito
2. Para cada: calcular créditos do plano
3. Inserir credit_transactions (tipo: bonus)
4. Atualizar licensee_wallets.balance
5. Inserir ops_alerts (créditos liberados)
```

### `reagent-stock-alert` (trigger automático)
```
Trigger no PostgreSQL: AFTER UPDATE ON licensee_reagent_stock
Quando qty < min_qty_alert:
→ Inserir ops_alerts (reagent_low, prioridade: high)
→ Notificar via Supabase Realtime
```

---

## 7. PÁGINAS NOVAS NA ÁREA LICENCIADOS

### 7.1 `/licensee/atendimento` — Nova Descarbonização
- Seleção de cliente (busca + cadastro rápido)
- Seleção/cadastro de veículo
- Seleção da modalidade (P/M/G/G+) com cards visuais
- Tipo de combustível (Flex/Diesel/Gasolina)
- Forma de pagamento
- Valor + desconto
- Pré-venda ou imediato
- Botão confirmar → dispara Edge Function

### 7.2 `/licensee/clientes` — Minha Carteira de Clientes
- Lista de clientes cadastrados
- Busca por nome/placa/CPF
- Histórico de atendimentos por cliente
- Cadastro rápido de cliente + veículo

### 7.3 `/licensee/reagentes` — Estoque de Reagentes
- Cards: Flex / Diesel / Normal com barra de nível
- Histórico de consumo (gráfico 30 dias)
- Botão "Solicitar Reposição" → cria ops_alert no CarboOPS
- Estimativa de dias restantes com base no consumo médio

### 7.4 `/licensee/produtos` — Estoque de Produtos
- Cards: CarboZé 100ml, CarboPRO 100ml, etc.
- Nível de estoque com alerta visual
- Botão "Solicitar Reabastecimento" → alerta CarboOPS
- Histórico de vendas de produto

### 7.5 `/licensee/atendimentos` — Histórico de Atendimentos
- Substituir atual LicenseeRequests com dados reais de descarb_sales
- Filtros: data, modalidade, pagamento, cliente, placa
- Export Excel/PDF
- KPIs: total atendimentos, receita, modalidade mais vendida

### 7.6 Melhorar: `/licensee/dashboard`
- KPIs: atendimentos do mês, reagente disponível, produtos em estoque
- Alertas ativos
- Gráfico de atendimentos por modalidade (P/M/G)
- Próximas pré-vendas agendadas

---

## 8. PÁGINAS/VIEWS NOVAS NO CARBO CONTROLE (MasterAdmin 360°)

### 8.1 `/licensees/:id` — Melhorar LicenseeDetails
- Adicionar: estoque reagente, estoque produtos, atendimentos do mês
- Alertas ativos do licenciado
- Histórico de reposições aprovadas

### 8.2 `/ops-alerts` — Central de Alertas
- Tabela de todos os ops_alerts em aberto
- Filtros: tipo, prioridade, licenciado, status
- Ações: assumir, resolver, escalar
- Badge de contagem no menu lateral

### 8.3 Dashboard CEO — Adicionar painel licenciados
- Total atendimentos CarboVAPT hoje / mês
- Mapa de calor: atendimentos por estado
- Top 5 licenciados por volume

---

## 9. ALERTAS (INTEGRAÇÃO LICENCIADO ↔ CARBOOPS)

| Evento | Alerta | Prioridade | Responsável CarboOPS |
|--------|--------|-----------|---------------------|
| Reagente abaixo do mínimo | `reagent_low` | 🔴 High | Gestão Suprimentos |
| Produto abaixo do mínimo | `product_low` | 🟡 Medium | Gestão MRP/Produção |
| Nova descarbonização registrada | `new_sale` | 🟢 Low | Automático |
| Solicitação de reagente | `replenishment_request` | 🔴 High | Gestão Logística |
| Solicitação de produto | `product_request` | 🟡 Medium | Gestão Logística |
| Comissão aguardando aprovação | `commission_pending` | 🟡 Medium | Financeiro |
| Pré-venda não confirmada em 24h | `pre_sale_expired` | 🟡 Medium | Gestão Licenciados |
| Máquina com alerta | `machine_alert` | 🔴 High | Gestão Técnica |
| Licenciado sem atendimento em 7 dias | `inactivity_alert` | 🟡 Medium | Gestão Comercial |

---

## 10. PLANO DE EXECUÇÃO (SPRINTS)

### Sprint A — Fundação (estrutura de dados)
1. SQL: tabelas `descarb_clients`, `descarb_vehicles`, `descarb_sales`
2. SQL: tabelas `licensee_reagent_stock`, `reagent_movements`
3. SQL: tabela `ops_alerts`
4. SQL: tabela `licensee_product_stock`
5. Edge Function: `process-descarb-sale`
6. Hooks: `useDescarbSales`, `useDescarbClients`, `useReagentStock`

### Sprint B — Área Licenciado (novas páginas)
1. `/licensee/atendimento` — formulário novo atendimento
2. `/licensee/clientes` — carteira de clientes
3. `/licensee/reagentes` — estoque de reagentes
4. Melhorar `/licensee/dashboard` com KPIs reais

### Sprint C — CarboOPS (alertas + 360°)
1. `/ops-alerts` — central de alertas
2. Badge de alertas no menu lateral
3. Melhorar `/licensees/:id` com dados consolidados
4. Widget alertas no CeoDashboard

### Sprint D — Produtos & Financeiro
1. `/licensee/produtos` — estoque produtos
2. Integração BOM MRP com estoque licenciado
3. Fluxo de aprovação de comissões no CarboOPS
4. Edge Function: `release-monthly-credits`

### Sprint E — Pagamentos & Certificados (futuro)
1. Gateway Stripe ou Asaas (substituir eRede)
2. Integração Carboflix (certificados de descarbonização)
3. `/licensee/agendamento` — agenda pública com link para cliente

---

## 11. O QUE SAI DO BACKEND ANTIGO

| Item | Decisão | Justificativa |
|------|---------|--------------|
| Java Spring Boot | ❌ Abandonar | Substituído por Supabase Edge Functions (TypeScript) |
| eRede SDK | ❌ Substituir | Usar Stripe ou Asaas (melhor suporte BR + PIX nativo) |
| PostgreSQL DigitalOcean | ❌ Migrar dados | Migrar para Supabase PostgreSQL |
| Google Cloud Storage | ❌ Substituir | Usar Supabase Storage |
| GitLab CI + VPS | ❌ Desativar | GitHub Actions + GitHub Pages já funcionando |
| Schema `security.Investor` | 🟡 Analisar | Pode virar perfil dentro do CarboHub |
| Carboflix API | ✅ Manter integração | Criar Edge Function proxy em TypeScript |
| `NoiseTest` (teste ruído) | 🟡 Sprint futuro | Baixa prioridade |
| `PlanType` (23 valores) | ✅ Simplificar | Mapear para `subscription_plans` existente |

---

## 12. SQL SCRIPTS NECESSÁRIOS (Sprint A)

Todos os scripts SQL do Sprint A serão gerados e enviados para rodar no Supabase SQL Editor.

Tabelas a criar:
1. `descarb_clients` — clientes dos licenciados
2. `descarb_vehicles` — veículos
3. `descarb_sales` — atendimentos de descarbonização
4. `licensee_reagent_stock` — estoque reagentes por filial
5. `reagent_movements` — movimentações de reagente
6. `licensee_product_stock` — estoque produtos por licenciado
7. `ops_alerts` — central de alertas CarboOPS
