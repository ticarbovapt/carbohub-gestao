-- ═══════════════════════════════════════════════════════════════════════════
-- Conversas: os números no MENU com a contagem, o aviso de conversas paradas
-- e a LIMPEZA do que ficou para trás (27/11/2026)
--
-- Pedido do dono do processo, com 694 "não respondidas" na caixa do CarboZé
-- (muitas de semanas atrás):
--   1. cada número vira item da barra lateral, com a bolinha de quantas estão
--      sem resposta — `carbo_wa_pendentes_por_numero()`;
--   2. ao abrir um número com conversa parada, a tela pede para responder ou
--      marcar resolvida, e a pessoa marca "Ciente" — `carbo_wa_aviso_ciente`
--      guarda quem viu, quando e quantas havia;
--   3. marcar como resolvida TUDO que parou até 24/11 —
--      `carbo_wa_resolver_antigas(corte, ensaio)`, só pelo SQL Editor.
--
-- ⚠️ A contagem é o ESPELHO da aba "Não respondidas" da tela
-- (`conversaDoResumo` + `statusEfetivo` em `apps/atendimento/src/lib/
-- conversas.ts`): mensagem do cliente depois da última resposta de gente e da
-- última marca de resolvida, e a conversa não está "aguardando"/"resolvido"
-- sem o cliente ter escrito depois. Mesma janela de 30 dias da caixa
-- (`carbo_wa_caixa_v2`). Mudou a regra lá, mude aqui.
--
-- ⚠️ A LIMPEZA não é decisão de ninguém do time. O histórico de status
-- (`carbo_wa_atendimento_hist`) ganha `origem = 'limpeza'` e `marca = false`:
--   · o Painel do atendimento NÃO conta essas conversas como "fechada sem
--     resposta" de ninguém (a rodada continua como estava: sem resposta);
--   · o Pós-venda NÃO tira a reclamação da fila por "resolvida na conversa"
--     (as duas leem só `marca`).
-- Quem liga isso é a marca local `carbo.origem_atendimento`, que só a função
-- de limpeza põe (o PostgREST não expõe `set_config`).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.carbo_backup_funcoes (
  feito_em  timestamptz not null default now(),
  funcao    text not null,
  definicao text not null
);

-- ── 1. O histórico aceita a origem "limpeza" ──────────────────────────────
do $do$
declare r record;
begin
  for r in
    select con.conname
      from pg_constraint con
     where con.conrelid = 'public.carbo_wa_atendimento_hist'::regclass
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%origem%'
  loop
    execute format('alter table public.carbo_wa_atendimento_hist drop constraint %I', r.conname);
  end loop;
end $do$;

alter table public.carbo_wa_atendimento_hist
  add constraint carbo_wa_atendimento_hist_origem_check
  check (origem in ('tela', 'retrato', 'resolvidas', 'limpeza'));

-- O gatilho grava a origem da marca local e, na limpeza, `marca = false`.
-- Troca no TEXTO VIVO, com backup; cada trecho tem de aparecer UMA vez.
do $do$
declare
  v_def text;
  v_n1  int;
  v_n2  int;
begin
  v_def := pg_get_functiondef('public.carbo_wa_atendimento_registra()'::regprocedure);
  if v_def ~* 'carbo\.origem_atendimento' then
    raise notice 'o histórico de status já conhece a limpeza';
    return;
  end if;
  select count(*) into v_n1 from regexp_matches(v_def, $p$now\(\),\s*'tela',$p$, 'g');
  select count(*) into v_n2 from regexp_matches(v_def,
    $p$tg_op\s*=\s*'INSERT'\s+or\s+new\.status\s+is\s+distinct\s+from\s+old\.status\s+or\s+new\.desde\s+is\s+distinct\s+from\s+old\.desde\)$p$, 'gi');
  if v_n1 <> 1 or v_n2 <> 1 then
    raise exception 'carbo_wa_atendimento_registra: esperava 1 e 1 trecho, achei % e %', v_n1, v_n2;
  end if;
  insert into public.carbo_backup_funcoes(funcao, definicao)
  values ('carbo_wa_atendimento_registra', v_def);
  v_def := regexp_replace(v_def, $p$now\(\),\s*'tela',$p$,
    $r$now(), coalesce(nullif(current_setting('carbo.origem_atendimento', true), ''), 'tela'),$r$);
  v_def := regexp_replace(v_def,
    $p$tg_op\s*=\s*'INSERT'\s+or\s+new\.status\s+is\s+distinct\s+from\s+old\.status\s+or\s+new\.desde\s+is\s+distinct\s+from\s+old\.desde\)$p$,
    $r$(tg_op = 'INSERT' or new.status is distinct from old.status or new.desde is distinct from old.desde)
       and coalesce(current_setting('carbo.origem_atendimento', true), '') <> 'limpeza')$r$, 'i');
  execute v_def;
  if pg_get_functiondef('public.carbo_wa_atendimento_registra()'::regprocedure) !~* 'carbo\.origem_atendimento' then
    raise exception 'a troca no histórico de status não pegou';
  end if;
