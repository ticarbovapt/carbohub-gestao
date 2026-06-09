# 📓 Diário de Bordo do Claude — Ecossistema CarboHub

> **Propósito deste arquivo:** documento de acompanhamento mantido pelo Claude para
> registrar o entendimento do sistema e **todas as alterações feitas ao longo do tempo**.
> Atualizado sempre que o contexto da conversa atinge ~90% (antes de compactar) e a cada
> bloco de mudanças concluído.
>
> **Última atualização:** 2026-06-09
> **Branch de trabalho atual:** `claude/zen-hawking-fy3z6g`
> **Branches anteriores:** `claude/gracious-goldberg-qa0ssu`, `claude/pensive-hamilton-7ijq0`

---

## 1. Mapa do Ecossistema

O CarboHub é o sistema operacional integrado do **Grupo Carbo**, dividido hoje em
**2 repositórios** (no escopo desta sessão):

| Repositório | Papel | Stack | Deploy |
|---|---|---|---|
| **carbohub-landing** | Portal/Hub de acesso (SSO + azulejos por permissão) | React 18 + Vite + Supabase | Vercel (SPA rewrite) |
| **carbohub-gestao** | Sistema de gestão (monólito "controle" + monorepo em transição) | React 18 + Vite + Supabase + TanStack Query | Vercel + Edge Functions (Deno) |

Subdomínios planejados: `carbohub.com.br` (hub/landing), `controle.*`, `crm.*`,
`licenciados.*`, `produtos.*` (Carbo Loja). **Cada app valida o próprio acesso**
(não há SSO cross-domain ainda — TODO em `carbohub-landing/src/lib/supabase.ts`).

Projeto Supabase compartilhado: `wpkfirmapxevzpxjovjr`.

---

## 2. carbohub-landing — Hub de Acesso

**O que é:** SPA leve que serve como porta de entrada do ecossistema. Login central +
dashboard com azulejos dos apps que o usuário pode acessar (Camada 1 de permissão).

### Estrutura
```
src/
├── App.tsx            # Router + checagem de auth (/ → Login | /home)
├── pages/
│   ├── Login.tsx      # Split-screen, 3 modos: login | forgot-password | request-access
│   └── Home.tsx       # Dashboard de azulejos (lê profiles.allowed_apps)
├── components/
│   ├── Brand.tsx      # Header (logo + subtitle)
│   └── HubIcon.tsx    # 4 ícones line-art (controle, crm, licenciados, lojas)
├── lib/
│   ├── supabase.ts    # Cliente Supabase (localStorage; SSO cross-domain = TODO)
│   └── apps.ts        # Catálogo HUB_APPS + filtro por allowed_apps
└── styles.css         # Toda a folha de estilo
```

### Modelo de permissão (Camada 1)
- `profiles.allowed_apps` (array) decide quais azulejos aparecem.
- **Fallback transitório:** se `allowed_apps` vazio/null → mostra os 4 apps (até existir o Admin).
- RPC `get_user_email_by_username` permite login por username **ou** email.

### Env / Deploy
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (configurar na Vercel).
- `vercel.json`: rewrite `/(.*)` → `/index.html` (SPA).

---

## 3. carbohub-gestao — Sistema de Gestão

**O que é:** sistema principal. Monólito "controle" VIVO no ar **em transição para monorepo**.

### ⚠️ Layout em transição (ver `docs/ARQUITETURA-SEPARACAO.md`)
```
/ (raiz)      = sistema ATUAL "controle" (monólito vivo). src/, supabase/
apps/crm/     = CRM novo standalone (Fase 1, build/lockfile próprios)
apps/admin/   = Admin de identidades/acessos (Fase 0, Camada 1) — NOVO
apps/erp/     = futuro
packages/     = futuro (core, ui, supabase compartilhados)
```

### Três domínios de UI (na raiz)
| Área | Layout | Público |
|---|---|---|
| Hub de Controle (OPS) | `BoardLayout` | admin, CEO, gestores, operadores |
| Portal Licenciados | `LicenseeLayout` | parceiros/licenciados |
| PDV | `PDVLayout` | frota de lojas |

