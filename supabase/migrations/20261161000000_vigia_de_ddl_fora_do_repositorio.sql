-- 20261161 — o banco anota TODA mudança de estrutura e avisa o TI quando ela não vem do deploy (16/11/2026)
--
-- Por quê: a migração só chega ao banco pelo merge (integração GitHub ↔ Supabase), mas
-- qualquer pessoa com acesso ao painel pode colar SQL no SQL Editor — e isso NÃO deixa
-- rastro no histórico de migrações. Quem faz isso desfaz, calado, o que o deploy espera.
--
-- ⚠️ O que isto responde: O QUÊ, QUANDO e o TEXTO do comando (`current_query()`).
-- NÃO responde QUEM: no banco todo mundo do SQL Editor é o mesmo usuário (e todos
-- entram pela mesma conta do painel). ⚠️ Só vê mudança de ESTRUTURA (create/alter/drop
-- de tabela, função, view, política, índice, gatilho…). `update`/`delete` de dados e
-- `cron.schedule` NÃO são DDL e escapam.
--
-- Como separa deploy de SQL Editor: `application_name` da conexão. A tabela
-- `carbo_ddl_origens_ok` diz quais nomes são o deploy; nasce VAZIA de propósito — a
-- primeira rodada MOSTRA o nome do deploy (o comentário no fim desta migração gera um
-- evento dele) e só depois ele é cadastrado.
--
-- ⚠️ O gatilho de evento NUNCA pode derrubar um DDL: o corpo inteiro está num
-- `exception when others then null`. ⚠️ O Supabase não deixa ler eventos de
-- supabase_admin e dos schemas internos — ficam de fora para não virar ruído.

create table if not exists public.carbo_ddl_log (
  id          bigserial primary key,
  em          timestamptz not null default now(),
  evento      text not null,          -- CREATE TABLE, ALTER FUNCTION, DROP TABLE…
  tipo_objeto text,
  objeto      text,
  app         text,                   -- application_name da conexão
  usuario     text,                   -- session_user
  txid        bigint,
  query_hash  text,
  query       text,                   -- só no 1º evento de cada comando (arquivo grande não se repete)
  avisado     boolean not null default false
);
create index if not exists carbo_ddl_log_pendentes_idx on public.carbo_ddl_log (id) where not avisado;
create index if not exists carbo_ddl_log_em_idx on public.carbo_ddl_log (em);
alter table public.carbo_ddl_log enable row level security;
revoke all on public.carbo_ddl_log from anon, authenticated;

create table if not exists public.carbo_ddl_origens_ok (
  padrao text primary key,            -- ilike no application_name
  nota   text
);
alter table public.carbo_ddl_origens_ok enable row level security;
revoke all on public.carbo_ddl_origens_ok from anon, authenticated;

insert into public.carbo_notif_tipos (tipo, referencia, aba, rotulo, descricao) values
  ('ddl_fora_do_repo', '', 'ti', 'Banco alterado fora do deploy',
   'Alguém mudou a estrutura do banco por um caminho que não é o deploy do repositório (SQL Editor, painel, MCP).')
on conflict (tipo, referencia) do nothing;

create or replace function public.carbo_ddl_registrar()
returns event_trigger
language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  r   record;
  q   text := current_query();
  h   text := md5(coalesce(current_query(), ''));
  tx  bigint := txid_current();
  app text := current_setting('application_name', true);
  usr text := session_user;
  novo boolean;
begin
  if usr like 'supabase\_%' then return; end if;
  novo := not exists (select 1 from carbo_ddl_log l where l.txid = tx and l.query_hash = h);

  if tg_event = 'sql_drop' then
    for r in
      select object_type, schema_name, object_identity
        from pg_event_trigger_dropped_objects()
       where not coalesce(is_temporary, false)
         and coalesce(schema_name, '') not like 'pg\_%'
         and coalesce(schema_name, '') not in ('auth','storage','realtime','graphql','graphql_public',
                                                'extensions','vault','pgsodium','net','pgbouncer','supabase_functions')
    loop
      insert into carbo_ddl_log (evento, tipo_objeto, objeto, app, usuario, txid, query_hash, query)
      values ('DROP', r.object_type, r.object_identity, app, usr, tx, h, case when novo then left(q, 6000) end);
      novo := false;
    end loop;
  else
    for r in
      select command_tag, object_type, schema_name, object_identity
        from pg_event_trigger_ddl_commands()
       where coalesce(schema_name, '') not like 'pg\_%'
         and coalesce(schema_name, '') not in ('auth','storage','realtime','graphql','graphql_public',
                                                'extensions','vault','pgsodium','net','pgbouncer','supabase_functions')
    loop
      insert into carbo_ddl_log (evento, tipo_objeto, objeto, app, usuario, txid, query_hash, query)
      values (r.command_tag, r.object_type, r.object_identity, app, usr, tx, h, case when novo then left(q, 6000) end);
      novo := false;
    end loop;
  end if;
exception when others then
  null;   -- ⚠️ registrar NUNCA pode impedir a mudança
end $$;
revoke all on function public.carbo_ddl_registrar() from public, anon, authenticated;

drop event trigger if exists carbo_ddl_fim;
drop event trigger if exists carbo_ddl_queda;
create event trigger carbo_ddl_fim   on ddl_command_end execute function public.carbo_ddl_registrar();
create event trigger carbo_ddl_queda on sql_drop        execute function public.carbo_ddl_registrar();

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
begin
  -- o que vem de origem cadastrada (o deploy) não avisa
  update carbo_ddl_log l set avisado = true
   where not avisado
     and exists (select 1 from carbo_ddl_origens_ok o where l.app ilike o.padrao);

  select array_agg(id order by id) into v_ids from carbo_ddl_log where not avisado;
  if v_ids is null then
    delete from carbo_ddl_log where em < now() - interval '180 days';
    return jsonb_build_object('novos', 0);
  end if;

  select count(*), count(distinct txid), string_agg(distinct coalesce(nullif(app, ''), '?'), ', ')
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

select cron.unschedule(jobid) from cron.job where jobname = 'carbo-ddl-vigiar-10min';
select cron.schedule('carbo-ddl-vigiar-10min', '6-59/10 * * * *', $$select public.carbo_ddl_vigiar()$$);

-- ⚠️ Gera de propósito UM evento DDL do deploy, depois dos gatilhos: o `app` dele é o nome
-- que precisa ser cadastrado em carbo_ddl_origens_ok (o próximo passo).
comment on table public.carbo_ddl_log is
  'Toda mudança de estrutura do banco (create/alter/drop), com programa, hora e o texto do comando. Origem cadastrada em carbo_ddl_origens_ok não avisa. Responde O QUÊ e QUANDO, nunca QUEM.';
