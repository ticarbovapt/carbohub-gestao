-- ═══════════════════════════════════════════════════════════════════════════
-- 20261173 — Pós-venda: CASOS com tipo e roteiro (Atendimento, `/pos-venda`)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pedido do dono do processo em 17/11/2026: todo problema de pós-venda tem um
-- TIPO (faltante, avaria, defeito, produto errado, arrependimento, entregue e
-- não recebido, atraso, devolvido ao remetente, outro) e cada tipo segue um
-- passo a passo pelo Código de Defesa do Consumidor até o desfecho.
--
-- A ÁRVORE mora no CÓDIGO (`apps/atendimento/src/lib/posvendaCasos.ts`,
-- testada em `src/test/posvenda/casos.test.ts`). O banco guarda o caso, o
-- passo em que ele está e o HISTÓRICO de cada resposta — não decide o caminho.
--
--   carbo_posvenda_casos        um caso por problema; UM aberto por pedido
--   carbo_posvenda_caso_hist    append-only: abriu, respondeu, mudou de tipo,
--                               voltou, anotou, encerrou (quem e quando)
--   carbo_posvenda_caso_*()     as únicas portas de escrita (SECURITY DEFINER)
--   carbo_posvenda(...)         a lista ganha o caso de cada pedido e o modo
--                               "casos em aberto" (de qualquer data)
--
-- ⚠️ A tratativa antiga (`carbo_entrega_trato`) CONTINUA sendo o que a Esteira
-- lê para tirar o pedido tratado do quadro ("Tratados"). O caso a mantém
-- (`trg_posvenda_caso_trato`): aberto ⇒ 'em_contato'; encerrado ⇒ o de-para do
-- desfecho. A observação escrita à mão NÃO é tocada.
-- ⚠️ Desfecho novo: CHECK abaixo + de-para em `carbo_posvenda_caso_trato` +
-- `DESFECHOS` no código, na mesma tarefa (o teste confere código × CHECK).
-- ⚠️ Nada aqui move card da esteira nem mexe na `carbo_msg_fila`.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — as tabelas                                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
create table if not exists public.carbo_posvenda_casos (
  id             uuid primary key default gen_random_uuid(),
  bling_id       bigint not null,                -- o MESMO da esteira (Bling 1 negativo)
  tipo           text not null check (tipo ~ '^[a-z_]{2,40}$'),
  passo          text not null check (passo ~ '^[a-z0-9_]{1,60}$'),
  status         text not null default 'aberto' check (status in ('aberto', 'encerrado')),
  desfecho       text check (desfecho is null or desfecho in (
                   'troca', 'reenvio', 'reembolso_integral', 'reembolso_parcial',
                   'resolvido', 'recusado', 'sem_retorno', 'sem_solucao', 'cancelado')),
  valor          numeric(12,2) check (valor is null or valor >= 0),
  aberto_por     uuid,
  aberto_em      timestamptz not null default now(),
  atualizado_por uuid,
  atualizado_em  timestamptz not null default now(),
  encerrado_em   timestamptz,
  constraint carbo_posvenda_casos_desfecho_coerente
    check ((status = 'encerrado') = (desfecho is not null))
);

comment on table public.carbo_posvenda_casos is
  'Pós-venda: um caso por problema do cliente, com tipo e o passo do roteiro (o roteiro mora no código do Atendimento). Escrita só pelas funções carbo_posvenda_caso_*. Ver 20261173.';

-- UM caso aberto por pedido: dois roteiros correndo juntos dariam duas
-- tratativas brigando pelo mesmo pedido.
create unique index if not exists carbo_posvenda_casos_um_aberto
  on public.carbo_posvenda_casos (bling_id) where status = 'aberto';
create index if not exists carbo_posvenda_casos_pedido
  on public.carbo_posvenda_casos (bling_id, aberto_em desc);

create table if not exists public.carbo_posvenda_caso_hist (
  id         bigint generated always as identity primary key,
  caso_id    uuid not null references public.carbo_posvenda_casos (id) on delete cascade,
  acao       text not null check (acao in ('abriu', 'respondeu', 'mudou_tipo', 'voltou', 'nota', 'encerrou')),
  tipo       text,
  passo      text,
  opcao      text,
  proximo    text,
  desfecho   text,
  valor      numeric(12,2),
  nota       text check (nota is null or length(nota) <= 4000),
  campos     jsonb,
  desfaz     bigint,              -- 'voltou': a linha que ele desfez
  por        uuid,
  em         timestamptz not null default now()
);
create index if not exists carbo_posvenda_caso_hist_caso
  on public.carbo_posvenda_caso_hist (caso_id, id desc);

