-- ═══════════════════════════════════════════════════════════════════════════
-- Mapa da conquista: de-para de nomes de cidade
--
-- Três cidades reais não casavam com a lista do IBGE — e nenhuma delas é erro
-- que dê para "corrigir na origem":
--
--   MOOCA/SP          → o cliente escreveu o BAIRRO no lugar da cidade
--   NORONHA/PE        → forma curta de Fernando de Noronha
--   S.G. AMARANTE/RN  → abreviação de São Gonçalo do Amarante
--
-- Quem digitou foi o comprador, na tela do marketplace. Um UPDATE em
-- `carboze_orders` seria desfeito no próximo sync, e o pedido seguinte chegaria
-- escrito do mesmo jeito. Então o conserto mora aqui, entre o dado e o desenho:
-- uma tabela que o mapa consulta na hora de casar o nome.
--
-- ⚠️ O de-para é só de NOME. A UF continua vindo do pedido e faz parte da
-- chave — São Gonçalo do Amarante existe no RN e no CE, e sem a UF na chave
-- um apelido do RN mudaria a cidade do CE junto.
--
-- Cidade que não casar daqui em diante continua aparecendo no rodapé da tela.
-- É de lá que sai a próxima linha desta tabela.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.carbo_cidade_alias (
  cidade_origem  text not null,   -- como chega, JÁ normalizado
  uf             text not null,
  cidade_destino text not null,   -- nome do IBGE, JÁ normalizado
  motivo         text,
  criado_em      timestamptz not null default now(),
  primary key (cidade_origem, uf)
);

comment on table public.carbo_cidade_alias is
  'De-para de nomes de cidade para o Mapa da Conquista. Chave = (nome normalizado, UF). Alimentada pelo rodapé "não localizadas no IBGE" da tela.';

insert into public.carbo_cidade_alias (cidade_origem, uf, cidade_destino, motivo) values
  ('MOOCA',          'SP', 'SAO PAULO',                'bairro de São Paulo escrito no lugar da cidade'),
  ('NORONHA',        'PE', 'FERNANDO DE NORONHA',      'forma curta'),
  ('S.G. AMARANTE',  'RN', 'SAO GONCALO DO AMARANTE',  'abreviação')
on conflict (cidade_origem, uf) do nothing;

alter table public.carbo_cidade_alias enable row level security;

-- A view é security_invoker: quem abre o mapa precisa conseguir ler o de-para,
-- senão o alias não se aplica e as cidades voltam a não casar — em silêncio.
drop policy if exists carbo_cidade_alias_leitura on public.carbo_cidade_alias;
create policy carbo_cidade_alias_leitura on public.carbo_cidade_alias
  for select to authenticated using (true);

grant select on public.carbo_cidade_alias to authenticated;


-- ── O nome canônico: normaliza e, se houver apelido conhecido, resolve ──────
-- STABLE (não IMMUTABLE): lê tabela.
create or replace function public.carbo_cidade_canonica(p_nome text, p_uf text)
returns text language sql stable set search_path = public as $$
  select coalesce(
    (select a.cidade_destino
       from public.carbo_cidade_alias a
      where a.cidade_origem = public.carbo_normaliza_cidade(p_nome)
        and a.uf = upper(trim(coalesce(p_uf, '')))),
    public.carbo_normaliza_cidade(p_nome)
  )
$$;

comment on function public.carbo_cidade_canonica is
  'Nome de cidade normalizado e com apelido resolvido pela carbo_cidade_alias. É por este nome que o mapa casa com a lista do IBGE.';


-- ── A view, agora casando pelo nome canônico ───────────────────────────────
create or replace view public.mapa_conquista
with (security_invoker = true) as
with vendas as (
  select
    public.carbo_cidade_canonica(
      coalesce(nullif(trim(o.delivery_city), ''), nullif(trim(o.billing_city), '')),
      coalesce(nullif(trim(o.delivery_state), ''), nullif(trim(o.billing_state), ''))
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
  select public.carbo_cidade_canonica(address_city, address_state) as cidade,
         upper(trim(address_state))                               as uf,
         count(*)                                                 as pdvs
  from public.pdvs
  where address_city is not null and address_state is not null
  group by 1, 2
),
por_licenciado as (
  select public.carbo_cidade_canonica(address_city, address_state) as cidade,
         upper(trim(address_state))                               as uf,
         count(*)                                                 as licenciados
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


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) As três precisam ter sumido, e o destino existir com os pedidos somados.
select cidade, uf, pedidos, valor, tem_venda, tem_pdv
from public.mapa_conquista
where (cidade, uf) in (
  ('SAO PAULO','SP'), ('FERNANDO DE NORONHA','PE'), ('SAO GONCALO DO AMARANTE','RN'),
  ('MOOCA','SP'), ('NORONHA','PE'), ('S.G. AMARANTE','RN')
)
order by uf, cidade;

-- (b) O placar. `cidades` deve cair (Mooca fundiu em São Paulo, que já existia);
--     os pedidos totais NÃO podem mudar — de-para reagrupa, não descarta.
select count(*)                                  as cidades,
       count(distinct uf)                        as estados,
       sum(pedidos)                              as pedidos,
       count(*) filter (where conquista_recente) as novas_30_dias
from public.mapa_conquista;
