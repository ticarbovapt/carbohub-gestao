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

---

## Pendências

| # | Tarefa | Responsável |
|---|--------|-------------|
| 34 | Rodar SQL migration profiles no Supabase | Peterson |
| 35 | Filtrar "Produto Final" em /suprimentos | Claude |
| 36 | Importar 8.845 leads CRM | Claude |
| 37 | Export PDF/Excel nas páginas de dados | Claude |
| 39 | Onboarding licenciado (checklist 5 fases) | Claude |

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
