# CarboHub — Product Requirements Document (PRD)
> Versão 1.0 — Atualizado em 2026-04-07

---

## 1. Visão do Produto

O CarboHub é a plataforma de gestão operacional e comercial do Grupo Carbo, que conecta a operação interna (Carbo Controle), a rede de parceiros licenciados (Área Licenciados) e os pontos de venda vinculados (Lojas). A plataforma é multi-tenant, acessada via navegador, e opera sobre um único backend Supabase com isolamento de dados por Row Level Security (RLS).

**Missão:** Centralizar em uma única plataforma web toda a operação de carbonatação de veículos do Grupo Carbo — da produção interna ao atendimento pelo licenciado ao cliente final.

**URL de produção:** `carbohub.com.br`

---

## 2. Objetivos de Negócio

- Substituir planilhas e sistemas fragmentados por uma plataforma integrada.
- Oferecer visibilidade em tempo real da operação (OS, OP, estoque, pedidos).
- Escalar a rede de licenciados com controle de performance, créditos e gamificação.
- Integrar ERP Bling (pedidos, NF, estoque) e Melhor Envio (cotação de frete).
- Viabilizar o portal self-service do licenciado para reduzir carga operacional interna.

---

## 3. Personas e Papéis

| Persona | Role no sistema | Hub de acesso | Descrição |
|---------|----------------|--------------|-----------|
| **MasterAdmin** | `master_admin` | Carbo Controle | Acesso irrestrito a todos os módulos e dados. Gerencia usuários e configurações. |
| **CEO** | `ceo` | Carbo Controle | Visão executiva: cockpit estratégico, governança, aprovações, todos os dashboards. |
| **Gestor** | `manager` | Carbo Controle | Gerencia equipe, OPs, OSs, pedidos, estoque, financeiro por departamento (ADM/FIN/Compras). |
| **Operador** | `operator` | Carbo Controle | Executa tarefas do dia: OSs, OPs, checklists. Sem acesso a dados financeiros sensíveis. |
| **Licenciado** | `licensee` | Área Licenciados | Parceiro de negócio. Solicita serviços, gerencia créditos, acompanha comissões e estoque. |
| **Loja PDV** | `pdv` | Lojas | Ponto de venda vinculado a um licenciado. Monitora estoque e solicita reposição. |

**Hierarquia de roles:** MasterAdmin > CEO > Gestor > Operador (no Carbo Controle). Licenciado e PDV têm acesso exclusivo ao próprio hub.

---

## 4. Os 3 Hubs

### 4.1 Hub 1 — Carbo Controle (Gestão Interna)

**Identidade visual:** Azul | **Entrada:** `/login/ops` → `/dashboard`
**Layout:** `BoardLayout.tsx`

O hub central de gestão da operação do Grupo Carbo. Concentra todos os módulos de back-office: desde ordens de serviço e produção até CRM, financeiro e administração de licenciados.

#### Módulos Principais

| Módulo | Rotas | Descrição |
|--------|-------|-----------|
| Dashboards | `/dashboard`, `/dashboards/producao|financeiro|logistica|comercial|estrategico` | KPIs por área e visão executiva consolidada |
| Ordens de Serviço (OS) | `/os`, `/os/:id`, `/checklist`, `/scheduling` | Kanban de 8 etapas, checklists e agendamento |
| Ordens de Produção (OP) | `/production-orders` | Toggle Kanban/Lista de OPs |
| Pedidos & Vendas | `/orders`, `/orders/new`, `/orders/:id` | Pedidos Carboze com NF, filtro data, export Excel/CSV/PDF |
| CRM | `/crm`, `/crm/:funnelType`, `/b2b`, `/b2b/funnel` | 8 funis de vendas, leads B2B, metas |
| Licenciados | `/licensees`, `/licensees/:id`, `/licensee/new`, `/licensee-ranking` | Cadastro, perfil, ranking com gamificação |
| Inteligência Territorial | `/network-map`, `/territory-intelligence`, `/territory-expansion` | Mapas Leaflet, mapa de bolhas, planejamento de expansão |
| MRP | `/mrp/products`, `/mrp/suppliers`, `/skus`, `/lots` | Catálogo de produtos com BOM (Bill of Materials) |
| Suprimentos | `/suprimentos` | Estoque de insumos (exceto Produto Final), movimentações, export |
| Logística | `/logistics` | Expedição, calculadora frete Melhor Envio, histórico CSV |
| Financeiro | `/financeiro`, `/purchasing` | Requisições de compra, cotações, contas a pagar |
| Equipe | `/team`, `/org-chart`, `/role-matrix`, `/responsibility-map` | Organograma, 30 colaboradores, matriz de papéis |
| Admin & Governança | `/admin`, `/admin/cockpit`, `/governance` | Aprovações, cockpit estratégico (CEO/MasterAdmin), governança |
| Integrações | `/integrations/bling`, `/import` | Bling ERP OAuth2, importação de dados |

### 4.2 Hub 2 — Área Licenciados (Portal do Parceiro)

**Identidade visual:** Verde (carbo-green) | **Entrada:** `/login/licensee` → `/licensee/dashboard`
**Layout:** `LicenseeLayout.tsx`

Portal self-service exclusivo para parceiros licenciados do Grupo Carbo. Permite solicitar serviços de carbonatação (CarboVAPT domicílio e CarboZé insumos), acompanhar pedidos, gerenciar a carteira de créditos e visualizar comissões.

#### Módulos

