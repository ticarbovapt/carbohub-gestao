-- ═══════════════════════════════════════════════════════════════════════════
-- Pedidos que a ponte do Bling 2 cancelou com a nota ainda em autorização
-- (antes da 20261202). SÓ LÊ.
--
-- O critério: pedido V… cancelado SEM usuário, mudando só status + etapa (a
-- assinatura da ponte), e cuja nota da filial hoje é VÁLIDA e o pedido no
-- Bling 2 não está cancelado (situação 12). `etapa_antes` é para onde
-- arrastar o card no Rastreio do Ops — reabrir é ação de gente
-- (`trg_carbo_cancelamento_nao_ressuscita` recusa a rotina).
-- ═══════════════════════════════════════════════════════════════════════════
select o.order_number, o.customer_name, o.total,
       to_char(a.created_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as cancelado_em,
       a.before_data->>'fulfillment_stage' as etapa_antes,
       nf.numero as nf, nf.situacao as situacao_nf, bo.situacao_id as situacao_pedido_bling2
  from public.order_audit_logs a
  join public.carboze_orders o on o.id = a.record_id
  join public.bling2_orders bo on o.external_ref = 'bling2-' || bo.bling_id
  left join public.bling2_nfe nf on nf.bling_id = bo.nf_bling_id
 where a.table_name = 'carboze_orders'
   and a.action = 'UPDATE'
   and a.user_id is null
   and a.after_data->>'status' = 'cancelled'
   and a.before_data->>'status' is distinct from 'cancelled'
   and o.status = 'cancelled'
   and o.order_number like 'V%'
   and bo.situacao_id is distinct from 12
   and public.bling2_nf_e_valida(nf.situacao)
   and a.created_at > now() - interval '60 days'
 order by a.created_at desc;
