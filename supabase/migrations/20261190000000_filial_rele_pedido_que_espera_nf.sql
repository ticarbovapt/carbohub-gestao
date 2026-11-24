-- ═══════════════════════════════════════════════════════════════════════════
-- A NF da FILIAL não chegava ao pedido B2B: o pedido nunca era RELIDO
-- (24/11/2026)
--
-- Caso: V2026110001 (GUTOS'S CAR) — NF 000005 série 2 emitida no Bling 2 em
-- 17/11, "Número da venda 3872", e o sistema seguia dizendo "Sem NF" no
-- Faturamento e "Liberado no Faturamento — aguardando NF" no Rastreio.
--
-- O elo é `bling2_orders.nf_bling_id`, coluna GERADA de
-- `raw_detalhe->notaFiscal->id` (20260859). Quem grava `raw_detalhe` é a fase
-- `order_details` do `bling2-sync`, e a fila dela é
-- `items is null or raw_detalhe is null` — ou seja, cada pedido é lido UMA vez.
--
--   pedido B2B nasce (03/11)  → lido em minutos, ainda SEM nota
--   nota emitida (17/11)      → o pedido nunca mais é relido
--   nf_bling_id               → nulo para sempre; o passo 1 da
--                               `carbo_vincula_nf_filial` não acha a nota
--
-- No on-line isso não aparece porque a nota sai antes da primeira leitura.
-- O passo 2 (rodapé) só cobre a nota cujo rodapé cita o V… E cuja natureza já
-- foi lida — os dois podem faltar.
--
-- A correção: a cada 10 min, os pedidos DO NOSSO SISTEMA na filial
-- (`external_ref 'bling2-<id>'`) que ainda esperam nota voltam para a fila do
-- `order_details` (`raw_detalhe = null`), no máximo uma vez a cada 30 min por
-- pedido (6 h depois de 30 dias). O `order_details` relê, o `nf_bling_id`
-- aparece, e a `carbo_vincula_nf_filial` (*/5) liga a nota — o gatilho do
-- Rastreio avança o card sozinho.
--
-- ⚠️ Só pedido do NOSSO sistema (V…/PED-…), nunca o on-line: esses alimentam
-- a esteira, que lê `raw_detalhe` (endereço, transporte). Os nossos são de
-- loja 0 e não estão lá.
-- ⚠️ Sem edge function nova e sem deploy: o `order_details` já relê o que tem
-- `raw_detalhe` nulo. Volta = desligar o cron.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.carbo_bling2_releitura (
  bling_id   bigint primary key,
  relido_em  timestamptz not null default now(),
  vezes      int not null default 1
);
alter table public.carbo_bling2_releitura enable row level security;
comment on table public.carbo_bling2_releitura is
  'Quando o pedido da filial foi devolvido à fila do order_details por esperar NF (20261190). Só o cron escreve.';

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
       and coalesce(o.status, '') not in ('quote', 'cancelled')
       and o.created_at > now() - interval '90 days'
       and bo.nf_bling_id is null
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

comment on function public.carbo_bling2_reler_pedidos_sem_nf(int) is
  'Devolve à fila do order_details (raw_detalhe = null) os pedidos do NOSSO sistema na filial que ainda esperam NF, para o nf_bling_id aparecer (20261190).';

revoke execute on function public.carbo_bling2_reler_pedidos_sem_nf(int) from anon, public, authenticated;
grant execute on function public.carbo_bling2_reler_pedidos_sem_nf(int) to service_role;

-- ── O cron: :01, antes do order_details (:03) ─────────────────────────────
do $$
declare j bigint;
begin
  for j in select jobid from cron.job where jobname = 'bling2-reler-pedido-sem-nf-10min' loop
    perform cron.unschedule(j);
  end loop;
  perform cron.schedule('bling2-reler-pedido-sem-nf-10min', '1-59/10 * * * *',
                        $cmd$select public.carbo_bling2_reler_pedidos_sem_nf()$cmd$);
end $$;
