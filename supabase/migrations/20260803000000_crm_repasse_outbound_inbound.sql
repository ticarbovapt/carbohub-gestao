-- =====================================================================
-- Fase 7 — o repasse do SDR ao closer.
--
-- Mover o card para "Passado ao Closer" passa a CRIAR um card no Inbound com
-- todo o histórico junto. Duas linhas, não uma: mover o card de funil faria o
-- board do SDR mentir sobre o trabalho dele — mesmo argumento que a
-- consolidação f13 já usou.
--
-- MODELO DE POSSE (decidido em 26/07): a cópia nasce SEM DONO, numa fila
-- aberta, e o closer pega. O time ainda não foi contratado — vai ser 1 SDR e
-- 1 closer, com a ideia de que cada SDR tenha o seu. Amarrar dono agora seria
-- inventar estrutura que não existe. Quando existir, muda-se só o `assigned_to`
-- do INSERT.
--
-- Duplicar exige três coisas JUNTAS, senão a métrica quebra no primeiro mês:
--   1) vínculo por FK real, para qualquer relatório contar o negócio UMA vez;
--   2) o card do SDR nunca contar receita (já resolvido no B2, fase 1);
--   3) idempotência — hoje NÃO existe nenhuma unique key nesta tabela, e dois
--      cliques gerariam dois cards.
--
-- ⚠️ RODAR EM BLOCOS SEPARADOS no SQL Editor, um por vez.
-- =====================================================================


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o vínculo entre o card do SDR e o do closer             ║
-- ╚═══════════════════════════════════════════════════════════════════╝
set lock_timeout = '5s';

alter table public.crm_sales_leads
  add column if not exists origin_lead_id    uuid references public.crm_sales_leads(id) on delete set null,
  add column if not exists origin_funnel_type text;

reset lock_timeout;

-- Idempotência: um card de origem gera NO MÁXIMO uma cópia. Sem isto, dois
-- cliques no repasse (ou um duplo-clique) criariam dois cards no Inbound, e o
-- mesmo negócio passaria a ser contado duas vezes — exatamente o que a fase 1
-- acabou de consertar do outro lado.
create unique index if not exists uq_crm_sales_leads_origin
  on public.crm_sales_leads (origin_lead_id)
  where origin_lead_id is not null;

comment on column public.crm_sales_leads.origin_lead_id is
  'Card que originou este, no repasse Outbound → Inbound. Relatório de receita '
  'deve filtrar por origin_lead_id is null para não contar o negócio duas vezes.';


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a fila aberta: quem enxerga a cópia sem dono            ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- A RLS só deixava ler quem é `created_by` ou `assigned_to`. Como o INSERT do
-- repasse registra o SDR como criador, o closer NÃO enxergaria a própria fila.
--
-- O acréscimo é ESTREITO de propósito: só lead que veio de repasse
-- (origin_lead_id not null) E ainda não tem dono. Um "assigned_to is null →
-- todo mundo vê" abriria também a base atual inteira, que em boa parte nunca
-- foi atribuída a ninguém. Isso seria mudar o escopo de visão do CRM de lambuja,
-- sem ninguém ter pedido.
drop policy if exists crm_sales_leads_select on public.crm_sales_leads;
create policy crm_sales_leads_select on public.crm_sales_leads
  for select using (
    deleted_at is null
    and (
      created_by = auth.uid()
      or assigned_to = auth.uid()
      or public.crm_is_gestor()
      -- fila aberta do repasse
      or (origin_lead_id is not null and assigned_to is null)
    )
  );

-- Para PEGAR o card da fila é preciso poder dar UPDATE nele.
drop policy if exists crm_sales_leads_update on public.crm_sales_leads;
create policy crm_sales_leads_update on public.crm_sales_leads
  for update using (
    created_by = auth.uid()
    or assigned_to = auth.uid()
    or public.crm_is_gestor()
    or (origin_lead_id is not null and assigned_to is null)
  );


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — a RPC do repasse                                        ║
-- ╚═══════════════════════════════════════════════════════════════════╝
create or replace function public.crm_sales_lead_repassar(
  p_lead uuid,
  p_nota text default null
)
returns uuid   -- id do card criado no Inbound (ou o já existente, se repetir)
language plpgsql security definer set search_path = public
as $$
declare
  v_lead  record;
  v_novo  uuid;
  v_atual uuid;
