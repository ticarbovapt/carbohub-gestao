-- ═══════════════════════════════════════════════════════════════════════════
-- As conversas ANTIGAS do CarboVAPT e do SAC passam para a caixa do CarboZé
-- (26/11/2026)
--
-- Pedido do dono do processo, logo depois da `20261197` (um número dispara
-- tudo): os dois números que mudaram de papel — o ex-Clube (hoje CarboVAPT) e o
-- ex-Loja (hoje CarboZé SAC) — carregam as conversas da recompra e do carrinho
-- de antes da troca. Elas têm de aparecer no CarboZé, para as caixas novas
-- nascerem limpas: *"claro que se responder, vai para o número
-- correspondente, mas seria só para não acabar confundindo depois"*.
--
-- Esta migração NÃO move nada. Ela cria:
--   carbo_wa_mensagens.numero_original / carbo_msg_envios.numero_original
--                               por qual número a linha PASSOU de verdade
--   as duas réguas aprendem a coluna (a resposta no número antigo continua
--                               parando a régua)
--   carbo_wa_trazer_conversas_antigas(corte, ensaio, limite)
--                               o movimento — ENSAIO por padrão, roda pelo SQL
--                               Editor (supabase/consultas/conversas_antigas_para_o_carboze.sql)
--
-- ── O que se move, e o que fica ───────────────────────────────────────────
-- Move a CONVERSA INTEIRA (o par número ↔ cliente) quando:
--   · nada dela aconteceu depois do corte (o instante da troca), e
--   · a janela de 24 h do cliente com o número antigo está fechada, e
--   · não há mensagem agendada pendente nela.
-- Fica onde está:
--   · conversa VIVA depois da troca — o cliente está falando com aquele número,
--     e é dele que a resposta tem de sair (a 131047 recusa texto livre de outro);
--   · conversa com a janela aberta — vai na próxima rodada, quando fechar;
--   · conversa com agendada pendente — a agendada sai pelo número da linha.
--
-- ── O que muda numa conversa movida ───────────────────────────────────────
--   mensagens, avisos automáticos, recados, etiquetas, reações, agendadas já
--   resolvidas, histórico de status e as respostas das réguas → CarboZé.
--   ⚠️ A janela NÃO viaja: a linha de contato do CarboZé nasce sem
--   `last_inbound_at` (o cliente nunca escreveu para ele), e a do número antigo
--   FICA — é a janela real com aquele número. Levar a janela abriria texto livre
--   que a Meta recusa.
--   ⚠️ Status/dono (`carbo_wa_atendimento`) só viajam quando o CarboZé não tem
--   linha própria E não tem mensagem do cliente sem resposta: um "resolvido" do
--   número antigo esconderia a pergunta pendente do CarboZé. Senão, vale o do
--   CarboZé (o lado seguro: mostrar a mais).
--   ⚠️ `numero_original` guarda o número de verdade, nas mensagens e nos envios
--   — é o que faz a resposta que chegar DEPOIS no número antigo ainda casar com
--   o envio movido e parar a régua.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.carbo_wa_mensagens add column if not exists numero_original text;
alter table public.carbo_msg_envios   add column if not exists numero_original text;

comment on column public.carbo_wa_mensagens.numero_original is
  'Preenchida só quando a conversa foi TRAZIDA de outro número para a caixa de numero_id (carbo_wa_trazer_conversas_antigas, 20261200): é o número por onde a mensagem passou de verdade. Nula = passou por numero_id.';
comment on column public.carbo_msg_envios.numero_original is
  'Preenchida só quando a conversa foi TRAZIDA de outro número para a caixa de numero_id (20261200): é o número por onde o aviso saiu de verdade. As réguas casam a resposta por coalesce(numero_original, numero_id).';


-- ── As duas réguas reconhecem a resposta no número ANTIGO ─────────────────
-- Recompra e carrinho param quando o cliente responde, casando (wa_id + número)
-- com o envio. Depois do movimento, o envio diz CarboZé e a resposta nova chega
-- no número antigo — sem isto a régua não pararia, e o cliente que respondeu
-- "não quero" receberia o dia seguinte.
-- ⚠️ Troca no TEXTO VIVO (pg_get_functiondef), dois trechos, cada um tem de
-- aparecer UMA vez; o antes vai para carbo_backup_funcoes. Não casou ⇒ WARNING
-- e a função fica como está — e o movimento RECUSA rodar (ele confere).
create table if not exists public.carbo_backup_funcoes (
  feito_em  timestamptz not null default now(),
  funcao    text not null,
  definicao text not null
);
alter table public.carbo_backup_funcoes enable row level security;

