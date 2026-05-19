-- Seed inicial de function_screen_access
-- ON CONFLICT DO NOTHING → não sobrescreve configurações feitas pela UI
-- Lógica geral por escopo:
--   global  → acesso amplo a todas as áreas relacionadas ao dept
--   dept    → operacional + produção/comercial do próprio dept
--   equipe  → telas operacionais de times
--   próprio → só telas de trabalho individual

INSERT INTO public.function_screen_access (department, function_key, screen_ids) VALUES

-- ── COMMAND ──────────────────────────────────────────────────────────────────
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

('command', 'assistente_executiva', ARRAY[
  'dashboard','home','meu-painel',
  'viagens',
  'team','org-chart','responsibility-map',
  'admin-approval',
  'governance',
  'ai-assistant'
]),

-- ── OPERAÇÕES ─────────────────────────────────────────────────────────────────
('ops', 'head', ARRAY[
  'dashboard','home','meu-painel',
  'os','checklist','scheduling','machines','ops-alerts',
  'orders','orders-new',
  'mrp-products','mrp-suppliers','skus','lots','production-orders','suprimentos','purchasing',
  'logistics',
  'dashboard-producao','dashboard-logistica','dashboard-estrategico',
  'mapa-territorial','network-map','licensee-ranking','territory-intelligence','territory-expansion','pdv-network',
  'team','org-chart','role-matrix','responsibility-map',
  'admin-approval',
  'bugs','bling'
]),

('ops', 'gerente', ARRAY[
  'dashboard','home','meu-painel',
  'os','checklist','scheduling','machines','ops-alerts',
  'mrp-products','skus','lots','production-orders','suprimentos','purchasing',
  'logistics',
  'dashboard-producao','dashboard-logistica',
  'team','org-chart','responsibility-map',
  'bling'
]),

('ops', 'coordenador', ARRAY[
  'home','meu-painel',
  'os','checklist','scheduling','ops-alerts',
  'lots','production-orders','suprimentos','purchasing',
  'logistics',
  'dashboard-producao'
]),

('ops', 'supervisor', ARRAY[
  'home','meu-painel',
  'os','checklist','scheduling','ops-alerts',
  'production-orders','suprimentos',
  'logistics'
]),

('ops', 'staff', ARRAY[
  'home','meu-painel',
  'os','checklist','scheduling',
  'suprimentos'
]),

-- ── COMERCIAL / GRANDES CONTAS (b2b) ─────────────────────────────────────────
('b2b', 'head', ARRAY[
  'dashboard','home','meu-painel',
  'orders','orders-new','b2b','b2b-funnel','crm','sales-targets','licensees',
  'dashboard-comercial','dashboard-estrategico',
  'mapa-territorial','network-map','licensee-ranking','territory-intelligence','territory-expansion','pdv-network',
  'pdv-dashboard','pdv-vendedores','pdv-ranking',
  'team','org-chart','responsibility-map',
  'admin-approval',
  'ai-assistant'
]),

('b2b', 'supervisor', ARRAY[
  'home','meu-painel',
  'orders','orders-new','b2b','b2b-funnel','crm','sales-targets',
  'dashboard-comercial',
  'mapa-territorial','network-map','licensee-ranking',
  'pdv-dashboard','pdv-ranking',
  'ai-assistant'
]),

('b2b', 'vendedor_b2b', ARRAY[
  'home','meu-painel',
  'orders','orders-new','b2b','b2b-funnel','crm',
  'ai-assistant'
]),

('b2b', 'vendedor_b2c', ARRAY[
  'home','meu-painel',
  'orders','orders-new',
  'os','checklist','scheduling',
  'ai-assistant'
]),

-- ── FINANCE ──────────────────────────────────────────────────────────────────
('finance', 'head', ARRAY[
  'dashboard','home','meu-painel',
  'orders',
  'financeiro','viagens','nfse',
  'dashboard-financeiro','dashboard-estrategico',
  'team','org-chart','responsibility-map',
  'admin-approval','governance','admin',
  'ai-assistant'
]),

('finance', 'gerente', ARRAY[
  'home','meu-painel',
  'financeiro','viagens','nfse',
  'dashboard-financeiro',
  'team'
]),

('finance', 'coordenador', ARRAY[
  'home','meu-painel',
  'financeiro','viagens',
  'dashboard-financeiro'
]),

('finance', 'analista', ARRAY[
  'home','meu-painel',
  'financeiro','viagens'
]),

-- ── GROWTH ────────────────────────────────────────────────────────────────────
('growth', 'head', ARRAY[
  'dashboard','home','meu-painel',
  'orders',
  'dashboard-comercial','dashboard-estrategico',
  'mapa-territorial','network-map','licensee-ranking',
  'team','org-chart','responsibility-map',
  'ai-assistant'
]),

('growth', 'staff', ARRAY[
  'home','meu-painel',
  'ai-assistant'
]),

-- ── EXPANSÃO ─────────────────────────────────────────────────────────────────
('expansao', 'head', ARRAY[
  'dashboard','home','meu-painel',
  'orders','licensees',
  'dashboard-estrategico',
  'mapa-territorial','network-map','licensee-ranking','territory-intelligence','territory-expansion','pdv-network',
  'pdv-dashboard','pdv-vendedores','pdv-ranking',
  'team','org-chart','responsibility-map',
  'admin-approval',
  'ai-assistant'
]),

('expansao', 'staff', ARRAY[
  'home','meu-painel',
  'licensees',
  'mapa-territorial','network-map',
  'ai-assistant'
]),

-- ── TI / SUPORTE (fullAccess — bypass via isSuporte, mas seed completo p/ segurança) ──
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
  'admin','cockpit','admin-approval','admin-pipeline','admin-webhooks','import','governance',
  'bugs','ai-assistant','bling'
])

ON CONFLICT (department, function_key) DO NOTHING;
