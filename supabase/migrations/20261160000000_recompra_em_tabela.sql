-- 20261160 — a régua de recompra em TABELA (16/11/2026)
--
-- Escala de 100× (pedido do dono do processo): a `carbo_recompra_pipeline` lia a
-- esteira inteira e, por pedido entregue, rodava subconsultas (recompra, envio,
-- oferta). No teste local a 100× só a coluna "ofertar" levava 4,4 s — e a fila de
-- mensagens (8 s de teto) a lê a cada minuto.
--
-- Hoje: `carbo_recompra_base` guarda UMA linha por pedido entregue, com tudo que só
-- muda quando alguma fonte muda; a view `carbo_recompra_pipeline` (mesmo nome, mesmas
-- colunas, mesmo objeto) é um `select` dela + as duas colunas que dependem da DATA
-- DE HOJE (`dias_desde_entrega`, `coluna`), calculadas na leitura — porque "hoje"
-- anda sozinho e nenhuma fonte muda quando o dia vira.
--
-- Quem mantém a tabela: `carbo_recompra_atualizar()` (cron de 1 min), no molde do
-- robô da esteira (20261157/58). A regra da régua continua na view antiga
-- `carbo_recompra_calc` + na função `carbo_recompra_calcular(ids)`.
--
-- ⚠️ Ela lê `carbo_esteira_cards`: depende da 20261157. Volta: BLOCO R.

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — índices das fontes                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
create index if not exists carbo_entrega_carimbo_criado_idx on public.carbo_entrega_carimbo (criado_em);
create index if not exists carbo_msg_envios_recompra_env_idx
  on public.carbo_msg_envios (enviado_em) where etapa = 'recompra';
create index if not exists carbo_msg_envios_recompra_det_idx
  on public.carbo_msg_envios (detectado_em) where etapa = 'recompra';
create index if not exists carbo_esteira_cards_calc_idx
  on public.carbo_esteira_cards (calculado_em);

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a tabela, a função de cálculo e o robô                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
do $$
declare
  v_def  text;
  v_opts text;
  v_fn   text;
  v_n    int;
begin
  select pg_get_viewdef(c.oid), array_to_string(c.reloptions, ', ')
    into v_def, v_opts
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'carbo_recompra_pipeline' and c.relkind = 'v';
  if v_def is null then
    raise exception 'View public.carbo_recompra_pipeline não encontrada';
  end if;
  if v_def ~* 'carbo_recompra_base' then
    raise notice 'BLOCO 2: a recompra já é tabela — pulando';
    return;
  end if;

  v_def := regexp_replace(rtrim(v_def, E'; \n'), E'\\s+$', '');

  execute format('create or replace view public.carbo_recompra_calc %s as %s',
                 case when v_opts is null then '' else 'with (' || v_opts || ')' end, v_def);

  if to_regclass('public.carbo_recompra_base') is null then
    create table public.carbo_recompra_base as
      select bling_id, pedido_loja, canal, cliente, cliente_fone, cpf_cnpj, total,
             entrega_cidade, entrega_uf, entregue_em, origem_da_data as origem,
             ofertado_em, recomprou
        from public.carbo_recompra_calc with no data;
    alter table public.carbo_recompra_base add column contato_id bigint;
    alter table public.carbo_recompra_base add column calculado_em timestamptz not null default now();
    alter table public.carbo_recompra_base add primary key (bling_id);
    create index carbo_recompra_base_cpf_idx     on public.carbo_recompra_base (cpf_cnpj) where cpf_cnpj is not null;
    create index carbo_recompra_base_contato_idx on public.carbo_recompra_base (contato_id);
    create index carbo_recompra_base_varredura_idx on public.carbo_recompra_base (calculado_em)
      where not recomprou and origem <> 'historico';
  end if;

  -- A função = o texto VIVO da view, com o filtro por ids no CTE `entregue`.
  v_fn := v_def;
  select count(*) into v_n from regexp_matches(v_fn, 'WHERE\s+\(?e\.etapa\s*=\s*''entregue''(::text)?\)?', 'g');
  if v_n <> 1 then raise exception 'esperava 1 filtro etapa = entregue na view da recompra, achei %', v_n; end if;
  v_fn := regexp_replace(v_fn, 'WHERE\s+\(?e\.etapa\s*=\s*''entregue''(::text)?\)?',
                         'WHERE (e.etapa = ''entregue''::text) AND e.bling_id = ANY (p_ids)');

  execute 'create or replace function public.carbo_recompra_calcular(p_ids bigint[]) '
       || 'returns setof public.carbo_recompra_calc language sql stable security definer '
       || 'set search_path = public as $fn$ ' || v_fn || ' $fn$';