### Estrutura raiz `src/`
- `pages/` (~69): `admin/`, `crm/`, `dashboards/` (6 temáticos), `licensee/` (10 telas), `pdv/` (5 telas)
- `components/` (~35 subpastas): `ui/` (67 shadcn), `layouts/`, e um dir por domínio (admin, crm, kanban, mrp, orders, os, purchasing, role-matrix, team…)
- `hooks/` (~87): `useAuth`, `useFunctionAccess`, `useCanSeeScreen`, + por domínio
- `lib/`: `supabase/client.ts`, `featureFlags.ts`, `carboCore.ts`, `role-matrix-constants.ts`
- `constants/functionAccessConfig.ts` — **CRÍTICO**: ~82 screenIds em 13 grupos
- `contexts/`: `AuthContext.tsx`, `DepartmentContext.tsx`
- `integrations/supabase/`: `client.ts`, `types.ts` (schema gerado)

### Modelo de acesso — DOIS modelos coexistindo

**A) LEGADO (raiz/controle) — Role Matrix**
- `ProtectedRoute screenId="..."` → checa `function_screen_access` no banco.
- Toda tela nova exige 3 passos (regra obrigatória do CLAUDE.md):
  1. rota com `screenId` em `src/App.tsx`
  2. registro em `SCREEN_GROUPS` de `src/constants/functionAccessConfig.ts`
  3. avisar o admin p/ liberar em `/role-matrix`
- Escopo de dado: `proprio | equipe | departamento | global`.
- **Superusuário** `ti_suporte/head` → bypass total (em `hooks/useFunctionAccess.ts`).
- Telas sem `screenId` = abertas a qualquer autenticado.

**B) NOVO (apps novos) — Capabilities (NÃO usar Role Matrix)**
- Nível decide: **gestor** (vê tudo + gestão) vs **membro** (próprio escopo).
- Definido em `apps/crm/src/lib/access.ts` (capabilities: `ver_todos_leads`, `reatribuir_lead`, `filtrar_por_vendedor`, `editar_metas`, `exportar_relatorio`).
- `CRM_MANIFEST` será espelhado por um futuro app Admin.

### Supabase
- **~146 migrations** em `supabase/migrations/` (timestamp sequencial — sempre criar novo arquivo).
- **~39 Edge Functions** (Deno) em `supabase/functions/`: auth/usuários, CRM webhooks (meta/chatwoot), Bling (NFe/estoque), Vindi (pagamentos), marketplaces (nuvemshop/amazon/ml), supply/logística, IA (`ai-chat`, `forecast-engine`), licenciados.
- Warehouses: `HUB-RN` (Natal/produção), `HUB-SP` (CD SP LogHouse), `HUB-SP-VENDAS`. Fonte de verdade de estoque = `warehouse_stock` (nunca `mrp_products.current_stock_qty` para exibição).

### apps/crm (Fase 1)
- `carbohub-crm` — build/deploy/lockfile independentes (NÃO mexer no `package.json` da raiz).
- `pages/`: Home, Leads (kanban dnd-kit), Login. `lib/access.ts` = modelo de capabilities.

### apps/admin (Fase 0 — Identidades & acessos) — **NOVO (PR #290)**
- `carbohub-admin` — app standalone (Vite+React+TS+shadcn+TanStack Query), build/lockfile próprios.
- **Propósito:** criar usuários e definir **Camada 1** (quais sistemas a pessoa entra) num lugar só.
- `pages/`: `Login.tsx`, `Users.tsx` (form de criação + lista de perfis).
- `hooks/useAdminUsers.ts`: `useProfiles` (lê `profiles`), `useDeptFunctions` (lê `department_functions`),
  `useCreateUser` → **reusa a edge function compartilhada `create-team-member`** (não duplica lógica de auth).
- `lib/interfaces.ts` = catálogo `SYSTEMS` (Camada 1), grava `profiles.allowed_interfaces`:
  `carbo_ops` (Controle) · `carbo_crm` (CRM) · `portal_licenciado` (Licenciados) · `portal_pdv` (Loja).
  Default ao criar: `["carbo_ops"]`.
