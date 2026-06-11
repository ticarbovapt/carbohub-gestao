-- ─────────────────────────────────────────────────────────────────────────────
-- Gravação da edição de venda (tela "Editar Pedido" do Carbo Sales).
-- A tela tem mais campos do que o cabeçalho enxuto de crm_vendas. Para não
-- PERDER nada que o usuário digita (e o campo "sumir" ao reabrir = parece bug),
-- guardamos:
--   • os campos centrais nas colunas que já existem (customer_*, status,
--     endereco, endereco_faturamento, payment_terms, freight_type, notes,
--     vendedor_id, customer_ie, is_licenciado);
--   • a "data real da venda" numa coluna própria (sale_date), que passa a valer
--     para as metas;
--   • o resto (rastreio, PO, NF/Bling, recorrência, notas internas, contato de
--     faturamento, status detalhado, licenciado escolhido) num jsonb `extra`.
-- Continua ilha isolada: nada dispara estoque/produção/Bling.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.crm_vendas
  add column if not exists sale_date date,
  add column if not exists extra     jsonb not null default '{}'::jsonb;

-- Metas: o "realizado" passa a considerar a data real da venda quando informada,
-- caindo para a data de registro quando não houver. (Antes usava só created_at.)
create or replace function public.crm_vendas_agregado(p_from timestamptz, p_to timestamptz)
returns table (vendedor_id uuid, total numeric, qtd bigint)
language sql stable security definer set search_path = public as $$
  select v.vendedor_id,
         coalesce(sum(v.total), 0)::numeric as total,
         count(*)::bigint as qtd
  from public.crm_vendas v
  where v.status = 'pedido'
    and coalesce(v.sale_date::timestamptz, v.created_at) >= p_from
    and coalesce(v.sale_date::timestamptz, v.created_at) <  p_to
  group by v.vendedor_id;
$$;

revoke all on function public.crm_vendas_agregado(timestamptz, timestamptz) from public, anon;
grant execute on function public.crm_vendas_agregado(timestamptz, timestamptz) to authenticated;
