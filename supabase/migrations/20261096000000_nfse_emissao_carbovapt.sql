-- =====================================================================
-- NFS-e do CarboVAPT pelo Portal Nacional — a EMISSÃO (16/10/2026)
--
-- Pedido do dono do processo: o botão manda tudo o que o sistema já tem,
-- pré-preenchido, para o Finanças só CONFERIR e emitir — e o rodapé leva o
-- nº da venda e o vendedor, para o cruzamento.
--
-- A fase 4 (assinar um DPS que o SEFIN aceita) foi provada em 08/10 na
-- produção restrita: 201 com chave de acesso. Isto é o que vem depois dela.
--
--   carbo_nfse_emissoes            uma linha por TENTATIVA de emissão
--   carbo_nfse_serie_contador      o nDPS, por ambiente e série
--   carbo_nfse_emissao_preparar    o que a tela de confirmação mostra
--   carbo_nfse_emissao_reservar    reserva o número (SÓ a edge function)
--   carbo_nfse_emissao_concluir    grava a resposta  (SÓ a edge function)
--
-- ⚠️ SÉRIE 2, contador NOSSO. Medido em 16/10 nas notas do CNPJ: a 00001 já
-- tem 170 notas (até a 2169), a 70000 é a do emissor web (194, até a 410), a
-- 80000 tem uma. A API só aceita 00001–49999 (E1235 com 90000). Usar uma série
-- que outro emissor já usa faria dois contadores disputarem o mesmo número.
--
-- ⚠️ QUEM GRAVA O RESULTADO É A EDGE FUNCTION, nunca o navegador. Reservar e
-- concluir só têm EXECUTE para service_role: se a tela pudesse chamar
-- `concluir`, um clique forjaria "autorizada" para uma nota que não existe.
--
-- ⚠️ `indeterminado` é um estado de verdade, não um erro. Quando a resposta
-- do SEFIN não chega (timeout, queda de rede no meio), a nota PODE ter saído.
-- Emitir outra com número novo seria a nota em DOBRO. Por isso a nova
-- tentativa REUSA o mesmo nDPS: se a primeira emitiu, o SEFIN responde E0014
-- ("já existe") em vez de criar a segunda.
-- =====================================================================

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — medição (só leitura)                                     ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: as 4 primeiras `true` e `ja_existe_emissoes = false`.
-- `os_vehicles = false` não quebra nada (a descrição sai sem os veículos),
-- mas me mande — significa que a OS mora em outro lugar.
-- `vendas_carbovapt` = quantas vendas só de serviço estão no sistema.
select
  to_regclass('public.carboze_orders') is not null                          as carboze_orders,
  to_regprocedure('public.carbo_tem_app(text[])') is not null              as carbo_tem_app,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='carboze_orders'
             and column_name='descarb_os_id')                               as descarb_os_id,
  exists (select 1 from information_schema.columns
           where table_schema='licenciados' and table_name='os_vehicles'
             and column_name='plate')                                       as os_vehicles,
  to_regclass('public.carbo_nfse_emissoes') is not null                     as ja_existe_emissoes,
  (select count(*) from public.carboze_orders o
    where jsonb_typeof(o.items) = 'array' and jsonb_array_length(o.items) > 0
      and not exists (select 1 from jsonb_array_elements(o.items) i
                       where coalesce(i->>'kind','') <> 'service')
      and o.status::text not in ('quote','cancelled'))                      as vendas_carbovapt;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — tabelas, funções e permissões                            ║
-- ╚═══════════════════════════════════════════════════════════════════╝
create table if not exists public.carbo_nfse_serie_contador (
  ambiente smallint not null check (ambiente in (1, 2)),
  serie    text     not null,
  ultimo   bigint   not null default 0,
  primary key (ambiente, serie)
);
comment on table public.carbo_nfse_serie_contador is
  'Último nDPS usado por ambiente (1 produção, 2 restrita) e série. Só a função de reserva mexe.';

create table if not exists public.carbo_nfse_emissoes (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.carboze_orders(id) on delete restrict,
  ambiente      smallint not null check (ambiente in (1, 2)),
  serie         text not null,
  n_dps         bigint not null,
  status        text not null default 'enviando'
                check (status in ('enviando','autorizada','rejeitada','falha','indeterminado')),
  c_ind_op      text not null,
  d_compet      date not null,
  descricao     text not null,
  inf_comp      text,
  valor         numeric(14,2) not null,
  tomador       jsonb not null,
  chave_acesso  text,
  n_nfse        text,
  http_status   integer,
  resposta      text,
  nfse_xml      text,
  erro          text,
  tentativas    integer not null default 1,
  criado_por    uuid,
  criado_em     timestamptz not null default now(),
  enviado_em    timestamptz not null default now(),
  concluido_em  timestamptz,
  unique (ambiente, serie, n_dps)
);
comment on table public.carbo_nfse_emissoes is
  'Cada tentativa de emitir NFS-e de um pedido CarboVAPT pelo Portal Nacional. Append-only pela tela; quem escreve é a edge function nfse-emitir.';

