# Auditoria — Desmembramento Visual (Sales + Ops)

> Documento de contexto. Fase atual: **telas visuais com dados MOCK** (sem lógica).
> A lógica será copiada do Carbo Controle depois; o que muda é a **camada de acesso**
> (gestor edita / colaborador só visualiza) e o código sai mais limpo.
> Branch de trabalho: `claude/exciting-bardeen-ZxSam` (merges via PR para `main`).

## Convenções (como o mock está organizado)
- Mock **isolado no topo de cada arquivo**, marcado com `// ⚠️ ... dados MOCK` e `// TODO: ligar em <tabela>`.
- Rodapé de cada página: `Tela em port visual — dados de exemplo...`.
- Botões sem lógica: `toast("... (em breve)")`.
- **Varredura para limpar/ligar**: `grep -rn "dados MOCK\|Tela em port visual\|em breve" apps/`.
- Rotas **pt-BR padronizadas**; dashboards dentro de cada área (sem "Dash" genérico).
- Padrão **read-only vs editável**: componente único com flag `editable`
  (ex.: `components/estoque/StockView.tsx`) — gestor vê versão editável, colaborador a read-only.

## Apps
- `apps/crm` = **Carbo Sales** (sales.carbohub.com.br) — venda presencial/fora do e-commerce.
- `apps/ops` = **Carbo Ops** (ops.carbohub.com.br) — produção, estoque, compras, financeiro, logística, e-commerce, campo.
- `apps/admin` = **Carbo Admin** (admin.carbohub.com.br) — usuários/estrutura.
- Hub = repo `carbohub-landing` (carbohub.com.br) — tiles por `allowed_interfaces`.
- SSO por cookie `.carbohub.com.br`; Ops gateado por `carbo_ops_app` (ProtectedRoute).

---

## CARBO SALES (apps/crm) — telas
| Tela | Rota | Status |
|---|---|---|
| CRM — Funis (dashboard) | `/` | ✅ |
| CRM — Pipelines (kanban filtrável + "Todos") | `/crm/pipelines` | ✅ |
| Vender (orçamento PDF) | `/vender` | ✅ |
| Pedidos (Controle de pedidos) | `/pedidos` | ✅ |
| Vendas (Vendas e Orçamentos) | `/vendas` | ✅ |
| Metas de Vendedores | `/metas` | ✅ |
| Dashboard Comercial | `/comercial` | ✅ |
| Perfil | `/perfil` | ✅ |
- E-commerce foi **movido para o Ops** (não existe mais no Sales).

---

## CARBO OPS (apps/ops) — telas por área

### Produção ✅
Ordens de Produção `/producao/ordens` · Dashboard `/producao/dashboard` · Produtos MRP `/producao/produtos` (com aba BOM) · SKUs `/producao/skus` · Lotes `/producao/lotes` · Fornecedores `/producao/fornecedores`.

### Estoque ✅ (somente leitura — espelho)
Todos os Hubs `/estoque` · Hub Natal `/estoque/hub-natal` · CD SP LogHouse `/estoque/cd-sp-loghouse` · CD SP Vendas `/estoque/cd-sp-vendas` · CD Bling `/estoque/cd-bling`.

### Compras & Suprimentos
- Compras `/compras` ✅ (7 abas iguais ao Controle).
- Suprimentos `/suprimentos` ✅ (editável) — abas por hub completas (RN: Estoque, Movimentações, Envios para SP, Recebimento, Notas Fiscais, Política · SP LogHouse: + Em Trânsito, Mapeamento SKU · SP Vendas: + Remessas · Bling).

### Financeiro ✅
Financeiro `/financeiro` · Fila de Faturamento `/financeiro/faturamento` · Notas Fiscais `/financeiro/notas-fiscais` · Dashboard `/financeiro/dashboard`.

### Logística ✅
Logística `/logistica` (abas iguais) · Viagens & PC `/logistica/viagens` · Dashboard `/logistica/dashboard`.

