# CarboHub — Histórico de Desenvolvimento
> Atualizado em 2026-04-07 (Chat 7)

---

## Linha do Tempo — Entregas por Tarefa

### Fase Inicial (Tarefas #1–#41) — Base da Plataforma

As primeiras 41 tarefas cobriram a fundação completa do CarboHub:

- Estrutura multi-hub com `AreaSelector`, `LoginArea` e roteamento por hub.
- Autenticação com Supabase Auth, roles e contexto `AuthContext`.
- Hub Carbo Controle completo: OS Board (Kanban 8 etapas), Checklist, Scheduling.
- Hub Área Licenciados inicial: login, dashboard, catálogo, pedidos, créditos.
- Hub Lojas (ex-"Insumos"): dashboard de estoque, histórico, vinculação PDV.
- Módulo CRM com múltiplos funis, leads B2B e metas de vendas.
- MRP: catálogo de produtos, fornecedores, SKUs, lotes de produção.
- Suprimentos: estoque de insumos com movimentações.
- Logística: módulo de expedição base.
- Financeiro: requisições de compra, contas a pagar.
- Módulo de Equipe inicial.
- Integração Bling ERP (OAuth2, tabelas, bridge).
- Admin, Governança e Cockpit Estratégico.

**Status:** Todas concluídas.

---

### Sprint — Chat 6 (Tarefas #42–#46)

| # | Tarefa | Descrição | Status |
|---|--------|-----------|--------|
| 42 | Dashboard tab + 5 sub-páginas | `/dashboards/producao`, `/financeiro`, `/logistica`, `/comercial`, `/estrategico` | ✅ |
| 43 | Org chart visual | Circles + CSS connectors + 30 colaboradores | ✅ |
| 44 | SQL migration profiles | `20260406_org_chart_profiles.sql` — campos nome_completo, foto_url, cargo no profiles | ✅ script |
| 45 | Read-me_docs | Arquivos `Resumo.md`, `PRD.md`, `Historicos.md` criados em `/Read-me_docs/` | ✅ |
| 46 | Build + commit | Commit `a5cda60` | ✅ |

---

### Sprint — Chat 7 (Tarefas #47–#72)

| # | Tarefa | Descrição | Status |
|---|--------|-----------|--------|
| 47 | /suprimentos: filtrar "Produto Final" | Filtro por categoria — somente insumos/materiais exibidos | ✅ |
| 48 | Importar 8.845 leads CRM | 348 clientes + 8.497 prospects + 69+14 B2B | ⏳ |
| 49 | Export PDF/Excel global | Exportação em relatórios — parcial (/orders + /suprimentos) | ✅ parcial |
| 50 | Onboarding licenciado | Checklist 5 fases CarboVAPT v3.0 | ⏳ |
| 51 | Org Chart UX | Linhas conectoras CSS + Times da Marina | ✅ |
| 52 | /team: remover organograma | Apenas aba Equipe + Importar Time | ✅ |
| 53 | /licensees Ranking | Botão de edição + tooltips 1L/100ml no ranking | ✅ |
| 54 | /network-map fix | Fallback `BRAZIL_CITIES_COORDS` para cidades sem geocode | ✅ |
| 55 | /territory-intelligence | Aba "Mapa de Bolhas" com Leaflet | ✅ |
| 56 | /territory-expansion | Botão "Criar Estratégia" + score CRM integrado | ✅ |
| 57 | Menu Dash→Ops→Controle | Renomear "Dados Mestres" → "Controle" na navegação | ✅ |
| 58 | OP Kanban | `OPKanbanBoard` + toggle Lista/Kanban em `/production-orders` | ✅ |
| 59 | OS Board CarboVAPT | Funil 8 etapas B2C/B2B/Frota na OS | ✅ |
| 60 | /logistics: aba Frete | Calculadora Melhor Envio catálogo + manual + histórico CSV | ✅ |
| 61 | /team: aba Time Completo | 30 colaboradores em cards por departamento | ✅ |
| 62 | /org-chart: Emmily lateral | Emmily ao lado do Thelis + UX geral aprimorada | ✅ |
| 63 | /orders: NF + export | Coluna NF, filtro de/até data, export Excel/CSV/PDF | ✅ |
| 64 | DatePickerInput | Calendar picker com Popover + Calendar + locale pt-BR em /orders | ✅ |
| 65 | MRP BOM | Tabela `mrp_bom` + hook `useProductBom` + modal `ProductBomModal` | ✅ |
| 66 | CEP auto-fill | ViaCEP com debounce + status indicator na `FreightCalculator` | ✅ |
| 67 | Edge Function fallback | Mock data quando `melhor-envio-quote` não está deployada | ✅ |
| 68 | /suprimentos: export + MasterAdmin | Botão Exportar Excel + edição restrita a MasterAdmin | ✅ |
| 69 | Dashboard período + Ver detalhes | Filtro Semanas/Meses/Período + link direto para /orders | ✅ |
| 70 | MrpProducts tabs + BOM clickable | Tabs filtro de categoria + clique no nome do Produto Final abre BOM modal | ✅ |
| 71 | Renomear "Insumos" → "Lojas" | Hub PDV renomeado em todos os arquivos do projeto | ✅ |
| 72 | Documentação técnica hubs | `Read-me_docs/HUBS_ARCHITECTURE.md` criado | ✅ |
| 73 | Área Licenciados — evolução | Portal do licenciado: features pendentes (Sprint B–E) | ⏳ |

---

## Commits Principais