- `constants/departments.ts` = departamentos/funções; `role` (app_role): `operator | manager | admin`.
- Fluxo: cria usuário → username auto (ex. `OPS0001`) + senha padrão `Carbo@2026` → 1º acesso troca senha/e-mail.
- **Liga as pontas:** Admin escreve `allowed_interfaces`; o Hub (carbohub-landing) lê a MESMA coluna
  para decidir azulejos. (No diário a Camada 1 era `profiles.allowed_apps` — o app novo padroniza em
  `allowed_interfaces`; conferir/alinhar nomenclatura entre Hub e Admin → ver Pendências.)

### Stack & scripts
- React 18 + TS 5.8 + Vite 5.4 + Router v6, shadcn/ui, Tailwind 3.4, TanStack Query v5, Recharts, dnd-kit, zod, react-hook-form, jspdf, xlsx, leaflet.
- `npm run dev | build | build:dev | lint | preview | test | test:watch` (Vitest).

### Docs de referência no repo
- `CLAUDE.md` (regras obrigatórias), `CARBOHUB_HUB_CONTROLE.md`, `CARBO_CORE_API.md`,
  `COMPARATIVO_SISTEMAS.md`, `docs/ARQUITETURA-SEPARACAO.md`.

---

## 4. Regras de ouro (do CLAUDE.md)
1. **Todo pedido nomeia o alvo:** "no CRM" → `apps/crm`; "no controle"/"atual" → raiz `src/`. Na dúvida, **PERGUNTAR**.
2. **`controle` (raiz) está congelado** — só correção crítica. Feature nova → apps novos.
3. **Mudança em `packages/`** afeta vários apps → avisar antes.
4. **Cada app é autossuficiente** — não tocar no `package.json`/lockfiles da raiz (deploy frágil).
5. Tela nova no controle = Role Matrix (3 passos acima).

---

## 5. Registro de Alterações (changelog)

> Formato: `data — repo — branch — resumo (arquivos)`. Mais recente no topo.

### 2026-06-09
- **carbohub-gestao** — `claude/zen-hawking-fy3z6g` — Re-mapeamento completo do repo e
  atualização do diário. Documentado o novo `apps/admin` (PR #290 — app de identidades/acessos
  da Camada 1, reusa edge `create-team-member`, grava `profiles.allowed_interfaces`). Contagens
  conferidas: 146 migrations, 39 edge functions, 87 arquivos de hooks, 113 `<Route>` / 75 `screenId`
  em `src/App.tsx`, 84 ids em `functionAccessConfig.ts`. Nenhuma alteração funcional. (somente documentação)

### 2026-06-08
- **carbohub-gestao** — `claude/gracious-goldberg-qa0ssu` — Mapeamento inicial completo dos
  dois repositórios e criação deste diário de bordo (`docs/CHANGELOG-CLAUDE.md`). Nenhuma
  alteração funcional no sistema. (somente documentação)

---

## 6. Pendências / Observações futuras
- [ ] SSO cross-domain entre subdomínios (hoje cada app reloga; cookie `.carbohub.com.br`).
- [~] App Admin (Camada 1) — **MVP entregue em `apps/admin` (PR #290)**: cria usuário + grava
      `allowed_interfaces`. Falta: espelhar os **manifests de capabilities** (Camada 2) de cada sistema.
- [ ] **Alinhar nomenclatura da Camada 1:** no banco do `gestao` a coluna canônica é
      `profiles.allowed_interfaces` (confirmado em migrations + `types.ts` + `AuthContext`; **não existe**
      `allowed_apps`). O Admin (`apps/admin`) já usa a correta. ⚠️ O diário registrava que o Hub
      (carbohub-landing) lê `profiles.allowed_apps` — se isso ainda for verdade no repo da landing,
      os azulejos NÃO refletem o que o Admin grava. Conferir o `carbohub-landing` e migrar p/ `allowed_interfaces`.
- [ ] Roadmap monorepo (ARQUITETURA-SEPARACAO.md): decidir 1 banco c/ schemas vs bancos separados.
- [ ] Extrair CORE compartilhado p/ `packages/` (auth, ui, acesso, tipos) — hoje `apps/admin` e
      `apps/crm` duplicam `ProtectedRoute`, `AuthContext`, `ui/`, client Supabase.
