-- ═══════════════════════════════════════════════════════════════════════════
-- Mercado Livre: o número da loja é o PACK quando a compra é um carrinho
--
-- 12 pedidos recentes do ML ficaram órfãos na esteira: existiam dos dois lados
-- e nunca se encontravam. O diagnóstico saiu da comparação lado a lado —
--
--   Bling diz:            2000014337068433
--   Pedidos do ML no dia: 2000017711191084, 2000017714971566, ...
--
-- Mesmo formato, faixas diferentes: não são o mesmo identificador. Quando o
-- cliente leva mais de um anúncio de uma vez, o ML agrupa num PACK e é o
-- `pack_id` que o Bling registra como número da loja. Compra de anúncio único
-- não tem pack, e aí os dois números coincidem — por isso parte casava.
--
-- ⚠️ Um pack pode conter vários pedidos do ML, e todos passam a compartilhar o
-- mesmo `platform_order_number`. Isso é correto e proposital: do lado do Bling
-- existe UM pedido só, e a esteira agrega pelo estágio mais avançado — o que
-- descreve o que o cliente vê (um pacote, um rastreio).
--
-- O `raw` guarda o pedido inteiro do ML, então o histórico se recupera aqui
-- sem depender de re-sincronizar.
-- ═══════════════════════════════════════════════════════════════════════════

update public.ecommerce_orders
set platform_order_number = raw ->> 'pack_id'
where platform = 'mercadolivre'
  and raw ? 'pack_id'
  and nullif(raw ->> 'pack_id', '') is not null
  and platform_order_number is distinct from (raw ->> 'pack_id');


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência
-- ═══════════════════════════════════════════════════════════════════════════

-- Quantos pedidos do ML são de carrinho (têm pack).
select count(*)                                                as linhas,
       count(*) filter (where nullif(raw ->> 'pack_id','') is not null) as com_pack
from public.ecommerce_orders where platform = 'mercadolivre';

-- Os órfãos do ML devem cair para perto de zero.
select canal, count(*) as pedidos,
       count(*) filter (where tem_status_da_plataforma) as com_status_plataforma
from public.bling2_esteira
where etapa = 'etiqueta'
group by 1 order by 2 desc;

-- E a esteira redistribui.
select etapa, count(*) as pedidos from public.bling2_esteira group by 1 order by 2 desc;
