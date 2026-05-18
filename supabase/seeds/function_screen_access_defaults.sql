-- =============================================================================
-- SEED: function_screen_access — defaults por departamento/função
-- =============================================================================
-- Execute no SQL Editor do Supabase.
-- Usa INSERT ... ON CONFLICT DO UPDATE para ser idempotente (pode rodar 2x sem problema).
-- Depois de rodar, acesse Matriz de Papéis > Por Função para ajustar visualmente.
-- =============================================================================

-- Variáveis de conveniência (arrays reutilizados)
-- (PostgreSQL não tem variáveis em plain SQL, então os arrays ficam inline)

INSERT INTO public.function_screen_access (department, function_key, screen_ids)
VALUES

-- ===========================================================================
-- COMMAND
-- ===========================================================================

-- CEO: tudo, inclusive Cockpit
('command', 'ceo', ARRAY[
  'dashboard','home','meu-painel',
  'os','checklist','scheduling','machines','ops-alerts',
  'orders','orders-new','b2b','b2b-funnel','crm','sales-targets','licensees',
  'financeiro','viagens','nfse',
  'mrp-products','mrp-suppliers','skus','lots','production-orders','suprimentos','purchasing',
  'logistics',
  'dashboard-producao','dashboard-financeiro','dashboard-logistica','dashboard-comercial','dashboard-estrategico',
  'mapa-territorial','network-map','licensee-ranking','territory-intelligence','territory-expansion','pdv-network',
  'pdv-dashboard','pdv-pos','pdv-estoque','pdv-vendedores','pdv-ranking',
  'team','org-chart','role-matrix','responsibility-map',
  'admin','cockpit','admin-approval','admin-pipeline','admin-webhooks','import','governance',
  'bugs','ai-assistant','bling'
]),

-- Assistente Executiva: mesmo acesso dos heads (tudo exceto Cockpit CEO)
('command', 'assistente_executiva', ARRAY[
  'dashboard','home','meu-painel',
  'os','checklist','scheduling','machines','ops-alerts',
  'orders','orders-new','b2b','b2b-funnel','crm','sales-targets','licensees',
  'financeiro','viagens','nfse',
  'mrp-products','mrp-suppliers','skus','lots','production-orders','suprimentos','purchasing',
  'logistics',
  'dashboard-producao','dashboard-financeiro','dashboard-logistica','dashboard-comercial','dashboard-estrategico',
  'mapa-territorial','network-map','licensee-ranking','territory-intelligence','territory-expansion','pdv-network',
  'pdv-dashboard','pdv-pos','pdv-estoque','pdv-vendedores','pdv-ranking',
  'team','org-chart','role-matrix','responsibility-map',
  'admin','admin-approval','admin-pipeline','admin-webhooks','import','governance',
  'bugs','ai-assistant','bling'
]),

-- ===========================================================================
-- OPS (Operações)
-- ===========================================================================

-- Head Ops: tudo exceto Cockpit CEO
('ops', 'head', ARRAY[
  'dashboard','home','meu-painel',
  'os','checklist','scheduling','machines','ops-alerts',
  'orders','orders-new','licensees',
  'financeiro','viagens',
  'mrp-products','mrp-suppliers','skus','lots','production-orders','suprimentos','purchasing',
  'logistics',
  'dashboard-producao','dashboard-financeiro','dashboard-logistica','dashboard-comercial','dashboard-estrategico',
  'mapa-territorial','network-map','licensee-ranking','territory-intelligence','territory-expansion','pdv-network',
  'pdv-dashboard','pdv-pos','pdv-estoque','pdv-vendedores','pdv-ranking',
  'team','org-chart','role-matrix','responsibility-map',
  'admin','admin-approval','admin-pipeline','admin-webhooks','import','governance',
  'bugs','ai-assistant','bling'
]),

-- Gerente Ops: visão completa do departamento + dashboards + equipe
('ops', 'gerente', ARRAY[
  'dashboard','home','meu-painel',
  'os','checklist','scheduling','machines','ops-alerts',
  'orders','orders-new',
  'mrp-products','skus','lots','production-orders','suprimentos','purchasing',
  'logistics',
  'dashboard-producao','dashboard-logistica','dashboard-comercial',
  'network-map','licensee-ranking','territory-intelligence',
  'pdv-dashboard','pdv-ranking',
  'team','org-chart','responsibility-map',
  'ai-assistant'
]),

