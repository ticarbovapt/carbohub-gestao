-- =====================================================================
-- Fase 9 — "aguardando" vira FLAG COM RELÓGIO, não coluna.
--
-- A dor: em Negociação não dá para saber se o negócio está parado porque
-- depende de um decisor ou porque o closer não foi atrás.
--
-- POR QUE NÃO UMA COLUNA "Aguardando": aguardar é ORTOGONAL à etapa. Dá para
-- estar aguardando em Proposta, em Negociação e em Formalização, e são coisas
-- diferentes. Uma coluna só apagaria a posição real do negócio; uma por etapa
-- daria 12 colunas. E viraria o novo depósito de card sem dono.
--
-- O critério: COLUNA quando muda a fila de trabalho; FLAG quando muda só o
-- motivo. Card aguardando decisor continua sendo trabalho do mesmo closer, na
-- mesma etapa — flag. Card em Nutrição sai da rotina diária do SDR — coluna.
--
-- O RELÓGIO é o que faz funcionar. `waiting_until` é OBRIGATÓRIO, e quando
-- vence a flag cai sozinha na leitura: ninguém se esconde atrás de um
-- "aguardando" eterno.
--
-- ⚠️ RODAR EM BLOCOS SEPARADOS no SQL Editor, um por vez.
-- =====================================================================


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — as três colunas                                         ║
-- ╚═══════════════════════════════════════════════════════════════════╝
set lock_timeout = '5s';

alter table public.crm_sales_leads
  add column if not exists waiting_on    text,
  add column if not exists waiting_until date,
  add column if not exists waiting_note  text;

reset lock_timeout;

-- O CHECK é o coração da fase: sem prazo obrigatório, "aguardando" vira o
-- esconderijo que a coluna dedicada teria sido.
alter table public.crm_sales_leads
  drop constraint if exists crm_sales_leads_waiting_ck;

alter table public.crm_sales_leads
  add constraint crm_sales_leads_waiting_ck check (
    (waiting_on is null and waiting_until is null)
    or (waiting_on in ('cliente','decisor','interno','credito_doc')
        and waiting_until is not null)
  );