begin
  -- SECURITY DEFINER não muda auth.uid(): o guard segue avaliando quem chamou.
  -- É o que permite copiar as atividades preservando a autoria do SDR sem
  -- deixar qualquer um repassar card alheio.
  select * into v_lead
    from public.crm_sales_leads
   where id = p_lead
     and (created_by = auth.uid() or assigned_to = auth.uid() or public.crm_is_gestor());

  if v_lead.id is null then
    raise exception 'Lead não encontrado ou sem permissão.';
  end if;
  if v_lead.deleted_at is not null then
    raise exception 'Lead arquivado não pode ser repassado.';
  end if;

  -- Idempotente: repassar de novo devolve o card que já existe, em vez de
  -- estourar o unique index com um erro que a tela teria que interpretar.
  select id into v_atual from public.crm_sales_leads where origin_lead_id = p_lead;
  if v_atual is not null then
    return v_atual;
  end if;

  insert into public.crm_sales_leads (
    funnel_type, stage, lead_segment,
    contact_name, contact_phone, contact_whatsapp, contact_email, contact_cpf,
    cnpj, legal_name, trade_name, ramo, city, state, segment,
    source, estimated_revenue, credit_amount, fleet_size, territory,
    qual_volume, qual_dor, qual_decisor, qual_prazo,
    notes, tags, custom_fields,
    origin_lead_id, origin_funnel_type,
    -- O SDR é o criador (foi ele quem gerou o card), mas NINGUÉM é o dono
    -- ainda: a cópia nasce na fila aberta e o closer pega.
    created_by, assigned_to,
    -- Temperatura NÃO é copiada: quem vai negociar avalia por conta própria.
    temperature
  ) values (
    'f11',
    -- Entra direto em Qualificado: o SDR já fez a qualificação, e mandar para
    -- "Lead Recebido" faria o closer refazer trabalho que já está no card.
    'qualificado',
    v_lead.lead_segment,
    v_lead.contact_name, v_lead.contact_phone, v_lead.contact_whatsapp,
    v_lead.contact_email, v_lead.contact_cpf,
    v_lead.cnpj, v_lead.legal_name, v_lead.trade_name, v_lead.ramo,
    v_lead.city, v_lead.state, v_lead.segment,
    v_lead.source, v_lead.estimated_revenue, v_lead.credit_amount,
    v_lead.fleet_size, v_lead.territory,
    v_lead.qual_volume, v_lead.qual_dor, v_lead.qual_decisor, v_lead.qual_prazo,
    v_lead.notes, coalesce(v_lead.tags, '{}'), coalesce(v_lead.custom_fields, '{}'::jsonb),
    v_lead.id, v_lead.funnel_type,
    auth.uid(), null,
    'frio'
  )
  returning id into v_novo;

  -- NÃO copiados de propósito: won_at, lost_at, lost_reason (o negócio não foi
  -- ganho nem perdido — está começando do outro lado), deleted_at, e
  -- legacy_funnel_type/legacy_stage se existirem (são o rollback da
  -- consolidação f13; reutilizá-los corromperia aquele mecanismo).

  -- ── A timeline ────────────────────────────────────────────────────
  -- crm_sales_lead_activities é a timeline, os comentários E as tarefas ao
  -- mesmo tempo (discriminador activity_type). Copiar "os comentários" é
  -- copiar esta tabela.
  insert into public.crm_sales_lead_activities (
    lead_id, activity_type, subject, body, status, due_at, done_at,
    stage_from, stage_to, created_by, created_by_name, pinned, meta, created_at
  )
  select
    v_novo, a.activity_type, a.subject, a.body,
    -- Tarefa PENDENTE vira concluída na cópia: manter pendente cobraria duas
    -- pessoas pelo mesmo trabalho, e a tela de acompanhamento contaria o card
    -- como "tem próximo passo" por causa de uma tarefa que é do SDR.
    case when a.activity_type = 'task' and a.status = 'pending' then 'done' else a.status end,
    case when a.activity_type = 'task' and a.status = 'pending' then null else a.due_at end,
    case when a.activity_type = 'task' and a.status = 'pending' then now() else a.done_at end,
    a.stage_from, a.stage_to,
    -- created_by preservado: a autoria é do SDR. Copiar pelo cliente
    -- falsificaria isto, porque a policy de INSERT força created_by = auth.uid().
    a.created_by, a.created_by_name, false,
    coalesce(a.meta, '{}'::jsonb) || jsonb_build_object(
      'copiado_de', a.id,
      'copiado_do_lead', p_lead,
      'copiado_em', now()
    ),
    -- Preserva a data original: a timeline do closer tem que mostrar QUANDO a
    -- conversa aconteceu, não quando foi copiada.
    a.created_at
  from public.crm_sales_lead_activities a
  where a.lead_id = p_lead
  order by a.created_at;

  -- Marco no card novo, para separar o que é herdado do que é novo.
  insert into public.crm_sales_lead_activities (
    lead_id, activity_type, subject, body, status, done_at, created_by, meta
  ) values (
    v_novo, 'note',
    'Recebido do Outbound',
    coalesce(nullif(trim(p_nota), ''), 'Tudo acima desta nota veio do card do SDR.'),
    'done', now(), auth.uid(),
    jsonb_build_object('origin_lead_id', p_lead)
  );

  -- E o espelho no card do SDR, para ele ver que saiu da mão dele.
  insert into public.crm_sales_lead_activities (
    lead_id, activity_type, subject, body, status, done_at, created_by, meta
  ) values (
    p_lead, 'note', 'Repassado ao closer', nullif(trim(p_nota), ''),
    'done', now(), auth.uid(),
    jsonb_build_object('copia_lead_id', v_novo)
  );

  -- Só agora move o card do SDR — se algo acima falhar, nada aconteceu.
  -- O trigger da fase 3 registra a mudança de etapa sozinho.
  update public.crm_sales_leads set stage = 'repassado' where id = p_lead;

  return v_novo;