### E-commerce ✅
Vendas Online `/ecommerce/vendas-online` · Acompanhamento de Metas `/ecommerce/acompanhamento` · Metas E-commerce `/ecommerce/metas`.

### Operação de Campo ✅
OS Descarbonização `/campo/os` · Agendamentos `/campo/agendamentos` · Máquinas `/campo/maquinas` · Checklists `/campo/checklists` · Alertas `/campo/alertas`.

### Acompanhamento (Vendas) ✅ (espelho do Sales, read-only)
Dashboard Comercial `/acompanhamento/comercial` · Metas de Vendedores `/acompanhamento/metas`.

---

## GAPS DE BASE A COMPLETAR (antes/junto da lógica)

### 1. Suprimentos — abas por hub ✅ COMPLETO (mock)
Todas as abas do Controle reproduzidas no Ops:
- `envios-sp` (Hub Natal) — lista de envios RN→CD SP (em trânsito/entregue/estornado). ✅
- `recebimento` (Hub Natal) — conferência de OC com status e divergência. ✅
- `notas` (Hub Natal) — notas fiscais de entrada com 3-way match (OC/Receb./Valor). ✅
- `vendas-transito` "Remessas" (CD SP Vendas) — remessas a licenciados com botões Confirmar/Estornar (toast). ✅
- `transito` + `mapeamento` (SP LogHouse) — já existiam. ✅
> Falta apenas a **lógica**: botão "Registrar Envio para CD SP" abre dialog (`CDSPRegistrarEnvio`); confirmar/estornar remessa credita/devolve `warehouse_stock`.

### 2. Ordens de Produção — diálogos/forms ausentes (são "lógica", mas a base de form ajuda)
Controle tem `CreateOPDialog`, `EditOPDialog`, `DeleteOPDialog`, `ConfirmOPDialog`, `QuickConfirmOPDialog`.
Ops: botões existem mas chamam `toast(...)`. **Forms de criação/edição/confirmação a construir.**

### 3. Financeiro — painel de detalhe da RC
Controle tem `RCDetailsPanel` (clicar numa RC abre detalhe com itens/cotações/aprovação). Ops mostra só a lista. **Falta o detalhe da RC.**

### 4. Mapeamento SKU — cadastro de mapeamento explícito (kits)
Ops mostra o auto-match e o "Como funciona". Falta o **formulário de mapeamento explícito** (SKU plataforma → produto + unidades por kit) e a lista de mapeamentos configurados — `SkuMappingConfig` do Controle.

### 5. Diálogos de cadastro/edição nas telas de Produção/Compras
SKUs, Lotes, Produtos MRP, Fornecedores, Compras (Nova Requisição) — botões existem, **forms/dialogs a construir** (hoje toast).

### 6. Telas grandes simplificadas (reproduzidas no essencial; aprofundar se quiser 100%)
- **Logística → Frete**: calculadora + resultado + relatórios são placeholders simples (Controle: `FreightCalculator/Results/Reports`).
- **Dashboards (Produção/Comercial/Financeiro/Logística)**: gráficos com mock; ligar dados reais.
- **Checklists (Carbo Check)**: Controle tem fluxo de scan/etapas; Ops tem visão por departamento com progresso.

---

## Itens de infra / pendências do usuário (Supabase / Vercel)
- Rodar migrations `carbo_functions` e `carbo_departments` no SQL Editor.
- Deploy das edge functions.
- Confirmar Deployment Protection desligado nos subdomínios.
- E-mail de confirmação: configurar SMTP próprio (Resend) — Supabase Pro não basta sozinho.

## Sequência sugerida para a fase de lógica
1. Completar gaps de **base** acima (forms/abas que faltam).
2. Ligar dados reais começando por **Vender** (Sales) e **comunicação Sales→Ops** (Ops recebe vendas).
3. Aplicar **camada de acesso** (gestor/colaborador) escondendo telas editáveis.
