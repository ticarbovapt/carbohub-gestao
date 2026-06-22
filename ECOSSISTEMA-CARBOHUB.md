# CarboHub — Mapa do Ecossistema (visto de `carbohub-gestao`)

> Documento de contexto durável. Lido pelo Claude/dev para entender o sistema inteiro
> sem precisar de muito contexto a cada pedido. A seção "Mapa geral" é **idêntica nos 5
> repositórios**; a seção "Este repositório" é específica daqui.
> Última atualização: 2026-06-22.

---

## 📍 Este repositório: `carbohub-gestao` — ⭐ O FUTURO

**Papel:** É o repositório **destino** da migração monólito → monorepo. Contém duas coisas:

1. **Raiz (`src/`, `supabase/`)** = fork **mais avançado** do monólito "controle"
   (188 migrations, 39 edge functions). Durante a transição é o **"controle vivo"** na
   prática — mais à frente que o repo `carbohub-controle`, que está sendo aposentado.
2. **`apps/`** = os **sistemas novos**, cada um com build/lockfile próprio:
   - **`apps/crm`** — vendas/comercial: pipelines, vender, pedidos, vendas, metas,
     comercial, território, descarbonização (OS + agendamentos). ~18 páginas.
   - **`apps/ops`** — operação: produção/MRP/SKUs/lotes/fornecedores, estoque por hub,
     compras (requisição/recebimento/contas a pagar), financeiro (NFe/NFSe/faturamento),
     logística (remessas/viagens), campo (OS/máquinas/checklists/alertas), e-commerce,
     config de metas. ~33 páginas.
   - **`apps/admin`** — gestão: usuários, estrutura org, perfil, equipe, bugs.
   - **`packages/`** — (futuro) core/ui/supabase compartilhados.

> ℹ️ Veja sempre o `CLAUDE.md` deste repo — ele tem as regras anti-confusão obrigatórias.

> **🚫 Não importe lógica do `carbohub-controle` (legado).** Dos apps novos só foram
> aproveitadas as **telas (UI)** do controle; a lógica de lá estava quebrada/cheia de
> gambiarras (motivo da migração). Toda lógica nos `apps/` é **escrita do zero** — quando
> parecer semelhante, é por convergência da proposta, não cópia. Ao criar/ajustar features,
> **não traga hooks/queries/padrões legados** do controle.

### Regras de ouro (do CLAUDE.md)
1. **Todo pedido nomeia o alvo:** "no CRM"→`apps/crm`; "no controle/atual"→raiz (`src/`).
   Na dúvida, **pergunte**.
2. **Raiz congelada:** só correção crítica. Funcionalidade nova vai pros apps novos.
3. **Cada app é autossuficiente:** `apps/*` têm build/lockfile próprio. **NÃO mexer no
   `package.json` da raiz** (3 lockfiles frágeis — risco ao deploy do controle).
4. **`packages/`** afeta vários apps — avise antes de mudar.

### Dois modelos de acesso (atenção: diferentes!)
- **Raiz (legado):** Role Matrix tela-a-tela — rota `screenId` em `src/App.tsx` +
  `src/constants/functionAccessConfig.ts` + `/role-matrix`. Superusuário `ti_suporte/head`.
- **Apps novos (sem Role Matrix):** nível **gestor vs membro** + escopo
  (`proprio|equipe|departamento|global`) + **capabilities** em `apps/crm/src/lib/access.ts`.
  Crescimento = adicionar capability em código, nunca telas numa matriz. O Admin futuro
  espelha cada sistema via `access.manifest` (ex.: `CRM_MANIFEST`).

### Supabase
- Projeto compartilhado `wpkfirmapxevzpxjovjr`, schema `public` (raiz e apps por enquanto).
- `apps/*/.env.example` usam as mesmas credenciais do sistema atual (fase compartilhada).
- Estoque: `warehouse_stock` é a **fonte de verdade** por hub (HUB-RN, HUB-SP, HUB-SP-VENDAS).

### Documentação interna de referência
- `docs/ARQUITETURA-SEPARACAO.md` — plano completo monólito→monorepo (estratégia de banco
  Opção A→B, tabelas de fronteira, roadmap por fases, modelo de acesso novo).
- `CARBOHUB_HUB_CONTROLE.md` — doc técnica do monólito (rotas, roles, schema 116 tabelas).
- `COMPARATIVO_SISTEMAS.md` — sistema antigo (12 schemas) vs novo (public único).
- `CARBO_CORE_API.md` — contrato de RPCs/edge functions/RLS.
- `docs/AUDITORIA-OPS-SALES.md`, `docs/CHANGELOG-CLAUDE.md`.

---

## 🌐 Mapa geral do ecossistema CarboHub