end;
$$;

revoke all on function public.crm_sales_lead_repassar(uuid, text) from public, anon;
grant execute on function public.crm_sales_lead_repassar(uuid, text) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — pegar o card da fila                                    ║
-- ╚═══════════════════════════════════════════════════════════════════╝
create or replace function public.crm_sales_lead_pegar(p_lead uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_dono uuid;
begin
  select assigned_to into v_dono
    from public.crm_sales_leads
   where id = p_lead and origin_lead_id is not null and deleted_at is null;

  if not found then
    raise exception 'Card não está na fila de repasse.';
  end if;
  if v_dono is not null then
    raise exception 'Alguém já pegou este card.';
  end if;

  update public.crm_sales_leads
     set assigned_to = auth.uid()
   where id = p_lead and assigned_to is null;   -- corrida: quem chegar 2º não sobrescreve

  insert into public.crm_sales_lead_activities (
    lead_id, activity_type, subject, status, done_at, created_by
  ) values (p_lead, 'note', 'Card assumido', 'done', now(), auth.uid());
end;
$$;

revoke all on function public.crm_sales_lead_pegar(uuid) from public, anon;
grant execute on function public.crm_sales_lead_pegar(uuid) to authenticated;

notify pgrst, 'reload schema';


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 5 — conferência                                             ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- Depois de repassar um card na tela:
--
-- select l.id, l.funnel_type, l.stage, l.assigned_to is null as na_fila,
--        l.origin_lead_id, o.stage as etapa_do_sdr,
--        (select count(*) from public.crm_sales_lead_activities a
--          where a.lead_id = l.id) as atividades_copiadas
--   from public.crm_sales_leads l
--   left join public.crm_sales_leads o on o.id = l.origin_lead_id
--  where l.origin_lead_id is not null;
--
--   → na_fila = true, etapa_do_sdr = 'repassado', e atividades_copiadas
--     igual ao total do card de origem + 1 (a nota "Recebido do Outbound").
--
-- Repassar o MESMO card de novo tem que devolver o mesmo id, sem criar linha.


-- ─── Rollback ────────────────────────────────────────────────────────
-- drop function if exists public.crm_sales_lead_repassar(uuid, text);
-- drop function if exists public.crm_sales_lead_pegar(uuid);
-- drop index if exists public.uq_crm_sales_leads_origin;
-- (a policy de select/update volta à versão da fase 4, sem a fila aberta)
-- alter table public.crm_sales_leads
--   drop column if exists origin_lead_id, drop column if exists origin_funnel_type;
