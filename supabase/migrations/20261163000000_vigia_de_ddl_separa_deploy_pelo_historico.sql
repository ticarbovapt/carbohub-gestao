-- 20261163 — o vigia de DDL separa o deploy do SQL Editor pelo HISTÓRICO de migrações (16/11/2026)
--
-- Medido no primeiro deploy (20261161): o deploy da integração chega com `application_name`
-- VAZIO, e o SQL Editor do painel com `supabase/dashboard-query-editor`. Cadastrar o vazio
-- como "origem esperada" silenciaria QUALQUER conexão sem nome (psql, MCP, outra ferramenta).
--
-- Regra nova: DDL sem nome de programa só é do deploy se uma VERSÃO NOVA apareceu em
-- `supabase_migrations.schema_migrations` desde a última rodada — o deploy grava a versão
-- na mesma transação do DDL. Sem versão nova, DDL sem nome AVISA. DDL com nome (o SQL
-- Editor, o assistente do painel…) avisa sempre, a não ser que o nome esteja em
-- `carbo_ddl_origens_ok`.
--
-- ⚠️ Limite que continua: DDL sem nome feito NA MESMA janela (≤ 10 min) de um deploy fica
-- escondido atrás dele. O SQL Editor, por ter nome, nunca fica.

create table if not exists public.carbo_ddl_estado (
  id            boolean primary key default true check (id),
  ultima_versao text
);
alter table public.carbo_ddl_estado enable row level security;
revoke all on public.carbo_ddl_estado from anon, authenticated;
insert into public.carbo_ddl_estado (id, ultima_versao)
select true, max(version) from supabase_migrations.schema_migrations
on conflict (id) do nothing;

create or replace function public.carbo_ddl_vigiar()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ids   bigint[];
  v_n     int;
  v_cmds  int;
  v_apps  text;
  v_ex    text;
  v_sql   text;
  v_max   text;
  v_ult   text;
begin
  -- houve deploy desde a última rodada? (a versão nova no histórico é a prova)
  select max(version) into v_max from supabase_migrations.schema_migrations;
  select ultima_versao into v_ult from carbo_ddl_estado where id;
  if v_max is not null and v_max > coalesce(v_ult, '') then
    update carbo_ddl_log set avisado = true where not avisado and coalesce(app, '') = '';
    update carbo_ddl_estado set ultima_versao = v_max where id;
  end if;

  -- origem cadastrada não avisa
  update carbo_ddl_log l set avisado = true
   where not avisado
     and coalesce(l.app, '') <> ''
     and exists (select 1 from carbo_ddl_origens_ok o where l.app ilike o.padrao);

  select array_agg(id order by id) into v_ids from carbo_ddl_log where not avisado;
  if v_ids is null then
    delete from carbo_ddl_log where em < now() - interval '180 days';
    return jsonb_build_object('novos', 0);
  end if;

  select count(*), count(distinct txid), string_agg(distinct coalesce(nullif(app, ''), '(sem nome)'), ', ')
    into v_n, v_cmds, v_apps
    from carbo_ddl_log where id = any (v_ids);
  select string_agg(x, ' · ') into v_ex from (
    select evento || ' ' || coalesce(objeto, '') as x
      from carbo_ddl_log where id = any (v_ids) order by id limit 4) s;
  select left(regexp_replace(query, '\s+', ' ', 'g'), 220) into v_sql
    from carbo_ddl_log where id = any (v_ids) and query is not null order by id limit 1;

  insert into public.notifications (user_id, type, title, body, reference_type, reference_id, is_read)
  select p.id, 'ddl_fora_do_repo', 'Banco alterado fora do deploy',
         v_n || ' mudança(s) de estrutura em ' || v_cmds || ' comando(s), programa: ' || v_apps ||
         '. ' || v_ex || coalesce(' — comando: ' || v_sql, '') ||
         '. Veja: select * from carbo_ddl_log where em > now() - interval ''1 day'' order by id desc.',
         'ddl', null, false
    from public.profiles p
   where 'carbo_ti' = any (coalesce(p.allowed_interfaces, '{}'));

  update carbo_ddl_log set avisado = true where id = any (v_ids);
  return jsonb_build_object('novos', v_n, 'comandos', v_cmds, 'apps', v_apps);
end $$;
revoke all on function public.carbo_ddl_vigiar() from public, anon, authenticated;
