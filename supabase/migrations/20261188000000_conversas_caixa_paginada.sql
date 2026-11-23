-- ═══════════════════════════════════════════════════════════════════════════
-- Conversas — fase 3b: a lista traz o TRABALHO inteiro e o resto em páginas
-- (23/11/2026)
--
-- Com o resumo (20261187) a lista ficou rápida (97 ms medido como o Lorran),
-- mas ainda trazia TODAS as conversas de 30 dias. A 1.000+ pedidos/dia quase
-- todas são "quietas" — só receberam aviso automático, ou já foram resolvidas
-- — e baixá-las a cada recarga é o que não escala.
--
-- `carbo_wa_caixa_v2` devolve:
--   ativas   TODAS as conversas que podem pedir alguém: o status que a tela
--            calcula NÃO é "resolvido" nem nulo (aberto, em atendimento,
--            aguardando), mais as de janela aberta e as do próprio usuário.
--            As abas (Não respondidas, Minhas, Sem responsável, Janela aberta)
--            só contam conversas daqui — por isso as contagens continuam
--            certas sem trazer o resto.
--   quietas  as outras, das mais recentes para trás, em PÁGINA
--            (`p_quietas_limite`), filtradas por busca/etiqueta/etapa/dono.
--   total    quantas conversas há nos `p_dias` (a aba "Todas").
--
-- ⚠️ "Quieta" é o espelho do `statusEfetivo` da tela (`lib/conversas.ts`):
--   resolvido = resolvida e o cliente não escreveu depois;
--   nulo      = sem marca de aguardando/resolvido, nada pendente e ninguém de
--               gente respondeu.
-- Errar para o lado de trazer A MAIS só custa bytes (a tela recalcula); errar
-- para o lado de trazer a menos esconderia trabalho. Mudou o `statusEfetivo`,
-- confira este `where`.
-- ⚠️ A busca normaliza acento como a tela (`normalizar`), e casa número só com
-- número.
-- ⚠️ Front antes do SQL não quebra: sem a função, a tela usa a de 20261187.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.carbo_wa_texto_chave_busca(p text)
returns text language sql immutable as $$
  select translate(lower(coalesce(p, '')),
                   'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn');
$$;

create or replace function public.carbo_wa_caixa_v2(
  p_numero_id text,
  p_dias int default 30,
  p_quietas_limite int default 300,
  p_busca text default null,
  p_responsavel uuid default null,
  p_tag uuid default null,
  p_etapa text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select r.*, c.nome as nome_whatsapp, c.last_inbound_at,
           a.status as at_status, a.desde as at_desde, a.responsavel, a.responsavel_nome,
           -- ⚠️ `coalesce` em cada parte: sem linha de atendimento, `a.status` é
           -- nulo, e NULL aqui tiraria a conversa das DUAS listas (nem ativa
           -- nem quieta) — medido no teste local.
           (
             -- resolvida e o cliente não escreveu depois
             coalesce(a.status = 'resolvido'
                      and (r.ultima_entrada_em is null or r.ultima_entrada_em <= a.desde), false)
             or
             -- sem marca, nada pendente, ninguém de gente respondeu
             coalesce(coalesce(a.status, '') not in ('aguardando', 'resolvido')
                      and cardinality(r.pendentes_em) = 0 and r.ultima_resposta_em is null, false)
           ) as quieta
      from public.carbo_wa_resumo r
      left join public.carbo_wa_contatos c on c.numero_id = r.numero_id and c.wa_id = r.wa_id
      left join public.carbo_wa_atendimento a on a.numero_id = r.numero_id and a.wa_id = r.wa_id
     where (select public.carbo_e_time_interno())
       and r.numero_id = p_numero_id
       and r.ultima_em >= now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 120)))
  ), marcada as (
    select b.*,
           (not b.quieta
            or coalesce(b.last_inbound_at > now() - interval '24 hours', false)
            or coalesce(b.responsavel = (select auth.uid()), false)) as ativa
      from base b
  ), termo as (
    select nullif(btrim(public.carbo_wa_texto_chave_busca(p_busca)), '') as txt,
           nullif(regexp_replace(coalesce(p_busca, ''), '\D', '', 'g'), '') as num
  ), quietas as (
    select m.*
      from marcada m, termo t
     where not m.ativa
       and (p_responsavel is null or m.responsavel = p_responsavel)
       and (p_etapa is null or m.sobre_a_etapa = p_etapa)
       and (p_tag is null or exists (select 1 from public.carbo_wa_conversa_tag ct
                                      where ct.numero_id = m.numero_id and ct.wa_id = m.wa_id
                                        and ct.tag_id = p_tag))
       and (t.txt is null
            or public.carbo_wa_texto_chave_busca(coalesce(m.cliente_pedido, '') || ' ' || coalesce(m.nome_whatsapp, '')) like '%' || t.txt || '%'
            or (t.num is not null and m.wa_id like '%' || t.num || '%'))
  ), quietas_pag as (
    select q.* from quietas q
     order by q.ultima_em desc, q.wa_id
     limit greatest(0, least(coalesce(p_quietas_limite, 300), 5000))
  ), linhas as (
    select m.* from marcada m where m.ativa
    union all
    select q.* from quietas_pag q
  )
  select jsonb_build_object(
    'total', (select count(*) from marcada),
    'ativas', (select count(*) from marcada where ativa),
    'quietas_total', (select count(*) from quietas),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
               'wa_id', l.wa_id, 'numero_id', l.numero_id,
               'ultima_em', l.ultima_em, 'ultima_wamid', l.ultima_wamid, 'ultima_texto', l.ultima_texto,
               'ultima_tipo', l.ultima_tipo, 'ultima_direcao', l.ultima_direcao,
               'ultima_entrada_em', l.ultima_entrada_em, 'ultima_resposta_em', l.ultima_resposta_em,
               'pendentes_em', l.pendentes_em, 'ultima_pendente_texto', l.ultima_pendente_texto,
               'bling_id', l.bling_id, 'sobre_a_etapa', l.sobre_a_etapa, 'vinculo_exato', l.vinculo_exato,
               'cliente_pedido', l.cliente_pedido, 'nome_whatsapp', l.nome_whatsapp,
               'last_inbound_at', l.last_inbound_at,
               'at_status', l.at_status, 'at_desde', l.at_desde,
               'responsavel', l.responsavel, 'responsavel_nome', l.responsavel_nome,
               'ativa', l.ativa,
               'tags', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'nome', t.nome, 'cor', t.cor) order by t.nome)
                                   from public.carbo_wa_conversa_tag ct
                                   join public.carbo_wa_tags t on t.id = ct.tag_id and t.ativo is not false
                                  where ct.numero_id = l.numero_id and ct.wa_id = l.wa_id), '[]'::jsonb))
             order by l.ultima_em desc)
        from linhas l), '[]'::jsonb)
  );
$$;

revoke execute on function public.carbo_wa_texto_chave_busca(text) from anon, public;
grant execute on function public.carbo_wa_texto_chave_busca(text) to authenticated, service_role;
revoke execute on function public.carbo_wa_caixa_v2(text, int, int, text, uuid, uuid, text) from anon, public;
grant execute on function public.carbo_wa_caixa_v2(text, int, int, text, uuid, uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';
