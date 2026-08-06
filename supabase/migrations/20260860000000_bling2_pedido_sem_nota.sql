-- ═══════════════════════════════════════════════════════════════════════════
-- Bling 2: pedido SEM nota também não é faturamento
--
-- A conferência da migração anterior revelou dois casos que a regra da nota
-- válida ainda não cobria:
--
-- 1. `notaFiscal: {id: 0}` — pedido "Atendido" que NUNCA foi faturado. O Bling
--    usa 0 para "não tem nota". Dois pedidos entraram assim (BLING2-168 e
--    BLING2-116, R$ 209,40 cada).
--
-- 2. Nota que o espelho NUNCA VIU. Eu tinha assumido que as canceladas
--    estavam no espelho com situação velha; estava errado. Elas foram
--    canceladas ANTES do primeiro sync e, como `/nfe` não devolve nota
--    cancelada, nunca entraram. Onze pedidos de um cliente só estão assim.
--
-- ── A regra que faltava ───────────────────────────────────────────────────
--
-- A ponte já exige nota válida para IMPORTAR (join com bling2_nfe). Falta o
-- espelho disso no cancelamento, para o que já entrou:
--
--   • sem nota (id nulo ou 0) → cancela. Não é "não sei ainda": o Bling está
--     dizendo que não existe nota.
--   • nota desconhecida do espelho → NÃO cancela. Aí sim é ausência de
--     informação, e ausência não é prova. Quem resolve é o `nfe_recheck`, que
--     busca a nota pelo id e a traz para o espelho — inclusive cancelada.
--
-- Essa distinção é o ponto todo. Tratar "não tem nota" e "não sei da nota" do
-- mesmo jeito cancelaria venda boa enquanto o recheck não rodasse.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.bling2_bridge_cancelar_sem_nota()
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  with cancelados as (
    update public.carboze_orders o
    set status = 'cancelled', fulfillment_stage = 'cancelado', updated_at = now()
    from public.bling2_orders bo
    where o.external_ref = 'bling2-' || bo.bling_id
      and o.source_file = 'bling2_bridge'
      and o.status <> 'cancelled'
      -- Sem nota, ponto. `nf_bling_id` é coluna gerada do detalhe: nulo quer
      -- dizer que o pedido nem detalhe tem ainda, e aí não se conclui nada.
      and bo.raw_detalhe is not null
      and coalesce(bo.nf_bling_id, 0) = 0
    returning 1
  )
  select count(*) into v_n from cancelados;
  return v_n;
end $$;

comment on function public.bling2_bridge_cancelar_sem_nota is
  'Cancela pedido importado do Bling 2 que o próprio Bling diz não ter nota (notaFiscal.id = 0). Nota apenas desconhecida do espelho NÃO é cancelada — isso é trabalho do nfe_recheck.';


-- ── O cron roda as três ───────────────────────────────────────────────────
do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname = 'bling2-bridge' loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

select cron.schedule(
  'bling2-bridge',
  '25,55 * * * *',
  $cmd$
  select public.bling2_bridge_pedidos_faturados();
  select public.bling2_bridge_completar_entrega();
  select public.bling2_bridge_cancelar_sem_nota();
  $cmd$
);


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

select public.bling2_bridge_cancelar_sem_nota() as cancelados_sem_nota;

-- Onde está cada pedido importado, e por quê. Esta é a foto para acompanhar o
-- recheck: `nota ausente do espelho` deve ir a zero conforme ele roda.
select case
         when o.status = 'cancelled'                    then 'cancelado'
         -- Ordem importa: sem detalhe não se conclui nada sobre a nota, e
         -- rotular isso de "sem nota" faria parecer que o pedido vai cair.
         when bo.raw_detalhe is null                    then 'aguarda detalhe do pedido'
         when coalesce(bo.nf_bling_id, 0) = 0           then 'sem nota (vai cancelar)'
         when nf.id is null                             then 'nota ausente do espelho (aguarda recheck)'
         when public.bling2_nf_e_valida(nf.situacao)    then 'nota válida'
         else                                                'nota inválida: ' || nf.situacao
       end                       as situacao_real,
       count(*)                  as pedidos,
       sum(o.total)              as valor
from public.carboze_orders o
join public.bling2_orders bo on ('bling2-' || bo.bling_id) = o.external_ref
left join public.bling2_nfe nf on nf.bling_id = bo.nf_bling_id
where o.source_file = 'bling2_bridge'
group by 1
order by 3 desc nulls last;