end $do$;

-- ── 2. A contagem do menu ─────────────────────────────────────────────────
create or replace function public.carbo_wa_pendentes_por_numero(p_dias int default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(x.numero_id, x.n), '{}'::jsonb)
    from (
      select r.numero_id, count(*) as n
        from public.carbo_wa_resumo r
        join public.carbo_wa_numeros nu on nu.phone_number_id = r.numero_id and nu.ativo
        left join public.carbo_wa_atendimento a on a.numero_id = r.numero_id and a.wa_id = r.wa_id
       where (select public.carbo_e_time_interno())
         and r.ultima_em >= now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 120)))
         and cardinality(r.pendentes_em) > 0
         -- mensagem do cliente depois da última resposta de gente e da última
         -- marca de resolvida (a mesma conta do `conversaDoResumo`)
         and exists (
           select 1 from unnest(r.pendentes_em) t
            where t > coalesce(greatest(r.ultima_resposta_em,
                                        case when a.status = 'resolvido' then a.desde end),
                               '-infinity'::timestamptz))
         -- aguardando/resolvido só deixam de valer se o cliente escreveu depois
         and (coalesce(a.status, '') not in ('aguardando', 'resolvido')
              or coalesce(r.ultima_entrada_em > a.desde, false))
       group by r.numero_id
    ) x;
$$;

comment on function public.carbo_wa_pendentes_por_numero(int) is
  'Quantas conversas estão em "Não respondidas" em cada número ativo (a bolinha do menu do Atendimento). Espelho de conversaDoResumo/statusEfetivo, janela de 30 dias da caixa. jsonb {numero: n}. No SQL Editor volta vazia (guarda de time interno).';
revoke execute on function public.carbo_wa_pendentes_por_numero(int) from anon, public;
grant execute on function public.carbo_wa_pendentes_por_numero(int) to authenticated, service_role;

-- ── 3. "Ciente" do aviso de conversas paradas ─────────────────────────────
create table if not exists public.carbo_wa_aviso_ciente (
  id            bigserial primary key,
  em            timestamptz not null default now(),
  user_id       uuid not null default auth.uid(),
  numero_id     text not null,
  sem_resposta  int not null default 0,
  sem_resolver  int not null default 0,
  acao          text not null default 'ciente'
                check (acao in ('ciente', 'ver_sem_resposta', 'ver_sem_resolver'))
);
create index if not exists carbo_wa_aviso_ciente_user on public.carbo_wa_aviso_ciente (user_id, em desc);
create index if not exists carbo_wa_aviso_ciente_em on public.carbo_wa_aviso_ciente (em);

comment on table public.carbo_wa_aviso_ciente is
  'Quem viu o aviso de conversas paradas ao abrir um número nas Conversas, quando, quantas havia e o que fez. Append-only.';

alter table public.carbo_wa_aviso_ciente enable row level security;
drop policy if exists carbo_wa_aviso_ciente_ler on public.carbo_wa_aviso_ciente;
create policy carbo_wa_aviso_ciente_ler on public.carbo_wa_aviso_ciente
  for select to authenticated using ((select public.carbo_e_time_interno()));
drop policy if exists carbo_wa_aviso_ciente_gravar on public.carbo_wa_aviso_ciente;
create policy carbo_wa_aviso_ciente_gravar on public.carbo_wa_aviso_ciente
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.carbo_e_time_interno()));
grant select, insert on public.carbo_wa_aviso_ciente to authenticated;
grant usage on sequence public.carbo_wa_aviso_ciente_id_seq to authenticated;

