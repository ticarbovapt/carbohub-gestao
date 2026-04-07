# CarboHub — Arquitetura dos Hubs
> Atualizado automaticamente a cada sessão de desenvolvimento
> Última atualização: 2026-04-07 (Chat 7)

---

## Visão Geral

CarboHub é uma plataforma multi-tenant com **3 hubs independentes**, cada um com layout, autenticação e fluxo de navegação distintos. Todos compartilham o mesmo backend Supabase e banco de dados PostgreSQL, isolados por RLS (Row Level Security).

```
carbohub.com.br  →  AreaSelector (/)
                     ├── Carbo Controle   →  /login/ops       →  /dashboard
                     ├── Área Licenciados →  /login/licensee  →  /licensee/dashboard
                     └── Lojas            →  /login/pdv       →  /pdv/dashboard
```

**Arquivo de seleção de hub:** `src/pages/AreaSelector.tsx`
**Arquivo de login por área:** `src/pages/LoginArea.tsx`
**Roteamento central:** `src/App.tsx` (597 linhas)

---

## HUB 1 — Carbo Controle (Gestão Interna)

**Cor:** Azul | **Ícone:** Settings2 | **Rota de entrada:** `/login/ops`
**Layout:** `src/components/layouts/BoardLayout.tsx`
**Roles:** MasterAdmin > CEO > Gestor (ADM/FIN/Compras) > Operador

### Módulos e Rotas

#### Dashboard
| Rota | Componente | Descrição |
|------|-----------|-----------|
| `/dashboard` | `Dashboard.tsx` | Dashboard role-based (CEO/Gestor/Operador) |
| `/dashboards/producao` | `DashboardProducao.tsx` | KPIs de produção e OPs |
| `/dashboards/financeiro` | `DashboardFinanceiro.tsx` | Receita, DRE simplificado |
| `/dashboards/logistica` | `DashboardLogistica.tsx` | Expedições, transportadoras |
| `/dashboards/comercial` | `DashboardComercial.tsx` | Funil de vendas, conversão |
| `/dashboards/estrategico` | `DashboardEstrategico.tsx` | Visão executiva consolidada |

**Dashboards por role (`src/components/dashboard/`):**
- `CeoDashboard.tsx` — Cockpit com KPIs globais, gráfico Performance de Vendas (filtro semanas/meses/período), mapa fluxo operacional
- `GestorDashboard.tsx` — Tarefas pendentes, métricas por departamento
- `OperadorDashboard.tsx` — Tarefas do dia, OPs ativas

#### Operações de Serviço (OS)
| Rota | Componente | Descrição |
|------|-----------|-----------|
| `/os` | `OSBoard.tsx` | Kanban de Ordens de Serviço (8 etapas) |
| `/os/:id` | `OSDetails.tsx` | Detalhe da OS |
| `/checklist` | `Checklist.tsx` | Checklists operacionais |
| `/scheduling` | `Scheduling.tsx` | Agendamento de serviços |

#### Ordens de Produção (OP)
| Rota | Componente | Descrição |
|------|-----------|-----------|
| `/production-orders` | `ProductionOrdersOP.tsx` | OPs com toggle Kanban/Lista |

#### Pedidos & Vendas
| Rota | Componente | Descrição |
|------|-----------|-----------|
| `/orders` | `Orders.tsx` | Pedidos Carboze (NF, filtro data, export Excel/CSV/PDF) |
| `/orders/new` | `CreateOrder.tsx` | Novo pedido |
| `/orders/:id` | `OrderDetails.tsx` | Detalhe do pedido |
| `/b2b` | `B2BLeads.tsx` | Leads B2B |
| `/b2b/funnel` | `B2BFunnel.tsx` | Funil B2B |
| `/crm` | `CRMDashboard.tsx` | CRM central |
| `/crm/:funnelType` | `CRMFunnel.tsx` | Funil por tipo |
| `/sales-targets` | `SalesTargets.tsx` | Metas de vendas |

