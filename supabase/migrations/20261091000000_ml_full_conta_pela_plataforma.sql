-- =====================================================================
-- ML Full conta no faturamento pelo status da PLATAFORMA (16/10/2026).
--
-- Medido na auditoria 20261089 (01/06 a 16/10): 223 pedidos do ML Full,
-- R$ 29.398,46, FORA do Dashboard Comercial com `aguardando_nf`. Não falta
-- nota: o ML emite a NF do Full dentro do próprio ML. No Bling 1 o pedido
-- fica em "Em andamento" (situação 15 → status 'confirmed') para sempre, e
-- sem NF no Bling a `carbo_vendas_metrica` não o conta.
--
-- Decisão do dono do processo: *"podemos contar a deles mesmo sem a nota como
-- exceção, desde que se tiver pedido cancelado, cancele também no sistema e
-- pare de contar faturamento errado"*.
--
-- O desenho NÃO mexe na view do faturamento: ela JÁ conta pedido sem NF quando
-- o status é invoiced/shipped/delivered. O que muda é QUEM decide o status:
--   bling_lojas.plataforma_fatura    CADASTRO: a loja cuja nota sai na plataforma
--   carbo_status_pela_plataforma()   o status vem do ecommerce_orders (cron 10 min)
--   bling-sync                       deixa de regravar status/etapa dessas lojas
--
-- Regras:
--   todas as linhas canceladas/estornadas na plataforma  → cancelled (sai do faturamento)
--   alguma entregue → delivered · enviada → shipped · paga → invoiced
--   pendente na plataforma → não mexe
-- ⚠️ Só AVANÇA (invoiced < shipped < delivered), e cancelado NUNCA reabre.
-- ⚠️ Nunca volta a 'confirmed': essa transição dispara geração de OP e baixa
-- de estoque de PDV. Por isso o `bling-sync` precisa estar deployado ANTES
-- (push em main) — senão ele regravaria 'confirmed' na rodada seguinte.
-- =====================================================================

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o cadastro e a função (não muda pedido nenhum ainda)     ║
-- ╚═══════════════════════════════════════════════════════════════════╝
alter table public.bling_lojas add column if not exists plataforma_fatura text;
comment on column public.bling_lojas.plataforma_fatura is
  'Plataforma (ecommerce_orders.platform) que EMITE a nota destes pedidos fora do Bling — ex.: mercadolivre_full. Preenchida: o status do pedido vem da plataforma (carbo_status_pela_plataforma) e o bling-sync não o regrava. Nula: o Bling manda, como sempre.';

update public.bling_lojas set plataforma_fatura = 'mercadolivre_full' where bling_id = 206270703;

