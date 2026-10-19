-- ═══════════════════════════════════════════════════════════════════════════
-- 20261107 — A NF da filial parava de ir e voltar a cada 5 minutos
--
-- Achado medindo o peso da auditoria (`20261106`, bloco G), 19/10/2026:
--
--   bling2_nf_id · invoice2_number · nf2_access_key   16.056 mudanças em 7 dias
--   updated_at                                          8.474  ← exatamente METADE
--
-- As três colunas mudam SEMPRE juntas, ~2.300 vezes por dia, desde antes de
-- 05/10. E o `updated_at` mudar só na metade das vezes é a assinatura do
-- mecanismo: dois updates na MESMA transação (o `now()` é o mesmo nos dois, e
-- o segundo não muda nada no carimbo).
--
-- É a `carbo_vincula_nf_filial()` (cron `vincula-nf-filial`, */5):
--
--   PASSO 1  pedido com external_ref 'bling2-<id>' cujo pedido no Bling NÃO
--            tem nota (`bling2_orders.nf_bling_id` nulo) cai no `elsif` e o
--            vínculo é APAGADO — "não achei nota pelo pedido" era tratado
--            igual a "a nota foi cancelada".
--   PASSO 2  o rodapé da nota cita o pedido (V2026…) e o vínculo VOLTA.
--
-- Por pedido nessa situação, a cada 5 minutos: um apagar e um religar. ~4
-- pedidos × 288 rodadas × 2 = os 2.300 por dia. Quem olha a tela não vê nada
-- (a transação termina com o vínculo de volta), mas o custo era real:
--
--   · 266 MB de auditoria em 3 meses — cada update grava o pedido INTEIRO,
--     antes e depois, e este era ~97% de tudo o que a auditoria grava sozinha;
--   · `carboze_orders` está no Realtime: dois eventos por pedido a cada 5 min,
--     e cada um faz as telas do Rastreio recarregarem;
--   · o gatilho que avança o card com a NF da filial reage à passagem de nulo
--     para preenchido — e ela acontecia a cada rodada.
--
-- ⚠️ E um risco que não aparecia: nota vinculada À MÃO (`carbo_nf_filial_
-- vincular`) a um pedido 'bling2-…' cujo pedido no Bling não tem nota, e cujo
-- rodapé NÃO cita o pedido, era apagada no passo 1 e o passo 2 não a devolvia.
-- O vínculo manual sumia em até 5 minutos, calado.
--
-- A regra que fica: o passo 1 só DESFAZ o vínculo quando a nota vinculada está
-- SABIDAMENTE inválida (`carbo_nf_invalida`: Cancelada, Denegada, Rejeitada,
-- Bloqueada). Ausência de nota no pedido não é cancelamento — o vínculo pode
-- ter vindo do rodapé ou de uma pessoa. É a mesma regra de "nota em voo não é
-- nota cancelada" da `20261033`.
--
-- ⚠️ A troca é feita no texto VIVO da função (`pg_get_functiondef`), nunca a
-- partir do repositório, casando por PADRÃO (o espaçamento de produção já
-- divergiu do repo antes) e exigindo UMA ocorrência. O antes vai para
-- `carbo_backup_funcoes`.
--
-- Cada letra é UM bloco (o SQL Editor mostra só o último resultado).
-- ═══════════════════════════════════════════════════════════════════════════


