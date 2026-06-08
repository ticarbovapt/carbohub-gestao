# Separação do CarboHub em CRM + ERP + Portais

> Documento de arquitetura e plano de migração.
> Base: mapeamento completo do sistema atual (jun/2026).
> Status: **análise — aguardando decisões antes de implementar.**

---

## 1. Tamanho real do sistema hoje

O "controle" não é um sistema médio. É um **mega-monólito** com vários produtos dentro:

| Métrica | Quantidade |
|---|---|
| Rotas / telas | **112** |
| Tabelas no Postgres | **116** |
| Hooks (funções exportadas) | **381** em 93 arquivos |
| Edge functions | **41** |
| Integrações externas | Bling, Nuvemshop, Mercado Livre, Amazon, Vindi, Meta, Chatwoot, Melhor Envio, HIBP, CNPJ |

Isso confirma a sensação de "frankenstein": são **8 domínios de negócio** convivendo no mesmo app, no mesmo banco, com o mesmo deploy.

---

## 2. Arquitetura-alvo: 4 sistemas + 1 núcleo

```
                 ┌─────────────────────────┐
                 │   CORE (compartilhado)  │
                 │  auth, perfis, equipe,  │
                 │  roles, acesso, audit   │
                 └────────────┬────────────┘
          ┌───────────┬───────┴───────┬───────────┐
          ▼           ▼               ▼           ▼
      ┌───────┐   ┌───────┐     ┌──────────┐ ┌──────────┐
      │  CRM  │   │  ERP  │     │ Portal   │ │ Portal   │
      │vendas │   │produç.│     │Licenciad.│ │ Lojas    │
      │       │   │financ.│     │          │ │ (PDV)    │
      └───────┘   └───────┘     └──────────┘ └──────────┘
```

### 2.1 CRM (vendas)
**Telas:** Vendas, Pedidos (orders), CRM/funis, B2B, Metas de venda, Licenciados (gestão), E-commerce/Vendas Online, Comercial, Territorial/Ops, Comissões.
**Hooks:** useCRMLeads, useCRMActivities, useCRMStats, useB2BLeads, useDescarbSales, useSalesTargets, useDashEcommerce, useTerritorialData, useLicensees (gestão).
**Edge functions:** ecommerce-sync, ecommerce-webhook, crm-webhook-meta, crm-webhook-chatwoot, crm-bling-bridge, melhor-envio-quote.
**Tabelas próprias:** crm_leads, crm_lead_activities, customers, ecommerce_orders, meta_ecommerce, sales_targets, sales_target_defaults, freight_quotes.

### 2.2 ERP (produção + financeiro)
**Telas:** Ordens de Produção, MRP (produtos/fornecedores), SKUs, Lotes, Suprimentos, Checklist, OS (descarbonização), Financeiro, Faturamento, NFe/NFSe, Compras, Logística, Viagens, Máquinas, Dashboards produção/financeiro/logística.
**Hooks:** useProductionOrders, useServiceOrders, useMrpProducts, useProductBom, useSkus, useLots, useStockMovements, useMachines, usePurchasing, useRCPurchasing, useFaturamento, useBlingNFes, useShipments, useViagens.
**Edge functions:** bling-auth, bling-sync, bling-auto-sync, vindi-sync, vindi-webhook, check-low-stock-alerts, analyze-rc-quotations, forecast-engine.
**Tabelas próprias:** production_orders, production_*, sku, sku_bom, mrp_*, inventory_lot*, quality_check, purchase_*, rc_*, suppliers, service_orders, os_*, checklist_*, machines, viagens, bling_*, vindi_*.

### 2.3 Portal Licenciados (**sistema à parte — já decidido**)
**Telas:** tudo em `/licensee/*` e `/licenciado/*` (~19 telas).
**Tabelas próprias:** licensees, licensee_users, licensee_wallets, credit_transactions, licensee_requests, licensee_subscriptions, subscription_plans, licensee_commissions, licensee_gamification, service_catalog.

### 2.4 Portal Lojas / PDV (**sistema à parte — já decidido**)
**Telas:** tudo em `/pdv/*` (~6 telas).
**Tabelas próprias:** pdvs, pdv_users, pdv_replenishment_history, pdv_sales, pdv_sellers, pdv_products.

### 2.5 CORE (compartilhado por todos)
**Telas:** login, onboarding, troca de senha, perfil, equipe, organograma, **role-matrix**, responsabilidades.
**Hooks:** useAuth, useFunctionAccess, useCanSeeScreen, useTeamMembers, useNotifications.
**Edge functions:** create-team-member, bulk-create-org-users, create-master-admin, request/resolve-password-reset, send-welcome-email, check-inactive-users, check-password-hibp, cnpj-lookup.
**Tabelas:** profiles, user_roles, carbo_user_roles, departments*, department_functions, **function_screen_access**, user_access_overrides, audit_logs, system_tokens, notifications, password_reset_*.

