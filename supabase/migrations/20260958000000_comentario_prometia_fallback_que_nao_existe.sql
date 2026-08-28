-- ═══════════════════════════════════════════════════════════════════════════
-- O comentário prometia uma rede que a função não tem
--
-- `carbo_ecommerce_sku_resolve` (20260955) nasceu com este comentário no corpo:
--
--     -- Específico da plataforma vence o genérico; o fallback por product_code
--     -- cobre o SKU que é igual ao código do MRP e nunca foi cadastrado.
--
-- A primeira metade é verdade. **A segunda não existe no código.** O corpo é um
-- único SELECT sobre `sku_product_mappings`; não há nenhum caminho que tente
-- casar o SKU com `mrp_products.product_code`.
--
-- Quem tem esse fallback é o trigger ANTIGO, `handle_ecommerce_order_sp_stock`
-- (`20260527000002_trigger_fallback_product_code.sql`) — que está desligado
-- desde 03/08/2026. Escrevi o comentário descrevendo o caminho velho enquanto
-- implementava o novo.
--
-- ⚠️ Por que isso é perigoso e não só feio: alguém que leia "tem fallback por
-- product_code" pode desativar um mapa achando que há rede embaixo. Não há. O
-- SKU simplesmente para de resolver, e o sintoma é `⚠️ SKU SEM MAPEAMENTO` no
-- ensaio — sem erro, sem log, e a saída de estoque some da conta.
--
-- Corrijo o COMENTÁRIO, não a função. Implementar o fallback seria adivinhar:
-- casar `platform_sku` com `product_code` funciona por acaso quando o vendedor
-- digitou o mesmo texto nos dois lugares, e erra silenciosamente quando um SKU
-- de marketplace coincide com o código de OUTRO produto nosso. O cadastro
-- explícito é o desenho; a rede implícita é a doença que o cadastro cura.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.carbo_ecommerce_sku_resolve(
  p_platform text, p_sku text
) returns table (product_id uuid, unidades_por_venda numeric, via text)
language sql stable security definer set search_path = public as $$
  -- Específico da plataforma vence o genérico (`platform is null`).
  --
  -- ⚠️ NÃO HÁ FALLBACK. SKU sem linha em `sku_product_mappings` não resolve, e
  -- é assim de propósito: casar `platform_sku` com `mrp_products.product_code`
  -- acertaria por acaso e erraria calado quando um SKU de marketplace
  -- coincidisse com o código de outro produto nosso. O cadastro é o desenho.
  select m.product_id, m.unidades_por_venda,
         case when m.platform is null then 'mapa generico' else 'mapa da plataforma' end
  from public.sku_product_mappings m
  where m.platform_sku = p_sku
    and m.is_active
    and (m.platform = p_platform or m.platform is null)
  order by (m.platform = p_platform) desc nulls last
  limit 1
$$;

comment on function public.carbo_ecommerce_sku_resolve is
  'De qual produto e quantas unidades sai uma venda daquele SKU. ⚠️ Fonte ÚNICA: tela, faturamento e estoque leem daqui. Específico da plataforma vence o genérico. ⚠️ SEM FALLBACK por product_code — SKU não cadastrado não resolve, e o sintoma é a linha aparecer como "SEM MAPEAMENTO" no ensaio, nunca um erro.';

grant execute on function public.carbo_ecommerce_sku_resolve(text, text) to authenticated;


-- ── Conferência: nenhum SKU vendido depende de uma rede que não existe ────
select platform, product_sku, count(*) as linhas, sum(qtd_vendida) as packs
from public.carbo_estoque_ensaio
where veredito like '%SEM MAPEAMENTO%'
group by 1,2 order by 4 desc nulls last;
