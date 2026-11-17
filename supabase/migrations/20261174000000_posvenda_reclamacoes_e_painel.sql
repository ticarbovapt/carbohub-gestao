-- ═══════════════════════════════════════════════════════════════════════════
-- 20261174 — Pós-venda ligado às CONVERSAS + o PAINEL do pós-venda
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pedido do dono do processo em 17/11/2026: se o cliente reclama no WhatsApp,
-- a linha do pedido já aparece sinalizada no Pós-venda; e uma tela de
-- acompanhamento mede o pós-venda (tipos, o que foi resolvido e como).
--
--   carbo_posvenda_reclamacoes(desde, ate)   INTERNA: as mensagens de cliente
--        que o painel do atendimento classifica como RECLAMAÇÃO (grupo
--        `reclamacao` de `carbo_wa_assuntos`, mais `cancelamento`), cada uma
--        ligada ao pedido mais recente do MESMO telefone até aquela data.
--   carbo_posvenda(..., p_pedido)            cada pedido ganha `reclamacao`;
--        `p_pedido` abre UM pedido de qualquer data (o link das Conversas).
--   carbo_posvenda_do_cliente(wa_id)         os pedidos de um telefone, com o
--        caso de cada um — o cartão "Pós-venda" da conversa.
--   carbo_posvenda_painel(de, ate)           a tela /pos-venda/acompanhamento.
--
-- ⚠️ A régua de "reclamação" é a do PAINEL DO ATENDIMENTO (cadastro de
-- assuntos, 20261149): mudou o assunto lá, muda aqui junto. Nenhuma lista de
-- palavras nova.
-- ⚠️ O elo mensagem → pedido é o TELEFONE (`carbo_fone_chave`: DDD + 8 últimos
-- dígitos) e o pedido mais recente até a mensagem. Cliente que escreve de outro
-- número não é ligado — fica em "sem pedido" no painel, e não some.
-- ⚠️ Nada aqui move card, manda mensagem ou mexe na tratativa.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — as reclamações, ligadas ao pedido                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
create or replace function public.carbo_posvenda_reclamacoes(p_desde timestamptz, p_ate timestamptz default null)
returns table (bling_id bigint, wamid text, numero_id text, wa_id text,
               ocorrido_em timestamptz, texto text, assuntos text[])
language sql stable security definer set search_path = public as $$
  with codigos as materialized (
    select array_agg(a.codigo) as cods
      from public.carbo_wa_assuntos a
     where a.ativo and (a.grupo = 'reclamacao' or a.codigo = 'cancelamento')
  ),
  r as materialized (
    select j.wamid, j.numero_id, j.wa_id, j.ocorrido_em, j.texto,
           array(select u from unnest(j.assuntos) u where u = any (c.cods)) as assuntos,
           public.carbo_fone_chave(j.wa_id) as chave
      from public.carbo_wa_assuntos_janela(p_desde, p_ate, null) j
      cross join codigos c
     where j.assuntos && c.cods
  ),
  ped as materialized (
    select e.bling_id, e.data_pedido, public.carbo_fone_chave(e.cliente_fone) as chave
      from public.bling2_esteira e
     where e.cliente_fone is not null
       and not exists (
         select 1 from public.bling_lojas l
          where e.bling_id < 0 and l.bling_id = e.loja_id and l.plataforma_fatura is not null)
  )
  select distinct on (r.wamid)
         p.bling_id, r.wamid, r.numero_id, r.wa_id, r.ocorrido_em, r.texto, r.assuntos
    from r
    left join ped p on r.chave is not null and p.chave = r.chave
                   and p.data_pedido <= (r.ocorrido_em at time zone 'America/Sao_Paulo')::date
   order by r.wamid, p.data_pedido desc nulls last, p.bling_id desc nulls last;
$$;

comment on function public.carbo_posvenda_reclamacoes(timestamptz, timestamptz) is
  'Pós-venda: mensagens de cliente classificadas como reclamação (assuntos do painel do atendimento), ligadas ao pedido mais recente do mesmo telefone. bling_id nulo = sem pedido. INTERNA (sem execute para a API). Ver 20261174.';

