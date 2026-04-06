# PRD — CarboHub

## Visão do Produto
Plataforma corporativa interna do Grupo Carbo para gestão de operações, produção, logística, CRM, financeiro e expansão de rede de licenciados.

## Usuários
| Perfil | Cargo | Acesso |
|--------|-------|--------|
| CEO / Master Admin | Thelis Botelho | Tudo |
| Gestor ADM | Peterson, Marina, Jayane | Operações + Gestão |
| Gestor Fin | Priscilla | Financeiro |
| Gestor Compras | Jeane | Compras + Suprimentos |
| Operador Fiscal | Ana, Sueilha | Fiscal |
| Operador | Staff geral | Operações básicas |
| Licenciado | Franqueados | Portal do licenciado |

## Módulos

### 1. Operações (sidebar tab)
- **Dashboard** — Visão geral operacional por role
- **Produção (OP/OS)** — Ordens de Produção e Ordens de Serviço
- **Logística** — Kanban de shipments
- **Pedidos (RV)** — 99 pedidos Bling enriquecidos
- **CRM** — 8 funis de venda em Kanban
- **Metas de Vendas** — Targets por vendedor
- **Financeiro** — RC, cotações, contas a pagar
- **Suprimentos** — Safety stock e reposição

### 2. Dados Mestres (sidebar tab)
- **Catálogo** — Insumos e SKUs
- **Fornecedores** — Gestão de fornecedores
- **Licenciados** — Rede + ranking + mapa
- **Equipe** — Perfis dos colaboradores
- **Organograma** — 30 colaboradores em org chart visual
- **Importar Dados** — Upload CSV/Excel

### 3. Dashboards (sidebar tab)
- **Produção** — Checklists, KPIs de OS, tendências
- **Financeiro** — Contas a pagar, ordens de compra
- **Logística** — KPIs de shipments + Kanban
- **Comercial** — KPIs de licenciados + pedidos
- **Estratégico** — CEO: visão completa; Gestores: área específica

## Regras de Negócio

### Organograma
- 30 colaboradores do Grupo Carbo
- Hierarquia: CEO → Diretores → Gerentes → Coordenadores → Staff
- Marina O. Rodrigues ocupa **2 posições de Head** (Growth + B2B)
- Dados primários: Mapa_Responsabilidades_CarboVapt, aba Resumo
- Fallback: STATIC_ORG_TREE (hardcoded em useOrgChart.ts)

### Ordens de Produção
- Numeração: `OP-YYYYMMDD-XXXX`
- Status: rascunho → em_producao → concluida → cancelada
- Fonte de demanda: venda | recorrencia | safety_stock | pcp_manual
- Produto obrigatório (FK → mrp_products)

### CRM
- 8 funis: varejo, b2b, licenciamento, reativacao, pos_venda, suporte, cobranca, onboarding
- Prioridade: low | medium | high | urgent
- Mobile-first

## Integrações
- **Bling ERP** — Sync de pedidos (OAuth2, v3 API)
- **Supabase** — Auth, DB, Storage, RLS
- **GitHub Pages** — Deploy automático via Actions

## Próximas Entregas
1. SQL migration profiles → popular organograma do banco
2. Filtro "Produto Final" em /suprimentos
3. Importação bulk de 8.845 leads CRM
4. Export PDF/Excel
5. Onboarding licenciado (checklist 5 fases CarboVAPT v3.0)