create index if not exists carbo_nfse_emissoes_order_idx on public.carbo_nfse_emissoes (order_id);

-- ⚠️ Em PRODUÇÃO, um pedido tem no máximo UMA nota viva (ou em voo, ou que
-- pode ter saído). É a trava contra a nota em dobro — e ela mora no BANCO,
-- não no botão, porque dois cliques em duas abas passam pelo botão.
-- Na restrita não: lá se testa o mesmo pedido quantas vezes precisar.
create unique index if not exists carbo_nfse_emissoes_uma_viva_por_pedido
  on public.carbo_nfse_emissoes (order_id)
  where ambiente = 1 and status in ('enviando','autorizada','indeterminado');

alter table public.carbo_nfse_emissoes enable row level security;
alter table public.carbo_nfse_serie_contador enable row level security;

-- Leitura: quem tem o Finanças. ⚠️ SEM policy de escrita nenhuma, de propósito.
drop policy if exists carbo_nfse_emissoes_le on public.carbo_nfse_emissoes;
create policy carbo_nfse_emissoes_le on public.carbo_nfse_emissoes
  for select to authenticated
  using ((select public.carbo_tem_app(array['carbo_financas'])));

revoke all on public.carbo_nfse_emissoes from anon, authenticated;
grant select on public.carbo_nfse_emissoes to authenticated;
revoke all on public.carbo_nfse_serie_contador from anon, authenticated;

-- ── O que a tela de confirmação mostra ────────────────────────────────
create or replace function public.carbo_nfse_emissao_preparar(p_order uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_o        jsonb;
  v_vendedor text;
  v_os       uuid;
  v_veic     jsonb := '[]'::jsonb;
  v_emis     jsonb;
  v_so_serv  boolean;
begin
  if not coalesce(public.carbo_tem_app(array['carbo_financas']), false) then
    raise exception 'Sem permissão: emitir NFS-e é do Finanças.' using errcode = '42501';
  end if;

  select to_jsonb(o), nullif(btrim(coalesce(o.vendedor_name, p.full_name, '')), '')
    into v_o, v_vendedor
    from public.carboze_orders o
    left join public.profiles p on p.id = o.vendedor_id
   where o.id = p_order;
  if v_o is null then
    raise exception 'Pedido não encontrado.';
  end if;

  v_so_serv := jsonb_typeof(v_o->'items') = 'array'
           and jsonb_array_length(v_o->'items') > 0
           and not exists (select 1 from jsonb_array_elements(v_o->'items') i
                            where coalesce(i->>'kind','') <> 'service');

  -- Os veículos são preenchidos pelo Carbox NA EXECUÇÃO, na OS do licenciado.
  -- ⚠️ Lido por SQL dinâmico: sem o schema `licenciados` a função continua de
  -- pé e a descrição só sai sem os carros (a tela avisa).
  v_os := nullif(v_o->>'descarb_os_id', '')::uuid;
  if v_os is not null and to_regclass('licenciados.os_vehicles') is not null then
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object(
               'posicao', v.position, 'placa', v.plate,
               'modelo', v.model, 'ano', v.vehicle_year)
             order by v.position), '[]'::jsonb)
        from licenciados.os_vehicles v
       where v.service_order_id = $1
    $q$ into v_veic using v_os;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'ambiente', e.ambiente, 'serie', e.serie, 'n_dps', e.n_dps,
           -- ⚠️ `enviando` parado há 5 min aparece como `indeterminado`, que é o
           -- que ele é: a reserva converte de verdade no próximo clique.
           'status', case when e.status = 'enviando' and e.enviado_em < now() - interval '5 minutes'
                          then 'indeterminado' else e.status end,
           'chave_acesso', e.chave_acesso, 'n_nfse', e.n_nfse,
           'erro', e.erro, 'c_ind_op', e.c_ind_op, 'descricao', e.descricao,
           'd_compet', e.d_compet, 'tomador', e.tomador, 'criado_em', e.criado_em, 'concluido_em', e.concluido_em)
         order by e.criado_em desc), '[]'::jsonb)
    into v_emis
    from public.carbo_nfse_emissoes e
   where e.order_id = p_order;

  return jsonb_build_object(
    'pedido', jsonb_build_object(
      'id',               v_o->>'id',
      'order_number',     v_o->>'order_number',
      'status',           v_o->>'status',
      'customer_name',    v_o->>'customer_name',
      'documento',        v_o->>'cnpj',
      'customer_email',   v_o->>'customer_email',
      'customer_phone',   v_o->>'customer_phone',
      'delivery_address', v_o->>'delivery_address',
      'delivery_city',    v_o->>'delivery_city',
      'delivery_state',   v_o->>'delivery_state',
      'delivery_zip',     v_o->>'delivery_zip',
      'po_number',        v_o->>'po_number',
      'sale_date',        v_o->>'sale_date',
      'created_at',       v_o->>'created_at',
      'total',            (v_o->>'total')::numeric,
      'itens',            v_o->'items',
      'descarb_os_id',    v_os,
      'so_servico',       v_so_serv,
      'vendedor',         v_vendedor
    ),
    'veiculos', v_veic,
    'emissoes', v_emis
  );
