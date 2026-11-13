-- ═══════════════════════════════════════════════════════════════════════════
-- 20261154 — Pendências de entrega (Atendimento, `/pendencias`)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pedido do dono do processo em 13/11/2026, depois dos 667 cards parados em
-- Etiqueta: separar os pedidos com problema em ANTES de 06/11 (o passivo, a
-- "planilha" para resolver aos poucos — clientes que nunca reclamaram, mas a
-- quem devemos satisfação) e DE 06/11 EM DIANTE (o acompanhamento do dia a dia).
--
-- ⚠️ A tela NÃO decide o que é problema: quem decide é
-- `carbo_entrega_pendencias()`, lendo a MESMA esteira e os MESMOS limiares da
-- `carbo_esteira_limite` (os do alerta de pedido parado). Duas definições de
-- "parado" dariam duas listas.
--
-- ⚠️ Esta migração NÃO move card nenhum: não toca na `bling2_esteira` nem na
-- `carbo_msg_fila`. O trato é anotação de quem atende; a esteira continua
-- dizendo o que o rastreio diz.
--
-- Os problemas, do mais grave ao mais leve (um por pedido, o primeiro que vale):
--   transportadora   o rastreio diz problema ou devolução
--   vencida          a etiqueta venceu e ninguém fez outra
--   cancelada        a etiqueta foi cancelada e ninguém fez outra
--   nao_postado      etiqueta gerada e não postada além do limite
--   atrasado         em trânsito além da previsão (ou do limite, sem previsão)
--   sem_etiqueta     NF emitida e sem etiqueta além do limite
--   sem_nf           confirmado e sem NF além do limite
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — o trato (o que quem atende fez com cada pedido)             ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
create table if not exists public.carbo_entrega_trato (
  bling_id        bigint primary key,      -- o MESMO da esteira (Bling 1 negativo)
  situacao        text not null default 'aberto'
                    check (situacao in ('aberto','em_contato','reenviado',
                                        'reembolsado','resolvido','sem_solucao')),
  observacao      text check (observacao is null or length(observacao) <= 4000),
  atualizado_por  uuid default auth.uid(),
  atualizado_em   timestamptz not null default now()
);

comment on table public.carbo_entrega_trato is
  'Pendências de entrega: o que o atendimento fez com cada pedido com problema. Anotação — NÃO move card da esteira.';

-- O histórico: append-only, escrito SÓ pelo gatilho (sem policy de escrita).
create table if not exists public.carbo_entrega_trato_hist (
  id              bigint generated always as identity primary key,
  bling_id        bigint not null,
  situacao        text not null,
  observacao      text,
  por             uuid,
  em              timestamptz not null default now()
);
create index if not exists carbo_entrega_trato_hist_pedido
  on public.carbo_entrega_trato_hist (bling_id, em desc);

create or replace function public.carbo_entrega_trato_registrar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- ⚠️ Quem fez é o `auth.uid()` do servidor, nunca o campo que o navegador
  -- mandou (a lição do painel do atendimento).
  new.atualizado_por := coalesce(auth.uid(), new.atualizado_por);
  new.atualizado_em  := now();
  if tg_op = 'INSERT'
     or new.situacao is distinct from old.situacao
     or new.observacao is distinct from old.observacao then
    begin
      insert into public.carbo_entrega_trato_hist (bling_id, situacao, observacao, por)
      values (new.bling_id, new.situacao, new.observacao, new.atualizado_por);
    exception when others then
      -- Histórico que falha não derruba o clique de quem atende.
      raise warning 'carbo_entrega_trato_hist: %', sqlerrm;
    end;
  end if;
  return new;
end $$;
revoke execute on function public.carbo_entrega_trato_registrar() from public, anon;

drop trigger if exists trg_carbo_entrega_trato on public.carbo_entrega_trato;
create trigger trg_carbo_entrega_trato
  before insert or update on public.carbo_entrega_trato
  for each row execute function public.carbo_entrega_trato_registrar();

alter table public.carbo_entrega_trato      enable row level security;
alter table public.carbo_entrega_trato_hist enable row level security;

drop policy if exists carbo_entrega_trato_ler on public.carbo_entrega_trato;
create policy carbo_entrega_trato_ler on public.carbo_entrega_trato
  for select to authenticated using ((select public.carbo_e_time_interno()));
drop policy if exists carbo_entrega_trato_criar on public.carbo_entrega_trato;
create policy carbo_entrega_trato_criar on public.carbo_entrega_trato
  for insert to authenticated with check ((select public.carbo_e_time_interno()));
drop policy if exists carbo_entrega_trato_mudar on public.carbo_entrega_trato;
create policy carbo_entrega_trato_mudar on public.carbo_entrega_trato
  for update to authenticated using ((select public.carbo_e_time_interno()))
  with check ((select public.carbo_e_time_interno()));
