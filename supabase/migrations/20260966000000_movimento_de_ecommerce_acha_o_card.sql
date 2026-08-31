-- ═══════════════════════════════════════════════════════════════════════════
-- A baixa de e-commerce acha o card da esteira
--
-- ── O que falta hoje ─────────────────────────────────────────────────────
--
-- A dedução grava `ref_externa = 'nuvemshop:2056126831-3483531197'` em
-- `stock_movements`, e a coluna Card de Movimentações mostra esse texto cru.
-- Ele é longo, é o id INTERNO da plataforma, e não leva a lugar nenhum.
--
-- Quem abre aquela tela quer responder uma pergunta: **esta baixa corresponde a
-- qual venda?** Para responder hoje é preciso copiar o id, abrir a esteira e
-- procurar. Na prática ninguém confere — e uma dedução que não dá para conferir
-- é uma dedução em que não se confia.
--
-- ── A cadeia, e por que ela mora aqui e não no front ─────────────────────
--
--   ref_externa            'nuvemshop:2056126831-3483531197'
--     → platform + order_id
--     → ecommerce_orders.platform_order_number       o número na LOJA (601)
--     → bling2_orders.numero_loja                    o mesmo número, no Bling
--     → bling2_orders.bling_id                       o que a esteira usa
--
-- São três junções. Escrevê-las no front seria a quarta cópia de uma regra que
-- já existe na `bling2_esteira` e na `ecommerce_aguardando_bling` — e cópia de
-- regra é o que este repositório já pagou caro várias vezes.
--
-- ⚠️ O `bling_id` pode ser NULO, e isso NÃO é erro: o pedido só entra no Bling
-- quando é faturado. Entre a venda e a nota existe uma janela real em que a
-- baixa já aconteceu e o card ainda não nasceu. Nulo significa "ainda não",
-- não "não achei" — e a tela precisa dizer os dois de formas diferentes.
--
-- ⚠️ RODE EM BLOCOS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 1 — a ponte, numa view                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

create or replace view public.carbo_movimento_ecommerce_card
with (security_invoker = true) as
select
  eo.platform || ':' || eo.order_id            as ref_externa,
  eo.platform,
  -- O número que o cliente e o operador enxergam (601, 2000018158447594…).
  eo.platform_order_number,
  eo.product_name,
  eo.status,
  -- ⚠️ Nulo enquanto o pedido não for faturado no Bling. É estado esperado.
  bo.bling_id
from public.ecommerce_orders eo
left join public.bling2_orders bo
       on bo.numero_loja = eo.platform_order_number;

comment on view public.carbo_movimento_ecommerce_card is
  'Liga a `ref_externa` de stock_movements ao card da esteira. ⚠️ `bling_id` NULO é estado esperado, não falha: o pedido só entra no Bling quando é faturado, e entre a venda e a nota a baixa já existe e o card ainda não. ⚠️ security_invoker = true — repita a cláusula em toda republicação.';

grant select on public.carbo_movimento_ecommerce_card to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ BLOCO 2 — conferência                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- (a) A view responde, e mostra os dois estados (com card e sem).
select platform,
       count(*)                                as linhas,
       count(bling_id)                         as com_card,
       count(*) - count(bling_id)              as sem_card_ainda
from public.carbo_movimento_ecommerce_card
group by 1 order by 2 desc;

-- (b) ⭐ O teste que importa: as baixas já gravadas acham o card?
--     Enquanto a dedução estiver parada isto vem VAZIO — e vir vazio aqui é o
--     mesmo sintoma que a 20260965 conserta.
select m.created_at, m.ref_externa, c.platform_order_number, c.bling_id, c.status
from public.stock_movements m
left join public.carbo_movimento_ecommerce_card c on c.ref_externa = m.ref_externa
where m.origem = 'ecommerce'
order by m.created_at desc limit 20;