do $m$
declare
  f      text;
  v_def  text;
  v_novo text;
  n1     int;
  n2     int;
begin
  foreach f in array array['public.carbo_recompra_marcar_respostas()',
                           'public.carbo_carrinho_marcar_respostas()'] loop
    begin
      v_def := pg_get_functiondef(f::regprocedure);
      if position('numero_original' in v_def) > 0 then
        continue;                       -- já aplicada
      end if;
      select count(*) into n1 from regexp_matches(v_def, 'v\.wa_id,\s+v\.numero_id,', 'g');
      select count(*) into n2 from regexp_matches(v_def, 'm\.numero_id\s*=\s*e\.numero_id', 'g');
      if n1 <> 1 or n2 <> 1 then
        raise warning '%: o texto vivo não é o esperado (% / %) — a função não foi tocada', f, n1, n2;
        continue;
      end if;
      v_novo := regexp_replace(v_def, 'v\.wa_id,(\s+)v\.numero_id,',
                               'v.wa_id,\1coalesce(v.numero_original, v.numero_id) as numero_id,');
      v_novo := regexp_replace(v_novo, 'm\.numero_id\s*=\s*e\.numero_id',
                               'coalesce(m.numero_original, m.numero_id) = e.numero_id');
      insert into public.carbo_backup_funcoes (funcao, definicao) values (f, v_def);
      execute v_novo;
    exception when others then
      raise warning '%: não foi possível trocar (%) — a função ficou como estava', f, sqlerrm;
    end;
  end loop;
end $m$;


-- ── O movimento ───────────────────────────────────────────────────────────
-- p_corte   o instante da troca (a consulta o tira do carbo_ddl_log da 20261197)
-- p_ensaio  TRUE (padrão) só conta; FALSE move
-- p_limite  conversas por chamada (rode de novo até `restam` = 0)
create or replace function public.carbo_wa_trazer_conversas_antigas(
  p_corte  timestamptz,
  p_ensaio boolean default true,
  p_limite int default 100)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_destino constant text   := '1255756280958635';                         -- CarboZé
  c_origens constant text[] := array['1274076859132981', '1347087218483622']; -- CarboVAPT, SAC
  v_origem  text;
  v_todos   text[];
  v_pares   text[];
  v_info    jsonb;
  v_numeros jsonb := '[]'::jsonb;
  v_cota    int := greatest(1, least(coalesce(p_limite, 100), 1000));
  v_restam  int := 0;
  v_n       int;
  v_wa      text;
  m_pares int := 0; m_msgs int := 0; m_envios int := 0; m_status int := 0;
  m_recados int := 0; m_etiquetas int := 0;
