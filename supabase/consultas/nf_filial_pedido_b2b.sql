-- ─────────────────────────────────────────────────────────────────────────────
-- NF da FILIAL (Bling 2) que não chega ao pedido B2B — SÓ LEITURA.
-- Rode UM bloco por vez (o SQL Editor mostra só o último resultado).
-- Contexto: 20261190 (o pedido passa a ser relido enquanto espera nota).
-- ─────────────────────────────────────────────────────────────────────────────

-- BLOCO 1 — Os pedidos e o que o espelho do Bling 2 sabe deles.
--   nf_no_pedido_do_bling nulo + tem_detalhe true  = o defeito (lido antes da nota)
--   tem_detalhe false                              = na fila, relido em até 10 min
--   nf_no_pedido_do_bling preenchido + bling2_nf_id nulo = falta o vínculo (*/5)
select o.order_number, o.external_ref, o.bling_conta, o.status, o.fulfillment_stage,
       o.bling2_nf_id, o.invoice2_number,
       bo.numero                   as pedido_no_bling,
       bo.situacao_valor           as situacao_no_bling,
       bo.raw_detalhe is not null  as tem_detalhe,
       bo.nf_bling_id              as nf_no_pedido_do_bling,
       r.relido_em, r.vezes
  from public.carboze_orders o
  left join public.bling2_orders bo
    on bo.bling_id = nullif(replace(o.external_ref, 'bling2-', ''), '')::bigint
  left join public.carbo_bling2_releitura r on r.bling_id = bo.bling_id
 where o.order_number in ('V2026110001', 'V2026110025');

-- BLOCO 2 — As notas desses clientes no espelho (GUTOS'S pelo CNPJ, CASSIO pelo nome).
--   situacao precisa ser Autorizada / Emitida DANFE / Registrada.
select nf.bling_id, nf.numero, nf.serie, nf.situacao, nf.data_emissao, nf.contato_nome,
       nf.valor_total, nf.natureza_operacao,
       nf.informacoes_adicionais ~* 'V2026110001|V2026110025' as rodape_cita_o_pedido
  from public.bling2_nfe nf
 where regexp_replace(coalesce(nf.contato_cnpj, ''), '\D', '', 'g') = '51835767000171'
    or nf.contato_nome ilike 'CASSIO%'
 order by nf.data_emissao desc;

-- BLOCO 3 — Quantos pedidos da filial estão nessa situação HOJE (o tamanho do problema).
select count(*) filter (where bo.raw_detalhe is not null and bo.nf_bling_id is null) as lidos_antes_da_nota,
       count(*) filter (where bo.raw_detalhe is null)                                 as na_fila_agora,
       count(*) filter (where bo.nf_bling_id is not null)                             as nota_no_pedido_sem_vinculo,
       count(*)                                                                        as pedidos_esperando_nf
  from public.carboze_orders o
  join public.bling2_orders bo
    on bo.bling_id = nullif(replace(o.external_ref, 'bling2-', ''), '')::bigint
 where o.bling_conta = 2
   and o.external_ref ~ '^bling2-[0-9]+$'
   and o.bling2_nf_id is null
   and coalesce(o.status, '') not in ('quote', 'cancelled')
   and o.created_at > now() - interval '90 days';

-- BLOCO 4 — O cron está de pé e rodando sem erro (SQL puro: aqui `succeeded` vale).
select j.jobname, j.schedule, j.active,
       (select max(d.start_time) from cron.job_run_details d where d.jobid = j.jobid) as ultima,
       (select d.status from cron.job_run_details d where d.jobid = j.jobid
         order by d.start_time desc limit 1)                                         as status
  from cron.job j
 where j.jobname = 'bling2-reler-pedido-sem-nf-10min';
