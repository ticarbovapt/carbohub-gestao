-- 20261158 — o robô da esteira só recalcula o que MUDOU DE VERDADE (16/11/2026)
--
-- Medido em produção após a 20261157: o robô detectava ~622 cartões POR MINUTO,
-- todo minuto. O `bling2-sync-incremental` (1 min) regrava ~500 pedidos e ~520
-- notas recentes sem mudar nada, e `synced_at` anda mesmo assim. A 100× seriam
-- dezenas de milhares por minuto. Hoje o robô compara uma IMPRESSÃO dos campos
-- que o cartão lê (pedido + nota) com a que guardou da última vez.
--
-- ⚠️ Campo NOVO do pedido/nota que passe a mudar o cartão precisa entrar em
-- `carbo_esteira_hash_fonte`, senão o robô não vê a mudança (só a varredura de
-- 30 min dos cartões abertos a pega).
-- Volta: recriar o robô pelo BLOCO 2 da 20261157 (a impressão fica, sem uso).

create table if not exists public.carbo_esteira_hash (
  bling_id bigint primary key,
  h        text not null
);
alter table public.carbo_esteira_hash enable row level security;
revoke all on public.carbo_esteira_hash from public, anon, authenticated;

create or replace function public.carbo_esteira_hash_fonte(p_ids bigint[])
returns table (bling_id bigint, h text)
language sql stable security definer set search_path = public as $$
  select bo.bling_id,
         md5(concat_ws('|',
           bo.numero_loja, bo.loja_id::text, bo.situacao_id::text, bo.total::text,
           bo.numero::text, bo.nf_bling_id::text, bo.data::text, bo.contato_nome,
           bo.contato_id::text, bo.items::text, (bo.raw_detalhe -> 'transporte')::text,
           nf.situacao::text, nf.pdf_url::text, nf.numero::text, nf.id::text,
           nf.data_emissao::text, nf.chave_acesso::text))
    from public.bling2_orders bo
    left join public.bling2_nfe nf on nf.bling_id = bo.nf_bling_id
   where bo.bling_id = any (p_ids)
$$;
revoke all on function public.carbo_esteira_hash_fonte(bigint[]) from public, anon, authenticated;

-- impressão do que já está nos cartões (uma vez)
insert into public.carbo_esteira_hash (bling_id, h)
select f.bling_id, f.h
  from public.carbo_esteira_hash_fonte((select coalesce(array_agg(bling_id), '{}') from public.carbo_esteira_cards where bling_id > 0)) f
on conflict (bling_id) do nothing;

create or replace function public.carbo_esteira_atualizar(p_limite int default 3000, p_varredura int default 1500)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ini    timestamptz := clock_timestamp();
  v_desde  timestamptz;
  v_det    int := 0;
  v_n      int;
  v_k      int := 0;
  v_antes  int;
  v_ids    bigint[];
  v_depois int;