create or replace function public.carbo_status_pela_plataforma(p_aplicar boolean default false)
returns table (pedido text, numero_loja text, status_atual text, status_novo text, total numeric)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  return query
  with alvo as (
    select o.id, o.order_number, o.status::text as status_atual, o.total,
           b1.numero_loja, l.plataforma_fatura
      from public.carboze_orders o
      join public.bling_orders b1 on o.external_ref = 'bling-' || b1.bling_id
      join public.bling_lojas  l  on (b1.raw_data -> 'loja' ->> 'id') ~ '^[0-9]+$'
                                 and l.bling_id = (b1.raw_data -> 'loja' ->> 'id')::bigint
     where l.plataforma_fatura is not null
       and o.order_number like 'BLING-%'
       and o.status::text not in ('cancelled', 'quote')
       and nullif(btrim(b1.numero_loja), '') is not null
  ), estado as (
    select a.id, a.order_number, a.status_atual, a.total, a.numero_loja,
           case
             -- ⚠️ Lista EXPLÍCITA, nunca "não é venda": pendente também não é
             -- venda, e cancelaria pedido que ainda vai ser pago.
             when bool_and(lower(coalesce(e.status, '')) in ('cancelled', 'refunded', 'voided')) then 'cancelled'
             when bool_or(lower(e.status) = 'delivered') then 'delivered'
             when bool_or(lower(e.status) = 'shipped')   then 'shipped'
             when bool_or(public.ecommerce_status_e_venda(e.status)) then 'invoiced'
           end as novo
      from alvo a
      join public.ecommerce_orders e
        on e.platform = a.plataforma_fatura and e.platform_order_number = a.numero_loja
     group by a.id, a.order_number, a.status_atual, a.total, a.numero_loja
  ), mudar as (
    select * from estado
     where novo is not null and novo <> status_atual
       and (novo = 'cancelled'
            or (case novo when 'invoiced' then 1 when 'shipped' then 2 when 'delivered' then 3 end)
               > (case status_atual when 'invoiced' then 1 when 'shipped' then 2 when 'delivered' then 3 else 0 end))
  ), feito as (
    update public.carboze_orders o
       set status            = m.novo::order_status,
           fulfillment_stage = case m.novo when 'delivered' then 'entregue'
                                           when 'shipped'   then 'em_transporte'
                                           when 'invoiced'  then 'separado'
                                           when 'cancelled' then 'cancelado' end,
           updated_at        = now()
      from mudar m
     where p_aplicar and o.id = m.id
    returning o.id
  )
  select m.order_number, m.numero_loja, m.status_atual, m.novo, m.total from mudar m
   order by m.novo, m.order_number;
end $$;

revoke execute on function public.carbo_status_pela_plataforma(boolean) from public, anon, authenticated;

comment on function public.carbo_status_pela_plataforma(boolean) is
  'Status de pedido BLING-* de loja com plataforma_fatura vem da PLATAFORMA (ecommerce_orders): cancelado lá cancela aqui; entregue/enviado/pago avança. Só avança, nunca volta a confirmed (dispara OP e estoque de PDV) e nunca reabre cancelado. p_aplicar=false é o ENSAIO: devolve o que mudaria sem mudar. Ver 20261091.';

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — ENSAIO: o que mudaria (não grava nada)                   ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: ~220 pedidos do Full de 'confirmed' para delivered/shipped/
-- invoiced, e alguns para 'cancelled'. Pedido indo para cancelled = venda que
-- o ML cancelou e que hoje o sistema ainda trata como viva.
select status_atual, status_novo, count(*) as pedidos, round(sum(total), 2) as valor
  from public.carbo_status_pela_plataforma(false)
 group by 1, 2
 order by 2, 1;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — aplica, e agenda a cada 10 min                           ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ⚠️ SÓ DEPOIS de o Actions "Deploy Edge Functions" terminar (o bling-sync
-- novo no ar). Minuto :17 — ímpar e fora da grade cheia.
select count(*) as pedidos_atualizados from public.carbo_status_pela_plataforma(true);

do $cron$
declare j bigint;
begin
  for j in select jobid from cron.job where jobname = 'carbo-status-pela-plataforma-10min' loop
    perform cron.unschedule(j);
  end loop;
  perform cron.schedule('carbo-status-pela-plataforma-10min', '17-59/10 * * * *',
    'select count(*) from public.carbo_status_pela_plataforma(true);');
end $cron$;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA — o ML Full no faturamento                             ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: o grosso em conta_metrica = true (sem motivo), os cancelados em
-- 'cancelado', e só sobra 'aguardando_nf' em pedido que a plataforma não
-- conhece (anterior à conexão da conta) ou ainda pendente.
select v.conta_metrica, v.motivo_fora, v.status::text,
       count(*) as pedidos, round(sum(v.total), 2) as valor
  from public.carbo_vendas_metrica v
  join public.bling_orders b1 on v.external_ref = 'bling-' || b1.bling_id
 where (b1.raw_data -> 'loja' ->> 'id') = '206270703'
   and v.data_efetiva between date '2026-06-01' and date '2026-10-16'
 group by 1, 2, 3
 order by 4 desc;
