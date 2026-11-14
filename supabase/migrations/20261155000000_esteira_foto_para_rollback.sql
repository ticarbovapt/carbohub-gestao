-- ═══════════════════════════════════════════════════════════════════════════
-- 20261155 — A FOTO da esteira, para voltar atrás se a reforma quebrar algo
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pedido do dono do processo (14/11/2026), antes de mexer na esteira inteira:
-- *"gravar isso e ter um rollback caso nossa tentativa quebre o que funciona
-- hoje, mesmo funcionando meio capenga"*.
--
-- A foto guarda, numa tabela, o TEXTO VIVO de tudo que faz a esteira andar —
-- lido do BANCO, nunca do repositório (a produção já divergiu do repo mais de
-- uma vez: `pg_get_viewdef` e `pg_get_functiondef` são a única verdade):
--
--   view    o núcleo (esteira, "Pago", fila do WhatsApp, recompra, carrinho,
--           envio vigente do ME, parados, conversas…) + TODA view que depende
--           delas, com reloptions (o `security_invoker`), colunas e grants
--   funcao  toda função de que essas views dependem + as que citam as
--           tabelas da esteira no corpo
--   cron    TODOS os jobs (agenda, comando, ligado/desligado)
--   config  as linhas de carbo_msg_templates, carbo_msg_config,
--           carbo_carrinho_config, carbo_esteira_limite, carbo_wa_numeros
--   medida  quantos cards por etapa no instante da foto
--
-- ⚠️ É REDE QUE NÃO DEPENDE DO QUE ELA PROTEGE: a foto é texto numa tabela.
-- Se a reforma apagar uma função, `pg_get_functiondef` não tem mais o que
-- devolver — a tabela tem.
--
-- ⚠️ A tabela guarda o COMANDO dos crons, que leva o CRON_SECRET. Por isso:
-- RLS ligada, NENHUMA policy, e nada concedido a anon/authenticated. Só o
-- dono (o SQL Editor) e a service role leem.
--
-- ⚠️ O RESTAURAR nasce em ENSAIO (`p_ensaio` = true): roda tudo e desfaz no
-- fim, devolvendo o relatório do que mudaria. Só com `false` ele grava. E é
-- tudo-ou-nada: se uma peça falhar, nada muda e o erro diz qual.
--
-- O que ele NÃO volta (e o relatório diz):
--   · linha de config APAGADA depois da foto (só atualiza as que existem);
--   · cron NOVO criado depois da foto é DESLIGADO, nunca apagado;
--   · dado (pedido, envio, mensagem) — a foto é de REGRA, não de dado;
--   · o código das edge functions e das telas — esse volta pelo git
--     (docs/esteira/README.md, "Rollback").
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a tabela e as duas funções (não muda nada da esteira)       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
create table if not exists public.carbo_foto_esteira (
  id         bigint generated always as identity primary key,
  foto       text not null,
  tirada_em  timestamptz not null default now(),
  tipo       text not null check (tipo in ('funcao','view','cron','config','medida')),
  nome       text not null,
  ordem      int not null default 0,
  definicao  text,
  extra      jsonb,
  unique (foto, tipo, nome)
);
alter table public.carbo_foto_esteira enable row level security;
revoke all on public.carbo_foto_esteira from anon, authenticated;

comment on table public.carbo_foto_esteira is
  'Foto da regra da esteira (views, funções, crons, config) para rollback. Guarda o comando dos crons (com segredo): sem policy, sem grant.';


create or replace function public.carbo_foto_esteira_tirar(p_foto text)
returns jsonb
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_nucleo text[] := array[
    'bling2_esteira','ecommerce_aguardando_bling','carbo_msg_fila',
    'carbo_recompra_pipeline','carbo_carrinho_pipeline','melhorenvio_envio_vigente',
    'carbo_esteira_parados','carbo_wa_conversas','carbo_wa_agendadas_fila',
    'rastreio_card','carbo_fulfill_fila'];
  v_padroes text[] := array[
    '%bling2_esteira%','%carbo_msg_fila%','%carbo_msg_envios%','%melhorenvio_%',
    '%rastreio_envios%','%carbo_carrinho_%','%carbo_recompra_%',
    '%ecommerce_aguardando_bling%','%carbo_esteira_limite%','%carbo_entrega_trato%'];
  v_config text[] := array[
    'carbo_msg_templates','carbo_msg_config','carbo_carrinho_config',
    'carbo_esteira_limite','carbo_wa_numeros'];
  v_t text;
  v_n int;
  r record;
  v_views int := 0; v_funcoes int := 0; v_crons int := 0; v_config_n int := 0;
  v_medida jsonb;
