-- ═══════════════════════════════════════════════════════════════════════════
-- Recuperação de carrinho: a 2ª e a 3ª mensagem saem numa HORA DO DIA
--
-- Pedido do dono do processo em 07/10/2026, antes de ligar a régua:
--   *"carrinho abandonado 1 precisa de menos tempo, 15min no max, 60min já é
--    fuga total — mensagem 2 9h da manhã do d+1 e a mensagem 3 9h da manhã
--    sendo d+3"*
--
--   antes   1ª 60 min após o abandono · 2ª 23 h após a 1ª · 3ª 48 h após a 2ª
--   agora   1ª 15 min após o abandono · 2ª 9h do dia seguinte à 1ª ·
--           3ª 9h de dois dias depois da 2ª   (= D+1 e D+3 do dia da 1ª)
--
-- ── As decisões ──────────────────────────────────────────────────────────
--
-- 1. ⚠️ O dia conta da MENSAGEM ANTERIOR, não do abandono. No caso comum
--    (abandono de dia, 1ª 15 min depois) dá exatamente D+1 e D+3. Mas quem
--    abandona às 22h30 recebe a 1ª às 8h do dia seguinte (a janela 8–22 a
--    segura) — contando do abandono, a 2ª sairia às 9h desse MESMO dia, uma
--    hora depois da 1ª. É a regra que já existia: "o relógio de cada passo
--    começa no passo ANTERIOR", senão os passos se amontoam.
--
-- 2. ⚠️ Nem a `carbo_carrinho_pipeline` nem a `carbo_msg_fila` mudam de forma:
--    as duas faziam `msg1_em + (horas_2 || ' hours')`, e o que muda é só QUANTAS
--    horas — agora calculadas por carrinho, até as 9h do dia certo, pela
--    `carbo_carrinho_horas_ate`. A troca é feita no texto VIVO das views
--    (`pg_get_viewdef`), nunca no da migração que as criou, com trava que
--    ABORTA se o trecho não for achado exatamente uma vez. O texto de antes vai
--    para `carbo_backup_viewdef` (tabela real) ANTES da troca.
--
-- 3. Configuração, não código: `hora_2`/`dias_2` e `hora_3`/`dias_3` em
--    `carbo_carrinho_config`. `hora_2` NULO volta ao modo antigo (`horas_2`
--    corridas) — desfazer é um UPDATE.
--
-- 4. A janela 8–22 dos templates continua valendo e não conflita: 9h está
--    dentro dela.
--
-- ⚠️ RODE EM BLOCOS, na ordem. Nada aqui ENVIA: os templates de carrinho
-- estão `ativo = false`.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a configuração e a conta                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
alter table public.carbo_carrinho_config
  add column if not exists hora_2 int check (hora_2 between 0 and 23),
  add column if not exists dias_2 int not null default 1 check (dias_2 >= 1),
  add column if not exists hora_3 int check (hora_3 between 0 and 23),
  add column if not exists dias_3 int not null default 2 check (dias_3 >= 1);

comment on column public.carbo_carrinho_config.hora_2 is
  'Hora do dia (Brasilia) em que sai a 2a mensagem, dias_2 dias DEPOIS do dia da 1a. NULL = modo antigo: horas_2 horas corridas apos a 1a.';
comment on column public.carbo_carrinho_config.hora_3 is
  'Hora do dia (Brasilia) em que sai a 3a mensagem, dias_3 dias DEPOIS do dia da 2a. NULL = modo antigo: horas_3 horas corridas apos a 2a.';

-- Quantas horas separam a mensagem ANTERIOR da próxima. É o número que as
-- views já somavam (`anterior + (horas || ' hours')`), agora por carrinho.
create or replace function public.carbo_carrinho_horas_ate(p_anterior timestamptz, p_passo int)
returns numeric
language sql
stable
set search_path = public
as $$
  select case
    when p_anterior is null then null
    when x.hora is null     then x.horas::numeric
    else extract(epoch from (
           ((timezone('America/Sao_Paulo', p_anterior)::date + x.dias)
              + make_time(x.hora, 0, 0)) at time zone 'America/Sao_Paulo'
           - p_anterior)) / 3600.0
  end
  from (select case when p_passo = 2 then c.horas_2 else c.horas_3 end as horas,
               case when p_passo = 2 then c.hora_2  else c.hora_3  end as hora,
               case when p_passo = 2 then c.dias_2  else c.dias_3  end as dias
          from public.carbo_carrinho_config c
         where c.id) x;
$$;

comment on function public.carbo_carrinho_horas_ate(timestamptz, int) is
  'Horas entre a mensagem anterior e a proxima da regua de carrinho (passo 2 ou 3). Com hora_N preenchida: ate as hora_N:00 (Brasilia) de dias_N dias depois do dia da anterior. Sem: horas_N corridas. Lida pela carbo_carrinho_pipeline (proxima_em) e pela carbo_msg_fila (quando sai) — a MESMA conta nos dois lugares.';

-- A cadência pedida.
update public.carbo_carrinho_config
   set minutos_1 = 15,
       hora_2 = 9, dias_2 = 1,
       hora_3 = 9, dias_3 = 2
 where id;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — as duas views passam a usar a conta (no texto VIVO)          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
