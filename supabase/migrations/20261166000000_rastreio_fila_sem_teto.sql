-- Rastreio: SEM cota fixa. Pedido que não está entregue é consultado até a
-- função ficar sem tempo; a fila roda em rodadas dentro da mesma execução.
--
-- `carbo_rastreio_fila` ganha:
--   p_excluir  códigos que a execução em curso já viu (a próxima rodada pega o
--              seguinte mais antigo, nunca repete — quem falhou sem julgamento
--              não ganha `consultado_em` e voltaria ao topo para sempre)
--   p_stats    devolve o retrato da fila: quantos abertos, quantos NUNCA
--              consultados e o `consultado_em` mais antigo — é a medida de
--              "estamos vendo todo mundo?", e vai na resposta da função.
-- A assinatura muda ⇒ a antiga sai (duas sobrecargas deixariam a chamada
-- por nome ambígua).

drop function if exists public.carbo_rastreio_fila(int, int);

create or replace function public.carbo_rastreio_fila(
  p_limite      int     default 300,
  p_repescagem  int     default 20,
  p_excluir     text[]  default '{}',
  p_stats       boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila  jsonb;
  v_rep   jsonb;
  v_stats jsonb := null;
begin
  p_limite     := least(greatest(coalesce(p_limite, 300), 1), 1000);
  p_repescagem := least(greatest(coalesce(p_repescagem, 20), 0), 200);
  p_excluir    := coalesce(p_excluir, '{}');

  with abertos as (
    select distinct on (btrim(e.rastreio))
           btrim(e.rastreio) as codigo, e.bling_id, e.nf_chave,
           e.transportadora, e.servico
      from public.bling2_esteira e
     where e.rastreio is not null
       and btrim(e.rastreio) <> ''
       and e.etapa not in ('cancelado', 'entregue')
       and e.data_pedido >= current_date - 60
       and coalesce(e.canal, '') !~* 'mercado\s*livre|mercadolivre|meli'
       and coalesce(e.canal, '') !~* 'amazon'
       and coalesce(e.canal, '') !~* 'shopee'
       and coalesce(e.transportadora, '') !~* 'mandae|mandaê'
       and btrim(e.rastreio) <> all (p_excluir)
     order by btrim(e.rastreio), e.bling_id
  ), escolhidos as (
    select a.*, r.fonte_id
      from abertos a
      left join public.rastreio_envios r on r.codigo = a.codigo
     where coalesce(r.status, '') <> 'entregue'
     order by r.consultado_em asc nulls first, a.codigo
     limit p_limite
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'codigo', codigo, 'bling_id', bling_id, 'nf_chave', nf_chave,
           'transportadora', transportadora, 'servico', servico,
           'fonte_id', fonte_id)), '[]'::jsonb)
    into v_fila
    from escolhidos;

  -- A repescagem só na primeira rodada (p_excluir vazio): ela não precisa de
  -- mais de uma vez por execução.
  if cardinality(p_excluir) = 0 then
    with entregues as (
      select distinct on (btrim(e.rastreio))
             btrim(e.rastreio) as codigo, e.bling_id, e.nf_chave,
             e.transportadora, e.servico, e.data_pedido
        from public.bling2_esteira e
       where e.etapa = 'entregue'
         and e.rastreio is not null
         and btrim(e.rastreio) <> ''
         and e.data_pedido >= current_date - 30
         and coalesce(e.canal, '') !~* 'mercado\s*livre|mercadolivre|meli'
         and coalesce(e.canal, '') !~* 'amazon'
         and coalesce(e.canal, '') !~* 'shopee'
         and coalesce(e.transportadora, '') !~* 'mandae|mandaê'
         and not exists (select 1 from public.rastreio_envios r
                          where r.codigo = btrim(e.rastreio))
       order by btrim(e.rastreio), e.bling_id
    ), escolhidos as (
      select * from entregues order by data_pedido desc, codigo limit p_repescagem
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'codigo', codigo, 'bling_id', bling_id, 'nf_chave', nf_chave,
             'transportadora', transportadora, 'servico', servico,
             'fonte_id', null)), '[]'::jsonb)
      into v_rep
      from escolhidos;
  else
    v_rep := '[]'::jsonb;
  end if;

  if p_stats then
    with abertos as (
      select distinct btrim(e.rastreio) as codigo
        from public.bling2_esteira e
       where e.rastreio is not null
         and btrim(e.rastreio) <> ''
         and e.etapa not in ('cancelado', 'entregue')
         and e.data_pedido >= current_date - 60
         and coalesce(e.canal, '') !~* 'mercado\s*livre|mercadolivre|meli'
         and coalesce(e.canal, '') !~* 'amazon'
         and coalesce(e.canal, '') !~* 'shopee'
         and coalesce(e.transportadora, '') !~* 'mandae|mandaê'
    )
    select jsonb_build_object(
             'abertos', count(*),
             'nunca_consultados', count(*) filter (where r.consultado_em is null),
             'mais_antigo', min(r.consultado_em))
      into v_stats
      from abertos a
      left join public.rastreio_envios r on r.codigo = a.codigo
     where coalesce(r.status, '') <> 'entregue';
  end if;

  return jsonb_build_object('fila', v_fila, 'repescagem', v_rep, 'stats', v_stats);
end;
$$;

revoke execute on function public.carbo_rastreio_fila(int, int, text[], boolean) from public, anon, authenticated;
grant  execute on function public.carbo_rastreio_fila(int, int, text[], boolean) to service_role;

do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'carbo_rastreio_fila'
                    and p.pronargs = 4) then
    raise exception 'carbo_rastreio_fila (4 argumentos) não foi criada';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'carbo_rastreio_fila') <> 1 then
    raise exception 'carbo_rastreio_fila ficou com mais de uma assinatura';
  end if;
end $$;