begin
  -- Só pelo SQL Editor / service role: mexe na caixa de todo mundo.
  if auth.uid() is not null then
    raise exception 'só pelo SQL Editor' using errcode = '42501';
  end if;
  if p_corte is null then
    raise exception 'informe o instante da troca (p_corte) — a consulta o tira do carbo_ddl_log';
  end if;
  if p_corte > now() or p_corte < timestamptz '2026-11-01' then
    raise exception 'corte fora do esperado: %', p_corte;
  end if;
  if not exists (select 1 from public.carbo_wa_numeros where phone_number_id = c_destino and ativo) then
    raise exception 'o número do CarboZé (%) não está ativo', c_destino;
  end if;
  if not p_ensaio and (
       position('numero_original' in pg_get_functiondef('public.carbo_recompra_marcar_respostas()'::regprocedure)) = 0
    or position('numero_original' in pg_get_functiondef('public.carbo_carrinho_marcar_respostas()'::regprocedure)) = 0) then
    raise exception 'as réguas ainda não reconhecem numero_original (a 20261200 não conseguiu trocá-las) — mover agora faria a resposta no número antigo deixar de parar a régua';
  end if;

  foreach v_origem in array c_origens loop
    with ativ as (
      select m.wa_id, max(m.ocorrido_em) as ultima
        from public.carbo_wa_mensagens m
       where m.numero_id = v_origem and m.wa_id is not null
       group by m.wa_id
      union all
      select e.wa_id, max(coalesce(e.enviado_em, e.detectado_em))
        from public.carbo_msg_envios e
       where e.numero_id = v_origem and e.wa_id is not null
       group by e.wa_id
    ), par as (
      select a.wa_id, max(a.ultima) as ultima from ativ a group by a.wa_id
    ), cls as (
      select p.wa_id, p.ultima,
             case
               when p.ultima >= p_corte then 'viva_depois_da_troca'
               when coalesce(c.last_inbound_at > now() - interval '24 hours', false) then 'janela_aberta'
               when exists (select 1 from public.carbo_wa_agendadas g
                             where g.numero_id = v_origem and g.wa_id = p.wa_id and g.status = 'pendente')
                 then 'agendada_pendente'
               else 'move'
             end as destino
        from par p
        left join public.carbo_wa_contatos c on c.numero_id = v_origem and c.wa_id = p.wa_id
    )
    select jsonb_build_object(
             'numero', v_origem,
             'rotulo', (select n.rotulo from public.carbo_wa_numeros n where n.phone_number_id = v_origem),
             'conversas', count(*),
             'movem', count(*) filter (where destino = 'move'),
             'ficam_viva_depois_da_troca', count(*) filter (where destino = 'viva_depois_da_troca'),
             'ficam_janela_aberta', count(*) filter (where destino = 'janela_aberta'),
             'ficam_agendada_pendente', count(*) filter (where destino = 'agendada_pendente'),
             'mensagens_que_movem', (select count(*) from public.carbo_wa_mensagens m
                                      where m.numero_id = v_origem
                                        and m.wa_id in (select wa_id from cls where destino = 'move')),
             'avisos_que_movem', (select count(*) from public.carbo_msg_envios e
                                   where e.numero_id = v_origem
                                     and e.wa_id in (select wa_id from cls where destino = 'move'))),
           coalesce(array_agg(wa_id order by ultima nulls first, wa_id) filter (where destino = 'move'), '{}')
      into v_info, v_todos
      from cls;

    v_numeros := v_numeros || jsonb_build_array(v_info);

    -- a cota vale para a chamada inteira (os dois números)
    v_pares   := v_todos[1:greatest(v_cota - m_pares, 0)];
    v_restam  := v_restam + cardinality(v_todos) - coalesce(cardinality(v_pares), 0);

    if p_ensaio or coalesce(cardinality(v_pares), 0) = 0 then
      continue;
    end if;
    m_pares := m_pares + cardinality(v_pares);

    -- 1. Status e dono: decididos ANTES de as mensagens mudarem de caixa (a
    --    regra olha o que o CarboZé já tinha pendente). Só sem linha própria no
    --    CarboZé e sem pergunta do cliente esperando lá.
    update public.carbo_wa_atendimento a
       set numero_id = c_destino
     where a.numero_id = v_origem and a.wa_id = any(v_pares)
       and not exists (select 1 from public.carbo_wa_atendimento b
                        where b.numero_id = c_destino and b.wa_id = a.wa_id)
       and not exists (select 1 from public.carbo_wa_resumo r
                        where r.numero_id = c_destino and r.wa_id = a.wa_id
                          and cardinality(r.pendentes_em) > 0);
    get diagnostics v_n = row_count; m_status := m_status + v_n;

    -- 2. Mensagens e avisos: o número de verdade fica em numero_original.
    update public.carbo_wa_mensagens
       set numero_original = coalesce(numero_original, numero_id), numero_id = c_destino
     where numero_id = v_origem and wa_id = any(v_pares);
    get diagnostics v_n = row_count; m_msgs := m_msgs + v_n;

    update public.carbo_msg_envios
       set numero_original = coalesce(numero_original, numero_id), numero_id = c_destino
     where numero_id = v_origem and wa_id = any(v_pares);
    get diagnostics v_n = row_count; m_envios := m_envios + v_n;

    -- 3. Contato: o CarboZé ganha o NOME, nunca a janela. O do número antigo fica.
    insert into public.carbo_wa_contatos (numero_id, wa_id, nome, last_inbound_at)
    select c_destino, c.wa_id, c.nome, null
      from public.carbo_wa_contatos c
     where c.numero_id = v_origem and c.wa_id = any(v_pares)
    on conflict (numero_id, wa_id) do update
       set nome = coalesce(public.carbo_wa_contatos.nome, excluded.nome);

    -- 4. Recados, histórico de status, reações, agendadas já resolvidas e as
    --    respostas das réguas (o "abrir conversa" do card leva à caixa certa).
    update public.carbo_wa_notas set numero_id = c_destino
     where numero_id = v_origem and wa_id = any(v_pares);
    get diagnostics v_n = row_count; m_recados := m_recados + v_n;

    update public.carbo_wa_atendimento_hist set numero_id = c_destino
     where numero_id = v_origem and wa_id = any(v_pares);

    update public.carbo_wa_reacoes set numero_id = c_destino
     where numero_id = v_origem and wa_id = any(v_pares);

    update public.carbo_wa_agendadas set numero_id = c_destino
     where numero_id = v_origem and wa_id = any(v_pares) and status <> 'pendente';

    update public.carbo_recompra_respostas set numero_id = c_destino
     where numero_id = v_origem and wa_id = any(v_pares);

    update public.carbo_carrinho_respostas set numero_id = c_destino
     where numero_id = v_origem and wa_id = any(v_pares);

    -- 5. Etiquetas: a que o CarboZé já tem não duplica; a cópia que sobra sai.
    update public.carbo_wa_conversa_tag t set numero_id = c_destino
     where t.numero_id = v_origem and t.wa_id = any(v_pares)
       and not exists (select 1 from public.carbo_wa_conversa_tag u
                        where u.numero_id = c_destino and u.wa_id = t.wa_id and u.tag_id = t.tag_id);
    get diagnostics v_n = row_count; m_etiquetas := m_etiquetas + v_n;
    delete from public.carbo_wa_conversa_tag
     where numero_id = v_origem and wa_id = any(v_pares);

    -- 6. A marca antiga de "resolvida" (tabela legada, só histórico): vai se
    --    não houver uma do CarboZé; senão fica onde está (ninguém a lê).
    update public.carbo_wa_resolvidas r set numero_id = c_destino
     where r.numero_id = v_origem and r.wa_id = any(v_pares)
       and not exists (select 1 from public.carbo_wa_resolvidas s
                        where s.numero_id = c_destino and s.wa_id = r.wa_id);

    -- 7. O resumo: a linha do número antigo sai e a do CarboZé é refeita com o
    --    histórico junto (os gatilhos já recalcularam; este é o cinto).
    delete from public.carbo_wa_resumo      where numero_id = v_origem and wa_id = any(v_pares);
    delete from public.carbo_wa_resumo_fila where numero_id = v_origem and wa_id = any(v_pares);
    foreach v_wa in array v_pares loop
      perform public.carbo_wa_resumo_calcular(c_destino, v_wa, null);
    end loop;
  end loop;

  return jsonb_build_object(
    'ensaio', p_ensaio,
    'corte', p_corte,
    'por_numero', v_numeros,
    'movidas_agora', case when p_ensaio then null else jsonb_build_object(
        'conversas', m_pares, 'mensagens', m_msgs, 'avisos', m_envios,
        'status_e_dono', m_status, 'recados', m_recados, 'etiquetas', m_etiquetas) end,
    'restam', case when p_ensaio then null else v_restam end);
end $$;

comment on function public.carbo_wa_trazer_conversas_antigas(timestamptz, boolean, int) is
  'Traz para a caixa do CarboZé as conversas do CarboVAPT e do SAC paradas desde antes da troca de papel (20261197), com janela fechada e sem agendada pendente. ENSAIO por padrão; com p_ensaio = false move até p_limite conversas por chamada (rode até restam = 0). Só pelo SQL Editor. 20261200.';

revoke execute on function public.carbo_wa_trazer_conversas_antigas(timestamptz, boolean, int)
  from anon, public, authenticated;
grant execute on function public.carbo_wa_trazer_conversas_antigas(timestamptz, boolean, int) to service_role;

notify pgrst, 'reload schema';
