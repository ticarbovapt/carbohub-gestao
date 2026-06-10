# carbohub-gestao — Instruções para o Claude

## ⚠️ Estrutura em transição: monólito → monorepo (CRM/ERP/Portais)

Este repo está sendo reorganizado em monorepo (ver `docs/ARQUITETURA-SEPARACAO.md`).
Layout atual:

```
/ (raiz)        = sistema ATUAL "controle" (monólito, VIVO no ar). src/, supabase/.
apps/crm/       = sistema novo CRM (app standalone, próprio package.json/build).
apps/erp/       = (futuro)
packages/       = (futuro) core, ui, supabase compartilhados
```

### Regras anti-confusão (OBRIGATÓRIAS)
1. **Todo pedido nomeia o alvo.** "no CRM" → `apps/crm`; "no controle"/"atual" → raiz (`src/`).
2. **Na dúvida, PERGUNTE — nunca adivinhe.** Se a tela existe em mais de um app, liste os candidatos antes de mexer.
3. **Congelamento do `controle`:** raiz só recebe correção crítica. Funcionalidade nova vai pros apps novos.
4. **Mudança em `packages/`** → avise que afeta vários apps antes de aplicar.
5. **Cada app é autossuficiente.** `apps/crm` tem build/lockfile próprio; NÃO mexer no `package.json` da raiz (3 lockfiles frágeis — risco ao deploy do controle).

### Modelo de acesso dos sistemas novos (NÃO usar Role Matrix)
- Sem matriz tela-a-tela. Nível decide: **gestor** (vê tudo + botões de gestão) vs **membro** (próprio escopo).
- Escopo de dado reaproveitado: `proprio | equipe | departamento | global`.
- Crescimento via **capabilities** (`apps/crm/src/lib/access.ts`), nunca telas numa matriz.
- App Admin (futuro) espelha cada sistema via `access.manifest`.

---

## Regra obrigatória (LEGADO — só vale na raiz/controle): novas telas → Role Matrix

**Sempre que criar uma nova página com controle de acesso**, três arquivos devem ser atualizados juntos — sem exceção:

### 1. `src/App.tsx`
Adicionar rota com `screenId`:
```tsx
<Route path="/minha/rota"
  element={<ProtectedRoute screenId="meu-screen-id"><MinhaPage /></ProtectedRoute>}
/>
```

### 2. `src/constants/functionAccessConfig.ts` ← NUNCA ESQUECER
Registrar no grupo adequado dentro de `SCREEN_GROUPS`:
```ts
{
  id: "meu-grupo",
  label: "Meu Grupo",
  screens: [
    { id: "meu-screen-id", label: "Nome visível no Role Matrix", path: "/minha/rota" },
  ],
},
```
**Sem este passo a tela não aparece em `/role-matrix`** e o admin não consegue liberar o acesso para nenhum usuário.

### 3. Avisar o usuário
Após o deploy, informar que a nova tela aparece no `/role-matrix` no grupo correspondente para o admin liberar os acessos.

---

## Stack
- React + TypeScript + Vite
- Supabase (Postgres + Auth + RLS + Realtime)
- TanStack Query para data fetching
- shadcn/ui + Tailwind CSS
- Recharts para gráficos
- dnd-kit para kanban drag-and-drop
- Branch de desenvolvimento: `claude/pensive-hamilton-7ijq0`

## Estrutura de acesso
- `ProtectedRoute` com `screenId` → verifica `function_screen_access` no banco
- `src/constants/functionAccessConfig.ts` → lista todas as telas disponíveis no Role Matrix
- `/role-matrix` → interface do admin para liberar telas por departamento/função
- Telas **sem** `screenId` são acessíveis a qualquer usuário autenticado (sem controle)
- **`ti_suporte` (qualquer função) é superusuário**: bypass total de `useCanSeeScreen` — vê todas as telas sem configuração, inclusive futuras. Implementado em `src/hooks/useFunctionAccess.ts`. No banco, `is_admin` também trata todo o `ti_suporte` como admin (migração `20260608000002`, lê `profiles` direto sem depender de `is_ceo`), então edge functions que exigem `is_admin` (ex.: `create-team-member`) liberam todo o TI — não só o head.

## Warehouses
- `HUB-RN` = Hub Natal (produção, estoque de insumos)
- `HUB-SP` = CD SP LogHouse
- `HUB-SP-VENDAS` = CD SP Vendas
- `warehouse_stock` é a fonte de verdade de estoque por hub (nunca usar `mrp_products.current_stock_qty` como fallback de exibição)

## Migrações
- Sempre criar arquivo em `supabase/migrations/` com timestamp sequencial
- Passar o SQL para o usuário rodar no Supabase SQL Editor quando necessário