-- ── 4. A limpeza ──────────────────────────────────────────────────────────
-- Marca como RESOLVIDA toda conversa que parou antes de `p_ate` (nada aconteceu
-- desde então) e que a tela ainda mostra como trabalho: não respondida,
-- respondida e não encerrada, ou aguardando. As já resolvidas e as que só
-- receberam aviso automático ficam como estão.
-- ⚠️ Só pelo SQL Editor (mexe na caixa de todo mundo). `p_ensaio` nasce TRUE.
-- ⚠️ Cliente que escrever depois REABRE a conversa, como sempre.
create or replace function public.carbo_wa_resolver_antigas(
  p_ate timestamptz, p_ensaio boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_relatorio jsonb;
  v_total     int;
  v_feitas    int := 0;
begin
  if auth.uid() is not null then
    raise exception 'só pelo SQL Editor' using errcode = '42501';
  end if;
  if p_ate is null or p_ate > now() - interval '1 day' or p_ate < timestamptz '2026-01-01' then
    raise exception 'corte fora do esperado: % (tem de ser até ontem)', p_ate;
  end if;

  -- Ensaio e "de verdade" no mesmo bloco do SQL Editor são UMA transação.
  drop table if exists _carbo_limpeza;
  create temp table _carbo_limpeza on commit drop as
  select r.numero_id, r.wa_id, r.ultima_em, a.status as status_antes,
         case
           when exists (select 1 from unnest(r.pendentes_em) t
                         where t > coalesce(greatest(r.ultima_resposta_em,
                                                     case when a.status = 'resolvido' then a.desde end),
                                            '-infinity'::timestamptz))
                and (coalesce(a.status, '') not in ('aguardando', 'resolvido')
                     or coalesce(r.ultima_entrada_em > a.desde, false))
             then 'sem_resposta'
           when a.status = 'aguardando' then 'aguardando'
           else 'respondida_sem_encerrar'
         end as situacao
    from public.carbo_wa_resumo r
    left join public.carbo_wa_atendimento a on a.numero_id = r.numero_id and a.wa_id = r.wa_id
   where r.ultima_em < p_ate
     -- NÃO é "quieta" (a mesma régua da `carbo_wa_caixa_v2`)
     and not (
       coalesce(a.status = 'resolvido'
                and (r.ultima_entrada_em is null or r.ultima_entrada_em <= a.desde), false)
       or
       coalesce(coalesce(a.status, '') not in ('aguardando', 'resolvido')
                and cardinality(r.pendentes_em) = 0 and r.ultima_resposta_em is null, false)
     );

  select count(*) into v_total from _carbo_limpeza;

  select coalesce(jsonb_agg(jsonb_build_object(
           'numero', x.numero_id, 'rotulo', x.rotulo, 'conversas', x.n,
           'sem_resposta', x.sem_resposta, 'respondida_sem_encerrar', x.respondidas,
           'aguardando', x.aguardando, 'mais_antiga', x.mais_antiga, 'mais_recente', x.mais_recente)
         order by x.numero_id), '[]'::jsonb)
    into v_relatorio
    from (
      select l.numero_id, nu.rotulo, count(*) as n,
             count(*) filter (where l.situacao = 'sem_resposta') as sem_resposta,
             count(*) filter (where l.situacao = 'respondida_sem_encerrar') as respondidas,
             count(*) filter (where l.situacao = 'aguardando') as aguardando,
             to_char(min(l.ultima_em) at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') as mais_antiga,
             to_char(max(l.ultima_em) at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as mais_recente
        from _carbo_limpeza l
        left join public.carbo_wa_numeros nu on nu.phone_number_id = l.numero_id
       group by l.numero_id, nu.rotulo
    ) x;

  if not p_ensaio then
    perform set_config('carbo.origem_atendimento', 'limpeza', true);
    insert into public.carbo_wa_atendimento
      (numero_id, wa_id, status, desde, atualizado_em, atualizado_por)
    select l.numero_id, l.wa_id, 'resolvido', now(), now(), null
      from _carbo_limpeza l
    on conflict (numero_id, wa_id) do update set
      status = 'resolvido',
      desde = now(),
      atualizado_em = now(),
      atualizado_por = null;
    get diagnostics v_feitas = row_count;
    perform set_config('carbo.origem_atendimento', '', true);
  end if;

  return jsonb_build_object(
    'corte', p_ate,
    'ensaio', p_ensaio,
    'conversas', v_total,
    'marcadas_agora', v_feitas,
    'por_numero', v_relatorio);
end $$;

comment on function public.carbo_wa_resolver_antigas(timestamptz, boolean) is
  'Marca como resolvida toda conversa parada antes do corte que a tela ainda mostra como trabalho. Só pelo SQL Editor; p_ensaio nasce true. O histórico grava origem limpeza e marca false (não conta no Painel nem tira reclamação do Pós-venda).';
revoke execute on function public.carbo_wa_resolver_antigas(timestamptz, boolean) from anon, public, authenticated;

notify pgrst, 'reload schema';
