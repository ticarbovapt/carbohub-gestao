# CarboHub — Resumo Executivo
> Atualizado em 2026-04-07

---

## 1. Visão Geral do Projeto

O **CarboHub** é a plataforma de gestão integrada do Grupo Carbo — empresa especializada em serviços de carbonatação de veículos (descarbonização por hidrogênio/reagente químico) e seus produtos derivados (CarboZé, CarboPRO, CarboFlex).

A plataforma concentra três portais independentes sob o mesmo domínio `carbohub.com.br`:

1. **Carbo Controle** — gestão interna completa (operação, produção, vendas, financeiro, logística).
2. **Área Licenciados** — portal self-service para a rede de parceiros franqueados.
3. **Lojas** — portal para pontos de venda (PDVs) vinculados a licenciados.

**Repositório:** `petersonoliveira14-debug/CarboHub` (privado, GitHub)
**Backend:** Supabase (`spigkskwypbnaiwkaher.supabase.co`)
**Produção:** GitHub Pages com domínio customizado `carbohub.com.br`

---

## 2. Status Atual — O que Funciona

### Carbo Controle
- Login role-based (MasterAdmin, CEO, Gestor, Operador) com dashboards distintos por perfil.
- OS Board com Kanban de 8 etapas para serviços CarboVAPT (B2C, B2B, Frota).
- Ordens de Producao (OP) com toggle Kanban / Lista.
- Módulo de Pedidos: listagem com NF, filtro de data de/até, export Excel/CSV/PDF.
- CRM com múltiplos funis, leads B2B e metas de vendas.
- MRP: catálogo de produtos com BOM (Bill of Materials) por Produto Final.
- Suprimentos: estoque de insumos (filtrado — Produto Final excluído), export Excel.
- Logística: calculadora de frete Melhor Envio com auto-fill CEP (fallback mock ativo).
- Financeiro e compras.
- Organograma visual com 30 colaboradores.
- Mapa de rede (Leaflet), mapa de bolhas territorial, expansão com score.
- Ranking de licenciados com gamificação.
- 5 dashboards temáticos (produção, financeiro, logística, comercial, estratégico).
- Integração Bling ERP (OAuth2, pedidos com NF).

### Área Licenciados
- Login e dashboard com saldo, assinatura e recomendações IA.
- Catálogo CarboVAPT e CarboZé com agendamento de serviços.
- Pedidos com filtro por status.
- Carteira de créditos.
- Comissões.
- Gamificação (pontos/level visível no Carbo Controle).

### Lojas (PDV)
- Dashboard de estoque com indicadores (crítico/atenção/OK).
- Cálculo de dias até ruptura de estoque.
- Solicitação de reposição.
- Histórico de reposições recebidas.
- Vinculação PDV-licenciado (admin/CEO).

---

## 3. O que está Pendente

| Item | Prioridade | Notas |
|------|-----------|-------|
| Onboarding licenciado — checklist 5 fases CarboVAPT v3.0 | Alta | Sprint B |
| Notificações push para licenciados | Alta | Sprint C |
| Hub Lojas — relatório de consumo exportável | Média | Sprint D |
| Hub Lojas — alertas automáticos por email/SMS | Média | Sprint D |
| Importar 8.845 leads no CRM | Baixa | 348 clientes + 8.497 prospects + 83 B2B |
| Deploy real da Edge Function `melhor-envio-quote` | Alta | Requer token Melhor Envio |
| Migrations M1, M3, M10 no Supabase SQL Editor | Alta | Peterson executa manualmente |

---

## 4. Esquema do Banco de Dados

### Tabelas Principais

