-- ═══════════════════════════════════════════════════════════════════════════
-- Rastreio: a FILA é escolhida no BANCO (escala de 100×)
--
-- O `rastreio-sync` baixava TODOS os cards abertos da esteira e TODO o
-- `rastreio_envios` a cada 5 min só para escolher 60 códigos. A 100× são
-- dezenas de milhares de linhas lidas por rodada, e o teto de 60 por rodada
-- (17 mil/dia) não acompanha o volume em trânsito.
--
-- Esta função devolve SÓ quem deve ser consultado agora:
--   · abertos (esteira, janela de 60 dias), nunca consultados primeiro, depois
--     o `consultado_em` mais antigo — a fila RODA;
--   · a repescagem: entregues (30 dias) que nunca tiveram linha.
-- Os mesmos cortes de canal do código (ML, Amazon, Shopee e Mandaê não passam
-- pelo Melhor Envio).
--
-- jsonb, nunca setof: o teto de 1.000 do PostgREST vale para RPC.
-- Só service_role chama (a função de borda).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.carbo_rastreio_fila(
  p_limite      int default 300,
  p_repescagem  int default 20
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila jsonb;
  v_rep  jsonb;
begin
  p_limite     := least(greatest(coalesce(p_limite, 300), 1), 1000);
  p_repescagem := least(greatest(coalesce(p_repescagem, 20), 0), 200);

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

  return jsonb_build_object('fila', v_fila, 'repescagem', v_rep);
end;
$$;

revoke execute on function public.carbo_rastreio_fila(int, int) from public, anon, authenticated;
grant  execute on function public.carbo_rastreio_fila(int, int) to service_role;

-- A fila ordena por `consultado_em` do envio: índice já existe
-- (`rastreio_envios_consultado_idx`, 20261157). Conferência aborta se faltar.
do $$
begin
  if to_regclass('public.rastreio_envios_consultado_idx') is null then
    create index rastreio_envios_consultado_idx on public.rastreio_envios (consultado_em);
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'carbo_rastreio_fila') then
    raise exception 'carbo_rastreio_fila não foi criada';
  end if;
end $$;