end $$;
revoke all on function public.carbo_recompra_calcular(bigint[]) from public, anon, authenticated;

create table if not exists public.carbo_recompra_pendentes (
  bling_id bigint primary key,
  desde    timestamptz not null default now()
);
create table if not exists public.carbo_recompra_estado (
  id             boolean primary key default true check (id),
  ultima_leitura timestamptz
);
insert into public.carbo_recompra_estado (id) values (true) on conflict do nothing;
create table if not exists public.carbo_recompra_atualizacao_log (
  id               bigserial primary key,
  em               timestamptz not null default now(),
  detectados       int not null,
  pendentes_antes  int not null,
  processados      int not null,
  pendentes_depois int not null,
  ms               int not null
);
create index if not exists carbo_recompra_atualizacao_log_em_idx on public.carbo_recompra_atualizacao_log (em);

alter table public.carbo_recompra_base              enable row level security;
alter table public.carbo_recompra_pendentes         enable row level security;
alter table public.carbo_recompra_estado            enable row level security;
alter table public.carbo_recompra_atualizacao_log   enable row level security;
drop policy if exists carbo_recompra_base_ler on public.carbo_recompra_base;
create policy carbo_recompra_base_ler on public.carbo_recompra_base
  for select to authenticated using ((select public.carbo_e_time_interno()));
grant select on public.carbo_recompra_base to authenticated;

create or replace function public.carbo_recompra_atualizar(p_limite int default 3000, p_varredura int default 500)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ini    timestamptz := clock_timestamp();
  v_desde  timestamptz;
  v_det    int := 0;
  v_n      int;
  v_k      int := 0;
  v_antes  int;
  v_ids    bigint[];
  v_depois int;
begin
  if not pg_try_advisory_xact_lock(hashtext('carbo_recompra_atualizar')) then
    return jsonb_build_object('pulou', true);
  end if;

  select ultima_leitura into v_desde from carbo_recompra_estado where id;
  v_desde := coalesce(v_desde, now() - interval '15 minutes') - interval '2 minutes';

  insert into carbo_recompra_pendentes (bling_id)
  select distinct id from (
    -- entrega nova (carimbo) ou cartão entregue recalculado (telefone, cidade…)
    select bling_id as id from carbo_entrega_carimbo where criado_em >= v_desde
    union all
    select bling_id from carbo_esteira_cards
     where etapa = 'entregue' and bling_id > 0 and calculado_em >= v_desde
    union all
    -- a oferta foi criada ou enviada
    select bling_id from carbo_msg_envios
     where etapa = 'recompra' and (enviado_em >= v_desde or detectado_em >= v_desde)
    union all
    -- o cadastro do cliente mudou
    select b.bling_id from carbo_recompra_base b
      join bling2_contacts c on c.bling_id = b.contato_id
     where c.updated_at >= v_desde
    union all
    -- ⚠️ "recomprou": OUTRO pedido do mesmo documento andou. Só pedido recente
    -- pode ser recompra de alguém (a varredura de 30 min dos cartões abertos
    -- recalcula cartão velho sem que nada tenha mudado).
    select b.bling_id from carbo_esteira_cards k
      join bling2_orders o on o.bling_id = k.bling_id
      join bling2_contacts c on c.bling_id = o.contato_id and c.cpf_cnpj is not null
      join carbo_recompra_base b on b.cpf_cnpj = c.cpf_cnpj
     where k.calculado_em >= v_desde and k.bling_id > 0
       and k.data_pedido >= current_date - 30
  ) q
  on conflict do nothing;
  get diagnostics v_n = row_count; v_det := v_det + v_n;

  -- rede: entregue (com carimbo) que ainda não tem linha — de 10 em 10 minutos
  if extract(minute from now())::int % 10 = 0 then
    insert into carbo_recompra_pendentes (bling_id)
    select k.bling_id from carbo_esteira_cards k
      join carbo_entrega_carimbo ca on ca.bling_id = k.bling_id
     where k.etapa = 'entregue' and k.bling_id > 0
       and not exists (select 1 from carbo_recompra_base b where b.bling_id = k.bling_id)
     limit 5000
    on conflict do nothing;
    get diagnostics v_n = row_count; v_det := v_det + v_n;
  end if;

  -- varredura: relê as linhas que ainda podem mudar e não foram vistas há 24 h
  insert into carbo_recompra_pendentes (bling_id)
  select bling_id from carbo_recompra_base
   where not recomprou and origem <> 'historico' and calculado_em < now() - interval '24 hours'
   order by calculado_em limit p_varredura
  on conflict do nothing;

  select count(*) into v_antes from carbo_recompra_pendentes;

  select coalesce(array_agg(bling_id), '{}') into v_ids from (
    select bling_id from carbo_recompra_pendentes order by desde, bling_id limit p_limite) s;

  if cardinality(v_ids) > 0 then
    delete from carbo_recompra_base where bling_id = any (v_ids);
    insert into carbo_recompra_base
      (bling_id, pedido_loja, canal, cliente, cliente_fone, cpf_cnpj, total,
       entrega_cidade, entrega_uf, entregue_em, origem, ofertado_em, recomprou, contato_id, calculado_em)
    select x.bling_id, x.pedido_loja, x.canal, x.cliente, x.cliente_fone, x.cpf_cnpj, x.total,
           x.entrega_cidade, x.entrega_uf, x.entregue_em, x.origem_da_data, x.ofertado_em, x.recomprou,
           bo.contato_id, now()
      from carbo_recompra_calcular(v_ids) x
      join bling2_orders bo on bo.bling_id = x.bling_id;
    delete from carbo_recompra_pendentes where bling_id = any (v_ids);
    v_k := cardinality(v_ids);
  end if;

  update carbo_recompra_estado set ultima_leitura = v_ini where id;
  select count(*) into v_depois from carbo_recompra_pendentes;

  insert into carbo_recompra_atualizacao_log (detectados, pendentes_antes, processados, pendentes_depois, ms)
  values (v_det, v_antes, v_k, v_depois, (extract(epoch from clock_timestamp() - v_ini) * 1000)::int);
  delete from carbo_recompra_atualizacao_log where em < now() - interval '7 days';

  return jsonb_build_object('detectados', v_det, 'processados', v_k, 'pendentes', v_depois);