#### Licenciados (visão interna)
| Rota | Componente | Descrição |
|------|-----------|-----------|
| `/licensees` | `Licensees.tsx` | Lista, criação e edição de licenciados |
| `/licensees/:id` | `LicenseeDetails.tsx` | Perfil completo do licenciado |
| `/licensee/new` | `NewLicensee.tsx` | Cadastro de novo licenciado |
| `/licensee-ranking` | `LicenseeRanking.tsx` | Ranking de performance com gamification |
| `/network-map` | `NetworkMap.tsx` | Distribuição geográfica |
| `/territory-intelligence` | `TerritoryIntelligence.tsx` | Análise territorial + mapa de bolhas |
| `/territory-expansion` | `TerritoryExpansion.tsx` | Planejamento de expansão |

#### Supply Chain & Financeiro
| Rota | Componente | Descrição |
|------|-----------|-----------|
| `/logistics` | `Logistics.tsx` | Expedição + calculadora frete Melhor Envio + histórico |
| `/purchasing` | `Purchasing.tsx` | Compras e fornecedores |
| `/suprimentos` | `Suprimentos.tsx` | Estoque de insumos (excl. Produto Final), movimentações, export |
| `/financeiro` | `Financeiro.tsx` | Requisições de compra, cotações, contas a pagar |

#### MRP (Manufacturing Resource Planning)
| Rota | Componente | Descrição |
|------|-----------|-----------|
| `/mrp/products` | `MrpProducts.tsx` | Catálogo com tabs (Todos/Produto Final/Insumos/Embalagem) + BOM modal |
| `/mrp/suppliers` | `MrpSuppliers.tsx` | Fornecedores |
| `/skus` | `Skus.tsx` | SKUs com BOM |
| `/lots` | `Lots.tsx` | Lotes de produção |

**Tabela `mrp_bom`:** BOM de Produtos Finais — insumos + quantidades por unidade produzida
**Hook:** `src/hooks/useProductBom.ts`
**Modal BOM:** `src/components/mrp/ProductBomModal.tsx`

#### Equipe & Organização
| Rota | Componente | Descrição |
|------|-----------|-----------|
| `/team` | `Team.tsx` | Equipe (tabs: Organograma / Time Completo) |
| `/org-chart` | `OrgChartPage.tsx` | Organograma visual (Emmily assistente lateral) |
| `/role-matrix` | `RoleMatrix.tsx` | Matriz de papéis |
| `/responsibility-map` | `ResponsibilityMap.tsx` | Mapa de responsabilidades |

#### Admin & Governança
| Rota | Componente | Acesso |
|------|-----------|--------|
| `/admin` | `Admin.tsx` | Admin |
| `/admin/approval` | `AdminApproval.tsx` | Admin |
| `/admin/cockpit` | `CockpitEstrategico.tsx` | CEO + MasterAdmin |
| `/governance` | `CarboGovernance.tsx` | CEO only |

#### Integrações
| Rota | Componente | Descrição |
|------|-----------|-----------|
| `/integrations/bling` | `BlingIntegration.tsx` | Bling ERP OAuth2 |
| `/ai-assistant` | `AIAssistantPage.tsx` | Assistente IA |
| `/import` | `DataImport.tsx` | Importação de dados |

### Hooks Principais
- `useAuth()` — `src/contexts/AuthContext.tsx` — roles, session, isMasterAdmin
- `useMrpProducts()` — catálogo de produtos
- `useProductBom()` — BOM de Produtos Finais
- `useFreightQuote()` / `useSaveFreightQuote()` — calculadora frete
- `useStockMovements()` — movimentações de estoque
- `useProductMovements30d()` — tendências 30 dias (BI)

---

## HUB 2 — Área Licenciados (Portal do Licenciado)

**Cor:** Verde (carbo-green) | **Ícone:** Users | **Rota de entrada:** `/login/licensee`
**Layout:** `src/components/layouts/LicenseeLayout.tsx`
**Roles:** Licenciado (acesso via profile.licensee_id)

