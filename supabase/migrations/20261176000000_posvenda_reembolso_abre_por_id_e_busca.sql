-- ═══════════════════════════════════════════════════════════════════════════
-- Reembolsos (Finanças › /reembolsos): abrir UM reembolso pelo id e procurar.
--
-- 18/11/2026, pedido do dono do processo: "a pessoa clicar e já ir para a
-- página correta". O sininho, o caso do Atendimento e o link copiado levam a
-- `finance…/reembolsos?reembolso=<id>`, e a tela só achava o reembolso se ele
-- estivesse na ABA e na PÁGINA que ela carregou. Agora:
--   p_id    → devolve só aquele, em qualquer situação (a contagem continua a geral)
--   p_busca → cliente, pedido (código, número, loja), NF ou telefone
--
-- ⚠️ Acrescentar parâmetro com default cria SOBRECARGA (`function is not
-- unique`): a assinatura de 3 argumentos é APAGADA antes. A tela chama por
-- nome e, sem esta migração, só não passa p_id/p_busca (o hook tem reserva).
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists public.carbo_posvenda_reembolsos_lista(text, int, int);

create or replace function public.carbo_posvenda_reembolsos_lista(
  p_status text default 'solicitado',
  p_limite int  default 50,
  p_offset int  default 0,
  p_id     uuid default null,
  p_busca  text default null
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_itens jsonb;
  v_cont  jsonb;
  v_total int;
  v_busca text := nullif(btrim(coalesce(p_busca, '')), '');
  v_dig   text := regexp_replace(coalesce(p_busca, ''), '\D', '', 'g');
begin
  if not coalesce((select public.carbo_tem_app(array['carbo_financas'])), false) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('solicitado', 'pago', 'devolvido', 'cancelado') then
    raise exception 'Situação inválida' using errcode = '22023';
  end if;
  if length(v_dig) < 4 then v_dig := null; end if;

  select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) into v_cont
    from (select status, count(*) as n from public.carbo_posvenda_reembolsos group by 1) s;

  with base as (
    select r.*, k.tipo as k_tipo, k.status as k_status, k.desfecho as k_desfecho, k.encerrado_em as k_encerrado_em,
           e.pedido_codigo, e.pedido_numero, e.pedido_loja, e.canal, e.data_pedido, e.total,
           e.cliente, e.cliente_fone, e.nf_numero
      from public.carbo_posvenda_reembolsos r
      join public.carbo_posvenda_casos k on k.id = r.caso_id
      left join public.bling2_esteira e on e.bling_id = r.bling_id
     where case when p_id is not null then r.id = p_id
                else (p_status is null or r.status = p_status) end
       and (v_busca is null
            or concat_ws(' ', e.cliente, e.pedido_codigo, e.pedido_numero, e.pedido_loja, e.nf_numero) ilike '%' || v_busca || '%'
            or (v_dig is not null and regexp_replace(coalesce(e.cliente_fone, ''), '\D', '', 'g') like '%' || right(v_dig, 8) || '%'))
  ),
  contados as (select count(*) as n from base),
  pagina as (
    select b.*,
           case when b.status = 'solicitado' then b.solicitado_em end as ord_a,
           greatest(b.solicitado_em, b.pago_registrado_em, b.devolvido_em, b.cancelado_em) as ord_b
      from base b
     order by case when b.status = 'solicitado' then b.solicitado_em end asc nulls last,
              greatest(b.solicitado_em, b.pago_registrado_em, b.devolvido_em, b.cancelado_em) desc, b.id
     limit greatest(1, least(coalesce(p_limite, 50), 200)) offset greatest(coalesce(p_offset, 0), 0)
  )
  select (select n from contados),
         coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'caso_id', x.caso_id, 'bling_id', x.bling_id,
           'tipo', x.tipo, 'valor', x.valor, 'forma', x.forma, 'dados', x.dados, 'nota', x.nota,
           'status', x.status,
           'solicitado_em', x.solicitado_em, 'solicitado_por', nullif(btrim(ps.full_name), ''),
           'pago_em', x.pago_em, 'valor_pago', x.valor_pago, 'comprovante_path', x.comprovante_path,
           'nota_financeiro', x.nota_financeiro, 'pago_por', nullif(btrim(pp.full_name), ''),
           'pago_registrado_em', x.pago_registrado_em,
           'devolvido_em', x.devolvido_em, 'motivo_devolucao', x.motivo_devolucao,
           'devolvido_por', nullif(btrim(pd.full_name), ''),
           'cancelado_em', x.cancelado_em,
           'caso_tipo', x.k_tipo, 'caso_status', x.k_status, 'caso_desfecho', x.k_desfecho,
           'caso_encerrado_em', x.k_encerrado_em,
           'pedido_codigo', x.pedido_codigo, 'pedido_numero', x.pedido_numero,
           'pedido_loja', x.pedido_loja, 'canal', x.canal, 'data_pedido', x.data_pedido,
           'total', x.total, 'cliente', x.cliente, 'cliente_fone', x.cliente_fone,
           'nf_numero', x.nf_numero
         ) order by x.ord_a asc nulls last, x.ord_b desc, x.id), '[]'::jsonb)
    into v_total, v_itens
    from pagina x
    left join public.profiles ps on ps.id = x.solicitado_por
    left join public.profiles pp on pp.id = x.pago_por
    left join public.profiles pd on pd.id = x.devolvido_por;

  return jsonb_build_object('itens', v_itens, 'total', coalesce(v_total, 0), 'contagem', v_cont);
end $$;

revoke execute on function public.carbo_posvenda_reembolsos_lista(text, int, int, uuid, text) from public, anon;
grant execute on function public.carbo_posvenda_reembolsos_lista(text, int, int, uuid, text) to authenticated;

-- ── Conferência que ABORTA: uma assinatura só, e a certa ─────────────────────
do $$
declare
  n int;
begin
  select count(*) into n
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'carbo_posvenda_reembolsos_lista';
  if n <> 1 then
    raise exception 'carbo_posvenda_reembolsos_lista: % assinaturas (esperado 1)', n;
  end if;
  if to_regprocedure('public.carbo_posvenda_reembolsos_lista(text, int, int, uuid, text)') is null then
    raise exception 'carbo_posvenda_reembolsos_lista(text, int, int, uuid, text) não existe';
  end if;
end $$;
