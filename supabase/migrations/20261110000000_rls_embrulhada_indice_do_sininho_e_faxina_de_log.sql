-- ═══════════════════════════════════════════════════════════════════════════
-- 20261110 — RLS embrulhada, índice do sininho e faxina dos logs
--
-- Resultado da varredura `20261109` (19/10/2026):
--
--   L  ~280 regras do schema public com `auth.uid()` / `is_admin(auth.uid())` /
--      `crm_is_gestor()` SOLTOS — rodam UMA VEZ POR LINHA lida. Entre elas as
--      regras antigas de `bling2_orders`, `bling2_nfe`, `bling2_contacts` e
--      `bling2_lojas`: a `20261083` embrulhou a do time interno, mas as regras
--      de SELECT se somam com OR e a do admin, solta, continuava rodando por
--      linha dentro da Esteira. E `notifications` ("users read own").
--   M  `notifications.user_id` SEM índice, com 77 mil linhas — e o sininho dos
--      oito apps lia `where user_id = … order by created_at desc limit 50` a
--      cada 15 s por aba (agora 120 s; o Realtime traz o novo na hora).
--   J  ~100 MB de LOG sem faxina: `bling_treatment_log` (272 mil linhas) e
--      `bling2_sync_log` (221 mil).
--
-- ⚠️ Embrulhar (`(select …)`) não muda QUEM vê o quê: a função devolve o mesmo
-- valor, só que calculado uma vez por consulta. Função cujo argumento é COLUNA
-- (`has_role(user_id, …)`) fica como está — embrulhá-la não ganharia nada.
-- ⚠️ Só o schema `public`. `licenciados` e `produtos` são de outros repos (e o
-- `produtos` tem a regra dura do md); ficam para lá.
-- ⚠️ Toda regra alterada vai antes para `carbo_backup_policies`.
--
-- Cada letra é UM bloco (o SQL Editor mostra só o último resultado).
-- ═══════════════════════════════════════════════════════════════════════════


-- (A) MEDIR: os índices que `notifications` já tem. Se já houver um que
--     comece por `user_id`, o bloco D é dispensável (rodar não estraga nada,
--     só cria um índice a mais).
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'notifications'
order by 1;


-- (B) MEDIR: quanto dos dois logs tem mais de 30 dias, e qual a coluna de data
--     de cada um (o `bling_treatment_log` não nasceu por migração do repo).
select 'bling2_sync_log' as log,
       count(*) as linhas,
       count(*) filter (where started_at < now() - interval '30 days') as mais_de_30_dias,
       min(started_at) as mais_antiga,
       'started_at' as coluna_de_data
from public.bling2_sync_log
union all
select 'bling_treatment_log', null, null, null,
       (select string_agg(column_name || ':' || data_type, ', ')
          from information_schema.columns
         where table_schema = 'public' and table_name = 'bling_treatment_log'
           and data_type like 'timestamp%');


-- (C) A CORREÇÃO DA RLS. Embrulha `auth.uid()`/`auth.jwt()`/`auth.role()` e as
--     funções de "quem está logado" (só quando o argumento é o próprio usuário,
--     nada, ou literal) em `(SELECT …)`. Testada num Postgres local com os
--     formatos que a varredura mostrou; rodar de novo não troca nada.
--     ESPERADO: "Success" e o aviso "regras embrulhadas: N" (N perto de 280).
--     Se der erro, NADA foi alterado (o bloco é atômico): me mande a mensagem.
do $$
declare
  r record; v_qual text; v_check text; v_n int := 0;
  p_auth constant text := '(?<!SELECT )\mauth\.(uid|jwt|role)\(\)';
  p_fn   constant text := '(?<!SELECT )\m(public\.)?(is_admin|carbo_is_gestor|crm_is_gestor|carbo_prevendas_gestor|has_role|is_employee|carbo_e_time_interno)\((\(SELECT auth\.uid\(\)\)|\( SELECT auth\.uid\(\) AS uid\))?(, ''[^'']*''::[a-z_.]+)*\)';
