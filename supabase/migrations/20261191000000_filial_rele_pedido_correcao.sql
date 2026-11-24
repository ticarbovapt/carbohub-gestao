-- ═══════════════════════════════════════════════════════════════════════════
-- Correção da 20261190 (24/11/2026), medida no primeiro uso:
--
-- 1. `carboze_orders.status` é ENUM (`order_status`): `coalesce(o.status, '')`
--    dá 22P02 ("invalid input value for enum order_status") e o cron falharia
--    em TODA rodada. Hoje é `o.status::text`.
-- 2. O Bling devolve `notaFiscal.id = 0` — não nulo — no pedido sem nota
--    (V2026110001: `nf_bling_id = 0`). `is null` nunca o pegaria. Hoje é
--    `coalesce(nf_bling_id, 0) = 0`.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.carbo_bling2_reler_pedidos_sem_nf(p_limite int default 40)
returns int
language plpgsql
set search_path = public
as $$
declare
  v_ids bigint[];
begin
  select array_agg(c.bling_id) into v_ids
  from (
    select bo.bling_id
      from public.carboze_orders o
      join public.bling2_orders bo
        on bo.bling_id = nullif(replace(o.external_ref, 'bling2-', ''), '')::bigint
      left join public.carbo_bling2_releitura r on r.bling_id = bo.bling_id
     where o.bling_conta = 2
       and o.external_ref ~ '^bling2-[0-9]+$'
       and o.bling2_nf_id is null
       and coalesce(o.status::text, '') not in ('quote', 'cancelled')
       and o.created_at > now() - interval '90 days'
       and coalesce(bo.nf_bling_id, 0) = 0     -- o Bling devolve 0, não nulo
       and bo.raw_detalhe is not null          -- nulo já está na fila
       and coalesce(bo.situacao_id, 0) <> 12   -- cancelado no Bling
       and (r.relido_em is null
            or r.relido_em < now() - case when o.created_at > now() - interval '30 days'
                                          then interval '30 minutes'
                                          else interval '6 hours' end)
     order by r.relido_em nulls first, o.created_at desc
     limit greatest(1, least(coalesce(p_limite, 40), 200))
  ) c;

  if v_ids is null then
    return 0;
  end if;

  update public.bling2_orders
     set raw_detalhe = null
   where bling_id = any(v_ids);

  insert into public.carbo_bling2_releitura as x (bling_id, relido_em, vezes)
  select unnest(v_ids), now(), 1
  on conflict (bling_id) do update
    set relido_em = now(), vezes = x.vezes + 1;

  return cardinality(v_ids);
end $$;

revoke execute on function public.carbo_bling2_reler_pedidos_sem_nf(int) from anon, public, authenticated;
grant execute on function public.carbo_bling2_reler_pedidos_sem_nf(int) to service_role;