begin
  if coalesce(btrim(p_foto), '') = '' then
    raise exception 'Dê um nome à foto (ex.: antes-reforma-2026-11-14).';
  end if;
  if exists (select 1 from public.carbo_foto_esteira where foto = p_foto) then
    raise exception 'A foto "%" já existe. Use outro nome — foto não se sobrescreve.', p_foto;
  end if;

  -- ── VIEWS: o núcleo + quem depende dele, com a ordem de recriação ──────
  create temp table _foto_v on commit drop as
  with recursive base as (
    select c.oid from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v' and c.relname = any (v_nucleo)
  ), dep(oid) as (
    select oid from base
    union
    select rw.ev_class
      from dep d
      join pg_depend dp on dp.refobjid = d.oid
                       and dp.classid = 'pg_rewrite'::regclass
                       and dp.refclassid = 'pg_class'::regclass
      join pg_rewrite rw on rw.oid = dp.objid
      join pg_class c on c.oid = rw.ev_class and c.relkind = 'v'
     where rw.ev_class <> d.oid
  )
  select distinct oid from dep;

  -- profundidade: 0 = não depende de outra view da foto
  create temp table _foto_aresta on commit drop as
  select distinct rw.ev_class as v, dp.refobjid as u
    from pg_depend dp
    join pg_rewrite rw on rw.oid = dp.objid
   where dp.classid = 'pg_rewrite'::regclass and dp.refclassid = 'pg_class'::regclass
     and rw.ev_class in (select oid from _foto_v)
     and dp.refobjid in (select oid from _foto_v)
     and rw.ev_class <> dp.refobjid;

  for r in
    with recursive prof(oid, p) as (
      select oid, 0 from _foto_v
      union all
      select a.v, pr.p + 1 from prof pr join _foto_aresta a on a.u = pr.oid
    )
    select c.oid, c.relname, max(pr.p) as p,
           pg_get_viewdef(c.oid, false) as def,
           c.reloptions, pg_get_userbyid(c.relowner) as dono
      from prof pr join pg_class c on c.oid = pr.oid
     group by c.oid, c.relname, c.reloptions, c.relowner
  loop
    insert into public.carbo_foto_esteira (foto, tipo, nome, ordem, definicao, extra)
    values (p_foto, 'view', r.relname, r.p, r.def, jsonb_build_object(
      'reloptions', to_jsonb(r.reloptions),
      'dono', r.dono,
      'colunas', (select jsonb_agg(a.attname order by a.attnum)
                    from pg_attribute a where a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped),
      'grants', (select coalesce(jsonb_agg(jsonb_build_object(
                    'grantee', case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,
                    'privilegio', x.privilege_type)), '[]'::jsonb)
                   from pg_class c2, lateral aclexplode(c2.relacl) x
                  where c2.oid = r.oid)));
    v_views := v_views + 1;
  end loop;

  -- ── FUNÇÕES: as que as views usam + as que citam a esteira ─────────────
  for r in
    select distinct p.oid, p.oid::regprocedure::text as nome
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind in ('f','p')
       and p.proname not like 'carbo_foto_esteira%'
       and not exists (select 1 from pg_depend e
                        where e.classid = 'pg_proc'::regclass and e.objid = p.oid and e.deptype = 'e')
       and (p.prosrc ilike any (v_padroes)
            or p.oid in (select dp.refobjid
                           from pg_depend dp join pg_rewrite rw on rw.oid = dp.objid
                          where dp.classid = 'pg_rewrite'::regclass
                            and dp.refclassid = 'pg_proc'::regclass
                            and rw.ev_class in (select oid from _foto_v)))
  loop
    insert into public.carbo_foto_esteira (foto, tipo, nome, definicao, extra)
    values (p_foto, 'funcao', r.nome, pg_get_functiondef(r.oid), jsonb_build_object(
      'grants', (select coalesce(jsonb_agg(jsonb_build_object(
                    'grantee', case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,
                    'privilegio', x.privilege_type)), '[]'::jsonb)
                   from pg_proc p2, lateral aclexplode(p2.proacl) x where p2.oid = r.oid)));
    v_funcoes := v_funcoes + 1;
  end loop;

  -- ── CRON: todos os jobs ────────────────────────────────────────────────
  if to_regclass('cron.job') is not null then
    for r in execute 'select jobid, jobname, schedule, command, active, database, username from cron.job' loop
      insert into public.carbo_foto_esteira (foto, tipo, nome, definicao, extra)
      values (p_foto, 'cron', coalesce(r.jobname, 'jobid:' || r.jobid), r.command,
              jsonb_build_object('jobid', r.jobid, 'jobname', r.jobname, 'schedule', r.schedule,
                                 'active', r.active, 'database', r.database, 'username', r.username));
      v_crons := v_crons + 1;
    end loop;
  end if;

  -- ── CONFIG: as linhas das tabelas que ligam/desligam mensagem ──────────
  foreach v_t in array v_config loop
    if to_regclass('public.' || v_t) is not null then
      execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) as linhas, count(*) as n from public.%I t', v_t)
        into r;
      insert into public.carbo_foto_esteira (foto, tipo, nome, extra)
      values (p_foto, 'config', v_t, jsonb_build_object('linhas', r.linhas, 'n', r.n));
      v_config_n := v_config_n + 1;
    end if;
  end loop;

  -- ── MEDIDA: cards por etapa (falhar aqui não derruba a foto) ───────────
  begin
    select jsonb_object_agg(etapa, n) into v_medida
      from (select etapa, count(*) as n from public.bling2_esteira group by etapa) s;
  exception when others then
    v_medida := jsonb_build_object('erro', sqlerrm);
  end;
  insert into public.carbo_foto_esteira (foto, tipo, nome, extra)
  values (p_foto, 'medida', 'cards_por_etapa', v_medida);

  return jsonb_build_object('foto', p_foto, 'views', v_views, 'funcoes', v_funcoes,
                            'crons', v_crons, 'config', v_config_n, 'cards_por_etapa', v_medida);
