-- ═══════════════════════════════════════════════════════════════════════════
-- Rastreio: a NF leva o card DIRETO a "Emitir Etiqueta", e nasce
-- "Etiqueta emitida · aguardando despacho"
--
-- Pedido do dono do processo (29/10/2026), no /logistica/pos-venda do Ops:
-- "NF Finalizada" era uma coluna em que nada acontecia — o card esperava
-- alguém arrastá-lo para "Emitir Etiqueta". Agora:
--
--   Gerar Nota Fiscal → (NF vinculada) → Emitir Etiqueta
--     → (gerou o PDF) → Etiqueta emitida · aguardando despacho → Em Transporte …
--
-- ⚠️ ADITIVO. `nf_finalizada` CONTINUA no CHECK: aba antiga aberta, função que
-- ninguém lembra e o histórico ainda podem gravá-lo. O gatilho o converte em
-- `emitir_etiqueta`, e o front (`colunaDaEtapa`, packages/posvenda) mostra quem
-- estiver nele na coluna "Emitir Etiqueta" — pedido nunca some do quadro.
--
-- ⚠️ As funções são trocadas no TEXTO VIVO (pg_get_functiondef), com o antes
-- em `carbo_backup_funcoes`, e cada troca exige achar o trecho EXATAMENTE uma
-- vez — senão aborta sem mexer em nada.
--
-- ⚠️ RODE EM BLOCOS. BLOCO 0 sozinho; depois 1, 2 e 3; depois o 4.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — MEDIR (só leitura)                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Quantos cards há em cada etapa que muda, e QUEM MAIS no banco cita
-- 'nf_finalizada'. ESPERADO na parte (b): só as duas funções que este arquivo
-- troca (carboze_orders_nf_autostage, carbo_pronta_entrega_encerra). Qualquer
-- outra linha = função ou view que também precisa aprender a etapa nova —
-- PARE e mande o resultado.
select 'a) cards em ' || coalesce(fulfillment_stage, '(nulo)') as o_que,
       count(*)::text as qtd,
       count(*) filter (where entrega_modalidade = 'pronta_entrega')::text || ' de pronta entrega' as detalhe
  from public.carboze_orders
 where fulfillment_stage in ('nf_finalizada', 'emitir_etiqueta', 'em_transporte')
 group by fulfillment_stage
union all
select 'b) função cita nf_finalizada', p.proname::text,
       n.nspname::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname not in ('pg_catalog', 'information_schema')
   and p.prokind = 'f'
   and pg_get_functiondef(p.oid) ilike '%nf_finalizada%'
union all
select 'c) view cita nf_finalizada', c.relname::text, n.nspname::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where c.relkind in ('v', 'm') and n.nspname not in ('pg_catalog', 'information_schema')
   and pg_get_viewdef(c.oid) ilike '%nf_finalizada%'
union all
select 'd) CHECK hoje', 'carboze_orders_fulfillment_stage_check',
       (select pg_get_constraintdef(con.oid) from pg_constraint con
         where con.conname = 'carboze_orders_fulfillment_stage_check')
order by 1, 2;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a etapa nova no CHECK (a partir do CHECK VIVO)              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Acrescenta 'etiqueta_emitida' logo antes de 'em_transporte' na definição
-- que está NO BANCO — nenhum valor que exista lá se perde. Idempotente.
do $$
declare
  v_def  text;
  v_novo text;
