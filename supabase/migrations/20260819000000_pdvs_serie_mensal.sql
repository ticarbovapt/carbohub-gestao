-- ═══════════════════════════════════════════════════════════════════════════
-- carbo_pdvs_serie_mensal — evolução da base de PDVs, mês a mês
--
-- O gráfico "Crescimento de Clientes por Canal" mostrava 110 PDVs existindo
-- 73. Dois motivos, os dois no front:
--   1. a linha "PDV" contava CLIENTE com pedido 'revenda', não ponto de venda
--      cadastrado — e o backfill de canal etiquetou revendedor que nunca foi
--      cadastrado como PDV;
--   2. a contagem era por NOME do cliente, então cada variação de razão
--      social virava um cliente a mais ("Emmily Pereira da Silva Moreira" e
--      "Emmily Moreira", mesmo CPF, contavam 2).
--
-- Esta view é a fonte de verdade da linha PDV: sai da tabela `pdvs`, com a
-- data de abertura real e a compra real de cada ponto.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.carbo_pdvs_serie_mensal
with (security_invoker = true) as
with limites as (
  select
    date_trunc('month', least(
      coalesce((select min(opened_at) from public.pdvs), current_date),
      coalesce((select min(coalesce(sale_date, created_at::date))
                from public.carboze_orders
                where status not in ('quote','cancelled')), current_date)
    ))::date as ini,
    date_trunc('month', current_date)::date as fim
),
meses as (
  select generate_series(ini, fim, interval '1 month')::date as mes from limites
),
-- Um PDV "ativo no mês" é o que COMPROU no mês. Casa por CNPJ só-dígitos dos
-- dois lados, como todo o resto do módulo.
compras as (
  select distinct
    p.id as pdv_id,
    date_trunc('month', coalesce(o.sale_date, o.created_at::date))::date as mes
  from public.pdvs p
  join public.carboze_orders o
    on coalesce(p.cnpj, '') <> ''
   and regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g')
     = regexp_replace(p.cnpj, '\D', '', 'g')
  where o.status not in ('quote', 'cancelled')
    and coalesce(o.excluir_metricas, false) = false
)
select
  m.mes,
  -- Base acumulada: PDVs já abertos até o mês.
  --
  -- ⚠️ `status <> 'inactive'` é avaliado com o status de HOJE, não com o do
  -- mês — a tabela não guarda data de desativação. Consequência: desativar um
  -- PDV o apaga também do passado do gráfico. Foi a escolha consciente entre
  -- errar o histórico e errar o número de hoje, que é o que a diretoria lê.
  -- Se um dia isso incomodar, o conserto é uma coluna `deactivated_at`.
  (select count(*) from public.pdvs p
    where p.opened_at is not null
      and date_trunc('month', p.opened_at)::date <= m.mes
      and p.status <> 'inactive')                                as base,
  -- Novos no mês: abriram neste mês.
  (select count(*) from public.pdvs p
    where p.opened_at is not null
      and date_trunc('month', p.opened_at)::date = m.mes
      and p.status <> 'inactive')                                as novos,
  -- Ativos no mês: compraram neste mês.
  (select count(*) from compras c where c.mes = m.mes)           as ativos
from meses m
order by m.mes;

comment on view public.carbo_pdvs_serie_mensal is
  'Base de PDVs mês a mês: base acumulada por data de abertura, novos no mês e ativos (que compraram) no mês. Fonte da linha PDV do dashboard comercial. security_invoker: respeita a RLS.';

grant select on public.carbo_pdvs_serie_mensal to authenticated;

-- ── Conferência ───────────────────────────────────────────────────────────
-- O `base` do mês corrente tem de bater com os PDVs não-inativos que já
-- abriram. Green Lub abre em out/2026, então fica de fora até lá.
select * from public.carbo_pdvs_serie_mensal order by mes desc limit 12;

select count(*) filter (where status <> 'inactive' and opened_at is not null
                          and opened_at <= current_date)          as base_hoje,
       count(*) filter (where opened_at is null)                  as sem_abertura,
       count(*) filter (where opened_at > current_date)           as abertura_futura,
       count(*)                                                   as total
from public.pdvs;
