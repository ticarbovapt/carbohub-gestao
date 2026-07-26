-- =====================================================================
-- Fase 4 — a tela de acompanhamento do gestor.
--
-- Traz três coisas:
--   1) ARQUIVAMENTO em vez de exclusão. Apagar um lead cascateava a trilha
--      junto e reescrevia o passado: o "criados" de uma terça do mês passado
--      mudava depois do fato, e a tela nunca fechava com o número visto ontem.
--   2) PRAZO POR ETAPA configurável. "Parado" não é um número só — 20 dias em
--      Nutrição é o comportamento certo, 5 dias em Negociação é problema. Um
--      número global mistura os dois e vira ruído que o gestor ignora.
--   3) A RPC que alimenta a tela, com o gate em crm_is_gestor().
--
-- ⚠️ RODAR EM BLOCOS SEPARADOS no SQL Editor, um por vez.
-- =====================================================================


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — arquivamento                                            ║
-- ╚═══════════════════════════════════════════════════════════════════╝
set lock_timeout = '5s';

alter table public.crm_sales_leads
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id);

reset lock_timeout;

create index if not exists idx_crm_sales_leads_ativos
  on public.crm_sales_leads (funnel_type, stage)
  where deleted_at is null;

comment on column public.crm_sales_leads.deleted_at is
  'Arquivamento. Lead arquivado sai das telas mas PERMANECE nos indicadores '
  'históricos: ele foi criado naquele dia e isso não muda depois do fato.';


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — RLS: quem lê deixa de ver o arquivado                   ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- A policy de SELECT passa a esconder arquivado de TODO MUNDO, inclusive do
-- gestor. A tela de acompanhamento não é afetada porque lê pela RPC, que é
-- SECURITY DEFINER e enxerga a tabela inteira — é justamente o ponto: some da
-- operação, permanece no histórico.
drop policy if exists crm_sales_leads_select on public.crm_sales_leads;
create policy crm_sales_leads_select on public.crm_sales_leads
  for select using (
    deleted_at is null
    and (created_by = auth.uid() or assigned_to = auth.uid() or public.crm_is_gestor())
  );

