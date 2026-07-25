-- ─────────────────────────────────────────────────────────────────────────────
-- Ranking do time de TI — agregados por pessoa + indicadores do TIME.
--
-- PRINCÍPIO: o indivíduo só é medido pelo pedaço que ele controla.
--   created→resolvido  =  [triagem] [fila] [execução] [espera do solicitante]
--                            time     time    pessoa        terceiro
-- Medir do "entrou" penalizaria quem puxa o chamado velho da fila — o oposto
-- da injustiça que se queria evitar. Então:
--   • TEMPO ATIVO = só os trechos em 'in_progress' + 'em_teste'.
--     Isso já exclui fila e 'aguardando' por construção.
--   • Contra cherry-picking: o tempo é normalizado pela MEDIANA DO TIME no
--     mesmo nível de prioridade (índice observado/esperado). Pegar só fácil
--     não melhora o índice — e rende menos ponto.
--   • Contra fechar mal: reabertura em ≤14d zera os pontos daquela entrega, e
--     o tempo da 1ª rodada continua somando na 2ª.
--   • Contra abrir chamado pra si: entrega sem solicitante (ou com solicitante
--     = resolvedor) conta na coluna bruta mas vale 0 ponto.
--
-- ⚠️ Só existe timeline a partir de 25/07/2026 (quando o trigger de status foi
--    criado). Entregas anteriores não têm tempo — a tela avisa.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.carbo_ti_ranking(
  p_from timestamptz default (now() - interval '90 days'),
  p_to   timestamptz default now()
)
returns table (
  person_id            uuid,
  person_name          text,
  entregas             bigint,   -- demandas levadas a Concluída no período
  pontos               numeric,  -- entregas ponderadas por impacto (ver peso_prio)
  criticas             bigint,   -- entregas de prioridade crítica/alta
  assumidas            bigint,   -- virou responsável no período (trigger de assign)
  em_aberto            bigint,   -- carga atual (não terminal)
  paradas              bigint,   -- da carga atual, quantas sem mover há +7d
  reabertas            bigint,   -- entregas que voltaram em ≤14d
  sem_solicitante      bigint,   -- entregas sem reporter (não pontuam)
  idas_aguardando      bigint,   -- vezes que mandou pra 'Aguardando' (sinal de abuso)
  amostra_tempo        bigint,   -- n das medianas (≠ entregas!)
  minutos_ativos_med   numeric,  -- mediana do tempo ativo
  indice_velocidade    numeric,  -- mediana(tempo / mediana do time no mesmo nível)
  fechadas_sem_execucao bigint   -- foram de Entrada direto pra Concluída
)
language sql stable security definer set search_path = public as $$
with
-- Time de TI: mesmo critério de carbo_is_ti() e do useTimeTI no app.
ti as (
  select p.id, p.full_name
  from public.profiles p
  where p.department::text           in ('ti_suporte','command')
     or p.secondary_department::text in ('ti_suporte','command')
),
ev as (
  select a.demanda_id, a.created_at, a.status_from, a.status_to, a.created_by
  from public.carbo_demanda_activities a
  where a.activity_type = 'status_change'
),
-- Entrega considerada = ÚLTIMA ida a 'resolved' na janela (reabrir+fechar = 1).
-- ⚠️ lê SEM filtrar archived_at: arquivar não pode virar borracha de número.
res as (
  select distinct on (e.demanda_id)
         e.demanda_id,
         e.created_at as resolved_at,
         -- Crédito vai pro RESPONSÁVEL, não pro ator: gestor arrumando quadro
         -- não rouba entrega. Sem responsável, cai no ator.
         coalesce(b.assignee_id, e.created_by) as person_id,
         b.assignee_id, e.created_by as ator_id,
         b.reporter_id, b.priority, b.created_at as opened_at
  from ev e
  join public.carbo_bug_reports b on b.id = e.demanda_id
  where e.status_to = 'resolved' and e.created_at >= p_from and e.created_at < p_to
  order by e.demanda_id, e.created_at desc
),
-- Trechos da linha do tempo (cada evento vale até o próximo).
seg as (
  select e.demanda_id, e.status_to as status, e.created_at as ts,
         lead(e.created_at) over (partition by e.demanda_id order by e.created_at) as next_ts
  from ev e
),
-- Só o tempo em que a demanda esteve de fato na mão de alguém.
ativo as (
  select r.demanda_id,
         sum(greatest(0, extract(epoch from
             (least(coalesce(s.next_ts, r.resolved_at), r.resolved_at) - s.ts)) / 60.0)) as min_ativo
  from res r
  join seg s on s.demanda_id = r.demanda_id
            and s.ts < r.resolved_at
            and s.status in ('in_progress','em_teste')
  group by r.demanda_id
),
dem as (
  select r.*,
         coalesce(a.min_ativo, 0) as min_ativo,
         -- Fechou e voltou em até 14 dias? A entrega não valeu.
         exists (select 1 from ev e2
                  where e2.demanda_id = r.demanda_id
                    and e2.created_at > r.resolved_at
                    and e2.created_at <= r.resolved_at + interval '14 days'
                    and e2.status_from = 'resolved'
                    and e2.status_to not in ('resolved','declined')) as reaberta,
         (r.reporter_id is null or r.reporter_id = r.person_id) as sem_solic
  from res r left join ativo a on a.demanda_id = r.demanda_id
),
-- Baseline do TIME por prioridade: é o que neutraliza o cherry-picking.
-- Quem pega só fácil compara contra o "fácil" e não ganha nada com isso.
base as (
  select coalesce(priority,'media') as prio,
         percentile_cont(0.5) within group (order by min_ativo) as med
  from dem where min_ativo > 0
  group by coalesce(priority,'media')
  having count(*) >= 3
),
base_geral as (
  select percentile_cont(0.5) within group (order by min_ativo) as med
  from dem where min_ativo > 0
),
razao as (
  select d.person_id, d.min_ativo,
         d.min_ativo / nullif(coalesce(b.med, g.med), 0) as r
  from dem d
  left join base b on b.prio = coalesce(d.priority,'media')
  cross join base_geral g
  where d.min_ativo > 0
),
agg as (
  select d.person_id,
         count(*) as entregas,
         count(*) filter (where d.priority in ('critica','alta')) as criticas,
         count(*) filter (where d.reaberta) as reabertas,
         count(*) filter (where d.sem_solic) as sem_solicitante,
         count(*) filter (where d.min_ativo = 0) as fechadas_sem_execucao,
         -- Peso de IMPACTO (não de dificuldade — o banco não tem esforço).
         -- Reabertura e auto-report zeram a pontuação daquela entrega.
         sum(
           case when d.reaberta or d.sem_solic then 0
                else case coalesce(d.priority,'media')
                       when 'critica' then 3.0 when 'alta' then 2.0
                       when 'media'   then 1.3 else 1.0 end
           end
         ) as pontos
  from dem d group by d.person_id
),
agg_tempo as (
  select person_id, count(*) as amostra_tempo,
         percentile_cont(0.5) within group (order by min_ativo) as minutos_ativos_med,
         percentile_cont(0.5) within group (order by r) as indice_velocidade
  from razao group by person_id
),
-- Assumidas: agora existe histórico (trigger de assign).
agg_assum as (
  select a.assignee_id as person_id, count(distinct a.demanda_id) as assumidas
  from public.carbo_demanda_activities a
  where a.activity_type = 'assign' and a.assignee_id is not null
    and a.created_at >= p_from and a.created_at < p_to
  group by a.assignee_id
),
agg_carga as (
  select b.assignee_id as person_id,
         count(*) as em_aberto,
         count(*) filter (where b.stage_since < now() - interval '7 days') as paradas
  from public.carbo_bug_reports b
  where b.assignee_id is not null and b.archived_at is null
    and b.status not in ('resolved','declined')
  group by b.assignee_id
),
-- Quantas vezes mandou pra "Aguardando" — abuso vira número visível.
agg_agu as (
  select e.created_by as person_id, count(*) as idas_aguardando
  from ev e
  where e.status_to = 'aguardando' and e.created_by is not null
    and e.created_at >= p_from and e.created_at < p_to
  group by e.created_by
),
pessoas as (
  select p.id, p.full_name from public.profiles p
  where p.id in (select id from ti)
     or p.id in (select person_id from agg where person_id is not null)
)
select
  pe.id, pe.full_name,
  coalesce(a.entregas, 0), coalesce(round(a.pontos, 1), 0), coalesce(a.criticas, 0),
  coalesce(asm.assumidas, 0), coalesce(cg.em_aberto, 0), coalesce(cg.paradas, 0),
  coalesce(a.reabertas, 0), coalesce(a.sem_solicitante, 0), coalesce(ag.idas_aguardando, 0),
  coalesce(t.amostra_tempo, 0),
  round(t.minutos_ativos_med::numeric, 0),
  round(t.indice_velocidade::numeric, 2),
  coalesce(a.fechadas_sem_execucao, 0)