-- Sem DELETE: voltar ao começo é situação 'aberto', e o histórico fica.

drop policy if exists carbo_entrega_trato_hist_ler on public.carbo_entrega_trato_hist;
create policy carbo_entrega_trato_hist_ler on public.carbo_entrega_trato_hist
  for select to authenticated using ((select public.carbo_e_time_interno()));

grant select, insert, update on public.carbo_entrega_trato to authenticated;
grant select on public.carbo_entrega_trato_hist to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — a lista                                                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- ⚠️ `jsonb`, nunca `setof`: o teto de 1.000 do PostgREST vale para RPC.
-- ⚠️ SECURITY DEFINER guardada no corpo: lê a esteira UMA vez como dono (sem
-- a RLS avaliada por linha das seis tabelas por baixo). No SQL Editor ela
-- RECUSA — sem usuário não há time interno, e isso está certo.
create or replace function public.carbo_entrega_pendencias(p_corte date default date '2026-11-06')
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_lim jsonb;
  v_itens jsonb;
begin
  if not coalesce((select public.carbo_e_time_interno()), false) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  select coalesce(jsonb_object_agg(etapa, dias), '{}'::jsonb) into v_lim
    from public.carbo_esteira_limite where ativo;

  with lim as (
    select coalesce((v_lim ->> 'confirmado')::int, 2)   as confirmado,
           coalesce((v_lim ->> 'nf_emitida')::int, 3)   as nf_emitida,
           coalesce((v_lim ->> 'etiqueta')::int, 3)     as etiqueta,
           coalesce((v_lim ->> 'em_transito')::int, 15) as em_transito
  ),
  base as materialized (
    select e.*, r.status as r_status, r.status_descricao as r_descricao,
           r.previsao_entrega, r.postado_em as r_postado_em,
           r.ultimo_evento_em, r.url_rastreio
      from public.bling2_esteira e
      left join public.rastreio_envios r on r.codigo = e.rastreio
     where e.etapa in ('confirmado', 'nf_emitida', 'etiqueta', 'em_transito')
  ),
  julgado as (
    select b.*,
      case
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
      -- Desde quando o problema existe (a régua do "há N dias" na tela).
      case
        when b.r_status in ('problema', 'devolvido') then b.ultimo_evento_em
        when b.me_situacao = 'vencido' then b.me_expirado_em
        when b.etapa = 'etiqueta' then coalesce(b.me_gerado_em, b.nf_data::timestamptz, b.data_pedido::timestamptz)
        when b.etapa = 'em_transito' then coalesce(b.previsao_entrega::timestamptz, b.r_postado_em, b.data_pedido::timestamptz)
        when b.etapa = 'nf_emitida' then coalesce(b.nf_data::timestamptz, b.data_pedido::timestamptz)
        else b.data_pedido::timestamptz
      end as desde
      from base b cross join lim l
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'bling_id',       j.bling_id,
           'pedido_numero',  j.pedido_numero,
           'pedido_loja',    j.pedido_loja,
           'pedido_codigo',  j.pedido_codigo,
           'canal',          j.canal,
           'data_pedido',    j.data_pedido,
           'total',          j.total,
           'cliente',        j.cliente,
           'cliente_fone',   j.cliente_fone,
           'cidade',         j.entrega_cidade,
           'uf',             j.entrega_uf,
           'etapa',          j.etapa,
           'problema',       j.problema,
           'desde',          j.desde,
           'previsao',       j.previsao_entrega,
           'rastreio_status', j.r_descricao,
           'transportadora', j.transportadora,
           'rastreio',       coalesce(j.rastreio_transportadora, j.rastreio),
           'url_rastreio',   j.url_rastreio,
           'nf_numero',      j.nf_numero,
           'antes_do_corte', j.data_pedido < p_corte,
           'trato', case when t.bling_id is null then null else jsonb_build_object(
                      'situacao', t.situacao, 'observacao', t.observacao,
                      'em', t.atualizado_em,
                      'por', nullif(btrim(pr.full_name), '')) end
         ) order by j.data_pedido, j.bling_id), '[]'::jsonb)
    into v_itens
    from julgado j
    left join public.carbo_entrega_trato t on t.bling_id = j.bling_id
    left join public.profiles pr on pr.id = t.atualizado_por
   where j.problema is not null;

  return jsonb_build_object(
    'gerado_em', now(),
    'corte',     p_corte,
    'limites',   v_lim,
    'itens',     v_itens);
end $$;

revoke execute on function public.carbo_entrega_pendencias(date) from public, anon;
grant execute on function public.carbo_entrega_pendencias(date) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 3 — conferir (no SQL Editor a função recusa; confira pela base) ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
-- As tabelas existem e a função foi criada:
select (select count(*) from public.carbo_entrega_trato)                     as tratos,
       (select count(*) from pg_proc where proname = 'carbo_entrega_pendencias') = 1 as funcao_ok;