alter table public.carbo_posvenda_casos     enable row level security;
alter table public.carbo_posvenda_caso_hist enable row level security;

-- Leitura do time interno; NENHUMA policy de escrita — quem escreve são as
-- funções abaixo (o histórico não pode ser forjado nem apagado pela API).
drop policy if exists carbo_posvenda_casos_ler on public.carbo_posvenda_casos;
create policy carbo_posvenda_casos_ler on public.carbo_posvenda_casos
  for select to authenticated using ((select public.carbo_e_time_interno()));
drop policy if exists carbo_posvenda_caso_hist_ler on public.carbo_posvenda_caso_hist;
create policy carbo_posvenda_caso_hist_ler on public.carbo_posvenda_caso_hist
  for select to authenticated using ((select public.carbo_e_time_interno()));

grant select on public.carbo_posvenda_casos     to authenticated;
grant select on public.carbo_posvenda_caso_hist to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — o caso mantém a tratativa que a Esteira lê                  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
create or replace function public.carbo_posvenda_caso_trato()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_situacao text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status
     and new.desfecho is not distinct from old.desfecho then
    return new;
  end if;
  v_situacao := case
    when new.status = 'aberto' then 'em_contato'
    when new.desfecho in ('reembolso_integral', 'reembolso_parcial') then 'reembolsado'
    when new.desfecho in ('troca', 'reenvio', 'resolvido') then 'resolvido'
    when new.desfecho in ('recusado', 'sem_retorno', 'sem_solucao') then 'sem_solucao'
    else 'aberto'                                   -- 'cancelado': aberto por engano
  end;
  begin
    insert into public.carbo_entrega_trato (bling_id, situacao)
    values (new.bling_id, v_situacao)
    on conflict (bling_id) do update set situacao = excluded.situacao
      where public.carbo_entrega_trato.situacao is distinct from excluded.situacao;
  exception when others then
    -- A tratativa que falha não derruba o caso.
    raise warning 'carbo_posvenda_caso_trato: %', sqlerrm;
  end;
  return new;
end $$;
revoke execute on function public.carbo_posvenda_caso_trato() from public, anon;

drop trigger if exists trg_posvenda_caso_trato on public.carbo_posvenda_casos;
create trigger trg_posvenda_caso_trato
  after insert or update on public.carbo_posvenda_casos
  for each row execute function public.carbo_posvenda_caso_trato();


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — as portas de escrita                                        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Toda resposta diz EM QUE PASSO estava (`p_passo`): se outra pessoa já
-- respondeu, a função recusa em vez de pular o passo dela.