begin
  if not pg_try_advisory_xact_lock(hashtext('carbo_esteira_atualizar')) then
    return jsonb_build_object('pulou', true);
  end if;

  select ultima_leitura into v_desde from carbo_esteira_estado where id;
  v_desde := coalesce(v_desde, now() - interval '15 minutes') - interval '2 minutes';

  -- pedido e nota da filial: só entra quem MUDOU (impressão diferente da guardada)
  with cand as (
    select bling_id as id from bling2_orders where synced_at >= v_desde
    union
    select o.bling_id from bling2_nfe n join bling2_orders o on o.nf_bling_id = n.bling_id where n.synced_at >= v_desde
  ), h as (
    select * from carbo_esteira_hash_fonte((select coalesce(array_agg(id), '{}') from cand))
  )
  insert into carbo_esteira_pendentes (bling_id)
  select h.bling_id from h left join carbo_esteira_hash k on k.bling_id = h.bling_id
   where k.h is distinct from h.h
  on conflict do nothing;
  get diagnostics v_n = row_count; v_det := v_det + v_n;

  insert into carbo_esteira_pendentes (bling_id)
  select distinct id from (
    select bling_id as id from melhorenvio_envios where atualizado_em >= v_desde and bling_id is not null
    union all
    select bling_id from rastreio_envios where consultado_em >= v_desde and bling_id is not null
    union all
    select bling_id from carbo_pedido_codigo where criado_em >= v_desde
    union all
    select substring(external_ref from 8)::bigint from carboze_orders
     where created_at >= v_desde and external_ref like 'bling2-%' and substring(external_ref from 8) ~ '^[0-9]{1,15}$'
    union all
    select o.bling_id from ecommerce_orders e join bling2_orders o on o.numero_loja = e.platform_order_number
     where e.synced_at >= v_desde
    union all
    select o.bling_id from ecommerce_orders e
      join bling2_orders o on left(o.numero_loja, 5) = 'PAYT_' and split_part(o.numero_loja, '_', 3) = split_part(e.order_id, '-', 1)
     where e.synced_at >= v_desde and e.platform = 'payt'
    union all
    select o.bling_id from bling2_contacts c
      join bling2_orders o on o.contato_id = c.bling_id
      join carbo_esteira_cards k on k.bling_id = o.bling_id and k.etapa not in ('entregue', 'cancelado')
     where c.updated_at >= v_desde
    union all
    select - bling_id from bling_orders where synced_at >= v_desde
    union all
    select - substring(c.external_ref from 7)::bigint from bling_nfe n join carboze_orders c on c.id = n.order_id
     where n.synced_at >= v_desde and c.external_ref like 'bling-%' and substring(c.external_ref from 7) ~ '^[0-9]{1,15}$'
    union all
    select - b.bling_id from ecommerce_orders e join bling_orders b on b.numero_loja = e.platform_order_number
     where e.synced_at >= v_desde
    union all
    select bling_id from (select bling_id from bling2_orders
                           where bling_id > (select coalesce(max(bling_id), 0) from carbo_esteira_cards)
                           order by bling_id limit 5000) novos
  ) q
  on conflict do nothing;
  get diagnostics v_n = row_count; v_det := v_det + v_n;

  insert into carbo_esteira_pendentes (bling_id)
  select bling_id from carbo_esteira_cards
   where etapa not in ('entregue', 'cancelado') and calculado_em < now() - interval '30 minutes'
   order by calculado_em limit p_varredura
  on conflict do nothing;

  select count(*) into v_antes from carbo_esteira_pendentes;

  select coalesce(array_agg(bling_id), '{}') into v_ids from (
    select q.bling_id
      from carbo_esteira_pendentes q
      left join carbo_esteira_cards c on c.bling_id = q.bling_id
     order by (c.etapa in ('entregue', 'cancelado')) nulls first, q.desde, q.bling_id
     limit p_limite) s;

  if cardinality(v_ids) > 0 then
    delete from carbo_esteira_cards where bling_id = any (v_ids);
    insert into carbo_esteira_cards
      select x.*, now() from carbo_esteira_calcular(v_ids) x;
    insert into carbo_esteira_hash (bling_id, h)
      select f.bling_id, f.h from carbo_esteira_hash_fonte(v_ids) f
      on conflict (bling_id) do update set h = excluded.h;
    delete from carbo_esteira_pendentes where bling_id = any (v_ids);
    v_k := cardinality(v_ids);
  end if;

  update carbo_esteira_estado set ultima_leitura = v_ini where id;
  select count(*) into v_depois from carbo_esteira_pendentes;

  insert into carbo_esteira_atualizacao_log (detectados, pendentes_antes, processados, pendentes_depois, ms)
  values (v_det, v_antes, v_k, v_depois, (extract(epoch from clock_timestamp() - v_ini) * 1000)::int);
  delete from carbo_esteira_atualizacao_log where em < now() - interval '7 days';

  return jsonb_build_object('detectados', v_det, 'processados', v_k, 'pendentes', v_depois);
end $$;
revoke all on function public.carbo_esteira_atualizar(int, int) from public, anon, authenticated;
