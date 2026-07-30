-- ═══════════════════════════════════════════════════════════════════════════
-- Microdistribuidor é uma CAMADA sobre o PDV, não um tipo que o substitui
--
-- Dois PDVs viraram microdistribuidores e continuam sendo PDVs. O problema:
-- a data dessa mudança foi parar na coluna `opened_at`, sobrescrevendo a
-- abertura do ponto. Resultado: Auto Diesel e CarPower apareciam como
-- "abertos em jul/2026" comprando desde dez/2025 — ponto vendendo antes de
-- existir.
--
-- São duas perguntas diferentes e cada uma ganha sua coluna:
--   opened_at  → quando o ponto abriu
--   micro_desde → quando virou microdistribuidor
--
-- É flag + data, não um `tipo` que substitui: microdistribuidor é PDV, conta
-- na base de PDVs e no canal Revenda como qualquer outro. Um enum de tipo
-- obrigaria toda contagem de PDV a lembrar de somar as duas categorias — e
-- alguma esqueceria.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.pdvs add column if not exists is_micro boolean not null default false;
alter table public.pdvs add column if not exists micro_desde date;

comment on column public.pdvs.is_micro is
  'PDV que também é microdistribuidor. NÃO substitui o PDV: continua contando na base de pontos e no canal Revenda.';
comment on column public.pdvs.micro_desde is
  'Quando virou microdistribuidor. Não confundir com opened_at, que é a abertura do ponto.';

-- ── Os 2 microdistribuidores ──────────────────────────────────────────────
-- A data que estava em opened_at (jul/2026) é, na verdade, quando viraram
-- micro. Move para a coluna certa.
update public.pdvs
set is_micro    = true,
    micro_desde = opened_at,
    updated_at  = now()
where regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') in ('08533625000120', '16607328000100')
  and is_micro = false;

-- ── Abertura = a data mais antiga que temos prova de existir ──────────────
-- Depois de liberar o opened_at dos dois micro, sobra o caso geral: PDV cuja
-- abertura cadastrada é POSTERIOR a uma compra já faturada. Isso é
-- fisicamente impossível — o ponto não pode ter vendido antes de abrir.
--
-- A primeira compra é um limite superior da abertura real: o ponto abriu
-- naquele mês ou antes. É o melhor dado disponível, e é melhor que uma data
-- comprovadamente errada.
update public.pdvs p
set opened_at  = c.primeira_compra,
    updated_at = now()
from lateral (
  select min(coalesce(o.sale_date, o.created_at::date)) as primeira_compra
  from public.carboze_orders o
  where coalesce(p.cnpj, '') <> ''
    and regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g')
      = regexp_replace(p.cnpj, '\D', '', 'g')
    and o.status not in ('quote', 'cancelled')
    and coalesce(o.excluir_metricas, false) = false
) c
where c.primeira_compra is not null
  and (p.opened_at is null or c.primeira_compra < p.opened_at);

-- ── A view expõe as colunas novas ─────────────────────────────────────────
-- DROP + CREATE: as colunas entram no meio e o replace só aceita no fim.
drop view if exists public.carbo_pdvs_painel;

create view public.carbo_pdvs_painel
with (security_invoker = true) as
select
  p.id, p.pdv_code, p.name, p.legal_name, p.cnpj,
  regexp_replace(coalesce(p.cnpj, ''), '\D', '', 'g') as cnpj_digits,
  p.address_city, p.address_state, p.address_street, p.address_zip,
  p.contact_name, p.contact_phone, p.email,
  p.status, p.notes, p.created_at, p.updated_at,
  p.opened_at,
  p.is_micro,
  p.micro_desde,
  p.owner_seller_id,
  coalesce(pr.full_name, p.owner_seller_name) as owner_seller_name,
  coalesce(mx.mix, '{}'::jsonb) as mix,
  coalesce(m.pedidos, 0)        as pedidos,
  coalesce(m.total_comprado, 0) as total_comprado,
  m.ultima_compra,
  m.primeira_compra,
  (p.cnpj is null or btrim(p.cnpj) = '') as sem_documento
from public.pdvs p
left join public.profiles pr on pr.id = p.owner_seller_id
left join lateral (
  select jsonb_object_agg(
           x.produto,
           jsonb_build_object('oferece', x.oferece, 'preco', x.preco_revenda)
         ) as mix
  from public.pdv_produto_mix x
  where x.pdv_id = p.id
) mx on true
left join lateral (
  select
    count(*)                                       as pedidos,
    sum(o.total)                                   as total_comprado,
    max(coalesce(o.sale_date, o.created_at::date)) as ultima_compra,
    min(coalesce(o.sale_date, o.created_at::date)) as primeira_compra
  from public.carboze_orders o
  where coalesce(p.cnpj, '') <> ''
    and regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g')
      = regexp_replace(p.cnpj, '\D', '', 'g')
    and o.status not in ('quote', 'cancelled')
) m on true;

comment on view public.carbo_pdvs_painel is
  'PDVs com agregado de compras, dono da carteira, abertura, flag de microdistribuidor e mix de produto (JSON). security_invoker: respeita a RLS.';

grant select on public.carbo_pdvs_painel to authenticated;

-- ── Conferência ───────────────────────────────────────────────────────────

-- (a) Nenhum PDV pode ter abertura posterior à primeira compra. Vazio.
select p.name, p.opened_at, c.primeira_compra
from public.pdvs p
join lateral (
  select min(coalesce(o.sale_date, o.created_at::date)) as primeira_compra
  from public.carboze_orders o
  where coalesce(p.cnpj, '') <> ''
    and regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g')
      = regexp_replace(p.cnpj, '\D', '', 'g')
    and o.status not in ('quote', 'cancelled')
    and coalesce(o.excluir_metricas, false) = false
) c on true
where c.primeira_compra is not null
  and (p.opened_at is null or c.primeira_compra < p.opened_at);

-- (b) Os 2 microdistribuidores, com as duas datas separadas.
select name, cnpj, opened_at, micro_desde, is_micro
from public.pdvs where is_micro order by name;

-- (c) Ainda sem abertura: só quem nunca comprou (não há de onde deduzir).
select name, cnpj, status from public.pdvs where opened_at is null order by name;

-- (d) A série continua coerente: ativos <= base em todo mês. Vazio.
select mes, base, ativos from public.carbo_pdvs_serie_mensal
where ativos > base order by mes;