---

## 3. O problema central: tabelas de fronteira

Frontend é fácil de separar. **O banco é o nó da questão.** Existem **15 tabelas que vivem em mais de um domínio** ao mesmo tempo, várias com triggers que disparam entre domínios:

| Tabela | Quem usa | Acoplamento |
|---|---|---|
| `warehouse_stock` | CRM (deduz na venda) + ERP (produção/compras) + PDV | **Trigger** deduz estoque ao confirmar venda de e-commerce |
| `sku` | ERP + CRM + E-commerce | SKU único pra tudo |
| `mrp_products` | ERP + Estoque + Compras | Produtos/insumos |
| `stock_movements` | ERP + Financeiro + CRM | Entradas e saídas |
| `service_orders` | CRM + ERP + Ops + Financeiro | **Centro de tudo** — venda gera OS, OS gera compra, OS alimenta faturamento |
| `carboze_orders` | CRM + Financeiro + Portal Licenciado | Pedido B2C/frota/licenciado |
| `service_catalog` | Portal Licenciado + Ops | Catálogo CarboVAPT/CarboZé |
| `licensee_requests` | Portal Licenciado + Ops | Checkout do licenciado cria OS |
| `sku_product_mappings` | CRM (e-commerce) + ERP (estoque) | Mapeamento SKU→produto, com trigger de estoque |
| `profiles` / `carbo_user_roles` / `function_screen_access` | **TODOS** | Base de RLS e acesso |

Esses são os pontos onde "dividir o banco" deixa de ser trivial.

---

## 4. Estratégias de divisão do banco (a decisão mais importante)

### Opção A — Um banco só, frontends separados *(recomendada para começar)*
Mantém **um único Supabase** como fonte de verdade. Separa só os **apps/repos** (CRM, ERP, Portais). Cada app importa só os hooks/telas do seu domínio. Organiza o banco em **schemas Postgres** por domínio (`crm`, `erp`, `core`, `portal`) — as tabelas de fronteira ficam num schema `core`/`shared`.

- ✅ Resolve 90% da dor (acesso, deploy, código limpo) com 10% do risco
- ✅ Triggers de estoque continuam funcionando sem reescrever nada
- ✅ Acesso fica trivial: cada app só conhece suas telas
- ❌ Não é "banco por sistema" literal — é um banco com fronteiras organizadas

### Opção B — Banco por sistema + núcleo compartilhado
Cada sistema tem seu Supabase. Um banco `core` central (auth, profiles, roles). Tabelas de fronteira viram **APIs/edge functions** ou **Foreign Data Wrappers** entre bancos.

- ✅ Separação física real (o que o chefe pediu)
- ❌ Triggers cross-domain (estoque) precisam virar chamadas de API → reescrever a lógica de dedução
- ❌ `service_orders` e `carboze_orders` ficam difíceis de partir — provavelmente um sistema "dono" e os outros consomem via API
- ❌ Mais caro, mais lento, mais pontos de falha

### Opção C — Banco por sistema com duplicação + sincronização
Cada sistema copia as tabelas que precisa e sincroniza por webhook/ETL.

- ❌ Recria o frankenstein em forma de dados dessincronizados. **Não recomendo.**

> **Minha recomendação técnica:** começar pela **Opção A** (separa repos + schemas), e só migrar pra **B** as partes que realmente precisarem de isolamento físico, uma de cada vez. Assim você ganha a separação que o chefe quer sem parar a operação nem reescrever os triggers de uma vez.

---

## 5. Roadmap sugerido (fases, sem desligar o sistema atual)

**Fase 0 — Fundação (1ª coisa a fazer)**
1. Definir a estratégia de banco (Opção A/B/C) — *decisão de vocês*.
2. Criar os repos novos vazios com o mesmo stack (Vite+React+TS+shadcn+Supabase client).
3. Extrair o CORE para um pacote compartilhado (auth, ProtectedRoute, ui/, useFunctionAccess) — vai ser copiado/importado pelos 4 sistemas.

**Fase 1 — CRM** (maior valor, mais autônomo)
- Migrar telas de vendas/CRM/e-commerce + hooks + edge functions de venda.
- Redesenhar o controle de acesso só com os screenIds do CRM.

**Fase 2 — ERP**
- Migrar produção/financeiro/suprimentos/OS.
- Aqui mora `service_orders` — definir quem é o dono.

**Fase 3 — Portais** (Licenciados e Lojas) — já são quase isolados, migração mais limpa.

**Fase 4 — Desligamento** do monólito atual, depois que tudo estiver rodando em paralelo e validado.

---

## 6. O que reaproveitar vs. refazer