end;
$$;

revoke execute on function public.carbo_nfse_emissao_preparar(uuid) from anon, public;
grant  execute on function public.carbo_nfse_emissao_preparar(uuid) to authenticated, service_role;

-- ── Reserva do número (SÓ a edge function) ────────────────────────────
-- `p_reusar`: a linha `indeterminado` que se tenta de novo com o MESMO nDPS.
create or replace function public.carbo_nfse_emissao_reservar(
  p_order    uuid,
  p_user     uuid,
  p_ambiente smallint,
  p_serie    text,
  p_dados    jsonb,
  p_reusar   uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_o        record;
  v_vendedor text;
  v_n        bigint;
  v_id       uuid;
  v_r        record;
begin
  -- ⚠️ FOR UPDATE: dois cliques simultâneos passam pela checagem abaixo ao
  -- mesmo tempo sem esta trava. O índice único também pega, mas com erro feio.
  select o.*, nullif(btrim(coalesce(o.vendedor_name, p.full_name, '')), '') as vend
    into v_o
    from public.carboze_orders o
    left join public.profiles p on p.id = o.vendedor_id
   where o.id = p_order
   for update of o;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  v_vendedor := v_o.vend;

  -- ⚠️ `enviando` há mais de 5 min = a função caiu entre o envio e o registro
  -- (o relay espera no máximo 40 s). A nota PODE ter saído: vira
  -- `indeterminado`, nunca `falha` — senão o próximo clique emitiria outra.
  update public.carbo_nfse_emissoes
     set status = 'indeterminado',
         erro = 'A emissão não registrou resposta. A nota pode ter saído: reenvie com o MESMO número.'
   where order_id = p_order and status = 'enviando'
     and enviado_em < now() - interval '5 minutes';

  if v_o.status::text in ('quote','cancelled') then
    raise exception 'Pedido % é orçamento ou está cancelado: não se emite nota.', v_o.order_number;
  end if;
  if not (jsonb_typeof(v_o.items) = 'array' and jsonb_array_length(v_o.items) > 0
          and not exists (select 1 from jsonb_array_elements(v_o.items) i
                           where coalesce(i->>'kind','') <> 'service')) then
    raise exception 'Pedido % não é só de serviço: a nota dele é NF-e pelo Bling, não NFS-e.', v_o.order_number;
  end if;
  if coalesce(v_o.total, 0) <= 0 then
    raise exception 'Pedido % sem valor: não se emite NFS-e de R$ 0,00.', v_o.order_number;
  end if;

  if p_reusar is not null then
    select * into v_r from public.carbo_nfse_emissoes
     where id = p_reusar and order_id = p_order for update;
    if not found or v_r.status <> 'indeterminado' then
      raise exception 'Só se reenvia com o mesmo número uma tentativa em estado indeterminado.';
    end if;
    update public.carbo_nfse_emissoes
       set status = 'enviando', tentativas = tentativas + 1, erro = null,
           enviado_em = now(), concluido_em = null,
           c_ind_op = p_dados->>'c_ind_op', d_compet = (p_dados->>'d_compet')::date,
           descricao = p_dados->>'descricao', inf_comp = p_dados->>'inf_comp',
           tomador = p_dados->'tomador'
     where id = p_reusar;
    return jsonb_build_object('id', v_r.id, 'serie', v_r.serie, 'n_dps', v_r.n_dps,
      'valor', v_o.total, 'order_number', v_o.order_number, 'vendedor', v_vendedor,
      'documento', v_o.cnpj, 'nome', v_o.customer_name, 'po_number', v_o.po_number,
      'reuso', true);
  end if;

  if exists (select 1 from public.carbo_nfse_emissoes
              where order_id = p_order and ambiente = p_ambiente
                and status in ('enviando','indeterminado')
                and (p_ambiente = 1 or status = 'enviando')) then
    raise exception 'Já há uma emissão deste pedido em andamento ou sem resposta. Confira antes de emitir de novo.';
  end if;
  if p_ambiente = 1 and exists (select 1 from public.carbo_nfse_emissoes
              where order_id = p_order and ambiente = 1 and status = 'autorizada') then
    raise exception 'Pedido % já tem NFS-e autorizada.', v_o.order_number;
  end if;

  insert into public.carbo_nfse_serie_contador (ambiente, serie, ultimo)
  values (p_ambiente, p_serie, 1)
  on conflict (ambiente, serie) do update set ultimo = carbo_nfse_serie_contador.ultimo + 1
  returning ultimo into v_n;

  insert into public.carbo_nfse_emissoes
    (order_id, ambiente, serie, n_dps, c_ind_op, d_compet, descricao, inf_comp,
     valor, tomador, criado_por)
  values
    (p_order, p_ambiente, p_serie, v_n, p_dados->>'c_ind_op', (p_dados->>'d_compet')::date,
     p_dados->>'descricao', p_dados->>'inf_comp', v_o.total, p_dados->'tomador', p_user)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'serie', p_serie, 'n_dps', v_n,
    'valor', v_o.total, 'order_number', v_o.order_number, 'vendedor', v_vendedor,
    'documento', v_o.cnpj, 'nome', v_o.customer_name, 'po_number', v_o.po_number,
    'reuso', false);
