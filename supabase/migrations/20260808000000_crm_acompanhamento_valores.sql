-- =====================================================================
-- A tela de acompanhamento passa a mostrar DINHEIRO, e a filtrar por vendedor.
--
-- "deve ter um local lá para ver como está a quantidade de valores em
--  orçamento, quantidade de valores de ganho etc, filtrar por vendedor.
--  temos os dados, precisamos usar eles"
--
-- DUAS FONTES DE VALOR, e a diferença entre elas é o ponto:
--
--   estimated_revenue  → o PALPITE de quem cadastrou o lead. Existe sempre,
--                        vale pouco. Serve para o topo do funil, onde não há
--                        outra coisa.
--   carboze_orders.total via crm_lead_orders
--                      → o valor REAL do orçamento montado. Só existe depois
--                        que alguém sentou e fez o preço.
--
-- Misturar as duas numa soma só produziria um número que ninguém sabe ler.
-- Por isso aparecem lado a lado: "estimado" e "orçado". Onde há orçado, é ele
-- que vale.
--
-- ⚠️ RODAR EM BLOCO ÚNICO. Substitui a função crm_acompanhamento.
-- =====================================================================

create or replace function public.crm_acompanhamento(
  p_desde    date default (current_date - 29),
  p_ate      date default current_date,
  p_vendedor uuid default null      -- null = todos
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

  with
  -- Base filtrada por vendedor UMA vez, e reusada em tudo. O dono é o
  -- atribuído; sem atribuição, quem criou.
  leads as (
    select l.*, coalesce(l.assigned_to, l.created_by) as dono
      from public.crm_sales_leads l
     where p_vendedor is null
        or coalesce(l.assigned_to, l.created_by) = p_vendedor
  ),
  -- Valor REAL por lead: o orçamento mais recente ligado ao card.
  orcado as (
    select distinct on (lo.lead_id)
           lo.lead_id, o.id as order_id, o.total, o.status
      from public.crm_lead_orders lo
      join public.carboze_orders o on o.id = lo.order_id
     order by lo.lead_id, o.created_at desc
  ),
  dias as (
    select d::date as dia from generate_series(p_desde, p_ate, interval '1 day') d
  ),
  criados as (
    select created_at::date as dia, count(*) as n
      from leads where created_at::date between p_desde and p_ate group by 1
  ),
  ganhos as (
    select l.won_at::date as dia, count(*) as n,
           coalesce(sum(l.estimated_revenue), 0) as receita,
           -- Onde existe pedido de verdade, é ele que conta. O palpite só
           -- preenche o buraco de quem fechou sem passar pelo /vender.
           coalesce(sum(coalesce(oc.total, l.estimated_revenue)), 0) as receita_real
      from leads l
      left join orcado oc on oc.lead_id = l.id
     where l.won_at is not null and l.won_at::date between p_desde and p_ate
     group by 1
  ),
  perdidos as (
    select lost_at::date as dia, count(*) as n,
           coalesce(sum(estimated_revenue), 0) as valor
      from leads where lost_at is not null and lost_at::date between p_desde and p_ate
     group by 1
  ),
  movidos as (
    select a.created_at::date as dia, count(distinct a.lead_id) as n
      from public.crm_sales_lead_activities a
      join leads l on l.id = a.lead_id
     where a.activity_type = 'stage_change'
       and a.created_at::date between p_desde and p_ate
     group by 1
  ),
  abertos as (
    select l.id, l.funnel_type, l.stage, l.next_follow_up_at, l.dono,
           l.waiting_on, l.waiting_until, l.estimated_revenue,
           oc.total as valor_orcado, oc.status as status_orcamento,
           greatest(
             coalesce((select max(a.created_at)
                         from public.crm_sales_lead_activities a
                        where a.lead_id = l.id and a.activity_type = 'stage_change'),
                      l.created_at),
             l.created_at
           ) as ultimo_toque,
           coalesce(s.prazo_dias, 5) as prazo
      from leads l
      left join orcado oc on oc.lead_id = l.id
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
           exists (select 1 from public.crm_sales_lead_activities t
                    where t.lead_id = a.id and t.activity_type = 'task'
                      and t.status = 'pending'
                      and (t.due_at is null or t.due_at::date >= current_date)) as tem_tarefa,
           (a.waiting_on is not null and a.waiting_until >= current_date) as aguardando,
           (a.waiting_on is not null and a.waiting_until <  current_date) as espera_vencida
      from abertos a
  ),
  final as (
    select c.*,
           (c.estourou
            and (c.next_follow_up_at is null or c.next_follow_up_at::date < now()::date)
            and not c.tem_tarefa
            and not c.aguardando) as esquecido
      from classificado c
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('desde', p_desde, 'ate', p_ate, 'vendedor', p_vendedor),
    'serie', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'dia', d.dia,
               'criados',      coalesce(cr.n, 0),
               'ganhos',       coalesce(g.n, 0),
               'perdidos',     coalesce(pe.n, 0),
               'movimentados', coalesce(mo.n, 0),
               'receita',      coalesce(g.receita_real, 0)
             ) order by d.dia), '[]'::jsonb)
        from dias d
        left join criados  cr on cr.dia = d.dia
        left join ganhos   g  on g.dia  = d.dia
        left join perdidos pe on pe.dia = d.dia
        left join movidos  mo on mo.dia = d.dia
    ),
    'hoje', jsonb_build_object(
      'criados',        (select coalesce(n,0) from criados  where dia = current_date),
      'ganhos',         (select coalesce(n,0) from ganhos   where dia = current_date),
      'perdidos',       (select coalesce(n,0) from perdidos where dia = current_date),
      'movimentados',   (select coalesce(n,0) from movidos  where dia = current_date),
      'abertos',        (select count(*) from final),
      'parados',        (select count(*) from final where estourou),
      'esquecidos',     (select count(*) from final where esquecido),
      'aguardando',     (select count(*) from final where aguardando),
      'espera_vencida', (select count(*) from final where espera_vencida)
    ),
    -- ── DINHEIRO ────────────────────────────────────────────────────
    'valores', jsonb_build_object(
      -- Pipeline aberto, pelo palpite de quem cadastrou.
      'estimado_aberto', (select coalesce(sum(estimated_revenue), 0) from final),
      -- Pipeline aberto que JÁ TEM preço montado. É o número confiável.
      'orcado_aberto',   (select coalesce(sum(valor_orcado), 0) from final where valor_orcado is not null),
      'orcado_qtd',      (select count(*) from final where valor_orcado is not null),
      -- Especificamente na coluna Orçamento: a fila de "precisa de preço".
      'na_etapa_orcamento',      (select count(*) from final where stage = 'orcamento'),
      'na_etapa_orcamento_valor',(select coalesce(sum(coalesce(valor_orcado, estimated_revenue)), 0)
                                    from final where stage = 'orcamento'),
      -- Sem orçamento montado = negócio aberto que ninguém precificou ainda.
      'sem_orcamento',   (select count(*) from final where valor_orcado is null),
      'ganho_periodo',   (select coalesce(sum(receita_real), 0) from ganhos),
      'ganho_qtd',       (select coalesce(sum(n), 0) from ganhos),
      'perdido_periodo', (select coalesce(sum(valor), 0) from perdidos),
      'perdido_qtd',     (select coalesce(sum(n), 0) from perdidos)
    ),
    'aguardando_por', (
      select coalesce(jsonb_agg(x order by x->>'n' desc), '[]'::jsonb) from (
        select jsonb_build_object('motivo', waiting_on, 'n', count(*),
                                  'vencidos', count(*) filter (where espera_vencida)) as x
          from final where waiting_on is not null group by waiting_on
      ) t
    ),
    'por_pessoa', (
      select coalesce(jsonb_agg(x order by (x->>'esquecidos')::int desc), '[]'::jsonb) from (
        select jsonb_build_object(
                 'dono', f.dono,
                 'abertos', count(*),
                 'parados', count(*) filter (where f.estourou),
                 'esquecidos', count(*) filter (where f.esquecido),
                 'aguardando', count(*) filter (where f.aguardando),
                 'pior_dias', max(f.dias_parado),
                 'valor_aberto', coalesce(sum(coalesce(f.valor_orcado, f.estimated_revenue)), 0),
                 'valor_ganho', coalesce((
                   select sum(coalesce(oc.total, l2.estimated_revenue))
                     from leads l2 left join orcado oc on oc.lead_id = l2.id
                    where coalesce(l2.assigned_to, l2.created_by) = f.dono
                      and l2.won_at is not null
                      and l2.won_at::date between p_desde and p_ate), 0)
               ) as x
          from final f where f.dono is not null group by f.dono
      ) t
    ),
    'por_etapa', (
      select coalesce(jsonb_agg(x order by (x->>'valor')::numeric desc), '[]'::jsonb) from (
        select jsonb_build_object(
                 'funnel_type', funnel_type, 'stage', stage,
                 'prazo_dias', max(prazo), 'leads', count(*),
                 'parados', count(*) filter (where estourou),
                 'dias_medio', round(avg(dias_parado), 1),
                 'valor', coalesce(sum(coalesce(valor_orcado, estimated_revenue)), 0),
                 'com_orcamento', count(*) filter (where valor_orcado is not null)
               ) as x
          from final group by funnel_type, stage
      ) t
    ),
    'motivos', (
      select coalesce(jsonb_agg(x order by (x->>'n')::int desc), '[]'::jsonb) from (
        select jsonb_build_object(
                 'funnel_type', funnel_type,
                 'motivo', coalesce(lost_reason, '(sem motivo)'),
                 'n', count(*),
                 'valor', coalesce(sum(estimated_revenue), 0)
               ) as x
          from leads
         where lost_at is not null and lost_at::date between p_desde and p_ate
         group by funnel_type, lost_reason
      ) t
    ),
    'lista_esquecidos', (
      select coalesce(jsonb_agg(x order by (x->>'dias_parado')::int desc), '[]'::jsonb) from (
        select jsonb_build_object(
                 'id', f.id, 'nome', coalesce(l.trade_name, l.legal_name, l.contact_name, 'Sem nome'),
                 'funnel_type', f.funnel_type, 'stage', f.stage, 'dono', f.dono,
                 'dias_parado', f.dias_parado, 'prazo_dias', f.prazo,
                 'valor', coalesce(f.valor_orcado, f.estimated_revenue)
               ) as x
          from final f join public.crm_sales_leads l on l.id = f.id
         where f.esquecido limit 200
      ) t
    ),
    'lista_espera_vencida', (
      select coalesce(jsonb_agg(x order by x->>'waiting_until'), '[]'::jsonb) from (
        select jsonb_build_object(
                 'id', f.id, 'nome', coalesce(l.trade_name, l.legal_name, l.contact_name, 'Sem nome'),
                 'funnel_type', f.funnel_type, 'stage', f.stage, 'dono', f.dono,
                 'waiting_on', f.waiting_on, 'waiting_until', f.waiting_until,
                 'waiting_note', l.waiting_note,
                 'valor', coalesce(f.valor_orcado, f.estimated_revenue)
               ) as x
          from final f join public.crm_sales_leads l on l.id = f.id
         where f.espera_vencida limit 200
      ) t
    )
  ) into v_out;

  return v_out;
end;
$$;

-- A assinatura mudou (ganhou p_vendedor). A versão de 2 argumentos some, senão
-- ficariam duas funções e o PostgREST escolheria por ordem dos parâmetros —
-- fonte clássica de "mudei e não mudou nada".
drop function if exists public.crm_acompanhamento(date, date);

revoke all on function public.crm_acompanhamento(date, date, uuid) from public, anon;
grant execute on function public.crm_acompanhamento(date, date, uuid) to authenticated;

notify pgrst, 'reload schema';


-- ─── Conferência ─────────────────────────────────────────────────────
-- select jsonb_pretty(public.crm_acompanhamento() -> 'valores');
