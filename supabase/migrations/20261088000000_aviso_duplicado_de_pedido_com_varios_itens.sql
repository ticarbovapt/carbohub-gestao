-- =====================================================================
-- Pedido de VÁRIOS itens com DOIS avisos no sininho (15/10/2026).
--
-- Até a 20261085 o gatilho avisava por LINHA de `ecommerce_orders`, e a tabela
-- tem uma linha por ITEM: pedido de 2 itens gerava 2 avisos. A 20261087
-- reescreveu os dois com o total do pedido — e agora são duas "vendas" de
-- R$ 209,40 no sininho, exatamente o que o dono do processo pediu para não
-- acontecer ("não pode parecer 2 vendas diferentes").
--
-- A limpeza da 20261085 só olhou 24 h. Esta olha 7 dias e fica com o PRIMEIRO
-- aviso de cada pedido; os outros saem. Só toca `notifications` (nenhum som,
-- nenhum push — apagar não dispara nada).
--
-- ⚠️ A chave é a da 20261086: TRANSAÇÃO na PayT (venda e upsell são avisos
-- diferentes, de propósito), raiz do pedido nos demais.
-- =====================================================================

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 0 — pedidos com mais de um aviso nos últimos 7 dias          ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: os pedidos de 2 itens (Amazon 702-0627881-4740205, Shopee
-- 261014HQN9CYEM, Nuvemshop 2090924742 / 2085596194…) com avisos = 2.
-- Vazio = não há duplicata; o BLOCO 1 não fará nada.
select e.platform,
       case when e.platform = 'payt' then 'payt:transacao:' || split_part(e.order_id, '-', 1)
            else public.carbo_venda_chave(e.platform, e.order_id, e.platform_order_number) end as pedido,
       count(distinct n.reference_id) as avisos,
       min(n.created_at)              as primeiro
  from public.notifications n
  join public.ecommerce_orders e on e.id::text = n.reference_id
 where n.type = 'ecommerce_sale' and n.reference_type = 'ecommerce_order'
   and n.created_at > now() - interval '7 days'
 group by 1, 2
having count(distinct n.reference_id) > 1
 order by 4;

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — fica o PRIMEIRO aviso de cada pedido                     ║
-- ╚═══════════════════════════════════════════════════════════════════╝
with avisos as (
  select n.reference_id, min(n.created_at) as criado,
         case when e.platform = 'payt' then 'payt:transacao:' || split_part(e.order_id, '-', 1)
              else public.carbo_venda_chave(e.platform, e.order_id, e.platform_order_number) end as pedido
    from public.notifications n
    join public.ecommerce_orders e on e.id::text = n.reference_id
   where n.type = 'ecommerce_sale' and n.reference_type = 'ecommerce_order'
     and n.created_at > now() - interval '7 days'
   group by n.reference_id, 3
), ordem as (
  select reference_id,
         row_number() over (partition by pedido order by criado, reference_id) as pos
    from avisos
)
delete from public.notifications n
 using ordem o
 where n.reference_id = o.reference_id
   and o.pos > 1
   and n.type = 'ecommerce_sale' and n.reference_type = 'ecommerce_order';

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ CONFERÊNCIA — o mesmo do BLOCO 0                                   ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- ESPERADO: zero linhas.
select e.platform,
       case when e.platform = 'payt' then 'payt:transacao:' || split_part(e.order_id, '-', 1)
            else public.carbo_venda_chave(e.platform, e.order_id, e.platform_order_number) end as pedido,
       count(distinct n.reference_id) as avisos
  from public.notifications n
  join public.ecommerce_orders e on e.id::text = n.reference_id
 where n.type = 'ecommerce_sale' and n.reference_type = 'ecommerce_order'
   and n.created_at > now() - interval '7 days'
 group by 1, 2
having count(distinct n.reference_id) > 1;
