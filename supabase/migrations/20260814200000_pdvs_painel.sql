-- ═══════════════════════════════════════════════════════════════════════════
-- carbo_pdvs_painel — o PDV com o histórico de compras dele junto
--
-- A tela de PDVs precisa, na mesma linha: cadastro (nome, razão social, CNPJ,
-- cidade, UF, status) e movimento (quantos pedidos, quanto comprou, quando foi
-- a última). Fazer isso no front seria uma consulta por PDV ou trazer a base
-- de pedidos inteira para o navegador.
--
-- O casamento é por CNPJ só-dígitos dos DOIS lados: o pedido guarda o que foi
-- digitado e a bridge do Bling grava outro formato.
--
-- security_invoker: a RLS de pdvs e de carboze_orders continua valendo.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.carbo_pdvs_painel
with (security_invoker = true) as
select
  p.id,
  p.pdv_code,
  p.name,
  p.legal_name,
  p.cnpj,
  regexp_replace(coalesce(p.cnpj, ''), '\D', '', 'g') as cnpj_digits,
  p.address_city,
  p.address_state,
  p.address_street,
  p.address_zip,
  p.contact_name,
  p.contact_phone,
  p.email,
  p.status,
  p.notes,
  p.created_at,
  p.updated_at,
  coalesce(m.pedidos, 0)        as pedidos,
  coalesce(m.total_comprado, 0) as total_comprado,
  m.ultima_compra,
  m.primeira_compra,
  -- Sem documento não há como casar com pedido. A tela mostra isso em vez de
  -- exibir "0 pedidos", que pareceria PDV que nunca comprou.
  (p.cnpj is null or btrim(p.cnpj) = '') as sem_documento
from public.pdvs p
left join lateral (
  select
    count(*)                                                  as pedidos,
    sum(o.total)                                              as total_comprado,
    max(coalesce(o.sale_date, o.created_at::date))            as ultima_compra,
    min(coalesce(o.sale_date, o.created_at::date))            as primeira_compra
  from public.carboze_orders o
  where coalesce(p.cnpj, '') <> ''
    and regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g')
      = regexp_replace(p.cnpj, '\D', '', 'g')
    -- Orçamento e cancelado não são compra.
    and o.status not in ('quote', 'cancelled')
) m on true;

comment on view public.carbo_pdvs_painel is
  'PDVs com o agregado de compras (pedidos, total, primeira/última). Casa por CNPJ só-dígitos. security_invoker: respeita a RLS.';

grant select on public.carbo_pdvs_painel to authenticated;

-- Conferência: deve dar 69, com 65 tendo pedido.
select count(*) as pdvs,
       count(*) filter (where pedidos > 0)   as ja_compraram,
       count(*) filter (where sem_documento) as sem_documento,
       count(*) filter (where status = 'active')    as ativos,
       count(*) filter (where status = 'suspended') as pausados,
       count(*) filter (where status = 'inactive')  as inativos
from public.carbo_pdvs_painel;

-- ── Pedidos de um PDV ─────────────────────────────────────────────────────
-- Função em vez de filtro no front: o CNPJ do pedido pode ter pontuação
-- (depende de quem digitou) e o do PDV é só-dígitos. Um `.eq("cnpj", ...)`
-- do lado do front simplesmente não acharia nada, em silêncio.
create or replace function public.carbo_pdv_pedidos(p_cnpj text)
returns setof public.carbo_vendas_metrica
language sql
stable
security invoker
set search_path = public
as $$
  select v.*
  from public.carbo_vendas_metrica v
  where regexp_replace(coalesce(v.cnpj, ''), '\D', '', 'g')
      = regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g')
    and length(regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g')) >= 11
  order by coalesce(v.sale_date, v.created_at::date) desc, v.created_at desc
  limit 200;
$$;

comment on function public.carbo_pdv_pedidos is
  'Pedidos de um PDV, casando por CNPJ só-dígitos dos dois lados. SECURITY INVOKER: respeita a RLS.';

grant execute on function public.carbo_pdv_pedidos(text) to authenticated;