-- INTERNA: devolve texto de mensagem e telefone sem perguntar quem chama.
revoke execute on function public.carbo_posvenda_reclamacoes(timestamptz, timestamptz) from public, anon, authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a lista ganha a reclamação e o pedido avulso                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Parâmetro novo = assinatura nova: a de quatro sai no MESMO arquivo.
drop function if exists public.carbo_posvenda(date, date, date, boolean);

create or replace function public.carbo_posvenda(
  p_de       date    default null,
  p_ate      date    default null,
  p_corte    date    default date '2026-11-06',
  p_so_casos boolean default false,
  p_pedido   bigint  default null
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_lim      jsonb;
  v_itens    jsonb;
  v_semanas  jsonb;
  v_antes    int;
  v_novos    int;
  v_casos    jsonb;
  v_primeiro date;
  v_desde    date;
begin
  if not coalesce((select public.carbo_e_time_interno()), false) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if not p_so_casos and p_pedido is null then
    if p_de is null or p_ate is null or p_ate < p_de then
      raise exception 'Período inválido' using errcode = '22023';
    end if;
    if p_ate - p_de > 400 then
      raise exception 'Período longo demais (máximo 400 dias)' using errcode = '22023';
    end if;
  end if;

  select coalesce(jsonb_object_agg(etapa, dias), '{}'::jsonb) into v_lim
    from public.carbo_esteira_limite where ativo;

  -- Desde quando ler as reclamações: o pedido mais antigo do que vai na lista.
  v_desde := case
    when p_pedido is not null then (select e.data_pedido from public.bling2_esteira e where e.bling_id = p_pedido)
    when p_so_casos then (select min(e.data_pedido) from public.bling2_esteira e
                           join public.carbo_posvenda_casos k on k.bling_id = e.bling_id and k.status = 'aberto')
    else p_de
  end;

  with lim as (
    select coalesce((v_lim ->> 'confirmado')::int, 2)   as confirmado,
           coalesce((v_lim ->> 'nf_emitida')::int, 3)   as nf_emitida,
           coalesce((v_lim ->> 'etiqueta')::int, 3)     as etiqueta,
           coalesce((v_lim ->> 'em_transito')::int, 15) as em_transito
  ),
  abertos_caso as materialized (
    select k.bling_id from public.carbo_posvenda_casos k where k.status = 'aberto'
  ),
  alvo as (
    select bling_id from public.bling2_esteira
     where not p_so_casos and p_pedido is null and data_pedido between p_de and p_ate
    union
    select p_pedido where p_pedido is not null
    union
    select bling_id from public.bling2_esteira
     where etapa in ('confirmado', 'nf_emitida', 'etiqueta', 'em_transito')
    union
    select bling_id from abertos_caso
  ),
  base as materialized (
    select e.*, r.status as r_status, r.status_descricao as r_descricao,
           r.previsao_entrega, r.postado_em as r_postado_em, r.entregue_em as r_entregue_em,
           r.ultimo_evento_em, r.url_rastreio
      from alvo a
      join public.bling2_esteira e on e.bling_id = a.bling_id
      left join lateral (
        select x.* from public.rastreio_envios x
         where x.codigo in (e.rastreio, e.rastreio_transportadora)
         order by (x.codigo = e.rastreio) desc nulls last
         limit 1
      ) r on true
     where not exists (
       select 1 from public.bling_lojas l
        where e.bling_id < 0 and l.bling_id = e.loja_id and l.plataforma_fatura is not null)
  ),
  julgado as materialized (
    select b.*,
      case
        when b.etapa not in ('confirmado', 'nf_emitida', 'etiqueta', 'em_transito') then null
        when b.r_status in ('problema', 'devolvido') then 'transportadora'
        when b.etapa <> 'em_transito' and b.me_situacao = 'vencido'
             and b.me_tem_ativo is not true then 'vencida'
        when b.etapa <> 'em_transito' and b.me_situacao = 'cancelado'
             and b.me_tem_ativo is not true then 'cancelada'
        when b.etapa = 'etiqueta'
             and coalesce(b.me_gerado_em, b.nf_data::timestamptz, b.data_pedido::timestamptz)
                 < now() - make_interval(days => l.etiqueta) then 'nao_postado'
        when b.etapa = 'em_transito'
             and coalesce(b.previsao_entrega + 2,
                          coalesce(b.r_postado_em::date, b.data_pedido) + l.em_transito)
                 < current_date then 'atrasado'
        when b.etapa = 'nf_emitida'
             and coalesce(b.nf_data::timestamptz, b.data_pedido::timestamptz)
                 < now() - make_interval(days => l.nf_emitida) then 'sem_etiqueta'
        when b.etapa = 'confirmado'
             and b.data_pedido < current_date - l.confirmado then 'sem_nf'
      end as problema,
      case
        when b.r_status in ('problema', 'devolvido') then b.ultimo_evento_em
        when b.me_situacao = 'vencido' then b.me_expirado_em
        when b.etapa = 'etiqueta' then coalesce(b.me_gerado_em, b.nf_data::timestamptz, b.data_pedido::timestamptz)
        when b.etapa = 'em_transito' then coalesce(b.previsao_entrega::timestamptz, b.r_postado_em, b.data_pedido::timestamptz)
        when b.etapa = 'nf_emitida' then coalesce(b.nf_data::timestamptz, b.data_pedido::timestamptz)
        else b.data_pedido::timestamptz
      end as desde,
      (b.data_pedido - extract(dow from b.data_pedido)::int) as semana
      from base b cross join lim l
  ),
  com_trato as materialized (
    select j.*, t.situacao as t_situacao, t.observacao as t_observacao,
           t.atualizado_em as t_em, nullif(btrim(pr.full_name), '') as t_por,
           t.bling_id is not null as tem_trato,
           coalesce(t.situacao in ('reembolsado', 'resolvido', 'sem_solucao'), false) as trato_final,
           k.caso, k.casos_n
      from julgado j
      left join public.carbo_entrega_trato t on t.bling_id = j.bling_id
      left join public.profiles pr on pr.id = t.atualizado_por
      -- O caso que a lista mostra: o aberto; sem aberto, o mais recente.
      left join lateral (
        select (select jsonb_build_object(
                  'id', c.id, 'tipo', c.tipo, 'passo', c.passo, 'status', c.status,
                  'desfecho', c.desfecho, 'valor', c.valor,
                  'aberto_em', c.aberto_em, 'atualizado_em', c.atualizado_em,
                  'encerrado_em', c.encerrado_em)
                  from public.carbo_posvenda_casos c
                 where c.bling_id = j.bling_id
                 order by (c.status = 'aberto') desc, c.aberto_em desc
                 limit 1) as caso,
               (select count(*) from public.carbo_posvenda_casos c where c.bling_id = j.bling_id) as casos_n
      ) k on true
  ),
  -- O que o cliente RECLAMOU no WhatsApp (assuntos do painel do atendimento),
  -- ligado ao pedido pelo telefone (`carbo_posvenda_reclamacoes`).
  rec_msg as materialized (
    select x.* from public.carbo_posvenda_reclamacoes(
             coalesce(v_desde, current_date)::timestamp at time zone 'America/Sao_Paulo', null) x
     where x.bling_id in (select bling_id from base)
  ),
  rec as materialized (
    select m.bling_id, count(*) as n, min(m.ocorrido_em) as primeira_em, max(m.ocorrido_em) as ultima_em,
           (array_agg(m.texto     order by m.ocorrido_em desc))[1] as trecho,
           (array_agg(m.wa_id     order by m.ocorrido_em desc))[1] as wa_id,
           (array_agg(m.numero_id order by m.ocorrido_em desc))[1] as numero_id,
           (select coalesce(jsonb_agg(jsonb_build_object('codigo', a.codigo, 'rotulo', a.rotulo) order by a.ordem), '[]'::jsonb)
              from public.carbo_wa_assuntos a
             where a.codigo in (select u from rec_msg m2 cross join lateral unnest(m2.assuntos) u
                                 where m2.bling_id = m.bling_id)) as assuntos
      from rec_msg m group by m.bling_id
  )
  select
    (select coalesce(jsonb_agg(jsonb_build_object(
              'bling_id',        c.bling_id,
              'pedido_numero',   c.pedido_numero,
              'pedido_loja',     c.pedido_loja,
              'pedido_codigo',   c.pedido_codigo,
              'canal',           c.canal,
              'data_pedido',     c.data_pedido,
              'total',           c.total,
              'cliente',         c.cliente,
              'cliente_fone',    c.cliente_fone,
              'cidade',          c.entrega_cidade,
              'uf',              c.entrega_uf,
              'etapa',           c.etapa,
              'problema',        c.problema,
              'desde',           c.desde,
              'previsao',        c.previsao_entrega,
              'entregue_em',     c.r_entregue_em,
              'rastreio_status', c.r_descricao,
              'transportadora',  c.transportadora,
              'rastreio',        coalesce(c.rastreio_transportadora, c.rastreio),
              'url_rastreio',    c.url_rastreio,
              'nf_numero',       c.nf_numero,
              'antes_do_corte',  c.data_pedido < p_corte,
              'trato', case when not c.tem_trato then null else jsonb_build_object(
                         'situacao', c.t_situacao, 'observacao', c.t_observacao,
                         'em', c.t_em, 'por', c.t_por) end,
              'caso',            c.caso,
              'casos_n',         c.casos_n,
              'reclamacao', case when r.bling_id is null then null else jsonb_build_object(
                         'n', r.n, 'primeira_em', r.primeira_em, 'ultima_em', r.ultima_em,
                         'assuntos', r.assuntos, 'trecho', left(r.trecho, 280),
                         'wa_id', r.wa_id, 'numero_id', r.numero_id,
                         -- Pendente: ninguém está tratando a reclamação — sem caso
                         -- aberto, e o último caso (se houve) fechou ANTES dela ou
                         -- foi aberto por engano.
                         'pendente', coalesce(c.caso ->> 'status', '') <> 'aberto'
                           and (c.caso is null or c.caso ->> 'desfecho' = 'cancelado'
                                or (c.caso ->> 'encerrado_em')::timestamptz < r.ultima_em)) end
            ) order by c.data_pedido, c.bling_id), '[]'::jsonb)
       from com_trato c
       left join rec r on r.bling_id = c.bling_id
      where case when p_pedido is not null then c.bling_id = p_pedido
                 when p_so_casos then c.bling_id in (select bling_id from abertos_caso)
                 else c.data_pedido between p_de and p_ate end),
    (select coalesce(jsonb_agg(jsonb_build_object('semana', s.semana, 'antes', s.antes, 'n', s.n)
                               order by s.semana, s.antes), '[]'::jsonb)
       from (select c.semana, c.data_pedido < p_corte as antes, count(*) as n
               from com_trato c
              where c.problema is not null and not c.trato_final
              group by 1, 2) s),
    (select count(*) from com_trato c
      where c.problema is not null and not c.trato_final and c.data_pedido < p_corte),
    (select count(*) from com_trato c
      where c.problema is not null and not c.trato_final and c.data_pedido >= p_corte),
    (select jsonb_build_object(
              'antes', count(*) filter (where c.data_pedido < p_corte),
              'novos', count(*) filter (where c.data_pedido >= p_corte))
       from com_trato c where c.bling_id in (select bling_id from abertos_caso))
    into v_itens, v_semanas, v_antes, v_novos, v_casos;

  select min(e.data_pedido) into v_primeiro
    from public.bling2_esteira e
   where not exists (
     select 1 from public.bling_lojas l
      where e.bling_id < 0 and l.bling_id = e.loja_id and l.plataforma_fatura is not null);

  return jsonb_build_object(
    'gerado_em',     now(),
    'corte',         p_corte,
    'de',            p_de,
    'ate',           p_ate,
    'primeiro',      v_primeiro,
    'abertos',       jsonb_build_object('antes', v_antes, 'novos', v_novos),
    'casos_abertos', v_casos,
    'semanas',       v_semanas,
    'itens',         v_itens);
end $$;

comment on function public.carbo_posvenda(date, date, date, boolean, bigint) is
  'Pós-venda (Atendimento /pos-venda): todo pedido do período menos o ML Full, com o problema, a tratativa, o caso e a reclamação do WhatsApp. p_so_casos = casos abertos de qualquer data; p_pedido = um pedido só. Ver 20261172/73/74.';

revoke execute on function public.carbo_posvenda(date, date, date, boolean, bigint) from public, anon;
grant execute on function public.carbo_posvenda(date, date, date, boolean, bigint) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — os pedidos de um cliente (o cartão da conversa)             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
create or replace function public.carbo_posvenda_do_cliente(p_wa_id text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_chave text := public.carbo_fone_chave(p_wa_id);
  v jsonb;
begin
  if not coalesce((select public.carbo_e_time_interno()), false) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if v_chave is null then
    return '[]'::jsonb;
  end if;
  -- Janela DECLARADA: os 10 pedidos mais recentes do telefone.
  select coalesce(jsonb_agg(x.j order by x.data_pedido desc, x.bling_id desc), '[]'::jsonb) into v
    from (
      select e.bling_id, e.data_pedido, jsonb_build_object(
               'bling_id', e.bling_id, 'pedido_codigo', e.pedido_codigo, 'pedido_numero', e.pedido_numero,
               'canal', e.canal, 'data_pedido', e.data_pedido, 'total', e.total, 'etapa', e.etapa,
               'caso', (select jsonb_build_object('id', k.id, 'tipo', k.tipo, 'passo', k.passo,
                                                  'status', k.status, 'desfecho', k.desfecho, 'aberto_em', k.aberto_em)
                          from public.carbo_posvenda_casos k where k.bling_id = e.bling_id
                         order by (k.status = 'aberto') desc, k.aberto_em desc limit 1)) as j
        from public.bling2_esteira e
       where e.cliente_fone is not null
         and public.carbo_fone_chave(e.cliente_fone) = v_chave
         and not exists (
           select 1 from public.bling_lojas l
            where e.bling_id < 0 and l.bling_id = e.loja_id and l.plataforma_fatura is not null)
       order by e.data_pedido desc, e.bling_id desc
       limit 10
    ) x;
  return v;
end $$;

revoke execute on function public.carbo_posvenda_do_cliente(text) from public, anon;
grant execute on function public.carbo_posvenda_do_cliente(text) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — o painel do pós-venda                                       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Os tipos com prazo de 30 dias (art. 18, § 1º) são ESPELHO de `prazoDias`
-- em `apps/atendimento/src/lib/posvendaCasos.ts`. Mudou lá, mude aqui.
-- ⚠️ 'cancelado' (aberto por engano) não conta em nada: não é caso.
-- ⚠️ O tipo de um caso é o ATUAL (quem mudou de arrependimento para defeito
-- conta como defeito).
create or replace function public.carbo_posvenda_painel(
  p_de    date,
  p_ate   date,
  p_corte date default date '2026-11-06'
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_ini   timestamptz;
  v_fim   timestamptz;
  v_vicio text[] := array['faltante', 'avaria', 'defeito', 'errado'];
  v_agora jsonb;
  v_per   jsonb;
  v_rec   jsonb;
begin
  if not coalesce((select public.carbo_e_time_interno()), false) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de then
    raise exception 'Período inválido' using errcode = '22023';
  end if;
  if p_ate - p_de > 400 then
    raise exception 'Período longo demais (máximo 400 dias)' using errcode = '22023';
  end if;
  v_ini := p_de::timestamp at time zone 'America/Sao_Paulo';
  v_fim := (p_ate + 1)::timestamp at time zone 'America/Sao_Paulo';

  -- ── Agora (não depende do período) ──
  select jsonb_build_object(
           'abertos',     count(*),
           'vencidos',    count(*) filter (where k.tipo = any (v_vicio) and k.aberto_em < now() - interval '30 days'),
           'mais_antigo', min(k.aberto_em),
           'por_tipo',    coalesce((select jsonb_agg(jsonb_build_object('tipo', t.tipo, 'n', t.n) order by t.n desc, t.tipo)
                                      from (select tipo, count(*) as n from public.carbo_posvenda_casos
                                             where status = 'aberto' group by tipo) t), '[]'::jsonb))
    into v_agora
    from public.carbo_posvenda_casos k
   where k.status = 'aberto';

  -- ── O período ──
  with ab as (
    select * from public.carbo_posvenda_casos
     where aberto_em >= v_ini and aberto_em < v_fim and coalesce(desfecho, '') <> 'cancelado'
  ),
  en as (
    select *, extract(epoch from encerrado_em - aberto_em) / 3600.0 as horas
      from public.carbo_posvenda_casos
     where status = 'encerrado' and desfecho <> 'cancelado'
       and encerrado_em >= v_ini and encerrado_em < v_fim
  ),
  tipos as (select tipo from ab union select tipo from en),
  semanas as (
    select distinct (d::date - extract(dow from d)::int) as s
      from generate_series(p_de::timestamp, p_ate::timestamp, interval '1 day') d
  ),
  pessoas as (
    select h.por,
           count(*) filter (where h.acao = 'abriu') as abriu,
           count(*) filter (where h.acao in ('respondeu', 'mudou_tipo')) as passos,
           count(*) filter (where (h.acao = 'respondeu' and h.desfecho is not null)
                               or (h.acao = 'encerrou' and h.desfecho <> 'cancelado')) as encerrou
      from public.carbo_posvenda_caso_hist h
     where h.em >= v_ini and h.em < v_fim and h.por is not null
     group by h.por
  )
  select jsonb_build_object(
    'abertos',       (select count(*) from ab),
    'encerrados',    (select count(*) from en),
    'reembolsado',   (select coalesce(sum(valor), 0) from en where desfecho in ('reembolso_integral', 'reembolso_parcial')),
    'horas_mediana', (select percentile_cont(0.5) within group (order by horas) from en),
    'horas_p90',     (select percentile_cont(0.9) within group (order by horas) from en),
    'no_prazo',      (select count(*) from en where tipo = any (v_vicio) and encerrado_em <= aberto_em + interval '30 days'),
    'base_prazo',    (select count(*) from en where tipo = any (v_vicio)),
    'por_tipo', coalesce((select jsonb_agg(jsonb_build_object(
          'tipo', t.tipo,
          'abertos',       (select count(*) from ab where ab.tipo = t.tipo),
          'encerrados',    (select count(*) from en where en.tipo = t.tipo),
          'reembolsado',   (select coalesce(sum(valor), 0) from en where en.tipo = t.tipo
                              and desfecho in ('reembolso_integral', 'reembolso_parcial')),
          'horas_mediana', (select percentile_cont(0.5) within group (order by horas) from en where en.tipo = t.tipo),
          'desfechos', coalesce((select jsonb_agg(jsonb_build_object('desfecho', d.desfecho, 'n', d.n) order by d.n desc)
                                   from (select desfecho, count(*) as n from en where en.tipo = t.tipo group by desfecho) d), '[]'::jsonb)
        ) order by t.tipo) from tipos t), '[]'::jsonb),
    'desfechos', coalesce((select jsonb_agg(jsonb_build_object('desfecho', d.desfecho, 'n', d.n, 'valor', d.valor) order by d.n desc)
                             from (select desfecho, count(*) as n, coalesce(sum(valor), 0) as valor
                                     from en group by desfecho) d), '[]'::jsonb),
    'semanas', coalesce((select jsonb_agg(jsonb_build_object(
          'semana', w.s,
          'abertos',    (select count(*) from ab where (ab.aberto_em at time zone 'America/Sao_Paulo')::date between w.s and w.s + 6),
          'encerrados', (select count(*) from en where (en.encerrado_em at time zone 'America/Sao_Paulo')::date between w.s and w.s + 6)
        ) order by w.s) from semanas w), '[]'::jsonb),
    'pessoas', coalesce((select jsonb_agg(jsonb_build_object(
          'nome', coalesce(nullif(btrim(pr.full_name), ''), 'Sem nome'),
          'abriu', p.abriu, 'passos', p.passos, 'encerrou', p.encerrou) order by p.passos desc)
        from pessoas p left join public.profiles pr on pr.id = p.por), '[]'::jsonb)
  ) into v_per;

  -- ── As reclamações do WhatsApp no período ──
  with r as materialized (
    select * from public.carbo_posvenda_reclamacoes(v_ini, v_fim)
  ),
  ru as (select r.*, u as assunto from r cross join lateral unnest(r.assuntos) u),
  -- Um pedido reclamado está "com caso" se há caso aberto nele, ou um caso
  -- aberto desde a 1ª reclamação do período (3 dias de folga: o caso pode ter
  -- nascido do problema da esteira, antes de o cliente escrever).
  ped as (
    select r.bling_id, min(r.ocorrido_em) as primeira_em, max(r.ocorrido_em) as ultima_em, count(*) as n,
           exists (select 1 from public.carbo_posvenda_casos k
                    where k.bling_id = r.bling_id and coalesce(k.desfecho, '') <> 'cancelado'
                      and (k.status = 'aberto' or k.aberto_em >= min(r.ocorrido_em) - interval '3 days')) as com_caso
      from r where r.bling_id is not null group by r.bling_id
  )
  select jsonb_build_object(
    'mensagens',  (select count(*) from r),
    'clientes',   (select count(distinct wa_id) from r),
    'pedidos',    (select count(*) from ped),
    'com_caso',   (select count(*) from ped where com_caso),
    'sem_pedido', (select count(distinct wa_id) from r where bling_id is null),
    'ameacas',    (select count(distinct wa_id) from ru where assunto = 'ameaca'),
    'por_assunto', coalesce((select jsonb_agg(jsonb_build_object(
          'codigo', a.codigo, 'rotulo', a.rotulo,
          'clientes', x.clientes, 'pedidos', x.pedidos, 'com_caso', x.com_caso) order by x.clientes desc, a.ordem)
        from (select ru.assunto,
                     count(distinct ru.wa_id) as clientes,
                     count(distinct ru.bling_id) as pedidos,
                     count(distinct ru.bling_id) filter (where p.com_caso) as com_caso
                from ru left join ped p on p.bling_id = ru.bling_id
               group by ru.assunto) x
        join public.carbo_wa_assuntos a on a.codigo = x.assunto), '[]'::jsonb),
    'sem_caso', coalesce((select jsonb_agg(jsonb_build_object(
          'bling_id', p.bling_id, 'pedido_codigo', e.pedido_codigo, 'pedido_numero', e.pedido_numero,
          'cliente', e.cliente, 'canal', e.canal, 'data_pedido', e.data_pedido,
          'antes_do_corte', e.data_pedido < p_corte, 'n', p.n, 'ultima_em', p.ultima_em,
          'assuntos', (select coalesce(jsonb_agg(distinct a.rotulo), '[]'::jsonb)
                         from ru join public.carbo_wa_assuntos a on a.codigo = ru.assunto
                        where ru.bling_id = p.bling_id)) order by p.ultima_em desc)
        from (select * from ped where not com_caso order by ultima_em desc limit 100) p
        join public.bling2_esteira e on e.bling_id = p.bling_id), '[]'::jsonb),
    'sem_caso_total', (select count(*) from ped where not com_caso)
  ) into v_rec;

  return jsonb_build_object(
    'gerado_em', now(), 'de', p_de, 'ate', p_ate,
    'agora', v_agora, 'periodo', v_per, 'reclamacoes', v_rec);
end $$;

comment on function public.carbo_posvenda_painel(date, date, date) is
  'Painel do pós-venda (Atendimento /pos-venda/acompanhamento): casos agora e no período (tipos, desfechos, reembolso, tempo, prazo, pessoas) e as reclamações do WhatsApp (assuntos do painel do atendimento) com e sem caso. Ver 20261174.';

revoke execute on function public.carbo_posvenda_painel(date, date, date) from public, anon;
grant execute on function public.carbo_posvenda_painel(date, date, date) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ Conferência que ABORTA                                                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.carbo_posvenda(date, date, date, boolean, bigint)',
    'public.carbo_posvenda_do_cliente(text)',
    'public.carbo_posvenda_painel(date, date, date)'
  ] loop
    if to_regprocedure(f) is null then
      raise exception 'ABORTADO: % não foi criada', f;
    end if;
    if has_function_privilege('anon', f, 'execute') then
      raise exception 'ABORTADO: anon executa %', f;
    end if;
  end loop;
  if has_function_privilege('authenticated', 'public.carbo_posvenda_reclamacoes(timestamptz, timestamptz)', 'execute') then
    raise exception 'ABORTADO: a API executa carbo_posvenda_reclamacoes';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'carbo_posvenda') <> 1 then
    raise exception 'ABORTADO: carbo_posvenda ficou com mais de uma assinatura';
  end if;
end $$;