end $$;
revoke all on function public.carbo_recompra_atualizar(int, int) from public, anon, authenticated;

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — preenche, confere nos dois sentidos e troca a view          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
do $$
declare
  v_def    text;
  v_opts   text;
  v_inicio timestamptz := clock_timestamp();
  v_calc   bigint;
  v_so_a   bigint;
  v_so_b   bigint;
  v_cols   text := 'bling_id, pedido_loja, canal, cliente, cliente_fone, cpf_cnpj, total, entrega_cidade, entrega_uf, entregue_em, origem_da_data, ofertado_em, recomprou, dias_desde_entrega, coluna';
begin
  select pg_get_viewdef(c.oid), array_to_string(c.reloptions, ', ')
    into v_def, v_opts
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'carbo_recompra_pipeline' and c.relkind = 'v';
  if v_def ~* 'carbo_recompra_base' then
    raise notice 'BLOCO 3: a recompra já é tabela — pulando';
    return;
  end if;
  if to_regclass('public.carbo_recompra_calc') is null or to_regclass('public.carbo_recompra_base') is null then
    raise exception 'rode o BLOCO 2 antes';
  end if;

  truncate public.carbo_recompra_base;
  insert into public.carbo_recompra_base
    (bling_id, pedido_loja, canal, cliente, cliente_fone, cpf_cnpj, total,
     entrega_cidade, entrega_uf, entregue_em, origem, ofertado_em, recomprou, contato_id, calculado_em)
  select x.bling_id, x.pedido_loja, x.canal, x.cliente, x.cliente_fone, x.cpf_cnpj, x.total,
         x.entrega_cidade, x.entrega_uf, x.entregue_em, x.origem_da_data, x.ofertado_em, x.recomprou,
         bo.contato_id, now()
    from public.carbo_recompra_calc x
    join public.bling2_orders bo on bo.bling_id = x.bling_id;
  analyze public.carbo_recompra_base;

  -- a view nova, escrita à parte para ser CONFERIDA contra a antiga antes da troca
  create or replace view public.carbo_recompra_nova with (security_invoker = true) as
   WITH cfg AS (SELECT dias_para_ofertar, dias_para_desistir FROM public.carbo_recompra_config WHERE id)
   SELECT r.bling_id, r.pedido_loja, r.canal, r.cliente, r.cliente_fone, r.cpf_cnpj, r.total,
          r.entrega_cidade, r.entrega_uf, r.entregue_em, r.origem AS origem_da_data, r.ofertado_em, r.recomprou,
          (CURRENT_DATE - r.entregue_em::date) AS dias_desde_entrega,
          CASE WHEN r.recomprou THEN 'recomprou'
               WHEN r.origem = 'historico' THEN 'historico'
               WHEN r.ofertado_em IS NOT NULL AND (CURRENT_DATE - r.ofertado_em::date) > (SELECT dias_para_desistir FROM cfg) THEN 'sem_retorno'
               WHEN r.ofertado_em IS NOT NULL THEN 'ofertado'
               WHEN (CURRENT_DATE - r.entregue_em::date) >= (SELECT dias_para_ofertar FROM cfg) THEN 'ofertar'
               ELSE 'entregue' END AS coluna
     FROM public.carbo_recompra_base r;

  execute 'select count(*) from public.carbo_recompra_calc' into v_calc;
  execute format('select count(*) from (select %s from public.carbo_recompra_calc except select %s from public.carbo_recompra_nova) a', v_cols, v_cols) into v_so_a;
  execute format('select count(*) from (select %s from public.carbo_recompra_nova except select %s from public.carbo_recompra_calc) b', v_cols, v_cols) into v_so_b;
  if v_so_a + v_so_b > greatest(10, v_calc * 0.005) then
    drop view public.carbo_recompra_nova;
    raise exception 'ABORTADO: a tabela diverge da view (só na antiga: %, só na nova: %, de % linhas). Nada foi trocado.',
      v_so_a, v_so_b, v_calc;
  end if;
  drop view public.carbo_recompra_nova;

  insert into public.carbo_backup_viewdef (nome, def, opcoes, motivo)
  values ('carbo_recompra_pipeline', v_def, v_opts, '20261160 — antes da recompra em tabela');

  create or replace view public.carbo_recompra_pipeline with (security_invoker = true) as
   WITH cfg AS (SELECT dias_para_ofertar, dias_para_desistir FROM public.carbo_recompra_config WHERE id)
   SELECT r.bling_id, r.pedido_loja, r.canal, r.cliente, r.cliente_fone, r.cpf_cnpj, r.total,
          r.entrega_cidade, r.entrega_uf, r.entregue_em, r.origem AS origem_da_data, r.ofertado_em, r.recomprou,
          (CURRENT_DATE - r.entregue_em::date) AS dias_desde_entrega,
          CASE WHEN r.recomprou THEN 'recomprou'
               WHEN r.origem = 'historico' THEN 'historico'
               WHEN r.ofertado_em IS NOT NULL AND (CURRENT_DATE - r.ofertado_em::date) > (SELECT dias_para_desistir FROM cfg) THEN 'sem_retorno'
               WHEN r.ofertado_em IS NOT NULL THEN 'ofertado'
               WHEN (CURRENT_DATE - r.entregue_em::date) >= (SELECT dias_para_ofertar FROM cfg) THEN 'ofertar'
               ELSE 'entregue' END AS coluna
     FROM public.carbo_recompra_base r;

  update public.carbo_recompra_estado set ultima_leitura = v_inicio - interval '5 minutes' where id;
  raise notice 'ok: % linhas; divergência na conferência % + %', v_calc, v_so_a, v_so_b;