end;
$$;

-- ⚠️ SÓ service_role. Função nova nasce executável por anon (default
-- privileges do Supabase): o revoke explícito é o que fecha.
revoke execute on function public.carbo_nfse_emissao_reservar(uuid, uuid, smallint, text, jsonb, uuid)
  from anon, authenticated, public;
grant  execute on function public.carbo_nfse_emissao_reservar(uuid, uuid, smallint, text, jsonb, uuid)
  to service_role;

-- ── A resposta do SEFIN (SÓ a edge function) ──────────────────────────
create or replace function public.carbo_nfse_emissao_concluir(
  p_id          uuid,
  p_status      text,
  p_http_status integer,
  p_resposta    text,
  p_chave       text default null,
  p_n_nfse      text default null,
  p_xml         text default null,
  p_erro        text default null,
  p_inf_comp    text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('autorizada','rejeitada','falha','indeterminado') then
    raise exception 'Status inválido: %', p_status;
  end if;
  update public.carbo_nfse_emissoes
     set status = p_status, http_status = p_http_status, resposta = p_resposta,
         chave_acesso = coalesce(p_chave, chave_acesso), n_nfse = coalesce(p_n_nfse, n_nfse),
         nfse_xml = coalesce(p_xml, nfse_xml), erro = p_erro,
         inf_comp = coalesce(p_inf_comp, inf_comp), concluido_em = now()
   where id = p_id and status = 'enviando';
  if not found then
    raise exception 'Emissão % não está em envio.', p_id;
  end if;
end;
$$;

revoke execute on function public.carbo_nfse_emissao_concluir(uuid, text, integer, text, text, text, text, text, text)
  from anon, authenticated, public;
grant  execute on function public.carbo_nfse_emissao_concluir(uuid, text, integer, text, text, text, text, text, text)
  to service_role;

notify pgrst, 'reload schema';

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA                                                        ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: 2 tabelas · 3 funções · authenticated SEM execute em
-- reservar/concluir (false, false) e COM em preparar (true) · 1 policy.
select
  (select count(*) from pg_class where relname in ('carbo_nfse_emissoes','carbo_nfse_serie_contador')
     and relnamespace = 'public'::regnamespace)                                          as tabelas,
  (select count(*) from pg_proc where proname like 'carbo_nfse_emissao_%'
     and pronamespace = 'public'::regnamespace)                                          as funcoes,
  has_function_privilege('authenticated',
    'public.carbo_nfse_emissao_reservar(uuid, uuid, smallint, text, jsonb, uuid)', 'execute') as auth_reserva,
  has_function_privilege('authenticated',
    'public.carbo_nfse_emissao_concluir(uuid, text, integer, text, text, text, text, text, text)', 'execute') as auth_conclui,
  has_function_privilege('authenticated',
    'public.carbo_nfse_emissao_preparar(uuid)', 'execute')                              as auth_prepara,
  (select count(*) from pg_policies where tablename = 'carbo_nfse_emissoes')            as policies;