-- (A) MEDIR: os pedidos que o passo 1 apaga hoje. Para cada um, a nota
--     vinculada, a situação dela, a nota que o pedido tem no Bling (nula =
--     o motivo da troca) e se o rodapé cita o pedido.
--     ESPERADO: poucas linhas (~4), com a nota vinculada VÁLIDA e o rodapé
--     citando o pedido — são os que vão e voltam. Linha com a nota vinculada
--     `Cancelada` é desfazimento legítimo e continua acontecendo depois.
with o as (
  select o.id, o.order_number, o.bling2_nf_id, o.invoice2_number, o.fulfillment_stage,
         nullif(replace(o.external_ref, 'bling2-', ''), '')::bigint as pedido_bling
  from public.carboze_orders o
  where o.bling_conta = 2
    and o.external_ref like 'bling2-%'
    and o.bling2_nf_id is not null
)
select o.order_number,
       o.invoice2_number                          as nf_vinculada,
       nl.situacao                                as situacao_da_vinculada,
       bo.nf_bling_id                             as nf_do_pedido_no_bling,
       nfp.situacao                               as situacao_da_do_pedido,
       nl.informacoes_adicionais ~* o.order_number as rodape_cita_o_pedido,
       o.fulfillment_stage
from o
left join public.bling2_orders bo  on bo.bling_id  = o.pedido_bling
left join public.bling2_nfe    nfp on nfp.bling_id = bo.nf_bling_id
left join public.bling2_nfe    nl  on nl.bling_id  = o.bling2_nf_id
where not (nfp.bling_id is not null and public.bling2_nf_e_valida(nfp.situacao))
order by o.order_number;


-- (B) A CORREÇÃO. Troca no texto vivo o `elsif r.nf_atual is not null then`
--     do passo 1 por "e a nota vinculada está sabidamente inválida".
--     ESPERADO: "Success. No rows returned" e o aviso "vinculo da filial
--     corrigido". Se ABORTAR dizendo que achou 0 ou 2+ ocorrências, nada foi
--     alterado: me mande pg_get_functiondef('public.carbo_vincula_nf_filial()'::regprocedure).
do $vinc$
declare
  v_def  text := pg_get_functiondef('public.carbo_vincula_nf_filial()'::regprocedure);
  v_pad  text := 'elsif\s+r\.nf_atual\s+is\s+not\s+null\s+then';
  v_novo text := 'elsif r.nf_atual is not null
        and exists (select 1 from public.bling2_nfe x
                     where x.bling_id = r.nf_atual
                       and public.carbo_nf_invalida(x.situacao)) then';
  v_n    int;
begin
  if position('carbo_nf_invalida' in v_def) > 0 then
    raise notice 'A função já só desfaz nota inválida — nada a trocar.';
    return;
  end if;
  v_n := regexp_count(v_def, v_pad, 1, 'i');
  if v_n <> 1 then
    raise exception 'Esperava 1 ocorrência de "elsif r.nf_atual is not null then", achei %. Nada foi alterado.', v_n;
  end if;
  insert into public.carbo_backup_funcoes(funcao, definicao)
  values ('carbo_vincula_nf_filial', v_def);
  execute regexp_replace(v_def, v_pad, v_novo, 'i');
  raise notice 'vinculo da filial corrigido';
end $vinc$;


-- (C) CONFERÊNCIA: roda a função uma vez (é o que o cron já faz a cada 5 min)
--     e devolve quantos vínculos ela mexeu.
--     ESPERADO: 0, ou um número pequeno se alguma nota nova chegou agora.
--     Antes da correção ela devolvia ~8 a cada rodada (4 apagar + 4 religar).
select public.carbo_vincula_nf_filial()                                      as vinculos_mexidos,
       position('carbo_nf_invalida' in
         pg_get_functiondef('public.carbo_vincula_nf_filial()'::regprocedure)) > 0 as correcao_no_ar;


-- (D) AMANHÃ: a auditoria automática de pedidos por dia. ESPERADO: de ~2.300
--     linhas/dia para algumas centenas a partir de hoje.
-- select (created_at at time zone 'America/Sao_Paulo')::date as dia, count(*) as linhas,
--        pg_size_pretty(sum(pg_column_size(before_data) + pg_column_size(after_data))) as peso
-- from public.order_audit_logs
-- where table_name = 'carboze_orders' and user_id is null
--   and created_at > now() - interval '4 days'
-- group by 1 order by 1;