create or replace function public.carbo_posvenda_caso_abrir(p_bling_id bigint, p_tipo text, p_passo text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not coalesce((select public.carbo_e_time_interno()), false) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if not exists (select 1 from public.bling2_esteira e where e.bling_id = p_bling_id) then
    raise exception 'Pedido não encontrado' using errcode = 'P0002';
  end if;
  begin
    insert into public.carbo_posvenda_casos (bling_id, tipo, passo, aberto_por, atualizado_por)
    values (p_bling_id, p_tipo, p_passo, auth.uid(), auth.uid())
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Este pedido já tem um caso aberto' using errcode = '23505';
  end;
  insert into public.carbo_posvenda_caso_hist (caso_id, acao, tipo, passo, por)
  values (v_id, 'abriu', p_tipo, p_passo, auth.uid());
  return v_id;
end $$;

create or replace function public.carbo_posvenda_caso_responder(
  p_caso     uuid,
  p_passo    text,
  p_opcao    text,
  p_proximo  text    default null,
  p_desfecho text    default null,
  p_tipo     text    default null,
  p_nota     text    default null,
  p_campos   jsonb   default null,
  p_valor    numeric default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.carbo_posvenda_casos;
begin
  if not coalesce((select public.carbo_e_time_interno()), false) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if (p_proximo is null) = (p_desfecho is null) then
    raise exception 'Informe o próximo passo OU o desfecho' using errcode = '22023';
  end if;
  if p_tipo is not null and p_proximo is null then
    raise exception 'Trocar o tipo exige o primeiro passo do novo roteiro' using errcode = '22023';
  end if;

  select * into c from public.carbo_posvenda_casos where id = p_caso for update;
  if not found then
    raise exception 'Caso não encontrado' using errcode = 'P0002';
  end if;
  if c.status <> 'aberto' then
    raise exception 'Este caso já foi encerrado' using errcode = '55000';
  end if;
  if c.passo <> p_passo then
    raise exception 'Outra pessoa já respondeu este passo. Atualize a tela.' using errcode = '40001';
  end if;

  insert into public.carbo_posvenda_caso_hist
    (caso_id, acao, tipo, passo, opcao, proximo, desfecho, valor, nota, campos, por)
  values (c.id, case when p_tipo is not null then 'mudou_tipo' else 'respondeu' end,
          c.tipo, c.passo, p_opcao, p_proximo, p_desfecho, p_valor,
          nullif(btrim(p_nota), ''), nullif(p_campos, '{}'::jsonb), auth.uid());

  update public.carbo_posvenda_casos set
    tipo           = coalesce(p_tipo, tipo),
    passo          = coalesce(p_proximo, passo),
    status         = case when p_desfecho is not null then 'encerrado' else 'aberto' end,
    desfecho       = p_desfecho,
    valor          = coalesce(p_valor, valor),
    encerrado_em   = case when p_desfecho is not null then now() end,
    atualizado_por = auth.uid(),
    atualizado_em  = now()
  where id = c.id;
end $$;

-- Encerrar fora do roteiro: o cliente sumiu, ou o caso foi aberto por engano.
create or replace function public.carbo_posvenda_caso_encerrar(p_caso uuid, p_desfecho text, p_nota text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.carbo_posvenda_casos;
begin
  if not coalesce((select public.carbo_e_time_interno()), false) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p_desfecho not in ('sem_retorno', 'cancelado', 'sem_solucao') then
    raise exception 'Desfecho inválido para encerrar fora do roteiro' using errcode = '22023';
  end if;
  select * into c from public.carbo_posvenda_casos where id = p_caso for update;
  if not found then
    raise exception 'Caso não encontrado' using errcode = 'P0002';
  end if;
  if c.status <> 'aberto' then
    raise exception 'Este caso já foi encerrado' using errcode = '55000';
  end if;
  insert into public.carbo_posvenda_caso_hist (caso_id, acao, tipo, passo, desfecho, nota, por)
  values (c.id, 'encerrou', c.tipo, c.passo, p_desfecho, nullif(btrim(p_nota), ''), auth.uid());
  update public.carbo_posvenda_casos set
    status = 'encerrado', desfecho = p_desfecho, encerrado_em = now(),
    atualizado_por = auth.uid(), atualizado_em = now()
  where id = c.id;
end $$;

-- Voltar um passo: desfaz a ÚLTIMA resposta ainda não desfeita (também reabre
-- caso encerrado). O histórico não se apaga: a linha 'voltou' aponta a desfeita.
create or replace function public.carbo_posvenda_caso_voltar(p_caso uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.carbo_posvenda_casos;
  h public.carbo_posvenda_caso_hist;
begin
  if not coalesce((select public.carbo_e_time_interno()), false) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  select * into c from public.carbo_posvenda_casos where id = p_caso for update;
  if not found then
    raise exception 'Caso não encontrado' using errcode = 'P0002';
  end if;
  select * into h from public.carbo_posvenda_caso_hist x
   where x.caso_id = c.id and x.acao in ('respondeu', 'mudou_tipo', 'encerrou')
     and not exists (select 1 from public.carbo_posvenda_caso_hist v
                      where v.caso_id = c.id and v.acao = 'voltou' and v.desfaz = x.id)
   order by x.id desc limit 1;
  if not found then
    raise exception 'Não há passo para voltar' using errcode = '55000';
  end if;
  begin
    update public.carbo_posvenda_casos set
      tipo = h.tipo, passo = h.passo, status = 'aberto', desfecho = null,
      valor = case when h.valor is not null then null else valor end,
      encerrado_em = null, atualizado_por = auth.uid(), atualizado_em = now()
    where id = c.id;
  exception when unique_violation then
    raise exception 'Este pedido já tem outro caso aberto' using errcode = '23505';
  end;
  insert into public.carbo_posvenda_caso_hist (caso_id, acao, tipo, passo, desfaz, por)
  values (c.id, 'voltou', h.tipo, h.passo, h.id, auth.uid());
end $$;

create or replace function public.carbo_posvenda_caso_anotar(p_caso uuid, p_nota text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.carbo_posvenda_casos;
begin
  if not coalesce((select public.carbo_e_time_interno()), false) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if nullif(btrim(p_nota), '') is null then
    raise exception 'Anotação vazia' using errcode = '22023';
  end if;
  select * into c from public.carbo_posvenda_casos where id = p_caso;
  if not found then
    raise exception 'Caso não encontrado' using errcode = 'P0002';
  end if;
  insert into public.carbo_posvenda_caso_hist (caso_id, acao, tipo, passo, nota, por)
  values (c.id, 'nota', c.tipo, c.passo, btrim(p_nota), auth.uid());
  update public.carbo_posvenda_casos set atualizado_por = auth.uid(), atualizado_em = now() where id = c.id;
end $$;

revoke execute on function public.carbo_posvenda_caso_abrir(bigint, text, text) from public, anon;
revoke execute on function public.carbo_posvenda_caso_responder(uuid, text, text, text, text, text, text, jsonb, numeric) from public, anon;
revoke execute on function public.carbo_posvenda_caso_encerrar(uuid, text, text) from public, anon;
revoke execute on function public.carbo_posvenda_caso_voltar(uuid) from public, anon;
revoke execute on function public.carbo_posvenda_caso_anotar(uuid, text) from public, anon;
grant execute on function public.carbo_posvenda_caso_abrir(bigint, text, text) to authenticated;
grant execute on function public.carbo_posvenda_caso_responder(uuid, text, text, text, text, text, text, jsonb, numeric) to authenticated;
grant execute on function public.carbo_posvenda_caso_encerrar(uuid, text, text) to authenticated;
grant execute on function public.carbo_posvenda_caso_voltar(uuid) to authenticated;
grant execute on function public.carbo_posvenda_caso_anotar(uuid, text) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 4 — a lista: o caso de cada pedido + o modo "casos em aberto"   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ Parâmetro novo = assinatura nova: a de três argumentos SAI no mesmo
-- arquivo (duas convivendo dariam `function is not unique` ao PostgREST). A
-- tela antiga chama por nome com p_de/p_ate e cai na nova pelo default.
drop function if exists public.carbo_posvenda(date, date, date);

create or replace function public.carbo_posvenda(
  p_de       date    default null,
  p_ate      date    default null,
  p_corte    date    default date '2026-11-06',
  p_so_casos boolean default false
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
begin
  if not coalesce((select public.carbo_e_time_interno()), false) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if not p_so_casos then
    if p_de is null or p_ate is null or p_ate < p_de then
      raise exception 'Período inválido' using errcode = '22023';
    end if;
    if p_ate - p_de > 400 then
      raise exception 'Período longo demais (máximo 400 dias)' using errcode = '22023';
    end if;
  end if;

  select coalesce(jsonb_object_agg(etapa, dias), '{}'::jsonb) into v_lim
    from public.carbo_esteira_limite where ativo;

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
     where not p_so_casos and data_pedido between p_de and p_ate
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
                  'aberto_em', c.aberto_em, 'atualizado_em', c.atualizado_em)
                  from public.carbo_posvenda_casos c
                 where c.bling_id = j.bling_id
                 order by (c.status = 'aberto') desc, c.aberto_em desc
                 limit 1) as caso,
               (select count(*) from public.carbo_posvenda_casos c where c.bling_id = j.bling_id) as casos_n
      ) k on true
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
              'casos_n',         c.casos_n
            ) order by c.data_pedido, c.bling_id), '[]'::jsonb)
       from com_trato c
      where case when p_so_casos then c.bling_id in (select bling_id from abertos_caso)
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

