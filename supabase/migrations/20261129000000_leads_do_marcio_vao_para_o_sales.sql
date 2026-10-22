-- ============================================================================
-- 20261129 — Os leads do Marcio Cajahiba no md passam para o Sales
--
-- O MESMO bloco da `20261128` (José), com os ids do Marcio: md MCJ001
-- (produtos.profiles 522ee0bf…, bloqueado na `20261127`) → interno PRV001
-- (public.profiles 7e43dfe3…), pipeline Comercial Expansão (`f13`).
-- Regras, mapa de etapas e travas: ver o cabeçalho da `20261128`.
-- ⚠️ Lead "ganho" no md (cliente das 7 vendas da `20261119`) entra em
-- `convertido`, com `won_at` = data do fechamento no md.
-- ============================================================================

-- ── BLOCO 0 — medir (só lê) ─────────────────────────────────────────────────
select l.id, l.trade_name, l.legal_name, l.cnpj, l.city, l.state, l.stage,
       l.contact_name, l.contact_phone,
       (select count(*) from produtos.lead_activities a
         where a.lead_id = l.id and a.kind in ('nota','ligacao','tarefa'))           as atividades,
       (select string_agg(s.trade_name || ' · ' || s.funnel_type || ' · ' ||
                          coalesce(p.full_name, 'sem dono'), ' | ')
          from public.crm_sales_leads s
          left join public.profiles p on p.id = coalesce(s.assigned_to, s.created_by)
         where nullif(regexp_replace(coalesce(l.cnpj, ''), '\D', '', 'g'), '') is not null
           and regexp_replace(coalesce(s.cnpj, ''), '\D', '', 'g')
             = regexp_replace(l.cnpj, '\D', '', 'g'))                                as ja_no_sales,
       exists (select 1 from public.crm_sales_leads s
                where s.notes like '%md-lead:' || l.id::text || '%')                  as ja_importado
  from produtos.leads l
 where l.owner_id = '522ee0bf-52b1-48fd-954d-937c6311c1a6'
 order by l.created_at;

-- ── BLOCO 1 — importar ─────────────────────────────────────────────────────
do $$
declare
  v_dono   uuid := '7e43dfe3-6635-4d11-817c-a971696a1503';
  v_md     uuid := '522ee0bf-52b1-48fd-954d-937c6311c1a6';
  v_nome   text;
  l        record;
  v_novo   uuid;
  v_stage  text;
  v_feitos int := 0;
begin
  select full_name into v_nome from public.profiles where id = v_dono;
  if v_nome is null then
    raise exception 'Perfil interno do Marcio (%) não encontrado. Nada foi gravado.', v_dono;
  end if;

  for l in select * from produtos.leads where owner_id = v_md order by created_at loop
    if exists (select 1 from public.crm_sales_leads s where s.notes like '%md-lead:' || l.id::text || '%') then
      raise notice '% já importado, pulado', l.trade_name;
      continue;
    end if;
    if nullif(regexp_replace(coalesce(l.cnpj, ''), '\D', '', 'g'), '') is not null
       and exists (select 1 from public.crm_sales_leads s
                    where regexp_replace(coalesce(s.cnpj, ''), '\D', '', 'g')
                        = regexp_replace(l.cnpj, '\D', '', 'g')) then
      raise notice '% (CNPJ %) JÁ existe no Sales — não importado, para não duplicar', l.trade_name, l.cnpj;
      continue;
    end if;

    v_stage := case l.stage
      when 'a_contatar'  then 'a_contatar'
      when 'em_contato'  then 'contato'
      when 'qualificado' then 'qualificado'
      when 'visita'      then 'visita_agendada'
      when 'orcamento'   then 'orcamento'
      when 'proposta'    then 'em_negociacao'
      when 'ganho'       then 'convertido'
      when 'perdido'     then 'sem_interesse'
    end;
    if v_stage is null then
      raise exception 'Lead % está numa etapa desconhecida (%). Nada foi gravado.', l.trade_name, l.stage;
    end if;

    insert into public.crm_sales_leads (
      funnel_type, stage,
      trade_name, legal_name, cnpj, customer_ie,
      city, state, address, numero, bairro, cep,
      contact_name, contact_phone, contact_whatsapp, contact_email,
      source, temperature, estimated_revenue,
      next_follow_up_at, last_contact_at, contact_attempts,
      lost_reason, won_at, lost_at,
      notes, assigned_to, created_by, created_at
    ) values (
      'f13', v_stage,
      l.trade_name, l.legal_name, l.cnpj, l.ie,
      l.city, l.state, coalesce(nullif(btrim(l.logradouro), ''), l.address), l.numero, l.bairro, l.cep,
      l.contact_name, l.contact_phone, l.contact_whatsapp, l.email,
      case l.origin when 'outbound' then 'prospeccao_ativa' when 'indicacao' then 'indicacao' else 'outro' end,
      l.temperature, coalesce(l.estimated_value, 0),
      l.next_follow_up_at, l.last_contact_at, coalesce(l.contact_attempts, 0),
      case when l.stage = 'perdido' then l.lost_reason end,
      case when l.stage = 'ganho'   then l.closed_at end,
      case when l.stage = 'perdido' then l.closed_at end,
      concat_ws(E'\n\n', nullif(btrim(l.notes), ''),
                'Importado do Portal de Microdistribuidores (md) — carteira de ' || v_nome
                || ' · md-lead:' || l.id::text),
      v_dono, v_dono, l.created_at
    ) returning id into v_novo;

    insert into public.crm_sales_lead_activities
      (lead_id, activity_type, body, due_at, status, done_at, created_by, created_by_name, created_at)
    select v_novo,
           case a.kind when 'nota' then 'note' when 'ligacao' then 'call' else 'task' end,
           a.body,
           case when a.kind = 'tarefa' then a.due_date::timestamptz end,
           case when a.kind = 'tarefa' and a.done_at is null then 'pending' else 'done' end,
           case when a.kind = 'tarefa' then a.done_at else coalesce(a.done_at, a.created_at) end,
           v_dono, v_nome, a.created_at
      from produtos.lead_activities a
     where a.lead_id = l.id and a.kind in ('nota','ligacao','tarefa')
     order by a.created_at;

    v_feitos := v_feitos + 1;
    raise notice '% → Comercial Expansão (%)', l.trade_name, v_stage;
  end loop;

  raise notice 'Leads importados: %', v_feitos;
end $$;

-- ── BLOCO 2 — conferir ─────────────────────────────────────────────────────
-- select trade_name, stage, cnpj, created_at,
--        (select count(*) from public.crm_sales_lead_activities a where a.lead_id = s.id) as atividades
--   from public.crm_sales_leads s
--  where s.notes like '%md-lead:%' and s.assigned_to = '7e43dfe3-6635-4d11-817c-a971696a1503'
--  order by created_at;