-- Arquivar é um UPDATE, então a policy de UPDATE já cobre. O DELETE continua
-- existindo para o gestor (erro de digitação, lead duplicado criado por
-- engano), mas o caminho normal da tela passa a ser arquivar.


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — arquivar / desarquivar                                  ║
-- ╚═══════════════════════════════════════════════════════════════════╝
create or replace function public.crm_sales_lead_arquivar(
  p_lead   uuid,
  p_motivo text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_pode boolean;
begin
  -- SECURITY DEFINER não muda auth.uid(): o guard abaixo continua avaliando
  -- quem chamou, e é isso que torna o gate seguro.
  select exists (
    select 1 from public.crm_sales_leads
     where id = p_lead
       and (created_by = auth.uid() or public.crm_is_gestor())
  ) into v_pode;

  if not v_pode then
    raise exception 'Sem permissão para arquivar este lead.';
  end if;

  update public.crm_sales_leads
     set deleted_at = coalesce(deleted_at, now()),
         deleted_by = coalesce(deleted_by, auth.uid())
   where id = p_lead;

  insert into public.crm_sales_lead_activities (
    lead_id, activity_type, subject, body, status, done_at, created_by
  ) values (
    p_lead, 'archive', 'Lead arquivado', nullif(trim(p_motivo), ''),
    'done', now(), auth.uid()
  );
end;
$$;

create or replace function public.crm_sales_lead_desarquivar(p_lead uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.crm_is_gestor() then
    raise exception 'Só a gestão pode desarquivar um lead.';
  end if;

  update public.crm_sales_leads
     set deleted_at = null, deleted_by = null
   where id = p_lead;

  insert into public.crm_sales_lead_activities (
    lead_id, activity_type, subject, status, done_at, created_by
  ) values (p_lead, 'archive', 'Lead desarquivado', 'done', now(), auth.uid());
end;
$$;

revoke all on function public.crm_sales_lead_arquivar(uuid, text)   from public, anon;
revoke all on function public.crm_sales_lead_desarquivar(uuid)      from public, anon;
grant execute on function public.crm_sales_lead_arquivar(uuid, text) to authenticated;
grant execute on function public.crm_sales_lead_desarquivar(uuid)    to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — prazo por etapa, configurável                           ║
-- ╚═══════════════════════════════════════════════════════════════════╝
create table if not exists public.crm_stage_sla (
  funnel_type text not null,
  stage       text not null,
  prazo_dias  integer not null check (prazo_dias between 1 and 365),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id),
  primary key (funnel_type, stage)
);

alter table public.crm_stage_sla enable row level security;

-- Todo mundo lê (o card precisa saber se está atrasado); só gestor escreve.
drop policy if exists crm_stage_sla_select on public.crm_stage_sla;
create policy crm_stage_sla_select on public.crm_stage_sla
  for select using (auth.uid() is not null);

drop policy if exists crm_stage_sla_write on public.crm_stage_sla;
create policy crm_stage_sla_write on public.crm_stage_sla
  for all using (public.crm_is_gestor()) with check (public.crm_is_gestor());

-- Valores iniciais. São ponto de partida discutido, não lei — a tela edita.
-- `on conflict do nothing` para reenviar o bloco não sobrescrever ajuste feito.
insert into public.crm_stage_sla (funnel_type, stage, prazo_dias) values
  -- Outbound (f12) — ritmo de prospecção, curto por natureza
  ('f12','prospeccao',2), ('f12','cadencia',3), ('f12','conectado',3),
  ('f12','qualificado',2), ('f12','reuniao',1), ('f12','nutricao',30),
  -- Inbound (f11) — ritmo de closer
  ('f11','novo',1), ('f11','contato',2), ('f11','qualificado',2),
  ('f11','orcamento',2), ('f11','proposta',4), ('f11','negociacao',3),
  ('f11','formalizacao',3),
  -- Comercial Expansão (f13) — ciclo mais longo
  ('f13','a_contatar',2), ('f13','contato',3), ('f13','qualificado',4),
  ('f13','visita_agendada',3), ('f13','em_negociacao',5),
  -- Follow up (f10) — recompra, sem pressa
  ('f10','a_reativar',15), ('f10','contato',5), ('f10','reengajado',7),
  ('f10','oferta',5), ('f10','negociacao',5)
on conflict (funnel_type, stage) do nothing;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — a RPC da tela                                           ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- Um roundtrip, agregação no banco. Montar isso no cliente exigiria puxar
-- todos os leads E todas as atividades para o navegador — não escala, e a
-- regra de "esquecido" acabaria divergindo do dia em que outro app precisar
-- do mesmo número.
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
  -- Leads ARQUIVADOS entram nas séries históricas de propósito: eles foram
  -- criados/ganhos/perdidos naquele dia e isso não muda depois do fato.
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
  -- Movimentação = leads DISTINTOS que mudaram de etapa no dia. Um card movido
  -- cinco vezes conta uma vez: a pergunta é "quantos leads foram tocados", não
  -- "quantos arrastos houve".
  movidos as (
    select created_at::date as dia, count(distinct lead_id) as n
      from public.crm_sales_lead_activities
     where activity_type = 'stage_change'
       and created_at::date between p_desde and p_ate
     group by 1
  ),
  -- ── Retrato de AGORA (não é série) ────────────────────────────────────
  -- Só lead vivo: não arquivado e fora de etapa terminal.
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
           -- Tarefa em aberto conta como "tem próximo passo": alguém já se
           -- comprometeu com uma data.
           exists (select 1 from public.crm_sales_lead_activities t
                    where t.lead_id = a.id and t.activity_type = 'task'
                      and t.status = 'pending') as tem_tarefa
      from abertos a
  ),
  final as (
    select c.*,
           -- ESQUECIDO = estourou o prazo E não há nada agendado. É o número
           -- acionável: separa "parado porque depende do cliente" (tem data
           -- marcada) de "parado porque ninguém foi atrás".
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
    -- A lista clicável. Sem ela a tela informa e não permite agir.
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
-- ║ BLOCO 6 — conferência                                             ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- select jsonb_pretty(public.crm_acompanhamento());
--   → objeto com serie/hoje/por_pessoa/por_etapa/motivos/lista_esquecidos.
--   Rodando como não-gestor tem que dar "Tela restrita à gestão."


-- ─── Rollback ────────────────────────────────────────────────────────
-- drop function if exists public.crm_acompanhamento(date, date);
-- drop function if exists public.crm_sales_lead_arquivar(uuid, text);
-- drop function if exists public.crm_sales_lead_desarquivar(uuid);
-- drop table if exists public.crm_stage_sla;
-- (a policy de select volta ao original, sem o "deleted_at is null")
-- alter table public.crm_sales_leads drop column if exists deleted_at, drop column if exists deleted_by;