| Tabela | Hub | Descricao |
|--------|-----|-----------|
| `profiles` | Todos | Perfis de usuários com role, nome, foto, cargo |
| `user_roles` | Todos | Tabela de roles por usuário (admin, manager, operator, etc.) |
| `licensees` | Controle / Licenciados | Cadastro mestre de licenciados |
| `service_requests` | Licenciados | Pedidos de serviço dos licenciados |
| `licensee_credits` | Licenciados | Carteira de créditos |
| `credit_transactions` | Licenciados | Extrato de transações de crédito |
| `licensee_gamification` | Licenciados | Pontuação e nível de gamificação |
| `service_catalog` | Licenciados | Catálogo de serviços (carbo_vapt, carbo_ze) |
| `pdvs` | Lojas | Cadastro de pontos de venda |
| `mrp_products` | Controle | Catálogo de produtos (Produto Final + Insumos + Embalagem) |
| `mrp_bom` | Controle | Bill of Materials — insumos por Produto Final |
| `mrp_suppliers` | Controle | Fornecedores |
| `skus` | Controle | SKUs com BOM vinculada |
| `lots` | Controle | Lotes de producao |
| `warehouse_stock` | Controle | Estoque geral |
| `production_orders` | Controle | Ordens de producao |
| `service_orders` | Controle | Ordens de serviço |
| `machines` | Controle | Máquinas de carbonatação |
| `carboze_orders` | Controle / Lojas | Pedidos de insumos CarboZé |
| `freight_quotes` | Controle | Histórico de cotações de frete |
| `bling_tokens` | Controle | Tokens OAuth2 Bling |
| `bling_orders` | Controle | Pedidos sincronizados do Bling |
| `crm_leads` | Controle | Leads unificados do CRM |

### Tabelas Sprint A (Área Licenciados — foundation)

| Tabela | Descricao |
|--------|-----------|
| `descarb_clients` | Clientes atendidos pelos licenciados |
| `descarb_vehicles` | Veículos (placa, marca, modelo, combustível) |
| `descarb_sales` | Atendimentos de descarbonização (modalidade P/M/G/G+) |
| `licensee_reagent_stock` | Estoque de reagentes (normal/flex/diesel) por licenciado |
| `reagent_movements` | Movimentações de reagente (consumo/reposição/ajuste) |
| `licensee_product_stock` | Estoque de produtos finais por licenciado |
| `ops_alerts` | Central de alertas operacionais (prioridade low/medium/high/critical) |

---

## 5. Próximas Sprints — Área Licenciados (Sprint B–E)

### Sprint B — Gestão de Atendimentos
- CRUD de Clientes (`descarb_clients`) no portal do licenciado.
- CRUD de Veículos (`descarb_vehicles`) com busca por placa.
- Registro de atendimento de descarbonização (`descarb_sales`): modalidade, reagente consumido, pagamento, valor.
- Emissão de certificado CarboFlex.

### Sprint C — Estoque e Notificações
- Dashboard de estoque de reagentes no portal licenciado.
- Movimentações de reagente com histórico.
- Alerta de estoque baixo (`ops_alerts` tipo `reagent_low`).
- Notificações push em tempo real (Supabase Realtime + `useLicenseeRealtimeNotifications`).

### Sprint D — Hub Lojas — Evoluções
- Relatório de consumo diário/mensal exportável (Excel/PDF).
- Alertas automáticos por email/SMS quando estoque atingir threshold mínimo.
- Painel de comparação entre PDVs (admin/gestor).

### Sprint E — Onboarding e Relatórios
- Checklist 5 fases de onboarding CarboVAPT v3.0 (`#50`).
- Relatório de performance do licenciado (atendimentos, receita, reagente consumido).
- Dashboard de comissões detalhado com histórico.
- Importação dos 8.845 leads para o CRM (`#48`).

---

## 6. Infraestrutura e Deploy

| Item | Detalhe |
|------|---------|
| Repositório | GitHub privado `petersonoliveira14-debug/CarboHub` |
| CI/CD | GitHub Actions → build Vite → deploy em GitHub Pages |
| Domínio | `carbohub.com.br` — DNS na Hostinger (4 A records + CNAME www) |
| Supabase | Plano Free — `spigkskwypbnaiwkaher.supabase.co` |
| Edge Functions | Deploy manual (`supabase functions deploy <nome>`) |
| HTTPS | Configurar "Enforce HTTPS" em GitHub → Settings → Pages |
| Último commit | `8bf7dfa` — 2026-04-07 |
