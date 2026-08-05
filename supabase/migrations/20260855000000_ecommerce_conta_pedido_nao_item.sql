-- ═══════════════════════════════════════════════════════════════════════════
-- E-commerce: contar PEDIDO, não linha de item — e no dia de Brasília
--
-- ── O que apareceu ────────────────────────────────────────────────────────
--
-- A Nuvemshop mostrava 4 vendas no dia; o painel mostrava 8 e mais 2
-- canceladas. Dois erros somados, os dois nesta view e no Caminho 2:
--
-- 1) UMA LINHA POR ITEM. Os normalizadores gravam uma linha por item do
--    pedido, com `order_id = '<pedido>-<item>'` (_shared/nuvemshop.ts,
--    ecommerce-sync, ecommerce-webhook). É de propósito: (platform, order_id)
--    é a chave do upsert, então webhook e sync podem rodar em qualquer ordem
--    sem duplicar. Só que `count(*)` passou a significar "itens vendidos", e
--    um pedido com dois produtos virava duas vendas.
--
-- 2) DIA EM UTC. `ordered_at::date` usa o fuso do servidor (UTC). Pedido das
--    21h de Brasília é 00h UTC do dia seguinte: caía no dia errado, e "hoje"
--    trazia junto três horas de ontem. Foi o caso do pedido 00:11:18Z.
--
-- Conferido contra os dados reais de 05/08: 8 linhas, sendo dois pares do
-- mesmo pedido e um pedido que era de ontem no fuso de Brasília. Sobram 4
-- vendas pagas — exatamente o número da loja.
--
-- ── O que NÃO muda ────────────────────────────────────────────────────────
--
-- Receita, quantidade e unidades continuam somando linha a linha. Isso sempre
-- esteve certo: o pedido de dois itens vendeu os dois. O que estava errado era
-- só a CONTAGEM.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Raiz do pedido ─────────────────────────────────────────────────────────
--
-- ⚠️ Não dá para cortar no último hífen: o número da Amazon já tem hífens
-- (`123-4567890-1234567`) e pedido de item único é gravado SEM sufixo. Cortar
-- cegamente fundiria dois pedidos Amazon diferentes num só. Por isso a raiz é
-- reconhecida pelo formato de cada plataforma.
--
-- Espelha `pedidoRaiz()` em src/hooks/useDashEcommerce.ts. Mudou aqui? Mude lá.
create or replace function public.ecommerce_pedido_raiz(p_platform text, p_order_id text)
returns text language sql immutable set search_path = public as $$
  select case
    when coalesce(p_order_id, '') = '' then coalesce(p_order_id, '')
    -- Amazon: 3-7-7 dígitos. O que vier depois é o item.
    when p_platform = 'amazon'
      then coalesce(substring(p_order_id from '^[0-9]{3}-[0-9]{7}-[0-9]{7}'), p_order_id)
    -- ML, Nuvemshop, Shopee, TikTok: número puro, item depois do 1º hífen.
    -- split_part devolve a string inteira quando não há hífen.
    else split_part(p_order_id, '-', 1)
  end
$$;

comment on function public.ecommerce_pedido_raiz is
  'Número do PEDIDO a partir do order_id (que é <pedido>-<item>). Amazon tem hífen no próprio número do pedido, por isso o formato por plataforma.';

grant execute on function public.ecommerce_pedido_raiz(text, text) to authenticated;


-- ── A view do Caminho 1 ────────────────────────────────────────────────────
--
-- ⚠️ ORDEM DAS COLUNAS: CREATE OR REPLACE VIEW só aceita coluna NOVA no fim, e
-- não deixa renomear nem trocar tipo. Nomes e tipos abaixo são os mesmos; só o
-- valor que eles carregam é que passa a ser pedido em vez de linha.
CREATE OR REPLACE VIEW ecommerce_raw_summary AS
SELECT
  platform,
  (ordered_at AT TIME ZONE 'America/Sao_Paulo')::date        AS day,
  COUNT(DISTINCT public.ecommerce_pedido_raiz(platform, order_id))  AS total_orders,
  COALESCE(SUM(quantity),    0)::int                         AS total_quantity,
  COALESCE(SUM(units_real),  0)::int                         AS total_units_real,
  COALESCE(SUM(total),       0)::numeric                     AS total_revenue,
  COUNT(DISTINCT public.ecommerce_pedido_raiz(platform, order_id))
    FILTER (WHERE status = 'cancelled')::int                 AS cancelled_orders,
  COUNT(DISTINCT public.ecommerce_pedido_raiz(platform, order_id))
    FILTER (WHERE status = 'pending')::int                   AS pending_orders,
  COUNT(DISTINCT public.ecommerce_pedido_raiz(platform, order_id))
    FILTER (WHERE status = 'shipped')::int                   AS shipped_orders,
  COUNT(DISTINCT public.ecommerce_pedido_raiz(platform, order_id))
    FILTER (WHERE status = 'delivered')::int                 AS delivered_orders,
  -- Receita: soma linha a linha, como sempre foi.
  COALESCE(SUM(total) FILTER (WHERE public.ecommerce_status_e_venda(status)), 0)::numeric
                                                             AS sale_revenue,
  COALESCE(SUM(total) FILTER (WHERE status = 'cancelled'), 0)::numeric
                                                             AS cancelled_revenue,
  COALESCE(SUM(total) FILTER (
    WHERE NOT public.ecommerce_status_e_venda(status) AND status IS DISTINCT FROM 'cancelled'
  ), 0)::numeric                                             AS pending_revenue,
  COUNT(DISTINCT public.ecommerce_pedido_raiz(platform, order_id))
    FILTER (WHERE public.ecommerce_status_e_venda(status))::int  AS sale_orders
FROM ecommerce_orders
GROUP BY platform, (ordered_at AT TIME ZONE 'America/Sao_Paulo')::date;

GRANT SELECT ON ecommerce_raw_summary TO authenticated;

COMMENT ON VIEW ecommerce_raw_summary IS
  'Caminho 1 do dashboard de e-commerce. Contagens = PEDIDOS distintos (a tabela tem uma linha por item); '
  'receita soma linha a linha. `day` é o dia em America/Sao_Paulo, não UTC.';


-- ═══════════════════════════════════════════════════════════════════════════
-- Conferência — o antes e o depois do dia de hoje
-- ═══════════════════════════════════════════════════════════════════════════
select platform,
       count(*)                                                        as linhas_antes,
       count(distinct public.ecommerce_pedido_raiz(platform, order_id)) as pedidos_agora,
       count(distinct public.ecommerce_pedido_raiz(platform, order_id))
         filter (where public.ecommerce_status_e_venda(status))         as vendas_pagas,
       count(distinct public.ecommerce_pedido_raiz(platform, order_id))
         filter (where status = 'cancelled')                            as canceladas
from public.ecommerce_orders
where (ordered_at at time zone 'America/Sao_Paulo')::date
      = (now() at time zone 'America/Sao_Paulo')::date
group by platform
order by platform;
