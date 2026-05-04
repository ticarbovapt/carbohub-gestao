# COMPARATIVO DE SISTEMAS — CarboHub Old vs New
> Gerado em 27/04/2026 | Objetivo: nivelar o sistema novo com o antigo

---

## ÍNDICE
1. [Resumo Executivo](#1-resumo-executivo)
2. [Arquitetura Geral](#2-arquitetura-geral)
3. [Banco de Dados — Sistema Antigo](#3-banco-de-dados--sistema-antigo)
4. [Banco de Dados — Sistema Novo](#4-banco-de-dados--sistema-novo)
5. [Tabela de Equivalências](#5-tabela-de-equivalências)
6. [Rotas e Páginas — Sistema Novo](#6-rotas-e-páginas--sistema-novo)
7. [Componentes por Área](#7-componentes-por-área)
8. [Hooks e Lógica de Negócio](#8-hooks-e-lógica-de-negócio)
9. [Edge Functions](#9-edge-functions)
10. [Migrations — Sistema Novo](#10-migrations--sistema-novo)
11. [Gaps e O Que Falta Migrar](#11-gaps-e-o-que-falta-migrar)
12. [Plano de Nivelamento](#12-plano-de-nivelamento)

---

## 1. RESUMO EXECUTIVO

| Dimensão | Sistema Antigo | Sistema Novo (CarboHub2) |
|---|---|---|
| GitHub | Repositório antigo | `petersonoliveira14-debug/CarboHub` |
| Supabase | Projeto antigo | Projeto novo |
| Schema DB | Multi-schema (12 schemas) | Schema único (public) |
| Tabelas | ~30 tabelas em schemas separados | 70+ tabelas em public |
| Páginas | Desconhecido | 80+ páginas |
| Rotas | Desconhecido | 96 rotas |
| Edge Functions | Desconhecido | 26 functions |
| Integração Bling | ❌ Não tem | ✅ Implementada (bling-auth, bling-sync) |
| CRM | Parcial (crm.leads) | ✅ Completo (8 funis, kanban) |
| MRP / Supply | Básico | ✅ Completo (BOM, lotes, fornecedores) |
| PDV | ✅ (pdv schema) | ✅ (pdv pages + hooks) |
| CarboVapt | ✅ (commercial.sale) | ✅ (descarb_sales + licensee portal) |
| Portal Licenciado | ❌ Não tem | ✅ Completo (10 páginas) |
| AI Features | ❌ Não tem | ✅ (chat, recommendations, insights) |
| Network Intelligence | ❌ Não tem | ✅ (mapa, ranking, expansão) |

---

## 2. ARQUITETURA GERAL

### Sistema Antigo
```
Supabase (Antigo)
├── Schema: auth          → Autenticação padrão Supabase
├── Schema: catalog       → Catálogo de produtos
├── Schema: commercial    → Vendas CarboVapt (sale, client, credit, noise_test)
├── Schema: crm           → Leads e licenciados (básico)
├── Schema: financial     → Transações financeiras
├── Schema: institutional → Empresas, filiais, máquinas, usuários
├── Schema: logistics     → Entregas
├── Schema: ops           → OPs e OS
├── Schema: orders        → Pedidos de licenciados
├── Schema: pdv           → PDV (loja, estoque, movimentos)
├── Schema: replenishment → Reposição de estoque
├── Schema: sales         → Vendas PDV + comissões
├── Schema: security      → Usuários de segurança
├── Schema: showcase      → Catálogo/Vitrine (produto, estoque, movimentos)
└── Schema: stock         → Estoque geral (items, movements)
```

### Sistema Novo (CarboHub2)
```
React 18 + TypeScript + Vite
├── UI: shadcn/ui + Tailwind CSS
├── State: React Query (TanStack)
├── Auth: Supabase Auth + custom roles (carbo_user_roles)
├── DB: Supabase (PostgreSQL) — schema public
├── ORM: supabase-js client
├── Edge Functions: Deno runtime (26 functions)
├── Maps: Leaflet.js
├── Charts: Recharts
└── CI/CD: GitHub Actions → Supabase deploy

Áreas do sistema:
├── OPS / Admin (BoardLayout)
│   ├── Dashboards (6 painéis)
│   ├── Operações (OS, OPs, Alertas, Logística, Financeiro, Supply)
│   ├── Comercial (CRM, Pedidos, Metas, Bling)
│   ├── Controle (MRP, SKUs, Lotes, Licenciados, Equipe)
│   └── Admin (Aprovações, Cockpit, Governança)
├── Portal Licenciado (LicenseeLayout)
│   ├── Dashboard, VAPT, Produtos, Pedidos
│   ├── Créditos, Comissões, Atendimentos, Clientes, Reagentes
│   └── Fluxo CarboVAPT (4 steps)
└── PDV (PDVLayout)
    ├── Dashboard, POS, Estoque, Vendedores, Ranking
```

---

## 3. BANCO DE DADOS — SISTEMA ANTIGO

### Schema: `catalog`
| Tabela | Colunas Principais |
|---|---|
| `product` | id, name, sku, description, price_retail, price_cost, unit, image_url, is_active, display_order |
| `promotion` | id, name, type, value, starts_at, ends_at, is_active |
| `promotion_product` | promotion_id, product_id |
| `promotion_store` | id, promotion_id, store_id |

### Schema: `commercial`
| Tabela | Colunas Principais |
|---|---|
| `client` | id, branch_id, name, federal_code, phone_number, email, address, city, state, zip_code, excluded |
| `client_car` | id, sale_id, client_id, license_plate, year, model, brand, kilometer, fuel_type |
| `credit` | id, branch_id, type, value, reference_month, operation_date, description, approved_by, sale_id |
| `noise_test` | id, branch_id, client_id, license_plate, chassi, model, brand, noise1/2/3, cabin, horn, average, test_result |
| `sale` | id, branch_id, client_id, total_value, subtotal, service_charge, discount, payment_type, operation_date, seller, executioner, vehicle_plate, fuel_type, starts_machine, reagents_used, is_pre_sale, pre_sale_state |
| `sale_item` | id, sale_id, product_id, quantity, unit_price, operation_date |
| `transaction` | id, sale_id, parcel, amount, reference, return_code, tid, nsu, authorization_code, card_bin, last_four |

### Schema: `institutional`
| Tabela | Colunas Principais |
|---|---|
| `branch` | id, company_id, machine_id, federal_code, name, trade_name, state_registration, instagram, phone_number, email, whatsapp, address, city, state, plan, monthly_fee, billing_due_date, responsible_manager, qnt_reagent_flex, qnt_reagent_diesel, credit, operational_status, observation_status, score_commercial_performance, score_relationship, score_execution_capacity, score_physical_visibility, score_av_potential, score_network, score_digital_presence, score_campaign_adherence, score_growth_potential, score_strategic_alignment, tier, checklist_step1_pct ~ checklist_step5_pct, checklist_data, is_indicator, noise_test_enabled, sync_status |
| `company` | id, name, federal_code, payment_pv, payment_token, transfer_info |
| `machine` | id, number |
| `api_keys` | — |
| `logs` | — |
| `users` | — |
| `investors` | — |
| `investor_machines` | — |

### Schema: `pdv`
| Tabela | Colunas Principais |
|---|---|
| `store` | id, name, trade_name, federal_code, type, status, phone, email, contact_name, address, city, state, lat, lng, checklist_pct, commercial_id |
| `store_product` | store_id, product_id, min_stock |
| `stock` | id, store_id, product_id, quantity |
| `stock_movement` | id, store_id, product_id, type, quantity, reference, notes, created_by |
| `expositor` | id, store_id, model, installed_at, photo_urls, notes, is_active |

### Schema: `ops`
| Tabela | Colunas Principais |
|---|---|
| `production_orders` | — |
| `service_orders` | — |

### Schema: `orders`
| Tabela | Colunas Principais |
|---|---|
| `orders` | id, order_number, status, licensee_name, licensee_id, items_count, total_value, notes, shipping_address, shipped_at, delivered_at, created_by |

### Schema: `crm`
| Tabela | Colunas Principais |
|---|---|
| `leads` | — |
| `licensees` | — |

### Schema: `financial`
| Tabela | Colunas Principais |
|---|---|
| `transactions` | — |

### Schema: `logistics`
| Tabela | Colunas Principais |
|---|---|
| `deliveries` | — |

### Schema: `replenishment`
| Tabela | Colunas Principais |
|---|---|
| `request` | — |
| `request_item` | — |

### Schema: `sales`
| Tabela | Colunas Principais |
|---|---|
| `sale` | id, store_id, operator_id, total, consumer_cpf, payment_method |
| `sale_item` | — |
| `commission_entry` | — |
| `commission_rule` | — |

### Schema: `showcase`
| Tabela | Colunas Principais |
|---|---|
| `product` | — |
| `category` | — |
| `price` | — |
| `storage` | — |
| `storage_movements` | — |

### Schema: `stock`
| Tabela | Colunas Principais |
|---|---|
| `items` | — |
| `movements` | — |

### Schema: `security`
| Tabela | Colunas Principais |
|---|---|
| `users` | — |

---

## 4. BANCO DE DADOS — SISTEMA NOVO

> Todas as tabelas em `public` schema

### Autenticação e Papéis
| Tabela | Descrição | Colunas Principais |
|---|---|---|
| `carbo_user_roles` | Papéis customizados (admin, ceo, gestor, operador, licenciado, pdv) | user_id, role, scope_departments[], scope_macro_flows[] |
| `audit_logs` | Log de ações do sistema | action_type, action_name, executed_by, details, success |
| `flow_audit_logs` | Log de fluxos de OS | user_id, action_type, resource_type, resource_id, department |
| `governance_audit_log` | Log de governança | user_id, action_type, department, macro_flow |
| `import_runs` | Histórico de importações | filename, imported_by, rows_imported |

### Licenciados (Core)
| Tabela | Descrição | Colunas Principais |
|---|---|---|
| `licensees` | Licenciados Grupo Carbo | id, code, name, legal_name, document_number, email, phone, address, city, state, coverage_cities[], coverage_states[], status, performance_score, total_machines, total_revenue, current_level, current_score, responsavel, instagram, machines_1l |
| `licensee_users` | Usuários vinculados a licenciados | licensee_id, user_id, is_primary, can_order, can_view_financials |
| `licensee_wallets` | Carteira de créditos do licenciado | licensee_id, balance, total_earned, total_spent |
| `licensee_reagent_stock` | Estoque de reagentes do licenciado | licensee_id, qty_normal, qty_flex, qty_diesel, min_qty_alert |
| `licensee_product_stock` | Estoque de produtos do licenciado | licensee_id, mrp_product_id, quantity, min_qty_alert |
| `licensee_requests` | Pedidos de serviço do licenciado | licensee_id, service_id, request_number, operation_type, status, operation_address, preferred_date, payment_method, credits_used, sla_deadline, sla_breached |
| `licensee_commissions` | Comissões dos licenciados | licensee_id, commission_type, base_amount, commission_rate, commission_amount, status, reference_month, reference_year |
| `licensee_commission_statements` | Extratos de comissão | licensee_id, period_year, period_month, total_orders, gross_total, status |
| `licensee_subscriptions` | Planos e assinaturas | licensee_id, plan_id, status, vapt_used, ze_used, billing_cycle_start |
| `licensee_gamification` | Gamificação (nível, score) | licensee_id, period_year, period_month, order_volume_score, growth_score, total_score, level |
| `licensee_rankings` | Rankings dos licenciados | licensee_id, machine_count, territory_coverage, activity_level, growth_rate, ranking, score |

### Pedidos CarboZé
| Tabela | Descrição | Colunas Principais |
|---|---|---|
| `carboze_orders` | Pedidos principais do sistema | id, order_number, licensee_id, customer_name, customer_email, delivery_address, delivery_city, items(jsonb), subtotal, shipping_cost, total, status, invoice_number(text), tracking_code, has_commission, commission_rate, vendedor_id, vendedor_name, order_type, is_recurring, product_code, external_ref, cnpj, legal_name, trade_name, linha, modalidade, sku_id |
| `orders` (public) | — | — |

### CarboVapt / Descarb
| Tabela | Descrição | Colunas Principais |
|---|---|---|
| `descarb_sales` | Vendas de descarbonização | licensee_id, machine_id, client_id, vehicle_id, modality, reagent_type, reagent_qty_used, payment_type, total_value, discount, is_pre_sale, executed_at, certificate_issued, machine_starts_used |
| `descarb_clients` | Clientes de descarbonização | licensee_id, name, federal_code, phone, email, city, state |
| `descarb_vehicles` | Veículos atendidos | client_id, licensee_id, license_plate, brand, model, year, fuel_type, kilometer |
| `carbovapt_requests` | Solicitações CarboVAPT | licensee_id, modality, request_status, preferred_date, credit_cost, amount_brl |
| `carbovapt_payments` | Pagamentos VAPT | request_id, payment_method, payment_status, external_payment_id, amount, pix_qr_code |
| `credit_wallets` | Carteiras de crédito VAPT | tenant_id, weekly_credits, bonus_credits, credits_used, last_reset |
| `credit_transactions` | Transações de crédito | wallet_id, amount, balance_after, type, service_order_id, order_id |

### CRM
| Tabela | Descrição | Colunas Principais |
|---|---|---|
| `crm_leads` | Leads CRM (todos os funis) | funnel_type, stage, contact_name, contact_phone, contact_email, source, cnpj, legal_name, trade_name, ramo, city, state, estimated_revenue, temperature, wave, score, vehicles_per_day, fuel_type, assigned_to, last_contact_at, next_follow_up_at, contact_attempts, tags[], onboarding_phase, onboarding_checklist |

### Produção / MRP
| Tabela | Descrição | Colunas Principais |
|---|---|---|
| `inventory_lot` | Lotes de produção | lot_code, product_id, initial_volume_ml, available_volume_ml, status, supplier_id, received_at, released_at, expired_at, quality_responsible_id, expected_samples, collected_samples |
| `inventory_lot_consumption` | Consumo de lotes | lot_id, production_order_id, volume_consumed_ml, consumed_at |
| `insumo_requirement` | Requisitos de insumo | sku_id, warehouse_id, product_id, required_qty, current_stock_qty, deficit |

### Ordens de Serviço
| Tabela | Descrição | Colunas Principais |
|---|---|---|
| `departments` | Departamentos | type, name, description, icon, color, macro_flow |
| `department_sla_config` | SLA por departamento | department_type, default_sla_hours, warning_threshold_percent, requires_checklist |
| `department_macro_flow_mapping` | Mapeamento fluxo → departamento | department_type, macro_flow |
| `checklist_templates` | Templates de checklist | department, name, items(jsonb), is_active, version |
| `checklist_stage_config` | Configuração de etapas | stage, stage_label, status_label, responsible_role, default_items |
| `forecast_snapshots` | Previsões de demanda | entity, entity_id, product_code, period_days, projected_volume, projected_revenue, risk_level |
| `ai_insights` | Insights da IA | type, entity_id, entity_type, severity, message, recommendation, is_dismissed |

### Bling Integration
| Tabela | Descrição | Colunas Principais |
|---|---|---|
| `bling_integration` | Tokens OAuth do Bling | access_token, refresh_token, token_type, expires_at, scope, connected_by, is_active |
| `bling_orders` | Pedidos sincronizados do Bling | bling_id, numero, data, total, situacao_id, situacao_valor, contato_id, contato_nome, observacoes, items(jsonb), raw_data |
| `bling_products` | Produtos sincronizados do Bling | bling_id, nome, codigo, preco, tipo, situacao, estoque_atual, estoque_minimo, raw_data |
| `bling_contacts` | Contatos sincronizados do Bling | bling_id, nome, fantasia, tipo_pessoa, cpf_cnpj, email, telefone, endereco, cidade, uf, is_supplier, is_client |
| `bling_sync_log` | Log de sincronizações | entity_type, status, records_synced, records_failed, error_message, started_at, finished_at |

### Equipe e Governança
| Tabela | Descrição | Colunas Principais |
|---|---|---|
| `department_username_sequences` | Sequências de username por dept | department_prefix, last_sequence |
| `department_macro_flow_mapping` | Fluxo → departamento | department_type, macro_flow |

### Financeiro / Suprimentos
| Tabela | Descrição | Colunas Principais |
|---|---|---|
| `customers` | Clientes gerais | name, email, phone, company, notes |

### Outros (Public)
| Tabela | Descrição |
|---|---|
| `Agente_Base_V2_peterson` | Agente WhatsApp (outra aplicação) |
| `Buffer_Agente_Base_V2_peterson` | Buffer mensagens WhatsApp |
| `ai_insights` | Insights IA do CarboHub |
| `clientes` | Clientes de outra aplicação CRM |
| `conversas` | Conversas WhatsApp |
| `criativos` | Criativos de marketing (outra app) |
| `documentos` | Documentos de propostas |
| `documents` | Documentos com embedding vetorial |
| `instagram_connections` | Conexões Instagram |
| `leads` | Leads de outra aplicação |

---

## 5. TABELA DE EQUIVALÊNCIAS

| Funcionalidade | Sistema Antigo | Sistema Novo | Status |
|---|---|---|---|
| Venda CarboVapt | `commercial.sale` | `descarb_sales` | ✅ Equivalente |
| Cliente do atendimento | `commercial.client` | `descarb_clients` | ✅ Equivalente |
| Veículo atendido | `commercial.client_car` | `descarb_vehicles` | ✅ Equivalente |
| Teste de ruído | `commercial.noise_test` | ❌ Não migrado | ⚠️ Gap |
| Crédito da filial | `commercial.credit` | `licensee_wallets` + `credit_transactions` | ✅ Equivalente (melhorado) |
| Transação financeira | `commercial.transaction` | `credit_transactions` | 🔄 Parcial |
| Produto catálogo | `catalog.product` | MRP products (em desenvolvimento) | 🔄 Parcial |
| Promoção | `catalog.promotion` | ❌ Não tem | ⚠️ Gap |
| Filial / Licenciado | `institutional.branch` | `licensees` | ✅ Equivalente (muito melhorado) |
| Empresa | `institutional.company` | Dentro de `licensees` | ✅ |
| Máquina | `institutional.machine` | Campo em `licensees` (machines_1l) | 🔄 Simplificado |
| Score performance | `institutional.branch.score_*` | `licensee_gamification` | ✅ Equivalente (melhorado) |
| Checklist onboarding | `institutional.branch.checklist_*` | `crm_leads.onboarding_checklist` | ✅ Equivalente |
| Loja PDV | `pdv.store` | Dentro de `licensees` (portal) | 🔄 Diferente abordagem |
| Produto PDV | `pdv.store_product` | `licensee_product_stock` | ✅ Equivalente |
| Estoque PDV | `pdv.stock` | `licensee_product_stock.quantity` | ✅ Equivalente |
| Movimento estoque PDV | `pdv.stock_movement` | Hooks pdv (em desenvolvimento) | 🔄 Parcial |
| Expositor | `pdv.expositor` | ❌ Não tem | ⚠️ Gap |
| Venda PDV | `sales.sale` | `descarb_sales` + portal licenciado | 🔄 Diferente |
| Comissão PDV | `sales.commission_*` | `licensee_commissions` | ✅ Equivalente (melhorado) |
| Pedido licenciado | `orders.orders` | `licensee_requests` + `carboze_orders` | ✅ Equivalente (melhorado) |
| OP Produção | `ops.production_orders` | Via MRP (em desenvolvimento) | 🔄 Parcial |
| OS | `ops.service_orders` | Service orders via OS module | ✅ |
| Leads CRM | `crm.leads` | `crm_leads` (muito mais rico) | ✅ Melhorado |
| Entrega logística | `logistics.deliveries` | `logistics` hooks (em desenvolvimento) | 🔄 Parcial |
| Reposição | `replenishment.request` | `insumo_requirement` | 🔄 Diferente |
| Estoque geral | `stock.items` / `showcase.storage` | MRP products + `inventory_lot` | ✅ Melhorado |
| Movimentos estoque | `stock.movements` / `showcase.storage_movements` | `inventory_lot_consumption` | 🔄 Parcial |

---

## 6. ROTAS E PÁGINAS — SISTEMA NOVO

### Área Pública / Auth (6 rotas)
| Rota | Página | Descrição |
|---|---|---|
| `/` | `AreaSelector` | Seletor de área (OPS / Licenciado / PDV) |
| `/login/:area` | `LoginArea` | Login por área |
| `/change-password` | `ChangePassword` | Troca de senha |
| `/set-password` | `SetPassword` | Definir senha inicial |
| `/reset-password` | `ResetPassword` | Recuperar senha |
| `/onboarding` | `Onboarding` | Onboarding novo usuário |

### Área OPS / Admin — Dashboards (6 rotas)
| Rota | Página | Descrição |
|---|---|---|
| `/dashboard` | `Dashboard` | Visão geral (role-based) |
| `/dashboards/producao` | `DashboardProducao` | Dashboard de produção + MRP |
| `/dashboards/financeiro` | `DashboardFinanceiro` | Dashboard financeiro |
| `/dashboards/logistica` | `DashboardLogistica` | Dashboard logística |
| `/dashboards/comercial` | `DashboardComercial` | Dashboard comercial |
| `/dashboards/estrategico` | `DashboardEstrategico` | Dashboard estratégico CEO |

### Área OPS — Operações (14 rotas)
| Rota | Página | Descrição |
|---|---|---|
| `/os` | `OSBoard` | Ordens de Serviço (kanban) |
| `/os/:id` | `OSDetails` | Detalhe da OS |
| `/production-orders` | `ProductionOrdersOP` | Ordens de Produção |
| `/production-orders/:id` | `ProductionOrderDetail` | Detalhe da OP |
| `/ops/alerts` | `OpsAlerts` | Central de alertas |
| `/ops/pdv-network` | `OpsNetwork` | Rede PDV |
| `/ops/network-map` | `NetworkMap` | Mapa da rede |
| `/ops/licensee-ranking` | `LicenseeRanking` | Ranking licenciados |
| `/ops/territory-intelligence` | `TerritoryIntelligence` | Inteligência territorial |
| `/ops/territory-expansion` | `TerritoryExpansion` | Expansão territorial |
| `/logistics` | `Logistics` | Logística + fretes |
| `/purchasing` | `Purchasing` | Compras / Supply |
| `/financeiro` | `Financeiro` | Financeiro (RC, contas) |
| `/suprimentos` | `Suprimentos` | Suprimentos / MRP |

### Área OPS — Comercial (8 rotas)
| Rota | Página | Descrição |
|---|---|---|
| `/crm` | `CRMDashboard` | Dashboard CRM |
| `/crm/:funnelType` | `CRMFunnel` | Funil específico (8 funis) |
| `/b2b` | `B2BLeads` | Leads B2B |
| `/b2b/funnel` | `B2BFunnel` | Funil B2B |
| `/orders` | `Orders` | Pedidos CarboZé |
| `/orders/new` | `CreateOrder` | Criar pedido |
| `/orders/:id` | `OrderDetails` | Detalhe do pedido |
| `/sales-targets` | `SalesTargets` | Metas de vendas |

### Área OPS — Controle (10 rotas)
| Rota | Página | Descrição |
|---|---|---|
| `/mrp/products` | `MrpProducts` | Catálogo MRP / Insumos |
| `/mrp/suppliers` | `MrpSuppliers` | Fornecedores |
| `/skus` | `Skus` | SKUs e BOM |
| `/lots` | `Lots` | Lotes / Qualidade |
| `/licensees` | `Licensees` | Licenciados (lista) |
| `/licensees/:id` | `LicenseeDetails` | Detalhe do licenciado |
| `/machines` | `Machines` | Máquinas |
| `/team` | `Team` | Equipe |
| `/import` | `DataImport` | Importar dados (XLSX) |
| `/integrations/bling` | `BlingIntegration` | Integração Bling ERP |

### Área Admin (5 rotas)
| Rota | Página | Descrição |
|---|---|---|
| `/admin` | `Admin` | Painel admin sistema |
| `/admin/approval` | `AdminApproval` | Aprovações pendentes |
| `/admin/cockpit` | `CockpitEstrategico` | Cockpit CEO |
| `/governance` | `CarboGovernance` | Governança |
| `/org-chart` | `OrgChartPage` | Organograma |

### Portal Licenciado (19 rotas)
| Rota | Página | Descrição |
|---|---|---|
| `/licensee/dashboard` | `LicenseeDashboard` | Dashboard do licenciado |
| `/licensee/vapt` | `LicenseeVapt` | CarboVAPT |
| `/licensee/produtos` | `LicenseeProducts` | Produtos disponíveis |
| `/licensee/pedidos` | `LicenseeRequests` | Pedidos realizados |
| `/licensee/creditos` | `LicenseeCredits` | Créditos e extrato |
| `/licensee/comissoes` | `LicenseeCommissions` | Comissões |
| `/licensee/atendimentos` | `LicenseeAtendimento` | Atendimentos descarb |
| `/licensee/clientes` | `LicenseeClientes` | Clientes do licenciado |
| `/licensee/reagentes` | `LicenseeReagentes` | Estoque de reagentes |
| `/licensee/new` | `NewLicensee` | Cadastrar novo licenciado |
| `/licenciado/carboVAPT/servicos` | `CarboVAPTServices` | Catálogo VAPT |
| `/licenciado/carboVAPT/checkout` | `CarboVAPTCheckout` | Checkout VAPT |
| `/licenciado/carboVAPT/pagamento` | `CarboVAPTPayment` | Pagamento VAPT |
| `/licenciado/carboVAPT/confirmacao` | `CarboVAPTConfirmation` | Confirmação VAPT |
| `/portal` | `LicenseeDashboard` | Redirect legacy |
| `/portal/vapt` | `ServiceCatalog` | Redirect legacy |
| `/portal/ze` | `ServiceCatalog` | Redirect legacy |
| `/portal/pedidos` | `LicenseeRequests` | Redirect legacy |
| `/portal/creditos` | `LicenseeCredits` | Redirect legacy |

### Área PDV (7 rotas)
| Rota | Página | Descrição |
|---|---|---|
| `/pdv/dashboard` | `PDVDashboard` | Dashboard PDV |
| `/pdv/pos` | `PDVPos` | Ponto de Venda (caixa) |
| `/pdv/estoque` | `PDVEstoque` | Estoque PDV (2-step dialog) |
| `/pdv/vendedores` | `PDVVendedores` | Vendedores |
| `/pdv/ranking` | `PDVRanking` | Ranking PDV |

### Outros (5 rotas)
| Rota | Página | Descrição |
|---|---|---|
| `/home` | `HomeHub` | Hub central |
| `/scheduling` | `Scheduling` | Agenda e calendário |
| `/mapa-territorial` | `MapaTerritorial` | Mapa territorial |
| `/checklist` | `Checklist` | Checklist operacional |
| `/ai-assistant` | `AIAssistantPage` | Assistente IA |
| `/integrations/bling/callback` | `BlingCallback` | Callback OAuth Bling |

**Total: 96 rotas**

---

## 7. COMPONENTES POR ÁREA

### Layouts (4)
- `BoardLayout` — Layout principal OPS (sidebar, topbar, navegação)
- `LicenseeLayout` — Layout portal licenciado
- `PDVLayout` — Layout área PDV
- `OpsLayout` — Layout operações

### Dashboard (8 componentes)
- `AdminDashboard`, `CeoDashboard`, `GestorDashboard`, `ManagerDashboard`
- `OperadorDashboard`, `LegacyOperatorDashboard`
- `EcosystemCharts`, `EcosystemKPIs`, `DepartmentChart`, `TrendChart`, `LastLoginTab`

### CRM (3 componentes)
- `CRMKanbanBoard`, `CRMLeadCard`, `CRMLeadForm`

### OS — Ordens de Serviço (15+ componentes)
- `OSCard`, `OSKanbanBoard`, `CreateOSDialog`, `OSProgressBar`, `SlaIndicator`
- `ChecklistFlow`, `ChecklistStep`, `ChecklistItemCard`, `StageFlowTimeline`
- `OSChatDrawer` (chat completo com mensagens, ações, anexos)
- `LicenseeInfoCard`, `CapacityIndicator`, `FlowBlockAlert`

### Produção / OPs (10 componentes)
- `OPKanbanBoard`, `OPKanbanCard`, `OPTable`, `OPKpiCards`
- `CreateOPDialog`, `EditOPDialog`, `DeleteOPDialog`, `ConfirmOPDialog`
- `OPFilters`, `ConfirmationDetail`

### Licenciados (10 componentes)
- `LicenseesTable`, `LicenseesFilters`, `LicenseeSubNav`
- `CreateLicenseeDialog`, `EditLicenseeDialog`, `InactivateLicenseeDialog`, `ReactivateLicenseeDialog`
- `LicenseeAccessCard`, `LicenseePerformanceCharts`
- `LicenseeRankings`

### MRP / Suprimentos (8 componentes)
- `StockOverview`, `StockProgressBar`, `StockMovementsList`
- `GaugeChart`, `MiniTrendChart`, `SkuStockPolicy`, `PendingSuggestions`
- `ProductBomModal`

### SKUs e Lotes (10 componentes)
- `SkusTable`, `SkusFilters`, `CreateSkuDialog`, `EditSkuDialog`, `DeleteSkuDialog`, `BomEditor`
- `LotsTable`, `LotsFilters`, `CreateLotDialog`, `EditLotDialog`, `DeleteLotDialog`

### Logística (8 componentes)
- `LogisticsKanban`, `LogisticsKPIs`, `LogisticsStrategic`
- `FreightCalculator`, `FreightResults`, `FreightReports`
- `ShipmentCard`, `ShipmentDetailsDialog`, `OSLogisticsSection`

### Financeiro (4 componentes)
- `CreateRCDialog`, `RCDetailsPanel`, `RCFlowStepper`, `RCRequestsList`

### Equipe / Admin (6 componentes)
- `AddMemberDialog`, `EditMemberDialog`, `DeleteMemberDialog`
- `MasterAdminControls`, `OrgChart`, `TeamBulkImport`

### PDV (1 componente)
- `LinkPDVDialog`

### Mapas (6 componentes)
- `LeafletMap`, `LicenseeMiniMap`, `MapPreview`, `TerritorialMap`, `SafeGeographicMap`, `NetworkMap`

### AI (3 componentes)
- `AIAssistant`, `AIChatDrawer`, `TextEnhancerButton`

### Notificações (2 componentes)
- `NotificationBell`, `NotificationPanel`

### UI Design System (50+ componentes)
- shadcn/ui components + custom Carbo components (carbo-button, carbo-card, carbo-kpi, carbo-badge, carbo-empty-state, carbo-input, carbo-page-header, carbo-table)

### Animations (4 componentes)
- `FloatingParticles`, `MicroInteraction`, `PageTransition`, `SuccessAnimation`

---

## 8. HOOKS E LÓGICA DE NEGÓCIO

### Auth e Roles
- `useCarboRoles` — Papéis e permissões do usuário
- `useLicenseeAccess` — Acesso do licenciado

### Licenciados
- `useLicensees` — CRUD licenciados
- `useLicenseePortal` — Portal do licenciado
- `useLicenseeCommissions` — Comissões
- `useLicenseeNotifications` — Notificações
- `useLicenseeProducts` — Produtos
- `useLicenseeReagentStock` — Estoque de reagentes

### Pedidos e Vendas
- `useCarbozeOrders` — Pedidos CarboZé
- `useSalesTargets` — Metas de vendas

### CRM
- `useCRMLeads` — Leads CRM
- `useB2BLeads` — Leads B2B

### OS / Produção
- `useServiceOrders` — Ordens de serviço
- `useProductionOrders` — Ordens de produção
- `useProductionConfirmation` — Confirmação de produção
- `useOsActions` — Ações de OS
- `useOsMessages` — Chat de OS
- `useOsFlowValidation` — Validação de fluxo
- `useStageValidation` — Validação de etapa
- `useOpsAlerts` — Alertas operacionais

### MRP / Suprimentos
- `useMrpProducts` — Produtos MRP
- `useMrpSuppliers` — Fornecedores
- `useSkus` — SKUs
- `useLots` — Lotes
- `useStockMovements` — Movimentos de estoque
- `useProductMovements30d` — Movimentos 30 dias
- `useSkuWarehousePolicy` — Política de estoque
- `useProductBom` — Bill of Materials
- `useInsumoRequirement` (via suprimentos) — Requisitos de insumo

### Logística
- `useShipments` — Remessas
- `useFreightQuote` — Cotação de frete
- `useScheduledEvents` — Eventos agendados

### Financeiro / Compras
- `usePurchasing` — Compras
- `useRCPurchasing` — RC (Requisição de Compra)

### PDV
- `usePDV` — Dados PDV
- `usePDVProducts` — Produtos PDV
- `usePDVSales` — Vendas PDV
- `usePDVSellers` — Vendedores PDV

### CarboVapt
- `useDescarbSales` — Vendas descarbonização
- `useDescarbClients` — Clientes
- `useDescarbVehicles` — Veículos

### Equipe
- `useTeamMembers` — Membros da equipe
- `useTeamProfiles` — Perfis da equipe
- `useCreateTeamMember` — Criar membro
- `useDeleteUser` — Deletar usuário
- `useOrgChart` — Organograma
- `usePasswordReset` — Reset de senha

### Dashboards
- `useDashboardStats` — Estatísticas dashboard
- `useDashboardCharts` — Gráficos dashboard
- `useAdminData` — Dados admin
- `useEcosystemTimeline` — Timeline ecosistema
- `useNetworkIntelligence` — Inteligência de rede
- `useTerritorialData` — Dados territoriais

### AI e Intelligence
- `useAIChat` — Chat IA
- `useAIRecommendations` — Recomendações IA
- `useIntelligence` — Hub de inteligência

### Notificações
- `useNotifications` — Notificações gerais
- `useLicenseeNotifications` — Notificações licenciado
- `useMachineAlertNotifications` — Alertas de máquinas
- `useRealtimeMachineAlerts` — Alertas realtime

### Utilidades
- `useMachines` — Máquinas
- `useGeocode` — Geocodificação
- `useSuppliers` — Fornecedores
- `usePagination` — Paginação
- `useTheme` — Tema dark/light
- `useCountUp` — Animação numérica
- `useConfetti` — Efeito confete

---

## 9. EDGE FUNCTIONS

| Function | Descrição |
|---|---|
| `ai-chat` | Chat com IA (Claude) |
| `analyze-rc-quotations` | Análise de cotações de RC |
| `bling-auth` | OAuth2 com Bling ERP |
| `bling-sync` | Sincronização de dados Bling |
| `bulk-create-org-users` | Criação em massa de usuários |
| `calculate-licensee-gamification` | Cálculo de score/nível gamificação |
| `check-inactive-users` | Verificar usuários inativos |
| `check-low-stock-alerts` | Alertas de estoque baixo |
| `check-password-hibp` | Verificação HIBP (senhas vazadas) |
| `cnpj-lookup` | Consulta CNPJ na Receita Federal |
| `create-licensee-access` | Criar acesso para licenciado |
| `create-master-admin` | Criar admin master |
| `create-team-member` | Criar membro da equipe com senha temp |
| `forecast-engine` | Engine de previsão de demanda |
| `intelligence-engine` | Engine de inteligência de negócio |
| `licensee-ai-recommendations` | Recomendações IA para licenciado |
| `melhor-envio-quote` | Cotação de frete (Melhor Envio) |
| `process-licensee-checkout` | Processar checkout do licenciado |
| `process-recurring-orders` | Processar pedidos recorrentes |
| `request-password-reset` | Solicitar reset de senha |
| `resolve-password-reset` | Resolver reset de senha |
| `send-welcome-email` | Email de boas-vindas |
| `set-initial-password` | Definir senha inicial |
| `text-enhancer` | Melhorar texto com IA |
| `verify-reset-code` | Verificar código de reset |

**Total: 25 edge functions**

---

## 10. MIGRATIONS — SISTEMA NOVO

| Data | Arquivo | Descrição |
|---|---|---|
| 2026-01-30 | `20260130195149` | Schema inicial |
| 2026-01-30 | `20260130195229` | Complemento schema |
| 2026-02-02 | `20260202141151` | — |
| 2026-02-03 | `20260203114547` | — |
| ... | ... | *(migrations de fevereiro)* |
| 2026-03-11 | `20260311200000_add_phone_and_notifications` | Telefone + notificações |
| 2026-03-13 | `20260313120000_op_module_schema` | Módulo OS/OPs |
| 2026-03-13 | `20260313120001_op_module_seeds` | Seeds do módulo OS |
| 2026-03-13 | `20260313130000_stations_table` | Estações |
| 2026-03-13 | `20260313140000_bling_tables` | Tabelas Bling |
| 2026-03-13 | `20260313150000_auth_invite_and_reset_codes` | Auth convite + reset |
| 2026-03-25 | `20260325_add_org_chart_fields` | Campos organograma |
| 2026-04-05 | `20260405_bling_bridge` | Bridge Bling → CarboZé |
| 2026-04-05 | `20260405_product_catalog_link` | Link catálogo produtos |
| 2026-04-05 | `20260405_rv_module_fields` | Campos módulo RV |
| 2026-04-05 | `20260405_security_fixes` | Correções de segurança RLS |
| 2026-04-05 | `20260405_sku_warehouse_policy` | Política de estoque SKU |
| 2026-04-06 | `20260406_crm_universal_leads` | Leads CRM universal |
| 2026-04-06 | `20260406_org_chart_profiles` | Perfis organograma |
| 2026-04-07 | `20260407_descarb_sales_sprint_e` | Sprint E — CarboVapt |
| 2026-04-07 | `20260407_freight_quotes` | Cotações de frete |
| 2026-04-07 | `20260407_licenciados_sprint_a` | Sprint A — Licenciados |
| 2026-04-07 | `20260407_mrp_bom` | BOM (Bill of Materials) |
| 2026-04-07 | `20260407_mrp_bom_m14_restructure` | M14 — Reestruturação BOM |
| 2026-04-07 | `20260407_mrp_bom_seed` | Seeds BOM |
| 2026-04-07 | `20260407_mrp_products_seed` | Seeds produtos MRP |
| 2026-04-07 | `20260407_orders_vendedor_update` | *(deprecated — format errado)* |
| 2026-04-07 | `20260407_os_carbovapt` | OS + CarboVapt integration |
| 2026-04-08 | `20260408_org_profiles_fix` | Fix perfis org |
| 2026-04-08 | `20260408_pdv_sprint_g` | Sprint G — PDV |
| 2026-04-08 | `20260408_sprint_i_licensee_products` | Sprint I — Produtos licenciado |
| 2026-04-27 | `20260427_orders_vendedor_v2` | V1 — Vendedores (corrigido) |

---

## 11. GAPS E O QUE FALTA MIGRAR

### ❌ Funcionalidades do Antigo que NÃO existem no Novo

| # | Funcionalidade | Schema Antigo | Impacto | Prioridade |
|---|---|---|---|---|
| 1 | **Teste de Ruído** | `commercial.noise_test` | Médio — serviço específico | Média |
| 2 | **Promoções de Produto** | `catalog.promotion` | Baixo | Baixa |
| 3 | **Expositor PDV** | `pdv.expositor` | Baixo | Baixa |
| 4 | **Dados históricos CarboVapt** | `commercial.sale` | Alto — histórico de vendas | Alta |
| 5 | **Clientes históricos** | `commercial.client` | Alto — base de clientes | Alta |
| 6 | **Veículos históricos** | `commercial.client_car` | Médio | Média |
| 7 | **Transações financeiras históricas** | `commercial.transaction` | Alto — financeiro | Alta |
| 8 | **Estoque histórico PDV** | `pdv.stock` + `pdv.stock_movement` | Alto — movimentos anteriores | Alta |
| 9 | **Scorecards licenciados** | `institutional.branch.score_*` | Médio — já tem equivalente em gamification | Baixa |

### ⚠️ Funcionalidades Parciais no Novo

| # | Funcionalidade | Status | O que falta |
|---|---|---|---|
| 1 | **Sync Bling → bling_orders** | Parcial | Edge function não está populando a tabela em produção |
| 2 | **PDV Stock movements** | Parcial | Tabela existe, hooks PDV em desenvolvimento |
| 3 | **Logística** | Parcial | KPIs e kanban existem, entrega end-to-end incompleta |
| 4 | **Financeiro RC** | Parcial | Fluxo RC existe, integração com pagamentos pendente |
| 5 | **MRP / BOM** | Parcial | Schema criado, seeds prontos, UI em construção |
| 6 | **Vendedor nos pedidos** | ✅ Script pronto | Rodar `20260427_orders_vendedor_v2.sql` no SQL Editor |

### ✅ Funcionalidades Novas (não existiam no Antigo)

| Funcionalidade | Descrição |
|---|---|
| Portal Licenciado completo | 10 páginas, credito, comissões, gamificação |
| CRM avançado | 8 funis, kanban, scoring, follow-up |
| Integração Bling ERP | OAuth2, sync automático |
| AI Chat | Claude integrado via edge function |
| Network Intelligence | Mapa, ranking, expansão territorial |
| Gamificação | Níveis, scores, rankings licenciados |
| Carbo Roles | Sistema de papéis granular |
| Onboarding | Fluxo de onboarding para novos usuários |
| Edge Functions | 25 funções serverless |
| CNPJ Lookup | Consulta automática Receita Federal |
| Melhor Envio | Cotação de frete automática |
| HIBP | Verificação de senhas vazadas |
| Dashboard Estratégico CEO | Cockpit completo |

---

## 12. PLANO DE NIVELAMENTO

### Fase 1 — Dados Críticos (migrar do Antigo para o Novo)
| # | Ação | Origem | Destino | Como |
|---|---|---|---|---|
| 1 | Migrar clientes CarboVapt | `commercial.client` | `descarb_clients` | Script SQL ou export/import |
| 2 | Migrar histórico de vendas CarboVapt | `commercial.sale` | `descarb_sales` | Script SQL com mapeamento de colunas |
| 3 | Migrar veículos | `commercial.client_car` | `descarb_vehicles` | Script SQL |
| 4 | Migrar estoque PDV | `pdv.stock` | `licensee_product_stock` | Script SQL |
| 5 | Migrar movimentos PDV | `pdv.stock_movement` | Tabela equivalente | Script SQL |
| 6 | Migrar transações financeiras | `commercial.transaction` | `credit_transactions` | Script SQL |
| 7 | Migrar filiais/licenciados | `institutional.branch` | `licensees` | Script SQL com mapeamento |

### Fase 2 — Correções de Infraestrutura
| # | Ação | Status |
|---|---|---|
| 1 | Corrigir sync Bling → `bling_orders` (edge function não está gravando) | Em aberto |
| 2 | Verificar secrets GitHub Actions (SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_ID) | Em aberto |
| 3 | Rodar `20260427_orders_vendedor_v2.sql` para atualizar vendedores | Pronto para executar |

### Fase 3 — Funcionalidades Faltantes
| # | Ação | Prioridade |
|---|---|---|
| 1 | Implementar Teste de Ruído no sistema novo | Média |
| 2 | Finalizar módulo Logística end-to-end | Alta |
| 3 | Finalizar módulo Financeiro (RC + pagamentos) | Alta |
| 4 | Expositores PDV | Baixa |
| 5 | Promoções de produto | Baixa |

### Fase 4 — Validação Final
- Testar todas as 96 rotas com usuário real
- Validar RLS policies (novo banco)
- Confirmar que dados migrados aparecem corretamente no sistema novo
- Auditoria de performance (queries lentas)

---

## ESTRUTURA DE PASTAS — SISTEMA NOVO

```
carbohub2/
├── .github/
│   └── workflows/
│       └── deploy-functions.yml      ← CI/CD Edge Functions
├── src/
│   ├── App.tsx                       ← 96 rotas
│   ├── main.tsx
│   ├── assets/                       ← logos, imagens squads
│   ├── components/
│   │   ├── admin/                    ← CarboRolesManager, StageAccessManager
│   │   ├── ai/                       ← AIAssistant, AIChatDrawer, TextEnhancer
│   │   ├── animations/               ← FloatingParticles, PageTransition...
│   │   ├── auth/                     ← ForcePasswordChange, LoginLoading...
│   │   ├── board/                    ← KPICard, StatusBadge
│   │   ├── crm/                      ← CRMKanbanBoard, CRMLeadCard, CRMLeadForm
│   │   ├── dashboard/                ← 10 componentes dashboard role-based
│   │   ├── financeiro/               ← RC components (4)
│   │   ├── home/                     ← HomeHub, EcosystemOverview, OperationalFlowMap
│   │   ├── intelligence/             ← IntelligenceHub
│   │   ├── layouts/                  ← BoardLayout, LicenseeLayout, PDVLayout, OpsLayout
│   │   ├── licensee/                 ← AIRecommendationsCard, NovoAtendimentoModal
│   │   ├── licensees/                ← 10 componentes gestão licenciados
│   │   ├── logistics/                ← 9 componentes logística
│   │   ├── lots/                     ← 5 componentes lotes
│   │   ├── machines/                 ← 4 componentes máquinas
│   │   ├── maps/                     ← 6 componentes mapas (Leaflet)
│   │   ├── mrp/                      ← ProductBomModal
│   │   ├── navigation/               ← AreaSwitcher
│   │   ├── notifications/            ← NotificationBell, NotificationPanel
│   │   ├── onboarding/               ← 7 componentes onboarding
│   │   ├── ops/                      ← 12 componentes OS/checklist
│   │   ├── orders/                   ← EditOrderDialog, OrdersAnalytics
│   │   ├── os/                       ← OSBoard completo + chat (10 componentes)
│   │   ├── pdv/                      ← LinkPDVDialog
│   │   ├── production-orders/        ← 10 componentes OPs
│   │   ├── purchasing/               ← 8 componentes compras
│   │   ├── scheduling/               ← 4 componentes calendário
│   │   ├── skus/                     ← 6 componentes SKUs + BomEditor
│   │   ├── suprimentos/              ← 7 componentes supply
│   │   ├── team/                     ← 6 componentes equipe
│   │   └── ui/                       ← 50+ shadcn + custom Carbo components
│   ├── constants/
│   │   ├── departments.ts
│   │   └── squadLogos.ts
│   ├── contexts/
│   │   ├── AuthContext.tsx
│   │   └── DepartmentContext.tsx
│   ├── data/
│   │   ├── brazilStatesGeoJSON.ts
│   │   └── checklistData.ts
│   ├── hooks/                        ← 70+ hooks
│   ├── integrations/
│   │   └── supabase/
│   │       ├── client.ts             ← Supabase client config
│   │       └── types.ts              ← TypeScript types gerados
│   ├── lib/
│   │   ├── carboCore.ts
│   │   ├── exportUtils.ts
│   │   ├── featureFlags.ts
│   │   ├── mapUtils.ts
│   │   └── utils.ts
│   ├── pages/                        ← 80+ páginas (ver seção 6)
│   ├── test/                         ← Testes unitários e E2E
│   └── types/                        ← TypeScript types do domínio
├── supabase/
│   ├── config.toml
│   ├── functions/                    ← 25 edge functions
│   └── migrations/                   ← 80+ migrations
└── package.json
```

---

*Documento gerado automaticamente em 27/04/2026*
*Fonte: carbohub2 codebase + queries diretas nos bancos de dados*
