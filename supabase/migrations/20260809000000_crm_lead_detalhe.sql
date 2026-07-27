-- =====================================================================
-- Caminho para TODO card — inclusive o arquivado — e o painel do gestor.
--
-- Dois problemas:
--
--   1) A lista de esquecidos do Admin linka para
--      /crm/pipelines?funil=X&lead=<id>, mas o `?lead=` NUNCA foi lido pelo
--      CRM. O link abria a pipeline certa e o card nenhum.
--
--   2) Mesmo lendo, um lead ARQUIVADO não abriria: a policy de SELECT esconde
--      `deleted_at is not null` de todo mundo, de propósito (ele sai da
--      operação). Mas "sair da operação" não é "deixar de existir" — quem
--      audita precisa alcançar.
--
-- A RPC abaixo resolve os dois: busca UM lead por id, enxerga arquivado, e
-- devolve junto a timeline e os orçamentos. Serve tanto o CRM (abrir o card
-- pelo link) quanto o Admin (espelhar o card na própria tela, sem trocar de
-- sistema).
--
-- O guard NÃO é só de gestor: o dono do lead também alcança o próprio card por
-- link. Fosse só gestor, um vendedor clicando num link que ele mesmo mandou
-- levaria um "acesso negado" no próprio negócio.
--
-- ⚠️ RODAR EM BLOCOS SEPARADOS no SQL Editor, um por vez.
-- =====================================================================


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o card inteiro, por id                                  ║
-- ╚═══════════════════════════════════════════════════════════════════╝
create or replace function public.crm_lead_detalhe(p_lead uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_lead  record;
  v_out   jsonb;
begin
  select * into v_lead from public.crm_sales_leads where id = p_lead;
  if v_lead.id is null then
    raise exception 'Lead não encontrado.' using errcode = 'no_data_found';
  end if;

  -- SECURITY DEFINER não muda auth.uid(): o guard continua avaliando quem
  -- chamou. Sem `deleted_at is null` aqui — alcançar o arquivado é o objetivo.
  if not (
    public.crm_is_gestor()
    or v_lead.created_by = auth.uid()
    or v_lead.assigned_to = auth.uid()
    or (v_lead.origin_lead_id is not null and v_lead.assigned_to is null)
  ) then
    raise exception 'Sem permissão para ver este lead.';
  end if;

  select jsonb_build_object(
    'lead', to_jsonb(v_lead),
    'arquivado', v_lead.deleted_at is not null,
    'atividades', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'activity_type', a.activity_type, 'subject', a.subject,
               'body', a.body, 'status', a.status, 'due_at', a.due_at,
               'done_at', a.done_at, 'stage_from', a.stage_from, 'stage_to', a.stage_to,
               'created_by', a.created_by, 'created_by_name', a.created_by_name,
               'created_at', a.created_at, 'pinned', a.pinned, 'meta', a.meta
             ) order by a.created_at desc)
        from public.crm_sales_lead_activities a where a.lead_id = p_lead
    ), '[]'::jsonb),
    'orcamentos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'order_id', o.id, 'order_number', o.order_number,
               'total', o.total, 'status', o.status, 'created_at', o.created_at
             ) order by o.created_at desc)
        from public.crm_lead_orders lo
        join public.carboze_orders o on o.id = lo.order_id
       where lo.lead_id = p_lead
    ), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$$;

revoke all on function public.crm_lead_detalhe(uuid) from public, anon;
grant execute on function public.crm_lead_detalhe(uuid) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — comentar de fora do CRM                                 ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- O gestor lê o card no Admin e precisa poder responder ali mesmo. Passa por
-- RPC porque a policy de INSERT das atividades exige acesso ao lead com
-- `deleted_at is null` — comentar num arquivado (o caso de auditoria) seria
-- barrado.
--
-- O texto é gravado como nota comum, com a autoria de quem escreveu: o
-- comentário do gestor tem que ser indistinguível de um feito pelo CRM, senão
-- vira uma segunda timeline paralela que ninguém lê.
create or replace function public.crm_lead_comentar(
  p_lead  uuid,
  p_texto text
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_lead record;
  v_id   uuid;
  v_nome text;
begin
  if coalesce(trim(p_texto), '') = '' then
    raise exception 'Comentário vazio.';
  end if;

  select * into v_lead from public.crm_sales_leads where id = p_lead;
  if v_lead.id is null then
    raise exception 'Lead não encontrado.';
  end if;

  if not (
    public.crm_is_gestor()
    or v_lead.created_by = auth.uid()
    or v_lead.assigned_to = auth.uid()
  ) then
    raise exception 'Sem permissão para comentar neste lead.';
  end if;

  select coalesce(p.full_name, p.username) into v_nome
    from public.profiles p where p.id = auth.uid();

  insert into public.crm_sales_lead_activities (
    lead_id, activity_type, body, status, done_at, created_by, created_by_name
  ) values (
    p_lead, 'note', trim(p_texto), 'done', now(), auth.uid(), v_nome
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.crm_lead_comentar(uuid, text) from public, anon;
grant execute on function public.crm_lead_comentar(uuid, text) to authenticated;

notify pgrst, 'reload schema';


-- ─── Conferência ─────────────────────────────────────────────────────
-- No SQL Editor o auth.uid() é NULO, então estas funções vão recusar por
-- permissão — o que é o comportamento correto. Teste pelas telas:
--   • Admin → Acompanhamento → clicar num esquecido: abre o painel.
--   • Copiar o link de um card e abrir no CRM: tem que abrir o card certo.
--   • Arquivar um lead e abrir o link dele: abre com o aviso de arquivado.


-- ─── Rollback ────────────────────────────────────────────────────────
-- drop function if exists public.crm_lead_detalhe(uuid);
-- drop function if exists public.crm_lead_comentar(uuid, text);