begin
  for r in
    select * from pg_policies p
     where p.schemaname = 'public'
       and (coalesce(p.qual,'') || ' ' || coalesce(p.with_check,'')) ~ (p_auth || '|' || p_fn)
  loop
    insert into public.carbo_backup_policies(tabela, regra, operacao, papeis, quem_le, quem_grava)
    values (r.tablename, r.policyname, r.cmd, r.roles::text, r.qual, r.with_check);

    v_qual  := regexp_replace(regexp_replace(r.qual,       p_auth, '(SELECT \&)', 'g'), p_fn, '(SELECT \&)', 'g');
    v_check := regexp_replace(regexp_replace(r.with_check, p_auth, '(SELECT \&)', 'g'), p_fn, '(SELECT \&)', 'g');

    if v_qual is not null and v_check is not null then
      execute format('alter policy %I on public.%I using (%s) with check (%s)', r.policyname, r.tablename, v_qual, v_check);
    elsif v_qual is not null then
      execute format('alter policy %I on public.%I using (%s)', r.policyname, r.tablename, v_qual);
    else
      execute format('alter policy %I on public.%I with check (%s)', r.policyname, r.tablename, v_check);
    end if;
    v_n := v_n + 1;
  end loop;
  raise notice 'regras embrulhadas: %', v_n;
end $$;


-- (D) O ÍNDICE DO SININHO. ⚠️ Rode SOZINHO: `concurrently` não roda dentro de
--     transação, e é ele que deixa a tabela ser gravada enquanto o índice nasce
--     (a venda on-line insere ~30 linhas ali por pedido).
--     ESPERADO: "Success. No rows returned".
create index concurrently if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);


-- (E) A FAXINA DOS LOGS: apaga o que tem mais de 30 dias nos dois logs e passa
--     a fazer isso todo dia, no MESMO job da faxina do cron (`20261105`) — uma
--     faxina, um lugar. ⚠️ Descobre a coluna de data do `bling_treatment_log`
--     sozinho e ABORTA, sem apagar nada, se não achar uma conhecida.
--     ESPERADO: aviso com o nome da coluna e uma linha do job, `active = true`.
do $$
declare v_col text; v_cmd text;
begin
  select column_name into v_col
    from information_schema.columns
   where table_schema = 'public' and table_name = 'bling_treatment_log'
     and column_name in ('created_at', 'started_at', 'processed_at', 'ts')
   order by array_position(array['created_at', 'started_at', 'processed_at', 'ts'], column_name)
   limit 1;
  if v_col is null then
    raise exception 'bling_treatment_log sem coluna de data conhecida — nada foi apagado. Me mande o bloco B.';
  end if;

  v_cmd := format(
    'delete from cron.job_run_details where end_time < now() - interval ''7 days''; '
    'delete from public.bling2_sync_log where started_at < now() - interval ''30 days''; '
    'delete from public.bling_treatment_log where %I < now() - interval ''30 days'';', v_col);

  execute v_cmd;   -- a primeira faxina, agora
  perform cron.unschedule(jobid) from cron.job where jobname = 'cron-log-faxina-diaria';
  perform cron.schedule('cron-log-faxina-diaria', '37 6 * * *', v_cmd);
  raise notice 'faxina: bling_treatment_log pela coluna %', v_col;
end $$;

select jobname, schedule, active, command
from cron.job where jobname = 'cron-log-faxina-diaria';


-- (F) CONFERÊNCIA DA RLS: o que sobrou solto no public. ESPERADO: só regras
--     cuja função recebe COLUNA (ex.: `has_role(user_id, …)`) — essas não têm
--     o que ganhar.
with p as (
  select tablename, policyname, cmd,
         coalesce(qual, '') || ' ' || coalesce(with_check, '') as expr
  from pg_policies where schemaname = 'public'
)
select tablename, policyname, cmd, left(expr, 160) as expressao
from p
where expr ~ '(?<!SELECT )\mauth\.(uid|jwt|role)\(\)'
   or expr ~ '(?<!SELECT )\m(public\.)?(is_admin|carbo_is_gestor|crm_is_gestor|carbo_prevendas_gestor|has_role|is_employee|carbo_e_time_interno)\('
order by 1, 2;
