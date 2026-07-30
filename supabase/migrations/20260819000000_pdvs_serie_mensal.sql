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
-- Abertura efetiva de cada PDV.
--
-- 4 PDVs não têm `opened_at`: são os que nasceram de pedido faturado (Auto
-- Diesel, Bravo, ARTCAR, Sound Mix), descobertos pelo canal e não pela
-- planilha do comercial. Sem tratar isso eles ficariam FORA da base e DENTRO
-- de "ativos no mês" — e o gráfico mostraria mais pontos comprando do que
-- pontos existindo.
--
-- A queda é para a PRIMEIRA COMPRA, não para hoje: um ponto que comprou em
-- abril existia em abril. Fica na view e não na tabela de propósito —
-- `opened_at` continua nulo em `pdvs`, sinalizando "ninguém informou", e a
-- tela segue pedindo o dado. Gravar a data deduzida apagaria essa pendência.
abertura as (
  select
    p.id,
    p.status,
    coalesce(
      p.opened_at,
      (select min(coalesce(o.sale_date, o.created_at::date))
       from public.carboze_orders o
       where coalesce(p.cnpj, '') <> ''
         and regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g')
           = regexp_replace(p.cnpj, '\D', '', 'g')
         and o.status not in ('quote', 'cancelled')
         and coalesce(o.excluir_metricas, false) = false)
    ) as abriu
  from public.pdvs p
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
  (select count(*) from abertura a
    where a.abriu is not null
      and date_trunc('month', a.abriu)::date <= m.mes
      and a.status <> 'inactive')                                as base,
  -- Novos no mês: abriram neste mês.
  (select count(*) from abertura a
    where a.abriu is not null
      and date_trunc('month', a.abriu)::date = m.mes
      and a.status <> 'inactive')                                as novos,
  -- Ativos no mês: compraram neste mês.
  (select count(*) from compras c where c.mes = m.mes)           as ativos
from meses m
order by m.mes;

comment on view public.carbo_pdvs_serie_mensal is
  'Base de PDVs mês a mês: base acumulada por data de abertura, novos no mês e ativos (que compraram) no mês. Fonte da linha PDV do dashboard comercial. security_invoker: respeita a RLS.';

grant select on public.carbo_pdvs_serie_mensal to authenticated;

-- ── Conferência ───────────────────────────────────────────────────────────
-- Esperado: `base` do mês corrente = 72 (73 menos a Green Lub, que abre em
-- out/2026), e `ativos` nunca maior que `base` em nenhum mês.
select * from public.carbo_pdvs_serie_mensal order by mes desc limit 12;

-- Coerência: ativos <= base em todo mês. Qualquer linha aqui é bug.
select mes, base, ativos
from public.carbo_pdvs_serie_mensal
where ativos > base
order by mes;

-- Quem ainda está sem data informada (a view deduz pela 1ª compra, mas o
-- cadastro segue incompleto e a tela continua pedindo).
select name, cnpj, opened_at, status
from public.pdvs
where opened_at is null
order by name;