> Esta seção é **idêntica nos 5 repositórios** (`carbohub-landing`, `carbohub-controle`,
> `carbohub-gestao`, `carbohub-produtos`, `carbohub-licenciados`). Ao mudar o ecossistema,
> atualize aqui e replique nos demais.

### Backend único
- **1 projeto Supabase para tudo:** `wpkfirmapxevzpxjovjr` (`https://wpkfirmapxevzpxjovjr.supabase.co`).
- Isolamento por **schema**: `public` (controle/gestao), `produtos` (portal de vendas),
  `licenciados` (portal de franqueados).
- **RLS por tenant** em todas as tabelas; escritas críticas via **RPC** (security definer).
- **SSO**: sessão em cookie no domínio `.carbohub.com.br` → um login vale para todos os subdomínios.
- ⚠️ Referências ao projeto `spigkskwypbnaiwkaher` em docs antigos estão **OBSOLETAS** — não é usado por nenhum repo hoje.

### Os 5 repositórios
| Repo | Papel | Domínio | Schema | Estado |
|---|---|---|---|---|
| `carbohub-landing` | Hub de login/SSO + navegação entre apps (interno) | carbohub.com.br | public (auth/profiles/RPC) | vivo |
| `carbohub-controle` | Monólito LEGADO: hubs Controle + Licenciados + PDV | controle.carbohub.com.br | public | **legado, em desativação** |
| `carbohub-gestao` | Fork evoluído do monólito + monorepo novo `apps/` (CRM, OPS, Admin) | sales./ops./admin.carbohub.com.br | public | **futuro, em dev ativo** |
| `carbohub-produtos` | Portal de Vendas / PDV das lojas (PWA) — reagentes CarboZé | produtos.(→lojas.)carbohub.com.br | produtos | vivo (MVP) |
| `carbohub-licenciados` | Portal de franqueados — descarbonização, estoque, equipe | licenciados.carbohub.com.br | licenciados | vivo (MVP) |

### Migração monólito → monorepo (em andamento)
- **`carbohub-controle` é o sistema antigo e será "colocado para dormir"** assim que os
  apps novos estiverem completos. Hoje existe apenas para sustentar a integração em curso
  → só correção crítica.
- **`carbohub-gestao` é o destino.** A raiz (`src/`) é um fork mais avançado do monólito
  (o "controle vivo" durante a transição) e a pasta `apps/` hospeda os sistemas novos:
  **CRM**, **OPS** (produção/financeiro/logística) e **Admin**.
- Banco: mantém-se **1 Supabase** agora; separação por sistema é faseada (ver
  `carbohub-gestao/docs/ARQUITETURA-SEPARACAO.md`).
- **⚠️ Do `controle` herdamos SÓ as TELAS (UI) — NUNCA a lógica.** A lógica do monólito
  estava quebrada e cheia de gambiarras; foi exatamente por isso que ele foi aposentado.
  Os apps/portais novos **reescrevem toda a lógica do zero**. Quando uma lógica parece
  semelhante, é por **convergência da proposta**, não por cópia. **Nunca puxe código,
  lógica, hooks, queries ou padrões legados de `carbohub-controle` para os sistemas novos** —
  o objetivo de sair de lá foi justamente abandonar essas gambiarras. Use o `controle`
  apenas como referência **visual** de tela quando útil.

### Costuras de integração (onde os sistemas se tocam)
- **`profiles.allowed_interfaces`** (array) → quais apps aparecem no Hub e na topbar interna.
- **`lojas.licensee_id`** (schema `licenciados`) → liga loja de franqueado ao licenciado do
  Controle (hoje manual; sync automático é roadmap).
- **Tabelas de fronteira** no schema `public` (warehouse_stock, sku, mrp_products,
  stock_movements, service_orders, carboze_orders, service_catalog, licensee_requests,
  profiles, carbo_user_roles) → acoplamento que justifica manter 1 banco por ora.

### Dois modelos de acesso convivem
- **Legado** (`controle` e raiz de `gestao`): Role Matrix tela-a-tela —
  `ProtectedRoute screenId` + `src/constants/functionAccessConfig.ts` + `/role-matrix`.
  Superusuário: `ti_suporte/head` (bypass total).
- **Novo** (`apps/` e portais): sem matriz — nível **gestor vs membro** + escopo de dado
  (`proprio | equipe | departamento | global`) + **capabilities** em código
  (`apps/crm/src/lib/access.ts`), espelhado no futuro Admin via `access.manifest`.

### Integrações externas (via edge functions no banco compartilhado)
Bling ERP (OAuth2/sync), Mercado Livre, Amazon, Nuvemshop, Vindi (financeiro), Meta
(WhatsApp/IG), Chatwoot, Melhor Envio (frete), Resend (e-mail), HIBP (senha vazada),
CNPJ/ViaCEP, IA (ai-chat, forecast-engine, intelligence-engine).