-- Coordenador Ops: operacional + produção + logística, sem admin/financeiro
('ops', 'coordenador', ARRAY[
  'dashboard','home','meu-painel',
  'os','checklist','scheduling','machines','ops-alerts',
  'orders',
  'skus','lots','production-orders','suprimentos',
  'logistics',
  'dashboard-producao','dashboard-logistica',
  'pdv-dashboard',
  'team',
  'ai-assistant'
]),

-- Supervisor Ops: operacional direto + logística básica
('ops', 'supervisor', ARRAY[
  'meu-painel',
  'os','checklist','scheduling','machines','ops-alerts',
  'orders',
  'lots','production-orders',
  'logistics',
  'dashboard-producao'
]),

-- Colaborador Ops: apenas telas do dia a dia
('ops', 'staff', ARRAY[
  'meu-painel',
  'os','checklist','scheduling','machines'
]),

-- ===========================================================================
-- B2B (Vendas)
-- ===========================================================================

-- Head B2B: tudo exceto Cockpit CEO
('b2b', 'head', ARRAY[
  'dashboard','home','meu-painel',
  'os','checklist','ops-alerts',
  'orders','orders-new','b2b','b2b-funnel','crm','sales-targets','licensees',
  'financeiro','viagens',
  'dashboard-producao','dashboard-financeiro','dashboard-logistica','dashboard-comercial','dashboard-estrategico',
  'mapa-territorial','network-map','licensee-ranking','territory-intelligence','territory-expansion','pdv-network',
  'pdv-dashboard','pdv-pos','pdv-estoque','pdv-vendedores','pdv-ranking',
  'team','org-chart','responsibility-map',
  'admin-approval','governance',
  'ai-assistant'
]),

-- Supervisor B2B: visão comercial completa
('b2b', 'supervisor', ARRAY[
  'dashboard','home','meu-painel',
  'orders','orders-new','b2b','b2b-funnel','crm','sales-targets','licensees',
  'dashboard-comercial',
  'mapa-territorial','licensee-ranking','territory-intelligence',
  'pdv-dashboard','pdv-pos','pdv-estoque','pdv-vendedores','pdv-ranking',
  'ai-assistant'
]),

-- Vendedor B2B: leads, funil, pedidos, PDV
('b2b', 'vendedor_b2b', ARRAY[
  'meu-painel',
  'orders','orders-new','b2b','b2b-funnel','crm','sales-targets','licensees',
  'mapa-territorial','territory-intelligence',
  'pdv-dashboard','pdv-pos','pdv-vendedores',
  'ai-assistant'
]),

-- Vendedor B2C: pedidos, CRM, PDV mais direto
('b2b', 'vendedor_b2c', ARRAY[
  'meu-painel',
  'orders','orders-new','crm','sales-targets',
  'pdv-dashboard','pdv-pos','pdv-vendedores','pdv-ranking',
  'ai-assistant'
]),

-- ===========================================================================
-- FINANCE
-- ===========================================================================

-- Head Finance: tudo exceto Cockpit CEO
('finance', 'head', ARRAY[
  'dashboard','home','meu-painel',
  'orders',
  'financeiro','viagens','nfse',
  'mrp-products','production-orders','purchasing',
  'dashboard-producao','dashboard-financeiro','dashboard-logistica','dashboard-comercial','dashboard-estrategico',
  'team','org-chart','responsibility-map',
  'admin','admin-approval','import','governance',
  'ai-assistant'
]),

-- Gerente Finance: financeiro completo + visão de pedidos
('finance', 'gerente', ARRAY[
  'dashboard','home','meu-painel',
  'orders',
  'financeiro','viagens','nfse',
  'purchasing',
  'dashboard-financeiro','dashboard-comercial',
  'team','org-chart',
  'governance',
  'ai-assistant'
]),

-- Coordenador Finance: financeiro operacional + compras
('finance', 'coordenador', ARRAY[
  'meu-painel',
  'orders',
  'financeiro','viagens','nfse',
  'purchasing',
  'dashboard-financeiro',
  'ai-assistant'
]),

-- Analista Finance: financeiro e viagens
('finance', 'analista', ARRAY[
  'meu-painel',
  'financeiro','viagens','nfse',
  'dashboard-financeiro',
  'ai-assistant'
]),

