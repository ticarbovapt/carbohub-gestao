# Resumo — CarboHub

## Projeto
**CarboHub** (CarboFlow Companion) — Plataforma corporativa do Grupo Carbo.

| Item | Valor |
|------|-------|
| Stack | Vite 5 + React 18 + TypeScript + Tailwind + shadcn/ui |
| Backend | Supabase (`spigkskwypbnaiwkaher.supabase.co`) |
| Repo | `petersonoliveira14-debug/CarboHub` (privado) |
| Produção | `carbohub.com.br` (GitHub Pages) |
| Deploy | Push → GitHub Actions → Pages (~1 min) |

---

## Módulos Entregues

| # | Módulo | Rota | Status |
|---|--------|------|--------|
| 1 | Dashboard por roles | `/dashboard` | ✅ |
| 2 | Dashboard Produção | `/dashboards/producao` | ✅ |
| 3 | Dashboard Financeiro | `/dashboards/financeiro` | ✅ |
| 4 | Dashboard Logística | `/dashboards/logistica` | ✅ |
| 5 | Dashboard Comercial | `/dashboards/comercial` | ✅ |
| 6 | Dashboard Estratégico | `/dashboards/estrategico` | ✅ |
| 7 | Controle de Pedidos (99 pedidos Bling) | `/orders` | ✅ |
| 8 | CRM 8 funis Kanban | `/crm`, `/crm/:funnelType` | ✅ |
| 9 | Suprimentos + Safety Stock | `/suprimentos` | ✅ |
| 10 | Catálogo Insumos/SKUs | `/mrp/products` | ✅ |
| 11 | Fornecedores | `/mrp/suppliers` | ✅ |
| 12 | Ordens de Produção | `/production-orders` | ✅ |
| 13 | Logística Kanban | `/logistics` | ✅ |
| 14 | Financeiro + RC | `/financeiro` | ✅ |
| 15 | Metas de Vendas | `/sales-targets` | ✅ |
| 16 | Licenciados + sub-nav | `/licensees` | ✅ |
| 17 | Organograma visual | `/org-chart` | ✅ |
| 18 | Equipe | `/team` | ✅ |
| 19 | Mapa Territorial | `/mapa-territorial` | ✅ |
| 20 | Portal Licenciado | `/licensee/*` | ✅ |
| 21 | PDV | `/pdv/*` | ✅ |
| 22 | AI Assistant | `/ai-assistant` | ✅ |
| 23 | Integração Bling | `/integrations/bling` | ✅ |
| 24 | OP Detail Page (Salesforce-style) | `/production-orders/:id` | ✅ |
| 25 | PDV Estoque 2-step confirmation | `/pdv/estoque` | ✅ |
| 26 | Licensee Dashboard Admin panorama | `/licensee/dashboard` | ✅ |
| 27 | Licensee Produtos Mood1 | `/licensee/produtos` | ✅ |
| 28 | Ferramentas Gestão em /team | `/team` (Organograma, Governança, etc.) | ✅ |
| 29 | Bling sidebar OPS Financeiro & Supply | BoardLayout sidebar | ✅ |
| 30 | PDV permissões 3 níveis (MasterAdmin/Expansão/Manager) | `/pdv/estoque` | ✅ |

---

## Pendências

| # | Tarefa | Responsável |
|---|--------|-------------|
| P1 | Rodar `20260408_org_profiles_fix.sql` no Supabase SQL Editor | Peterson |
| P2 | Rodar `20260407_freight_quotes.sql` no Supabase SQL Editor | Peterson |
| P3 | Importar 8.845 leads CRM | Claude |
| P4 | Onboarding licenciado (checklist 5 fases) | Claude |
| P5 | Integração Melhor Envio Edge Function deploy | Peterson |

---

## Infraestrutura Supabase

- **Projeto:** `spigkskwypbnaiwkaher.supabase.co`
- **42+ migrations** aplicadas
- **RLS ativo** em todas as tabelas sensíveis
- **Edge Functions bloqueadas** (Free plan — upgrade necessário para alertas e webhook Bling)

---

## Convenções

| Convenção | Regra |
|-----------|-------|
| Build check | `tsc --noEmit --skipLibCheck` antes de cada commit |
| Commit | Co-Authored-By: Claude Sonnet |
| Deploy | Push → GitHub Actions → GitHub Pages (~1 min) |
| Docs | `Read-me_docs/` atualizado a cada modificação |
