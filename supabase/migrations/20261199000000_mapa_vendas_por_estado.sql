-- ═══════════════════════════════════════════════════════════════════════════
-- Mapa da Conquista: VENDAS POR ESTADO (26/11/2026)
--
-- Pedido do dono do processo: navegar por estado e ver o ranking de vendas —
-- cidades, quantidade de pedidos, de produtos, por tipo (kit 100ml, kit sachê,
-- avulsa…) — SEPARANDO B2B de on-line. O motivo é logística: se o Nordeste
-- compra proporcionalmente mais, despachar de Natal pode sair mais barato que
-- do CD de SP, e hoje isso não se mede.
--
-- `carbo_mapa_vendas(de, ate, uf)` devolve jsonb, agregado no BANCO:
--   estados   uma linha por UF, cada número em B2B e on-line SEPARADOS
--   cidades   as cidades da UF pedida (nulo = nenhuma)
--   produtos  por canal × produto × embalagem, na UF pedida ou no Brasil
--
-- ⚠️ O canal vem SEPARADO em toda linha e a TELA escolhe (Tudo · B2B ·
-- On-line). É o que impede o número mascarado: 100 mil unidades onde 99 mil
-- são B2B. On-line = `segmento = 'online'` (a mesma régua do
-- `FILTRO_VENDA_DO_TIME`); o resto é B2B.
--
-- ⚠️ A mesma base do mapa (`mapa_conquista`): pedido fora de orçamento e
-- cancelado, sem `excluir_metricas`, cidade de entrega (senão a de cobrança)
-- pela `carbo_cidade_canonica`, data = `coalesce(sale_date, created_at)`.
-- On-line só existe aqui quando o pedido atravessou do Bling (faturado).
--
-- ⚠️ UNIDADES: o item vira produto do CATÁLOGO, nesta ordem:
--   1. `product_id` (venda do /vender) → o produto; gêmeo de bonificação e
--      faixa de preço sobem ao PAI (a regra de `carbo_itens_para_estoque`).
--   2. `product_code` no mapa de SKU (`sku_product_mappings`, ativo; o
--      genérico — plataforma nula — vence; sem ele, só se todas as linhas
--      concordarem) → produto + embalagem (`display_units_per_pack`: o kit de
--      5 frascos são 5 unidades, o de sachês são 10). É o que o cliente LEVOU.
--   3. `product_code` igual ao código de UM produto do catálogo.
--   4. nada casou: fica com o NOME do item e `conhecido = false` — conta 1 por
--      item, e a tela diz quais são (ausência não vira resposta).
--   Serviço (descarbonização) não é unidade de produto: vem à parte.
--   Quantidade = `quantity` + `bonificacao` legado (o brinde também viaja).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.carbo_mapa_vendas(p_de date, p_ate date, p_uf text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uf  text := nullif(upper(trim(coalesce(p_uf, ''))), '');
  v_out jsonb;
begin
  -- A mesma porta do app Admin, onde a tela mora. Recusa FALA: devolver vazio
  -- faria "sem acesso" parecer "não vendemos nada".
  if not coalesce((select public.carbo_tem_app(array['carbo_admin'])), false) then
    raise exception 'sem acesso às vendas do mapa' using errcode = '42501';
  end if;
  if p_de is null or p_ate is null or p_de > p_ate then
    raise exception 'período inválido' using errcode = '22023';
  end if;

  with ped as (
    select o.id,
           public.carbo_cidade_canonica(
             coalesce(nullif(trim(o.delivery_city), ''), nullif(trim(o.billing_city), '')),
             coalesce(nullif(trim(o.delivery_state), ''), nullif(trim(o.billing_state), ''))) as cidade,
           upper(coalesce(nullif(trim(o.delivery_state), ''), nullif(trim(o.billing_state), ''))) as uf,
           coalesce(o.total, 0) as valor,
           coalesce(o.segmento, '') = 'online' as online,
           o.items
      from public.carboze_orders o
     where o.status::text not in ('quote', 'cancelled')
       and coalesce(o.excluir_metricas, false) = false
       and coalesce(o.sale_date, o.created_at::date) between p_de and p_ate
  ),
  p as (
    select * from ped where cidade is not null and uf ~ '^[A-Z]{2}$'
  ),
  itens as (
    select p.id as pedido, p.uf, p.cidade, p.online,
           nullif(trim(it->>'product_id'), '') as pid,
           nullif(trim(it->>'product_code'), '') as codigo,
           coalesce(nullif(trim(it->>'name'), ''), nullif(trim(it->>'product_name'), ''),
                    nullif(trim(it->>'descricao'), ''), 'Item sem nome') as nome,
           (case when (it->>'quantity') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then (it->>'quantity')::numeric else 0 end
            + case when (it->>'bonificacao') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then (it->>'bonificacao')::numeric else 0 end) as qtd,
           case when (it->>'total') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then (it->>'total')::numeric else 0 end as valor_item,
           coalesce(it->>'kind', '') = 'service' as servico
      from p
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(p.items) = 'array' then p.items else '[]'::jsonb end) it
  ),
  sku as (
    select s.platform_sku as codigo,
           case when count(*) filter (where s.platform is null) = 1
                  then (array_agg(s.product_id) filter (where s.platform is null))[1]
                when count(distinct s.product_id) = 1
                  then (array_agg(s.product_id))[1] end as product_id,
           case when count(*) filter (where s.platform is null) = 1
                  then (array_agg(coalesce(s.display_units_per_pack, s.unidades_por_venda, s.units_per_kit))
                          filter (where s.platform is null))[1]
                when count(distinct coalesce(s.display_units_per_pack, s.unidades_por_venda, s.units_per_kit)) = 1
                  then max(coalesce(s.display_units_per_pack, s.unidades_por_venda, s.units_per_kit)) end as pack
      from public.sku_product_mappings s
     where coalesce(s.is_active, true)
     group by s.platform_sku
  ),
  cod as (
    select m.product_code as codigo, (array_agg(m.id))[1] as product_id
      from public.mrp_products m
     where nullif(trim(m.product_code), '') is not null
     group by m.product_code
    having count(*) = 1
  ),
  res as (
    select i.*,
           coalesce(p1.id, sk.product_id, c.product_id) as prod,
           case when p1.id is null and sk.product_id is not null then coalesce(sk.pack, 1) else 1 end as pack
      from itens i
      left join public.mrp_products p1
             on p1.id = case when i.pid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                             then i.pid::uuid end
      left join sku sk on p1.id is null and sk.codigo = i.codigo
      left join cod c  on p1.id is null and sk.product_id is null and c.codigo = i.codigo
  ),
  res2 as (
    select r.*,
           pai.id as pai_id,
           coalesce(pai.name, r.nome) as produto,
           (pai.id is not null) as conhecido,
           r.qtd * r.pack as unidades
      from res r
      left join public.mrp_products m   on m.id = r.prod
      left join public.mrp_products pai on pai.id = coalesce(m.bonificacao_de, m.preco_de, m.id)
  ),
  un_ped as (
    select pedido, sum(unidades) filter (where not servico) as unidades
      from res2 group by pedido
  ),
  pu as (
    select p.*, coalesce(u.unidades, 0) as unidades
      from p left join un_ped u on u.pedido = p.id
  ),
  estados as (
    select uf,
           case when uf in ('AC','AM','AP','PA','RO','RR','TO') then 'Norte'
                when uf in ('AL','BA','CE','MA','PB','PE','PI','RN','SE') then 'Nordeste'
                when uf in ('DF','GO','MS','MT') then 'Centro-Oeste'
                when uf in ('ES','MG','RJ','SP') then 'Sudeste'
                when uf in ('PR','RS','SC') then 'Sul' end as regiao,
           count(*) filter (where not online)                 as pedidos_b2b,
           count(*) filter (where online)                     as pedidos_online,
           coalesce(round(sum(valor) filter (where not online), 2), 0)     as valor_b2b,
           coalesce(round(sum(valor) filter (where online), 2), 0)         as valor_online,
           coalesce(sum(unidades) filter (where not online), 0)            as unidades_b2b,
           coalesce(sum(unidades) filter (where online), 0)                as unidades_online,
           count(distinct cidade) filter (where not online)   as cidades_b2b,
           count(distinct cidade) filter (where online)       as cidades_online,
           count(distinct cidade)                             as cidades
      from pu group by uf
  ),
  cidades as (
    select cidade,
           count(*) filter (where not online)             as pedidos_b2b,
           count(*) filter (where online)                 as pedidos_online,
           coalesce(round(sum(valor) filter (where not online), 2), 0) as valor_b2b,
           coalesce(round(sum(valor) filter (where online), 2), 0)     as valor_online,
           coalesce(sum(unidades) filter (where not online), 0)        as unidades_b2b,
           coalesce(sum(unidades) filter (where online), 0)            as unidades_online
      from pu where v_uf is not null and uf = v_uf
     group by cidade
  ),
  produtos as (
    select case when online then 'online' else 'b2b' end as canal,
           coalesce(pai_id::text, 'nome:' || lower(produto)) as chave,
           min(produto)                         as produto,
           pack, servico, conhecido,
           min(codigo)                          as codigo,
           count(distinct pedido)               as pedidos,
           sum(qtd)                             as quantidade,
           sum(unidades)                        as unidades,
           round(sum(valor_item), 2)            as valor
      from res2
     where v_uf is null or uf = v_uf
     group by 1, 2, pack, servico, conhecido
  )
  select jsonb_build_object(
    'estados',  coalesce((select jsonb_agg(to_jsonb(e) order by e.uf) from estados e), '[]'::jsonb),
    'cidades',  case when v_uf is null then null
                     else coalesce((select jsonb_agg(to_jsonb(c) order by c.cidade) from cidades c), '[]'::jsonb) end,
    'produtos', coalesce((select jsonb_agg(to_jsonb(x) order by x.canal, x.unidades desc, x.produto) from produtos x), '[]'::jsonb),
    'uf',       v_uf,
    'de',       p_de,
    'ate',      p_ate
  ) into v_out;

  return v_out;
end;
$$;

comment on function public.carbo_mapa_vendas(date, date, text) is
  'Mapa da Conquista · Vendas por estado: estados (B2B e on-line separados), cidades da UF pedida e '
  'produtos por canal × produto × embalagem. Agregado no banco, jsonb. Guarda: app Admin (20261199).';

revoke execute on function public.carbo_mapa_vendas(date, date, text) from anon, public;
grant execute on function public.carbo_mapa_vendas(date, date, text) to authenticated, service_role;

notify pgrst, 'reload schema';