-- ===========================================================================
-- GROWTH
-- ===========================================================================

-- Head Growth: tudo exceto Cockpit CEO
('growth', 'head', ARRAY[
  'dashboard','home','meu-painel',
  'orders','b2b','b2b-funnel','crm','sales-targets','licensees',
  'dashboard-producao','dashboard-financeiro','dashboard-logistica','dashboard-comercial','dashboard-estrategico',
  'mapa-territorial','network-map','licensee-ranking','territory-intelligence','territory-expansion','pdv-network',
  'pdv-dashboard','pdv-ranking',
  'team','org-chart','responsibility-map',
  'governance',
  'ai-assistant'
]),

-- Staff Growth: foco em dados comerciais e expansão
('growth', 'staff', ARRAY[
  'meu-painel',
  'orders','b2b','crm','sales-targets',
  'dashboard-comercial',
  'mapa-territorial','territory-intelligence','territory-expansion',
  'ai-assistant'
]),

-- ===========================================================================
-- EXPANSÃO
-- ===========================================================================

-- Head Expansão: tudo exceto Cockpit CEO
('expansao', 'head', ARRAY[
  'dashboard','home','meu-painel',
  'orders','b2b','b2b-funnel','crm','sales-targets','licensees',
  'dashboard-comercial','dashboard-estrategico',
  'mapa-territorial','network-map','licensee-ranking','territory-intelligence','territory-expansion','pdv-network',
  'pdv-dashboard','pdv-ranking',
  'team','org-chart','responsibility-map',
  'governance',
  'ai-assistant'
]),

-- Staff Expansão: foco em rede, expansão territorial e licenciados
('expansao', 'staff', ARRAY[
  'meu-painel',
  'orders','b2b','b2b-funnel','licensees',
  'mapa-territorial','network-map','territory-intelligence','territory-expansion','pdv-network',
  'pdv-dashboard','pdv-ranking',
  'ai-assistant'
]),

-- ===========================================================================
-- TI / SUPORTE (fullAccess — vê tudo sempre, mas registrado para rastreabilidade)
-- ===========================================================================

-- Head TI: tudo
('ti_suporte', 'head', ARRAY[
  'dashboard','home','meu-painel',
  'os','checklist','scheduling','machines','ops-alerts',
  'orders','orders-new','b2b','b2b-funnel','crm','sales-targets','licensees',
  'financeiro','viagens','nfse',
  'mrp-products','mrp-suppliers','skus','lots','production-orders','suprimentos','purchasing',
  'logistics',
  'dashboard-producao','dashboard-financeiro','dashboard-logistica','dashboard-comercial','dashboard-estrategico',
  'mapa-territorial','network-map','licensee-ranking','territory-intelligence','territory-expansion','pdv-network',
  'pdv-dashboard','pdv-pos','pdv-estoque','pdv-vendedores','pdv-ranking',
  'team','org-chart','role-matrix','responsibility-map',
  'admin','cockpit','admin-approval','admin-pipeline','admin-webhooks','import','governance',
  'bugs','ai-assistant','bling'
]),

-- Staff TI: tudo (suporte técnico precisa ver qualquer tela)
('ti_suporte', 'staff', ARRAY[
  'dashboard','home','meu-painel',
  'os','checklist','scheduling','machines','ops-alerts',
  'orders','orders-new','b2b','b2b-funnel','crm','sales-targets','licensees',
  'financeiro','viagens','nfse',
  'mrp-products','mrp-suppliers','skus','lots','production-orders','suprimentos','purchasing',
  'logistics',
  'dashboard-producao','dashboard-financeiro','dashboard-logistica','dashboard-comercial','dashboard-estrategico',
  'mapa-territorial','network-map','licensee-ranking','territory-intelligence','territory-expansion','pdv-network',
  'pdv-dashboard','pdv-pos','pdv-estoque','pdv-vendedores','pdv-ranking',
  'team','org-chart','role-matrix','responsibility-map',
  'admin','admin-approval','admin-pipeline','admin-webhooks','import','governance',
  'bugs','ai-assistant','bling'
])

ON CONFLICT (department, function_key)
DO UPDATE SET
  screen_ids = EXCLUDED.screen_ids,
  updated_at = now();
