-- ═══════════════════════════════════════════════════════════════════════════
-- ETAPA 0 — a aba Movimentações passa a filtrar no servidor
--
-- Preparação para a rastreabilidade de estoque. Nada de comportamento muda
-- aqui: é só o índice que a consulta nova precisa.
--
-- O que mudou no app: `useStockMovements` filtrava hub e período NA TELA, em
-- cima das 300 linhas mais recentes de TODOS os hubs. Enquanto o volume é
-- baixo, funciona. Quando as saídas por venda entrarem nesta tabela — quase
-- todas no HUB-RN — elas tomariam as 300 vagas e as abas do CD SP e do CD SP
-- Vendas ficariam VAZIAS. Ou seja: a mudança que conserta a tela quebraria a
-- tela, se esta etapa não viesse antes.
--
-- `stock_movements` tem índice em (product_id) e em (origem, origem_id). Não
-- tem nenhum em warehouse_id nem em created_at — que é exatamente por onde a
-- lista e os KPIs filtram.
-- ═══════════════════════════════════════════════════════════════════════════

-- (warehouse_id, created_at desc): cobre a lista do hub no período E os três
-- contadores de KPI, que já filtravam por essas duas colunas sem índice.
create index if not exists idx_stock_movements_hub_data
  on public.stock_movements (warehouse_id, created_at desc);

comment on index public.idx_stock_movements_hub_data is
  'Aba Movimentações e KPIs de Suprimentos: filtram por hub + janela de datas.';

-- ── Conferência ───────────────────────────────────────────────────────────

-- (a) Índices da tabela.
select indexname from pg_indexes
where schemaname = 'public' and tablename = 'stock_movements'
order by indexname;

-- (b) Retrato de HOJE, antes de qualquer mudança de comportamento.
--     Guarde este resultado: é a linha de base para conferir que as etapas
--     seguintes ADICIONARAM movimento sem mexer no que já existia.
select w.code as hub, m.origem, count(*) as movimentos,
       min(m.created_at)::date as mais_antigo,
       max(m.created_at)::date as mais_recente
from public.stock_movements m
left join public.warehouses w on w.id = m.warehouse_id
group by 1, 2
order by 1 nulls last, 3 desc;