comment on function public.carbo_posvenda(date, date, date, boolean) is
  'Pós-venda (Atendimento /pos-venda): todo pedido do período menos o ML Full, com o problema (régua da carbo_entrega_pendencias), a tratativa e o caso. p_so_casos = os pedidos com caso aberto, de qualquer data. Ver 20261172/20261173.';

revoke execute on function public.carbo_posvenda(date, date, date, boolean) from public, anon;
grant execute on function public.carbo_posvenda(date, date, date, boolean) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ Conferência que ABORTA                                                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.carbo_posvenda(date, date, date, boolean)',
    'public.carbo_posvenda_caso_abrir(bigint, text, text)',
    'public.carbo_posvenda_caso_responder(uuid, text, text, text, text, text, text, jsonb, numeric)',
    'public.carbo_posvenda_caso_encerrar(uuid, text, text)',
    'public.carbo_posvenda_caso_voltar(uuid)',
    'public.carbo_posvenda_caso_anotar(uuid, text)'
  ] loop
    if to_regprocedure(f) is null then
      raise exception 'ABORTADO: % não foi criada', f;
    end if;
    if has_function_privilege('anon', f, 'execute') then
      raise exception 'ABORTADO: anon executa %', f;
    end if;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'carbo_posvenda') <> 1 then
    raise exception 'ABORTADO: carbo_posvenda ficou com mais de uma assinatura';
  end if;
end $$;