### O que é
Portal exclusivo para parceiros (licenciados) do Grupo Carbo. Permite solicitar serviços de carbonatação (CarboVAPT e CarboZé), acompanhar pedidos, gerenciar créditos e visualizar comissões.

### Rotas

| Rota | Componente | Descrição |
|------|-----------|-----------|
| `/licensee/dashboard` | `LicenseeDashboard.tsx` | Dashboard principal do licenciado |
| `/licensee/vapt` | `ServiceCatalog.tsx` (tipo: carbo_vapt) | Catálogo CarboVAPT — carbonatação a domicílio |
| `/licensee/ze` | `ServiceCatalog.tsx` (tipo: carbo_ze) | Catálogo CarboZé — insumos e produtos |
| `/licensee/pedidos` | `LicenseeRequests.tsx` | Meus pedidos (filtro por status) |
| `/licensee/creditos` | `LicenseeCredits.tsx` | Carteira de créditos |
| `/licensee/comissoes` | `LicenseeCommissions.tsx` | Comissões e ganhos |

**Rotas legadas (mantidas para compatibilidade):**
- `/licenciado/carboVAPT/servicos`, `/checkout`, `/pagamento`, `/confirmacao`
- `/portal/*` → redirect para `/licensee/*`

### Features do Dashboard (`LicenseeDashboard.tsx`)
- Boas-vindas com nome e status do licenciado
- Saldo da carteira de créditos
- Informações da assinatura (nível SLA)
- Card de Recomendações da IA (`AIRecommendationsCard.tsx`)
- Pedidos recentes
- Próximas execuções agendadas

### Componentes-chave
- `src/components/licensee/AIRecommendationsCard.tsx` — sugestões inteligentes
- `src/components/licensee/LicenseeWalletCard.tsx` — saldo e extrato
- `src/components/licensee/ServiceRequestCard.tsx` — card de serviço

### Hooks Principais
```typescript
useLicenseeStatus()              // identidade e status do licenciado
useLicenseeWallet(licenseeId)    // saldo e transações
useLicenseeSubscription(id)      // plano/SLA
useLicenseeRequests(id)          // pedidos
useServiceCatalog(operationType) // catálogo carbo_vapt | carbo_ze
useCreateRequest()               // submeter novo pedido
useLicenseeRealtimeNotifications() // notificações em tempo real
```

### Modelo de Dados
- Tabela `licensees` — cadastro mestre
- Tabela `service_requests` — pedidos do licenciado
- Tabela `licensee_credits` / `credit_transactions` — carteira
- Tabela `licensee_gamification` — pontuação e level
- Tabela `service_catalog` — catálogo de serviços por tipo