| Hash | Data | Descrição |
|------|------|-----------|
| `a5cda60` | 2026-04-06 | Dashboards (5 sub-páginas), Org Chart visual, docs Read-me_docs |
| `f9a3318` | 2026-04-07 | Org Chart UX + Linhas Marina + network map fix + licensee ranking edit |
| `48b1376` | 2026-04-07 | Menu Controle + OP Kanban + OS Descarbonização CarboVAPT |
| `0d42e77` | 2026-04-07 | OrgChart Emmily lateral + Time Completo + Frete Melhor Envio + Orders NF/export |
| `8bf7dfa` | 2026-04-07 | CEP auto-fill, Edge Function fallback, DatePickerInput, BOM MRP, suprimentos export |

---

## Sprint A — Tabelas SQL (Área Licenciados — Foundation)

Migration: `supabase/migrations/20260407_licenciados_sprint_a.sql`

Estas tabelas foram criadas para suportar as funcionalidades avançadas do portal do licenciado (Sprints B–E):

| Tabela | Descrição | Colunas-chave |
|--------|-----------|---------------|
| `descarb_clients` | Clientes dos licenciados (pessoas físicas e jurídicas atendidas) | `licensee_id`, `name`, `federal_code`, `city`, `state` |
| `descarb_vehicles` | Veículos dos clientes para serviço de carbonatação | `client_id`, `licensee_id`, `license_plate`, `brand`, `model`, `fuel_type`, `kilometer` |
| `descarb_sales` | Atendimentos de descarbonização realizados | `licensee_id`, `machine_id`, `vehicle_id`, `modality` (P/M/G/G+), `reagent_qty_used`, `payment_type`, `total_value`, `executed_at`, `certificate_issued` |
| `licensee_reagent_stock` | Estoque de reagentes por licenciado | `licensee_id` (UNIQUE), `qty_normal`, `qty_flex`, `qty_diesel`, `min_qty_alert` |
| `reagent_movements` | Movimentações de reagente (consumo, reposição, ajuste) | `licensee_id`, `descarb_sale_id`, `tipo`, `reagent_type`, `quantidade`, `saldo_apos` |
| `licensee_product_stock` | Estoque de produtos finais por licenciado (CarboZé, CarboPRO) | `licensee_id`, `mrp_product_id`, `quantity`, `min_qty_alert` |
| `ops_alerts` | Central de alertas operacionais do CarboOps | `tipo`, `licensee_id`, `titulo`, `prioridade` (low/medium/high/critical), `status` (open/in_progress/resolved/dismissed) |

Todas as tabelas possuem:
- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- RLS habilitado com policies separadas para SELECT, INSERT e UPDATE por role
- Índices nos campos de licensee_id e created_at para performance de queries

**Tipos de alerta suportados em `ops_alerts`:**
`reagent_low`, `product_low`, `new_sale`, `replenishment_request`, `commission_pending`, `machine_alert`, `pre_sale_expired`, `inactivity_alert`

---

## Outras Migrations Relevantes

| Arquivo | Descrição |
|---------|-----------|
| `20260305131428_*.sql` | Migration inicial — estrutura base |
| `20260313120000_op_module_schema.sql` | Schema do módulo de OPs |
| `20260313140000_bling_tables.sql` | Tabelas de integração Bling |
| `20260313150000_auth_invite_and_reset_codes.sql` | Convites e reset de senha |
| `20260325_add_org_chart_fields.sql` | Campos extras no organograma |
| `20260405_bling_bridge.sql` | Bridge de sincronização Bling |
| `20260405_security_fixes.sql` | Correções de RLS e políticas |
| `20260406_crm_universal_leads.sql` | Leads unificados para CRM |
| `20260406_org_chart_profiles.sql` | Campos de perfil para organograma (nome_completo, foto_url, cargo) |
| `20260407_os_carbovapt.sql` | Funil OS CarboVAPT com 8 etapas |
| `20260407_freight_quotes.sql` | Histórico de cotações de frete |
| `20260407_mrp_bom.sql` | Bill of Materials (BOM) para Produtos Finais |
| `20260407_mrp_bom_seed.sql` | Dados seed iniciais da BOM |
| `20260407_licenciados_sprint_a.sql` | Sprint A — foundation tables para Área Licenciados |

---

## Ações Manuais Pendentes (Peterson executa no Supabase/GitHub)

| # | Acao | Onde | Status |
|---|------|------|--------|
| M1 | Rodar `20260406_org_chart_profiles.sql` | Supabase → SQL Editor | ⏳ |
| M3 | Rodar `20260407_freight_quotes.sql` | Supabase → SQL Editor | ⏳ |
| M4 | Criar conta Melhor Envio sandbox | https://app-sandbox.melhorenvio.com.br | ⏳ |
| M5 | Gerar token OAuth2 Melhor Envio | Integrações → Área do Dev → Criar App | ⏳ |
| M6 | Adicionar secret `MELHOR_ENVIO_TOKEN` | Supabase → Project Settings → Edge Functions → Secrets | ⏳ |
| M7 | Deploy Edge Function frete | Terminal: `supabase functions deploy melhor-envio-quote` | ⏳ |
| M8 | Verificar HTTPS habilitado | GitHub → repo → Settings → Pages → "Enforce HTTPS" | ⏳ |
| M9 | Cadastrar produtos no MRP como "Produto Final" | /mrp → cadastrar CarboZé, CarboPRO | ⏳ |
| M10 | Rodar `20260407_mrp_bom.sql` | Supabase → SQL Editor | ⏳ |

**Ja concluídas:** M2 — Rodar `20260407_os_carbovapt.sql` (feito).