end $$;

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — o robô, de minuto em minuto                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
select cron.unschedule(jobid) from cron.job where jobname = 'carbo-recompra-atualizar-1min';
select cron.schedule('carbo-recompra-atualizar-1min', '* * * * *', $$select public.carbo_recompra_atualizar()$$);
select public.carbo_recompra_atualizar();

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — o alarme da 20261159 passa a vigiar também este robô        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Mesmo molde: robô sem ler há mais de 5 min, ou agendamento sumido/desligado.
-- A recompra anda em dias, mas robô parado calado é a mesma doença da esteira.
create or replace function public.carbo_esteira_vigiar()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_atraso  interval;
  v_atraso_r interval;
  v_espera  interval;
  v_pend    int;
  v_job     record;
  v_motivo  text := null;
  v_est     public.carbo_esteira_alarme%rowtype;
  v_avisou  boolean := false;
begin
  select now() - ultima_leitura into v_atraso from carbo_esteira_estado where id;
  select now() - min(desde), count(*) into v_espera, v_pend from carbo_esteira_pendentes;
  select now() - ultima_leitura into v_atraso_r from carbo_recompra_estado where id;

  begin
    select active into v_job from cron.job where jobname = 'carbo-esteira-atualizar-1min';
    if not found then
      v_motivo := 'o agendamento carbo-esteira-atualizar-1min não existe mais';
    elsif not v_job.active then
      v_motivo := 'o agendamento carbo-esteira-atualizar-1min está desligado';
    end if;
    if v_motivo is null then
      select active into v_job from cron.job where jobname = 'carbo-recompra-atualizar-1min';
      if not found then
        v_motivo := 'o agendamento carbo-recompra-atualizar-1min não existe mais';
      elsif not v_job.active then
        v_motivo := 'o agendamento carbo-recompra-atualizar-1min está desligado';
      end if;
    end if;
  exception when others then
    null;
  end;

  if v_motivo is null and (v_atraso is null or v_atraso > interval '5 minutes') then
    v_motivo := 'o robô da esteira não atualiza há ' ||
                coalesce(round(extract(epoch from v_atraso) / 60)::text || ' min', 'tempo indeterminado');
  end if;
  if v_motivo is null and (v_atraso_r is null or v_atraso_r > interval '5 minutes') then
    v_motivo := 'o robô da recompra não atualiza há ' ||
                coalesce(round(extract(epoch from v_atraso_r) / 60)::text || ' min', 'tempo indeterminado');
  end if;
  if v_motivo is null and v_espera > interval '15 minutes' then
    v_motivo := 'há ' || v_pend || ' cartão(ões) esperando atualização, o mais antigo há ' ||
                round(extract(epoch from v_espera) / 60) || ' min — o robô não está dando conta';
  end if;

  select * into v_est from carbo_esteira_alarme where id;

  if v_motivo is not null then
    if v_est.aberto_desde is null or v_est.ultimo_aviso < now() - interval '1 hour' then
      insert into public.notifications (user_id, type, title, body, reference_type, reference_id, is_read)
      select p.id, 'esteira_robo_parado', 'Esteira do On-line parada',
             'Os cartões não estão sendo atualizados: ' || v_motivo ||
             '. Olhe carbo_esteira_atualizacao_log / carbo_recompra_atualizacao_log e os agendamentos carbo-esteira-atualizar-1min e carbo-recompra-atualizar-1min.',
             'esteira', null, false
        from public.profiles p
       where 'carbo_ti' = any (coalesce(p.allowed_interfaces, '{}'));
      v_avisou := true;
      update carbo_esteira_alarme
         set aberto_desde = coalesce(aberto_desde, now()), ultimo_aviso = now(), motivo = v_motivo
       where id;
    end if;
  elsif v_est.aberto_desde is not null then
    insert into public.notifications (user_id, type, title, body, reference_type, reference_id, is_read)
    select p.id, 'esteira_robo_voltou', 'Esteira do On-line normalizada',
           'Os robôs voltaram a atualizar. Parada desde ' ||
           to_char(v_est.aberto_desde at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') || '.',
           'esteira', null, false
      from public.profiles p
     where 'carbo_ti' = any (coalesce(p.allowed_interfaces, '{}'));
    v_avisou := true;
    update carbo_esteira_alarme set aberto_desde = null, ultimo_aviso = null, motivo = null where id;
  end if;

  return jsonb_build_object('problema', v_motivo, 'avisou', v_avisou,
                            'atraso_min', round(extract(epoch from v_atraso) / 60),
                            'atraso_recompra_min', round(extract(epoch from v_atraso_r) / 60),
                            'pendentes', v_pend);
end $$;
revoke all on function public.carbo_esteira_vigiar() from public, anon, authenticated;

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO R — VOLTA (rodar só se precisar)                                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- select cron.unschedule(jobid) from cron.job where jobname = 'carbo-recompra-atualizar-1min';
-- do $$ declare v record; begin
--   select def, opcoes into v from public.carbo_backup_viewdef
--    where nome = 'carbo_recompra_pipeline' and motivo like '20261160%' order by id desc limit 1;
--   if v.def is null then raise exception 'backup da view não encontrado'; end if;
--   execute format('create or replace view public.carbo_recompra_pipeline %s as %s',
--     case when v.opcoes is null then '' else 'with (' || v.opcoes || ')' end, rtrim(v.def, '; '));
-- end $$;
