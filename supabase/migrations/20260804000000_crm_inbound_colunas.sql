-- =====================================================================
-- Fase 8 — as colunas Orçamento e Formalização no Inbound.
--
-- As colunas em si são só front (stage é texto livre, sem CHECK) e os prazos
-- já entraram na fase 4. Mas duas coisas no banco precisam acompanhar:
--
--   1) A AUTOMAÇÃO de tarefas está codificada nos ids antigos do f11. Com
--      Orçamento no meio, "qualificado → Enviar proposta" virou instrução
--      errada, e as duas etapas novas não geram tarefa nenhuma.
--
--   2) DEFEITO MEU NA FASE 4: a regra de "esquecido" considera QUALQUER tarefa
--      pendente como "tem próximo passo" — inclusive uma vencida há três
--      semanas. Como esta automação cria uma tarefa pendente a cada mudança de
--      etapa, na prática quase nenhum card do Inbound conseguiria ser
--      classificado como esquecido. Tarefa vencida não é próximo passo: é
--      justamente o sintoma de que ninguém foi atrás.
--
-- ⚠️ RODAR EM BLOCOS SEPARADOS no SQL Editor, um por vez.
-- =====================================================================


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a automação passa a conhecer as etapas novas            ║
-- ╚═══════════════════════════════════════════════════════════════════╝
create or replace function public.crm_sales_lead_auto_task()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_subject text;
  v_days    int;
begin
  if new.stage is not distinct from old.stage then
    return new;
  end if;

  -- Cada etapa pede a próxima AÇÃO, não a próxima etapa. Antes, "qualificado"
  -- mandava enviar proposta — agora o passo seguinte é montar o orçamento.
  v_subject := case new.stage
    when 'novo'         then 'Fazer primeiro contato'
    when 'contato'      then 'Qualificar o lead'
    when 'qualificado'  then 'Montar o orçamento'
    when 'orcamento'    then 'Enviar a proposta ao cliente'
    when 'proposta'     then 'Follow-up da proposta'
    when 'negociacao'   then 'Avançar a negociação / fechar'
    when 'formalizacao' then 'Emitir o pedido'
    -- Outbound: o SDR nunca teve automação nenhuma. `qualificado` disparava por
    -- coincidência de nome com o Inbound. Agora as duas etapas em que ele
    -- costuma perder o fio têm lembrete próprio.
    when 'cadencia'     then 'Próxima tentativa da cadência'
    when 'nutricao'     then 'Retomar contato'
    else null end;

  v_days := case new.stage
    when 'novo'         then 1
    when 'reuniao'      then 1
    when 'proposta'     then 3
    when 'negociacao'   then 3
    when 'formalizacao' then 3
    -- Nutrição é longa por definição — é a etapa que existe justamente para
    -- tirar o lead da rotina diária e trazê-lo de volta numa data.
    when 'nutricao'     then 30
    else 2 end;

  if v_subject is not null then
    insert into public.crm_sales_lead_activities
      (lead_id, activity_type, subject, status, due_at, created_by, created_by_name, meta)
    values
      (new.id, 'task', v_subject, 'pending', now() + (v_days || ' days')::interval,
       auth.uid(), 'Automação', jsonb_build_object('auto', true, 'stage', new.stage));
  end if;

  return new;
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — corrige a regra de "esquecido" (defeito da fase 4)      ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- A única mudança é no `tem_tarefa`: tarefa VENCIDA deixa de contar como
-- próximo passo. Sem isso, a automação do bloco 1 anularia o número de
-- esquecidos — todo card que mudou de etapa uma vez ficaria com uma tarefa
-- pendente para sempre, e a tela mostraria zero esquecido com a operação
-- parada.
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
           -- ↓ AQUI está a correção. Tarefa vencida NÃO é próximo passo.
           exists (select 1 from public.crm_sales_lead_activities t
                    where t.lead_id = a.id and t.activity_type = 'task'
                      and t.status = 'pending'
                      and (t.due_at is null or t.due_at::date >= current_date)
                  ) as tem_tarefa
      from abertos a
  ),
  final as (
    select c.*,
           (c.estourou
            and (c.next_follow_up_at is null or c.next_follow_up_at::date < now()::date)
            and not c.tem_tarefa) as esquecido
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
      'esquecidos',   (select count(*) from final where esquecido)
    ),
    'por_pessoa', (
      select coalesce(jsonb_agg(x order by x->>'esquecidos' desc), '[]'::jsonb) from (
        select jsonb_build_object(
                 'dono', dono,
                 'abertos', count(*),
                 'parados', count(*) filter (where estourou),
                 'esquecidos', count(*) filter (where esquecido),
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
    )
  ) into v_out;

  return v_out;
end;
$$;

revoke all on function public.crm_acompanhamento(date, date) from public, anon;
grant execute on function public.crm_acompanhamento(date, date) to authenticated;

notify pgrst, 'reload schema';


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — prazos das etapas novas (idempotente, já vieram na 4)   ║
-- ╚═══════════════════════════════════════════════════════════════════╝
insert into public.crm_stage_sla (funnel_type, stage, prazo_dias) values
  ('f11','orcamento',2), ('f11','formalizacao',3)
on conflict (funnel_type, stage) do nothing;


-- ─── Conferência ─────────────────────────────────────────────────────
-- Antes e depois da correção do "esquecido":
--   select (public.crm_acompanhamento()->'hoje'->>'parados')::int    as parados,
--          (public.crm_acompanhamento()->'hoje'->>'esquecidos')::int as esquecidos;
--   → esquecidos tende a SUBIR, porque tarefa automática vencida deixou de
--     mascarar o abandono. Se subir muito, é retrato honesto — não regressão.
