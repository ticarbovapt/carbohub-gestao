-- =====================================================================
-- Acréscimo à tela de acompanhamento: o placar do repasse.
--
-- Sem isto não dá para responder "qual SDR entrega mais SQL, e o que
-- acontece com o que ele entrega". A pergunta tem duas metades, e medir só a
-- primeira premia volume sobre qualidade:
--
--   quantos repassou   → produtividade do SDR
--   quantos viraram    → se o que ele repassa presta
--   quantos ficaram na → se o closer está dando conta da fila
--     fila sem dono
--
-- O SDR é o `created_by` da CÓPIA: a RPC do repasse grava assim de propósito,
-- justamente para este placar existir.
--
-- ⚠️ Substitui a função crm_acompanhamento. Rode o bloco inteiro de uma vez.
-- =====================================================================

create or replace function public.crm_acompanhamento_repasses(
  p_desde date default (current_date - 29),
  p_ate   date default current_date
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_out jsonb;
begin
  if not public.crm_is_gestor() then
    raise exception 'Tela restrita à gestão.';
  end if;

  select jsonb_build_object(
    'por_sdr', coalesce((
      select jsonb_agg(x order by (x->>'repassados')::int desc) from (
        select jsonb_build_object(
                 'sdr',         c.created_by,
                 'repassados',  count(*),
                 'na_fila',     count(*) filter (where c.assigned_to is null),
                 'ganhos',      count(*) filter (where c.won_at is not null),
                 'perdidos',    count(*) filter (where c.lost_at is not null),
                 -- Sem qualificação completa o closer recebe um card cego. É o
                 -- indicador de QUALIDADE do repasse, ao lado do de volume.
                 'sem_qualificacao', count(*) filter (
                   where c.qual_volume is null or c.qual_dor is null
                      or c.qual_decisor is null or c.qual_prazo is null
                 )
               ) as x
          from public.crm_sales_leads c
         where c.origin_lead_id is not null
           and c.deleted_at is null
           and c.created_at::date between p_desde and p_ate
         group by c.created_by
      ) t
    ), '[]'::jsonb),
    'total', jsonb_build_object(
      'repassados', (select count(*) from public.crm_sales_leads
                      where origin_lead_id is not null and deleted_at is null
                        and created_at::date between p_desde and p_ate),
      -- Fila parada é problema do closer, não do SDR — por isso conta à parte,
      -- e sem recorte de período: o que está encalhado hoje é o que importa.
      'na_fila_agora', (select count(*) from public.crm_sales_leads
                         where origin_lead_id is not null and deleted_at is null
                           and assigned_to is null)
    )
  ) into v_out;

  return v_out;
end;
$$;

revoke all on function public.crm_acompanhamento_repasses(date, date) from public, anon;
grant execute on function public.crm_acompanhamento_repasses(date, date) to authenticated;

notify pgrst, 'reload schema';


-- ─── Conferência ─────────────────────────────────────────────────────
-- select jsonb_pretty(public.crm_acompanhamento_repasses());


-- ─── Rollback ────────────────────────────────────────────────────────
-- drop function if exists public.crm_acompanhamento_repasses(date, date);