begin
  select pg_get_constraintdef(con.oid) into v_def
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
   where c.relname = 'carboze_orders' and con.conname = 'carboze_orders_fulfillment_stage_check';
  if v_def is null then
    raise exception 'CHECK carboze_orders_fulfillment_stage_check não encontrado — nada foi alterado.';
  end if;
  if v_def like '%''etiqueta_emitida''%' then
    raise notice 'etiqueta_emitida já está no CHECK — nada a fazer.';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, '''em_transporte''::text', ''))) / length('''em_transporte''::text') <> 1 then
    raise exception 'Formato inesperado do CHECK (esperava ''em_transporte''::text uma vez): % — nada foi alterado.', v_def;
  end if;
  v_novo := replace(v_def, '''em_transporte''::text', '''etiqueta_emitida''::text, ''em_transporte''::text');
  alter table public.carboze_orders drop constraint carboze_orders_fulfillment_stage_check;
  execute format('alter table public.carboze_orders add constraint carboze_orders_fulfillment_stage_check %s', v_novo);
end $$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — os dois gatilhos aprendem o caminho novo                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- (a) carboze_orders_nf_autostage: a NF vinculada leva a 'emitir_etiqueta'
--     (era 'nf_finalizada'), e qualquer gravação de 'nf_finalizada' vira
--     'emitir_etiqueta' — aba antiga aberta não recria a coluna morta.
--     ⚠️ Os gatilhos BEFORE disparam em ordem ALFABÉTICA: este
--     (trg_carboze_orders_nf_autostage) roda antes do da pronta entrega
--     (trg_pronta_entrega_encerra), que portanto já recebe 'emitir_etiqueta'.
-- (b) carbo_pronta_entrega_encerra: pronta entrega não tem etiqueta nem
--     transporte — o card que chegaria em 'nf_finalizada' e ia direto a
--     'entregue' agora faz isso a partir de 'emitir_etiqueta'.
do $$
declare
  v_def  text;
  v_novo text;
  v_n    int;
begin
  -- (a)
  select pg_get_functiondef('public.carboze_orders_nf_autostage()'::regprocedure) into v_def;
  if v_def ilike '%emitir_etiqueta%' then
    raise notice 'carboze_orders_nf_autostage já trocada — pulando.';
  else
    v_n := regexp_count(v_def, $re$fulfillment_stage\s*:=\s*'nf_finalizada'\s*;$re$, 1, 'i');
    if v_n <> 1 then raise exception 'autostage: esperava 1 atribuição de nf_finalizada, achei % — nada foi alterado.', v_n; end if;
    v_n := regexp_count(v_def, $re$return\s+new\s*;$re$, 1, 'i');
    if v_n <> 1 then raise exception 'autostage: esperava 1 "return NEW;", achei % — nada foi alterado.', v_n; end if;
    insert into public.carbo_backup_funcoes(funcao, definicao) values ('carboze_orders_nf_autostage', v_def);
    v_novo := regexp_replace(v_def, $re$fulfillment_stage\s*:=\s*'nf_finalizada'\s*;$re$,
                             $s$fulfillment_stage := 'emitir_etiqueta';$s$, 'i');
    v_novo := regexp_replace(v_novo, $re$return\s+new\s*;$re$,
      $s$-- 29/10/2026: 'nf_finalizada' deixou de ser coluna. Quem ainda gravá-la
  -- (aba antiga, função esquecida) cai em 'emitir_etiqueta'.
  if NEW.fulfillment_stage = 'nf_finalizada' then
    NEW.fulfillment_stage := 'emitir_etiqueta';
  end if;
  return NEW;$s$, 'i');
    execute v_novo;
  end if;

  -- (b)
  select pg_get_functiondef('public.carbo_pronta_entrega_encerra()'::regprocedure) into v_def;
  if v_def ilike '%emitir_etiqueta%' then
    raise notice 'carbo_pronta_entrega_encerra já trocada — pulando.';
  else
    v_n := regexp_count(v_def, $re$fulfillment_stage\s*=\s*'nf_finalizada'$re$, 1, 'i');
    if v_n <> 1 then raise exception 'pronta entrega: esperava 1 comparação com nf_finalizada, achei % — nada foi alterado.', v_n; end if;
    insert into public.carbo_backup_funcoes(funcao, definicao) values ('carbo_pronta_entrega_encerra', v_def);
    v_novo := regexp_replace(v_def, $re$fulfillment_stage\s*=\s*'nf_finalizada'$re$,
                             $s$fulfillment_stage in ('nf_finalizada', 'emitir_etiqueta')$s$, 'i');
    execute v_novo;
  end if;
end $$;

comment on function public.carboze_orders_nf_autostage is
  'Avanca gerar_nf -> emitir_etiqueta quando a NF de VENDA e vinculada, em qualquer das duas contas Bling (bling_nf_id ou bling2_nf_id). Desde 29/10/2026 nao ha mais nf_finalizada no meio; quem gravar nf_finalizada cai em emitir_etiqueta. A remessa de bonificacao NAO avanca o card.';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — os cards que estão em "NF Finalizada" vão para "Emitir      ║
-- ║           Etiqueta", SEM zerar o "parado há X"                        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ O gatilho trg_carboze_stage_changed põe stage_changed_at = now() em toda
-- troca de etapa; aqui ela é só de NOME, então o relógio volta ao que era.
-- Pronta entrega que estiver em nf_finalizada vai a 'entregue' (gatilho da
-- pronta entrega) — é o que deveria ter acontecido; o BLOCO 0 (a) diz quantos.
do $$
declare
  r record;
begin
  for r in
    select id, stage_changed_at from public.carboze_orders
     where fulfillment_stage = 'nf_finalizada'
     for update
  loop
    update public.carboze_orders set fulfillment_stage = 'emitir_etiqueta' where id = r.id;
    update public.carboze_orders set stage_changed_at = r.stage_changed_at where id = r.id;
  end loop;
end $$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — CONFERÊNCIA (só leitura). Toda linha tem de vir "ok".       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
select 'CHECK aceita etiqueta_emitida' as conferencia,
       case when (select pg_get_constraintdef(con.oid) from pg_constraint con
                   where con.conname = 'carboze_orders_fulfillment_stage_check') like '%''etiqueta_emitida''%'
            then 'ok' else 'FALHOU' end as resultado
union all
select 'NF leva a emitir_etiqueta',
       case when pg_get_functiondef('public.carboze_orders_nf_autostage()'::regprocedure) ilike '%:= ''emitir_etiqueta''%'
            then 'ok' else 'FALHOU' end
union all
select 'pronta entrega encerra a partir de emitir_etiqueta',
       case when pg_get_functiondef('public.carbo_pronta_entrega_encerra()'::regprocedure) ilike '%emitir_etiqueta%'
            then 'ok' else 'FALHOU' end
union all
select 'nenhum card em nf_finalizada',
       case when (select count(*) from public.carboze_orders where fulfillment_stage = 'nf_finalizada') = 0
            then 'ok' else 'FALHOU' end;