### Estado Atual (2026-04-07)
- ✅ Login + dashboard funcional
- ✅ Catálogo CarboVAPT e CarboZé com agendamento
- ✅ Pedidos com filtro e busca
- ✅ Créditos e carteira
- ✅ Ranking de gamification (visível no Carbo Controle)
- ⏳ Onboarding licenciado — checklist 5 fases CarboVAPT v3.0 (#50)
- ⏳ Notificações push

---

## HUB 3 — Lojas (ex-"Insumos")

**Cor:** Âmbar/Laranja | **Ícone:** Store | **Rota de entrada:** `/login/pdv`
**Layout:** `src/components/layouts/PDVLayout.tsx`
**Roles:** PDV (acesso via profile.pdv_id)

### O que é
Portal para lojas/pontos de venda vinculados a licenciados. Permite monitorar estoque de insumos CarboZé, solicitar reposição e visualizar histórico de abastecimentos. Renomeado de "Insumos" para "Lojas" em abril/2026.

### Rotas

| Rota | Componente | Descrição |
|------|-----------|-----------|
| `/pdv/dashboard` | `PDVDashboard.tsx` | Overview do estoque da loja |
| `/pdv/stock` | `PDVStock.tsx` | Detalhamento do estoque com indicadores |
| `/pdv/history` | `PDVHistory.tsx` | Histórico de reposições |

### Features do Dashboard (`PDVDashboard.tsx`)
- Status de vinculação (loja vinculada ao licenciado ou não)
- Nível de estoque atual (unidades + percentual)
- Cálculo de dias até ruptura (baseado em consumo médio diário)
- Limites mínimo/máximo de estoque
- Pedidos relacionados do licenciado
- Dialog para vincular PDV (admin/CEO only)
- Botão de solicitar reposição

### Features de Estoque (`PDVStock.tsx`)
- Métricas detalhadas: consumo, cobertura, tendência
- Enforcement do threshold mínimo
- Indicadores visuais: crítico / atenção / OK
- Solicitação de reposição com quantidade desejada

### Features de Histórico (`PDVHistory.tsx`)
- Log de todas as reposições recebidas
- Total acumulado de unidades
- Média por reposição
- Filtro por data

### Hooks Principais
```typescript
usePDVStatus()                       // identidade e vinculação da loja
usePDVData(pdvId)                    // dados de estoque em tempo real
usePDVReplenishmentHistory(pdvId)    // histórico de reposições
useRequestReplenishment()            // solicitar reposição
```

### Modelo de Dados
- Tabela `pdvs` — cadastro das lojas
- Coluna `assigned_licensee_id` — vínculo com licenciado
- Campos: `currentStock`, `minStockThreshold`, `avgDailyConsumption`
- Integração com `carboze_orders`

### Estado Atual (2026-04-07)
- ✅ Dashboard com indicadores de estoque
- ✅ Histórico de reposições
- ✅ Vinculação PDV-licenciado (admin)
- ⏳ Relatório de consumo exportável
- ⏳ Alertas automatizados por email/SMS

---

## Componentes Compartilhados

| Componente | Arquivo | Descrição |
|-----------|---------|-----------|
| AreaSelector | `src/pages/AreaSelector.tsx` | Seleção de hub na landing page |
| HomeHub | `src/components/home/HomeHub.tsx` | Navegação pós-login |
| AreaSwitcher | `src/components/navigation/AreaSwitcher.tsx` | Troca de hub no topo |
| AuthContext | `src/contexts/AuthContext.tsx` | Autenticação + roles |
| DatePickerInput | `src/components/ui/date-picker-input.tsx` | Calendário reutilizável |
| ThemeToggle | `src/components/ui/ThemeToggle.tsx` | Dark/Light mode |

---

## Arquitetura de Segurança (RLS)

```
Tabela          | Select | Insert | Update | Delete
─────────────────────────────────────────────────
mrp_bom         | auth   | admin/manager | admin/manager | admin/manager
mrp_products    | auth   | admin  | admin  | admin
licensees       | auth   | admin  | admin  | admin
service_requests| próprio| licensee | admin | admin
pdvs            | próprio| admin  | admin  | admin
warehouse_stock | auth   | admin  | admin  | admin
```

---

## Convenções de Desenvolvimento

```bash
# Build check antes de cada commit
npx tsc --noEmit --skipLibCheck

# Commit padrão
git commit -m "feat: descrição
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

# Deploy automático
git push  # → GitHub Actions → GitHub Pages (~1 min)
```

---

## Histórico de Commits

| Commit | Data | Descrição |
|--------|------|-----------|
| `8bf7dfa` | 2026-04-07 | CEP auto-fill, Edge Function fallback, DatePickerInput, BOM MRP, suprimentos export |
| `0d42e77` | 2026-04-07 | OrgChart Emmily lateral + Time Completo + Frete Melhor Envio + Orders NF/export |
| `48b1376` | 2026-04-07 | Menu Controle + OP Kanban + OS Descarbonizacao CarboVAPT |
| `f9a3318` | 2026-04-07 | Org chart UX + Marina teams + network map fix + licensee ranking edit |