| Módulo | Rota | Descrição |
|--------|------|-----------|
| Dashboard | `/licensee/dashboard` | Boas-vindas, saldo, assinatura, IA Recommendations, pedidos recentes |
| Catálogo CarboVAPT | `/licensee/vapt` | Solicitar serviço de carbonatação a domicílio |
| Catálogo CarboZé | `/licensee/ze` | Solicitar insumos e produtos |
| Pedidos | `/licensee/pedidos` | Meus pedidos com filtro por status |
| Créditos | `/licensee/creditos` | Carteira de créditos, saldo e extrato |
| Comissões | `/licensee/comissoes` | Relatório de comissões e ganhos |

### 4.3 Hub 3 — Lojas (PDV / ex-"Insumos")

**Identidade visual:** Âmbar/Laranja | **Entrada:** `/login/pdv` → `/pdv/dashboard`
**Layout:** `PDVLayout.tsx`

Portal para lojas/pontos de venda vinculados a licenciados. Foco em monitoramento de estoque de insumos CarboZé, cálculo de cobertura (dias até ruptura) e solicitação de reposição.

#### Módulos

| Módulo | Rota | Descrição |
|--------|------|-----------|
| Dashboard | `/pdv/dashboard` | Status de estoque, dias até ruptura, pedidos do licenciado |
| Estoque | `/pdv/stock` | Métricas detalhadas: consumo, cobertura, tendências, indicadores crítico/atenção/OK |
| Histórico | `/pdv/history` | Log de reposições recebidas, totais acumulados, média, filtro data |

---

## 5. Funcionalidades-Chave por Hub

### Carbo Controle
- Dashboard role-based: CEO cockpit com gráfico de desempenho (filtro semanas/meses/período), Gestor com métricas departamentais, Operador com tarefas do dia.
- Kanban de OS com 8 etapas (funil B2C/B2B/Frota para CarboVAPT).
- OP com toggle Kanban/Lista.
- Calculadora de frete Melhor Envio com auto-fill de CEP via ViaCEP.
- BOM (Bill of Materials) dos Produtos Finais: tabela `mrp_bom`, hook `useProductBom`, modal CRUD `ProductBomModal`.
- Ranking de licenciados com gamificação (pontuação, level, edição de tooltips).
- Mapa de rede geográfica (Leaflet) e mapa de bolhas (Territory Intelligence).
- Export em múltiplos formatos: Excel (xlsx), CSV, PDF — disponível em `/orders` e `/suprimentos`.
- Organograma visual com 30 colaboradores e Emmily (assistente) ao lado de Thelis.
- Integração Bling ERP via OAuth2 — pedidos com NF vinculada.

### Área Licenciados
- Notificações em tempo real via Supabase Realtime.
- Card de recomendações da IA (`AIRecommendationsCard`).
- Carteira de créditos com extrato de transações.
- Agendamento de serviços CarboVAPT.

### Lojas
- Cálculo automático de dias até ruptura de estoque (consumo médio diário).
- Solicitação de reposição com quantidade desejada.
- Enforcement de threshold mínimo de estoque.

---

## 6. Tech Stack

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Framework frontend | React | 18.3 |
| Linguagem | TypeScript | 5.8 |
| Build tool | Vite | 5.4 |
| Estilização | Tailwind CSS | 3.4 |
| Componentes UI | shadcn/ui + Radix UI | — |
| Roteamento | React Router DOM | 6.30 |
| Estado servidor | TanStack React Query | 5.83 |
| Formulários | React Hook Form + Zod | 7.x / 3.x |
| Gráficos | Recharts | 2.15 |
| Mapas | Leaflet / React Leaflet | 1.9 / 5.0 |
| Animações | Framer Motion | 12.30 |
| Calendário | React Day Picker + date-fns | 8.x / 3.x |
| Export | xlsx (SheetJS) | 0.18 |
| Backend / BaaS | Supabase (PostgreSQL + Auth + Storage + Realtime) | 2.93 |
| Edge Functions | Deno (Supabase Functions) | — |
| Deploy | GitHub Pages via GitHub Actions | — |

---

## 7. Integrações

### 7.1 Bling ERP (v3)
- OAuth2 para autenticação.
- Sync bidirecional de pedidos, NF e estoque.
- Rate limit respeitado via `pg_net` e fila de requisições.
- Tabelas: `bling_tokens`, `bling_orders`, `bling_products`.
- Rota de configuração: `/integrations/bling`.

### 7.2 Melhor Envio
- Cotação de frete via Edge Function `melhor-envio-quote`.
- Auto-fill de CEP origem/destino via API ViaCEP (debounce 500ms).
- Fallback com mock data quando Edge Function não está deployada.
- Token OAuth2 armazenado como secret no Supabase (`MELHOR_ENVIO_TOKEN`).
- Tabela: `freight_quotes` (migration `20260407_freight_quotes.sql`).

### 7.3 Supabase
- PostgreSQL com 45+ migrations aplicadas.
- Row Level Security (RLS) ativo em todas as tabelas sensíveis.
- Realtime subscriptions para notificações de licenciados.
- Auth: email/senha + convite por código.
- Storage: anexos de OS e documentos.

### 7.4 Edge Functions (Deno)
- `melhor-envio-quote` — cotação de frete (deploy manual necessário no plano Free).
- Padrão de fallback: mock data retornado quando função não disponível.

---

## 8. Requisitos Não-Funcionais

- **Responsividade:** Interface mobile-first, adaptável a tablets e desktops.
- **Segurança:** RLS por role em todas as tabelas; autenticação via Supabase Auth.
- **Performance:** React Query com cache e invalidação seletiva; paginação em listas grandes.
- **Acessibilidade:** Componentes Radix UI com atributos ARIA nativos.
- **Deploy:** CI/CD automático via GitHub Actions → GitHub Pages (~1 min por push).
- **Observabilidade:** Alertas centralizados na tabela `ops_alerts`.
