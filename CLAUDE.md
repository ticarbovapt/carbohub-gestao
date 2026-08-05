# carbohub-gestao — Instruções para o Claude

## ⚠️ Estrutura em transição: monólito → monorepo (CRM/ERP/Portais)

Este repo está sendo reorganizado em monorepo (ver `docs/ARQUITETURA-SEPARACAO.md`).
Layout atual:

```
/ (raiz)        = sistema ATUAL "controle" (monólito, VIVO no ar). src/, supabase/.
apps/crm/       = sistema novo CRM (app standalone, próprio package.json/build).
apps/erp/       = (futuro)
packages/       = compartilhados entre apps:
                  chat, call, shell (UI/infra)
                  posvenda (etapas do Rastreio de venda — Ops + Sales)
                  demandas (tipos de demanda do TI — os 6 apps + quadro do TI)
```

### `packages/posvenda` — etapas do pós-venda
Fonte ÚNICA da lista de etapas do Rastreio. Ops **controla** as etapas, Sales só
**acompanha**; antes cada um declarava a sua lista e o Sales tinha 7 das 11 —
pedido parado numa etapa ausente **sumia do quadro** em vez de aparecer numa
coluna vazia. Etapa nova entra aqui **e** no CHECK de `fulfillment_stage` em
`carboze_orders` (migração), nesta ordem.

### `packages/demandas` — tipos de demanda do TI
Fonte ÚNICA de `KINDS`. O `BugButton.tsx` existe nos **seis** apps (arquivos byte
a byte idênticos) e o quadro do TI é o sétimo consumidor — sete cópias divergem, e
divergir aqui tira a opção da tela de alguém sem dar erro. Tipo novo entra aqui,
**e** no CHECK de `kind` em `carbo_bug_reports`, **e** em `carbo_bug_kind_label`
(senão a notificação chega como "novo bug"). Ao editar o `BugButton`, edite o do
`apps/ti` e copie para os outros cinco — eles devem continuar idênticos.

### Tela `/vender` — o CRM é a base, os outros copiam
O `pages/Vender.tsx` existe nos **seis** apps e deve ser byte a byte idêntico.
A raiz (`controle`) está fora — ela tem `/orders/new`, outra tela, congelada.

**Fonte da verdade = `apps/crm`** (o app do Sales). Edite lá e copie para
`admin`, `ops`, `ti`, `financas`, `mkt`. Junto vão os hooks que a tela usa:
`useVendas`, `useCarbozeVendas`, `useLeadOrcamento`, `useDescarbOS` — também
idênticos nos seis.

Duas armadilhas já pagas, não repita:
1. **`useOS` significa duas coisas.** No `crm` é `licenciados.service_orders` via
   RPC `os_create`; no `ops` é `crm_os` no schema public. Copiar um por cima do
   outro quebra `Alertas`, `Agendamentos` e `OrdensServico` do Ops **sem erro de
   compilação**. Por isso o Vender importa `useCreateOSFromSale` de
   `@/hooks/useDescarbOS` (nome neutro, idêntico nos seis), nunca de `useOS`.
2. **`isGestor` é alias.** O Vender canônico usa `isGestor`; fora do CRM o
   `AuthContext` chamava isso de `canAdmin` (e `gestor` no financas). Os três são
   `isManager(profile, fnMap)` — a mesma expressão. O alias `isGestor` existe nos
   seis só para a tela poder ser idêntica. Não duplique a regra.

### ⚠️ Como verificar de verdade (o typecheck que engana)
Os `tsconfig.json` dos apps são solution-style: `"files": []` + `references`.
Por isso `tsc --noEmit -p tsconfig.json` **passa sem checar arquivo nenhum** —
retorna 0 sempre, inclusive com a tela quebrada. Já custou um deploy: uma função
inexistente (`fmtBRL`) foi para produção com "seis apps OK" no relatório.

Use, dentro de `apps/<app>`:
```
npx tsc -b --force     # checa de verdade (segue as references)
npm run build          # o que de fato vai para o ar
```
O repo **não** passa limpo no `tsc -b`: há erros pré-existentes (tipos do Vite
para `import.meta.env` e `@/assets/*.png`). Filtre pelos arquivos que você mexeu
em vez de esperar saída vazia.

`npm run build` NÃO substitui o `tsc`: o esbuild não checa tipos e deixa passar
identificador inexistente numa boa.

### Notificação de venda online — nos sete
Venda do e-commerce toca som e mostra toast em QUALQUER app que a pessoa esteja
usando. Três arquivos, replicados: `public/sounds/venda-online.mp3`,
`src/lib/sfxVenda.ts` e `src/hooks/useEcommerceNotifications.ts`, montado no
Layout (no CRM é o `SalesShell`).

Fonte da verdade = **raiz**. Os seis apps são idênticos entre si; a raiz difere
só pelo link "Ver dashboard" do toast, que aponta para uma rota que só ela tem.

Dois detalhes que não são óbvios e já custaram bug:
1. **Escuta INSERT *e* UPDATE.** Pedido de PIX nasce `pending` e vira `paid`
   depois — filtrar só na criação silencia justamente a venda que importa. O
   dedupe por id evita tocar de novo em `paid → shipped → delivered`.
2. **O áudio precisa ser destravado.** Navegador só toca depois de um gesto do
   usuário, e a venda chega por Realtime, fora de qualquer clique. O
   `sfxVenda.ts` destrava no primeiro clique da sessão com um play mudo; sem
   isso o `play()` é recusado **sem erro visível**.
3. **Um som só, num lugar só — mas nos DOIS canais.** A venda chega por duas
   escutas de Realtime: `ecommerce_orders` (o `useEcommerceNotifications`, toast
   rico) e `notifications` (o `useLiveNotifications` em admin/crm/ops/ti e o
   `useFinanceRealtime` em financas/mkt, uma linha por admin, com RLS por
   `user_id`). Nem sempre as duas chegam — e o canal de `notifications` é o que
   sempre chega.
   Nos hooks de `notifications` havia uma moedinha **sintetizada** (Web Audio):
   era ELA que se ouvia, não o MP3, e por isso parecia que o arquivo instalado
   estava errado. Hoje os dois caminhos chamam `avisarVendaOnline(idDoPedido)`
   do `sfxVenda.ts`, que **dedupe pelo id** — em `notifications` o id vem em
   `reference_id`. Quem chega primeiro toca e mostra o toast; o outro sai
   calado. **Não volte a tocar som de venda fora do `sfxVenda.ts`.**
4. **Falha de áudio não pode ser silenciosa.** O `play()` recusado ou um 404 no
   MP3 davam o mesmo sintoma (nada) porque o `catch` era vazio. Hoje os dois
   aparecem no console, e há `__somVenda.estado()` / `__somVenda.testar()` para
   diagnóstico. O destravamento usa `muted = true`, não `volume = 0`: a política
   de autoplay do Chrome olha a propriedade `muted`.

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
- **`ti_suporte/head` é superusuário**: bypass total de `useCanSeeScreen` — vê todas as telas sem configuração, inclusive futuras. Implementado em `src/hooks/useFunctionAccess.ts`.

## Warehouses
- `HUB-RN` = Hub Natal (produção, estoque de insumos)
- `HUB-SP` = CD SP LogHouse
- `HUB-SP-VENDAS` = CD SP Vendas
- `warehouse_stock` é a fonte de verdade de estoque por hub (nunca usar `mrp_products.current_stock_qty` como fallback de exibição)

## Migrações
- Sempre criar arquivo em `supabase/migrations/` com timestamp sequencial
- Passar o SQL para o usuário rodar no Supabase SQL Editor quando necessário