end $$;

revoke execute on function public.carbo_foto_esteira_tirar(text) from public, anon, authenticated;


create or replace function public.carbo_foto_esteira_restaurar(
  p_foto text,
  p_ensaio boolean default true,
  p_desligar_crons_novos boolean default true
)
returns jsonb
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  r record; g record;
  v_rel jsonb := jsonb_build_object('foto', p_foto, 'ensaio', p_ensaio,
                   'funcoes', '[]'::jsonb, 'views', '[]'::jsonb, 'crons', '[]'::jsonb,
                   'config', '[]'::jsonb, 'nao_volta', '[]'::jsonb);
  v_dropar boolean := false;
  v_cols jsonb; v_def text; v_opts text; v_pk text[]; v_set text; v_cmp text;
  v_n int; v_tot int; v_linha jsonb; v_jobid bigint;
  v_refeitas text[] := '{}';
begin
  if not exists (select 1 from public.carbo_foto_esteira where foto = p_foto) then
    raise exception 'A foto "%" não existe.', p_foto;
  end if;

  begin
    -- ── 1. Views que mudaram de COLUNAS não voltam com create or replace:
    --       derruba TODAS as da foto (dependentes primeiro) e recria depois.
    --       ⚠️ Sem CASCADE: view nova criada depois da foto em cima delas faz
    --       o drop falhar, e o restaurar inteiro aborta dizendo qual.
    for r in select * from public.carbo_foto_esteira where foto = p_foto and tipo = 'view' loop
      select jsonb_agg(a.attname order by a.attnum) into v_cols
        from pg_attribute a where a.attrelid = to_regclass('public.' || quote_ident(r.nome))
         and a.attnum > 0 and not a.attisdropped;
      if v_cols is not null and v_cols is distinct from r.extra -> 'colunas' then
        v_dropar := true;
      end if;
    end loop;

    if v_dropar then
      for r in select * from public.carbo_foto_esteira
                where foto = p_foto and tipo = 'view' order by ordem desc, nome loop
        if to_regclass('public.' || quote_ident(r.nome)) is not null then
          execute format('drop view public.%I', r.nome);
        end if;
      end loop;
    end if;

    -- ── 2. Funções (antes das views: elas usam as funções) ───────────────
    for r in select * from public.carbo_foto_esteira where foto = p_foto and tipo = 'funcao' order by nome loop
      v_def := case when to_regprocedure(r.nome) is null then null
                    else pg_get_functiondef(to_regprocedure(r.nome)) end;
      if v_def is distinct from r.definicao then
        begin
          execute r.definicao;
        exception when invalid_function_definition then
          -- mudou o TIPO de retorno: create or replace recusa (42P13)
          execute format('drop function %s', r.nome);
          execute r.definicao;
        end;
        for g in select * from jsonb_to_recordset(r.extra -> 'grants') as x(grantee text, privilegio text) loop
          execute format('grant %s on function %s to %s', g.privilegio, r.nome,
                         case when g.grantee = 'PUBLIC' then 'public' else quote_ident(g.grantee) end);
        end loop;
        v_rel := jsonb_set(v_rel, '{funcoes}', (v_rel -> 'funcoes') || to_jsonb(r.nome));
      end if;
    end loop;

    -- ── 3. Views, da base para o topo ────────────────────────────────────
    for r in select * from public.carbo_foto_esteira
              where foto = p_foto and tipo = 'view' order by ordem, nome loop
      v_def := case when to_regclass('public.' || quote_ident(r.nome)) is null then null
                    else pg_get_viewdef(to_regclass('public.' || quote_ident(r.nome)), false) end;
      v_opts := case when jsonb_typeof(r.extra -> 'reloptions') = 'array'
                     then array_to_string(array(select jsonb_array_elements_text(r.extra -> 'reloptions')), ', ')
                     end;
      if v_def is distinct from r.definicao
         or (select coalesce(to_jsonb(c.reloptions), 'null'::jsonb) from pg_class c
              where c.oid = to_regclass('public.' || quote_ident(r.nome)))
            is distinct from coalesce(r.extra -> 'reloptions', 'null'::jsonb) then
        -- ⚠️ `with (...)` SEMPRE que a foto tinha: create or replace sem ele
        -- APAGA o security_invoker (a lição da 20260946).
        execute format('create or replace view public.%I %s as %s', r.nome,
                       case when coalesce(v_opts, '') = '' then '' else 'with (' || v_opts || ')' end,
                       rtrim(r.definicao, '; ' || chr(10)));
        for g in select * from jsonb_to_recordset(r.extra -> 'grants') as x(grantee text, privilegio text) loop
          execute format('grant %s on public.%I to %s', g.privilegio, r.nome,
                         case when g.grantee = 'PUBLIC' then 'public' else quote_ident(g.grantee) end);
        end loop;
        v_rel := jsonb_set(v_rel, '{views}', (v_rel -> 'views') || to_jsonb(r.nome));
      end if;
    end loop;

    -- ── 4. Cron ──────────────────────────────────────────────────────────
    if to_regclass('cron.job') is not null then
      for r in select * from public.carbo_foto_esteira where foto = p_foto and tipo = 'cron' loop
        if r.extra ->> 'jobname' is null then continue; end if;   -- job sem nome: só registro
        execute 'select jobid from cron.job where jobname = $1' into v_jobid using r.extra ->> 'jobname';
        if v_jobid is null then
          execute 'select cron.schedule($1, $2, $3)' into v_jobid
            using r.extra ->> 'jobname', r.extra ->> 'schedule', r.definicao;
          execute 'select cron.alter_job($1, active := $2)' using v_jobid, (r.extra ->> 'active')::boolean;
          v_rel := jsonb_set(v_rel, '{crons}', (v_rel -> 'crons') || to_jsonb('recriado: ' || (r.extra ->> 'jobname')));
        elsif exists (select 1 from cron.job j where j.jobid = v_jobid
                        and (j.schedule is distinct from r.extra ->> 'schedule'
                          or j.command  is distinct from r.definicao
                          or j.active   is distinct from (r.extra ->> 'active')::boolean)) then
          execute 'select cron.alter_job($1, $2, $3, null, null, $4)'
            using v_jobid, r.extra ->> 'schedule', r.definicao, (r.extra ->> 'active')::boolean;
          v_rel := jsonb_set(v_rel, '{crons}', (v_rel -> 'crons') || to_jsonb('voltou: ' || (r.extra ->> 'jobname')));
        end if;
      end loop;
      -- cron que NASCEU depois da foto: desliga (nunca apaga)
      for r in execute 'select jobid, jobname from cron.job where active and jobname is not null' loop
        if not exists (select 1 from public.carbo_foto_esteira f
                        where f.foto = p_foto and f.tipo = 'cron' and f.extra ->> 'jobname' = r.jobname) then
          if p_desligar_crons_novos then
            execute 'select cron.alter_job($1, active := false)' using r.jobid;
            v_rel := jsonb_set(v_rel, '{crons}', (v_rel -> 'crons') || to_jsonb('desligado (novo): ' || r.jobname));
          else
            v_rel := jsonb_set(v_rel, '{nao_volta}', (v_rel -> 'nao_volta') || to_jsonb('cron novo ligado: ' || r.jobname));
          end if;
        end if;
      end loop;
    end if;

    -- ── 5. Config: atualiza as linhas pela chave primária ────────────────
    for r in select * from public.carbo_foto_esteira where foto = p_foto and tipo = 'config' loop
      if to_regclass('public.' || quote_ident(r.nome)) is null then
        v_rel := jsonb_set(v_rel, '{nao_volta}', (v_rel -> 'nao_volta') || to_jsonb('tabela sumiu: ' || r.nome));
        continue;
      end if;
      select array_agg(a.attname::text order by a.attnum) into v_pk
        from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
       where i.indrelid = to_regclass('public.' || quote_ident(r.nome)) and i.indisprimary;
      if v_pk is null then
        v_rel := jsonb_set(v_rel, '{nao_volta}', (v_rel -> 'nao_volta') || to_jsonb('sem chave primária: ' || r.nome));
        continue;
      end if;
      -- colunas comuns à foto e à tabela de hoje, fora a chave e as geradas
      select string_agg(format('%I = s.%I', a.attname, a.attname), ', ' order by a.attnum),
             string_agg(format('t.%I', a.attname), ', ' order by a.attnum) || ') is distinct from row(' ||
             string_agg(format('s.%I', a.attname), ', ' order by a.attnum)
        into v_set, v_cmp
        from pg_attribute a
       where a.attrelid = to_regclass('public.' || quote_ident(r.nome))
         and a.attnum > 0 and not a.attisdropped and a.attgenerated = '' and a.attidentity <> 'a'
         and a.attname <> all (v_pk)
         and (r.extra -> 'linhas' -> 0) ? a.attname;
      if v_set is null then continue; end if;
      v_tot := 0;
      for v_linha in select * from jsonb_array_elements(r.extra -> 'linhas') loop
        execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) s where %s and row(%s)',
                       r.nome, v_set, r.nome,
                       (select string_agg(format('t.%I = s.%I', k, k), ' and ') from unnest(v_pk) k),
                       v_cmp)
          using v_linha;
        get diagnostics v_n = row_count;
        v_tot := v_tot + v_n;
      end loop;
      if v_tot > 0 then
        v_rel := jsonb_set(v_rel, '{config}', (v_rel -> 'config') || to_jsonb(r.nome || ': ' || v_tot || ' linha(s)'));
      end if;
    end loop;

    if p_ensaio then
      raise exception using errcode = 'P0001', message = '__ensaio__';
    end if;
  exception when others then
    if sqlerrm <> '__ensaio__' then raise; end if;   -- erro de verdade: aborta TUDO
  end;

  return v_rel;
end $$;

revoke execute on function public.carbo_foto_esteira_restaurar(text, boolean, boolean) from public, anon, authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — TIRAR A FOTO (antes de qualquer mudança da reforma)         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
select public.carbo_foto_esteira_tirar('antes-reforma-2026-11-14');


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — PROVAR que a volta funciona (ensaio: não muda nada)         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Logo depois da foto, o esperado é TUDO VAZIO: nada mudou ainda.
select public.carbo_foto_esteira_restaurar('antes-reforma-2026-11-14');


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ ROLLBACK DE VERDADE — só se a reforma quebrar                         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- 1º o ensaio (mostra o que vai voltar):
--   select public.carbo_foto_esteira_restaurar('antes-reforma-2026-11-14');
-- 2º o de verdade:
--   select public.carbo_foto_esteira_restaurar('antes-reforma-2026-11-14', false);
-- 3º o código (edge functions e telas): ver docs/esteira/README.md, "Rollback".