| Reaproveitar (copiar e polir) | Refazer do zero |
|---|---|
| Componentes `ui/` (68 arquivos shadcn) | Sistema de acesso por tela (redividir screenIds por sistema) |
| Hooks de domínio (ajustar imports) | Navegação/sidebar (cada sistema tem o seu menu) |
| Edge functions (mover por domínio) | Estrutura de schemas do banco |
| Lógica de negócio (triggers, RPCs) | Onboarding/seleção de área (cada sistema tem login próprio) |
| Integrações (Bling, e-commerce, etc.) | — |

---

## 7. Decisões tomadas

1. **Estratégia de banco:** **Opção A → B faseada.** Mantém o Supabase atual agora;
   desmembra em bancos por sistema *depois* que CRM e ERP existirem. Os sistemas
   se comunicam (ainda necessário), mas sem tudo junto — reduz risco de quebra e
   facilita escala.
2. **Repos:** **Monorepo "ejetável".** Um repo com `packages/` (core, ui, supabase)
   + `apps/` (crm, erp, portal-licenciados, portal-lojas). Cada app com deploy
   próprio. Quando um sistema amadurecer, "eject" pra repo/banco próprio.
3. **Ordem de migração:** **CRM primeiro.**
4. **Dono do `service_orders` / `carboze_orders`:** *a definir na Fase 2 (ERP).*

## 8. Decisões ainda pendentes
- Dono do `service_orders` e `carboze_orders` (ERP ou CRM) — decidir ao chegar no ERP.
- Ferramenta de monorepo: pnpm workspaces (simples) vs turborepo (cache de build).

---

## 9. Modelo de acesso (decisão final)

### O que a role-matrix atual realmente é (3 mecanismos empacotados)
1. **Identidade/hierarquia** — `departamento + função` no `profiles`.
2. **Matriz tela-a-tela** — `function_screen_access` mapeia (depto+função) → telas.
3. **Escopo de dado** — `department_functions` → `proprio | equipe | departamento | global`.
- (+) overrides por usuário; (+) TI/head superusuário.

### O que aproveita vs. o que sai
| Aproveita | Joga fora |
|---|---|
| Escopo de dado (próprio/equipe/depto/global) | Matriz tela-a-tela (`function_screen_access`) |
| Identidade/hierarquia (depto + função) | Tela RoleMatrix de configuração |
| Conceito de superusuário (TI/head) | Liberar tela por tela por pessoa |

> **Insight:** a matriz tela-a-tela era *sintoma do monólito* (112 telas). Com cada
> sistema pequeno e de um domínio só, não é mais necessária.

### As 3 camadas do modelo novo
```
CAMADA 1 — Acesso a SISTEMAS (CORE/Hub): quais sistemas a pessoa entra.
           Derivado do papel/departamento. Hub mostra só os azulejos liberados.
CAMADA 2 — Nível dentro do sistema: "gestor" (vê tudo + botões de filtro +
           reatribuir) vs "membro" (operacional, sem esses botões).
           Telas definidas em CÓDIGO; papel escolhe o subconjunto. SEM matriz.
CAMADA 3 — Escopo de dado (linha a linha): reaproveitado do atual.
           gestor → global; membro → próprio; supervisor → equipe.
```

### Extensão por CAPABILITIES (não por telas)
Crescimento futuro adiciona **capabilities** (permissões nomeadas, poucas e semânticas),
nunca telas numa matriz:
```ts
capabilities: {
  ver_todos_leads:    [head, command, ceo, ti],
  reatribuir_lead:    [head, command, ti],
  editar_metas:       [head, command],
  exportar_relatorio: [head, command, ti, supervisor],
}
```
Vive num objeto de config em código (versionado, revisável). Mudar = editar + deploy.
Exceção por pessoa = reaproveitar `user_access_overrides` como camada fina e rara.

### Admin espelhado (manifesto)
- Cada sistema declara o próprio acesso em `apps/<sistema>/access.manifest.ts`
  (telas, capabilities, níveis).
- O **app Admin** importa os manifestos (mesmo monorepo) e se monta sozinho,
  espelhando cada sistema. Nova capability no CRM → aparece no Admin automático.
- **Admin** escreve identidade + atribuições (quem é o quê). Só precisa de acesso ao Admin.
- **Cada sistema** lê a identidade + o próprio manifesto e decide o que mostrar. Autossuficiente.
- Decisão de acesso em runtime acontece DENTRO de cada sistema → lógicas não se quebram entre si.

### Identidade compartilhada + login único
- Criação de usuário num lugar só (Admin/Equipe). 1 pessoa = 1 conta.
- Login único no Hub (`app.carbohub.com.br`), sessão compartilhada via cookie em
  `.carbohub.com.br`, trocador de sistema no topo de cada app.
