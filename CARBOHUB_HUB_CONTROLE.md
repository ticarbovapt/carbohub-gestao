# CarboHub — Hub de Controle: Documentação Técnica Completa
> Gerado em 15/04/2026 | Versão baseada no estado atual do codebase

---

## Sumário
1. [Visão Geral da Plataforma](#1-visão-geral-da-plataforma)
2. [Autenticação e Sistema de Papéis](#2-autenticação-e-sistema-de-papéis)
3. [Navegação e Layout (BoardLayout)](#3-navegação-e-layout-boardlayout)
4. [Rotas Completas](#4-rotas-completas)
5. [Páginas — Hub de Controle (OPS/Admin)](#5-páginas--hub-de-controle-opsadmin)
6. [Hooks e Camada de Dados](#6-hooks-e-camada-de-dados)
7. [Schema do Banco de Dados](#7-schema-do-banco-de-dados)
8. [Edge Functions (Supabase)](#8-edge-functions-supabase)
9. [Migrações SQL — Histórico](#9-migrações-sql--histórico)
10. [Integrações Externas](#10-integrações-externas)

---

## 1. Visão Geral da Plataforma

CarboHub é um sistema de gestão operacional do Grupo Carbo composto por três áreas principais:

| Área | Prefixo de Rota | Público-alvo |
|------|-----------------|--------------|
| **Hub de Controle (OPS)** | `/dashboard`, `/orders`, `/team`... | Admin, CEO, Gestores, Operadores |
| **Portal Licenciado** | `/licensee/*` | Licenciados |
| **PDV** | `/pdv/*` | Operadores de Ponto de Venda |

**Stack tecnológico:**
- Frontend: React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui
- Backend: Supabase (PostgreSQL + RLS + Edge Functions Deno)
- State management: TanStack Query (React Query) v5
- Roteamento: React Router v6
- Charts: Recharts
- Tabelas: TanStack Table v8
- Notificações: Sonner (toast)
- Ícones: Lucide React

---

## 2. Autenticação e Sistema de Papéis

### 2.1 Roles do Sistema (app_role enum)

| Role | Nível | Descrição |
|------|-------|-----------|
| `admin` | 1 | Acesso total ao sistema |
| `manager` | 2 | Gestão operacional |
| `operator` | 3 | Operações do dia a dia |
| `viewer` | 4 | Somente leitura |

### 2.2 Papéis Carbo Estendidos (carbo_role em profiles)

| carbo_role | Função | Acesso típico |
|------------|--------|---------------|
| `ceo` | CEO / Liderança | Tudo + Cockpit Estratégico + Governança |
| `gestor_adm` | Gestor Administrativo | CRUD completo em módulos OPS |
| `gestor_fin` | Gestor Financeiro | Módulos financeiros + RCs |
| `gestor_compras` | Gestor de Compras | Suprimentos + Sugestões de reposição |
| `operador_fiscal` | Operador Fiscal | Dashboard simplificado |
| `operador` | Operador | Dashboards + leitura geral |
| `operador_licenciado` / `licensed_user` | Licenciado | Portal /licensee/* |

### 2.3 Hooks de Permissão (AuthContext)

```typescript
isAdmin          // role = "admin"
isManager        // role = "manager"
isCeo            // carbo_role = "ceo"
isMasterAdmin    // admin + CEO combinado
isAnyGestor      // gestor_adm | gestor_fin | gestor_compras
isGestorAdm      // carbo_role = "gestor_adm"
isGestorFin      // carbo_role = "gestor_fin"
isGestorCompras  // carbo_role = "gestor_compras"
isOperadorFiscal // carbo_role = "operador_fiscal"
isAnyOperador    // qualquer operador
carboRoles       // array com todos os roles do usuário
passwordMustChange // flag para forçar troca de senha
```

### 2.4 Padrão RLS (Row Level Security)

Todas as tabelas sensíveis usam RLS. Padrão geral:

```sql
-- Leitura: admin/CEO/gestor
is_admin(uid) OR is_ceo(uid) OR is_gestor(uid)

-- Escrita: admin/CEO apenas
is_admin(uid) OR is_ceo(uid)

-- Próprio registro: usuário lê/edita o seu
auth.uid() = id

-- Todos autenticados (leitura pública interna)
auth.role() = 'authenticated'
```

---

## 3. Navegação e Layout (BoardLayout)

**Arquivo:** `src/components/layouts/BoardLayout.tsx`

O sidebar possui **3 abas principais** + elementos globais:

### 3.1 Aba Dash — Dashboards

| Rota | Label | Ícone |
|------|-------|-------|
| `/dashboard` | Visão Geral | LayoutDashboard |
| `/dashboards/producao` | Produção | Factory |
| `/dashboards/financeiro` | Financeiro | Wallet |
| `/dashboards/logistica` | Logística | Truck |
| `/dashboards/comercial` | Comercial | TrendingUp |
| `/dashboards/estrategico` | Estratégico | Star |

### 3.2 Aba Ops — Operações

| Seção | Rota | Label | Ícone | Restrição |
|-------|------|-------|-------|-----------|
| **Produção** | `/production-orders` | Ordens de Produção (OP) | Factory | — |
| **Descarbonização** | `/os` | Ordens de Serviço (OS) | ClipboardList | — |
| **CarboOPS** | `/ops/alerts` | Central de Alertas | Bell | Badge com contagem |
| | `/ops/pdv-network` | Rede PDV | Store | — |
| **Comercial** | `/crm` | CRM — Funis de Venda | Target | — |
| | `/orders` | Pedidos (RV) | ShoppingCart | — |
| | `/sales-targets` | Metas de Vendas | TrendingUp | — |
| **Financeiro & Supply** | `/financeiro` | Financeiro | Wallet | — |
| | `/suprimentos` | Suprimentos | Package | — |
| | `/integrations/bling` | Integrações Bling | Link2 | `financeOrMasterOnly` |
| | `/logistics` | Logística | Truck | — |

### 3.3 Aba Controle

| Rota | Label | Ícone | Restrição |
|------|-------|-------|-----------|
| `/mrp/products` | Catálogo (Insumos/SKUs) | Package | — |
| `/mrp/suppliers` | Fornecedores | Factory | — |
| `/licensees` | Licenciados | Building2 | — |
| `/team` | Equipe | Users | — |
| `/import` | Importar Dados | FileSpreadsheet | — |

### 3.4 Elementos Globais do Layout

| Elemento | Comportamento |
|----------|---------------|
| **Badge de Alertas** | `/ops/alerts` mostra badge vermelho com count de `open + in_progress`, atualizado a cada 60s via `useOpsAlertsBadge()` |
| **Botão (+) Quick Actions** | Nova OP, Novo Licenciado, Nova Conta (admin/CEO), Nova RC (Financeiro) |
| **NotificationBell** | Painel de notificações (drawer lateral) |
| **AI Chat Drawer** | Chat com AI assistant (botão ⭐ canto inferior direito) |
| **Dark/Light Mode** | Toggle no header |
| **Avatar/Role** | Footer do sidebar mostra role: Master Admin / CEO / Gestor / Admin / Operador |

### 3.5 Ferramentas de Gestão (visível em `/team` para admin/CEO)

| Botão | Rota destino |
|-------|-------------|
| Organograma | `/org-chart` |
| Governança | `/governance` |
| Matriz de Acesso | `/role-matrix` |
| Aprovações | `/admin/approval` |
| Mapa de Responsabilidades | `/responsibility-map` |
| Integrações Bling | `/integrations/bling` |

---

## 4. Rotas Completas

### 4.1 Rotas Públicas

| Rota | Componente | Função |
|------|-----------|--------|
| `/` | `AreaSelector` | Seleção de área (OPS / Licenciado / PDV) |
| `/login/:area` | `LoginArea` | Login por área |
| `/change-password` | `ChangePassword` | Troca de senha obrigatória |
| `/set-password` | `SetPassword` | Definir senha (primeiro acesso) |
| `/reset-password` | `ResetPassword` | Reset de senha |
| `/onboarding` | `Onboarding` | Onboarding novo usuário |
| `/integrations/bling/callback` | `BlingCallback` | OAuth2 callback do Bling |

### 4.2 Rotas Hub de Controle (OPS)

| Rota | Componente | Roles mínimos |
|------|-----------|---------------|
| `/home` | `HomeHub` | Autenticado |
| `/dashboard` | `Dashboard` | Autenticado |
| `/dashboards/producao` | `DashboardProducao` | Autenticado |
| `/dashboards/financeiro` | `DashboardFinanceiro` | Autenticado |
| `/dashboards/logistica` | `DashboardLogistica` | Autenticado |
| `/dashboards/comercial` | `DashboardComercial` | Autenticado |
| `/dashboards/estrategico` | `DashboardEstrategico` | Autenticado |
| `/team` | `Team` | Autenticado |
| `/org-chart` | `OrgChartPage` | Autenticado |
| `/os` | `OSBoard` | Autenticado |
| `/os/:id` | `OSDetails` | Autenticado |
| `/checklist` | `Checklist` | Autenticado |
| `/scheduling` | `Scheduling` | Autenticado |
| `/licensees` | `Licensees` | Autenticado |
| `/licensees/:id` | `LicenseeDetails` | Autenticado |
| `/machines` | `Machines` | Autenticado |
| `/orders` | `Orders` | Autenticado |
| `/orders/new` | `CreateOrder` | Manager+ |
| `/orders/:id` | `OrderDetails` | Autenticado |
| `/role-matrix` | `RoleMatrix` | Admin/CEO |
| `/responsibility-map` | `ResponsibilityMap` | Admin/CEO |
| `/sales-targets` | `SalesTargets` | Autenticado |
| `/b2b` | `B2BLeads` | Autenticado |
| `/b2b/funnel` | `B2BFunnel` | Autenticado |
| `/crm` | `CRMDashboard` | Autenticado |
| `/crm/:funnelType` | `CRMFunnel` | Autenticado |
| `/import` | `DataImport` | Manager+ |
| `/mapa-territorial` | `MapaTerritorial` | Autenticado |
| `/ops/network-map` | `NetworkMap` | Autenticado |
| `/ops/licensee-ranking` | `LicenseeRanking` | Autenticado |
| `/ops/territory-intelligence` | `TerritoryIntelligence` | Autenticado |
| `/ops/territory-expansion` | `TerritoryExpansion` | Autenticado |
| `/logistics` | `Logistics` | Autenticado |
| `/purchasing` | `Purchasing` | Autenticado |
| `/financeiro` | `Financeiro` | Autenticado |
| `/suprimentos` | `Suprimentos` | Autenticado |
| `/mrp/products` | `MrpProducts` | Autenticado |
| `/mrp/suppliers` | `MrpSuppliers` | Autenticado |
| `/skus` | `Skus` | Autenticado |
| `/lots` | `Lots` | Autenticado |
| `/production-orders` | `ProductionOrdersOP` | Autenticado |
| `/production-orders/:id` | `ProductionOrderDetail` | Autenticado |
| `/ops/alerts` | `OpsAlerts` | Autenticado |
| `/ops/pdv-network` | `OpsNetwork` | Autenticado |
| `/ai-assistant` | `AIAssistantPage` | Autenticado |
| `/integrations/bling` | `BlingIntegration` | Finance/Admin |
| `/admin` | `Admin` | `requiredRole="admin"` |
| `/admin/approval` | `AdminApproval` | `requiredRole="admin"` |
| `/admin/cockpit` | `CockpitEstrategico` | Admin + CEO |
| `/governance` | `CarboGovernance` | CEO |

### 4.3 Rotas Portal Licenciado

| Rota | Componente |
|------|-----------|
| `/licensee/new` | `NewLicensee` |
| `/licensee/dashboard` | `LicenseeDashboard` |
| `/licensee/vapt` | `LicenseeVapt` |
| `/licensee/produtos` | `LicenseeProducts` |
| `/licensee/pedidos` | `LicenseeRequests` |
| `/licensee/creditos` | `LicenseeCredits` |
| `/licensee/comissoes` | `LicenseeCommissions` |
| `/licensee/atendimentos` | `LicenseeAtendimento` |
| `/licensee/clientes` | `LicenseeClientes` |
| `/licensee/reagentes` | `LicenseeReagentes` |
| `/licenciado/carboVAPT/servicos` | `CarboVAPTServices` |
| `/licenciado/carboVAPT/checkout` | `CarboVAPTCheckout` |
| `/licenciado/carboVAPT/pagamento` | `CarboVAPTPayment` |
| `/licenciado/carboVAPT/confirmacao` | `CarboVAPTConfirmation` |

### 4.4 Rotas PDV

| Rota | Componente |
|------|-----------|
| `/pdv/dashboard` | `PDVDashboard` |
| `/pdv/pos` | `PDVPos` |
| `/pdv/estoque` | `PDVEstoque` |
| `/pdv/vendedores` | `PDVVendedores` |
| `/pdv/ranking` | `PDVRanking` |

---

## 5. Páginas — Hub de Controle (OPS/Admin)

---

### 5.1 Dashboard (`/dashboard`)
**Arquivo:** `src/pages/Dashboard.tsx`

**Adaptação por role:**

| Condição | Componente renderizado |
|----------|----------------------|
| `isCeo \|\| isAdmin` | `CeoDashboard` |
| `isGestorAdm` | `GestorDashboard { role: "gestor_adm" }` |
| `isGestorFin` | `GestorDashboard { role: "gestor_fin" }` |
| `isGestorCompras` | `GestorDashboard { role: "gestor_compras" }` |
| `isAnyGestor \|\| isManager` | `GestorDashboard { role: "gestor_adm" }` |
| `isOperadorFiscal` | `OperadorDashboard { role: "operador_fiscal" }` |
| `isAnyOperador \|\| isOperador` | `OperadorDashboard { role: "operador" }` |
| default | `DefaultDashboard` |

**DefaultDashboard — Seções UI:**
- Filtro de período: Hoje / Esta semana / Este mês + Filtro de unidade
- KPI Grid: Taxa de Conclusão, Alertas Pendentes, Tempo Médio, OP Ativas
- Gráficos: `TrendChart` (checklists 7d), `TrendChart` (OPs 7d), `DepartmentChart`
- Tabela de checklists recentes: Departamento, OS, Operador, Horário, Status
- Card de AI Anomaly Assistant

**Tabelas Supabase:** `service_orders`, `os_checklists`, `profiles`

**Hooks:** `useDashboardStats(period)`, `useRecentChecklists(10)`, `useChecklistTrend(7)`, `useOSTrend(7)`, `useDepartmentDistribution()`

---

### 5.2 Controle de Pedidos (`/orders`)
**Arquivo:** `src/pages/Orders.tsx`

**Seções UI:**
| Seção | Descrição |
|-------|-----------|
| Header | Botão Atualizar (invalida cache `carboze-orders` + `carboze-order-stats`) + Exportar dropdown (Excel/CSV/PDF) + Novo Pedido (manager+) |
| Abas | Pedidos (lista) / Relatórios (`OrdersAnalytics`) |
| KPIs | Total Pedidos, Pendentes, Enviados, Entregues, Faturamento |
| Pipeline | 6 colunas de status clicáveis para filtrar: Pendente, Confirmado, Faturado, Enviado, Entregue, Cancelado |
| Filtros linha 1 | Search, Status select, Tipo (Spot/Recorrente) |
| Filtros linha 2 | Date range (De/Até), Produto/Linha, Vendedor, Cliente |
| Tabela | Pedido, NF, Produto, Tipo, Vendedor, Cliente, Data, Qtd, Total, Status, Editar (admin) |
| Dialogs | `EditOrderDialog` (admin apenas) |

**Tabelas Supabase:**
- `carboze_orders_secure` (view — leitura via `useOrders` + `useOrderStats`)
- `carboze_orders` (escrita via `useUpdateOrder`)
- `licensees` (join)
- `sku` (join)

**Handlers principais:**

| Handler | Função |
|---------|--------|
| `handleRefreshAll()` | Invalida queries `carboze-orders` e `carboze-order-stats` via React Query |
| `handleExportExcel()` | Gera XLSX com XLSX.js |
| `handleExportCsv()` | Gera CSV + download |
| `handleExportPdf()` | Abre janela de impressão |

**State:** `searchQuery`, `statusFilter`, `typeFilter`, `productFilter`, `vendedorFilter`, `clienteFilter`, `dateFrom`, `dateTo`, `activeTab`, `isEditDialogOpen`, `selectedOrder`

---

### 5.3 Integração Bling (`/integrations/bling`)
**Arquivo:** `src/pages/BlingIntegration.tsx`

**Seções UI:**
| Seção | Descrição |
|-------|-----------|
| Status card | Badge Conectado/Token Expirado + botões Conectar / Desconectar / Renovar |
| Cards Sync | Produtos (83), Contatos (554), Pedidos (0) — cada um com botão Sincronizar individual |
| Sincronizar Tudo | Roda products → contacts → orders sequencialmente (sem enviar "all" para edge function) |
| Importar Bling → CarboHub | Bridge client-side: lê `bling_orders` → escreve em `carboze_orders` |
| Info card | Instruções de uso do workflow |
| Histórico | Tabela `bling_sync_log` (últimos 10) |

**Mapeamento SKU → Linha (constante `SKU_TO_LINHA`):**

| Código Bling | Linha CarboHub |
|-------------|----------------|
| SKU-CZ100 / CZ100 | carboze_100ml |
| SKU-CZ1L / CZ1L | carboze_1l |
| SKU-CZSC10 / CZSC10 | carboze_sache_10ml |
| SKU-CP100 / CP100 | carbopro |
| SKU-VAPT70 / VAPT70 | carbovapt |

**Lógica `detectLinha(name)` — fallback por nome do produto:**
- Contém "sach" ou "10ml" (sem "100ml") → `carboze_sache_10ml`
- Contém " 1l" / "1l " → `carboze_1l`
- Contém "carbopro" / "pro " / "pro-" → `carbopro`
- Contém "vapt" / "servi" → `carbovapt`
- Default → `carboze_100ml`

**Handlers:**

| Handler | Ação |
|---------|------|
| `handleConnect()` | Chama `bling-auth { action: "authorize" }` → redireciona para OAuth Bling |
| `handleDisconnect()` | Delete direto em `bling_integration` via Supabase client |
| `handleRefresh()` | Chama `bling-auth { action: "refresh" }` para renovar token |
| `handleSyncAll()` | Loop sobre `["products", "contacts", "orders"]` via `syncEntity()` |
| `handleSync(entity)` | Sync individual via `bling-sync { entity }` |
| `handleBridge()` | Client-side: lê `bling_orders` → mapeia → upsert em `carboze_orders` (chave: `external_ref = 'bling-{bling_id}'`) |

**Tabelas Supabase:**
- `bling_integration` (delete no disconnect)
- `bling_sync_log` (read + write)
- `bling_products`, `bling_contacts`, `bling_orders` (count + read)
- `carboze_orders` (upsert no bridge)
- `sku`, `licensees` (mapping no bridge)

**Edge Functions:** `bling-auth`, `bling-sync`

**Status bridge:** `external_ref = 'bling-{bling_id}'` é a chave de upsert em `carboze_orders`

---

### 5.4 Equipe (`/team`)
**Arquivo:** `src/pages/Team.tsx`

**Seções UI:**
| Seção | Visibilidade | Descrição |
|-------|-------------|-----------|
| Header | Todos | Botão "Enviar acesso para todos" + AddMemberDialog |
| Ferramentas de Gestão | Admin/CEO | Grid 6 botões: Organograma, Governança, Matriz, Aprovações, Mapa, Integrações |
| KPIs | Todos | Total Colaboradores, Administradores, Departamentos, Aguardando Acesso |
| Cards por Departamento | Todos | 30 membros do org tree agrupados por dept |
| `MemberInfoModal` | Todos | Detalhes: nome, cargo, email, phone, dept, gestor direto, role, edit controls |

**Tabelas Supabase:** `profiles`, `user_roles` (via `useTeamMembers`)

**Handlers:**

| Handler | Ação |
|---------|------|
| `handleBulkResendAll()` | Dispara welcome email para todos os membros sem acesso ativo |
| `handleResendEmail(member)` | Reenvia welcome email individual |
| `handleMemberClick(member)` | Abre `MemberInfoModal` |

**Estrutura estática `STATIC_ORG_TREE` (30 membros):**

| Nível | Dept | Membros-chave |
|-------|------|---------------|
| 1 (CEO) | Command | Thelis Botelho |
| 2 (Dir/Head) | Finance, Growth & B2B, Expansão | Priscilla, Marina O. Rodrigues, Erick Almeida |
| 3 (Gerente) | OPS | Peterson Oliveira |
| 4 (Coord) | Command, Finance, B2B | Emmily Moreira, Jayane, Rodrigo Torquato |
| 6 (Staff) | Finance, Growth, B2B, OPS, Expansão | 23 membros |

---

### 5.5 Organograma (`/org-chart`)
**Arquivo:** `src/pages/OrgChartPage.tsx`

Renderiza o organograma hierárquico do Grupo Carbo em formato árvore visual.

**Lógica de dados:** `useOrgChart()` busca `profiles` onde `hierarchy_level IS NOT NULL`. Se retornar vazio, usa fallback `STATIC_ORG_TREE`.

**Campos de perfil usados:** `id`, `full_name`, `avatar_url`, `hierarchy_level`, `reports_to`, `department`, `job_title`, `job_category`, `carbo_role`

---

### 5.6 Financeiro (`/financeiro`)
**Arquivo:** `src/pages/Financeiro.tsx`

**Abas:**

| Aba | Componente | Descrição |
|-----|-----------|-----------|
| Requisições | `RCRequestsList` + `RCDetailsPanel` | CRUD de Requisições de Compra (RC) |
| Pedidos de Compra | `PurchaseOrdersList` | Visualização e gestão de PCs gerados de RCs |
| Contas a Pagar | `PayablesList` | Contas a pagar com status e vencimento |
| Dashboard | `PurchasingDashboard` | Métricas financeiras (CEO/Gestor only) |

**KPIs (topo):** RC Pendentes, Em Cotação, Total RCs, Pagamentos Atrasados, Total A Pagar

**Tabelas Supabase:** `rc_requests`, `rc_quotations`, `rc_analysis`, `rc_approval_logs`, `purchase_orders`, `purchase_payables`

**Acesso:** Aba Dashboard restrita a `isCeo || isAnyGestor`

---

### 5.7 Suprimentos (`/suprimentos`)
**Arquivo:** `src/pages/Suprimentos.tsx`

**Abas:**

| Aba | Componente | Descrição |
|-----|-----------|-----------|
| Estoque | `StockOverview` | Visualização de estoque atual por produto/hub |
| Movimentações | `StockMovementsList` | Histórico de entradas/saídas |
| Recebimento | `ReceivingsList` | Registros de recebimento de mercadorias |
| Notas Fiscais | `InvoicesList` | NFs de compra |
| Política de Estoque | `SkuStockPolicy` | Configuração de estoque mínimo por SKU/hub |

**Modo Planejamento (toggle):** Ativa `PendingSuggestions` — fila de sugestões de reposição que admin/gestor_compras pode aprovar/recusar.

**KPIs:** Total Produtos, Em Baixa (críticos), Entradas 7d, Saídas 7d, Movimentações 7d

**Tabelas Supabase:** `mrp_products`, `stock_movements`, `purchase_receivings`, `purchase_invoices`, `replenishment_suggestion`, `sku_warehouse_policy`

---

### 5.8 Logística (`/logistics`)
**Arquivo:** `src/pages/Logistics.tsx`

**Abas:**

| Aba | Componente | Descrição |
|-----|-----------|-----------|
| Operacional | `LogisticsKanban` | Remessas como cards kanban, avança status |
| Gestão | `LogisticsKPIs` | Métricas agregadas de entregas |
| Frete | `FreightCalculator` + `FreightResults` + `FreightReports` | Cotação de frete via Melhor Envio |
| Estratégico | `LogisticsStrategic` | Análises CEO/Gestor only |

**Modal:** `ShipmentDetailsDialog`

**Origem do frete:** CEP fixo `07100010` (Guarulhos/SP via constante `ORIGIN_CEP`)

**Tabelas Supabase:** `os_shipments`, `service_orders`, `customers`, `freight_quotes`

**Handlers:**

| Handler | Ação |
|---------|------|
| `handleAdvance(shipmentId)` | Avança status do envio para próximo estágio |
| `handleCalculate(params)` | Invoca edge function de cálculo de frete |
| `handleSaveCarrier(quote)` | Salva transportadora selecionada em `freight_quotes` |

---

### 5.9 Licenciados (`/licensees`)
**Arquivo:** `src/pages/Licensees.tsx`

**Seções UI:**
- Header: Export (Excel/CSV) + Atualizar + Novo Licenciado (manager+)
- Sub-navegação: `LicenseeSubNav`
- KPIs: Total, Ativos, Pendentes, Máquinas, Receita Total
- Filtros: Search, Status, Estado, Cidade
- Tabela: `LicenseesTable` com botão Editar (admin)
- Dialogs: `CreateLicenseeDialog`, `EditLicenseeDialog`

**Tabelas Supabase:** `licensees` (com realtime subscription ativa)

**Hook:** `useLicensees()` + `useLicenseeStats()`

---

### 5.10 Catálogo MRP (`/mrp/products`)
**Arquivo:** `src/pages/MrpProducts.tsx`

**Seções UI:**
- Filtros por categoria + search
- Tabela: Nome, Código, Categoria, Estoque Total, Segurança, Status por HUB (OK/Baixo/Risco)
- Links para BOM (Bill of Materials) em produtos tipo "Produto Final"
- `ProductForm` dialog (create/edit)
- `ProductBomModal`

**Categorias:** Carbonatação, Embalagem, Insumo, Produto Final, Outro

**Tabelas Supabase:** `mrp_products`, `warehouse_stock`, `warehouses`

---

### 5.11 Ordens de Produção (`/production-orders`)
**Arquivo:** `src/pages/ProductionOrdersOP.tsx`

**Pipeline de Status (14 estágios):**

| Código | Label |
|--------|-------|
| `rascunho` | Rascunho |
| `planejada` | Planejada |
| `aguardando_separacao` | Aguardando Separação |
| `separada` | Separada |
| `aguardando_liberacao` | Aguardando Liberação |
| `liberada_producao` | Liberada p/ Produção |
| `em_producao` | Em Produção |
| `aguardando_confirmacao` | Aguardando Confirmação |
| `confirmada` | Confirmada |
| `aguardando_qualidade` | Aguardando Qualidade |
| `liberada` | Liberada |
| `concluida` | Concluída |
| `bloqueada` | Bloqueada |
| `cancelada` | Cancelada |

**Seções UI:**
- Toggle Lista/Kanban
- `OPKpiCards` (métricas últimos 30 dias)
- `OPFilters` (search, status, prioridade)
- `OPTable` ou `OPKanbanBoard`
- Dialogs: Criar, Editar, Deletar, Confirmar OP

**Tabelas Supabase:** `production_orders`, `sku`

---

### 5.12 Detalhe OP (`/production-orders/:id`)
**Arquivo:** `src/pages/ProductionOrderDetail.tsx`

**Seções UI:**

| Seção | Conteúdo |
|-------|----------|
| Header | Título, badge status/prioridade, botões Confirmar/Editar/Deletar |
| Pipeline | Barra de progresso + timeline 12 etapas + botões "Avançar para:" |
| Quantidades | Planejado, Bons, Rejeitados, Rendimento % |
| Materiais/BOM | Cada material com barra de separação (flag crítico) |
| Observações | Descrição + notas de desvio |
| Sidebar meta | Fonte de Demanda, Qualidade, Prazo, Início, Conclusão, timestamps |

**Tabelas Supabase:** `production_orders`, `production_order_material`, `mrp_products`, `sku`

---

### 5.13 Central de Alertas OPS (`/ops/alerts`)
**Arquivo:** `src/pages/OpsAlerts.tsx`

**Tipos de alerta:** por `tipo` (ex.: reagente baixo, máquina inativa, atendimento pendente)

**Prioridades:** `low` | `medium` | `high` | `critical`

**Status:** `open` | `in_progress` | `resolved` | `dismissed`

**Tabelas Supabase:** `ops_alerts`, `licensees` (join)

---

### 5.14 Admin — Aprovações (`/admin/approval`)
**Arquivo:** `src/pages/AdminApproval.tsx`

Lista usuários com status `pending_approval` para que o admin aprove/rejeite e atribua roles.

**Tabelas Supabase:** `profiles` (status = 'pending'), `user_roles`

---

### 5.15 Cockpit Estratégico (`/admin/cockpit`)
**Arquivo:** `src/pages/CockpitEstrategico.tsx`

**Restrição:** Admin + CEO apenas

Visão consolidada de KPIs estratégicos para tomada de decisão executiva.

---

### 5.16 CRM (`/crm` e `/crm/:funnelType`)
**Arquivo:** `src/pages/CRMDashboard.tsx`, `src/pages/CRMFunnel.tsx`

**8 Funis disponíveis (`funnel_type`):**

| Código | Nome |
|--------|------|
| `f1` | Prospecção Ativa |
| `f2` | Inbound / Atração |
| `f3` | B2B Corporativo |
| `f4` | Licenciados |
| `f5` | Reativação |
| `f6` | Upsell/Cross-sell |
| `f7` | Parcerias |
| `f8` | Indicações |

**Tabela Supabase:** `crm_leads`

---

## 6. Hooks e Camada de Dados

### 6.1 useCarbozeOrders (`src/hooks/useCarbozeOrders.ts`)

| Export | Tabelas | Retorno |
|--------|---------|---------|
| `useOrders(statusFilter?)` | `carboze_orders_secure` + joins | `CarbozeOrder[]` |
| `useOrder(id)` | `carboze_orders_secure` | `CarbozeOrder` |
| `useCreateOrder()` | `carboze_orders` + `order_status_history` | mutation |
| `useUpdateOrder()` | `carboze_orders` | mutation |
| `useOrderStats()` | `carboze_orders_secure` | `{ total, pending, confirmed, shipped, delivered, cancelled, totalRevenue, totalCommissions }` |
| `useOrderHistory(orderId)` | `order_status_history` | `OrderStatusHistory[]` |

**Tipos:** `CarbozeOrder`, `OrderItem`, `OrderInsert`, `OrderStatus` (pending/confirmed/invoiced/shipped/delivered/cancelled), `OrderType` (spot/recurring)

### 6.2 useLicensees (`src/hooks/useLicensees.ts`)

| Export | Retorno |
|--------|---------|
| `useLicensees(statusFilter?)` | `Licensee[]` |
| `useLicensee(id)` | `Licensee` |
| `useCreateLicensee()` | mutation |
| `useUpdateLicensee()` | mutation |
| `useDeleteLicensee()` | mutation |
| `useLicenseeStats()` | `{ total, active, pending, inactive, totalMachines, totalRevenue, totalStates, totalCities, totalCapitals, activeStates, activeCapitals, avgPerformance }` |

### 6.3 useProductionOrders (`src/hooks/useProductionOrders.ts`)

| Export | Retorno |
|--------|---------|
| `useProductionOrdersOP()` | `ProductionOrder[]` (com nomes de SKU) |
| `useProductionOrderOP(id)` | `ProductionOrder` com `materials[]` |
| `useProductionOrderMaterials(orderId)` | `ProductionOrderMaterial[]` |
| `useCreateProductionOrderOP()` | mutation |
| `useUpdateProductionOrderOP()` | mutation |
| `useDeleteProductionOrderOP()` | mutation |
| `useExplodeBOM()` | Explode BOM do SKU → `production_order_material` |
| `useUpdateMaterialSeparation()` | Marca material como separado |

**Constantes:**

```typescript
OP_STATUS_LABELS   // código → label PT-BR
OP_STATUS_COLORS   // código → classe CSS
OP_STATUS_TRANSITIONS  // código → próximos status possíveis
DEMAND_SOURCE_LABELS   // "manual", "crm", "ops", "licenciado"
PRIORITY_LABELS        // "baixa", "media", "alta", "urgente"
```

### 6.4 useTeamMembers (`src/hooks/useTeamMembers.ts`)

| Export | Ação |
|--------|------|
| `useTeamMembers()` | Profiles + roles mergeados → `TeamMember[]` |
| `useApproveUser()` | Status = "approved" + atribui role |
| `useRejectUser()` | Status = "rejected" |
| `useUpdateUserRole()` | Substitui roles do usuário |
| `useUpdateUserDepartment()` | Atualiza department no profile |

### 6.5 useShipments (`src/hooks/useShipments.ts`)

| Export | Retorno |
|--------|---------|
| `useShipments(filters?)` | `Shipment[]` com service_order + customer |
| `useShipmentsByOS(osId)` | `Shipment[]` filtrado por OS |
| `useCreateShipment()` | mutation |
| `useUpdateShipmentStatus()` | Avança status com auto-timestamps |

### 6.6 useStockMovements (`src/hooks/useStockMovements.ts`)

| Export | Retorno |
|--------|---------|
| `useStockMovements(filters?)` | `StockMovement[]` |
| `useCreateStockMovement()` | Cria movimento + atualiza `current_stock_qty` em `mrp_products` |
| `useSuprimentosKPIs()` | `{ totalProdutos, produtosEmBaixa, entradasRecentes, saidasRecentes, movimentosRecentes }` |

### 6.7 useMrpProducts (`src/hooks/useMrpProducts.ts`)

| Export | Retorno |
|--------|---------|
| `useMrpProducts()` | `MrpProduct[]` |
| `useWarehouseStockByProduct()` | `Record<product_id, WarehouseStock[]>` |
| `useCreateMrpProduct()` | mutation |
| `useUpdateMrpProduct()` | mutation + invalida warehouse stock |

### 6.8 useOpsAlerts (`src/hooks/useOpsAlerts.ts`)

| Export | Retorno |
|--------|---------|
| `useOpsAlerts(filters?)` | `OpsAlert[]` |
| `useOpsAlertsBadge()` | `number` — count open+in_progress, refresh 60s |
| `useUpdateAlertStatus()` | Atualiza status + set resolved_at/resolved_by |

### 6.9 useOrgChart (`src/hooks/useOrgChart.ts`)

| Export | Retorno |
|--------|---------|
| `useOrgChart()` | `OrgNode[]` (árvore de `profiles` ou fallback estático) |
| `useOrgChartFlat()` | `profiles[]` plano com campos de org |
| `STATIC_ORG_TREE` | 30 membros hardcoded (Thelis como root CEO) |
| `getDeptColor(dept)` | Cor do departamento |
| `getLevelLabel(level)` | Label do nível hierárquico |

### 6.10 useRCPurchasing (`src/hooks/useRCPurchasing.ts`)

| Export | Retorno |
|--------|---------|
| `useRCRequests(filters?)` | `RCRequest[]` |
| `useCreateRC()` | Cria RC status "rascunho" |
| `useUpdateRCStatus()` | Atualiza status RC |
| `useRCQuotations(rcId)` | `RCQuotation[]` |
| `useCreateQuotation()` | Adiciona cotação à RC |
| `useRCAnalysis(rcId)` | `RCAnalysis \| null` |
| `useRunIAAnalysis()` | Invoca edge function `analyze-rc-quotations` |
| `useRCApprovalLogs(rcId)` | `RCApprovalLog[]` |
| `useApproveRC()` | Log de aprovação + atualiza status |
| `useConvertRCtoPC()` | Gera `purchase_orders` a partir da RC |
| `useFinanceiroKPIs()` | `{ rcPendentes, rcEmCotacao, totalRCs, pagamentosAtrasados, totalAPagar }` |

### 6.11 useDashboardStats (`src/hooks/useDashboardStats.ts`)

| Export | Retorno |
|--------|---------|
| `useDashboardStats(period)` | `{ totalOS, completedOS, activeOS, completionRate, pendingChecklists, completedChecklists, avgCompletionTime, weeklyEfficiency }` |
| `useRecentChecklists(limit)` | `RecentChecklist[]` com joins para nomes |
| `useChecklistTrend(days)` | `TrendPoint[]` para gráfico |
| `useOSTrend(days)` | `TrendPoint[]` para gráfico |
| `useDepartmentDistribution()` | Distribuição por departamento |

### 6.12 useFreightQuote (`src/hooks/useFreightQuote.ts`)

| Export | Retorno |
|--------|---------|
| `useCalculateFreight()` | Invoca edge function de cotação |
| `useSaveFreightQuote()` | Salva cotação selecionada em `freight_quotes` |
| `useFreightQuotes()` | Histórico de cotações |

**Constante:** `ORIGIN_CEP = "07100010"` (Guarulhos/SP)

---

## 7. Schema do Banco de Dados

### 7.1 Tabelas — Core Sistema

| Tabela | Propósito | Colunas principais |
|--------|-----------|-------------------|
| `profiles` | Perfis de usuário | id (uuid PK), full_name, avatar_url, email, phone, department, status (pending/approved/rejected), requested_role, username, password_must_change, hierarchy_level (int), reports_to (uuid FK→self), job_title, job_category, carbo_role, org_only (bool) |
| `user_roles` | Papéis de autenticação | user_id (FK→auth.users), role (app_role enum) |
| `carbo_user_roles` | Papéis Carbo estendidos | user_id, role |
| `departments` | Configuração de departamentos | type (dept_type enum), name, description, icon, color, display_order |

### 7.2 Tabelas — Ordens de Serviço (OS/Descarbonização)

| Tabela | Propósito |
|--------|-----------|
| `customers` | Clientes (nome, email, phone, empresa) |
| `service_orders` | OS — os_number, title, status, current_department, started/completed_at |
| `os_checklists` | Instâncias de checklist por OS e departamento |
| `os_shipments` | Remessas de logistics vinculadas às OS |
| `os_stage_history` | Histórico de transições de estágio |
| `os_stage_access` | Configuração de acesso por estágio |
| `checklist_templates` | Templates de checklist |

### 7.3 Tabelas — Pedidos e Vendas

| Tabela | Propósito | Colunas-chave |
|--------|-----------|---------------|
| `carboze_orders` | Pedidos de venda (RV) | order_number (unique), customer_name, licensee_id, sku_id, items (jsonb), status (order_status enum), total, vendedor_id, vendedor_name, rv_flow_type, linha, modalidade, external_ref, source_file |
| `order_status_history` | Audit trail de status | order_id, from_status, to_status, changed_by, notes |
| `order_audit_logs` | Audit log específico de pedidos | — |
| `sales_targets` | Metas por vendedor/período | vendedor_id, month, target_amount, target_qty, linha |

### 7.4 Tabelas — Produção e MRP

| Tabela | Propósito |
|--------|-----------|
| `sku` | SKU master — code, name, category, unit, packaging_ml, safety_stock_qty, target_coverage_days |
| `sku_bom` | Versões de BOM por SKU — sku_id, version, is_active, items (jsonb) |
| `mrp_products` | Catálogo de insumos — product_code, name, category, current_stock_qty, safety_stock_qty, stock_unit |
| `mrp_bom` | BOM: product_id → insumo_id, quantity_per_unit, is_critical |
| `mrp_suppliers` | Fornecedores vinculados ao MRP |
| `production_orders` | OPs — sku_id, planned_quantity, op_status (14 valores), priority, demand_source, quality_result |
| `production_order_material` | Materiais por OP (explosão de BOM) — theoretical_qty, separated_qty, is_separated |
| `production_confirmation` | Confirmação de OP — good_qty, rejected_qty, yield_pct, bom_adherence_pct |
| `production_confirmation_item` | Detalhe por material na confirmação |
| `inventory_lot` | Lotes de reagentes (barris 200L) — lot_code, initial/available_volume_ml, status |
| `inventory_lot_consumption` | Consumo de lote por OP |
| `quality_check` | Inspeções de qualidade — entity_type, checklist_items (jsonb), result |
| `op_suggestions` | Sugestões automáticas de OP |
| `insumo_requirement` | Planejamento de requisitos de insumos |
| `operational_capacity` | Capacidade de produção |

### 7.5 Tabelas — Estoque e Suprimentos

| Tabela | Propósito |
|--------|-----------|
| `warehouses` | Definição de hubs/armazéns |
| `warehouse_stock` | Estoque por produto por armazém |
| `stock_movements` | Movimentações — produto, tipo (entrada/saida/ajuste), quantidade, origem |
| `stock_transfers` | Transferências entre armazéns |
| `replenishment_policy` | Regras de reposição por produto — safety_stock_qty, lead_time_days, min_coverage_days |
| `replenishment_suggestion` | Sugestões de reposição — suggested_qty, reason, days_until_rupture, status |
| `sku_warehouse_policy` | Política de estoque por SKU e armazém |

### 7.6 Tabelas — Compras e Financeiro

| Tabela | Propósito |
|--------|-----------|
| `rc_requests` | Requisições de Compra — produto_nome, quantidade, valor_estimado, status, centro_custo |
| `rc_quotations` | Cotações por RC — fornecedor_nome, preco, prazo_entrega_dias |
| `rc_analysis` | Análise IA das cotações |
| `rc_approval_logs` | Log de aprovação/rejeição por RC |
| `purchase_orders` | Pedidos de Compra (gerados de RC) |
| `purchase_payables` | Contas a pagar — amount, due_date, status |
| `purchase_receivings` | Registros de recebimento |
| `purchase_invoices` | Notas fiscais de compra |
| `purchase_approval_config` | Configuração de alçadas de aprovação |
| `freight_quotes` | Cotações de frete — from/to_cep, carriers (jsonb), selected_carrier, selected_price, selected_days |

### 7.7 Tabelas — Licenciados

| Tabela | Propósito |
|--------|-----------|
| `licensees` | Operadores licenciados — code, name, legal_name, document_number, status, coverage_cities/states, performance_score, total_machines, total_revenue |
| `licensee_users` | Usuários do portal licenciado |
| `licensee_wallets` | Carteiras de crédito |
| `licensee_commissions` | Registros de comissão |
| `licensee_commission_statements` | Extratos de comissão |
| `licensee_requests` | Solicitações de serviço (portal) |
| `licensee_subscriptions` | Planos de assinatura |
| `licensee_gamification` | Dados de gamificação |
| `licensee_product_stock` | Estoque de produtos do licenciado |
| `licensee_reagent_stock` | Estoque de reagentes do licenciado |
| `licensee_stock_movements` | Movimentações de estoque (licenciado) |

### 7.8 Tabelas — Descarbonização (CarboVAPT)

| Tabela | Propósito |
|--------|-----------|
| `descarb_clients` | Clientes de descarbonização (vinculados a licenciado) |
| `descarb_vehicles` | Veículos — placa, marca, modelo, tipo_combustível, km |
| `descarb_sales` | Atendimentos — modalidade (P/M/G/G+), reagente_qty, payment_type, total |
| `carbovapt_requests` | Solicitações CarboVAPT |
| `carbovapt_payments` | Pagamentos CarboVAPT |
| `machines` | Máquinas vinculadas a licenciados |
| `machine_consumption_history` | Histórico de consumo de reagente por máquina |

### 7.9 Tabelas — PDV (Ponto de Venda)

| Tabela | Propósito |
|--------|-----------|
| `pdvs` | Pontos de venda |
| `pdv_users` | Usuários vinculados ao PDV |
| `pdv_products` | Catálogo de produtos do PDV — sku_code, is_active, price_default |
| `pdv_product_stock` | Estoque por PDV/produto — qty_current |
| `pdv_sales` | Transações de venda |
| `pdv_sellers` | Vendedores do PDV |
| `pdv_stock_movements` | Movimentações de estoque PDV — tipo, qty_before, qty_after, notes |
| `pdv_replenishment_history` | Histórico de reposição |

### 7.10 Tabelas — Bling ERP Integration

| Tabela | Propósito | Colunas-chave |
|--------|-----------|---------------|
| `bling_integration` | Tokens OAuth — access_token, refresh_token, expires_at, is_active | — |
| `bling_products` | Produtos sincronizados — bling_id (bigint UNIQUE), nome, codigo, preco | — |
| `bling_contacts` | Contatos sincronizados — bling_id (bigint UNIQUE), nome, cpf_cnpj, tipo_contato | — |
| `bling_orders` | Pedidos sincronizados — bling_id (bigint UNIQUE), numero, total, situacao_id/valor, items (jsonb) | — |
| `bling_sync_log` | Histórico de sync — entity_type, status, records_synced, records_failed, started/finished_at | — |

**Chave de bridge:** `carboze_orders.external_ref = 'bling-{bling_id}'`

### 7.11 Tabelas — CRM e Comercial

| Tabela | Propósito |
|--------|-----------|
| `crm_leads` | Leads universais — funnel_type (f1-f8), stage, contato, empresa, segmentação, temperatura |
| `b2b_leads` | Pipeline B2B específico |

### 7.12 Tabelas — Sistema e Auditoria

| Tabela | Propósito |
|--------|-----------|
| `audit_logs` | Log de auditoria geral |
| `flow_audit_logs` | Audit trail do fluxo de OS |
| `governance_audit_log` | Ações de governança |
| `order_audit_logs` | Audit log de pedidos |
| `ops_alerts` | Alertas operacionais — tipo, licensee_id, machine_id, titulo, prioridade, status |
| `notification_preferences` | Preferências de notificação por usuário |
| `notification_log` | Histórico de notificações enviadas |
| `import_runs` | Histórico de importações de dados |
| `password_reset_codes` | Tokens de reset de senha |
| `password_reset_requests` | Solicitações de reset |
| `forecast_snapshots` | Snapshots de demanda forecast |
| `ai_insights` | Insights gerados por IA |
| `pending_actions` | Fila de ações pendentes |

---

## 8. Edge Functions (Supabase)

### 8.1 `bling-auth`
**Propósito:** Gerencia o fluxo OAuth2 com o Bling ERP

| Action | Comportamento |
|--------|--------------|
| `authorize` | Gera URL OAuth e redireciona para login Bling |
| `callback` | Troca código por access/refresh token, salva em `bling_integration` |
| `refresh` | Renova access token usando refresh token |
| `status` | Verifica se há token ativo e se está expirado |
| `disconnect` | Remove registro de `bling_integration` (v2: feito client-side) |

### 8.2 `bling-sync`
**Propósito:** Sincroniza dados do Bling para tabelas intermediárias

| Entity | Tabela destino | Comportamento |
|--------|---------------|---------------|
| `products` | `bling_products` | Busca `/produtos` (paginado), upsert por `bling_id` |
| `contacts` | `bling_contacts` | Busca `/contatos` (paginado), upsert por `bling_id` |
| `orders` | `bling_orders` | Busca `/pedidos/vendas` (list only, sem detail fetch), upsert por `bling_id` |

**Autenticação:** Valida JWT do usuário chamador + usa `SUPABASE_SERVICE_ROLE_KEY` para writes

**Auto-refresh de token:** Se Bling retornar 401, tenta refresh automático e repete a requisição uma vez

**Log:** Toda operação gera/atualiza entrada em `bling_sync_log`

### 8.3 `analyze-rc-quotations`
**Propósito:** Análise IA das cotações de uma RC para recomendar melhor fornecedor

**Invocado por:** `useRunIAAnalysis()` em `useRCPurchasing`

**Saída:** Registro em `rc_analysis` com recomendação estruturada

---

## 9. Migrações SQL — Histórico

| Data | Arquivo | Tabelas criadas / modificadas |
|------|---------|-------------------------------|
| 2026-01-30 | `20260130195149_*` | `profiles`, `user_roles`, `departments`, `customers`, `service_orders`, `os_checklists`, `os_stage_history`, `os_stage_access` |
| 2026-02-03 | `20260203180745_*` | `machines`, `licensees` |
| 2026-02-03 | `20260203184129_*` | `scheduled_events`, `checklist_templates` |
| 2026-02-03 | `20260203190753_*` | `carboze_orders`, `order_status_history` |
| 2026-02-03 | `20260203232718_*` | `purchase_requests`, `purchase_orders`, `purchase_payables` |
| 2026-02-04 | `20260204150532_*` | `licensee_users`, `licensee_wallets`, `licensee_commissions` |
| 2026-02-04 | `20260204165219_*` | `suppliers`, `mrp_products`, `stock_movements` |
| 2026-02-04 | `20260204170706_*` | `warehouses`, `warehouse_stock` |
| 2026-02-04 | `20260204175841_*` | `production_orders` (inicial) |
| 2026-02-04 | `20260204184917_*` | `os_shipments` |
| 2026-02-12 | `20260212075117_*` | `forecast_snapshots`, `ai_insights` |
| 2026-02-12 | `20260212182423_*` | `rc_requests`, `rc_quotations`, `rc_analysis` |
| 2026-02-12 | `20260212190445_*` | `purchase_receivings`, `purchase_invoices` |
| 2026-02-19 | `20260219053713_*` | `audit_logs`, `flow_audit_logs` |
| 2026-02-23 | `20260223191346_*` | `sales_targets` |
| 2026-02-23 | `20260223195947_*` | `b2b_leads` |
| 2026-02-24 | `20260224175630_*` | `pdvs`, `pdv_products`, `pdv_sales`, `pdv_users`, `pdv_sellers` |
| 2026-02-25 | `20260225172644_*` | `ops_alerts` |
| 2026-02-25 | `20260225174742_*` | `notification_preferences`, `notification_log` |
| 2026-03-11 | `add_phone_and_notifications` | ALTER profiles (phone), ALTER notification tables |
| 2026-03-13 | `op_module_schema` | `sku`, `sku_bom`, `inventory_lot`, `inventory_lot_consumption`, `production_order_material`, `production_confirmation`, `quality_check`, `replenishment_policy`, `replenishment_suggestion` |
| 2026-03-13 | `op_module_seeds` | Dados seed do módulo OP |
| 2026-03-13 | `stations_table` | `stations` |
| 2026-03-13 | `bling_tables` | `bling_integration`, `bling_products`, `bling_contacts`, `bling_orders`, `bling_sync_log` |
| 2026-03-13 | `auth_invite_and_reset_codes` | `password_reset_codes`, `password_reset_requests` |
| 2026-03-25 | `add_org_chart_fields` | ALTER profiles: hierarchy_level, reports_to, job_title, carbo_role |
| 2026-04-05 | `bling_bridge` | UNIQUE index em `carboze_orders.external_ref`, RLS para leitura admin em bling_* |
| 2026-04-05 | `product_catalog_link` | FK `carboze_orders → sku` |
| 2026-04-05 | `rv_module_fields` | ALTER `carboze_orders`: vendedor_id, vendedor_name, rv_flow_type, linha, modalidade; CREATE `sales_targets`, `b2b_leads` |
| 2026-04-05 | `security_fixes` | Correções de RLS policies |
| 2026-04-05 | `sku_warehouse_policy` | `sku_warehouse_policy` |
| 2026-04-06 | `crm_universal_leads` | `crm_leads` (8 tipos de funil) |
| 2026-04-06 | `org_chart_profiles` | Seed de 30 membros em `profiles` com campos org chart |
| 2026-04-07 | `descarb_sales_sprint_e` | `descarb_clients`, `descarb_vehicles`, `descarb_sales` |
| 2026-04-07 | `freight_quotes` | `freight_quotes` |
| 2026-04-07 | `mrp_bom` | `mrp_bom` (BOM mrp_products) |
| 2026-04-07 | `mrp_bom_seed` | Dados seed do BOM |
| 2026-04-07 | `mrp_products_seed` | Dados seed de produtos MRP (17 produtos ativos) |
| 2026-04-07 | `orders_vendedor_update` | UPDATE `carboze_orders.vendedor_name` (81 pedidos, 10 vendedores) |
| 2026-04-07 | `os_carbovapt` | `carbovapt_requests`, `carbovapt_payments` |
| 2026-04-08 | `org_profiles_fix` | Remoção FK auth constraint, coluna `org_only`, RLS melhorada, função `_seed_org_member` |
| 2026-04-08 | `pdv_sprint_g` | PDV: `pdv_stock_movements`, `pdv_replenishment_history`, melhorias nas policies |
| 2026-04-08 | `sprint_i_licensee_products` | `licensee_product_stock`, `licensee_reagent_stock`, `licensee_stock_movements` |

---

## 10. Integrações Externas

### 10.1 Bling ERP
- **API:** v3 REST (OAuth2 PKCE)
- **Base URL:** `https://www.bling.com.br/Api/v3/`
- **Endpoints usados:** `/produtos`, `/contatos`, `/pedidos/vendas`, `/oauth/token`, `/oauth/login`
- **Throttle:** 350ms entre requisições de detalhe de pedido
- **Armazenamento token:** Tabela `bling_integration` (service role)
- **Fluxo:** Autorizar → Callback → Refresh automático na sync

### 10.2 Melhor Envio
- **Uso:** Cotação de frete (módulo Logística → aba Frete)
- **Configuração:** Secret `MELHOR_ENVIO_TOKEN` em Edge Functions Supabase
- **Origem fixa:** CEP `07100010` (Guarulhos/SP)
- **Tabela:** `freight_quotes` (carriers como JSONB completo da API)

### 10.3 Supabase Auth
- **Métodos:** Email/senha + convite por email (`send_welcome_email`)
- **Fluxo especial:** `password_must_change = true` → redireciona para `/change-password`
- **Reset:** Via `password_reset_codes` table (não usa reset nativo do Supabase)

### 10.4 AI (Anthropic Claude)
- **Uso:** AI Chat Drawer (drawer lateral global), AIAssistantPage, Análise de cotações RC
- **Edge function:** `analyze-rc-quotations` (análise de fornecedores)
- **Chat:** Drawer disponível em todas as páginas do Hub de Controle

---

*Documento gerado automaticamente a partir do codebase em 15/04/2026. Para atualizar, re-executar análise sobre `src/pages/`, `src/hooks/`, `supabase/migrations/` e `src/components/layouts/BoardLayout.tsx`.*
