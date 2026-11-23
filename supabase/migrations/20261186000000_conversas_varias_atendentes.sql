-- ═══════════════════════════════════════════════════════════════════════════
-- Conversas — fase 2: várias atendentes (23/11/2026)
--
-- 1. `carbo_wa_caixa`: a espera do cliente só acaba com resposta de GENTE.
--    Aviso automático da esteira (template sem autor) não responde ninguém —
--    pergunta seguida de "NF emitida" saía da fila calada. A função devolve,
--    por conversa, as mensagens do cliente depois da última resposta de gente
--    (antes: depois da última saída QUALQUER) e o `enviado_por_nome`, que é o
--    que diz "foi gente". Mesmas colunas de antes, mais esta.
-- 2. `carbo_wa_definir_status`: status pelo BANCO, com o relógio do SERVIDOR
--    (o `desde` vinha do relógio do navegador) e recusa "chegou mensagem nova"
--    quando o cliente escreveu depois do que a tela mostrava.
-- 3. `carbo_wa_definir_responsavel`: assumir/passar com TRAVA — se o dono
--    mudou desde o que a tela mostrava, recusa em vez de atropelar.
-- 4. `carbo_wa_assumir_ao_responder`: quem responde conversa SEM dono vira o
--    responsável (só service role — o `whatsapp-responder` chama).
-- ⚠️ Front antes do SQL não quebra: sem as funções a tela cai na gravação antiga.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. A caixa ────────────────────────────────────────────────────────────
create or replace function public.carbo_wa_caixa(p_numero_id text, p_dias int default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with m as (
    select c.*,
           (to_jsonb(c) ->> 'enviado_por_nome') as _autor,
           row_number() over (partition by c.wa_id order by c.ocorrido_em desc, c.wamid desc) as _rn,
           row_number() over (partition by c.wa_id, c.direcao order by c.ocorrido_em desc, c.wamid desc) as _rn_dir,
           max(c.ocorrido_em) filter (
             where c.direcao = 'saida'
               and (c.tipo is distinct from 'template' or (to_jsonb(c) ->> 'enviado_por_nome') is not null)
           ) over (partition by c.wa_id) as _ult_resposta,
           row_number() over (partition by c.wa_id,
                                (c.direcao = 'saida'
                                 and (c.tipo is distinct from 'template' or (to_jsonb(c) ->> 'enviado_por_nome') is not null))
                              order by c.ocorrido_em desc, c.wamid desc) as _rn_resp,
           row_number() over (partition by c.wa_id, (c.bling_id is not null)
                              order by c.ocorrido_em desc, c.wamid desc) as _rn_ped,
           row_number() over (partition by c.wa_id, (c.cliente_pedido is not null)
                              order by c.ocorrido_em asc, c.wamid asc) as _rn_nome
      from public.carbo_wa_conversas c
     where (select public.carbo_e_time_interno())
       and c.numero_id = p_numero_id
       and c.ocorrido_em >= now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 120)))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'wamid', m.wamid, 'wa_id', m.wa_id, 'numero_id', m.numero_id,
           'direcao', m.direcao, 'tipo', m.tipo, 'ocorrido_em', m.ocorrido_em,
           'texto', case when m._rn = 1 or m.direcao = 'entrada' then m.texto end,
           'bling_id', m.bling_id, 'sobre_a_etapa', m.sobre_a_etapa,
           'vinculo_exato', m.vinculo_exato,
           'cliente_pedido', m.cliente_pedido, 'nome_whatsapp', m.nome_whatsapp,
           'enviado_por_nome', m._autor)
           order by m.ocorrido_em desc, m.wamid desc), '[]'::jsonb)
    from m
   where m._rn = 1
      or m._rn_dir = 1
      -- a última resposta de GENTE (é dela que a tela tira o corte)
      or (m.direcao = 'saida' and m._rn_resp = 1
          and (m.tipo is distinct from 'template' or m._autor is not null))
      or (m.direcao = 'entrada' and m.ocorrido_em > coalesce(m._ult_resposta, '-infinity'::timestamptz))
      or (m.bling_id is not null and m._rn_ped = 1)
      or (m.cliente_pedido is not null and m._rn_nome = 1);
$$;

comment on function public.carbo_wa_caixa(text, int) is
  'A lista da caixa de Conversas: por conversa, só as mensagens que agruparConversas usa. '
  'A espera do cliente acaba com resposta de GENTE, nunca com aviso automático (20261186). '
  'jsonb (sem teto de 1.000). SECURITY DEFINER guardada por carbo_e_time_interno(). No SQL Editor volta vazia.';
grant execute on function public.carbo_wa_caixa(text, int) to authenticated, service_role;
revoke execute on function public.carbo_wa_caixa(text, int) from anon, public;