from pessoas pe
left join agg       a   on a.person_id   = pe.id
left join agg_tempo t   on t.person_id   = pe.id
left join agg_assum asm on asm.person_id = pe.id
left join agg_carga cg  on cg.person_id  = pe.id
left join agg_agu   ag  on ag.person_id  = pe.id
order by coalesce(a.pontos, 0) desc, pe.full_name asc;
$$;

grant execute on function public.carbo_ti_ranking(timestamptz, timestamptz) to authenticated;

-- ── Indicadores do TIME ──────────────────────────────────────────────────────
-- Aqui SIM vale o "entrou → resolvido": é o tempo que o usuário sente. Sem nome
-- de pessoa — é responsabilidade coletiva (triagem + fila + execução).
create or replace function public.carbo_ti_time(
  p_from timestamptz default (now() - interval '30 days'),
  p_to   timestamptz default now()
)
returns table (
  entregues       bigint,
  lead_p50_horas  numeric,
  lead_p90_horas  numeric,
  triagem_p50_horas numeric,
  firmeza_pct     numeric,
  fila_envelhecida bigint
)
language sql stable security definer set search_path = public as $$
with ev as (
  select a.demanda_id, a.created_at, a.status_from, a.status_to
  from public.carbo_demanda_activities a where a.activity_type = 'status_change'
),
res as (
  select distinct on (e.demanda_id)
         e.demanda_id, e.created_at as resolved_at, b.created_at as opened_at
  from ev e join public.carbo_bug_reports b on b.id = e.demanda_id
  where e.status_to = 'resolved' and e.created_at >= p_from and e.created_at < p_to
  order by e.demanda_id, e.created_at desc
),
seg as (
  select e.demanda_id, e.status_to as status, e.created_at as ts,
         lead(e.created_at) over (partition by e.demanda_id order by e.created_at) as next_ts
  from ev e
),
-- Desconta a espera pelo solicitante: não é atraso do TI.
espera as (
  select r.demanda_id,
         coalesce(sum(greatest(0, extract(epoch from
           (least(coalesce(s.next_ts, r.resolved_at), r.resolved_at) - s.ts)) / 3600.0)), 0) as h
  from res r
  left join seg s on s.demanda_id = r.demanda_id and s.ts < r.resolved_at and s.status = 'aguardando'
  group by r.demanda_id
),
lead_t as (
  select r.demanda_id,
         greatest(0, extract(epoch from (r.resolved_at - r.opened_at))/3600.0 - coalesce(e.h, 0)) as horas,
         (select min(x.created_at) from ev x where x.demanda_id = r.demanda_id and x.status_from = 'open') as triado_em,
         r.opened_at
  from res r left join espera e on e.demanda_id = r.demanda_id
)
select
  (select count(*) from res),
  round((select percentile_cont(0.5) within group (order by horas) from lead_t)::numeric, 1),
  round((select percentile_cont(0.9) within group (order by horas) from lead_t)::numeric, 1),
  round((select percentile_cont(0.5) within group (
            order by extract(epoch from (triado_em - opened_at))/3600.0)
          from lead_t where triado_em is not null)::numeric, 1),
  round(100.0 * (1 - (
    select count(*)::numeric / nullif((select count(*) from res), 0)
    from res r where exists (select 1 from ev e2
      where e2.demanda_id = r.demanda_id and e2.created_at > r.resolved_at
        and e2.created_at <= r.resolved_at + interval '14 days'
        and e2.status_from = 'resolved' and e2.status_to not in ('resolved','declined'))
  )), 0),
  (select count(*) from public.carbo_bug_reports b
    where b.archived_at is null and b.status not in ('resolved','declined')
      and b.created_at < now() - interval '14 days');
$$;

grant execute on function public.carbo_ti_time(timestamptz, timestamptz) to authenticated;

create index if not exists idx_carbo_demanda_act_status_to
  on public.carbo_demanda_activities (status_to, created_at desc)
  where activity_type = 'status_change';