comment on column public.crm_sales_leads.waiting_on is
  'De quem o negócio depende agora. Exige waiting_until. Quando o prazo vence, '
  'a flag deixa de valer na leitura — o card volta a contar como esquecido.';


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a tela passa a separar "aguardando" de "esquecido"      ║
-- ╚═══════════════════════════════════════════════════════════════════╝
create or replace function public.crm_acompanhamento(
  p_desde date default (current_date - 29),
  p_ate   date default current_date
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_out jsonb;
begin
  if not public.crm_is_gestor() then
    raise exception 'Tela restrita à gestão.';
  end if;

  if p_ate < p_desde then
    raise exception 'Período inválido: data final antes da inicial.';
  end if;
  if p_ate - p_desde > 366 then
    raise exception 'Período máximo: 366 dias.';
  end if;

  with dias as (
    select d::date as dia from generate_series(p_desde, p_ate, interval '1 day') d
  ),
  criados as (
    select created_at::date as dia, count(*) as n
      from public.crm_sales_leads
     where created_at::date between p_desde and p_ate
     group by 1
  ),
  ganhos as (
    select won_at::date as dia, count(*) as n,
           coalesce(sum(estimated_revenue), 0) as receita
      from public.crm_sales_leads
     where won_at is not null and won_at::date between p_desde and p_ate
     group by 1
  ),
  perdidos as (
    select lost_at::date as dia, count(*) as n
      from public.crm_sales_leads
     where lost_at is not null and lost_at::date between p_desde and p_ate
     group by 1
  ),
  movidos as (
    select created_at::date as dia, count(distinct lead_id) as n
      from public.crm_sales_lead_activities
     where activity_type = 'stage_change'
       and created_at::date between p_desde and p_ate
     group by 1
  ),
  abertos as (
    select l.id, l.funnel_type, l.stage, l.next_follow_up_at,
           l.waiting_on, l.waiting_until,
           coalesce(l.assigned_to, l.created_by) as dono,
           greatest(
             coalesce((select max(a.created_at)
                         from public.crm_sales_lead_activities a
                        where a.lead_id = l.id and a.activity_type = 'stage_change'),
                      l.created_at),
             l.created_at
           ) as ultimo_toque,
           coalesce(s.prazo_dias, 5) as prazo
      from public.crm_sales_leads l
      left join public.crm_stage_sla s
             on s.funnel_type = l.funnel_type and s.stage = l.stage
     where l.deleted_at is null
       and l.won_at is null and l.lost_at is null
       and l.stage not in ('convertido','parceiro','fechamento','ganho','recomprou',
                           'sem_interesse','descartado','perdido','repassado')
  ),
  classificado as (
    select a.*,
           (now()::date - a.ultimo_toque::date) as dias_parado,
           (now()::date - a.ultimo_toque::date) > a.prazo as estourou,
           -- Tarefa VENCIDA não é próximo passo (corrigido na fase 8).
           exists (select 1 from public.crm_sales_lead_activities t
                    where t.lead_id = a.id and t.activity_type = 'task'
                      and t.status = 'pending'
                      and (t.due_at is null or t.due_at::date >= current_date)
                  ) as tem_tarefa,
           -- A flag só vale ENQUANTO o prazo dela não venceu. Vencida, o card
           -- volta para a fila de cobrança — é o que impede o "aguardando"
           -- eterno.
           (a.waiting_on is not null and a.waiting_until >= current_date) as aguardando,
           (a.waiting_on is not null and a.waiting_until <  current_date) as espera_vencida
      from abertos a
  ),
  final as (
    select c.*,
           -- ESQUECIDO agora exclui quem está legitimamente aguardando com
           -- prazo em dia. É o que separa "depende do decisor" de "ninguém foi
           -- atrás" — a pergunta que originou toda esta fase.
           (c.estourou
            and (c.next_follow_up_at is null or c.next_follow_up_at::date < now()::date)
            and not c.tem_tarefa
            and not c.aguardando) as esquecido
      from classificado c
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('desde', p_desde, 'ate', p_ate),
    'serie', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'dia', d.dia,
               'criados',    coalesce(cr.n, 0),
               'ganhos',     coalesce(g.n, 0),
               'perdidos',   coalesce(pe.n, 0),
               'movimentados', coalesce(mo.n, 0),
               'receita',    coalesce(g.receita, 0)
             ) order by d.dia), '[]'::jsonb)
        from dias d
        left join criados  cr on cr.dia = d.dia
        left join ganhos   g  on g.dia  = d.dia
        left join perdidos pe on pe.dia = d.dia
        left join movidos  mo on mo.dia = d.dia
    ),
    'hoje', jsonb_build_object(
      'criados',      (select coalesce(n,0) from criados  where dia = current_date),
      'ganhos',       (select coalesce(n,0) from ganhos   where dia = current_date),
      'perdidos',     (select coalesce(n,0) from perdidos where dia = current_date),
      'movimentados', (select coalesce(n,0) from movidos  where dia = current_date),
      'abertos',      (select count(*) from final),
      'parados',      (select count(*) from final where estourou),
      'esquecidos',   (select count(*) from final where esquecido),
      'aguardando',   (select count(*) from final where aguardando),
      -- Espera vencida é o pior dos mundos: alguém prometeu uma data e ela
      -- passou. Merece número próprio, e não some dentro de "esquecidos".
      'espera_vencida', (select count(*) from final where espera_vencida)
    ),
    'aguardando_por', (
      select coalesce(jsonb_agg(x order by x->>'n' desc), '[]'::jsonb) from (
        select jsonb_build_object('motivo', waiting_on, 'n', count(*),
                                  'vencidos', count(*) filter (where espera_vencida)) as x
          from final where waiting_on is not null group by waiting_on
      ) t
    ),
    'por_pessoa', (
      select coalesce(jsonb_agg(x order by x->>'esquecidos' desc), '[]'::jsonb) from (
        select jsonb_build_object(
                 'dono', dono,
                 'abertos', count(*),
                 'parados', count(*) filter (where estourou),
                 'esquecidos', count(*) filter (where esquecido),
                 'aguardando', count(*) filter (where aguardando),
                 'pior_dias', max(dias_parado)
               ) as x
          from final where dono is not null group by dono
      ) t
    ),
    'por_etapa', (
      select coalesce(jsonb_agg(x order by x->>'parados' desc), '[]'::jsonb) from (
        select jsonb_build_object(
                 'funnel_type', funnel_type,
                 'stage', stage,
                 'prazo_dias', max(prazo),
                 'leads', count(*),
                 'parados', count(*) filter (where estourou),
                 'dias_medio', round(avg(dias_parado), 1)
               ) as x
          from final group by funnel_type, stage
      ) t
    ),
    'motivos', (
      select coalesce(jsonb_agg(x order by x->>'n' desc), '[]'::jsonb) from (
        select jsonb_build_object(
                 'funnel_type', funnel_type,
                 'motivo', coalesce(lost_reason, '(sem motivo)'),
                 'n', count(*)
               ) as x
          from public.crm_sales_leads
         where lost_at is not null and lost_at::date between p_desde and p_ate
         group by funnel_type, lost_reason
      ) t
    ),
    'lista_esquecidos', (
      select coalesce(jsonb_agg(x order by x->>'dias_parado' desc), '[]'::jsonb) from (
        select jsonb_build_object(
                 'id', f.id, 'nome', coalesce(l.trade_name, l.legal_name, l.contact_name, 'Sem nome'),
                 'funnel_type', f.funnel_type, 'stage', f.stage,
                 'dono', f.dono, 'dias_parado', f.dias_parado, 'prazo_dias', f.prazo
               ) as x
          from final f join public.crm_sales_leads l on l.id = f.id
         where f.esquecido
         limit 200
      ) t
    ),
    -- Lista à parte: prometeram uma data e ela passou. É cobrança, não abandono.
    'lista_espera_vencida', (
      select coalesce(jsonb_agg(x order by x->>'waiting_until'), '[]'::jsonb) from (
        select jsonb_build_object(
                 'id', f.id, 'nome', coalesce(l.trade_name, l.legal_name, l.contact_name, 'Sem nome'),
                 'funnel_type', f.funnel_type, 'stage', f.stage, 'dono', f.dono,
                 'waiting_on', f.waiting_on, 'waiting_until', f.waiting_until,
                 'waiting_note', l.waiting_note
               ) as x
          from final f join public.crm_sales_leads l on l.id = f.id
         where f.espera_vencida
         limit 200
      ) t
    )
  ) into v_out;

  return v_out;
end;
$$;

revoke all on function public.crm_acompanhamento(date, date) from public, anon;
grant execute on function public.crm_acompanhamento(date, date) to authenticated;

notify pgrst, 'reload schema';


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — conferência (sem gate, roda no SQL Editor)              ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- select count(*) filter (where waiting_on is not null) as com_flag,
--        count(*) filter (where waiting_on is not null and waiting_until < current_date) as vencidas
--   from public.crm_sales_leads where deleted_at is null;
--
-- O CHECK funcionando (tem que dar erro):
--   update public.crm_sales_leads set waiting_on = 'decisor' where id = (select id from public.crm_sales_leads limit 1);
--   → ERROR: violates check constraint "crm_sales_leads_waiting_ck"


-- ─── Rollback ────────────────────────────────────────────────────────
-- alter table public.crm_sales_leads drop constraint if exists crm_sales_leads_waiting_ck;
-- alter table public.crm_sales_leads
--   drop column if exists waiting_on, drop column if exists waiting_until,
--   drop column if exists waiting_note;
-- (e restaurar crm_acompanhamento da migração 20260804000000)