-- ── 2. Status pelo banco ──────────────────────────────────────────────────
create or replace function public.carbo_wa_definir_status(
  p_numero_id text, p_wa_id text, p_status text,
  p_assumir boolean default false, p_visto_ate timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eu uuid := auth.uid();
  v_nome text;
  v_resp uuid;
  v_resp_nome text;
  v_nova timestamptz;
begin
  if not coalesce((select public.carbo_e_time_interno()), false) then
    raise exception 'sem acesso ao atendimento' using errcode = '42501';
  end if;
  if p_status not in ('aberto','em_atendimento','aguardando','resolvido') then
    raise exception 'status inválido: %', p_status using errcode = '22023';
  end if;

  -- ⚠️ Resolver/aguardar com a tela desatualizada escondia a pergunta que
  -- chegou no meio. Mensagem do cliente depois do que a tela mostrava: recusa.
  if p_status in ('aguardando','resolvido') and p_visto_ate is not null then
    select max(ocorrido_em) into v_nova
      from public.carbo_wa_mensagens
     where numero_id = p_numero_id and wa_id = p_wa_id
       and direcao = 'entrada' and ocorrido_em > p_visto_ate;
    if v_nova is not null then
      return jsonb_build_object('ok', false, 'motivo', 'mensagem_nova', 'em', v_nova);
    end if;
  end if;

  select responsavel, responsavel_nome into v_resp, v_resp_nome
    from public.carbo_wa_atendimento
   where numero_id = p_numero_id and wa_id = p_wa_id
   for update;

  if p_assumir and v_resp is not null and v_resp is distinct from v_eu then
    return jsonb_build_object('ok', false, 'motivo', 'ja_tem_dono',
                              'responsavel_nome', v_resp_nome);
  end if;

  select full_name into v_nome from public.profiles where id = v_eu;

  insert into public.carbo_wa_atendimento
    (numero_id, wa_id, status, desde, responsavel, responsavel_nome, atualizado_em, atualizado_por)
  values
    (p_numero_id, p_wa_id, p_status, now(),
     case when p_assumir then v_eu end, case when p_assumir then v_nome end, now(), v_eu)
  on conflict (numero_id, wa_id) do update set
    status = excluded.status,
    desde = now(),
    responsavel = case when p_assumir then v_eu else carbo_wa_atendimento.responsavel end,
    responsavel_nome = case when p_assumir then v_nome else carbo_wa_atendimento.responsavel_nome end,
    atualizado_em = now(),
    atualizado_por = v_eu;

  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.carbo_wa_definir_status(text, text, text, boolean, timestamptz) from anon, public;
grant execute on function public.carbo_wa_definir_status(text, text, text, boolean, timestamptz) to authenticated, service_role;

-- ── 3. Responsável com trava ──────────────────────────────────────────────
-- `p_esperado` = o dono que a TELA mostrava (nulo = "ninguém"). Mudou desde
-- então: recusa e diz quem é o dono agora. `p_forcar` só quando a pessoa
-- confirmou que quer tirar de outra.
create or replace function public.carbo_wa_definir_responsavel(
  p_numero_id text, p_wa_id text, p_pessoa uuid,
  p_esperado uuid default null, p_forcar boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eu uuid := auth.uid();
  v_nome text;
  v_resp uuid;
  v_resp_nome text;
begin
  if not coalesce((select public.carbo_e_time_interno()), false) then
    raise exception 'sem acesso ao atendimento' using errcode = '42501';
  end if;

  select responsavel, responsavel_nome into v_resp, v_resp_nome
    from public.carbo_wa_atendimento
   where numero_id = p_numero_id and wa_id = p_wa_id
   for update;

  if not p_forcar and v_resp is distinct from p_esperado then
    return jsonb_build_object('ok', false, 'motivo', 'mudou',
                              'responsavel', v_resp,
                              'responsavel_nome', v_resp_nome);
  end if;

  if p_pessoa is not null then
    select full_name into v_nome from public.profiles where id = p_pessoa;
  end if;

  -- ⚠️ NÃO mexe em `status` nem em `desde`: trocar o dono não é decidir de
  -- novo sobre a conversa, e reescrever a data desfaria uma reabertura.
  insert into public.carbo_wa_atendimento
    (numero_id, wa_id, status, desde, responsavel, responsavel_nome, atualizado_em, atualizado_por)
  values (p_numero_id, p_wa_id, 'em_atendimento', now(), p_pessoa, v_nome, now(), v_eu)
  on conflict (numero_id, wa_id) do update set
    responsavel = excluded.responsavel,
    responsavel_nome = excluded.responsavel_nome,
    atualizado_em = now(),
    atualizado_por = v_eu;

  return jsonb_build_object('ok', true, 'responsavel_nome', v_nome);
end $$;

revoke execute on function public.carbo_wa_definir_responsavel(text, text, uuid, uuid, boolean) from anon, public;
grant execute on function public.carbo_wa_definir_responsavel(text, text, uuid, uuid, boolean) to authenticated, service_role;

-- ── 4. Quem responde conversa sem dono vira o dono ───────────────────────
-- Só preenche o VAZIO: conversa com dono continua com ele. Sem linha, nasce
-- "em atendimento" com quem respondeu (é o que o "Assumir" já fazia).
create or replace function public.carbo_wa_assumir_ao_responder(
  p_numero_id text, p_wa_id text, p_pessoa uuid, p_nome text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.carbo_wa_atendimento
    (numero_id, wa_id, status, desde, responsavel, responsavel_nome, atualizado_em, atualizado_por)
  values (p_numero_id, p_wa_id, 'em_atendimento', now(), p_pessoa, p_nome, now(), p_pessoa)
  on conflict (numero_id, wa_id) do update set
    responsavel = p_pessoa, responsavel_nome = p_nome,
    atualizado_em = now(), atualizado_por = p_pessoa
  where carbo_wa_atendimento.responsavel is null;
$$;

revoke execute on function public.carbo_wa_assumir_ao_responder(text, text, uuid, text) from anon, public, authenticated;
grant execute on function public.carbo_wa_assumir_ao_responder(text, text, uuid, text) to service_role;

notify pgrst, 'reload schema';