create table if not exists public.carbo_backup_viewdef (
  id          bigserial primary key,
  nome        text not null,
  def         text not null,
  opcoes      text,
  motivo      text,
  guardado_em timestamptz not null default now()
);
alter table public.carbo_backup_viewdef enable row level security;

do $$
declare
  r       record;
  v_def   text;
  v_opts  text;
  v_novo  text;
  v_n     int;
begin
  for r in
    select * from (values
      -- ⚠️ Na pipeline o `pg_get_viewdef` escreve a coluna SEM o alias `b.`
      -- (o FROM final tem uma tabela só); na fila ela vem como `p.`.
      ('carbo_carrinho_pipeline', '(b\.)?', ''),
      ('carbo_msg_fila',          'p\.',    'p.')
    ) t(nome, padrao, alias)
  loop
    select pg_get_viewdef(c.oid), array_to_string(c.reloptions, ', ')
      into v_def, v_opts
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = r.nome;

    if v_def is null then
      raise exception 'View public.% não encontrada', r.nome;
    end if;
    if v_def ~ 'carbo_carrinho_horas_ate' then
      raise notice '% já usa carbo_carrinho_horas_ate — nada a fazer', r.nome;
      continue;
    end if;

    -- ⚠️ Exatamente UM trecho de cada, e colado à mensagem certa. Achar zero ou
    -- dois é sinal de que a view viva não é a que esta migração conhece:
    -- ABORTA tudo, nada muda.
    select count(*) into v_n from regexp_matches(v_def,
      r.padrao || 'msg1_em\s*\+\s*\(+\s*SELECT\s+cfg\.horas_2\s+FROM\s+cfg', 'g');
    if v_n <> 1 then
      raise exception '%: esperava 1 trecho "msg1_em + horas_2", achei %', r.nome, v_n;
    end if;
    select count(*) into v_n from regexp_matches(v_def,
      r.padrao || 'msg2_em\s*\+\s*\(+\s*SELECT\s+cfg\.horas_3\s+FROM\s+cfg', 'g');
    if v_n <> 1 then
      raise exception '%: esperava 1 trecho "msg2_em + horas_3", achei %', r.nome, v_n;
    end if;

    insert into public.carbo_backup_viewdef (nome, def, opcoes, motivo)
    values (r.nome, v_def, v_opts, '20261054 — antes da cadência por hora do dia');

    -- Só o miolo do subselect muda; os parênteses e o `|| ' hours'` ficam.
    v_novo := regexp_replace(v_def, 'SELECT\s+cfg\.horas_2\s+FROM\s+cfg',
                'SELECT public.carbo_carrinho_horas_ate(' || r.alias || 'msg1_em, 2)');
    v_novo := regexp_replace(v_novo, 'SELECT\s+cfg\.horas_3\s+FROM\s+cfg',
                'SELECT public.carbo_carrinho_horas_ate(' || r.alias || 'msg2_em, 3)');

    -- ⚠️ As reloptions (security_invoker) vão JUNTO: `create or replace view`
    -- sem `with` as APAGA.
    execute format('create or replace view public.%I %s as %s',
                   r.nome,
                   case when v_opts is null then '' else 'with (' || v_opts || ')' end,
                   rtrim(v_novo, '; '));
  end loop;
end
$$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — a sincronização da Nuvemshop de 15 em 15 para 5 em 5 min    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- Com a 1ª mensagem a 15 min do abandono, um sync de 15 min faria o carrinho
-- ser DESCOBERTO até 15 min depois — a 1ª sairia com até ~30 min. `alter_job`
-- muda só o horário: o comando (e o segredo dentro dele) fica intacto.
-- ⚠️ O nome do job continua "-15min" — `alter_job` não renomeia.
select cron.alter_job(j.jobid, schedule := '4-59/5 * * * *')
  from cron.job j
 where j.jobname = 'nuvemshop-carrinhos-15min';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA                                                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- (a) A conta. ESPERADO: 2ª às 09:00 do dia seguinte, 3ª às 09:00 de dois
--     dias depois, nos três horários de exemplo.
-- select x.msg_anterior_brasilia,
--        timezone('America/Sao_Paulo', x.t + (public.carbo_carrinho_horas_ate(x.t, 2) || ' hours')::interval) as segunda,
--        timezone('America/Sao_Paulo', x.t + (public.carbo_carrinho_horas_ate(x.t, 3) || ' hours')::interval) as terceira_se_esta_fosse_a_2a
--   from (select v as msg_anterior_brasilia, v at time zone 'America/Sao_Paulo' as t
--           from unnest(array['2026-10-07 08:00'::timestamp, '2026-10-07 15:03', '2026-10-07 21:59']) v) x;
--
-- (b) As views usam a conta e mantêm o security_invoker.
-- select relname, reloptions,
--        pg_get_viewdef(oid) like '%carbo_carrinho_horas_ate%' as usa_a_conta
--   from pg_class where relname in ('carbo_carrinho_pipeline','carbo_msg_fila');
--
-- (c) O agendamento.
-- select jobname, schedule, active from cron.job where jobname = 'nuvemshop-carrinhos-15min';
