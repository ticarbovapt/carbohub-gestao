-- ═══════════════════════════════════════════════════════════════════════════
-- Mapa da conquista: onde a Carbo já chegou
--
-- Um município "acende" quando existe presença nele, e presença é três coisas
-- que moram em três tabelas:
--
--   venda       carboze_orders — Bling 1, Bling 2, on-line e interna
--   PDV         pdvs
--   licenciado  licensees
--
-- A view entrega uma linha por (cidade, uf) com as três bandeiras e as datas.
-- Quem desenha é a tela; quem decide o que é presença é aqui.
--
-- ── Por que NÃO uso a jamef_cep_faixas como referência de município ────────
--
-- Ela tem município, UF e código IBGE, e foi a primeira ideia. Mas ela é a
-- COBERTURA DA JAMEF, não a lista do Brasil: Rio Branco/AC, Águas Lindas/GO e
-- Fernando de Noronha/PE não estão lá. Usá-la como referência deixaria buracos
-- permanentes em estados inteiros — e pior, buracos que ninguém notaria, porque
-- a cidade simplesmente não apareceria no mapa.
--
-- A tela resolve o código IBGE contra a API de localidades do IBGE (pública, os
-- 5.570 municípios, mesma origem do desenho das malhas). Por isso a view
-- devolve o nome NORMALIZADO: é por ele que o casamento acontece.
--
-- ── A normalização ────────────────────────────────────────────────────────
--
-- Três fontes escrevem o nome de jeitos diferentes (digitação do vendedor,
-- cadastro do Bling, etiqueta do marketplace). Sem normalizar, "São Paulo",
-- "SAO PAULO" e "sao  paulo" viram três cidades. Maiúsculas, sem acento,
-- espaços colapsados e sem apóstrofo — `DIAS D'AVILA` vira `DIAS DAVILA`, que
-- é como o nome do IBGE fica depois do mesmo tratamento na tela.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.carbo_normaliza_cidade(p_nome text)
returns text language sql immutable set search_path = public as $$
  select nullif(
    regexp_replace(
      translate(
        upper(trim(coalesce(p_nome, ''))),
        'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ''`´',
        'AAAAAEEEEIIIIOOOOOUUUUCN'
      ),
      '\s+', ' ', 'g'
    ), '')
$$;

comment on function public.carbo_normaliza_cidade is
  'Nome de cidade em caixa alta, sem acento, sem apóstrofo e com espaços colapsados. É a chave de casamento entre nossas três fontes e a lista do IBGE.';


create or replace view public.mapa_conquista
with (security_invoker = true) as
with vendas as (
  select
    public.carbo_normaliza_cidade(
      coalesce(nullif(trim(o.delivery_city), ''), nullif(trim(o.billing_city), ''))
    )                                                                    as cidade,
    upper(coalesce(nullif(trim(o.delivery_state), ''), nullif(trim(o.billing_state), ''))) as uf,
    o.total,
    coalesce(o.sale_date, o.created_at::date)                            as dia
  from public.carboze_orders o
  -- Orçamento e cancelado não são presença: ninguém comprou.
  where o.status not in ('quote', 'cancelled')
    and coalesce(o.excluir_metricas, false) = false
),
por_venda as (
  select cidade, uf,
         count(*)          as pedidos,
         round(sum(total), 2) as valor,
         min(dia)          as primeira_venda,
         max(dia)          as ultima_venda
  from vendas
  where cidade is not null and uf is not null and length(uf) = 2
  group by cidade, uf
),
por_pdv as (
  select public.carbo_normaliza_cidade(address_city) as cidade,
         upper(trim(address_state))                  as uf,
         count(*)                                    as pdvs
  from public.pdvs
  where address_city is not null and address_state is not null
  group by 1, 2
),
por_licenciado as (
  select public.carbo_normaliza_cidade(address_city) as cidade,
         upper(trim(address_state))                  as uf,
         count(*)                                    as licenciados
  from public.licensees
  where address_city is not null and address_state is not null
  group by 1, 2
),
todas as (
  select cidade, uf from por_venda
  union
  select cidade, uf from por_pdv
  union
  select cidade, uf from por_licenciado
)
select
  t.cidade,
  t.uf,
  coalesce(v.pedidos, 0)                       as pedidos,
  coalesce(v.valor, 0)                         as valor,
  coalesce(p.pdvs, 0)                          as pdvs,
  coalesce(l.licenciados, 0)                   as licenciados,
  (v.cidade is not null)                       as tem_venda,
  (p.cidade is not null)                       as tem_pdv,
  (l.cidade is not null)                       as tem_licenciado,
  v.primeira_venda,
  v.ultima_venda,
  -- Conquista recente: a PRIMEIRA venda caiu nos últimos 30 dias. Cidade que
  -- já comprava e comprou de novo não é conquista — é recorrência, e misturar
  -- as duas mataria o sentido do contador "+N este mês".
  (v.primeira_venda is not null
     and v.primeira_venda >= (current_date - interval '30 days')::date) as conquista_recente
from todas t
left join por_venda      v on v.cidade = t.cidade and v.uf = t.uf
left join por_pdv        p on p.cidade = t.cidade and p.uf = t.uf
left join por_licenciado l on l.cidade = t.cidade and l.uf = t.uf
where t.cidade is not null and t.uf is not null and length(t.uf) = 2;

comment on view public.mapa_conquista is
  'Uma linha por (cidade, uf) onde a Carbo tem presença: venda, PDV ou licenciado. Nome normalizado para casar com a lista de municípios do IBGE, que a tela consulta para obter o código e desenhar. security_invoker: respeita a RLS de quem chama.';

grant select on public.mapa_conquista to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) O placar que vai no topo da tela.
select count(*)                                        as cidades,
       count(distinct uf)                              as estados,
       count(*) filter (where tem_venda)               as com_venda,
       count(*) filter (where tem_pdv)                 as com_pdv,
       count(*) filter (where tem_licenciado)          as com_licenciado,
       count(*) filter (where conquista_recente)       as novas_30_dias
from public.mapa_conquista;

-- (b) Ranking por estado — é o que a visão Brasil vai pintar.
select uf, count(*) as cidades, sum(pedidos) as pedidos, round(sum(valor), 2) as valor
from public.mapa_conquista
group by uf order by cidades desc;

-- (c) As conquistas recentes, que ganham destaque no mapa.
select cidade, uf, primeira_venda, pedidos, valor
from public.mapa_conquista
where conquista_recente
order by primeira_venda desc;
