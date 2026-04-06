# Histórico de Desenvolvimento — CarboHub

## Formato
Cada entrada registra o que foi entregue, decisões tomadas e contexto relevante.

---

## Sessão — 06/04/2026 (Chat 3 — Org Chart Visual + Dashboards + Deploy)

### Tarefa #42 — Dashboard Tab + 5 Sub-páginas ✅
**Problema:** Menu já tinha aba "Dash" no BoardLayout mas as rotas `/dashboards/*` não existiam no App.tsx, e as páginas faltavam.

**Solução:**
- Criadas/confirmadas 5 páginas em `src/pages/dashboards/`:
  - `DashboardProducao.tsx` — Checklists, KPIs OS, TrendChart, DepartmentChart
  - `DashboardFinanceiro.tsx` — Wrap do `PurchasingDashboard`
  - `DashboardLogistica.tsx` — LogisticsKPIs + LogisticsKanban + tabs
  - `DashboardComercial.tsx` — KPIs licenciados + últimos pedidos
  - `DashboardEstrategico.tsx` — CeoDashboard | GestorDashboard por role
- `App.tsx` atualizado: rotas `/dashboards/producao|financeiro|logistica|comercial|estrategico`
- `/mrp/dashboard` → redirect para `/dashboards/producao`

### Tarefa #43 — Organograma Visual (Organizational Chart Style) ✅
**Problema:** Organograma estava em estilo lista/árvore indentada. Usuário quer estilo "Organizational Chart" com círculos, fotos e linhas conectoras (como a imagem de referência enviada).

**Solução:**
- `OrgChart.tsx` completamente redesenhado:
  - Padrão CSS org tree (ul/li com `::before`/`::after` para linhas conectoras)
  - Avatar circular (72–80px) com iniciais coloridas por departamento
  - Ring colorido pelo departamento em volta de cada avatar
  - Badge de cargo colorido abaixo do nome
  - Badge extra (violeta) para dual_role (Marina)
  - Tamanhos adaptativos: CEO (lg), Gestores (md), Staff (sm)
  - Expand/collapse com botão chevron
  - Scrollável horizontalmente para árvores largas
- `useOrgChart.ts` atualizado com **30 colaboradores** da planilha:
  - Adicionados: Márcio, Weider Moura (novos em Expansão)
  - Removido: Vinicius Constantino (não consta na planilha atual)
  - Rodrigo Torquato e Marcius D'Ávilla sob Marina (B2B)
  - Légia corrigida (era "Ligia") — sob Jayane

### Tarefa #44 — SQL Migration Profiles ✅ (pendente execução por Peterson)
**Arquivo:** `supabase/migrations/20260406_org_chart_profiles.sql`

**O que faz:**
- `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS` para hierarchy_level, reports_to, department, job_title, job_category, carbo_role
- `INSERT ... ON CONFLICT DO UPDATE` para todos os 30 colaboradores com UUIDs fixos
- `reports_to` referencia UUID do superior hierárquico

**Para executar:** Acessar Supabase SQL Editor e rodar o script.

### Tarefa #45 — Read-me_docs ✅
- Pasta `Read-me_docs/` criada em `C:\dev\carbohub2`
- `Resumo.md`, `PRD.md`, `Historicos.md` criados
- **Regra:** Atualizar estes arquivos a cada modificação do projeto

### Tarefa #46 — Commit + Deploy ✅
- Build check: `tsc --noEmit --skipLibCheck`
- Commit: todos os arquivos novos/modificados
- Push → GitHub Actions → GitHub Pages (~1 min)

---

## Sessão — 06/04/2026 (Chat 2 — Retomada)

### Tarefa #42 — Unificar Dashboards no Menu ✅
**Problema:** O menu tinha 4 grupos planos sem submenus. Dashboard estava solto em Operações.

**Solução:**
- `BoardLayout.tsx` reestruturado com 3 tabs: **Operações | Dados Mestres | Dashboards**
- `SidebarTab` type: `"dados" | "operacoes" | "dashboards"`
- `dashboardsItems` array com 5 sub-páginas
- Auto-detecção de tab ativa via `location.pathname.startsWith("/dashboards")`

### Tarefa #48 — Organograma Visual (primeira versão) ✅
- `OrgChart.tsx` criado com estilo árvore expandível
- Marina com duplo badge (Head Growth + Head B2B)
- `useOrgChart.ts` com `dual_role?: string` no `OrgNode`

### Bug Fix — Erro ao criar OP ✅
**Erro:** `null value in column 'product_id' of relation 'production_orders' violates not-null constraint`
**Causa:** Schema antigo no DB (product_id NOT NULL) vs código novo esperando sku_id
**Fix:** `CreateOPDialog.tsx` reescrito usando `useMrpProducts()` + payload alinhado ao schema existente + `generateOpNumber()` para `OP-YYYYMMDD-XXXX`

---

## Sessão — 06/04/2026 (Chat 1 — Retomada de contexto)

Sessão travou. Contexto recuperado via memory files. Plano de ação sincronizado do chat anterior (tarefas 1–51).

---

## Sessão — Março 2026

### Commits relevantes
| Hash | Descrição |
|------|-----------|
| `7286e4e` | Campos estoque/segurança no modal MRP |
| `fb14d51` | Menu otimizado 25→18 itens |
| `8396dad` | Botão voltar global |
| `d1fa1c1` | CRM 8 funis completo (1.419 linhas) |
| `e5cd529` | .npmrc legacy-peer-deps |

### Decisões de Arquitetura
- **Vercel abandonado** — Pro Trial bloqueava deploys; migrado para GitHub Pages
- **GitHub Pages** via `deploy.yml` (GitHub Actions), custom domain `carbohub.com.br`
- **DNS Hostinger** — 4 A records GitHub + CNAME www
- **Edge Functions bloqueadas** — Supabase Free plan não permite deploy
- **Roles Carbo (novo sistema)** preferidos sobre roles legados; verificação via `carboRoles.length > 0`

### Infraestrutura Supabase
- **Projeto:** `spigkskwypbnaiwkaher.supabase.co`
- **42+ migrations** aplicadas até abr/2026
- **RLS ativo** em todas as tabelas sensíveis

---

## Convenções do Projeto

| Convenção | Regra |
|-----------|-------|
| Build check | `tsc --noEmit --skipLibCheck` antes de cada commit |
| Commit | Co-Authored-By: Claude Sonnet |
| Deploy | Push → GitHub Actions → GitHub Pages (~1 min) |
| Docs | `Read-me_docs/` atualizado a cada sessão |
| Numeração tarefas | Nunca reiniciar; itens concluídos agrupados (ex: "1–41") |
